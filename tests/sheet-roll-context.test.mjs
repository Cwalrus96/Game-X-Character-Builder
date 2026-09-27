import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getRollSkills, getRollAttribute, getTechniqueRollChoices, getTechniqueRollAdjustments } from "../public/js/core/sheet-roll-context.js";
import { naturalFixture } from "./fixtures/natural-weapons.mjs";

function fixture() {
  const f = naturalFixture();
  f.character.builder.attributes = { strength: 3, agility: 2, intellect: 0, willpower: 1, heart: 0, attunement: 1 };
  for (const technique of f.data.techniques) Object.assign(technique, { rollRequired: true, attribute: "Strength", damage: "3 + Hits; +3 damage per rank above 0." });
  return f;
}

test("roll skills use effective grant ranks and universal untrained combat skills", () => {
  const { data, character } = fixture();
  const skills = getRollSkills(data, character.builder);
  assert.equal(skills.find(row => row.name === "Metamorphosis").rank, 2);
  for (const name of ["Martial Arts", "Melee Weapons", "Ranged Weapons"]) assert.equal(skills.find(row => row.name === name).rank, 0);
  assert.deepEqual(skills.find(row => row.name === "Physical Defense").attributes, ["strength", "agility"]);
});

test("fixed, primary, borrowed and defense attributes resolve without guessing", () => {
  const { data, character } = fixture();
  const builder = { ...character.builder, classKey: "test", primaryAttribute: "agility" };
  data.classes = [{ classKey: "test", combatTechniqueSkill: "Metamorphosis" }];
  assert.deepEqual(getRollAttribute({ attribute: "Strength" }, {}, builder, data), { key: "strength", fixed: true, note: "" });
  assert.equal(getRollAttribute({ attribute: "Primary" }, { name: "Metamorphosis" }, builder, data).key, "agility");
  assert.equal(getRollAttribute({ attribute: "Primary" }, { name: "Martial Arts" }, builder, data).key, "");
  const defense = getRollSkills(data, builder).find(row => row.name === "Physical Defense");
  assert.equal(getRollAttribute({}, defense, builder, data).key, "strength");
});

test("technique rolls include permitted skill substitutions and preserve provider ranks", () => {
  const { data, character, get } = fixture();
  let result = getTechniqueRollChoices({ technique: get("basic"), gameData: data, builder: character.builder });
  assert.equal(result.choices[0].skills[0].name, "Metamorphosis");
  assert.equal(result.choices[0].skills[0].rank, 2);
  result = getTechniqueRollChoices({ technique: get("crush"), gameData: data, builder: character.builder, provider: { skillName: "Metamorphosis", rank: 4 } });
  assert.equal(result.choices[0].skills[0].rank, 4);
});

test("weapon wrappers resolve only eligible owned attacks and apply typed overrides", () => {
  const { data, character, get } = fixture();
  const wrapper = { ...get("heavy"), techniqueKey: "wrapper", rollRequired: false, basicAttack: [{ type: "weapon", attribute: "Willpower", defense: "Mental Defense" }] };
  const result = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder });
  assert.equal(result.choices.length, 2);
  assert.equal(new Set(result.choices.map(choice => choice.weapon.id)).size, 2);
  for (const choice of result.choices) {
    assert.equal(choice.profile.techniqueKey, "crush");
    assert.equal(choice.profile.attribute, "Willpower");
    assert.equal(choice.profile.defense, "Mental Defense");
    assert.equal(choice.noRoll, false);
    assert.equal(choice.skills[0].rank, choice.weapon.rank);
    assert.equal(choice.profiles.length, 2);
  }
  const scoped = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder, weaponId: result.choices[0].weapon.id });
  assert.equal(scoped.choices.length, 1);
  const missing = getTechniqueRollChoices({ technique: { ...wrapper, prerequisites: [{ type: "weapon", tag: "Sharp" }] }, gameData: data, builder: character.builder });
  assert.equal(missing.choices.length, 0);
  assert.equal(missing.diagnostics.length, 1);
});

test("typed alternatives support a named attack and weapon attacks without duplicate rolls", () => {
  const { data, character, get } = fixture();
  const wrapper = { ...get("basic"), techniqueKey: "wrapper", rollRequired: false, basicAttack: [{ type: "any", alternatives: [{ type: "technique", key: "basic" }, { type: "weapon" }] }] };
  const result = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder });
  assert.equal(result.choices.length, 3);
  assert.equal(result.choices.filter(choice => !choice.weapon).length, 1);
});

test("wrapper cycles, unfinished attacks and missing references fail explicitly", () => {
  const { data, character, get } = fixture();
  const wrapper = { ...get("basic"), techniqueKey: "wrapper", rollRequired: false, basicAttack: [{ type: "technique", key: "wrapper" }] };
  data.techniques.push(wrapper);
  let result = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder });
  assert.equal(result.choices.length, 0);
  assert.match(result.diagnostics[0], /circular/);
  wrapper.basicAttack[0].key = "missing";
  result = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder });
  assert.match(result.diagnostics[0], /not be found/);
  result = getTechniqueRollChoices({ technique: { ...get("basic"), status: "draft" }, gameData: data, builder: character.builder });
  assert.equal(result.choices.length, 0);
});

test("a skill-tagged technique can use a trained utility skill and explicit alternatives", () => {
  const { data, character, get } = fixture();
  character.builder.sheet.fields.rank_athletics = "2";
  const result = getTechniqueRollChoices({ technique: { ...get("basic"), associatedSkill: "Athletics, Martial Arts" }, gameData: data, builder: character.builder });
  assert.equal(result.choices[0].skills.find(skill => skill.name === "Athletics").rank, 2);
  assert.ok(result.choices[0].skills.some(skill => skill.name === "Martial Arts"));
});

test("weapon-set requirements retain both owned weapons when choosing one attack", () => {
  const { data, character, get } = fixture();
  const wrapper = { ...get("dual"), rollRequired: false, basicAttack: [{ type: "weapon" }] };
  const result = getTechniqueRollChoices({ technique: wrapper, gameData: data, builder: character.builder });
  assert.equal(result.choices.length, 2);
  assert.ok(result.choices.every(choice => choice.weapon.derived));
});

test("no-roll techniques keep their effects without inventing an independent roll", () => {
  const { data, character, get } = fixture();
  const result = getTechniqueRollChoices({ technique: { ...get("basic"), rollRequired: false, damage: null }, gameData: data, builder: character.builder });
  assert.equal(result.choices[0].noRoll, true);
  assert.equal(result.choices[0].profiles.length, 1);
});

test("exact authored attack penalties and doubled damage Hits remain separate from rolled Hits", () => {
  assert.deepEqual(getTechniqueRollAdjustments([{ description: "You take a -2 penalty to the attack roll. Double the “Hits” for the purpose of calculating the attack’s damage." }]), { dice: -2, hitsMultiplier: 2 });
  assert.deepEqual(getTechniqueRollAdjustments([{ description: "A strong attack." }]), { dice: 0, hitsMultiplier: 1 });
});

test("roll widget is transient, outside the sheet and has no save-owned input names", async () => {
  const source = await readFile(new URL("../public/js/builder/widgets/roll-widget.js", import.meta.url), "utf8");
  assert.match(source, /document\.body\.append\(dialog\)/);
  assert.doesNotMatch(source, /<\s*(?:input|select|textarea)[^>]*\bname=/);
  assert.doesNotMatch(source, /firebase|saveCharacter|localStorage|sessionStorage/);
});
