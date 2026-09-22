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
import { contentMigrationGameData, historicalCelestialKnight } from "./fixtures/character-content-migrations.mjs";
import {
  createCharacter,
  patchCharacter,
  replaceCharacter,
} from "../public/js/core/database-writer.js";
import {
  MIGRATION_GAME_DATA,
  makeObservedLegacyV4Character,
  makeV4Character,
  makeV5Character,
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

test("repository entry points create and read exact v6 with resolved timestamps", async () => {
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
  assert.equal(loaded.character.schemaVersion, 6);
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.migrated, false);
  assert.equal(typeof loaded.metadata.createdAt?.toMillis, "function");
  assert.equal(typeof loaded.metadata.updatedAt?.toMillis, "function");
});

test("a migrated read is read-only and an explicit save persists schema v6", async () => {
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
  assert.equal(afterSave.schemaVersion, 6);
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

test("v5 upgrades read-only to empty Trait state and explicit v6 saves retain owned answers and revision checks", async () => {
  const original = makeV5Character();
  original.ownerUid = ALICE_UID;
  Object.assign(original, { revision: 4, createdAt: "original-created", updatedAt: "original-updated" });
  original.builder.sheet.fields.notes = "Player notes survive the Trait schema upgrade.";
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", ALICE_UID, "characters", "traits-v5"), original);
  });
  const firestore = aliceFirestore();
  const options = { ownerUid: ALICE_UID, characterId: "traits-v5", references, firestore, firestoreApi };
  const ref = doc(firestore, "users", ALICE_UID, "characters", "traits-v5");
  const loaded = await readCharacter(options);
  assert.deepEqual((await getDoc(ref)).data(), original);
  assert.equal(loaded.character.schemaVersion, 6);
  assert.equal(loaded.revision, 4);
  assert.deepEqual(loaded.character.builder.traitChoices, {});
  assert.deepEqual(loaded.character.builder.traitActivations, {});
  const traitChoices = {
    "trait-choice:adaptation:1": { choiceId: "trait-choice:adaptation:1", sourceId: "origin-feature:adaptation", recipientId: "character", traitKey: "wings" },
  };
  const traitActivations = {
    "trait-activation:form": { activationId: "trait-activation:form", sourceId: "class-feature:form", active: false },
  };
  const saved = await patchCharacter({ ...options, expectedRevision: 4, patch: { "builder.traitChoices": traitChoices, "builder.traitActivations": traitActivations } });
  assert.equal(saved.revision, 5);
  const reloaded = await readCharacter(options);
  assert.equal(reloaded.migrated, false);
  assert.deepEqual(reloaded.migration.appliedVersions, []);
  assert.deepEqual(reloaded.character, { ...loaded.character, builder: { ...loaded.character.builder, traitChoices, traitActivations } });
  assert.equal(reloaded.metadata.createdAt, original.createdAt);
  await assert.rejects(patchCharacter({ ...options, expectedRevision: 4, patch: { "builder.traitChoices": {} } }), (error) => error instanceof CharacterConflictError);
  assert.deepEqual((await readCharacter(options)).character, reloaded.character);
});

test("Celestial Knight absorption is read-only and persists exactly once on explicit save", async () => {
  const references = createCharacterMigrationReferences(contentMigrationGameData());
  for (const version of [4, 6]) {
    const original = historicalCelestialKnight(version, "Targeting");
    original.ownerUid = ALICE_UID;
    Object.assign(original, { revision: 2, createdAt: "original-created", updatedAt: "original-updated" });
    const characterId = `celestial-v${version}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", ALICE_UID, "characters", characterId), original);
    });
    const firestore = aliceFirestore();
    const options = { ownerUid: ALICE_UID, characterId, references, firestore, firestoreApi };
    const ref = doc(firestore, "users", ALICE_UID, "characters", characterId);
    const loaded = await readCharacter(options);
    assert.equal(loaded.migrated, true);
    assert.deepEqual(loaded.character.builder.selectedFeatOptions, []);
    assert.deepEqual((await getDoc(ref)).data(), original, "opening must never write");
    const saved = await replaceCharacter({ ...options, character: loaded.character, expectedRevision: 2 });
    assert.equal(saved.revision, 3);
    const reloaded = await readCharacter(options);
    assert.equal(reloaded.migrated, false);
    assert.deepEqual(reloaded.character, loaded.character);
    assert.equal(reloaded.metadata.createdAt, original.createdAt);
    await assert.rejects(replaceCharacter({ ...options, character: loaded.character, expectedRevision: 2 }), (error) => error instanceof CharacterConflictError);
    assert.equal((await getDoc(ref)).data().revision, 3);
  }
});

test("retired Metamorph gives an actionable rebuild message and neither read nor patch changes the original", async () => {
  const original = historicalCelestialKnight(4);
  original.ownerUid = ALICE_UID;
  original.builder.classKey = "metamorph";
  original.builder.selectedFeatOptions = [];
  original.builder.selectedFeats = [];
  original.builder.selectedClassFeatureOptions = ["metamorph|L1|Metamorphic Transformations::Elemental Form"];
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", ALICE_UID, "characters", "old-metamorph"), original);
  });
  const firestore = aliceFirestore();
  const options = { ownerUid: ALICE_UID, characterId: "old-metamorph", references: createCharacterMigrationReferences(contentMigrationGameData()), firestore, firestoreApi };
  await assert.rejects(readCharacter(options), (error) => error.code === "character-rebuild-required" && /rebuilt as a new character/.test(error.message));
  await assert.rejects(patchCharacter({ ...options, expectedRevision: 0, patch: { "builder.name": "Do not overwrite" } }), (error) => error.diagnostics.some((item) => item.code === "character-rebuild-required"));
  assert.deepEqual((await getDoc(doc(firestore, "users", ALICE_UID, "characters", "old-metamorph"))).data(), original);
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
