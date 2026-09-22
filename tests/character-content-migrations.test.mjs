import assert from "node:assert/strict";
import test from "node:test";
import { createCharacterMigrationReferences, migrateCharacterDocument } from "../public/js/core/character-migrations.js";
import { decodeStoredCharacter } from "../public/js/core/character-persistence.js";
import { computeGrantedSkillsState } from "../public/js/core/skill-rules.js";
import { contentMigrationGameData, historicalCelestialKnight } from "./fixtures/character-content-migrations.mjs";

test("both historical Celestial Knight answers become the same source-owned both-skills feature in v4, v5 and v6", () => {
  const data = contentMigrationGameData();
  const references = createCharacterMigrationReferences(data);
  for (const version of [4, 5, 6]) for (const choice of ["Melee Weapons", "Targeting", "Ranged Weapons"]) {
    const input = historicalCelestialKnight(version, choice);
    const before = structuredClone(input);
    const result = migrateCharacterDocument(input, { references });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(input, before);
    assert.deepEqual(result.value.builder.selectedFeatOptions, []);
    assert.deepEqual(result.value.builder.selectedFeats, before.builder.selectedFeats);
    assert.equal(result.value.builder.sheet.fields.notes, before.builder.sheet.fields.notes);
    const report = result.report.find((entry) => entry.kind === "content-migrated");
    assert.equal(report.from, input.builder.selectedFeatOptions[0]);
    assert.equal(report.sourceFeatKey, input.builder.selectedFeats[0]);
    const skills = computeGrantedSkillsState(data, result.value.builder).grantedCombatSkills;
    assert.deepEqual(skills.filter((skill) => Number(skill.rank) > 0).map((skill) => [skill.skill, skill.rank]).sort(), [["Melee Weapons", "1"], ["Ranged Weapons", "1"]]);
    const again = decodeStoredCharacter(result.value, { references });
    assert.equal(again.ok, true);
    assert.equal(again.migrated, false);
    assert.deepEqual(again.character, result.value);
    assert(!again.migration.report.some((entry) => entry.kind === "content-migrated"));
  }
});

test("content conversion applies independently of schema version and retains unrelated canonical state exactly", () => {
  const input = historicalCelestialKnight(6);
  input.builder.selectedFeatOptions.push("unrelated-choice");
  const before = structuredClone(input);
  const result = decodeStoredCharacter({ ...input, revision: 9 }, { references: createCharacterMigrationReferences(contentMigrationGameData()) });
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.revision, 9);
  before.builder.selectedFeatOptions = ["unrelated-choice"];
  assert.deepEqual(result.character, before);
});

test("Celestial Knight conversion refuses missing parents or multiple old answers", () => {
  const references = createCharacterMigrationReferences(contentMigrationGameData());
  for (const version of [4, 6]) for (const invalid of ["no-parent", "two-answers", "duplicate"]) {
    const input = historicalCelestialKnight(version);
    if (invalid === "no-parent") input.builder.selectedFeats = [];
    else input.builder.selectedFeatOptions.push(invalid === "duplicate" ? input.builder.selectedFeatOptions[0] : "celestial-knight-targeting");
    const before = structuredClone(input);
    const result = migrateCharacterDocument(input, { references });
    assert.equal(result.ok, false);
    assert(result.diagnostics.some((item) => item.code === "unresolved-retired-choice"));
    assert(!result.report.some((item) => item.kind === "content-migrated"));
    assert.deepEqual(input, before);
  }
});

test("Celestial Knight requires a unique current parent granting both skills; labels alone do not prove identity", () => {
  for (const invalid of ["missing-skill", "recipient", "deferred", "wrong-key", "duplicate-parent", "old-options"]) {
    const data = contentMigrationGameData();
    if (invalid === "missing-skill") data.feats[0].grants.pop();
    if (invalid === "recipient") data.feats[0].grants[1].recipientRef = "artifact";
    if (invalid === "deferred") data.feats[0].runtimeSupport = { status: "deferred" };
    if (invalid === "wrong-key") data.feats[0].featKey = "other-knight";
    if (invalid === "duplicate-parent") data.feats.push(structuredClone(data.feats[0]));
    if (invalid === "old-options") data.feats[0].options = [{ featKey: "celestial-knight-targeting", name: "Targeting" }];
    const result = migrateCharacterDocument(historicalCelestialKnight(), { references: createCharacterMigrationReferences(data) });
    assert.equal(result.ok, false, invalid);
    assert(!result.report.some((item) => item.kind === "content-migrated"));
  }
  const data = contentMigrationGameData();
  data.feats[0].name = "Updated Display Name";
  assert.equal(migrateCharacterDocument(historicalCelestialKnight(), { references: createCharacterMigrationReferences(data) }).ok, true);
});

test("the old published catalog retains its option; unrelated unknown choices still fail", () => {
  const data = contentMigrationGameData();
  data.schemaVersion = 2;
  data.feats[0].type = "optionGroup";
  data.feats[0].grants = [];
  data.feats[0].options = [{ featKey: "celestial-knight-melee-weapons", name: "Melee Weapons" }];
  const result = migrateCharacterDocument(historicalCelestialKnight(), { references: createCharacterMigrationReferences(data) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.builder.selectedFeatOptions, ["celestial-knight-melee-weapons"]);
  const input = historicalCelestialKnight();
  input.builder.selectedFeatOptions = ["Melee Weapons"];
  const unknown = migrateCharacterDocument(input, { references: createCharacterMigrationReferences(contentMigrationGameData()) });
  assert.equal(unknown.ok, false);
  assert(unknown.diagnostics.some((item) => item.code === "unresolved-reference"));
});

test("old Metamorph requires a rebuild with its original untouched; new static Trait characters remain readable", () => {
  const references = createCharacterMigrationReferences(contentMigrationGameData());
  for (const version of [4, 5, 6]) {
    const input = historicalCelestialKnight(version);
    input.builder.classKey = "metamorph";
    input.builder.selectedClassFeatureOptions = [version < 5 ? "metamorph|L1|Metamorphic Transformations::Elemental Form" : "elemental-form"];
    input.builder.selectedTechniques = [version < 5 ? "Rubber Punch" : "rubber-punch"];
    const before = structuredClone(input);
    const result = decodeStoredCharacter(input, { references });
    assert.equal(result.ok, false);
    assert.equal(result.character, null);
    assert.deepEqual(result.diagnostics.map((item) => item.code), ["character-rebuild-required"]);
    assert.deepEqual(input, before);
    assert(!result.migration.report.some((item) => item.kind === "content-migrated"));
  }
  const current = historicalCelestialKnight(6);
  current.builder.classKey = "metamorph";
  current.builder.selectedFeats = [];
  current.builder.selectedFeatOptions = [];
  assert.equal(decodeStoredCharacter(current, { references }).ok, true);
});
