import assert from "node:assert/strict";
import test from "node:test";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { createCharacterMigrationReferences } from "../public/js/core/character-migrations.js";
import { CharacterConflictError } from "../public/js/core/character-persistence.js";
import { readCharacter } from "../public/js/core/database-reader.js";
import {
  createCharacter,
  patchCharacter,
  replaceCharacter,
} from "../public/js/core/database-writer.js";
import {
  MIGRATION_GAME_DATA,
  makeObservedLegacyV4Character,
  makeV4Character,
} from "./fixtures/character-schemas.mjs";
import {
  ALICE_UID,
  BOB_UID,
  createRulesTestEnvironment,
  makeAuthedContext,
} from "./rules-test-helpers.mjs";

const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);
const firestoreApi = Object.freeze({
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
});
let testEnv;

test.before(async () => {
  testEnv = await createRulesTestEnvironment();
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

function aliceFirestore() {
  return makeAuthedContext(testEnv, ALICE_UID).firestore();
}

async function seedLegacy(characterId = "legacy") {
  const legacy = makeV4Character();
  legacy.ownerUid = ALICE_UID;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", ALICE_UID, "characters", characterId), legacy);
  });
  return legacy;
}

test("repository entry points create and read exact v5 with resolved timestamps", async () => {
  const firestore = aliceFirestore();
  const created = await createCharacter({ ownerUid: ALICE_UID, firestore, firestoreApi });
  assert.equal(created.revision, 1);

  const loaded = await readCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    references,
    firestore,
    firestoreApi,
  });
  assert.equal(loaded.character.schemaVersion, 5);
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.migrated, false);
  assert.equal(typeof loaded.metadata.createdAt?.toMillis, "function");
  assert.equal(typeof loaded.metadata.updatedAt?.toMillis, "function");
});

test("a migrated read is read-only and an explicit save persists schema v5", async () => {
  const original = await seedLegacy();
  const firestore = aliceFirestore();
  const loaded = await readCharacter({
    ownerUid: ALICE_UID,
    characterId: "legacy",
    references,
    firestore,
    firestoreApi,
  });
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.revision, 0);

  const afterRead = (await getDoc(doc(firestore, "users", ALICE_UID, "characters", "legacy"))).data();
  assert.equal(afterRead.schemaVersion, original.schemaVersion);
  assert.equal("revision" in afterRead, false);

  const saved = await replaceCharacter({
    ownerUid: ALICE_UID,
    characterId: "legacy",
    character: loaded.character,
    expectedRevision: loaded.revision,
    firestore,
    firestoreApi,
  });
  assert.equal(saved.revision, 1);
  const afterSave = (await getDoc(doc(firestore, "users", ALICE_UID, "characters", "legacy"))).data();
  assert.equal(afterSave.schemaVersion, 5);
  assert.equal(afterSave.revision, 1);
  assert.equal(afterSave.lastVisitedAt, "visited-at");
});

test("observed legacy v4 state upgrades on explicit save once while preserving choices and rejecting stale saves", async () => {
  const original = makeObservedLegacyV4Character();
  original.ownerUid = ALICE_UID;
  original.builder.sheet.fields.notes = "Player-authored notes remain unchanged.";
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", ALICE_UID, "characters", "observed-v4"), original);
  });
  const firestore = aliceFirestore();
  const options = { ownerUid: ALICE_UID, characterId: "observed-v4", references, firestore, firestoreApi };
  const ref = doc(firestore, "users", ALICE_UID, "characters", "observed-v4");
  const loaded = await readCharacter(options);
  assert.deepEqual((await getDoc(ref)).data(), original, "migration on read must not write");
  assert.equal(loaded.revision, 0);
  assert.deepEqual(loaded.character.builder.selectedFeats, [], "stale merged selections stay superseded");
  assert.deepEqual(loaded.character.builder.grantedCoreSkillSnapshot, ["athletics", "medicine"]);
  assert.equal(loaded.character.builder.grantChoices["soulbound-weapon"].sourceId, "class-feature:weapon-master:soulbound-weapon");
  assert.equal(loaded.character.builder.weapons[0].id, "weapon:owned-practice");
  const saved = await patchCharacter({ ...options, expectedRevision: 0, patch: { "builder.name": loaded.character.builder.name } });
  assert.equal(saved.migrated, true);
  assert.equal(saved.revision, 1);
  const reloaded = await readCharacter(options);
  assert.equal(reloaded.migrated, false);
  assert.deepEqual(reloaded.migration.appliedVersions, []);
  assert.deepEqual(reloaded.character, loaded.character, "the complete converted state survives save/reload");
  assert.equal(reloaded.metadata.createdAt, original.createdAt);
  assert.equal(reloaded.character.builder.sheet.fields.notes, original.builder.sheet.fields.notes);
  await assert.rejects(patchCharacter({ ...options, expectedRevision: 0, patch: { "builder.name": "Stale" } }),
    (error) => error instanceof CharacterConflictError);
  assert.deepEqual((await readCharacter(options)).character, reloaded.character);
  const second = await patchCharacter({ ...options, expectedRevision: 1, patch: { "builder.name": reloaded.character.builder.name } });
  assert.equal(second.migrated, false);
  assert.equal(second.revision, 2);
});

test("narrow patches preserve unrelated state and reject invalid paths", async () => {
  const firestore = aliceFirestore();
  const created = await createCharacter({ ownerUid: ALICE_UID, firestore, firestoreApi });
  const patched = await patchCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    expectedRevision: created.revision,
    patch: { "builder.name": "Kiko" },
    references,
    firestore,
    firestoreApi,
  });
  assert.equal(patched.character.builder.name, "Kiko");
  assert.equal(patched.character.builder.level, 1);
  assert.equal(patched.revision, 2);

  await assert.rejects(() => patchCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    expectedRevision: patched.revision,
    patch: { "builder.unknown": true },
    references,
    firestore,
    firestoreApi,
  }), (error) => error.code === "character-patch-invalid");

  const unchanged = await readCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    references,
    firestore,
    firestoreApi,
  });
  assert.equal(unchanged.character.builder.name, "Kiko");
  assert.equal(unchanged.revision, 2);
});

test("stale writes fail deterministically without replacing the newer value", async () => {
  const firestore = aliceFirestore();
  const created = await createCharacter({ ownerUid: ALICE_UID, firestore, firestoreApi });
  const first = await patchCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    expectedRevision: created.revision,
    patch: { "builder.name": "Newer" },
    references,
    firestore,
    firestoreApi,
  });
  assert.equal(first.revision, 2);

  await assert.rejects(() => patchCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    expectedRevision: created.revision,
    patch: { "builder.name": "Stale" },
    references,
    firestore,
    firestoreApi,
  }), (error) => {
    assert.equal(error instanceof CharacterConflictError, true);
    assert.equal(error.expectedRevision, 1);
    assert.equal(error.actualRevision, 2);
    return true;
  });

  const loaded = await readCharacter({
    ownerUid: ALICE_UID,
    characterId: created.characterId,
    references,
    firestore,
    firestoreApi,
  });
  assert.equal(loaded.character.builder.name, "Newer");
  assert.equal(loaded.revision, 2);
});

test("missing documents and Firebase authorization errors propagate", async () => {
  const firestore = aliceFirestore();
  await assert.rejects(() => readCharacter({
    ownerUid: ALICE_UID,
    characterId: "missing",
    references,
    firestore,
    firestoreApi,
  }), (error) => error.code === "character-not-found");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const bobCharacter = makeV4Character();
    bobCharacter.ownerUid = BOB_UID;
    await setDoc(doc(context.firestore(), "users", BOB_UID, "characters", "bob-char"), bobCharacter);
  });
  await assert.rejects(() => readCharacter({
    ownerUid: BOB_UID,
    characterId: "bob-char",
    references,
    firestore,
    firestoreApi,
  }), (error) => String(error.code || "").includes("permission-denied"));
});
