import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCharacter, encodeCharacter, validateCharacter } from "../public/js/core/character-codec.js";
import { SetTraitChoice, RemoveTraitChoice, SetTraitActivation, RemoveTraitActivation, applyCharacterCommand, decodeCharacterCommand } from "../public/js/core/character-commands.js";
import { createCharacterMigrationReferences, migrateCharacterDocument } from "../public/js/core/character-migrations.js";
import { applyCharacterPatch, decodeStoredCharacter, encodeStoredCharacter, isAllowedCharacterPatchPath } from "../public/js/core/character-persistence.js";
import { MIGRATION_GAME_DATA, makeV4Character, makeV5Character } from "./fixtures/character-schemas.mjs";

const choice = (overrides = {}) => ({ choiceId: "trait-choice:adaptation:1", sourceId: "origin-feature:adaptation", recipientId: "character", traitKey: "wings", ...overrides });
const activation = (overrides = {}) => ({ activationId: "trait-activation:transformation", sourceId: "class-feature:transformation", active: true, ...overrides });
const fresh = () => createDefaultCharacter({ ownerUid: "synthetic-user" });

test("schema 6 stores exact owned Trait choices and activations without derived mechanics", () => {
  const character = fresh();
  const second = fresh();
  character.builder.traitChoices[choice().choiceId] = choice();
  character.builder.traitActivations[activation().activationId] = activation();
  const encoded = encodeCharacter(character);
  assert.equal(encoded.ok, true, JSON.stringify(encoded.diagnostics));
  assert.deepEqual(encoded.value, character);
  assert.notEqual(encoded.value.builder.traitChoices[choice().choiceId], character.builder.traitChoices[choice().choiceId]);
  assert.deepEqual(second.builder.traitChoices, {});
  assert.deepEqual(second.builder.traitActivations, {});
  for (const mutate of [
    (value) => { delete value.builder.traitChoices; },
    (value) => { value.builder.traitChoices[choice().choiceId].choiceId = "another-id"; },
    (value) => { value.builder.traitChoices[choice().choiceId].sourceId = ""; },
    (value) => { value.builder.traitChoices[choice().choiceId].recipientId = ""; },
    (value) => { value.builder.traitChoices[choice().choiceId].traitKey = "Wings"; },
    (value) => { value.builder.traitChoices[choice().choiceId].rank = 2; },
    (value) => { value.builder.traitActivations[activation().activationId].activationId = "other"; },
    (value) => { value.builder.traitActivations[activation().activationId].sourceId = ""; },
    (value) => { value.builder.traitActivations[activation().activationId].active = "true"; },
    (value) => { value.builder.traitActivations[activation().activationId].expiresAt = 10; },
  ]) {
    const malformed = structuredClone(character);
    mutate(malformed);
    assert.equal(validateCharacter(malformed).ok, false);
  }
  character.builder.traitChoices = Object.fromEntries(Array.from({ length: 101 }, (_, index) => {
    const item = choice({ choiceId: `trait-choice:${index}` });
    return [item.choiceId, item];
  }));
  assert(validateCharacter(character).diagnostics.some((item) => item.code === "too-many-items"));
});

test("Trait commands change one answer and preserve immutable source and recipient identities", () => {
  const original = fresh();
  const selected = applyCharacterCommand(original, SetTraitChoice(choice()));
  const other = choice({ choiceId: "trait-choice:other:1", sourceId: "class-feature:other", recipientId: "familiar:known-instance" });
  const two = applyCharacterCommand(selected, SetTraitChoice(other));
  const changed = applyCharacterCommand(two, SetTraitChoice(choice({ traitKey: "climber" })));
  assert.deepEqual(changed.builder.traitChoices[other.choiceId], other);
  assert.equal(changed.builder.traitChoices[choice().choiceId].traitKey, "climber");
  assert.deepEqual(original.builder.traitChoices, {});
  assert.deepEqual(selected.builder.traitChoices[choice().choiceId], choice());
  for (const altered of [choice({ sourceId: "origin-feature:other" }), choice({ recipientId: "familiar:other" })]) {
    assert.throws(() => applyCharacterCommand(selected, SetTraitChoice(altered)), (error) => error.code === "stale-character-command");
  }
  const removed = applyCharacterCommand(changed, RemoveTraitChoice(choice().choiceId));
  assert.deepEqual(removed.builder.traitChoices, { [other.choiceId]: other });
  assert.throws(() => applyCharacterCommand(removed, RemoveTraitChoice(choice().choiceId)), (error) => error.code === "stale-character-command");
  assert.throws(() => SetTraitChoice(choice({ traitKey: "" })), (error) => error.code === "invalid-character-command");
  assert.throws(() => SetTraitChoice({ ...choice(), rank: 2 }), (error) => error.code === "invalid-character-command");
});

test("Trait activation commands toggle one source-owned record and reject owner rebinding", () => {
  const original = fresh();
  const active = applyCharacterCommand(original, SetTraitActivation(activation()));
  const inactive = applyCharacterCommand(active, SetTraitActivation(activation({ active: false })));
  assert.equal(active.builder.traitActivations[activation().activationId].active, true);
  assert.equal(inactive.builder.traitActivations[activation().activationId].active, false);
  assert.deepEqual(original.builder.traitActivations, {});
  assert.throws(() => applyCharacterCommand(active, SetTraitActivation(activation({ sourceId: "class-feature:other" }))), (error) => error.code === "stale-character-command");
  assert.deepEqual(applyCharacterCommand(inactive, RemoveTraitActivation(activation().activationId)).builder.traitActivations, {});
  assert.throws(() => applyCharacterCommand(original, RemoveTraitActivation(activation().activationId)), (error) => error.code === "stale-character-command");
  for (const command of [
    { type: "SetTraitActivation", ...activation({ active: "true" }) },
    { type: "SetTraitActivation", ...activation({ sourceId: "" }) },
    { type: "RemoveTraitActivation", activationId: "invalid id" },
    { type: "RemoveTraitChoice", choiceId: "" },
  ]) assert.throws(() => decodeCharacterCommand(command), (error) => error.code === "invalid-character-command");
});

test("v5 migration preserves every value and metadata while adding only empty Trait maps", () => {
  const old = makeV5Character();
  old.builder.sheet.fields.notes = "Synthetic authored notes\nwith formatting.";
  const original = structuredClone(old);
  const stored = { ...old, revision: 7, createdAt: "created", updatedAt: "updated", lastVisitedAt: "visited" };
  const migrated = migrateCharacterDocument(stored);
  assert.equal(migrated.ok, true, JSON.stringify(migrated.diagnostics));
  assert.deepEqual(migrated.appliedVersions, [{ fromVersion: 5, toVersion: 6 }]);
  assert.deepEqual(migrated.value, { ...old, schemaVersion: 6, builder: { ...old.builder, traitChoices: {}, traitActivations: {} } });
  assert.deepEqual(migrated.metadata, { revision: 7, createdAt: "created", updatedAt: "updated", lastVisitedAt: "visited" });
  assert.deepEqual(old, original);
  const again = migrateCharacterDocument(migrated.value);
  assert.equal(again.ok, true);
  assert.deepEqual(again.appliedVersions, []);
  assert.deepEqual(again.value, migrated.value);
});

test("legacy versions cannot smuggle Trait state into a lossy migration", () => {
  const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);
  for (const make of [makeV4Character, makeV5Character]) {
    for (const key of ["traitChoices", "traitActivations"]) {
      const old = make();
      old.builder[key] = key === "traitChoices" ? { [choice().choiceId]: choice() } : { [activation().activationId]: activation() };
      const original = structuredClone(old);
      const result = migrateCharacterDocument(old, { references });
      assert.equal(result.ok, false);
      assert.equal(result.value, null);
      assert(result.diagnostics.some((item) => item.code === "unknown-legacy-field" && item.path === `character.builder.${key}`));
      assert.deepEqual(old, original);
    }
  }
  const malformed = makeV5Character();
  delete malformed.builder.weapons;
  assert.equal(migrateCharacterDocument(malformed).ok, false, "v5 omissions are not defaulted as legacy v4 fields");
});

test("Trait state is builder-owned and survives the complete persistence envelope", () => {
  const character = applyCharacterCommand(applyCharacterCommand(fresh(), SetTraitChoice(choice())), SetTraitActivation(activation()));
  for (const field of ["traitChoices", "traitActivations"]) {
    const path = `builder.${field}`;
    assert.equal(isAllowedCharacterPatchPath(path), true);
    assert.equal(isAllowedCharacterPatchPath(path, { scope: "sheet" }), false);
    assert.equal(applyCharacterPatch(character, { [path]: {} }, { scope: "sheet" }).ok, false);
  }
  const encoded = encodeStoredCharacter(character, { revision: 4, createdAt: "created", updatedAt: "updated", lastVisitedAt: "visited" });
  assert.equal(encoded.ok, true);
  const decoded = decodeStoredCharacter(encoded.value, { expectedOwnerUid: character.ownerUid });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.migrated, false);
  assert.deepEqual(decoded.character, character);
  assert.equal(decoded.revision, 4);
});
