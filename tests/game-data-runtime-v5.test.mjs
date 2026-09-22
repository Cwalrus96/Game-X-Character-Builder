import assert from "node:assert/strict";
import test from "node:test";
import { buildGameDataArtifacts } from "../scripts/game-data/artifact-builder.mjs";
import { validateRuntimeArtifacts } from "../scripts/game-data/runtime-artifact-acceptance.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";
import { buildSchemaV4Workbook } from "./fixtures/game-data-schema-v4.mjs";
import { buildSchemaV5Workbook } from "./fixtures/game-data-schema-v5.mjs";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";
import { buildTechniqueIndexes, createCharacterGrantCollection, getEntryGrants, resolveTechniqueRef, resolveTraitRef, validateRuntimeGameData } from "../public/js/core/game-data.js";
import { getTechniqueSelectionState, isGameDataRecordSelectable } from "../public/js/core/selection-rules.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { computeGrantedSkillsState } from "../public/js/core/skill-rules.js";
import { renderTechniqueProfileHtml } from "../public/js/core/technique-utils.js";
import { TechniquesWidget } from "../public/js/builder/widgets/techniques-widget.js";
import { TechniqueChoiceWidget } from "../public/js/builder/widgets/technique-choice-widget.js";
import { getWeaponSkillRankCap, isEnhancementCompatible } from "../public/js/core/weapon-utils.js";
import { projectSkillNames } from "../public/js/core/skill-identity.js";

const versioned = (record = {}) => ({ expressionSyntaxVersion: 3, runtimeSupport: { status: "supported", reasons: [] }, ...record });

function artifactFixture() {
  const model = structuredClone(adaptGameDataWorkbook(buildSchemaV4Workbook()).model);
  model.metadata.sourceSchemaVersion = 5;
  model.metadata.syntaxVersion = 3;
  model.techniques[0] = {
    ...model.techniques[0], status: "playable", selection: "Martial Arts OR Henshin Arts",
    selectionRoutes: [{ type: "skill", name: "Martial Arts", skillKey: "martial-arts" }, { type: "skill", name: "Henshin Arts", skillKey: "henshin-arts" }],
    associatedSkill: "Henshin Arts", associatedSkillKey: "henshin-arts",
    pumpingByRank: { 1: "+1 healing per Energy", 3: "+2 ward per Energy" }, pumpingByRankRaw: "1:+1 healing per Energy; 3:+2 ward per Energy",
    basicAttack: [{ type: "technique", key: "stalk-prey", attribute: "Agility" }], basicAttackRaw: "technique | techniqueKey=stalk-prey | attribute=Agility",
    sourceValues: { selection: "Martial Arts OR Henshin Arts", associatedSkill: "Henshin Arts" },
  };
  model.traits = [{ traitKey: "integrated-weapon", name: "Integrated Weapon", rank: 1, techniqueKeys: ["stalk-prey"], grants: [], source: { sheet: "Traits", row: 2 } }];
  model.classFeatures[0].traitKeys = ["integrated-weapon"];
  model.weaponBases[0].techniqueKeys = ["stalk-prey"];
  model.weaponBases[0].traitsText = "An authored weapon benefit.";
  return model;
}

test("v4 artifact generation retains its exact reviewed fixture bytes", () => {
  const adapted = adaptGameDataWorkbook(buildSchemaV4Workbook());
  const artifact = buildGameDataArtifacts({ model: adapted.model, validation: validateAdaptedGameData(adapted), provenance: {} });
  assert.equal(artifact.schemaVersion, 2);
  assert.equal(artifact.files.length, 9);
  assert.equal(artifact.files.find((file) => file.name === "game-x-data.json").sha256, "32fbb037ea3c8a03f7bd092985f69da9793264b94908b29f226df0a332b63a30");
  assert.equal(validateRuntimeArtifacts(artifact).ok, true);
});

test("v5 artifacts preserve source fields, provider relationships, unknowns, and execution status", () => {
  const model = artifactFixture();
  const before = structuredClone(model);
  const artifact = buildGameDataArtifacts({ model, validation: { ok: true, runtimeSupportBySource: { "ClassFeatures:2": { status: "deferred", reasons: ["provider-activation"] } } }, provenance: {} });
  assert.deepEqual(model, before, "artifact projection must not mutate the canonical source model");
  assert.equal(artifact.schemaVersion, 3);
  assert.equal(artifact.files.length, 10);
  const data = artifact.combined;
  assert.equal(data.expressionSyntaxVersion, 3);
  assert.deepEqual(data.techniques[0].selectionRoutes, model.techniques[0].selectionRoutes);
  assert.deepEqual(data.techniques[0].basicAttack, model.techniques[0].basicAttack);
  assert.deepEqual(data.techniques[0].pumpingByRank, model.techniques[0].pumpingByRank);
  assert.equal(data.techniques[0].associatedSkill, "Henshin Arts");
  assert.deepEqual(data.classFeatures.ninja[0].traitKeys, ["integrated-weapon"]);
  assert.equal(data.classFeatures.ninja[0].runtimeSupport.status, "deferred");
  assert.deepEqual(data.weaponBases[0].techniqueKeys, ["stalk-prey"]);
  assert.equal(data.weaponBases[0].traitsText, "An authored weapon benefit.");
  assert.equal(data.traits[0].traitKey, "integrated-weapon");
  assert.equal(validateRuntimeArtifacts(artifact).ok, true, JSON.stringify(validateRuntimeArtifacts(artifact).diagnostics));
  assert.equal(validateRuntimeGameData({ ...data, traits: undefined }).ok, false);
});

test("the actual v5 adapter and validator produce readable v3 artifacts without duplicate class skill names", () => {
  const adapted = adaptGameDataWorkbook(buildSchemaV5Workbook());
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  const artifact = buildGameDataArtifacts({ model: adapted.model, validation, provenance: {} });
  assert.equal(validateRuntimeArtifacts(artifact).ok, true, JSON.stringify(validateRuntimeArtifacts(artifact).diagnostics));
  assert.equal(artifact.combined.classes[0].combatTechniqueSkill, "Melee Weapons, Ranged Weapons");
  assert.equal(artifact.combined.classSkills.filter((entry) => entry.classKey === "weapon-master" && entry.whenPrimaryAttribute).length, 4);
  const archive = artifact.combined.origins[0].features.find((entry) => entry.featureKey === "archive");
  assert.equal(archive.grants[0].recipientRef, "artifact");
  assert.equal(getEntryGrants(archive).length, 0);
  const incomplete = artifact.combined.techniques.find((entry) => entry.techniqueKey === "unfinished-strike");
  assert.equal(incomplete.rank, null);
  assert.equal(isGameDataRecordSelectable(incomplete, { allowGrantedOnly: true }), false);
});

test("v3 readiness and unresolved routes cannot be bypassed by a grant", () => {
  for (const status of ["draft", "incomplete"]) {
    assert.equal(isGameDataRecordSelectable(versioned({ status, selection: "granted", selectionRoutes: [{ type: "granted" }], selectable: true }), { allowGrantedOnly: true }), false);
  }
  assert.equal(isGameDataRecordSelectable(versioned({ status: "playable", selection: null, selectionRoutes: [] })), false);
  assert.equal(isGameDataRecordSelectable(versioned({ status: "playable", selectionRoutes: [{ type: "skill", name: "Martial Arts" }], runtimeSupport: { status: "deferred", reasons: ["unknown-cost"] } })), false);
  const granted = versioned({ status: "playable", selection: "granted", selectionRoutes: [{ type: "granted" }] });
  assert.equal(isGameDataRecordSelectable(granted), false);
  assert.equal(isGameDataRecordSelectable(granted, { allowGrantedOnly: true }), true);
});

test("v3 selection uses a qualifying skill alternative and its associated-skill rank", () => {
  const technique = versioned({ status: "playable", rank: 2, selectionRoutes: [{ type: "skill", name: "Martial Arts" }, { type: "skill", name: "Henshin Arts" }] });
  const context = { knownCombatSkills: new Set(["Martial Arts", "Henshin Arts"]), skillRanks: new Map([["martial-arts", 1], ["Henshin Arts", 3]]) };
  const state = getTechniqueSelectionState(technique, context);
  assert.equal(state.eligible, true);
  assert.equal(state.skillName, "Henshin Arts");
  assert.equal(state.skillRank, 3);
  assert.equal(getTechniqueSelectionState({ ...technique, associatedSkill: "Martial Arts" }, context).eligible, false);
});

test("tag and weapon-tag selection require their own acquired context", () => {
  const tag = versioned({ status: "playable", rank: 1, associatedSkill: "Metamorphosis", tags: ["Wings"], selectionRoutes: [{ type: "tag", name: "Wings" }] });
  const context = { knownCombatSkills: new Set(["Metamorphosis"]), skillRanks: new Map([["Metamorphosis", 1]]) };
  assert.equal(getTechniqueSelectionState(tag, context).eligible, false, "classification tags are not acquired tags");
  assert.equal(getTechniqueSelectionState(tag, { ...context, tags: ["Wings"] }).eligible, true);
  const weapon = versioned({ status: "playable", rank: 2, selectionRoutes: [{ type: "weaponTag", name: "Melee" }] });
  assert.equal(getTechniqueSelectionState(weapon, { tags: ["Melee"] }).eligible, false);
  assert.equal(getTechniqueSelectionState(weapon, { weapons: [{ tags: ["Melee"], rank: 2 }] }).eligible, true);
  assert.equal(getTechniqueSelectionState(weapon, { weapons: [{ tags: ["Melee"], rank: 1 }] }).eligible, false);
});

test("recipient-owned and repeated conditional grants remain inspectable without character effects", () => {
  const artifactSkill = { type: "skill", choiceId: "archive-skills", count: 3, rank: 1, recipientRef: "artifact" };
  const feature = versioned({ featureKey: "archive", name: "Archive", grants: [artifactSkill, { type: "feature", key: "monster-evolution" }] });
  assert.equal(getEntryGrants(feature).length, 0);
  assert.equal(getEntryGrants(feature, { includeDeferred: true }).length, 2);
  const data = { ...GRAPH_GAME_DATA, schemaVersion: 3, expressionSyntaxVersion: 3, traits: [], classFeatures: { ninja: [feature] } };
  const character = makeGraphCharacter();
  const collection = createCharacterGrantCollection(data, character.builder);
  assert.equal(collection.skillGrants.length, 0);
  assert.equal(computeGrantedSkillsState(data, character.builder).grantedCombatSkills.some((skill) => skill.skill === "Archive"), false);
  const graph = compileCharacterGraph({ character, gameData: data });
  assert.equal(graph.diagnostics.some((diagnostic) => diagnostic.code === "unsupported-game-data-schema"), false);
  assert.equal(graph.nodes.filter((node) => node.type === "deferred-grant-effect").length, 2);
  assert.equal(graph.nodes.some((node) => node.type === "grant-answer"), false);
});

test("v3 option grants use stable option keys and cannot activate through a deferred parent", () => {
  const option = versioned({ type: "option", featureKey: "chosen-training", name: "Same label", grants: [{ type: "skill", name: "Henshin Arts", rank: 2 }] });
  const group = versioned({ type: "optionGroup", featureKey: "training", name: "Training", options: [option] });
  const builder = { classKey: "ninja", level: 1, selectedClassFeatureOptions: ["chosen-training"] };
  const data = { classFeatures: { ninja: [group] } };
  assert.equal(createCharacterGrantCollection(data, builder).skillGrants.length, 1);
  group.runtimeSupport = { status: "deferred", reasons: ["unsupported-condition"] };
  assert.equal(createCharacterGrantCollection(data, builder).skillGrants.length, 0);
});

test("graph and widget acquisition checks agree on a non-first skill route", () => {
  const technique = versioned({ techniqueKey: "shared", techniqueName: "Shared", status: "playable", rank: 2, skill: "Martial Arts, Henshin Arts", prerequisites: [], selectionRoutes: [{ type: "skill", name: "Martial Arts" }, { type: "skill", name: "Henshin Arts" }] });
  const data = { ...GRAPH_GAME_DATA, schemaVersion: 3, expressionSyntaxVersion: 3, traits: [], classFeatures: { ninja: [] }, techniques: [technique], classes: [versioned({ classKey: "ninja", name: "Ninja", status: "playable", primaryAttributeA: "Agility", combatTechniqueSkill: "Henshin Arts", combatSkills: [{ name: "Henshin Arts", progression: "fast" }] })] };
  const character = makeGraphCharacter({ level: 5, selectedTechniques: ["shared"] });
  const graph = compileCharacterGraph({ character, gameData: data });
  const selected = graph.nodes.find((node) => node.id === "technique-selection:shared");
  assert.equal(selected.state, "selected");
  assert.equal(selected.metadata.skillName, "Henshin Arts");
  assert.equal(selected.metadata.skillRank, 3);
  const context = { builder: character.builder, knownCombatSkills: new Set(["Martial Arts", "Henshin Arts"]), grantedSkillState: computeGrantedSkillsState(data, character.builder), grantedTechniqueNames: new Set(), sourceOwnedTechniqueNames: new Set() };
  const widget = Object.create(TechniquesWidget.prototype);
  widget.getGameData = () => data;
  assert.equal(widget.passesKnownSkillFilter(technique, context, data), true);
  const choice = Object.create(TechniqueChoiceWidget.prototype);
  choice.gameData = data;
  choice.grant = { skill: "Henshin Arts" };
  assert.deepEqual(choice.getAvailableTechniques(context).map((entry) => entry.techniqueKey), ["shared"]);
});

test("graph prerequisites include class-granted skill ranks for a supported OR alternative", () => {
  const technique = versioned({ techniqueKey: "deflect", techniqueName: "Deflect", status: "playable", rank: 1, skill: "Martial Arts", selectionRoutes: [{ type: "skill", name: "Martial Arts" }], prerequisites: [{ type: "any", alternatives: [{ type: "weapon", tag: "Melee", wielded: true }, { type: "skill", name: "Martial Arts", minRank: 1 }] }] });
  const data = { ...GRAPH_GAME_DATA, schemaVersion: 3, expressionSyntaxVersion: 3, traits: [], classFeatures: { ninja: [] }, techniques: [technique], classes: [versioned({ classKey: "ninja", name: "Ninja", status: "playable", primaryAttributeA: "Agility", combatTechniqueSkill: "Martial Arts", combatSkills: [{ name: "Martial Arts", progression: "fast" }] })] };
  const character = makeGraphCharacter({ level: 1, selectedTechniques: ["deflect"], weapons: [] });
  const graph = compileCharacterGraph({ character, gameData: data });
  const requirement = graph.nodes.find((node) => node.id === "requirement:technique-selection:deflect:0:any");
  assert.equal(requirement?.state, "available");
  assert.equal(graph.nodes.find((node) => node.id === "technique-selection:deflect")?.state, "selected");
  data.classes[0].combatSkills = [];
  const withoutSkill = compileCharacterGraph({ character, gameData: data });
  assert.equal(withoutSkill.nodes.find((node) => node.id === "requirement:technique-selection:deflect:0:any")?.state, "invalid");
});

test("graph weapon prerequisites use owned equipment without wielding or hand state", () => {
  const technique = versioned({ techniqueKey: "paired-strike", techniqueName: "Paired Strike", status: "playable", rank: 1, skill: "Martial Arts", selectionRoutes: [{ type: "skill", name: "Martial Arts" }], prerequisites: [{ type: "weapon-set", tag: "Melee", count: 2, wielded: true, separateHands: true }] });
  const data = { ...GRAPH_GAME_DATA, schemaVersion: 3, expressionSyntaxVersion: 3, traits: [], techniques: [technique], weaponBases: [{ weaponKey: "longsword", name: "Longsword", tags: ["Melee"] }] };
  const character = makeGraphCharacter({ selectedTechniques: ["paired-strike"] });
  const weapon = (id) => ({ id, weaponKey: "longsword", customName: "", rank: 1, enhancements: [], generated: false, choiceId: "", sourceChoiceId: "" });
  character.builder.weapons = [weapon("left-inventory"), weapon("right-inventory")];
  const requirementId = "requirement:technique-selection:paired-strike:0:weapon-set";
  const graph = compileCharacterGraph({ character, gameData: data });
  assert.equal(graph.nodes.find((node) => node.id === requirementId)?.state, "available");
  character.builder.weapons.pop();
  assert.equal(compileCharacterGraph({ character, gameData: data }).nodes.find((node) => node.id === requirementId)?.state, "invalid");
});

test("explicit conditional class progression survives into the shared skill projection", () => {
  const cls = versioned({ classKey: "weapon-master", name: "Weapon Master", combatTechniqueSkill: "Melee Weapons, Ranged Weapons", combatSkills: [
    { name: "Melee Weapons", progression: "fast", whenPrimaryAttribute: "Strength" },
    { name: "Melee Weapons", progression: "medium", whenPrimaryAttribute: "Agility" },
    { name: "Ranged Weapons", progression: "medium", whenPrimaryAttribute: "Strength" },
    { name: "Ranged Weapons", progression: "fast", whenPrimaryAttribute: "Agility" },
  ] });
  const data = { classes: [cls] };
  const ranks = (primaryAttribute) => Object.fromEntries(computeGrantedSkillsState(data, { classKey: "weapon-master", level: 5, primaryAttribute }).grantedCombatSkills.map((row) => [row.skill, row.rank]));
  assert.equal(ranks("strength")["Melee Weapons"], "3");
  assert.equal(ranks("strength")["Ranged Weapons"], "2");
  assert.equal(ranks("agility")["Melee Weapons"], "2");
  assert.equal(ranks("agility")["Ranged Weapons"], "3");
});

test("stable references resolve duplicate Technique labels and the explicit Trait identity alias", () => {
  const techniques = [{ techniqueKey: "a", techniqueName: "Same" }, { techniqueKey: "b", techniqueName: "Same" }];
  const indexes = buildTechniqueIndexes(techniques);
  assert.equal(resolveTechniqueRef("a", indexes).technique, techniques[0]);
  assert.equal(resolveTechniqueRef("b", indexes).technique, techniques[1]);
  assert.equal(resolveTechniqueRef("Same", indexes).ok, false);
  const trait = { traitKey: "integrated-weapon", name: "Integrated Weapon" };
  assert.equal(resolveTraitRef("mech-integrated-weapon", { traits: [trait] }).trait, trait);
  assert.equal(resolveTraitRef("Integrated Weapon", { traits: [trait] }).ok, false);
});

test("runtime skill-name compatibility preserves exact authored source values", () => {
  const sourceValues = { selection: "Targeting", associatedSkill: "Targeting", prerequisites: "skill | name=Targeting | minRank=1", description: "Targeting techniques" };
  const record = versioned({ skill: "Targeting", skillKeys: ["targeting"], sourceValues });
  const projected = projectSkillNames({ techniques: [record] }).techniques[0];
  assert.equal(projected.skill, "Ranged Weapons");
  assert.deepEqual(projected.skillKeys, ["ranged-weapons"]);
  assert.deepEqual(projected.sourceValues, sourceValues);
  assert.equal(projected.sourceValues.prerequisites, "skill | name=Targeting | minRank=1");
});

test("v3 weapon profiles and rank caps derive from canonical Technique relationships", () => {
  const adapted = adaptGameDataWorkbook(buildSchemaV5Workbook());
  const artifact = buildGameDataArtifacts({ model: adapted.model, validation: validateAdaptedGameData(adapted), provenance: {} });
  const weapon = artifact.combined.weaponBases[0];
  assert.equal(weapon.profiles[0].techniqueKey, "shared-strike");
  assert.deepEqual(weapon.techniqueSkills, ["Melee Weapons", "Ranged Weapons"]);
  assert.equal(getWeaponSkillRankCap(weapon, { "Melee Weapons": 1, "Ranged Weapons": 3 }), 3);
  assert.deepEqual(weapon.profiles[0].pumpingByRank, artifact.combined.techniques[0].pumpingByRank);
});

test("v3 enhancement prerequisites inspect only the candidate weapon and do not bypass manual rules", () => {
  const bases = [{ weaponKey: "sword", tags: ["Melee", "Sharp"] }, { weaponKey: "bow", tags: ["Ranged"] }];
  const enhancement = versioned({ selectionMode: "selectable", prerequisites: [{ type: "weapon", tag: "Melee" }] });
  const sword = { weaponKey: "sword", rank: 2 };
  const bow = { weaponKey: "bow", rank: 2 };
  const context = { gameData: { expressionSyntaxVersion: 3, weaponBases: bases }, builder: { weapons: [sword, bow] } };
  assert.equal(isEnhancementCompatible(enhancement, sword, bases, context), true);
  assert.equal(isEnhancementCompatible(enhancement, bow, bases, context), false);
  assert.equal(isEnhancementCompatible({ ...enhancement, prerequisites: [{ type: "text", text: "Requires a future mechanic" }] }, sword, bases, context), false);
});

test("v3 Technique display retains non-damage pumping, underlying attack, and free Reaction wording", () => {
  const html = renderTechniqueProfileHtml(versioned({ techniqueName: "Wrapper", actionType: "ActionOrFreeReaction", actions: 1, energyCostKind: "fixed", energyCost: 3, rollRequired: false, pumpingByRank: { 1: "+2 healing per Energy" }, basicAttack: [{ type: "weapon", defense: "Spiritual" }], rankNotes: "Higher-rank benefit." }), { rankValue: 1 });
  assert.match(html, /1 Action or Free Reaction \+ 3 Energy/);
  assert.match(html, /\+2 healing per Energy/);
  assert.match(html, /Weapon basic attack \(vs Spiritual Defense\)/);
  assert.match(html, /Higher-rank benefit/);
});
