import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export const TEST_PROJECT_ID = 'game-x-character-builder-rules';
export const ALICE_UID = 'alice';
export const BOB_UID = 'bob';
export const GM_UID = 'gm-user';

export function readProjectFile(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

export async function createRulesTestEnvironment() {
  return await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      rules: readProjectFile('firestore.rules'),
    },
    storage: {
      rules: readProjectFile('storage.rules'),
    },
  });
}

export async function seedFirestore(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const { doc, setDoc } = await import('firebase/firestore');

    await setDoc(doc(db, 'users', ALICE_UID), {
      uid: ALICE_UID,
      email: 'alice@example.com',
      displayName: 'Alice',
    });

    await setDoc(doc(db, 'users', BOB_UID), {
      uid: BOB_UID,
      email: 'bob@example.com',
      displayName: 'Bob',
    });

    await setDoc(doc(db, 'users', ALICE_UID, 'characters', 'char-1'), {
      ownerUid: ALICE_UID,
      builder: { name: 'Alice Hero' },
    });

    await setDoc(doc(db, 'users', BOB_UID, 'characters', 'char-2'), {
      ownerUid: BOB_UID,
      builder: { name: 'Bob Hero' },
    });

    await setDoc(doc(db, 'characters', ALICE_UID), {
      ownerUid: ALICE_UID,
      legacy: true,
    });

    await setDoc(doc(db, 'campaigns', 'camp-1'), {
      name: 'Test Campaign',
    });
  });
}

export async function seedStoragePortrait(testEnv, { userId = ALICE_UID, charId = 'char-1', fileName = 'portrait.png' } = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage();
    const { ref, uploadBytes } = await import('firebase/storage');
    const objectRef = ref(storage, `portraits/${userId}/${charId}/${fileName}`);
    await uploadBytes(objectRef, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));
  });
}

export function makeAuthedContext(testEnv, uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims);
}
