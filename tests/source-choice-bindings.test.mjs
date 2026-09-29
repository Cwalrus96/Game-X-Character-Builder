import assert from "node:assert/strict";
import test from "node:test";
import { createChoiceBindings, bindModelChoices } from "../scripts/game-data/choice-bindings.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { validateGameDataModel } from "../scripts/game-data/model-validator.mjs";
import { buildGameDataArtifacts } from "../scripts/game-data/artifact-builder.mjs";
import { validateRuntimeArtifacts } from "../scripts/game-data/runtime-artifact-acceptance.mjs";
import { buildSchemaV5Workbook } from "./fixtures/game-data-schema-v5.mjs";
import { createDefaultCharacter, encodeCharacter } from "../public/js/core/character-codec.js";
import { createCharacterMigrationReferences, migrateCharacterDocument } from "../public/js/core/character-migrations.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";
import { projectSheetTechniques } from "../public/js/core/sheet-technique-projection.js";
import { checkPrerequisites, formatPrerequisite } from "../public/js/core/prerequisite-rules.js";
import { buildGeneratedWeaponsFromGrantChoices } from "../public/js/core/grants.js";

const model = () => structuredClone(adaptGameDataWorkbook(buildSchemaV5Workbook()).model);
const choice = (choiceId = "element") => ({ type: "choice", filterType: "element", choiceId, count: 1 });
function feature(input, key, grants, extra = {}) {
  return { ...structuredClone(input.classFeatures[0]), featureKey: key, name: "Same display name", traitKeys: [],
    description: "A complete feature.", grants, prerequisites: [], ...extra };
}
function errors(input) { return validateGameDataModel(input).diagnostics.filter(item => item.severity === "error"); }

test("local choice keys may repeat across every source kind, but never inside one source", () => {
  const input = model();
  input.classFeatures[0].grants = [choice()];
  input.classFeatures[1].grants = [choice()];
  input.feats[0].grants = [choice()];
  input.originFeatures[0].grants.push(choice());
  input.traits[0].grants.push(choice());
  input.weaponEnhancements[0].grants = [choice()];
  input.techniques[0].grants = [choice()];
  const before = structuredClone(input);
  assert.deepEqual(errors(input), []);
  assert.equal(new Set(createChoiceBindings(input).definitions.filter(item => item.key === "element").map(item => item.id)).size, 7);
  assert.deepEqual(input, before);
  input.traits[0].grants.push(choice());
  const duplicates = errors(input).filter(item => item.code === "duplicate-choice-id");
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].sheet, "Traits");
});

test("references prefer the exact source and ancestors; ambiguous siblings require qualification", () => {
  const input = model();
  input.classFeatures = [feature(input, "left", [choice()]), feature(input, "right", [choice()]),
    feature(input, "reference", [], { prerequisites: [{ type: "choice", choiceRef: "element" }] })];
  const index = createChoiceBindings(input);
  assert.equal(index.resolve("element", input.classFeatures[0])[0].record, input.classFeatures[0]);
  assert.equal(errors(input).some(item => item.code === "ambiguous-choice-reference"), true);
  input.classFeatures[2].prerequisites[0].choiceRef = "class-feature:weapon-master:left:element";
  assert.deepEqual(errors(input), []);
  input.classFeatures[0].kind = "optionGroup"; input.classFeatures[0].chooseCount = 1;
  input.classFeatures[2].kind = "option"; input.classFeatures[2].parentKey = "left";
  input.classFeatures[2].prerequisites[0].choiceRef = "element";
  assert.deepEqual(errors(input), []);
  assert.equal(createChoiceBindings(input).resolve("element", input.classFeatures[2])[0].record, input.classFeatures[0]);
  input.classFeatures[2].prerequisites[0].choiceRef = "missing";
  assert.equal(errors(input).some(item => item.code === "unresolved-choice-reference"), true);
});

test("owner context resolves class references from feats and keeps recipient bonds in their origin", () => {
  const input = model();
  input.classFeatures[0].grants = [choice("artifact")];
  input.classFeatures[1].grants = [choice("weapon")];
  input.feats[0].prerequisites = [{ type: "choice", choiceRef: "weapon" }];
  input.traits[0].grants.push(choice("weapon"));
  assert.deepEqual(errors(input), []);
  const index = createChoiceBindings(input);
  assert.equal(index.resolve("weapon", input.feats[0])[0].record, input.classFeatures[1]);
  assert.equal(index.resolve("artifact", input.originFeatures[1])[0].record, input.originFeatures[0]);
  input.originFeatures[1].grants[0].recipientRef = "class-feature:weapon-master:canonical-rule:artifact";
  assert.equal(errors(input).some(item => item.code === "recipient-scope-mismatch"), true);
});

function runtimeFixture({ count = 1, weapon = false } = {}) {
  const input = model();
  const grant = weapon ? { type: "weapon", choiceId: "gift", count, rank: 1 }
    : { type: "technique-choice", choiceId: "gift", skill: "melee-weapons", count };
  input.classFeatures = [feature(input, "gift", [grant])];
  input.originFeatures = [{ ...input.originFeatures[0], featureKey: "gift", name: "Same display name", grants: [{ ...grant }] }];
  input.techniques[0].prerequisites = [];
  const validation = validateGameDataModel(input);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  const before = structuredClone(input);
  const artifact = buildGameDataArtifacts({ model: input, validation, provenance: { fileId: "fixture", driveVersion: "1", modifiedTime: "2026-01-01T00:00:00Z" } });
  assert.deepEqual(input, before);
  assert.equal(validateRuntimeArtifacts(artifact).ok, true);
  const data = artifact.combined;
  const character = createDefaultCharacter({ ownerUid: "choice_test" });
  Object.assign(character.builder, { classKey: "weapon-master", level: 2, primaryAttribute: "strength", originKey: "bonded-relic" });
  character.builder.attributes.strength = 2;
  const aliases = data.choiceAliases;
  return { data, character, aliases, input };
}
function answer(alias, type = "technique") {
  return { choiceId: alias.to, sourceId: alias.sourceId, sourceLabel: "Same display name", type,
    value: "", techniqueKey: type === "technique" ? "shared-strike" : "", skillKey: "melee-weapons",
    weaponKey: type === "weapon" ? "long_blade" : "", rank: 1, customName: "My answer", enhancements: [], tags: [] };
}

test("artifacts bind same-named answers once for all consumers and retain authored source text", () => {
  const { data, aliases, input } = runtimeFixture({ count: 2 });
  assert.equal(aliases.length, 4);
  assert.equal(new Set(aliases.map(item => item.to)).size, 4);
  assert.deepEqual(aliases.map(item => item.from).sort(), ["gift:1", "gift:1", "gift:2", "gift:2"]);
  const reversed = structuredClone(input); reversed.classFeatures.reverse(); reversed.originFeatures.reverse();
  assert.deepEqual(bindModelChoices(reversed).aliases, aliases);
  assert.equal(data.classFeatures["weapon-master"][0].name, "Same display name");
  const long = structuredClone(input);
  long.classFeatures[0].featureKey = "a".repeat(110);
  const ids = bindModelChoices(long).aliases.map(item => item.to);
  assert.equal(ids.every(id => `grant_${id}`.length <= 64), true);
  assert.equal(new Set(ids).size, 4);
});

test("compiled choice prerequisites cannot be satisfied by the other source's same-named answer", () => {
  const { input } = runtimeFixture({ weapon: true });
  input.classFeatures[0].prerequisites = [{ type: "choice", choiceRef: "gift", tag: "melee" }];
  const bound = bindModelChoices(input);
  const prereqs = bound.model.classFeatures[0].prerequisites;
  const own = bound.aliases.find(item => item.sourceId.startsWith("class"));
  const other = bound.aliases.find(item => item.sourceId.startsWith("origin"));
  const choices = { [other.to]: { tags: ["melee"] } };
  assert.equal(checkPrerequisites(prereqs, { choices, syntaxVersion: 3 }).ok, false);
  choices[own.to] = { tags: ["melee"] };
  assert.equal(checkPrerequisites(prereqs, { choices, syntaxVersion: 3 }).ok, true);
  assert.equal(formatPrerequisite(prereqs[0], { choiceAliases: bound.aliases }), "Choice gift: tag melee");
});

test("same group keys in different classes and nested alternative references resolve deterministically", () => {
  const input = model();
  const group = feature(input, "styles", [], { kind: "optionGroup", chooseCount: 1 });
  input.classFeatures = [group, feature(input, "a", [choice("element")], { kind: "option", parentKey: "styles" }),
    { ...structuredClone(group), classKey: "unfinished" },
    feature(input, "b", [], { classKey: "unfinished", kind: "option", parentKey: "styles" })];
  input.feats[0].prerequisites = [{ type: "option", groupKey: "styles", count: 1 },
    { type: "any", alternatives: [{ type: "choice", choiceRef: "element" }, { type: "class", key: "weapon-master" }] }];
  assert.deepEqual(errors(input), []);
  assert.equal(createChoiceBindings(input).resolve("styles", input.feats[0])[0].record, group);
  const bound = bindModelChoices(input);
  assert.equal(bound.model.feats[0].prerequisites[1].alternatives[0].choiceRef, "element");
});

test("existing schema-6 answers migrate by recorded owner, preserve generated weapons and reload idempotently", () => {
  const { data, aliases, character } = runtimeFixture({ weapon: true });
  const alias = aliases[0];
  character.builder.grantChoices[alias.from] = { ...answer(alias, "weapon"), choiceId: alias.from };
  character.builder.weapons = buildGeneratedWeaponsFromGrantChoices(character.builder.grantChoices, [], { canonical: true });
  const before = structuredClone(character);
  const references = createCharacterMigrationReferences(data);
  const migrated = migrateCharacterDocument(character, { references });
  assert.equal(migrated.ok, true, JSON.stringify(migrated.diagnostics));
  assert.deepEqual(character, before);
  assert.equal(migrated.value.builder.grantChoices[alias.to].weaponKey, "long_blade");
  assert.equal(migrated.value.builder.weapons[0].id, before.builder.weapons[0].id);
  assert.equal(migrated.value.builder.weapons[0].sourceChoiceId, alias.to);
  const saved = encodeCharacter(migrated.value);
  assert.equal(saved.ok, true);
  const reloaded = migrateCharacterDocument(saved.value, { references });
  assert.equal(reloaded.ok, true, JSON.stringify(reloaded.diagnostics));
  assert.deepEqual(reloaded.value, migrated.value);
  assert.equal(reloaded.report.some(item => item.migrationId === "source-owned-choice-id"), false);
});

test("migration fails closed for wrong ownership or colliding saved answers", () => {
  const { data, aliases, character } = runtimeFixture();
  const alias = aliases[0], references = createCharacterMigrationReferences(data);
  character.builder.grantChoices[alias.from] = { ...answer(alias), choiceId: alias.from, sourceId: "unrelated:owner" };
  assert.equal(migrateCharacterDocument(character, { references }).ok, false);
  character.builder.grantChoices[alias.from].sourceId = alias.sourceId;
  character.builder.grantChoices[alias.to] = answer(alias);
  const before = structuredClone(character);
  const result = migrateCharacterDocument(character, { references });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some(item => item.code === "ambiguous-choice-owner"), true);
  assert.deepEqual(character, before);
});

test("legacy schema-4 and schema-5 answers use the same owner mapping without losing their values", () => {
  for (const schemaVersion of [4, 5]) {
    const { data, aliases, character } = runtimeFixture({ count: 2 });
    character.schemaVersion = schemaVersion;
    delete character.builder.traitChoices; delete character.builder.traitActivations;
    const owned = aliases.filter(item => item.sourceId.startsWith("class"));
    for (const alias of owned) character.builder.grantChoices[alias.from] = { ...answer(alias), choiceId: alias.from };
    const result = migrateCharacterDocument(character, { references: createCharacterMigrationReferences(data) });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(Object.keys(result.value.builder.grantChoices).sort(), owned.map(item => item.to).sort());
    assert.equal(Object.values(result.value.builder.grantChoices).every(item => item.techniqueKey === "shared-strike"), true);
  }
});

test("two active same-named choices have separate graph owners; removing one preserves the other and its sheet Technique", () => {
  const { data, aliases, character } = runtimeFixture();
  for (const alias of aliases) character.builder.grantChoices[alias.to] = answer(alias);
  const graph = compileCharacterGraph({ character, gameData: data });
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.filter(node => node.type === "grant-answer" && node.metadata.valid).length, 2);
  assert.equal(projectSheetTechniques({ character, gameData: data }).filter(card => card.tech.techniqueKey === "shared-strike").length, 1);
  const previousCharacter = structuredClone(character);
  character.builder.originKey = "";
  const result = reconcileCharacterGraph({ character, previousCharacter, gameData: data });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  const survivor = aliases.find(item => item.sourceId.startsWith("class"));
  assert.deepEqual(Object.keys(result.character.builder.grantChoices), [survivor.to]);
  assert.equal(projectSheetTechniques({ character: result.character, gameData: data }).some(card => card.tech.techniqueKey === "shared-strike"), true);
});
