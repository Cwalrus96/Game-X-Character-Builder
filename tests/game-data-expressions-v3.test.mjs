import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExpressionObject, parseGrantExpression, parsePrerequisiteExpression, parsePrerequisiteExpressions, parseBasicAttackExpression, serializeExpression } from "../public/js/core/game-data-expressions.js";
import { getExpressionRuntimeStatus, getTraitGrantDeferredReasons } from "../public/js/core/game-data-contract.js";
import { checkPrerequisites, getEntryPrerequisites } from "../public/js/core/prerequisites.js";

const v3 = { syntaxVersion: 3 };

test("v3 Trait grants preserve source-owned context and normalize only explicit defaults", () => {
  const fixed = parseGrantExpression("trait | traitKey=wings | rank=2", v3);
  assert.deepEqual(fixed.value, { type: "trait", key: "wings", rank: 2, count: 1 });
  assert.equal(getExpressionRuntimeStatus("grant", fixed.value, v3), "implemented");
  const choice = parseGrantExpression("trait | key=wings OR claws | tag=Anatomy OR Natural Weapon | choiceId=form-trait | count=2 | associatedSkill=Metamorphosis", v3);
  assert.equal(choice.ok, true);
  assert.deepEqual(choice.value.key, ["wings", "claws"]);
  assert.deepEqual(choice.value.tag, ["Anatomy", "Natural Weapon"]);
  assert.equal(choice.value.skill, "Metamorphosis");
  assert.deepEqual(Object.keys(choice.value).sort(), ["choiceId", "count", "key", "skill", "tag", "type"]);
  assert.equal(getExpressionRuntimeStatus("grant", choice.value, v3), "implemented");
  assert.deepEqual(parseGrantExpression(serializeExpression("grant", choice.value, v3).value, v3).value, choice.value);
  assert.equal(parseGrantExpression("trait | key=wings | rank=2").ok, false);
  const simple = parseGrantExpression("trait | traitKey=wings", v3);
  assert.equal(simple.ok, true);
  assert.equal(getExpressionRuntimeStatus("grant", simple.value, v3), "implemented");
});

test("v3 incomplete Trait contexts are preserved and cannot execute", () => {
  for (const [text, reasons] of [
    ["trait | tag=Anatomy", ["trait-choice-id-missing"]],
    ["trait | key=wings OR claws | rank=1", ["trait-choice-id-missing"]],
  ]) {
    const result = parseGrantExpression(text, v3);
    assert.equal(result.ok, true, text);
    assert.deepEqual(getTraitGrantDeferredReasons(result.value), reasons);
    assert.equal(getExpressionRuntimeStatus("grant", result.value, v3), "stubbed");
  }
  assert.equal(getExpressionRuntimeStatus("grant", parseGrantExpression("tag | tag=Flight | minRank=2", v3).value, v3), "implemented");
});

test("v3 Trait grant conflicts and malformed scalar fields fail with source locations", () => {
  const context = { sheet: "OriginFeatures", cell: "I7" };
  for (const text of [
    "trait | rank=1", "trait | key=wings | count=0", "trait | key=wings | rank=0", "trait | key=wings | rank=1.5",
    "trait | key=wings | activation=automatic", "trait | key=wings | activationId=",
    "trait | key=wings | rank=1 | skill=Metamorphosis", "trait | key=wings | traitKey=wings",
    "trait | key=wings | associatedSkill=Metamorphosis | skill=Metamorphosis",
  ]) {
    const result = parseGrantExpression(text, { ...v3, context, line: 3 });
    assert.equal(result.ok, false, text);
    assert.equal(result.value, null);
    assert(result.diagnostics.every(item => item.context === context && item.line === 3));
  }
  for (const field of ["key", "tag"]) {
    assert.equal(normalizeExpressionObject("grant", { type: "trait", [field]: [], rank: 1 }, v3).ok, false);
  }
});

test("Trait grants reject gameplay tracking and future-recipient fields with explicit diagnostics", () => {
  for (const field of ["activation", "activationId", "activationGroup", "costText", "durationText", "rangeText", "recipientRef", "note"]) {
    const result = parseGrantExpression(`trait | key=wings | ${field}=unused`, v3);
    assert.equal(result.ok, false, field);
    assert(result.diagnostics.some(item => item.message.includes(field)), field);
  }
});

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
