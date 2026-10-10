import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as api from 'firebase/firestore';
import { getBytes, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { createCampaignStore } from '../public/js/core/campaign-store.js';
import { createCharacterMigrationReferences } from '../public/js/core/character-migrations.js';
import { createCharacter, patchCharacter } from '../public/js/core/database-writer.js';
import { readCharacter } from '../public/js/core/database-reader.js';
import { MIGRATION_GAME_DATA } from './fixtures/character-schemas.mjs';
import { createRulesTestEnvironment, seedFirestore, seedStoragePortrait } from './rules-test-helpers.mjs';

let env;
const context = (uid, claims = {}) => env.authenticatedContext(uid, claims);
const dbFor = uid => context(uid).firestore();
const store = uid => createCampaignStore({ db: dbFor(uid), api });
const campaign = (db, id) => api.doc(db, 'campaigns', id);
const char = (db, uid = 'bob', id = 'char-2') => api.doc(db, 'users', uid, 'characters', id);
const link = (db, uid = 'bob', id = 'char-2') => api.doc(db, 'users', uid, 'characterCampaigns', id);
const settingsFixture = () => ({ unavailableClassKeys: ['wizard'], unavailableOriginKeys: ['alien'], settingSkills: [{ name: 'Starship Piloting', description: 'Navigate the stars.' }] });
async function create(uid = 'alice', name = 'Night Watch') {
  const id = await store(uid).create({ uid, name, displayName: uid });
  const value = (await api.getDoc(campaign(dbFor(uid), id))).data();
  return { id, ...value };
}
async function join(group, uid = 'bob') {
  return store(uid).join({ uid, code: group.inviteCode, displayName: uid });
}
async function share(group, uid = 'bob', characterId = 'char-2') {
  await store(uid).setCharacterCampaign({ uid, characterId, campaignId: group.id });
}
test.before(async () => { env = await createRulesTestEnvironment(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); await env.clearStorage(); await seedFirestore(env); });

test('only the creator can delete a campaign; deletion cannot be forged or reversed', async () => {
  const group = await create(); await join(group); await join(group, 'eve');
  await store('alice').update({ id: group.id, name: group.name, gmUid: 'bob' });
  for (const uid of ['bob', 'eve', 'outsider']) await assertFails(store(uid).deleteCampaign(group.id));
  const superStore = createCampaignStore({ db: context('super', { gm: true }).firestore(), api });
  await assertFails(superStore.deleteCampaign(group.id));
  const alice = dbFor('alice');
  const tombstone = { ownerUid: 'alice', deletedAt: api.serverTimestamp() };
  // The current invitation must be removed atomically, and ownership is immutable.
  await assertFails(api.setDoc(campaign(alice, group.id), tombstone));
  const forged = api.writeBatch(alice);
  forged.set(campaign(alice, group.id), { ...tombstone, ownerUid: 'bob' });
  forged.delete(api.doc(alice, 'campaignInvites', group.inviteCode));
  await assertFails(forged.commit());
  await assertSucceeds(store('alice').deleteCampaign(group.id));
  await assertSucceeds(store('alice').deleteCampaign(group.id)); // Safe retry after an uncertain response.
  const deleted = (await api.getDoc(campaign(alice, group.id))).data();
  assert.deepEqual(Object.keys(deleted).sort(), ['deletedAt', 'ownerUid']);
  for (const uid of ['alice', 'bob', 'eve']) {
    const db = dbFor(uid);
    assert.equal((await api.getDocs(api.query(api.collection(db, 'campaigns'), api.where('memberUids', 'array-contains', uid)))).size, 0);
    for (const kind of ['members', 'characters']) {
      const request = api.getDocs(api.collection(db, 'campaigns', group.id, kind));
      if (uid === 'alice') assert.equal((await assertSucceeds(request)).size, 0);
      else await assertFails(request);
    }
  }
  await assertFails(api.getDoc(api.doc(dbFor('bob'), 'campaignInvites', group.inviteCode)));
  await assertFails(join(group));
  await assert.rejects(store('alice').setInvite(group.id, true), /no longer exists/);
  await assertFails(api.deleteDoc(campaign(alice, group.id)));
  const { id, ...original } = group;
  for (const uid of ['alice', 'bob']) await assertFails(api.setDoc(campaign(dbFor(uid), id), { ...original, updatedAt: api.serverTimestamp() }));
});

test('deletion revokes GM sheets and portraits, preserves character data and permits switching', async () => {
  const group = await create(); await join(group); await share(group);
  const bob = dbFor('bob'); const alice = dbFor('alice');
  await api.updateDoc(char(bob), { 'builder.sheet.repeatables.settingSkills': [{ skill: 'Piloting', rank: '2' }] });
  await store('alice').updateSettings(group.id, settingsFixture());
  const before = (await api.getDoc(char(bob))).data();
  await seedStoragePortrait(env, { userId: 'bob', charId: 'char-2' });
  const portrait = ref(context('alice').storage(), 'portraits/bob/char-2/portrait.png');
  await assertSucceeds(getBytes(portrait));
  await store('alice').deleteCampaign(group.id);
  await assertFails(api.getDoc(char(alice)));
  await assertFails(getBytes(portrait));
  await assertSucceeds(getBytes(ref(context('bob').storage(), 'portraits/bob/char-2/portrait.png')));
  assert.deepEqual((await api.getDoc(char(bob))).data(), before);
  assert.equal((await api.getDoc(link(bob))).exists(), false);
  assert.equal(await store('bob').characterContext({ uid: 'bob', characterId: 'char-2', fresh: true }), null);
  await assertSucceeds(api.updateDoc(char(bob), { 'builder.classKey': 'wizard', 'builder.originKey': 'alien' }));
  const other = await create('eve'); await join(other); await assertSucceeds(share(other));
  assert.equal((await api.getDoc(link(bob))).data().campaignId, other.id);
  await assertSucceeds(api.getDoc(char(dbFor('eve'))));
  await assertFails(api.getDoc(char(alice)));
});

test('deletion cleans links with disabled invites and later detachment is harmless', async () => {
  const group = await create(); await join(group); await share(group);
  await store('alice').setInvite(group.id, false);
  await assertSucceeds(store('alice').deleteCampaign(group.id));
  assert.equal((await api.getDoc(link(dbFor('bob')))).exists(), false);
  await assertSucceeds(store('bob').setCharacterCampaign({ uid: 'bob', characterId: 'char-2', campaignId: '' }));
  assert.equal((await api.getDoc(link(dbFor('bob')))).exists(), false);
  await assertSucceeds(api.getDoc(char(dbFor('bob'))));
});

test('creator and assigned GM manage validated settings; players and outsiders cannot', async () => {
  const group = await create(); await join(group); await join(group, 'eve');
  const settings = settingsFixture();
  await assertSucceeds(store('alice').updateSettings(group.id, settings));
  await assert.rejects(store('alice').updateSettings(group.id, {}, { expectedSettings: {} }), /changed in another tab/);
  await assertFails(store('bob').updateSettings(group.id, { ...settings, unavailableClassKeys: [] }));
  await store('alice').update({ id: group.id, name: group.name, gmUid: 'bob' });
  await assertSucceeds(store('bob').updateSettings(group.id, { ...settings, unavailableClassKeys: [] }));
  await assertFails(store('eve').updateSettings(group.id, settings));
  await assertFails(store('outsider').updateSettings(group.id, settings));
  await assertFails(store('bob').update({ id: group.id, name: 'Spoof', gmUid: 'bob' }));
  for (const invalid of [{ ...settings, settingSkills: [{}] }, { ...settings, settingSkills: [{ name: 1, description: '' }] }, { ...settings, unavailableClassKeys: [4] }, { ...settings, unavailableOriginKeys: [null] }, { ...settings, arbitrary: true }]) {
    await assertFails(api.updateDoc(campaign(dbFor('alice'), group.id), { settings: invalid, updatedAt: api.serverTimestamp() }));
  }
  // Upper bound exercises the Security Rules expression budget as well as size.
  await assertSucceeds(store('alice').updateSettings(group.id, { ...settings, settingSkills: Array.from({ length: 10 }, (_, i) => ({ name: `Skill ${i}`, description: 'x'.repeat(1000) })) }));
});

test('incompatible character attachment and forged atomic links fail without removing an existing link', async () => {
  const group = await create(); const other = await create('eve'); await join(group); await join(other);
  await share(other);
  await store('alice').updateSettings(group.id, settingsFixture());
  const bob = dbFor('bob');
  await api.updateDoc(char(bob), { 'builder.classKey': 'wizard', 'builder.originKey': 'alien' });
  await assert.rejects(share(group), /class and origin.*unavailable/);
  assert.equal((await api.getDoc(link(bob))).data().campaignId, other.id);
  const previous = (await api.getDoc(link(bob))).data();
  const forged = api.writeBatch(bob);
  forged.delete(api.doc(bob, 'campaigns', previous.campaignId, 'characters', previous.rosterId));
  forged.set(link(bob), { campaignId: group.id, rosterId: 'forged' });
  forged.set(api.doc(bob, 'campaigns', group.id, 'characters', 'forged'), { ownerUid: 'bob', characterId: 'char-2' });
  await assertFails(forged.commit());
  assert.equal((await api.getDoc(link(bob))).data().campaignId, other.id);
  await api.updateDoc(char(bob), { 'builder.classKey': 'warrior', 'builder.originKey': 'human' });
  await assertSucceeds(share(group));
  await assertFails(api.updateDoc(char(bob), { 'builder.classKey': 'wizard' }));
  await assertFails(api.updateDoc(char(bob), { 'builder.originKey': 'alien' }));
  await assertSucceeds(api.updateDoc(char(bob), { 'builder.name': 'Still editable' }));
  const before = (await api.getDoc(char(bob))).data();
  await api.deleteDoc(char(bob));
  await assertFails(api.setDoc(char(bob), { ...before, builder: { ...before.builder, classKey: 'wizard' } }));
  await assertSucceeds(api.setDoc(char(bob), before));
});

test('settings defaults, linked context and revocation preserve paid skills and old characters', async () => {
  const group = await create(); await join(group);
  const bob = dbFor('bob');
  await api.updateDoc(char(bob), { 'builder.classKey': 'wizard', 'builder.sheet.repeatables.settingSkills': [{ skill: 'Starship Piloting', rank: '1' }] });
  await share(group);
  assert.equal((await store('bob').characterContext({ uid: 'bob', characterId: 'char-2' })).settings.settingSkills.length, 0);
  await store('alice').updateSettings(group.id, settingsFixture());
  const context = await store('bob').characterContext({ uid: 'bob', characterId: 'char-2' });
  assert.equal(context.settings.settingSkills[0].name, 'Starship Piloting');
  await assertSucceeds(api.updateDoc(char(bob), { 'builder.name': 'Existing class retained' }));
  assert.equal((await api.getDoc(char(bob))).data().builder.classKey, 'wizard');
  const superStore = createCampaignStore({ db: env.authenticatedContext('super', { gm: true }).firestore(), api });
  assert.equal((await superStore.characterContext({ uid: 'bob', characterId: 'char-2' })).id, group.id);
  await store('alice').removeMember(group.id, 'bob');
  assert.equal(await store('bob').characterContext({ uid: 'bob', characterId: 'char-2' }), null);
  assert.deepEqual((await api.getDoc(char(bob))).data().builder.sheet.repeatables.settingSkills, [{ skill: 'Starship Piloting', rank: '1' }]);
});

test('any signed-in player can create; only membership-constrained campaign discovery works', async () => {
  const group = await create();
  assert.equal(group.gmUid, 'alice'); assert.deepEqual(group.memberUids, ['alice']);
  const alice = dbFor('alice'); const bob = dbFor('bob');
  await assertFails(api.getDocs(api.collection(alice, 'campaigns')));
  const mine = await assertSucceeds(api.getDocs(api.query(api.collection(alice, 'campaigns'), api.where('memberUids', 'array-contains', 'alice'))));
  assert.equal(mine.size, 1);
  await assertFails(api.getDoc(campaign(bob, group.id)));
  await assertFails(api.getDocs(api.collection(bob, 'campaignInvites')));
  await assertFails(api.getDoc(api.doc(env.unauthenticatedContext().firestore(), 'campaignInvites', group.inviteCode)));
  await assertSucceeds(api.getDoc(api.doc(bob, 'campaignInvites', group.inviteCode)));
  const unauth = createCampaignStore({ db: env.unauthenticatedContext().firestore(), api });
  await assertFails(unauth.create({ uid: 'intruder', name: 'No', displayName: 'No' }));
});

test('join requires the current invite proof and permits only the joining identity', async () => {
  const group = await create(); const bob = dbFor('bob');
  await assertFails(api.updateDoc(campaign(bob, group.id), { memberUids: api.arrayUnion('bob'), updatedAt: api.serverTimestamp() }));
  await assertFails(store('bob').join({ uid: 'eve', code: group.inviteCode, displayName: 'Eve' }));
  await assertSucceeds(join(group));
  await assertSucceeds(join(group)); // idempotent accepted invite
  const value = (await api.getDoc(campaign(bob, group.id))).data();
  assert.deepEqual(value.memberUids, ['alice', 'bob']); assert.equal(value.gmUid, 'alice');
  await assertFails(api.getDoc(api.doc(bob, 'users', 'alice')));
  await assertFails(api.updateDoc(campaign(bob, group.id), { memberUids: api.arrayUnion('eve'), updatedAt: api.serverTimestamp() }));
  await assertFails(api.setDoc(api.doc(bob, 'campaigns', group.id, 'members', 'eve'), { uid: 'eve', displayName: 'Eve', joinCode: group.inviteCode, joinedAt: api.serverTimestamp() }));
});

test('campaign and membership shapes reject extra privileges, malformed names and spoofed timestamps', async () => {
  const group = await create(); const alice = dbFor('alice');
  for (const patch of [{ name: '' }, { name: 'x'.repeat(81) }, { gm: true }, { memberUids: ['alice', 'alice'] }, { inviteCode: 'GUESSABLE' }]) {
    await assertFails(api.updateDoc(campaign(alice, group.id), { ...patch, updatedAt: api.serverTimestamp() }));
  }
  await assertFails(api.updateDoc(campaign(alice, group.id), { name: 'Bad time', updatedAt: api.Timestamp.fromMillis(0) }));
  const member = api.doc(alice, 'campaigns', group.id, 'members', 'alice');
  await assertFails(api.setDoc(member, { uid: 'alice', displayName: 'Alice', joinCode: group.inviteCode, joinedAt: api.serverTimestamp(), gm: true }));
  await assertFails(api.setDoc(member, { uid: 'alice', displayName: '', joinCode: group.inviteCode, joinedAt: api.serverTimestamp() }));
});

test('only creator assigns a current member as GM; ownership and global powers cannot be forged', async () => {
  const group = await create(); await join(group);
  await assertFails(store('bob').update({ id: group.id, name: group.name, gmUid: 'bob' }));
  await assertFails(store('alice').update({ id: group.id, name: group.name, gmUid: 'outsider' }));
  await assertFails(api.updateDoc(campaign(dbFor('alice'), group.id), { ownerUid: 'bob', updatedAt: api.serverTimestamp() }));
  await assertSucceeds(store('alice').update({ id: group.id, name: 'Renamed', gmUid: 'bob' }));
  await assertFails(api.getDocs(api.collection(dbFor('bob'), 'users')));
  await assertFails(api.getDocs(api.collection(dbFor('bob'), 'users', 'alice', 'characters')));
  await assertFails(store('bob').removeMember(group.id, 'bob'));
  await assertFails(store('alice').removeMember(group.id, 'alice'));
});

test('rotation and disabling revoke previous invites without evicting current members', async () => {
  const group = await create(); await join(group);
  await assertFails(store('bob').setInvite(group.id, true));
  await store('alice').setInvite(group.id, true);
  await assertFails(join(group, 'eve'));
  let updated = (await api.getDoc(campaign(dbFor('alice'), group.id))).data();
  assert.notEqual(updated.inviteCode, group.inviteCode);
  await assertSucceeds(join({ id: group.id, ...updated }, 'eve'));
  const code = updated.inviteCode;
  await store('alice').setInvite(group.id, false);
  await assertFails(store('charlie').join({ uid: 'charlie', code, displayName: 'Charlie' }));
  await assertSucceeds(api.getDoc(campaign(dbFor('bob'), group.id)));
  await assertFails(api.setDoc(api.doc(dbFor('bob'), 'campaignInvites', code), { campaignId: group.id }));
});

test('sharing grants only the current GM a single-document read and preserves character bytes', async () => {
  const group = await create(); await join(group); await join(group, 'eve');
  const before = (await api.getDoc(char(dbFor('bob')))).data();
  await assertSucceeds(share(group));
  const alice = dbFor('alice'); const eve = dbFor('eve');
  await assertSucceeds(api.getDoc(char(alice)));
  await assertFails(api.getDoc(char(eve)));
  await assertFails(api.getDoc(api.doc(alice, 'users', 'bob')));
  await assertFails(api.getDocs(api.collection(alice, 'users', 'bob', 'characters')));
  await assertFails(api.updateDoc(char(alice), { 'builder.name': 'Hacked' }));
  await assertFails(api.updateDoc(char(alice), { 'builder.sheet.fields.hpcur': '0' }));
  await assertFails(api.deleteDoc(char(alice)));
  assert.deepEqual((await api.getDoc(char(dbFor('bob')))).data(), before);
  await store('alice').update({ id: group.id, name: group.name, gmUid: 'eve' });
  await assertFails(api.getDoc(char(alice)));
  await assertSucceeds(api.getDoc(char(eve)));
  await assertSucceeds(api.updateDoc(char(dbFor('bob')), { 'builder.name': 'Still owned' }));
  assert.equal((await api.getDoc(char(eve))).data().builder.name, 'Still owned');
});

test('forged/unpaired links, foreign characters and nonmember campaigns are rejected atomically', async () => {
  const group = await create(); const outsider = await create('eve'); await join(group);
  const bob = dbFor('bob');
  await assertFails(api.setDoc(link(bob), { campaignId: group.id, rosterId: 'invented' }));
  await assertFails(api.setDoc(api.doc(bob, 'campaigns', group.id, 'characters', 'invented'), { ownerUid: 'bob', characterId: 'char-2' }));
  await assertFails(share(outsider));
  await assertFails(store('bob').setCharacterCampaign({ uid: 'alice', characterId: 'char-1', campaignId: group.id }));
  await assert.rejects(share(group, 'bob', 'missing-character'), /unavailable/);
  await share(group);
  await assertFails(api.deleteDoc(link(bob)));
  const data = (await api.getDoc(link(bob))).data();
  await assertFails(api.deleteDoc(api.doc(bob, 'campaigns', group.id, 'characters', data.rosterId)));
});

test('campaign sharing composes with the canonical reader and revision-aware owner saves', async () => {
  const group = await create(); await join(group);
  const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);
  const ownerOptions = { ownerUid: 'bob', firestore: dbFor('bob'), firestoreApi: api, references };
  const created = await createCharacter(ownerOptions);
  const characterId = created.characterId;
  const before = (await api.getDoc(char(ownerOptions.firestore, 'bob', characterId))).data();
  await share(group, 'bob', characterId);
  const gmOptions = { ...ownerOptions, characterId, firestore: dbFor('alice') };
  const viewed = await readCharacter(gmOptions);
  assert.equal(viewed.revision, created.revision);
  assert.deepEqual(viewed.character, created.character);
  assert.deepEqual((await api.getDoc(char(ownerOptions.firestore, 'bob', characterId))).data(), before);
  await assertFails(patchCharacter({ ...gmOptions, expectedRevision: viewed.revision, scope: 'sheet', patch: { 'builder.sheet.fields.hpcur': '1' } }));
  await patchCharacter({ ...ownerOptions, characterId, expectedRevision: created.revision, scope: 'builder', patch: { 'builder.name': 'Changed after sharing' } });
  const latest = await readCharacter(gmOptions);
  assert.equal(latest.character.builder.name, 'Changed after sharing');
  assert.equal(latest.revision, created.revision + 1);
  await store('bob').setCharacterCampaign({ uid: 'bob', characterId, campaignId: '' });
  await assertFails(readCharacter(gmOptions));
});

test('switching and detaching campaigns clean reciprocal links and revoke prior GM access', async () => {
  const first = await create(); const second = await create('eve');
  await join(first); await join(second); await share(first);
  const previous = (await api.getDoc(link(dbFor('bob')))).data();
  await share(second);
  await assertFails(api.getDoc(char(dbFor('alice'))));
  await assertSucceeds(api.getDoc(char(dbFor('eve'))));
  assert.equal((await api.getDoc(api.doc(dbFor('alice'), 'campaigns', first.id, 'characters', previous.rosterId))).exists(), false);
  await store('bob').setCharacterCampaign({ uid: 'bob', characterId: 'char-2', campaignId: '' });
  await assertFails(api.getDoc(char(dbFor('eve'))));
  assert.equal((await api.getDocs(api.collection(dbFor('eve'), 'campaigns', second.id, 'characters'))).size, 0);
});

test('leave/removal revoke dormant links immediately; owners can detach after departure', async () => {
  const group = await create(); await join(group); await share(group);
  await store('bob').removeMember(group.id, 'bob');
  await assertFails(api.getDoc(char(dbFor('alice'))));
  await assertFails(api.getDoc(campaign(dbFor('bob'), group.id)));
  await assertSucceeds(join(group));
  await assertSucceeds(api.getDoc(char(dbFor('alice'))));
  await store('alice').removeMember(group.id, 'bob');
  await assertFails(api.getDoc(char(dbFor('alice'))));
  await assertSucceeds(store('bob').setCharacterCampaign({ uid: 'bob', characterId: 'char-2', campaignId: '' }));
  assert.equal((await api.getDoc(link(dbFor('bob')))).exists(), false);
});

test('deletion pages through active and removed players without changing any character data', async () => {
  const group = await create(); await join(group); await join(group, 'eve');
  const before = new Map();
  for (let index = 0; index < 8; index++) {
    const uid = index < 6 ? 'bob' : 'eve'; const id = `hero-${index}`; const db = dbFor(uid);
    const value = { ownerUid: uid, builder: { name: `Hero ${index}`, sheet: { repeatables: { settingSkills: [{ skill: 'Lore', rank: '2' }] } } },
      revision: index, sheet: { hpCurrent: 3, notes: 'Preserve play state.' }, portrait: 'unchanged' };
    await env.withSecurityRulesDisabled(async admin => api.setDoc(char(admin.firestore(), uid, id), value));
    before.set(`${uid}/${id}`, value); await share(group, uid, id);
  }
  await store('alice').removeMember(group.id, 'eve');
  await env.withSecurityRulesDisabled(async admin => {
    // More than one member-cleanup page, including historical member records.
    const db = admin.firestore(); const batch = api.writeBatch(db);
    for (let index = 0; index < 21; index++) batch.set(api.doc(db, 'campaigns', group.id, 'members', `former-${index}`), { uid: `former-${index}` });
    await batch.commit();
  });
  await store('alice').deleteCampaign(group.id);
  for (const [key, value] of before) {
    const [uid, id] = key.split('/'); const db = dbFor(uid);
    assert.deepEqual((await api.getDoc(char(db, uid, id))).data(), value);
    assert.equal((await api.getDoc(link(db, uid, id))).exists(), false);
  }
  for (const kind of ['members', 'characters']) assert.equal((await api.getDocs(api.collection(dbFor('alice'), 'campaigns', group.id, kind))).size, 0);
});

test('interrupted deletion revokes sharing immediately and creator can resume link cleanup', async () => {
  const group = await create(); await join(group); await share(group);
  const bob = dbFor('bob'); const alice = dbFor('alice');
  const before = (await api.getDoc(char(bob))).data();
  const interrupted = createCampaignStore({ db: alice, api: { ...api, getDocsFromServer: async () => { throw new Error('Connection interrupted'); } } });
  await assert.rejects(interrupted.deleteCampaign(group.id), error => error.code === 'campaign-deletion-incomplete');
  assert.equal((await api.getDoc(link(bob))).exists(), true);
  await assertFails(api.getDoc(char(alice)));
  await assertFails(join(group, 'eve'));
  await assertFails(store('bob').deleteCampaign(group.id));
  await store('alice').deleteCampaign(group.id);
  assert.equal((await api.getDoc(link(bob))).exists(), false);
  assert.deepEqual((await api.getDoc(char(bob))).data(), before);
});

test('a concurrent character move during deletion preserves the new campaign link', async () => {
  const group = await create(); await join(group); await share(group);
  const other = await create('eve'); await join(other);
  let moved = false;
  const cleanup = createCampaignStore({ db: dbFor('alice'), api: { ...api, getDocsFromServer: async request => {
    const snapshot = await api.getDocsFromServer(request);
    if (!moved && snapshot.docs[0]?.ref.path.includes('/characterCampaigns/')) {
      moved = true; await share(other);
    }
    return snapshot;
  } } });
  await cleanup.deleteCampaign(group.id);
  assert.equal(moved, true);
  assert.equal((await api.getDoc(link(dbFor('bob')))).data().campaignId, other.id);
  await assertSucceeds(api.getDoc(char(dbFor('eve'))));
  await assertFails(api.getDoc(char(dbFor('alice'))));
});

test('cleanup permissions expose only deleted-campaign relationships and never character writes', async () => {
  const group = await create(); await join(group); await share(group);
  await store('alice').update({ id: group.id, name: group.name, gmUid: 'bob' });
  const other = await create('eve'); await join(other);
  await api.setDoc(char(dbFor('bob'), 'bob', 'other-hero'), { ownerUid: 'bob', builder: { name: 'Other hero' } });
  await share(other, 'bob', 'other-hero');
  const alice = dbFor('alice'); const bob = dbFor('bob');
  const rosterId = (await api.getDoc(link(bob))).data().rosterId;
  await assertFails(api.getDoc(link(alice)));
  await assertFails(api.deleteDoc(link(alice)));
  await api.updateDoc(char(bob), { 'builder.name': 'Keep me' });
  const interrupted = createCampaignStore({ db: alice, api: { ...api, getDocsFromServer: async () => { throw new Error('Interrupted'); } } });
  await assert.rejects(interrupted.deleteCampaign(group.id));
  await assertSucceeds(api.getDoc(link(alice)));
  await assertFails(api.getDocs(api.collection(alice, 'users', 'bob', 'characterCampaigns')));
  await assertFails(api.deleteDoc(link(alice))); // Reciprocal deletion is required.
  await assertFails(api.deleteDoc(api.doc(alice, 'campaigns', group.id, 'characters', rosterId)));
  await assertFails(api.updateDoc(char(alice), { 'builder.name': 'Unauthorized' }));
  await assertFails(api.deleteDoc(char(alice)));
  await assertFails(api.getDocs(api.collection(dbFor('eve'), 'campaigns', group.id, 'characters')));
  await store('alice').deleteCampaign(group.id);
});

test('Super GM retains global account, character and portrait powers without campaign membership', async () => {
  const group = await create(); await join(group); await share(group);
  const admin = context('admin', { gm: true }); const db = admin.firestore();
  await assertSucceeds(api.getDocs(api.collection(db, 'users')));
  await assertSucceeds(api.getDoc(char(db)));
  await assertSucceeds(api.updateDoc(char(db), { 'builder.name': 'Super GM edit' }));
  await assertSucceeds(api.getDoc(api.doc(db, 'users', 'bob')));
  await seedStoragePortrait(env, { userId: 'bob', charId: 'char-2' });
  await assertSucceeds(getBytes(ref(admin.storage(), 'portraits/bob/char-2/portrait.png')));
  await assertSucceeds(createCampaignStore({ db, api }).setCharacterCampaign({ uid: 'bob', characterId: 'char-2', campaignId: '' }));
  assert.equal((await api.getDoc(link(db))).exists(), false);
});

test('campaign portrait reads follow membership and GM changes; writes remain owner/Super GM only', async () => {
  const group = await create(); await join(group); await join(group, 'eve'); await share(group);
  await seedStoragePortrait(env, { userId: 'bob', charId: 'char-2' });
  const alice = ref(context('alice').storage(), 'portraits/bob/char-2/portrait.png');
  const eve = ref(context('eve').storage(), 'portraits/bob/char-2/portrait.png');
  await assertSucceeds(getBytes(alice)); await assertFails(getBytes(eve));
  await assertFails(uploadBytes(alice, new Uint8Array([1]), { contentType: 'image/png' }));
  await assertFails(deleteObject(alice));
  await store('alice').update({ id: group.id, name: group.name, gmUid: 'eve' });
  await assertFails(getBytes(alice)); await assertSucceeds(getBytes(eve));
  await store('alice').removeMember(group.id, 'bob');
  await assertFails(getBytes(eve));
});
