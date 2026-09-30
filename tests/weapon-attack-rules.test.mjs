import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { getWeaponAttackProfile, getWeaponAttackKind } from "../public/js/core/weapon-attack-rules.js";
import { getRollAttribute, getTechniqueRollChoices } from "../public/js/core/sheet-roll-context.js";
import { summarizeWeaponProfilesHtml } from "../public/js/core/weapon-utils.js";
import { renderGrantedWeaponHtml } from "../public/js/core/weapon-grant-display.js";
import { renderSelectedWeaponHtml } from "../public/js/builder/widgets/selected-choice-display.js";
import { getFightingStyleProjection } from "../public/js/core/fighting-style-rules.js";

function fixture() {
  const ready = { expressionSyntaxVersion: 3, status: "playable", runtimeSupport: { status: "supported", reasons: [] } };
  const attack = { ...ready, techniqueKey: "blade-attack", techniqueName: "Blade Attack", profileType: "technique", profileName: "Blade Attack",
    rank: 1, rollRequired: true, attribute: "Strength", skill: "Melee Weapons", associatedSkill: "Melee Weapons", defense: "Physical",
    damage: "3 + Hits; +3 damage per weapon rank above 1.", selectionRoutes: [{ type: "granted" }], prerequisites: [{ type: "weapon", key: "blade" }] };
  const base = { ...ready, weaponKey: "blade", name: "Blade", tags: ["Melee"], minRank: 1, techniqueKeys: [attack.techniqueKey], techniqueSkills: ["Melee Weapons"], profiles: [attack] };
  const data = { schemaVersion: 3, sourceSchemaVersion: 5, expressionSyntaxVersion: 3, classes: [], classFeatures: {}, classSkills: [], origins: [], feats: [], traits: [],
    techniques: [attack], weaponBases: [base], weaponEnhancements: [{ ...ready, enhancementKey: "agile_weapon", name: "Agile Weapon", minRank: 1 }] };
  const character = createDefaultCharacter({ ownerUid: "weapon-attack-test" });
  character.builder.primaryAttribute = "agility";
  character.builder.attributes = { strength: 1, agility: 4, intellect: 0, willpower: 0, heart: 0, attunement: 0 };
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: "2" }];
  const ordinary = { id: "ordinary-blade", weaponKey: "blade", rank: 2, customName: "", enhancements: [] };
  const agile = { ...structuredClone(ordinary), id: "agile-blade", enhancements: [{ id: "agile", enhancementKey: "agile_weapon", rank: 1, selections: {} }] };
  const granted = { ...structuredClone(agile), id: "granted-blade", sourceChoiceId: "armament" };
  character.builder.weapons = [ordinary, agile, granted];
  return { character, data, attack, base, ordinary, agile, granted };
}

test("Agile Weapon changes only its own Strength attacks and never mutates catalogue or character data", () => {
  const f = fixture(), before = structuredClone(f);
  assert.equal(getWeaponAttackProfile(f.attack, f.agile).attribute, "Agility");
  assert.equal(getWeaponAttackProfile(f.attack, f.granted).attribute, "Agility");
  assert.equal(getWeaponAttackProfile(f.attack, f.ordinary).attribute, "Strength");
  assert.equal(getWeaponAttackProfile(f.attack, null).attribute, "Strength");
  assert.equal(getWeaponAttackProfile(f.attack, { enhancements: [{ enhancementKey: "unrelated", name: "Agile Weapon" }] }).attribute, "Strength");
  for (const attribute of ["Agility", "Willpower", "Primary"]) assert.equal(getWeaponAttackProfile({ ...f.attack, attribute }, f.agile).attribute, attribute);
  const projected = getWeaponAttackProfile(f.attack, f.agile);
  assert.deepEqual(getWeaponAttackProfile(projected, f.agile), projected);
  assert.deepEqual(f, before);
});

test("ordinary and source-owned weapon rolls use their own enhancement rather than the primary attribute", () => {
  const { character, data, attack } = fixture(), before = structuredClone(character);
  const { choices, diagnostics } = getTechniqueRollChoices({ technique: attack, gameData: data, builder: character.builder });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(choices.map(choice => [choice.weapon.id, choice.profile.attribute]), [
    ["ordinary-blade", "Strength"], ["agile-blade", "Agility"], ["granted-blade", "Agility"],
  ]);
  for (const choice of choices) {
    const resolved = getRollAttribute(choice.profile, choice.skills[0], character.builder, data);
    assert.equal(resolved.key, choice.weapon.id === "ordinary-blade" ? "strength" : "agility");
    assert.equal(resolved.fixed, true);
    const scoped = getTechniqueRollChoices({ technique: attack, gameData: data, builder: character.builder, weaponId: choice.weapon.id });
    assert.deepEqual(scoped.choices.map(row => row.profile.attribute), [choice.profile.attribute]);
  }
  assert.deepEqual(character, before);
});

test("underlying weapon attacks inherit Agile Weapon while explicit Technique overrides remain authoritative", () => {
  const { character, data, attack } = fixture();
  const wrapper = { ...attack, techniqueKey: "wrapper", rollRequired: false, basicAttack: [{ type: "weapon" }] };
  const choices = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder }).choices;
  assert.deepEqual(choices.map(choice => choice.profile.attribute), ["Strength", "Agility", "Agility"]);
  for (const attribute of ["Strength", "Willpower"]) {
    const overridden = { ...wrapper, basicAttack: [{ type: "weapon", attribute, defense: "Mental" }] };
    const result = getTechniqueRollChoices({ technique: overridden, gameData: data, builder: character.builder });
    assert.equal(result.choices.length, 3);
    assert.ok(result.choices.every(choice => choice.profile.attribute === attribute && choice.profile.defense === "Mental"));
  }
});

test("Weapon Attribute uses the enhanced underlying attack without guessing across unlike attacks", () => {
  const { character, data, attack, agile } = fixture();
  const technique = { ...attack, techniqueKey: "inherited", attribute: "Weapon Attribute" };
  const choices = getTechniqueRollChoices({ technique, gameData: data, builder: character.builder }).choices;
  assert.deepEqual(choices.map(choice => choice.profile.attribute), ["Strength", "Agility", "Agility"]);
  assert.equal(getWeaponAttackProfile(technique, agile, { profiles: [attack] }).attribute, "Agility");
  assert.equal(getWeaponAttackProfile(technique, agile, { profiles: [attack, { ...attack, attribute: "Willpower" }] }).attribute, "Weapon Attribute");
  const wrapper = { ...attack, techniqueKey: "wrapper", rollRequired: false, basicAttack: [{ type: "weapon", attribute: "Weapon Attribute" }] };
  assert.deepEqual(getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder }).choices.map(choice => choice.profile.attribute), ["Strength", "Agility", "Agility"]);
});

test("sheet and builder weapon cards share enhancement-aware attack text and preserve catalogue previews", () => {
  const { character, data, attack, base, ordinary, agile, granted } = fixture();
  assert.match(summarizeWeaponProfilesHtml(base, 2), /Strength \(Melee Weapons\)/);
  assert.match(summarizeWeaponProfilesHtml(base, 2, { weapon: ordinary }), /Strength \(Melee Weapons\)/);
  for (const weapon of [agile, granted]) {
    const controls = [];
    const sheet = summarizeWeaponProfilesHtml(base, 2, { weapon, renderRollButton: profile => { controls.push(profile); return ""; } });
    const builder = renderSelectedWeaponHtml({ choiceId: weapon.id, weapon, weaponBases: data.weaponBases });
    for (const html of [sheet, builder]) {
      assert.match(html, /Agility \(Melee Weapons\)/);
      assert.doesNotMatch(html, /Strength \(Melee Weapons\)/);
    }
    assert.equal(controls[0], attack, "roll intents retain the original profile so explicit overrides are resolved once");
  }
  const derived = { ...agile, derived: true, name: "Granted Blade", sourceLabel: "Trait", associatedSkill: "Melee Weapons", techniqueKeys: [attack.techniqueKey], tags: ["Melee"] };
  assert.match(renderGrantedWeaponHtml(derived, { gameData: data, builder: character.builder }), /Agility \(Melee Weapons\)/);
  assert.equal(attack.attribute, "Strength");
});

function withStyles(f, keys) {
  const ready = { expressionSyntaxVersion: 3, status: "playable" };
  f.character.builder.classKey = "weapon-master";
  f.character.builder.level = 2;
  f.character.builder.selectedClassFeatureOptions = keys;
  f.data.classes = [{ ...ready, classKey: "weapon-master", name: "Weapon Master" }];
  f.data.classFeatures = { "weapon-master": [{ ...ready, classKey: "weapon-master", type: "optionGroup", featureKey: "styles", name: "Styles", level: 1, chooseCount: keys.length,
    options: keys.map(featureKey => ({ ...ready, classKey: "weapon-master", type: "option", featureKey, name: featureKey, level: 1, grants: [] })) }] };
  return f;
}

test("Barrage's Returning reaches ordinary and granted weapon previews and roll contexts without stored tag changes", () => {
  const f = withStyles(fixture(), ["barrage-style"]);
  f.base.tags.push("Thrown");
  const before = structuredClone(f);
  const result = getTechniqueRollChoices({ technique: f.attack, gameData: f.data, builder: f.character.builder });
  assert.equal(result.choices.length, 3);
  for (const choice of result.choices) assert.ok(choice.weapon.tags.includes("Returning"));
  for (const weapon of [f.ordinary, f.granted]) {
    const html = renderSelectedWeaponHtml({ choiceId: weapon.id, weapon, weaponBases: f.data.weaponBases, gameData: f.data, builder: f.character.builder });
    assert.match(html, /Returning/);
  }
  assert.deepEqual(f, before);
  f.character.builder.selectedClassFeatureOptions = [];
  const removed = getTechniqueRollChoices({ technique: f.attack, gameData: f.data, builder: f.character.builder });
  assert.ok(removed.choices.every(choice => !choice.weapon.tags.includes("Returning")));
});

test("Smasher displays Bash's push action without inventing a damage profile or a recommended Technique grant", () => {
  const f = withStyles(fixture(), ["smasher-style"]);
  f.base.tags.push("Blunt");
  const before = structuredClone(f);
  const fightingStyle = getFightingStyleProjection(f.data, f.character.builder, { weapon: { ...f.ordinary, tags: f.base.tags } });
  const controls = [];
  const html = summarizeWeaponProfilesHtml(f.base, 2, { weapon: f.ordinary, fightingStyle, renderRollButton: profile => { controls.push(profile); return ""; } });
  assert.match(html, /Bash/);
  assert.match(html, /On a failure, push the target 1 square/);
  assert.match(html, /every hit exceeding its Defense/);
  assert.equal(controls.length, 1, "only the authored attack offers a roll");
  assert.equal(controls[0], f.attack);
  assert.deepEqual(f, before);
});

test("wrapper delivery uses its explicit range before the underlying attack's range for Fighting Styles", () => {
  const f = withStyles(fixture(), ["sentinel-style", "titan-style", "skirmisher-style", "barrage-style"]);
  f.base.tags.push("Thrown 5", "Reach +1", "Heavy");
  f.attack.range = "Melee, Reach +1";
  const wrapper = { ...f.attack, techniqueKey: "volley", rollRequired: false, range: "A 2 by 2 square area within the weapon's thrown range.", basicAttack: [{ type: "weapon" }] };
  const conditions = { targetNotAdjacent: true, targetAdjacent: true, criticalSuccess: true };
  const ordinary = getTechniqueRollChoices({ technique: f.attack, gameData: f.data, builder: f.character.builder }).choices[0];
  const thrown = getTechniqueRollChoices({ technique: wrapper, gameData: f.data, builder: f.character.builder }).choices[0];
  const project = choice => getFightingStyleProjection(f.data, f.character.builder, { weapon: choice.weapon, profile: choice.profile, attackKind: choice.attackKind, conditions });
  assert.equal(ordinary.attackKind, "melee");
  assert.equal(thrown.attackKind, "thrown");
  assert.equal(thrown.profile.range, f.attack.range, "damage/attribute profile retains the original underlying mechanics");
  assert.equal(project(ordinary).rollEffects.damageBonus, 4);
  assert.ok(project(ordinary).effectiveWeaponTags.includes("Returning"), "Sentinel rank calculation and Barrage coexist without recursion");
  assert.equal(project(ordinary).triggeredEffects.length, 1);
  assert.equal(project(thrown).rollEffects.damageBonus, 0);
  assert.deepEqual(project(thrown).triggeredEffects, []);
  assert.equal(project(thrown).rollEffects.ignoreAdjacentRangedPenalty, true);
  assert.equal(getWeaponAttackKind([{ range: "Range 6" }]), "ranged");
  assert.equal(getWeaponAttackKind([{ range: "Melee or Thrown 5" }, f.attack]), "");
  const mixed = getTechniqueRollChoices({ technique: { ...wrapper, range: "Melee or Thrown 5" }, gameData: f.data, builder: f.character.builder }).choices[0];
  assert.equal(mixed.attackKind, "");
  assert.equal(project(mixed).rollEffects.damageBonus, 0);
  assert.ok(project(mixed).conditionChoices.some(condition => condition.key === "attackIsMelee"));
  assert.equal(getFightingStyleProjection(f.data, f.character.builder, { weapon: mixed.weapon, profile: mixed.profile, attackKind: mixed.attackKind,
    conditions: { ...conditions, attackIsMelee: true } }).rollEffects.damageBonus, 4);
  assert.equal(getWeaponAttackKind([{ description: "Make a thrown attack." }]), "", "prose does not become executable context");
});
