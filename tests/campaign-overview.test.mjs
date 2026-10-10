import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacter } from '../public/js/core/character-codec.js';
import { projectCharacterVitals } from '../public/js/core/character-vitals.js';
import { projectCharacterKeystones } from '../public/js/core/keystone-projection.js';
import { getKeystoneChoices, buildKeystoneAnswer } from '../public/js/core/keystone-rules.js';
import { canUseCampaignOverview, campaignOverviewUrl } from '../public/js/core/campaign-model.js';
import { createCampaignOverviewLive } from '../public/js/core/campaign-overview-live.js';
import { observeCharacter, observeCharacterRolls } from '../public/js/core/database-reader.js';

const data = { classes: [{ classKey: 'hero', name: 'Hero', hpProgression: 'high' }],
  classFeatures: { hero: [{ classKey: 'hero', type: 'feature', featureKey: 'training', name: 'Training', level: 1,
    grants: [{ type: 'skill', name: 'Physical Defense', rank: 2 }, { type: 'skill', name: 'Mental Defense', rank: 2 }, { type: 'skill', name: 'Spiritual Defense', rank: 1 }] }] }, origins: [], feats: [] };
test('vitals use catalogue HP and effective defense training, ignoring stored derived values', () => {
  const builder = createDefaultCharacter({ ownerUid: 'player' }).builder;
  Object.assign(builder, { classKey: 'hero', level: 5, primaryAttribute: 'agility',
    attributes: { strength: 2, agility: 3, intellect: 1, willpower: 2, attunement: 2, heart: 1 } });
  builder.sheet.fields = { rank_mentdef: '2', rank_spiritdef: '1', hpmax: '999', physdef: '999' };
  const original = structuredClone(builder);
  const result = projectCharacterVitals({ builder, gameData: data });
  assert.equal(result.maxHP, 122); assert.equal(result.physicalDefense, 5);
  assert.equal(result.mentalDefense, 4); assert.equal(result.spiritualDefense, 3);
  assert.equal(result.className, 'Hero'); assert.deepEqual(builder, original);
  assert.equal(projectCharacterVitals({ builder: { ...builder, classKey: '' }, gameData: data }).maxHP, 86);
});
test('overview Keystone projection includes Origin, Background, Bond and active source answers', () => {
  const builder = createDefaultCharacter({ ownerUid: 'player' }).builder;
  Object.assign(builder, { classKey: 'hero', originKeystone: 'My origin', backgroundKeystones: ['My past'],
    bonds: [{ bondId: 'ally', name: 'Ally', rank: '1', keystone: 'My friend' }] });
  const grant = { type: 'choice', filterType: 'keystone', count: 1 };
  const choice = getKeystoneChoices(grant, { sourceId: 'class-feature:hero:oath', sourceLabel: 'Oath' })[0];
  builder.grantChoices[choice.choiceId] = buildKeystoneAnswer(choice, 'My oath');
  const catalogue = { ...data, classFeatures: { hero: [{ classKey: 'hero', type: 'feature', featureKey: 'oath', name: 'Oath', level: 1, grants: [grant] }] } };
  assert.deepEqual(projectCharacterKeystones({ builder, gameData: catalogue }).map(item => item.text), ['My origin', 'My past', 'My friend', 'My oath']);
  assert.equal(projectCharacterKeystones({ builder: { ...builder, classKey: '' }, gameData: catalogue }).length, 3);
});
test('overview role and routes do not give campaign creators or ordinary players GM access', () => {
  const group = { ownerUid: 'creator', gmUid: 'gm', memberUids: ['creator', 'gm', 'player'] };
  assert.equal(canUseCampaignOverview(group, 'creator'), false);
  assert.equal(canUseCampaignOverview(group, 'player'), false);
  assert.equal(canUseCampaignOverview(group, 'gm'), true);
  assert.equal(canUseCampaignOverview(group, 'player', true), true);
  assert.equal(canUseCampaignOverview(group, 'outsider', true), false);
  assert.equal(canUseCampaignOverview({ ...group, deletedAt: 1 }, 'gm'), false);
  assert.equal(new URL(campaignOverviewUrl('id&admin=1'), 'https://test.invalid').searchParams.get('admin'), null);
});
function liveFixture() {
  let campaignNext, rosterNext, campaignError;
  const children = [], removed = [], results = [], stops = [];
  const observe = kind => options => { const child = { kind, ...options }; children.push(child); return Promise.resolve(() => stops.push(child)); };
  const live = createCampaignOverviewLive({ campaignId: 'group', uid: 'gm',
    observeCampaign: (id, next, error) => { campaignNext = next; campaignError = error; return () => stops.push('campaign'); },
    observeRoster: (id, next) => { rosterNext = next; return () => stops.push('roster'); },
    observeCharacter: observe('character'), observeRolls: observe('rolls'),
    onCampaign: item => results.push(item), onCharacter: (key, item) => results.push(item), onRolls: (key, item) => results.push(item),
    onRemove: key => removed.push(key), onError: error => results.push(error.code) });
  return { live, children, removed, results, stops,
    campaign: item => campaignNext(item), roster: rows => rosterNext(rows), error: item => campaignError(item) };
}
const group = { gmUid: 'gm', ownerUid: 'gm', memberUids: ['gm', 'one', 'two'] };
test('live overview reuses subscriptions and removes exact detached/member-revoked cards', async () => {
  const f = liveFixture(); f.campaign(group);
  const rows = [{ ownerUid: 'one', characterId: 'hero' }, { ownerUid: 'two', characterId: 'hero' }];
  f.roster(rows); await Promise.resolve();
  assert.equal(f.children.length, 4);
  f.roster(rows); assert.equal(f.children.length, 4);
  f.campaign({ ...group, memberUids: ['gm', 'two'] });
  assert.deepEqual(f.removed, ['["one","hero"]']); assert.equal(f.stops.length, 2);
  f.children[0].onChange('late'); assert.ok(!f.results.includes('late'));
  f.roster([]); assert.equal(f.stops.length, 4);
  f.live.dispose(); assert.ok(f.stops.includes('campaign'));
});
test('rejoining restores dormant roster characters without a new roster snapshot', async () => {
  const f = liveFixture(); f.campaign(group);
  f.roster([{ ownerUid: 'one', characterId: 'hero' }, { ownerUid: 'two', characterId: 'hero' }]);
  await Promise.resolve();
  f.campaign({ ...group, memberUids: ['gm', 'two'] });
  assert.equal(f.children.length, 4); assert.equal(f.stops.length, 2);
  f.campaign(group); await Promise.resolve();
  assert.equal(f.children.length, 6, 'only the returning owner needs new listeners');
  f.children[0].onChange('stale'); assert.ok(!f.results.includes('stale'));
  f.children[4].onChange('returning'); assert.ok(f.results.includes('returning'));
  f.campaign(group); assert.equal(f.children.length, 6);
  f.live.dispose();
});
test('demotion, root denial and late async subscriptions cannot restore revoked data', async () => {
  for (const mode of ['demotion', 'denial', 'dispose']) {
    const f = liveFixture(); f.campaign(group); f.roster([{ ownerUid: 'one', characterId: 'hero' }]);
    if (mode === 'demotion') f.campaign({ ...group, gmUid: 'one' });
    if (mode === 'denial') f.error({ code: 'permission-denied' });
    if (mode === 'dispose') f.live.dispose();
    await Promise.resolve();
    f.children.forEach(child => child.onChange('late'));
    assert.ok(!f.results.includes('late')); assert.equal(f.removed.length, 1);
    assert.equal(f.stops.filter(item => typeof item === 'object').length, 2);
  }
});
test('denied roll listener clears its cached character; invalid character snapshots can recover', async () => {
  const f = liveFixture(); f.campaign(group); f.roster([{ ownerUid: 'one', characterId: 'hero' }]); await Promise.resolve();
  f.children[1].onChange({ rolls: [], invalid: [] });
  f.children[0].onError({ code: 'character-read-invalid' });
  f.children[0].onChange('recovered'); assert.ok(f.results.includes('recovered'));
  assert.deepEqual(f.results.at(-1), { rolls: [], invalid: [] }, 'recovering a card restores its already-observed roll history');
  f.children[1].onError({ code: 'permission-denied' });
  f.children[0].onChange('denied'); assert.ok(!f.results.includes('denied'));
  assert.equal(f.stops.filter(item => typeof item === 'object').length, 2);
});
test('exact character observer decodes canonical state, skips pending writes and reports invalid data', async () => {
  let next; const values = [], errors = [];
  const api = { doc: (...path) => path, onSnapshot: (ref, options, callback) => { next = callback; return () => {}; } };
  await observeCharacter({ ownerUid: 'player', characterId: 'hero', gameData: data, firestore: {}, firestoreApi: api,
    onChange: item => values.push(item), onError: error => errors.push(error) });
  const raw = { ...createDefaultCharacter({ ownerUid: 'player' }), revision: 2 };
  const snapshot = pending => ({ id: 'hero', exists: () => true, data: () => raw, metadata: { hasPendingWrites: pending } });
  next(snapshot(true)); assert.equal(values.length, 0);
  next(snapshot(false)); assert.equal(values[0].revision, 2);
  raw.ownerUid = 'forged'; next(snapshot(false)); assert.equal(errors.length, 1);
  raw.ownerUid = 'player'; next(snapshot(false)); assert.equal(values.length, 2);
});
test('recent roll observer queries only the exact character and isolates invalid records', async () => {
  let next, query; const values = [];
  const api = { collection: (...parts) => parts, query: (...parts) => { query = parts; return parts; },
    orderBy: (...parts) => parts, limit: value => value, onSnapshot: (ref, options, callback) => { next = callback; return () => {}; } };
  await observeCharacterRolls({ ownerUid: 'player', characterId: 'hero', firestore: {}, firestoreApi: api, onChange: item => values.push(item) });
  assert.deepEqual(query[0].slice(1), ['users', 'player', 'characters', 'hero', 'rolls']); assert.equal(query[2], 10);
  next({ metadata: { hasPendingWrites: true }, docs: [] }); assert.equal(values.length, 0);
  next({ metadata: { hasPendingWrites: false }, docs: [{ id: 'bad', data: () => ({}) }] });
  assert.equal(values[0].rolls.length, 0); assert.equal(values[0].invalid.length, 1);
});
