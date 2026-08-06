import assert from "node:assert/strict";
import test from "node:test";

import {
  CHARACTER_SCHEMA_VERSION,
  CharacterCodecError,
  assertCanonicalCharacter,
  createDefaultCharacter,
  decodeCharacter,
  encodeCharacter,
  validateCharacter,
} from "../public/js/core/character-codec.js";

function diagnosticAt(result, code, path) {
  return result.diagnostics.some((item) => item.code === code && item.path === path);
}

function makePopulatedCharacter() {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.name = "Kiko";
  character.builder.level = 3;
  character.builder.classKey = "ninja";
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.agility = 2;
  character.builder.originKey = "urban-shadow";
  character.builder.selectedClassFeatureOptions = ["ninja-path-shadow"];
  character.builder.selectedClassUtilitySkills = ["stealth"];
  character.builder.selectedFeats = ["trained-senses"];
  character.builder.selectedFeatOptions = ["trained-senses-observation"];
  character.builder.grantedCoreSkillSnapshot = ["stealth"];
  character.builder.grantedSkillSnapshot = ["setting-skill-city-lore"];
  character.builder.bonds = [{
    bondId: "bond:mentor",
    name: "My old mentor",
    rank: "2",
    keystone: "I never abandon someone who asks for help.",
  }];
  character.builder.backgroundKeystones = ["The city always leaves a trail."];
  character.builder.weapons = [{
    id: "weapon:starter-blade",
    choiceId: "starter-weapon",
    sourceChoiceId: "",
    generated: false,
    weaponKey: "short-blade",
    rank: 1,
    customName: "Moon Knife",
    enhancements: [{
      id: "enhancement:keen",
      enhancementKey: "keen",
      rank: 1,
      selections: { damage_type: "slashing" },
      granted: false,
    }],
  }];
  character.builder.grantChoices = {
    "choice:feat-technique": {
      choiceId: "choice:feat-technique",
      type: "technique",
      sourceId: "feat:trained-senses",
      sourceLabel: "Trained Senses",
      value: "",
      techniqueKey: "stalk-prey",
      skillKey: "",
      weaponKey: "",
      rank: 0,
      customName: "",
      enhancements: [],
      tags: ["utility"],
    },
  };
  character.builder.resources = {
    charms: {
      resourceKey: "charms",
      name: "Charms",
      capacity: 3,
      current: 2,
    },
  };
  character.builder.visitedSteps = ["basics", "class"];
  character.builder.selectedTechniques = ["stalk-prey"];
  character.builder.sheet.fields.rank_stealth = "2";
  character.builder.sheet.fields.hpcur = "14";
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Martial Arts", rank: "1" }];
  character.builder.sheet.repeatables.settingSkills = [{ skill: "City Lore", rank: "2" }];
  character.builder.sheet.repeatables.abilities = [{
    abilityId: "ability:shadow-step",
    sourceId: "technique:shadow-step",
    name: "Shadow Step",
    text: "Move between nearby shadows.",
  }];
  character.builder.sheet.repeatables.conditions = [{
    name: "Hidden",
    n: "1",
    notes: "Until revealed.",
  }];
  return character;
}

test("v5 defaults are complete, exact, valid, and independently allocated", () => {
  const first = createDefaultCharacter({ ownerUid: "user_123" });
  const second = createDefaultCharacter({ ownerUid: "user_123" });

  assert.equal(first.schemaVersion, CHARACTER_SCHEMA_VERSION);
  assert.equal(first.schemaVersion, 5);
  assert.equal(first.ownerUid, "user_123");
  assert.deepEqual(first.builder.attributes, {
    strength: 0,
    agility: 0,
    intellect: 0,
    willpower: 0,
    attunement: 0,
    heart: 0,
  });
  assert.deepEqual(first.builder.resources, {});
  assert.equal("createdAt" in first, false);
  assert.equal("updatedAt" in first, false);
  assert.equal("lastVisitedAt" in first.builder, false);
  assert.equal(validateCharacter(first).ok, true);

  first.builder.attributes.agility = 1;
  first.builder.sheet.repeatables.conditions.push({ name: "Test", n: "", notes: "" });
  assert.equal(second.builder.attributes.agility, 0);
  assert.deepEqual(second.builder.sheet.repeatables.conditions, []);
});

test("v5 codec round-trips a populated canonical character without sharing references", () => {
  const character = makePopulatedCharacter();
  const encoded = encodeCharacter(character);
  const decoded = decodeCharacter(character);

  assert.equal(encoded.ok, true);
  assert.equal(decoded.ok, true);
  assert.deepEqual(encoded.value, character);
  assert.deepEqual(decoded.value, character);
  assert.notEqual(decoded.value, character);
  assert.notEqual(decoded.value.builder, character.builder);
  assert.notEqual(decoded.value.builder.sheet.fields, character.builder.sheet.fields);

  decoded.value.builder.name = "Changed clone";
  assert.equal(character.builder.name, "Kiko");
});

test("pre-v5 documents must be migrated before decoding", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.schemaVersion = 4;

  const result = decodeCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(result.value, null);
  assert.equal(diagnosticAt(result, "unsupported-schema-version", "character.schemaVersion"), true);
});

test("persistence timestamps and visit timestamps are outside canonical character state", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.createdAt = "repository-metadata";
  character.updatedAt = "repository-metadata";
  character.builder.lastVisitedAt = "repository-metadata";

  const result = validateCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(diagnosticAt(result, "unknown-field", "character.createdAt"), true);
  assert.equal(diagnosticAt(result, "unknown-field", "character.updatedAt"), true);
  assert.equal(diagnosticAt(result, "unknown-field", "character.builder.lastVisitedAt"), true);
});

test("missing, unknown, and nested unknown fields are rejected at exact paths", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  delete character.builder.resources;
  character.builder.surprise = true;
  character.builder.sheet.fields.rank_spellcasting = "4";
  character.builder.sheet.repeatables.conditions.push({
    name: "Burning",
    n: "2",
    notes: "",
    expiresAt: "later",
  });

  const result = validateCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(diagnosticAt(result, "missing-field", "character.builder.resources"), true);
  assert.equal(diagnosticAt(result, "unknown-field", "character.builder.surprise"), true);
  assert.equal(diagnosticAt(result, "unknown-field", "character.builder.sheet.fields.rank_spellcasting"), true);
  assert.equal(
    diagnosticAt(result, "unknown-field", "character.builder.sheet.repeatables.conditions[0].expiresAt"),
    true,
  );
});

test("malformed stable references and duplicate selections are reported without coercion", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.selectedFeats = ["Pretty Feat", "Pretty Feat"];

  const result = validateCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(diagnosticAt(result, "invalid-stable-key", "character.builder.selectedFeats[0]"), true);
  assert.equal(diagnosticAt(result, "duplicate-identity", "character.builder.selectedFeats[1]"), true);
});

test("cross-field invariants reject impossible resource, attribute, and ownership state", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.attributes.strength = 99;
  character.builder.resources.charms = {
    resourceKey: "charms",
    name: "Charms",
    capacity: 2,
    current: 3,
  };
  character.builder.weapons.push({
    id: "weapon:generated",
    choiceId: "",
    sourceChoiceId: "",
    generated: true,
    weaponKey: "short-blade",
    rank: 1,
    customName: "",
    enhancements: [],
  });

  const result = validateCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(diagnosticAt(result, "out-of-range", "character.builder.attributes.strength"), true);
  assert.equal(diagnosticAt(result, "out-of-range", "character.builder.resources.charms.current"), true);
  assert.equal(diagnosticAt(result, "missing-source-owner", "character.builder.weapons[0].sourceChoiceId"), true);
});

test("grant and map identities must agree", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.grantChoices = {
    "choice:expected": {
      choiceId: "choice:different",
      type: "skill",
      sourceId: "feature:training",
      sourceLabel: "Training",
      value: "",
      techniqueKey: "",
      skillKey: "athletics",
      weaponKey: "",
      rank: 1,
      customName: "",
      enhancements: [],
      tags: [],
    },
  };

  const result = validateCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(
    diagnosticAt(result, "identity-mismatch", "character.builder.grantChoices.choice:expected.choiceId"),
    true,
  );
});

test("malformed nested values return diagnostics instead of throwing", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.sheet.repeatables.combatSkillsExtra = [{ rank: "2" }];
  character.builder.sheet.repeatables.abilities = [null];
  character.builder.resources = { charms: null };

  assert.doesNotThrow(() => validateCharacter(character));
  const result = validateCharacter(character);
  assert.equal(result.ok, false);
  assert.equal(diagnosticAt(result, "missing-field", "character.builder.sheet.repeatables.combatSkillsExtra[0].skill"), true);
  assert.equal(diagnosticAt(result, "invalid-type", "character.builder.sheet.repeatables.abilities[0]"), true);
  assert.equal(diagnosticAt(result, "invalid-type", "character.builder.resources.charms"), true);
});

test("assertion and default construction fail with structured codec diagnostics", () => {
  assert.throws(
    () => createDefaultCharacter({ ownerUid: "  invalid owner  " }),
    (error) => error instanceof CharacterCodecError
      && error.diagnostics.some((item) => item.code === "noncanonical-value"),
  );

  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.level = "3";
  assert.throws(
    () => assertCanonicalCharacter(character),
    (error) => error instanceof CharacterCodecError
      && error.diagnostics.some((item) => item.path === "character.builder.level"),
  );
});
