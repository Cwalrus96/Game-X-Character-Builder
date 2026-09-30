// Creates a new disposable fixture in the LOCAL emulator; never overwrites one.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {assertCanonicalCharacter} from '../../public/js/core/character-codec.js';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
const id=process.argv[2]||`benchmark-${Date.now()}`;
assert.match(id,/^benchmark-[a-z0-9-]+$/);
const character=assertCanonicalCharacter(JSON.parse(await fs.readFile('scripts/performance/fixtures/typical.json')));
assert.equal(character.ownerUid,'local-dev-user');
initializeApp({projectId:'game-x-character-builder'});
await getFirestore().doc(`users/local-dev-user/characters/${id}`).create({...character,revision:1});
console.log(`Created disposable emulator character ${id}`);
