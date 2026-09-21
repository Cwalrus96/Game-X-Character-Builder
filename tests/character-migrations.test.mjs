import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateCharacter } from "../public/js/core/character-codec.js";
import {
  CHARACTER_MIGRATION_STEPS,
  CharacterMigrations,
  createCharacterMigrationReferences,
  migrateCharacterDocument,
} from "../public/js/core/character-migrations.js";
import {
  MIGRATION_GAME_DATA,
  makeUnversionedCharacter,
  makeV1Character,
  makeV3Character,
  makeV4Character,
  makeV5Character,
  makeObservedLegacyV4Character,
} from "./fixtures/character-schemas.mjs";

const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);

function hasDiagnostic(result, code, path) {
  return result.diagnostics.some((item) => item.code === code && (!path || item.path === path));
}

test("registry records only evidence-backed historical migration edges", () => {
  assert.deepEqual(
    CHARACTER_MIGRATION_STEPS.map(({ fromVersion, toVersion }) => `${fromVersion}->${toVersion}`),
    ["0->1", "1->3", "3->4", "4->5"],
  );
  assert.deepEqual(CharacterMigrations.supportedVersions, [0, 1, 3, 4, 5]);
  assert.equal(Object.isFrozen(CHARACTER_MIGRATION_STEPS), true);
});

test("every observed historical fixture reaches the exact v5 codec", () => {
  const cases = [
    [makeUnversionedCharacter(), 0, ["0->1", "1->3", "3->4", "4->5"]],
    [makeV1Character(), 1, ["1->3", "3->4", "4->5"]],
    [makeV3Character(), 3, ["3->4", "4->5"]],
    [makeV4Character(), 4, ["4->5"]],
  ];

  for (const [fixture, expectedVersion, expectedEdges] of cases) {
    const original = structuredClone(fixture);
    const result = migrateCharacterDocument(fixture, { references });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
    assert.equal(result.fromVersion, expectedVersion);
    assert.deepEqual(
      result.appliedVersions.map(({ fromVersion, toVersion }) => `${fromVersion}->${toVersion}`),
      expectedEdges,
    );
    assert.equal(result.value.schemaVersion, 5);
    assert.equal(validateCharacter(result.value).ok, true);
    assert.deepEqual(fixture, original, "migration must not mutate input");
  }
});

test("v1 base attributes restore the primary bonus and legacy selections become stable keys", () => {
  const result = migrateCharacterDocument(makeV1Character(), { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.equal(result.value.builder.attributes.agility, 2);
  assert.deepEqual(result.value.builder.selectedClassFeatureOptions, ["shadow-step"]);
  assert.deepEqual(result.value.builder.selectedFeats, ["trained-senses"]);
  assert.equal(result.value.builder.bonds[0].bondId.startsWith("legacy-bond:"), true);
  assert.equal(result.value.builder.sheet.repeatables.abilities[0].abilityId.startsWith("legacy-ability:"), true);
});

test("deployed v4 account imports preserve repeated abilities and remap legacy Dazzling Wand ownership", () => {
  const fixture = makeV4Character();
  fixture.migratedAt = "account-imported-at";
  fixture.migratedFromUid = "previous-user-id";
  fixture.builder.classKey = "magical-guardian";
  fixture.builder.primaryAttribute = "attunement";
  fixture.builder.selectedClassFeatureOptions = ["magical-guardian|L1|Guardian Accessory::Dazzling Wand"];
  fixture.builder.autoAbilityNames = [
    "Class Feature - Magical Guardian Feat",
    "Class Feature - Magical Guardian Feat",
    "Class Feature - Dazzling Wand",
  ];
  fixture.builder.sheet.repeatables.abilities = [
    { name: "Class Feature - Magical Guardian Feat", text: "First feat selection." },
    { name: "Class Feature - Magical Guardian Feat", text: "Second feat selection." },
  ];
  const legacyChoiceId = "Dazzling Wand:technique-choice:spellcasting:0";
  fixture.builder.grantChoices = {
    [legacyChoiceId]: {
      choiceId: legacyChoiceId,
      sourceId: "choice:builder.selectedClassFeatureOptions:magical-guardian|L1|Guardian Accessory::Dazzling Wand",
      sourceLabel: "Dazzling Wand",
      type: "technique",
      techniqueName: "Prismatic Burst",
      skill: "spellcasting",
    },
  };
  const original = structuredClone(fixture);

  const result = migrateCharacterDocument(fixture, { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(fixture, original, "migration must not mutate account-imported v4 input");
  assert.deepEqual(result.value.builder.selectedClassFeatureOptions, ["dazzling-wand"]);
  assert.deepEqual(result.value.builder.autoAbilityNames, [
    "Class Feature - Magical Guardian Feat",
    "Class Feature - Dazzling Wand",
  ]);
  assert.equal(result.value.builder.sheet.repeatables.abilities.length, 2);
  assert.notEqual(
    result.value.builder.sheet.repeatables.abilities[0].abilityId,
    result.value.builder.sheet.repeatables.abilities[1].abilityId,
  );
  const canonicalChoiceId = "dazzling-wand:technique-choice:spellcasting:0";
  assert.deepEqual(Object.keys(result.value.builder.grantChoices), [canonicalChoiceId]);
  assert.equal(result.value.builder.grantChoices[canonicalChoiceId].choiceId, canonicalChoiceId);
  assert.equal(
    result.value.builder.grantChoices[canonicalChoiceId].sourceId,
    "class-option:magical-guardian:dazzling-wand",
  );
  assert.equal(result.value.builder.grantChoices[canonicalChoiceId].techniqueKey, "prismatic-burst");
  assert(result.report.some((item) => item.kind === "removed" && item.path === "character.migratedAt"));
  assert(result.report.some((item) => item.kind === "removed" && item.path === "character.migratedFromUid"));
});

test("metadata is preserved outside canonical state", () => {
  const result = migrateCharacterDocument(makeV3Character(), { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(result.metadata, {
    createdAt: "created-at",
    updatedAt: "updated-at",
    revision: null,
    lastVisitedAt: "visited-at",
  });
  assert.equal("createdAt" in result.value, false);
  assert.equal("updatedAt" in result.value, false);
  assert.equal("lastVisitedAt" in result.value.builder, false);
});

test("historical skill field IDs and reviewed name-only skill grants resolve without accepting unknown skills", () => {
  const data = structuredClone(MIGRATION_GAME_DATA);
  data.classFeatures["magical-guardian"].push({
    type: "feature", featureKey: "elemental-training", name: "Elemental Training",
    grants: [{ type: "skill", name: "Elementalism", rank: 1 }],
  });
  const fixture = makeV4Character();
  fixture.builder.grantedCoreSkillSnapshot = ["rank_athletics", "rank_medicine", "rank_physdef"];
  fixture.builder.grantedSkillSnapshot = ["Elementalism"];
  const refs = createCharacterMigrationReferences(data);
  const result = migrateCharacterDocument(fixture, { references: refs });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.value.builder.grantedCoreSkillSnapshot, ["athletics", "medicine", "physdef"]);
  assert.deepEqual(result.value.builder.grantedSkillSnapshot, ["elementalism"]);
  fixture.builder.grantedCoreSkillSnapshot.push("rank_unknown");
  const unknown = migrateCharacterDocument(fixture, { references: refs });
  assert.equal(hasDiagnostic(unknown, "unresolved-reference", "character.builder.grantedCoreSkillSnapshot[3]"), true);
});

test("legacy feat composites resolve class and level from reviewed prerequisites, retaining ambiguity errors", () => {
  const data = structuredClone(MIGRATION_GAME_DATA);
  data.feats.push({
    featKey: "guardian-training", category: "magical-guardian", name: "Guardian Training", type: "optionGroup",
    prerequisites: [{ type: "class", key: "magical-guardian", level: 2 }],
    options: [{ featKey: "guardian-melee", name: "Melee Weapons", type: "option", grants: [] }],
  });
  const fixture = makeV4Character();
  fixture.builder.selectedFeats = ["feat:magical-guardian:2:Guardian Training"];
  fixture.builder.selectedFeatOptions = ["magical-guardian|L2|Guardian Training::Melee Weapons"];
  const result = migrateCharacterDocument(fixture, { references: createCharacterMigrationReferences(data) });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.value.builder.selectedFeats, ["guardian-training"]);
  assert.deepEqual(result.value.builder.selectedFeatOptions, ["guardian-melee"]);
  data.feats.push({ ...data.feats.at(-1), featKey: "other-training", options: [{ featKey: "other-melee", name: "Melee Weapons" }] });
  const ambiguous = migrateCharacterDocument(fixture, { references: createCharacterMigrationReferences(data) });
  assert.equal(hasDiagnostic(ambiguous, "ambiguous-reference", "character.builder.selectedFeatOptions[0]"), true);
});

test("merged v4 aliases do not resurrect stale selections and missing automatic choice ownership is recovered", () => {
  const fixture = makeObservedLegacyV4Character();
  const original = structuredClone(fixture);
  const result = migrateCharacterDocument(fixture, { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(fixture, original);
  assert.deepEqual(result.value.builder.selectedFeats, []);
  assert.deepEqual(result.value.builder.selectedClassFeatureOptions, []);
  const answer = result.value.builder.grantChoices["soulbound-weapon"];
  assert.equal(answer.sourceId, "class-feature:weapon-master:soulbound-weapon");
  assert.equal(answer.weaponKey, "short-blade");
  assert.equal(answer.customName, "Practice weapon");
  assert.equal(answer.enhancements[0].id, "enhancement:bound");
  assert.equal(result.value.builder.weapons[0].id, "weapon:owned-practice");
  assert.equal(result.value.builder.weapons[0].sourceChoiceId, answer.choiceId);
  assert.equal(result.metadata.updatedAt, fixture.updatedAt);
  for (const key of ["selectedFeatIds", "classFeatureChoices", "updatedAt"]) {
    assert(result.report.some((item) => item.kind === "removed" && item.path === `character.builder.${key}`));
    assert.equal(Object.hasOwn(result.value.builder, key), false);
  }
  fixture.builder.grantChoices["soulbound-weapon"].sourceId = "";
  assert.equal(migrateCharacterDocument(fixture, { references }).ok, true);
});

test("v4 aliases migrate when their newer binding is absent, while explicit current selections win", () => {
  const fixture = makeV4Character();
  delete fixture.builder.selectedClassFeatureOptions;
  delete fixture.builder.selectedFeats;
  fixture.builder.classFeatureChoices = { "cfg:ninja:1:shadow-training": ["Shadow Step"] };
  fixture.builder.selectedFeatIds = ["feat:ninja:2:Trained Senses"];
  const migrated = migrateCharacterDocument(fixture, { references });
  assert.equal(migrated.ok, true, JSON.stringify(migrated.diagnostics));
  assert.deepEqual(migrated.value.builder.selectedClassFeatureOptions, ["shadow-step"]);
  assert.deepEqual(migrated.value.builder.selectedFeats, ["trained-senses"]);
  fixture.builder.selectedClassFeatureOptions = [];
  fixture.builder.selectedFeats = [];
  const current = migrateCharacterDocument(fixture, { references });
  assert.equal(current.ok, true);
  assert.deepEqual(current.value.builder.selectedClassFeatureOptions, []);
  assert.deepEqual(current.value.builder.selectedFeats, []);
});

test("automatic grant ownership is never inferred for a different class, unavailable level, or ambiguous source", () => {
  const fixture = makeObservedLegacyV4Character();
  fixture.builder.classKey = "ninja";
  const wrongClass = migrateCharacterDocument(fixture, { references });
  assert.equal(hasDiagnostic(wrongClass, "unresolved-reference", "character.builder.grantChoices.soulbound-weapon.sourceId"), true);
  fixture.builder.classKey = "weapon-master";
  const data = structuredClone(MIGRATION_GAME_DATA);
  data.classFeatures["weapon-master"][0].level = 3;
  const early = migrateCharacterDocument(fixture, { references: createCharacterMigrationReferences(data) });
  assert.equal(hasDiagnostic(early, "unresolved-reference", "character.builder.grantChoices.soulbound-weapon.sourceId"), true);
  data.classFeatures["weapon-master"][0].level = 1;
  data.classFeatures["weapon-master"].push({ ...data.classFeatures["weapon-master"][0], featureKey: "other-owner" });
  const ambiguous = migrateCharacterDocument(fixture, { references: createCharacterMigrationReferences(data) });
  assert.equal(hasDiagnostic(ambiguous, "ambiguous-reference", "character.builder.grantChoices.soulbound-weapon.choiceId"), true);
  delete fixture.builder.grantChoices["soulbound-weapon"];
  fixture.builder.grantChoices["unknown-choice"] = { choiceId: "unknown-choice", type: "weapon", weaponKey: "short-blade" };
  const unknown = migrateCharacterDocument(fixture, { references });
  assert.equal(hasDiagnostic(unknown, "invalid-value", "character.builder.grantChoices.unknown-choice.sourceId"), true);
});

test("missing class-option owners are not inferred from a matching choice alias", () => {
  const fixture = makeV4Character();
  fixture.builder.classKey = "ninja";
  fixture.builder.selectedClassFeatureOptions = [];
  const choiceId = "Dazzling Wand:technique-choice:spellcasting:0";
  fixture.builder.grantChoices = {
    [choiceId]: {
      choiceId,
      type: "technique",
      techniqueName: "Prismatic Burst",
      skill: "spellcasting",
    },
  };
  const original = structuredClone(fixture);
  const result = migrateCharacterDocument(fixture, { references });
  assert.equal(result.ok, false);
  assert.equal(result.value, null);
  assert.equal(hasDiagnostic(result, "missing-source-owner", `character.builder.grantChoices.${choiceId}.sourceId`), true);
  assert.deepEqual(fixture, original);
  fixture.builder.grantChoices[choiceId].sourceId = "";
  const blank = migrateCharacterDocument(fixture, { references });
  assert.equal(blank.ok, false);
  assert.equal(hasDiagnostic(blank, "missing-source-owner", `character.builder.grantChoices.${choiceId}.sourceId`), true);
});

test("historical revision and update metadata stay outside canonical state", () => {
  const fixture = makeObservedLegacyV4Character();
  fixture.revision = 4;
  delete fixture.updatedAt;
  const result = migrateCharacterDocument(fixture, { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.metadata.revision, 4);
  assert.equal(result.metadata.updatedAt, "older-builder-update");
  assert.equal(Object.hasOwn(result.value, "revision"), false);
  assert.equal(Object.hasOwn(result.value.builder, "updatedAt"), false);
});

test("current v5 values remain equivalent and repeated registry migration is idempotent", () => {
  const current = makeV5Character();
  const currentWithMetadata = {
    ...structuredClone(current),
    createdAt: "created-at",
    updatedAt: "updated-at",
    revision: 7,
  };
  const first = migrateCharacterDocument(currentWithMetadata, { references });
  assert.equal(first.ok, true, JSON.stringify(first.diagnostics, null, 2));
  assert.deepEqual(first.value, current);
  assert.equal(first.metadata.revision, 7);
  assert.deepEqual(first.appliedVersions, []);

  const historical = migrateCharacterDocument(makeV4Character(), { references });
  const repeated = migrateCharacterDocument(historical.value, { references });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.value, historical.value);
  assert.deepEqual(repeated.appliedVersions, []);
});

test("schema v2, unknown unversioned envelopes, and future versions fail explicitly", () => {
  const reserved = migrateCharacterDocument({ ...makeV1Character(), schemaVersion: 2 }, { references });
  assert.equal(reserved.ok, false);
  assert.equal(hasDiagnostic(reserved, "reserved-schema-version", "character.schemaVersion"), true);

  const unknown = migrateCharacterDocument({ ownerUid: "user_123", builder: {}, sheet: {} }, { references });
  assert.equal(unknown.ok, false);
  assert.equal(hasDiagnostic(unknown, "missing-schema-version", "character.schemaVersion"), true);

  const future = migrateCharacterDocument({ ...makeV5Character(), schemaVersion: 99 }, { references });
  assert.equal(future.ok, false);
  assert.equal(hasDiagnostic(future, "unsupported-schema-version", "character.schemaVersion"), true);

  const malformedIntegerFixture = makeV4Character();
  malformedIntegerFixture.builder.level = "2oops";
  const malformedInteger = migrateCharacterDocument(malformedIntegerFixture, { references });
  assert.equal(malformedInteger.ok, false);
  assert.equal(hasDiagnostic(malformedInteger, "invalid-legacy-type", "character.builder.level"), true);
});

test("unresolved, ambiguous, and unavailable reference mappings are never guessed", () => {
  const noIndex = migrateCharacterDocument(makeV4Character());
  assert.equal(noIndex.ok, false);
  assert.equal(hasDiagnostic(noIndex, "missing-reference-index"), true);

  const missingFixture = makeV4Character();
  missingFixture.builder.selectedFeats = ["A Feat That Never Existed"];
  const missing = migrateCharacterDocument(missingFixture, { references });
  assert.equal(missing.ok, false);
  assert.equal(hasDiagnostic(missing, "unresolved-reference", "character.builder.selectedFeats[0]"), true);
  assert.equal(missing.summary.unresolved > 0, true);

  const ambiguousData = structuredClone(MIGRATION_GAME_DATA);
  ambiguousData.feats.push({ featKey: "other-senses", name: "Trained Senses", options: [], grants: [] });
  const ambiguous = migrateCharacterDocument(makeV4Character(), {
    references: createCharacterMigrationReferences(ambiguousData),
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(hasDiagnostic(ambiguous, "ambiguous-reference", "character.builder.selectedFeats[0]"), true);
});

test("stable generated identities are reproducible and collisions are rejected", () => {
  const first = migrateCharacterDocument(makeV3Character(), { references });
  const second = migrateCharacterDocument(makeV3Character(), { references });
  assert.equal(first.ok, true, JSON.stringify(first.diagnostics, null, 2));
  assert.equal(second.ok, true, JSON.stringify(second.diagnostics, null, 2));
  assert.deepEqual(first.value.builder.bonds, second.value.builder.bonds);
  assert.deepEqual(first.value.builder.sheet.repeatables.abilities, second.value.builder.sheet.repeatables.abilities);
  assert.deepEqual(first.report, second.report);

  const collisionFixture = makeV4Character();
  collisionFixture.builder.bonds = [
    { bondId: "bond:same", name: "One", rank: "1", keystone: "" },
    { bondId: "bond:same", name: "Two", rank: "2", keystone: "" },
  ];
  const collision = migrateCharacterDocument(collisionFixture, { references });
  assert.equal(collision.ok, false);
  assert.equal(hasDiagnostic(collision, "stable-id-collision", "character.builder.bonds[1].bondId"), true);
});

test("unknown nested fields and lossy legacy fields produce path-specific diagnostics", () => {
  const unknownFixture = makeV4Character();
  unknownFixture.builder.weapons[0].secretBonus = 4;
  const unknown = migrateCharacterDocument(unknownFixture, { references });
  assert.equal(unknown.ok, false);
  assert.equal(hasDiagnostic(unknown, "unknown-legacy-field", "character.builder.weapons[0].secretBonus"), true);

  const customTechniqueFixture = makeV1Character();
  customTechniqueFixture.sheet.repeatables.techniques = [{ name: "Homebrew Ambush" }];
  const customTechnique = migrateCharacterDocument(customTechniqueFixture, { references });
  assert.equal(customTechnique.ok, false);
  assert.equal(
    hasDiagnostic(customTechnique, "unresolved-legacy-field", "character.builder.sheet.repeatables.techniques"),
    true,
  );

  const portraitFixture = makeV1Character();
  portraitFixture.portraitUrl = "data:image/png;base64,AAAA";
  const portrait = migrateCharacterDocument(portraitFixture, { references });
  assert.equal(portrait.ok, false);
  assert.equal(hasDiagnostic(portrait, "unresolved-legacy-field", "character.portraitUrl"), true);
});

test("migration module is pure and imports no Firebase, DOM, file, or network dependency", async () => {
  const source = await readFile(new URL("../public/js/core/character-migrations.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /firebase|document\.|window\.|localStorage|sessionStorage|fetch\(|node:fs|node:http|node:https/i);
});
