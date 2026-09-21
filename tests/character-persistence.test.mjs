import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { createCharacterMigrationReferences } from "../public/js/core/character-migrations.js";
import {
  CharacterConflictError,
  INITIAL_CHARACTER_REVISION,
  applyCharacterPatch,
  assertPersistenceResult,
  checkCharacterRevision,
  createStoredCharacter,
  decodeStoredCharacter,
  encodeStoredCharacter,
  isAllowedCharacterPatchPath,
  planCharacterReplacement,
  requireCharacterIdentity,
  validateCharacterRevision,
} from "../public/js/core/character-persistence.js";
import {
  MIGRATION_GAME_DATA,
  makeV4Character,
} from "./fixtures/character-schemas.mjs";

const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);

function hasDiagnostic(result, code, path = "") {
  return result.diagnostics.some((item) => item.code === code && (!path || item.path === path));
}

test("stored legacy characters migrate in memory with revision zero and no input mutation", () => {
  const legacy = makeV4Character();
  const original = structuredClone(legacy);
  const result = decodeStoredCharacter(legacy, { references, expectedOwnerUid: "user_123" });

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.equal(result.character.schemaVersion, 6);
  assert.equal(result.revision, 0);
  assert.equal(result.migrated, true);
  assert.equal(result.metadata.createdAt, "created-at");
  assert.deepEqual(legacy, original);
});

test("current stored v6 envelopes decode with separate metadata", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const stored = {
    ...character,
    revision: 7,
    createdAt: "created-at",
    updatedAt: "updated-at",
  };
  const result = decodeStoredCharacter(stored, { references, expectedOwnerUid: "user_123" });

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(result.character, character);
  assert.equal(result.revision, 7);
  assert.equal(result.migrated, false);
  assert.equal("revision" in result.character, false);
});

test("invalid revisions and owner-path mismatches fail explicitly", () => {
  assert.equal(validateCharacterRevision(undefined).value, 0);
  assert.equal(validateCharacterRevision(3).value, 3);
  assert.equal(validateCharacterRevision(-1).ok, false);
  assert.equal(validateCharacterRevision("3").ok, false);

  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const invalidRevision = decodeStoredCharacter({ ...character, revision: "3" }, { references });
  assert.equal(invalidRevision.ok, false);
  assert.equal(hasDiagnostic(invalidRevision, "invalid-character-revision", "metadata.revision"), true);

  const wrongOwner = decodeStoredCharacter({ ...character, revision: 1 }, {
    references,
    expectedOwnerUid: "other_user",
  });
  assert.equal(wrongOwner.ok, false);
  assert.equal(hasDiagnostic(wrongOwner, "character-owner-mismatch", "character.ownerUid"), true);
});

test("new and saved persistence envelopes are exact v6 plus repository metadata", () => {
  const created = createStoredCharacter({
    ownerUid: "user_123",
    createdAt: "created-at",
    updatedAt: "updated-at",
  });
  assert.equal(created.ok, true, JSON.stringify(created.diagnostics, null, 2));
  assert.equal(created.revision, INITIAL_CHARACTER_REVISION);
  assert.equal(created.value.schemaVersion, 6);
  assert.equal(created.value.revision, 1);
  assert.equal(created.value.lastVisitedAt, null);

  created.character.builder.name = "Kiko";
  const saved = encodeStoredCharacter(created.character, {
    revision: 2,
    createdAt: "created-at",
    updatedAt: "later",
  });
  assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics, null, 2));
  assert.equal(saved.value.builder.name, "Kiko");
  assert.equal(saved.value.revision, 2);
  assert.equal(saved.value.createdAt, "created-at");
  assert.equal(saved.value.updatedAt, "later");
});

test("builder patches accept only explicit canonical paths and never sanitize invalid values", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const valid = applyCharacterPatch(character, {
    "builder.name": "Kiko",
    "builder.level": 2,
  });
  assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics, null, 2));
  assert.equal(valid.value.builder.name, "Kiko");
  assert.equal(valid.value.builder.level, 2);

  const arbitrary = applyCharacterPatch(character, {
    "builder.surprise": true,
    schemaVersion: 99,
  });
  assert.equal(arbitrary.ok, false);
  assert.equal(hasDiagnostic(arbitrary, "unsupported-character-write-path", "patch.builder.surprise"), true);
  assert.equal(hasDiagnostic(arbitrary, "unsupported-character-write-path", "patch.schemaVersion"), true);

  const malformed = applyCharacterPatch(character, { "builder.level": "2" });
  assert.equal(malformed.ok, false);
  assert.equal(hasDiagnostic(malformed, "invalid-type", "character.builder.level"), true);
});

test("sheet patches own only temporary play-state leaves", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  assert.equal(isAllowedCharacterPatchPath("builder.sheet.fields.hpcur", { scope: "sheet" }), true);
  assert.equal(isAllowedCharacterPatchPath("builder.sheet.repeatables.conditions", { scope: "sheet" }), true);
  assert.equal(isAllowedCharacterPatchPath("builder.sheet.fields.rank_stealth", { scope: "sheet" }), false);

  const valid = applyCharacterPatch(character, {
    "builder.sheet.fields.hpcur": "12",
    "builder.sheet.repeatables.conditions": [{ name: "Hidden", n: "1", notes: "" }],
  }, { scope: "sheet" });
  assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics, null, 2));
  assert.equal(valid.value.builder.sheet.fields.hpcur, "12");

  const builderOwned = applyCharacterPatch(character, {
    "builder.name": "Not sheet-owned",
  }, { scope: "sheet" });
  assert.equal(builderOwned.ok, false);
  assert.equal(hasDiagnostic(builderOwned, "unsupported-character-write-path", "patch.builder.name"), true);
});

test("revision planning accepts the reviewed value, increments once, and preserves createdAt", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.name = "Kiko";
  const raw = {
    ...createDefaultCharacter({ ownerUid: "user_123" }),
    revision: 4,
    createdAt: "original-created-at",
    updatedAt: "old-updated-at",
    lastVisitedAt: "visited-at",
  };
  const plan = planCharacterReplacement(raw, character, {
    expectedRevision: 4,
    expectedOwnerUid: "user_123",
    createdAt: "replacement-created-at",
    updatedAt: "new-updated-at",
  });
  assert.equal(plan.ok, true, JSON.stringify(plan.diagnostics, null, 2));
  assert.equal(plan.previousRevision, 4);
  assert.equal(plan.revision, 5);
  assert.equal(plan.value.createdAt, "original-created-at");
  assert.equal(plan.value.updatedAt, "new-updated-at");
  assert.equal(plan.value.lastVisitedAt, "visited-at");
  assert.equal(plan.value.builder.name, "Kiko");
});

test("replacement planning rejects owner/path mismatches", () => {
  const raw = {
    ...createDefaultCharacter({ ownerUid: "user_123" }),
    revision: 1,
  };
  const wrongOwner = createDefaultCharacter({ ownerUid: "other_user" });
  const plan = planCharacterReplacement(raw, wrongOwner, {
    expectedRevision: 1,
    expectedOwnerUid: "user_123",
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.value, null);
  assert.equal(hasDiagnostic(plan, "character-owner-mismatch", "character.ownerUid"), true);
});

test("stale revisions produce a typed conflict without a write value", () => {
  const raw = {
    ...createDefaultCharacter({ ownerUid: "user_123" }),
    revision: 8,
  };
  const check = checkCharacterRevision(raw, 7);
  assert.equal(check.ok, false);
  assert.equal(check.expectedRevision, 7);
  assert.equal(check.actualRevision, 8);
  assert.equal(hasDiagnostic(check, "character-revision-conflict", "metadata.revision"), true);

  const plan = planCharacterReplacement(raw, createDefaultCharacter({ ownerUid: "user_123" }), {
    expectedRevision: 7,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.value, null);
  assert.throws(
    () => assertPersistenceResult(plan, "save-failed", "Save failed."),
    (error) => {
      assert.equal(error instanceof CharacterConflictError, true);
      assert.equal(error.expectedRevision, 7);
      assert.equal(error.actualRevision, 8);
      return true;
    },
  );
});

test("Firestore character identities reject empty and path-bearing values", () => {
  assert.equal(requireCharacterIdentity(" character-1 ", "characterId"), "character-1");
  assert.throws(() => requireCharacterIdentity("", "characterId"), /characterId/);
  assert.throws(() => requireCharacterIdentity("nested/id", "characterId"), /characterId/);
  assert.throws(() => requireCharacterIdentity(123, "characterId"), /characterId/);
});

test("pure persistence contract imports no Firebase, DOM, file, or network dependency", async () => {
  const source = await readFile(new URL("../public/js/core/character-persistence.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /firebase|document\.|window\.|localStorage|sessionStorage|fetch\(|node:fs|node:http|node:https/i);
});
