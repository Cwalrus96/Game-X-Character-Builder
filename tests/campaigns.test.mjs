import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignName, normalizeInviteCode, createInviteCode, formatInviteCode,
  campaignInviteUrl, campaignSheetUrl, campaignRole, publicMemberName } from '../public/js/core/campaign-model.js';
import { createCampaignStore } from '../public/js/core/campaign-store.js';
import { safeLoginNextHref } from '../public/js/core/login-routing.js';

test('invite codes use 128 random bits and accept formatted manual entry', () => {
  let requested;
  const code = createInviteCode({ getRandomValues(bytes) { requested = bytes.length; bytes.fill(171); return bytes; } });
  assert.equal(requested, 16);
  assert.equal(code, 'AB'.repeat(16));
  assert.equal(normalizeInviteCode(formatInviteCode(code).toLowerCase()), code);
  for (const bad of ['', 'ABC123', 'A'.repeat(33), 'G'.repeat(32), '../campaign']) assert.throws(() => normalizeInviteCode(bad));
});
test('campaign inputs are bounded without silently changing identity or truncating names', () => {
  assert.equal(campaignName('  Night Watch  '), 'Night Watch');
  assert.equal(publicMemberName(' Alex '), 'Alex');
  assert.throws(() => campaignName(' '));
  assert.throws(() => campaignName('a'.repeat(81)));
  assert.throws(() => publicMemberName(''));
  assert.throws(() => publicMemberName('a'.repeat(33)));
});
test('invite secrets use URL fragments; sheet identifiers cannot inject parameters', () => {
  const invite = new URL(campaignInviteUrl('a'.repeat(32), 'https://example.test'));
  assert.equal(invite.pathname, '/campaigns.html'); assert.equal(invite.search, '');
  assert.equal(new URLSearchParams(invite.hash.slice(1)).get('join'), 'A'.repeat(32));
  const sheet = new URL(campaignSheetUrl({ ownerUid: 'u&admin=true', characterId: 'hero/#1', campaignId: 'c?x' }), invite);
  assert.equal(sheet.searchParams.get('uid'), 'u&admin=true');
  assert.equal(sheet.searchParams.get('charId'), 'hero/#1');
  assert.equal(sheet.searchParams.get('admin'), null);
});
test('campaign roles require current membership and do not imply a global role', () => {
  const campaign = { ownerUid: 'alice', gmUid: 'bob', memberUids: ['alice', 'bob', 'eve'] };
  assert.deepEqual(campaignRole(campaign, 'alice'), { member: true, creator: true, gm: false });
  assert.deepEqual(campaignRole(campaign, 'bob'), { member: true, creator: false, gm: true });
  assert.deepEqual(campaignRole(campaign, 'outsider'), { member: false, creator: false, gm: false });
  assert.equal(campaignRole({ ...campaign, memberUids: ['alice'] }, 'bob').gm, false);
});

test('campaign and link listeners wait for authorized writes before exposing dependent reads', () => {
  const listeners = [];
  const api = {
    collection: (...path) => path, query: (...args) => args, where: (...args) => args,
    onSnapshot: (query, options, next) => { assert.equal(options.includeMetadataChanges, true); listeners.push(next); return () => {}; },
  };
  const store = createCampaignStore({ db: {}, api });
  const changes = [];
  store.observeMine('alice', value => changes.push(value));
  store.observeLinks('alice', value => changes.push(value));
  const pending = { docs: [], metadata: { hasPendingWrites: true } };
  listeners.forEach(listener => listener(pending));
  assert.deepEqual(changes, []);
  listeners.forEach(listener => listener({ ...pending, metadata: { hasPendingWrites: false } }));
  assert.deepEqual(changes, [[], new Map()]);
});

test('campaign invitation survives sign-in without exposing its code as a query parameter', () => {
  const hash = '#join=' + 'A'.repeat(32);
  const result = new URL(safeLoginNextHref({ next: '/campaigns.html', origin: 'https://example.test', hash }));
  assert.equal(result.hash, hash); assert.equal(result.search, '');
  const character = safeLoginNextHref({ next: '/character-sheet.html?charId=hero', origin: 'https://example.test', hash });
  assert.equal(character, 'https://example.test/character-sheet.html?charId=hero');
  for (const next of ['https://evil.test', '//evil.test/campaigns.html', 'javascript:alert(1)', null]) {
    assert.equal(safeLoginNextHref({ next, origin: 'https://example.test', hash }), null);
  }
});
