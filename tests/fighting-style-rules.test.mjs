import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { getActiveFightingStyles, getFightingStyleProjection } from "../public/js/core/fighting-style-rules.js";
import { checkPrerequisites } from "../public/js/core/prerequisites.js";
import { createPrerequisiteContext } from "../public/js/core/prerequisite-rules.js";
import { getTechniqueSelectionState } from "../public/js/core/technique-rules.js";
import { reconcileCharacterGraph, createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { SetClassFeatureOptions } from "../public/js/core/character-commands.js";
import { collectAffectedNodeIds } from "../public/js/core/graph-core.js";

const keys = ["sentinel", "paired-weapons", "barrage", "marksman", "skirmisher", "titan", "guardian", "smasher", "blademaster"];
function fixture(selected = keys) {
  const builder = createDefaultCharacter({ ownerUid: "style-fixture" }).builder;
  builder.classKey = "weapon-master";
  builder.level = 2;
  builder.selectedClassFeatureOptions = selected.map(key => `${key}-style`);
  builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: "3" }];
  const version = { expressionSyntaxVersion: 3, status: "playable" };
  const gameData = { classes: [{ classKey: "weapon-master", name: "Weapon Master", ...version }],
    classFeatures: { "weapon-master": [{ type: "optionGroup", featureKey: "fighting-styles", classKey: "weapon-master",
      name: "Fighting Styles", chooseCount: keys.length, level: 1, ...version, options: keys.map(key => ({
        type: "option", featureKey: `${key}-style`, classKey: "weapon-master", name: `${key} style`,
        description: "Reviewed passive benefit. Recommended Technique: A technique.", grants: [], level: 1, ...version,
      })) }] }, weaponBases: [], classSkills: [], feats: [], origins: [], weaponEnhancements: [] };
  return { gameData, builder, project: options => getFightingStyleProjection(gameData, builder, options) };
}

test("style ownership follows active source selection, ancestor readiness and static prerequisites", () => {
  const { gameData, builder } = fixture(["barrage"]);
  const group = gameData.classFeatures["weapon-master"][0];
  const barrage = group.options.find(row => row.featureKey === "barrage-style");
  assert.deepEqual(getActiveFightingStyles(gameData, builder).map(row => row.key), ["barrage-style"]);
  barrage.prerequisites = [{ type: "attribute", key: "strength", minValue: 3 }];
  assert.equal(getActiveFightingStyles(gameData, builder).length, 0);
  builder.attributes.strength = 3;
  assert.equal(getActiveFightingStyles(gameData, builder).length, 1);
  group.status = "draft";
  assert.equal(getActiveFightingStyles(gameData, builder).length, 0);
  group.status = "playable";
  group.level = 3;
  assert.equal(getActiveFightingStyles(gameData, builder).length, 0);
  group.level = 1;
  builder.selectedClassFeatureOptions = [];
  assert.equal(getActiveFightingStyles(gameData, builder).length, 0);
});

test("Barrage supplies Returning on every thrown weapon, independently of the soulbound owner", () => {
  const { project, gameData } = fixture(["barrage"]);
  for (const sourceId of ["", "class-feature:another-source", "trait:body"]) {
    const weapon = { id: sourceId || "ordinary", tags: ["Thrown", "One-Handed"], sourceId };
    assert.deepEqual(project({ weapon }).effectiveWeaponTags, ["Thrown", "One-Handed", "Returning"]);
    assert.deepEqual(weapon.tags, ["Thrown", "One-Handed"]);
  }
  assert.deepEqual(project({ weapon: { tags: ["Ranged"] } }).effectiveWeaponTags, ["Ranged"]);
  assert.deepEqual(project({ weapon: { tags: ["Thrown", "returning"] } }).effectiveWeaponTags, ["Thrown", "returning"]);
  gameData.weaponBases.push({ weaponKey: "throwing-blade", tags: ["Thrown"] });
  assert.deepEqual(project({ weapon: { weaponKey: "throwing-blade" } }).effectiveWeaponTags, ["Thrown", "Returning"]);
});

test("Smasher exposes source-owned Bash only on blunt weapons without granting recommended Techniques", () => {
  const { project } = fixture(["smasher"]);
  const action = project({ weapon: { tags: ["Blunt"] } }).grantedActions[0];
  assert.equal(action.name, "Bash");
  assert.equal(action.sourceId, "class-option:weapon-master:smasher-style");
  assert.deepEqual(action.outcome, { failurePush: 1, successPushBase: 1, additionalPushPerExcessHit: 1 });
  assert.equal(action.techniqueKey, undefined);
  assert.deepEqual(project({ weapon: { tags: ["Sharp"] } }).grantedActions, []);
});

test("Sentinel uses actual Melee Weapons rank only for nonadjacent Reach melee hits", () => {
  const { project } = fixture(["sentinel"]);
  const weapon = { tags: ["Melee", "Reach +2"] };
  const active = project({ weapon, conditions: { targetNotAdjacent: true } });
  assert.equal(active.rollEffects.damageBonus, 6);
  assert.equal(active.rollEffects.damageBonusOnHit, true);
  assert.equal(project({ weapon }).rollEffects.damageBonus, 0);
  assert.equal(project({ weapon: { tags: ["Melee"] }, conditions: { targetNotAdjacent: true } }).rollEffects.damageBonus, 0);
  assert.equal(project({ weapon, attackKind: "ranged", conditions: { targetNotAdjacent: true } }).rollEffects.damageBonus, 0);
  const mixed = { tags: ["Melee", "Thrown", "Reach 2"] };
  assert.equal(project({ weapon: mixed, conditions: { targetNotAdjacent: true } }).rollEffects.damageBonus, 0);
  assert.equal(project({ weapon: mixed, conditions: { targetNotAdjacent: true, attackIsMelee: true } }).rollEffects.damageBonus, 6);
  assert.equal(project({ weapon: mixed, profile: { range: "Melee; Reach +1" }, conditions: { targetNotAdjacent: true } }).rollEffects.damageBonus, 6);
  assert.equal(project({ weapon: mixed, profile: { range: "Thrown 5" }, conditions: { targetNotAdjacent: true } }).rollEffects.damageBonus, 0);
  const rangedProfile = project({ weapon: mixed, profile: { range: "Range 6" }, conditions: { targetNotAdjacent: true, attackIsMelee: true } });
  assert.equal(rangedProfile.rollEffects.damageBonus, 0);
  assert.equal(rangedProfile.conditionChoices.some(choice => choice.key === "attackIsMelee"), false);
  const ambiguousWrapper = project({ weapon: mixed, profile: { range: "Melee; Reach +1" }, attackKind: "",
    conditions: { targetNotAdjacent: true } });
  assert.equal(ambiguousWrapper.rollEffects.damageBonus, 0);
  assert.equal(ambiguousWrapper.conditionChoices.some(choice => choice.key === "attackIsMelee"), true);
});

test("Marksman doubles range only when Aim is explicitly active on a ranged attack", () => {
  const { project } = fixture(["marksman"]);
  const weapon = { tags: ["Ranged"] };
  assert.equal(project({ weapon }).rollEffects.rangeMultiplier, 1);
  assert.equal(project({ weapon, conditions: { aimed: true } }).rollEffects.rangeMultiplier, 2);
  assert.equal(project({ weapon: { tags: ["Thrown"] }, conditions: { aimed: true } }).rollEffects.rangeMultiplier, 1);
  assert.equal(project({ weapon, rollKind: "check", conditions: { aimed: true } }).rollEffects.rangeMultiplier, 1);
  assert.equal(project({ weapon: { tags: ["Ranged 20"] }, profile: { range: "Ranged 20" }, conditions: { aimed: true } }).effectiveRange, "Ranged 40");
  assert.equal(project({ weapon, profile: { range: "Range 20" }, conditions: { aimed: true } }).effectiveRange, "Range 40");
  assert.equal(project({ weapon, profile: { range: "Range 20 squares" }, conditions: { aimed: true } }).effectiveRange, "Range 40 squares");
  assert.equal(project({ weapon, profile: { range: "Range 20" } }).effectiveRange, "Range 20");
  for (const range of ["Range 20 + 5 per rank", "Range 20 / 40", "Weapon Range", "A 2 by 2 square area within Range 20."]) {
    const projection = project({ weapon, profile: { range }, conditions: { aimed: true } });
    assert.equal(projection.rollEffects.rangeMultiplier, 2);
    assert.equal(projection.rangeSource, range);
    assert.equal(projection.rangeCalculated, false);
    assert.equal(projection.effectiveRange, "", "unsupported expressions must not masquerade as a calculated range");
  }
});

test("Barrage Returning is a static owned-weapon prerequisite fact without persisting tags or requiring wielded state", () => {
  const { gameData, builder } = fixture(["barrage"]);
  const weapon = { id: "unbound-weapon", weaponKey: "spear", tags: ["Melee", "Sharp", "Reach +1", "Versatile", "Thrown 5"], rank: 1, enhancements: [] };
  builder.weapons = [weapon];
  const before = structuredClone(builder);
  const input = { gameData, builder, syntaxVersion: 3 };
  const requirement = [{ type: "weapon", tag: "Returning", wielded: true }];
  assert.equal(checkPrerequisites(requirement, input).ok, true);
  assert.equal(createPrerequisiteContext(input).weapons[0].tags.includes("Returning"), true);
  assert.equal(checkPrerequisites([{ type: "tag", tag: "Returning" }], input).ok, false, "Returning belongs to the weapon, not the character");
  assert.deepEqual(builder, before);
  builder.selectedClassFeatureOptions = [];
  assert.equal(checkPrerequisites(requirement, input).ok, false);
  assert.equal(weapon.tags.includes("Returning"), false);
});

test("Barrage eligibility cannot bootstrap its own Returning prerequisite and source-choice tags use the same projection", () => {
  const { gameData, builder } = fixture(["barrage"]);
  builder.weapons = [{ id: "spear", weaponKey: "spear", tags: ["Thrown 5"], rank: 1, enhancements: [], sourceChoiceId: "soulbound" }];
  const input = { gameData, builder, syntaxVersion: 3 };
  assert.equal(checkPrerequisites([{ type: "choice", choiceRef: "soulbound", tag: "Returning" }], input).ok, true);
  builder.weapons[0].effectiveTags = ["Thrown 5"];
  assert.equal(checkPrerequisites([{ type: "choice", choiceRef: "soulbound", tag: "Returning" }], input).ok, true);
  const callbackWeapon = { weaponKey: "spear", tags: ["Thrown 5"] };
  const resolvedInput = { ...input, resolveChoice: key => key === "callback-choice" ? callbackWeapon : null };
  assert.equal(checkPrerequisites([{ type: "choice", choiceRef: "callback-choice", tag: "Returning" }], resolvedInput).ok, true);
  assert.deepEqual(callbackWeapon.tags, ["Thrown 5"], "resolver records remain unchanged");
  builder.selectedClassFeatureOptions = [];
  assert.equal(checkPrerequisites([{ type: "choice", choiceRef: "callback-choice", tag: "Returning" }], resolvedInput).ok, false);
  builder.selectedClassFeatureOptions = ["barrage-style"];
  gameData.classFeatures["weapon-master"][0].options.find(row => row.featureKey === "barrage-style").prerequisites = [{ type: "weapon", tag: "Returning" }];
  assert.equal(checkPrerequisites([{ type: "weapon", tag: "Returning" }], input).ok, false);
});

test("losing Barrage reviews dependent Technique removal and cancellation leaves the character untouched", () => {
  const { gameData, builder } = fixture(["barrage"]);
  gameData.schemaVersion = 3;
  gameData.expressionSyntaxVersion = 3;
  Object.assign(gameData.classes[0], { primaryAttributeA: "Strength", primaryAttributeB: "Agility", combatTechniqueSkill: "Melee Weapons" });
  builder.primaryAttribute = "strength";
  builder.attributes.strength = 1;
  builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: "1" }];
  gameData.weaponBases = [{ weaponKey: "spear", name: "Spear", expressionSyntaxVersion: 3, status: "playable", minRank: 1, techniqueSkills: ["Melee Weapons"], tags: ["Melee", "Thrown 5"] }];
  builder.weapons = [{ id: "spear", weaponKey: "spear", customName: "", rank: 1, enhancements: [], choiceId: "", generated: false, sourceChoiceId: "" }];
  const technique = { techniqueKey: "returning-strike", techniqueName: "Returning Strike", expressionSyntaxVersion: 3, status: "playable", rank: 1,
    selectionRoutes: [{ type: "skill", name: "Melee Weapons" }], prerequisites: [{ type: "weapon", tag: "Returning" }] };
  gameData.techniques = [technique];
  builder.originKey = "rebound-origin";
  gameData.origins = [{ originKey: "rebound-origin", name: "Rebound", expressionSyntaxVersion: 3, status: "playable",
    features: [{ featureKey: "returning-finesse", originKey: "rebound-origin", name: "Returning Finesse", type: "feature",
      expressionSyntaxVersion: 3, status: "playable", description: "A benefit requiring Returning.", prerequisites: [{ type: "weapon", tag: "Returning" }], grants: [] }] }];
  builder.selectedTechniques = [technique.techniqueKey];
  assert.equal(getTechniqueSelectionState(technique, { gameData, builder }).prerequisitesMet, true);
  const character = { ...createDefaultCharacter({ ownerUid: "style-fixture" }), builder };
  const settled = reconcileCharacterGraph({ character, gameData });
  assert.equal(settled.ok, true, JSON.stringify(settled.impacts));
  assert.deepEqual(settled.character.builder.selectedTechniques, [technique.techniqueKey], JSON.stringify(settled.impacts));
  assert.equal(collectAffectedNodeIds(settled.graph, ["class-option:weapon-master:barrage-style"]).includes("technique-selection:returning-strike"), true);
  assert.equal(collectAffectedNodeIds(settled.graph, ["class-option:weapon-master:barrage-style"]).includes("origin-feature:rebound-origin:returning-finesse"), true,
    "an Origin compiled before the Class style still has its dependency edge");
  const session = new CharacterSession({ character: settled.character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const proposal = session.propose(SetClassFeatureOptions([]));
  assert.equal(proposal.ok, true, JSON.stringify(proposal.impacts));
  assert.equal(proposal.requiresConfirmation, true);
  assert.deepEqual(proposal.reconciled.builder.selectedTechniques, []);
  session.cancelProposal(proposal.proposalId);
  assert.deepEqual(session.getState().working, settled.character);
  const accepted = session.propose(SetClassFeatureOptions([]));
  session.acceptProposal(accepted.proposalId, { confirm: true });
  assert.deepEqual(session.createSaveSnapshot().character, accepted.reconciled);
});

test("Skirmisher records adjacency immunity without inventing a positive attack bonus", () => {
  const { project } = fixture(["skirmisher"]);
  for (const tag of ["Thrown", "Ranged"]) {
    const result = project({ weapon: { tags: [tag] }, conditions: { targetAdjacent: true } });
    assert.equal(result.rollEffects.ignoreAdjacentRangedPenalty, true);
    assert.match(result.reminders[0].text, /no reactions/);
    assert.equal(result.rollEffects.attackDiceBonus, undefined);
  }
  assert.equal(project({ weapon: { tags: ["Melee"] }, conditions: { targetAdjacent: true } }).rollEffects.ignoreAdjacentRangedPenalty, false);
});

test("Titan reports a temporary target debuff only on critical Heavy melee attacks", () => {
  const { project } = fixture(["titan"]);
  const weapon = { tags: ["Melee", "Heavy"] };
  assert.deepEqual(project({ weapon }).triggeredEffects, []);
  assert.equal(project({ weapon, conditions: { criticalSuccess: true } }).triggeredEffects[0].dicePenalty, 1);
  assert.deepEqual(project({ weapon: { tags: ["Melee", "Two-Handed"] }, conditions: { criticalSuccess: true } }).triggeredEffects, []);
  assert.deepEqual(project({ weapon, attackKind: "thrown", conditions: { criticalSuccess: true } }).triggeredEffects, []);
});

test("Guardian applies only to a subsequent defense roll with the Parry duration confirmed", () => {
  const { project } = fixture(["guardian"]);
  assert.equal(project({ rollKind: "defense", conditions: { afterParry: true } }).rollEffects.defenseDiceBonus, 1);
  assert.equal(project({ rollKind: "defense" }).rollEffects.defenseDiceBonus, 0);
  assert.equal(project({ rollKind: "attack", conditions: { afterParry: true } }).rollEffects.defenseDiceBonus, 0);
  assert.deepEqual(project({ rollKind: "attack" }).conditionChoices, []);
});

test("Blademaster affects a bleeding target's defense against any attack, never the player's attack pool", () => {
  const { project } = fixture(["blademaster"]);
  const active = project({ conditions: { targetBleeding: true } });
  assert.equal(active.rollEffects.targetDefenseDicePenalty, 1);
  assert.equal(active.rollEffects.attackDiceBonus, undefined);
  assert.equal(project({ rollKind: "defense", conditions: { targetBleeding: true } }).rollEffects.targetDefenseDicePenalty, 0);
  assert.equal(project({ rollKind: "check", conditions: { targetBleeding: true } }).rollEffects.targetDefenseDicePenalty, 0);
});

test("Paired flanking stays a conditional reminder and all projections leave character/catalogue state unchanged", () => {
  const { gameData, builder, project } = fixture();
  const before = JSON.stringify({ gameData, builder });
  const weapon = { tags: ["Melee", "One-Handed", "Heavy", "Blunt", "Reach +1"] };
  const projection = project({ weapon, conditions: { afterParry: true, targetBleeding: true, targetNotAdjacent: true } });
  assert.match(projection.reminders.find(row => row.styleKey === "paired-weapons-style").text, /one fewer adjacent enemy/);
  assert.deepEqual(project({ weapon, conditions: { afterParry: true, targetBleeding: true, targetNotAdjacent: true } }), projection);
  assert.equal(JSON.stringify({ gameData, builder }), before);
  assert.equal(projection.activeStyles.length, 9);
  assert.equal(projection.grantedTechniques, undefined);
  builder.selectedClassFeatureOptions.push("improved-fighting-styles-enhanced");
  assert.equal(project({ weapon }).activeStyles.length, 9);
});
