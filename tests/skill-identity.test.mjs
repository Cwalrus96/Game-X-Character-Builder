import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { createCharacterMigrationReferences, migrateCharacterDocument } from "../public/js/core/character-migrations.js";
import { buildCharacterSkillProjection } from "../public/js/core/character-skill-projection.js";
import { resolveGrantChoiceAliases, resolveGrantChoiceId } from "../public/js/core/choice-identity.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";
import { meetsPrerequisites } from "../public/js/core/prerequisites.js";
import { canonicalSkillName, projectSkillNames } from "../public/js/core/skill-identity.js";
import { computeGrantedSkillsState, getCombatSkillRanks, getSkillAllocationState } from "../public/js/core/skill-rules.js";
import { renderTechniqueProfileHtml } from "../public/js/core/technique-utils.js";
import { getWeaponSkillNames, getWeaponSkillRankCap, getWeaponSkillRanks, isEnhancementCompatible } from "../public/js/core/weapon-utils.js";
import { TechniquesWidget } from "../public/js/builder/widgets/techniques-widget.js";
import { buildTechniqueChoicePatch } from "../public/js/builder/widgets/technique-choice-widget.js";
import { MIGRATION_GAME_DATA, makeV4Character } from "./fixtures/character-schemas.mjs";

const legacyData = JSON.parse(await readFile(new URL("../public/data/game-x/game-x-data.json", import.meta.url), "utf8"));

test("reviewed data projects the renamed skill while preserving generated data and entity identities", () => {
  const before = JSON.stringify(legacyData);
  const projected = projectSkillNames(legacyData);
  assert.equal(JSON.stringify(legacyData), before);
  assert.deepEqual(projectSkillNames(projected), projected);
  assert(projected.classSkills.some((row) => row.skillKey === "ranged-weapons" && row.skillName === "Ranged Weapons"));
  assert.equal(projected.classFeatures["henshin-hero"][2].options[0].featureKey, "heroic-combat-training-targeting");
  assert.equal(projected.classFeatures["henshin-hero"][2].options[0].name, "Ranged Weapons");
  assert.equal(projected.weaponEnhancements.find((row) => row.enhancementKey === "enhanced_targeting").name, "Enhanced Targeting");
  assert.match(projected.classFeatures["henshin-hero"][2].description, /combat skills: Ranged Weapons, Melee Weapons/);
  assert.doesNotMatch(projected.classFeatures["henshin-hero"][2].description, /Targeting/);
  assert.deepEqual(projectSkillNames({ name: "Targeting Computer", description: "Targeting an enemy requires an attack roll." }), {
    name: "Targeting Computer", description: "Targeting an enemy requires an attack roll.",
  });
});

test("old class grants and new source labels have the same ranks under the new skill name", () => {
  const character = createDefaultCharacter({ ownerUid: "rename_user" });
  Object.assign(character.builder, { classKey: "weapon-master", level: 5, primaryAttribute: "strength" });
  const oldState = computeGrantedSkillsState(legacyData, character.builder);
  const newState = computeGrantedSkillsState(projectSkillNames(legacyData), character.builder);
  assert.deepEqual(oldState, newState);
  assert(oldState.grantedCombatSkills.some((row) => row.skill === "Ranged Weapons" && Number(row.rank) >= 2));
  assert.equal(oldState.grantedCombatSkills.some((row) => row.skill === "Targeting"), false);
});

test("saved Targeting ranks remain effective for weapons, technique widgets, and either prerequisite spelling", () => {
  const character = createDefaultCharacter({ ownerUid: "rename_user" });
  character.builder.level = 5;
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "3" }];
  const before = structuredClone(character);
  const granted = computeGrantedSkillsState(legacyData, character.builder);
  const ranks = getWeaponSkillRanks(character.builder, granted);
  const rangedBase = legacyData.weaponBases.find((weapon) => weapon.profiles.some((profile) => profile.skill === "Targeting"));
  assert.deepEqual(getWeaponSkillNames(rangedBase), ["Ranged Weapons"]);
  assert.equal(ranks["Ranged Weapons"], 3);
  assert.equal(getWeaponSkillRankCap(rangedBase, ranks), 3);
  assert.equal(getWeaponSkillRankCap(projectSkillNames(rangedBase), { Targeting: 3 }), 3);
  assert.equal(getCombatSkillRanks(legacyData, character.builder).get("ranged weapons"), 3);
  assert.equal(getSkillAllocationState(legacyData, character.builder).combat[0].name, "Ranged Weapons");
  for (const name of ["Targeting", "targeting", "Ranged Weapons", "ranged-weapons"]) {
    assert.equal(canonicalSkillName(name), "Ranged Weapons");
    assert.equal(meetsPrerequisites([{ type: "skill", name, rank: 3 }], { builder: character.builder, grantedSkillState: granted }), true);
    assert.equal(meetsPrerequisites([{ type: "skill", name, rank: 4 }], { builder: character.builder, grantedSkillState: granted }), false);
  }
  assert.equal(TechniquesWidget.prototype.getTechniqueSkillRank({ skill: "Ranged Weapons" }, {
    builder: character.builder, grantedSkillState: granted,
  }), 3);
  assert.deepEqual(character, before);
});

test("ranged-only enhancement eligibility and attack text accept old and new profiles", () => {
  const enhancement = { prerequisites: [{ type: "text", text: "Ranged weapon only" }] };
  for (const skill of ["Targeting", "Ranged Weapons", "ranged-weapons"]) {
    const base = { weaponKey: "rifle", profiles: [{ profileType: "basicAttack", skill, attribute: "Agility", defense: "Physical" }] };
    assert.equal(isEnhancementCompatible(enhancement, { weaponKey: "rifle" }, [base]), true);
    const html = renderTechniqueProfileHtml(base.profiles[0]);
    assert.match(html, /Ranged Weapons/);
    assert.doesNotMatch(html, /Targeting/);
  }
  assert.equal(isEnhancementCompatible(enhancement, { weaponKey: "sword" }, [{ weaponKey: "sword", profiles: [{ profileType: "basicAttack", skill: "Melee Weapons" }] }]), false);
});

test("reconciliation retains a renamed technique backed by a saved extra combat rank", () => {
  const character = createDefaultCharacter({ ownerUid: "rename_user" });
  character.builder.level = 5;
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.intellect = 2;
  character.builder.attributes.agility = 2;
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "3" }];
  character.builder.selectedTechniques = ["rifle-basic-attack"];
  const gameData = { schemaVersion: 2, classes: [], classFeatures: {}, classSkills: [], origins: [], feats: [], weaponBases: [], weaponEnhancements: [], techniques: [
    { techniqueKey: "rifle-basic-attack", techniqueName: "Rifle Basic Attack", skill: "Ranged Weapons", skillKeys: ["ranged-weapons"], rank: 2, selectionMode: "selectable", prerequisites: [] },
  ] };
  const compiled = compileCharacterGraph({ character, gameData });
  const technique = compiled.nodes.find((node) => node.id === "technique-selection:rifle-basic-attack");
  assert.equal(technique.metadata.knownSkill, true);
  assert.equal(technique.metadata.skillRank, 3);
  const result = reconcileCharacterGraph({ character, previousCharacter: character, gameData });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.selectedTechniques, ["rifle-basic-attack"]);
  assert.deepEqual(result.character.builder.sheet.repeatables.combatSkillsExtra, character.builder.sheet.repeatables.combatSkillsExtra);
});

test("renaming a grant preserves its derived choice ID and historical display-case aliases", () => {
  const options = { sourceId: "class-option:ninja:ninja-combat-training-targeting", index: 1 };
  const oldGrant = { type: "weapon", skill: "Targeting", rank: 1, count: 1 };
  const oldId = resolveGrantChoiceId(oldGrant, options);
  for (const skill of ["Ranged Weapons", "ranged-weapons", "targeting"]) {
    const grant = { ...oldGrant, skill };
    assert.equal(resolveGrantChoiceId(grant, options), oldId);
    assert.deepEqual(resolveGrantChoiceAliases(grant, options), resolveGrantChoiceAliases(oldGrant, options));
    assert(resolveGrantChoiceAliases(grant, options).some((id) => id.includes(":Targeting:")));
  }
  assert.equal(resolveGrantChoiceId({ ...oldGrant, skill: "Ranged Weapons", choiceId: "targeting-explicit" }, options), "targeting-explicit");
});

test("a saved class weapon answer keeps its owner after the granting skill is renamed", () => {
  const character = createDefaultCharacter({ ownerUid: "rename_user" });
  character.builder.classKey = "henshin-hero";
  character.builder.primaryAttribute = "strength";
  character.builder.attributes.strength = 1;
  character.builder.selectedClassFeatureOptions = ["heroic-combat-training-targeting"];
  const choiceId = "heroic-combat-training-targeting:weapon:targeting:1";
  character.builder.grantChoices[choiceId] = {
    choiceId, type: "weapon", sourceId: "class-option:henshin-hero:heroic-combat-training-targeting",
    sourceLabel: "Targeting", value: "", techniqueKey: "", skillKey: "targeting", weaponKey: "rifle",
    rank: 1, customName: "My Rifle", enhancements: [], tags: [],
  };
  const result = reconcileCharacterGraph({ character, previousCharacter: character, gameData: projectSkillNames(legacyData) });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.grantChoices[choiceId], character.builder.grantChoices[choiceId]);
  assert.deepEqual(result.character.builder.selectedClassFeatureOptions, ["heroic-combat-training-targeting"]);
  assert.equal(result.character.builder.weapons[0].sourceChoiceId, choiceId);
  assert.equal(result.character.builder.weapons[0].weaponKey, "rifle");
  assert.equal(result.impacts.some((impact) => impact.code === "source-owned-weapon-removed"), false);
});

test("historical skill snapshots resolve through either source spelling without changing stored extra ranks", () => {
  const fixture = makeV4Character();
  fixture.builder.grantedSkillSnapshot = ["Targeting"];
  fixture.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "3" }];
  const before = structuredClone(fixture);
  const gameData = { ...MIGRATION_GAME_DATA, classSkills: [...MIGRATION_GAME_DATA.classSkills, { skillKey: "ranged-weapons", skillName: "Ranged Weapons" }] };
  const references = createCharacterMigrationReferences(gameData);
  assert.deepEqual(references.skills.targeting, ["ranged-weapons"]);
  const result = migrateCharacterDocument(fixture, { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.value.builder.grantedSkillSnapshot, ["ranged-weapons"]);
  assert.deepEqual(result.value.builder.sheet.repeatables.combatSkillsExtra, [{ skill: "Targeting", rank: "3" }]);
  assert.deepEqual(fixture, before);
});

test("the skill rename preserves unrelated underscore keys through migration, projection, and choice saving", () => {
  const fixture = makeV4Character();
  fixture.builder.grantedSkillSnapshot = ["custom_skill", "custom-skill"];
  const gameData = {
    ...MIGRATION_GAME_DATA,
    classes: MIGRATION_GAME_DATA.classes.map((record) => record.classKey === "ninja"
      ? { ...record, combatSkills: [{ name: "Custom Skill", progression: "fast" }] } : record),
    classSkills: [...MIGRATION_GAME_DATA.classSkills,
      { skillKey: "custom_skill", skillName: "Custom Skill" },
      { skillKey: "custom-skill", skillName: "Distinct Custom Skill" },
    ],
  };
  const references = createCharacterMigrationReferences(gameData);
  assert.deepEqual(references.skills.custom_skill, ["custom_skill"]);
  assert.deepEqual(references.skills["custom-skill"], ["custom-skill"]);
  const migrated = migrateCharacterDocument(fixture, { references });
  assert.equal(migrated.ok, true, JSON.stringify(migrated.diagnostics));
  assert.deepEqual(migrated.value.builder.grantedSkillSnapshot, ["custom_skill", "custom-skill"]);
  const projection = buildCharacterSkillProjection(gameData, migrated.value.builder);
  assert(projection.grantedSkillSnapshot.includes("custom_skill"));
  assert.equal(projection.grantedSkillSnapshot.includes("custom-skill"), false);
  const technique = { techniqueKey: "custom-technique", skillKeys: ["custom_skill"] };
  assert.equal(buildTechniqueChoicePatch(technique).skillKey, "custom_skill");
  assert.deepEqual(projectSkillNames({ skillKeys: ["custom_skill", "custom-skill", "ranged_weapons", "targeting"] }), {
    skillKeys: ["custom_skill", "custom-skill", "ranged_weapons", "ranged-weapons"],
  });
});
