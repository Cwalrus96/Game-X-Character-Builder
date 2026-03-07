import test from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

import {
  ALICE_UID,
  BOB_UID,
  GM_UID,
  createRulesTestEnvironment,
  makeAuthedContext,
  seedStoragePortrait,
} from './rules-test-helpers.mjs';

let testEnv;

test.before(async () => {
  testEnv = await createRulesTestEnvironment();
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearStorage();
  await seedStoragePortrait(testEnv);
});

test('unauthenticated users cannot read or write portrait files', async () => {
  const storage = testEnv.unauthenticatedContext().storage();
  const objectRef = ref(storage, `portraits/${ALICE_UID}/char-1/portrait.png`);

  await assertFails(getBytes(objectRef));
  await assertFails(uploadBytes(objectRef, new Blob([new Uint8Array([1])], { type: 'image/png' })));
});

test('players can read, upload, and delete only their own portrait files', async () => {
  const aliceStorage = makeAuthedContext(testEnv, ALICE_UID).storage();
  const ownRef = ref(aliceStorage, `portraits/${ALICE_UID}/char-1/portrait.png`);
  const bobRef = ref(aliceStorage, `portraits/${BOB_UID}/char-2/portrait.png`);

  await assertSucceeds(getBytes(ownRef));
  await assertSucceeds(uploadBytes(ownRef, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })));
  await assertSucceeds(deleteObject(ownRef));

  await assertFails(getBytes(bobRef));
  await assertFails(uploadBytes(bobRef, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })));
  await assertFails(deleteObject(bobRef));
});

test('portrait uploads must be common raster images under 5MB', async () => {
  const aliceStorage = makeAuthedContext(testEnv, ALICE_UID).storage();
  const svgRef = ref(aliceStorage, `portraits/${ALICE_UID}/char-1/portrait.svg`);
  const tooLargeRef = ref(aliceStorage, `portraits/${ALICE_UID}/char-1/portrait-large.png`);

  await assertFails(uploadBytes(svgRef, new Blob(['<svg></svg>'], { type: 'image/svg+xml' })));

  const oversizedBytes = new Uint8Array((5 * 1024 * 1024) + 1);
  await assertFails(uploadBytes(tooLargeRef, new Blob([oversizedBytes], { type: 'image/png' })));
});

test('GMs can read, upload, and delete any portrait file', async () => {
  const gmStorage = makeAuthedContext(testEnv, GM_UID, { gm: true }).storage();
  const objectRef = ref(gmStorage, `portraits/${BOB_UID}/char-2/portrait.png`);

  await seedStoragePortrait(testEnv, { userId: BOB_UID, charId: 'char-2', fileName: 'portrait.png' });

  await assertSucceeds(getBytes(objectRef));
  await assertSucceeds(uploadBytes(objectRef, new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' })));
  await assertSucceeds(deleteObject(objectRef));
});
