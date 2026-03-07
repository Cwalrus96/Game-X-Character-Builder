import test from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';

import {
  ALICE_UID,
  BOB_UID,
  GM_UID,
  createRulesTestEnvironment,
  makeAuthedContext,
  seedFirestore,
} from './rules-test-helpers.mjs';

let testEnv;

test.before(async () => {
  testEnv = await createRulesTestEnvironment();
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedFirestore(testEnv);
});

test('unauthenticated users cannot read protected Firestore documents', async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(db, 'users', ALICE_UID)));
  await assertFails(getDoc(doc(db, 'users', ALICE_UID, 'characters', 'char-1')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(getDoc(doc(db, 'campaigns', 'camp-1')));
});

test('players can read and update only their own user document', async () => {
  const aliceDb = makeAuthedContext(testEnv, ALICE_UID).firestore();

  await assertSucceeds(getDoc(doc(aliceDb, 'users', ALICE_UID)));
  await assertSucceeds(setDoc(doc(aliceDb, 'users', ALICE_UID), { displayName: 'Alice Updated' }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(aliceDb, 'users', ALICE_UID)));

  await assertFails(getDoc(doc(aliceDb, 'users', BOB_UID)));
  await assertFails(setDoc(doc(aliceDb, 'users', BOB_UID), { displayName: 'Nope' }, { merge: true }));
  await assertFails(deleteDoc(doc(aliceDb, 'users', BOB_UID)));
});

test('players cannot list the users collection', async () => {
  const aliceDb = makeAuthedContext(testEnv, ALICE_UID).firestore();
  await assertFails(getDocs(collection(aliceDb, 'users')));
});

test('players can read and write only their own nested character documents', async () => {
  const aliceDb = makeAuthedContext(testEnv, ALICE_UID).firestore();

  await assertSucceeds(getDoc(doc(aliceDb, 'users', ALICE_UID, 'characters', 'char-1')));
  await assertSucceeds(
    setDoc(
      doc(aliceDb, 'users', ALICE_UID, 'characters', 'char-3'),
      { ownerUid: ALICE_UID, builder: { name: 'New Alice Hero' } },
      { merge: true }
    )
  );

  await assertFails(getDoc(doc(aliceDb, 'users', BOB_UID, 'characters', 'char-2')));
  await assertFails(
    setDoc(
      doc(aliceDb, 'users', BOB_UID, 'characters', 'char-2'),
      { ownerUid: BOB_UID, builder: { name: 'Intrusion' } },
      { merge: true }
    )
  );
});

test('legacy single-document character path still respects gm-or-self access', async () => {
  const aliceDb = makeAuthedContext(testEnv, ALICE_UID).firestore();

  await assertSucceeds(getDoc(doc(aliceDb, 'characters', ALICE_UID)));
  await assertSucceeds(setDoc(doc(aliceDb, 'characters', ALICE_UID), { legacy: 'updated' }, { merge: true }));

  await assertFails(getDoc(doc(aliceDb, 'characters', BOB_UID)));
  await assertFails(setDoc(doc(aliceDb, 'characters', BOB_UID), { legacy: 'intrusion' }, { merge: true }));
});

test('campaign documents remain GM-only', async () => {
  const aliceDb = makeAuthedContext(testEnv, ALICE_UID).firestore();
  const gmDb = makeAuthedContext(testEnv, GM_UID, { gm: true }).firestore();

  await assertFails(getDoc(doc(aliceDb, 'campaigns', 'camp-1')));
  await assertFails(setDoc(doc(aliceDb, 'campaigns', 'camp-1'), { touchedBy: ALICE_UID }, { merge: true }));

  await assertSucceeds(getDoc(doc(gmDb, 'campaigns', 'camp-1')));
  await assertSucceeds(setDoc(doc(gmDb, 'campaigns', 'camp-1'), { touchedBy: GM_UID }, { merge: true }));
});

test('GMs can list users and access any user or character document', async () => {
  const gmDb = makeAuthedContext(testEnv, GM_UID, { gm: true }).firestore();

  const usersSnap = await assertSucceeds(getDocs(collection(gmDb, 'users')));
  assert.equal(usersSnap.size, 2);

  await assertSucceeds(getDoc(doc(gmDb, 'users', ALICE_UID)));
  await assertSucceeds(getDoc(doc(gmDb, 'users', BOB_UID, 'characters', 'char-2')));
  await assertSucceeds(setDoc(doc(gmDb, 'users', BOB_UID), { reviewedBy: GM_UID }, { merge: true }));
  await assertSucceeds(setDoc(doc(gmDb, 'users', BOB_UID, 'characters', 'char-2'), { reviewedBy: GM_UID }, { merge: true }));
});
