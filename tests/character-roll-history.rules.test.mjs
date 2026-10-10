import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as api from 'firebase/firestore';
import { createCampaignStore } from '../public/js/core/campaign-store.js';
import { saveCharacterRoll } from '../public/js/core/database-writer.js';
import { createRulesTestEnvironment, seedFirestore } from './rules-test-helpers.mjs';

let env;
const dbFor = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const store = uid => createCampaignStore({ db: dbFor(uid), api });
const parent = db => api.doc(db, 'users', 'bob', 'characters', 'char-2');
const activity = (db, id = 'roll-one', charId = 'char-2') => api.doc(db, 'users', 'bob', 'characters', charId, 'rolls', id);
const record = () => ({ label: 'Strike', attributeKey: 'agility', attributeValue: 2, skillName: 'Melee Weapons', skillRank: 1,
  modifierDice: 0.5, dice: [6, 4, 1], coin: 1, automaticHits: 0, hits: 4, targetNumber: null,
  fullDamage: 12, onHitDamageBonus: 2, normalCritical: false });
const write = (db, id = 'roll-one', data = record()) => saveCharacterRoll({ ownerUid: 'bob', characterId: 'char-2', rollId: id, data, firestore: db, firestoreApi: api });
async function group() {
  const id = await store('alice').create({ uid: 'alice', name: 'Overview', displayName: 'Alice' });
  const group = (await api.getDoc(api.doc(dbFor('alice'), 'campaigns', id))).data();
  await store('bob').join({ uid: 'bob', code: group.inviteCode, displayName: 'Bob' });
  await store('bob').setCharacterCampaign({ uid: 'bob', characterId: 'char-2', campaignId: id });
  return { id, ...group };
}
test.before(async () => { env = await createRulesTestEnvironment(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); await seedFirestore(env); });

test('owner activity creates, retries and corrects TN without changing the character', async () => {
  const db = dbFor('bob'); const before = (await api.getDoc(parent(db))).data();
  await assertSucceeds(write(db)); await assertSucceeds(write(db));
  const first = (await api.getDoc(activity(db))).data(); assert.equal(first.actorUid, 'bob');
  await assertSucceeds(write(db, 'roll-one', { ...record(), targetNumber: 3 }));
  const after = (await api.getDoc(activity(db))).data();
  assert.equal(after.targetNumber, 3); assert.equal(after.createdAt.toMillis(), first.createdAt.toMillis());
  assert.deepEqual((await api.getDoc(parent(db))).data(), before);
  assert.equal((await api.getDocs(api.collection(db, 'users', 'bob', 'characters', 'char-2', 'rolls'))).size, 1);
});
test('Rules reject forged shape, faces, hit sums, timestamps, actors and immutable results', async () => {
  const db = dbFor('bob'); const raw = { ...record(), actorUid: 'bob', createdAt: api.serverTimestamp() };
  for (const patch of [{ extra: true }, { dice: Array(11).fill(1) }, { dice: [6, 4, 7] }, { hits: 9 },
    { coin: 2 }, { modifierDice: 0.25 }, { attributeValue: -1 }, { targetNumber: -1 }, { fullDamage: -1 },
    { skillName: '' }, { label: 'x'.repeat(241) }, { actorUid: 'alice' }, { createdAt: api.Timestamp.fromMillis(1000) }]) {
    await assertFails(api.setDoc(activity(db), { ...raw, ...patch }));
  }
  await write(db);
  for (const patch of [{ hits: 9 }, { label: 'Different roll' }, { actorUid: 'alice' }, { createdAt: api.serverTimestamp() }]) {
    await assertFails(api.updateDoc(activity(db), patch));
  }
  await assertFails(api.deleteDoc(activity(db)));
  await assertFails(api.setDoc(activity(db, 'no-parent', 'missing'), raw));
});
test('only owners record activity; campaign GM and Super GM read with existing scope', async () => {
  const campaign = await group(); const bob = dbFor('bob'); await write(bob);
  const alice = dbFor('alice'), eve = dbFor('eve'), superGM = dbFor('super', { gm: true });
  await assertSucceeds(api.getDoc(activity(alice)));
  await assertSucceeds(api.getDocs(api.collection(alice, 'users', 'bob', 'characters', 'char-2', 'rolls')));
  await assertSucceeds(api.getDoc(activity(superGM)));
  await assertFails(write(alice, 'forged')); await assertFails(write(superGM, 'forged'));
  await assertFails(api.updateDoc(activity(alice), { targetNumber: 1 }));
  await assertFails(api.getDoc(activity(eve))); await assertFails(api.getDoc(activity(env.unauthenticatedContext().firestore())));
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(); await api.setDoc(api.doc(db, 'users', 'bob', 'characters', 'unshared'), { ownerUid: 'bob' });
    await api.setDoc(activity(db, 'roll-one', 'unshared'), { ...record(), actorUid: 'bob', createdAt: api.Timestamp.now() });
  });
  await assertFails(api.getDoc(activity(alice, 'roll-one', 'unshared')));
  await assertSucceeds(api.getDoc(activity(superGM, 'roll-one', 'unshared')));
  await store('eve').join({ uid: 'eve', code: campaign.inviteCode, displayName: 'Eve' });
  await assertFails(api.getDoc(activity(eve)));
});
test('GM reassignment, member removal, detach and deletion revoke roll and character reads', async () => {
  for (const mode of ['demotion', 'member', 'detach', 'delete']) {
    await env.clearFirestore(); await seedFirestore(env);
    const campaign = await group(); const alice = dbFor('alice'); await write(dbFor('bob'));
    await assertSucceeds(api.getDoc(activity(alice)));
    if (mode === 'demotion') await store('alice').update({ id: campaign.id, name: campaign.name, gmUid: 'bob' });
    if (mode === 'member') await store('alice').removeMember(campaign.id, 'bob');
    if (mode === 'detach') await store('bob').setCharacterCampaign({ uid: 'bob', characterId: 'char-2', campaignId: null });
    if (mode === 'delete') await store('alice').deleteCampaign(campaign.id);
    await assertFails(api.getDoc(activity(alice))); await assertFails(api.getDoc(parent(alice)));
    await assertSucceeds(api.getDoc(activity(dbFor('bob'))));
  }
});
test('the recent query returns ten newest rolls and maximum-size valid dice records remain writable', async () => {
  await group(); const bob = dbFor('bob');
  for (let index = 0; index < 12; index++) {
    await assertSucceeds(write(bob, `roll-${index}`, { ...record(), label: `Roll ${index}`, dice: Array(10).fill(6),
      coin: 1, automaticHits: 9999, hits: 10020 }));
  }
  await write(bob, 'roll-0', { ...record(), label: 'Roll 0', dice: Array(10).fill(6), coin: 1, automaticHits: 9999, hits: 10020, targetNumber: 2 });
  const recent = await assertSucceeds(api.getDocs(api.query(api.collection(dbFor('alice'), 'users', 'bob', 'characters', 'char-2', 'rolls'),
    api.orderBy('createdAt', 'desc'), api.limit(10))));
  assert.deepEqual(recent.docs.map(item => item.data().label), Array.from({ length: 10 }, (_, index) => `Roll ${11 - index}`));
});
test('active listeners receive saved changes and fail closed when campaign sharing ends', async () => {
  const campaign = await group(); await write(dbFor('bob')); const alice = dbFor('alice');
  let count = 0, stop; const results = [];
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Live activity timed out')), 8000);
    stop = api.onSnapshot(activity(alice), async snapshot => {
      results.push(snapshot.data()); ++count;
      if (count === 1) await write(dbFor('bob'), 'roll-one', { ...record(), targetNumber: 4 });
      if (count === 2) { clearTimeout(timer); resolve(); }
    }, reject);
  });
  await received; stop(); assert.deepEqual(results.map(item => item.targetNumber), [null, 4]);
  let finish;
  const denied = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Revocation timed out')), 8000);
    finish = api.onSnapshot(activity(alice), () => {}, error => { clearTimeout(timer); resolve(error); });
  });
  try {
    await store('alice').removeMember(campaign.id, 'bob');
    // The emulator reevaluates dependent read rules on the next activity change.
    // The overview also observes campaign membership and clears cards immediately.
    await write(dbFor('bob'), 'roll-one', { ...record(), targetNumber: 5 });
    assert.equal((await denied).code, 'permission-denied');
  } finally { finish(); }
});
