import assert from "node:assert/strict";
import test from "node:test";
import { parseGrantExpression, parsePrerequisiteExpression, parsePrerequisiteExpressions, parseBasicAttackExpression, serializeExpression } from "../public/js/core/game-data-expressions.js";
import { getExpressionRuntimeStatus } from "../public/js/core/game-data-contract.js";
import { checkPrerequisites, getEntryPrerequisites } from "../public/js/core/prerequisites.js";

const v3 = { syntaxVersion: 3 };

test("v3 typed OR stays distinct from prerequisite and grant value OR", () => {
  const result = parsePrerequisiteExpression("weapon | tag=Melee OR Ranged | wielded=true OR skill | name=Martial Arts | minRank=1", v3);
  assert.deepEqual(result.value, { type: "any", alternatives: [{ type: "weapon", tag: ["Melee", "Ranged"], wielded: true }, { type: "skill", name: "Martial Arts", minRank: 1 }] });
  const serialized = serializeExpression("prerequisite", result.value, v3);
  assert.deepEqual(parsePrerequisiteExpression(serialized.value, v3).value, result.value);
  const grant = parseGrantExpression("feat | type=archetype | category=dragoon OR multiclass | maxLevel=1", v3);
  assert.deepEqual(grant.value.category, ["dragoon", "multiclass"]);
  assert.equal(grant.value.level, 1);
  assert.equal(parsePrerequisiteExpressions(`${serialized.value}\ntechnique | techniqueKey=deflect`, v3).values.length, 2);
});

test("v3 source aliases and positional archetypes normalize without changing v2", () => {
  for (const [text, value] of [
    ["trait | traitKey=liquid-form | minRank=2", { type: "trait", key: "liquid-form", minRank: 2 }],
    ["technique | techniqueKey=deflect", { type: "technique", key: "deflect" }],
    ["archetype | soulrager | numFeats=2", { type: "archetype", key: "soulrager", numFeats: 2 }],
    ["option | groupKey=stances | count=2", { type: "option", groupKey: "stances", count: 2 }],
  ]) {
    assert.deepEqual(parsePrerequisiteExpression(text, v3).value, value);
    assert.equal(parsePrerequisiteExpression(text).ok, false);
  }
  assert.equal(parseGrantExpression("feature | featureKey=evolution", v3).value.key, "evolution");
  const recipient = parseGrantExpression("skill | choiceId=archive | count=3 | rank=1 | recipientRef=artifact", v3).value;
  assert.equal(recipient.recipientRef, "artifact");
  assert.equal(getExpressionRuntimeStatus("grant", recipient, v3), "stubbed");
  assert.equal(getExpressionRuntimeStatus("grant", parseGrantExpression("choice | type=keystone | count=1", v3).value, v3), "stubbed");
  assert.equal(parseGrantExpression("tag | tag=Flight | minRank=2", v3).value.minRank, 2);
});

test("v3 malformed fields and disjunction branches keep exact expression locations", () => {
  const context = { sheet: "Techniques", cell: "G8" };
  for (const text of ["option | groupKey=stances | count=0", "weapon-set | tag=Melee | separateHands=sometimes", "trait | name=Liquid", "weapon | tag=Melee OR skill | name=Martial Arts | minRank=oops"]) {
    const result = parsePrerequisiteExpression(text, { ...v3, context, line: 2 });
    assert.equal(result.ok, false, text);
    assert.equal(result.value, null);
    assert(result.diagnostics.every((item) => item.context === context && item.line === 2));
  }
});

test("basic attacks preserve alternatives and overrides on the underlying attack", () => {
  const result = parseBasicAttackExpression("weapon | defense=Spiritual OR technique | techniqueKey=unarmed-strike | attribute=Agility");
  assert.deepEqual(result.value, { type: "any", alternatives: [{ type: "weapon", defense: "Spiritual" }, { type: "technique", key: "unarmed-strike", attribute: "Agility" }] });
  assert.deepEqual(parseBasicAttackExpression(serializeExpression("basicAttack", result.value, v3).value).value, result.value);
  assert.equal(parseBasicAttackExpression("technique | attribute=Agility").ok, false);
  assert.equal(parseBasicAttackExpression("weapon | rollRequired=Y").ok, false);
});

test("v3 eligibility evaluates typed alternatives and fails closed for manual rules", () => {
  const prereqs = getEntryPrerequisites({ expressionSyntaxVersion: 3, prerequisites: "weapon | tag=Melee | wielded=true OR skill | name=Martial Arts | minRank=1" });
  assert.equal(checkPrerequisites(prereqs, { ...v3, skillRanks: { "Martial Arts": 1 } }).ok, true);
  assert.equal(checkPrerequisites(prereqs, { ...v3, skillRanks: { "Martial Arts": 0 } }).ok, false);
  assert.equal(checkPrerequisites([{ type: "text", text: "Approval" }], v3).ok, false);
  assert.equal(checkPrerequisites([{ type: "text", text: "Approval" }]).ok, true);
  assert.equal(checkPrerequisites([{ type: "choice", choiceRef: "missing" }], { ...v3, deferUnresolvedChoices: true }).ok, false);
  assert.equal(checkPrerequisites([{ type: "familiar", minCount: 2 }], v3).ok, false);
});

test("v3 known options count distinct knowledge, archetypes count stable feat keys, and hands require evidence", () => {
  assert.equal(checkPrerequisites([{ type: "option", groupKey: "stances", count: 2 }], { ...v3, knownOptions: { stances: ["a", "a"] } }).ok, false);
  assert.equal(checkPrerequisites([{ type: "option", groupKey: "stances", count: 2 }], { ...v3, knownOptions: { stances: ["a", "b"] } }).ok, true);
  const archetype = [{ type: "archetype", key: "path", numFeats: 2 }];
  const gameData = { feats: [{ featKey: "a", archetypeKey: "path" }, { featKey: "b", archetypeKey: "path" }] };
  assert.equal(checkPrerequisites(archetype, { ...v3, builder: { selectedFeats: ["a", "b"] }, gameData }).ok, true);
  const rule = [{ type: "weapon-set", tag: "Melee", count: 2, wielded: true, separateHands: true }];
  const weapons = [{ id: "a", tags: ["Melee"], wielded: true }, { id: "b", tags: ["Melee"], wielded: true }];
  assert.equal(checkPrerequisites(rule, { ...v3, builder: { weapons } }).ok, false);
  assert.equal(checkPrerequisites(rule, { ...v3, builder: { weapons: weapons.map((weapon, i) => ({ ...weapon, hand: i ? "right" : "left" })) } }).ok, true);
  assert.equal(checkPrerequisites([{ type: "trait", key: "wings", minRank: 2 }, { type: "technique", key: "fly" }], { ...v3, selectedTraits: [{ traitKey: "wings", rank: 2 }], selectedTechniqueKeys: ["fly"] }).ok, true);
  assert.equal(checkPrerequisites([{ type: "technique", key: "fly" }], { ...v3, builder: { selectedTechniques: ["fly"] } }).ok, true);
  assert.equal(checkPrerequisites([{ type: "option", groupKey: "stances", count: 2 }], {
    ...v3, builder: { classKey: "warrior", selectedClassFeatureOptions: ["a", "b", "unrelated"] },
    gameData: { classFeatures: { warrior: [{ featureKey: "stances", options: [{ featureKey: "a" }, { featureKey: "b" }] }] } },
  }).ok, true);
});
