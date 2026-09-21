import assert from "node:assert/strict";
import test from "node:test";
import { projectCharacterTraits } from "../public/js/core/trait-rules.js";
import { createPrerequisiteContext, meetsPrerequisites } from "../public/js/core/prerequisites.js";
import { getTechniqueSelectionState } from "../public/js/core/selection-rules.js";
import { traitCharacter, traitData } from "./fixtures/traits.mjs";

test("Trait choices derive rank, explicit tags and only ready techniques; categories never grant tags", () => {
  const character = traitCharacter(), data = traitData(), before = JSON.stringify(character);
  const projection = projectCharacterTraits(character, data);
  assert.equal(projection.traits[0].rank, 2);
  assert.deepEqual(projection.tags, ["Flight", "Wings"]);
  assert.deepEqual(projection.techniques.filter((item) => item.active).map((item) => item.techniqueKey), ["flight"]);
  assert.equal(projection.choices[0].options.find((item) => item.traitKey === "advanced").eligible, false);
  assert.equal(projection.choices[0].options.find((item) => item.traitKey === "unfinished").eligible, false);
  assert.equal(projection.activations, undefined);
  assert.equal(JSON.stringify(character), before);
  assert(Object.isFrozen(projection.traits[0]));
  const context = createPrerequisiteContext({ builder: character.builder, gameData: data });
  assert.equal(getTechniqueSelectionState(data.techniques[3], context).eligible, true);
  assert.equal(meetsPrerequisites([{ type: "trait", key: "wings", minRank: 2 }], { builder: character.builder, gameData: data }), true);
});

test("a child provider cannot bypass its parent's prerequisites or readiness", () => {
  const data = traitData(), character = traitCharacter();
  data.origins[0].prerequisites = [{ type: "skill", name: "Martial Arts", minRank: 4 }];
  assert.equal(projectCharacterTraits(character, data).traits.length, 0);
  data.origins[0].prerequisites = [];
  data.origins[0].runtimeSupport = { status: "deferred", reasons: ["incomplete"] };
  assert.equal(projectCharacterTraits(character, data).traits.length, 0);
});

test("legacy activation state has no effect on static Trait eligibility and is not mutated", () => {
  const character = traitCharacter();
  character.builder.traitActivations.old = { activationId: "old", sourceId: "old-source", active: false };
  const before = structuredClone(character);
  const projection = projectCharacterTraits(character, traitData());
  assert.equal(projection.traits.length, 1);
  assert.equal(projection.traits[0].active, true);
  assert.deepEqual(projection.tags, ["Flight", "Wings"]);
  assert.equal(projection.techniques.some((item) => item.active), true);
  assert.equal(projection.issues.some((item) => item.remove), false);
  assert.deepEqual(character, before);
});

test("Trait references and incomplete providers are visible without inferred acquisition", () => {
  const data = traitData(), feature = data.origins[0].features[0];
  feature.grants = [{ type: "trait", tag: "Body" }]; feature.traitKeys = ["wings"];
  const projection = projectCharacterTraits({ builder: { originKey: "test-origin", level: 1 } }, data);
  assert.equal(projection.traits[0].referenceOnly, true);
  assert.equal(projection.choices.length, 0);
  assert.equal(projection.activations, undefined);
  assert.deepEqual(projection.tags, []);
});

test("multiple fixed-key awards need explicit choice identities", () => {
  const data = traitData(), character = traitCharacter();
  data.origins[0].features[0].grants = [{ type: "trait", key: "wings", count: 2, rank: 1 }];
  const projection = projectCharacterTraits(character, data);
  assert.equal(projection.choices.length, 0);
  assert(projection.deferred[0].reason.includes("stable choice"));
});

test("associated skills scale Traits and fixed Origin ranks need no skill", () => {
  const data = traitData(), character = traitCharacter();
  const grant = data.origins[0].features[0].grants[0];
  delete grant.rank; grant.skill = "Martial Arts";
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Martial Arts", rank: "1" }];
  let result = projectCharacterTraits(character, data);
  assert.equal(result.traits[0].rank, 1);
  assert.deepEqual(result.tags, ["Wings"]);
  character.builder.sheet.repeatables.combatSkillsExtra[0].rank = "3";
  result = projectCharacterTraits(character, data);
  assert.equal(result.traits[0].rank, 3);
  assert(result.techniques.find((item) => item.techniqueKey === "advanced-flight").active);
});

test("Trait prerequisite order is independent and circular answers cannot authorize themselves", () => {
  const data = traitData(), character = traitCharacter();
  character.builder.traitChoices = {}; character.builder.traitActivations = {};
  const feature = data.origins[0].features[0];
  feature.grants = ["storage", "liquid"].map((key) => ({ type: "trait", key }));
  assert.equal(projectCharacterTraits(character, data).traits.length, 2);
  data.traits.find((item) => item.traitKey === "liquid").prerequisites = [{ type: "trait", key: "storage" }];
  assert.equal(projectCharacterTraits(character, data).traits.length, 0);
});

test("multiple providers retain distinct ownership; rename/reorder does not change identities", () => {
  const data = traitData(), character = traitCharacter();
  const second = structuredClone(data.origins[0].features[0]);
  second.featureKey = "second"; second.grants = [{ type: "trait", key: "wings", rank: 1 }];
  data.origins[0].features.push(second);
  const before = projectCharacterTraits(character, data);
  assert.equal(before.traits.length, 2);
  data.origins[0].features.reverse().forEach((feature) => { feature.name += " renamed"; });
  assert.deepEqual(projectCharacterTraits(character, data).traits.map((item) => item.id), before.traits.map((item) => item.id));
  delete character.builder.traitChoices[Object.keys(character.builder.traitChoices)[0]];
  assert.deepEqual(projectCharacterTraits(character, data).tags, ["Wings"]);
});

test("static providers need no form state; unsupported recipient data cannot grant character benefits", () => {
  const data = traitData(), character = traitCharacter();
  const second = structuredClone(data.origins[0].features[0]);
  second.featureKey = "second"; second.grants = [{ type: "trait", key: "liquid" }];
  data.origins[0].features.push(second);
  const result = projectCharacterTraits(character, data);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.tags, ["Flight", "Liquid", "Wings"]);
  data.origins[0].features[0].grants[0].recipientRef = "familiar";
  assert(projectCharacterTraits(character, data).deferred.some((item) => item.reason.includes("recipient")));
});

test("active source-owned Techniques satisfy further prerequisites without creating circular access", () => {
  const data = traitData(), character = traitCharacter();
  character.builder.traitChoices = {}; character.builder.traitActivations = {};
  data.traits.find((item) => item.traitKey === "storage").prerequisites = [{ type: "technique", key: "flight" }];
  data.origins[0].features[0].grants = ["storage", "wings"].map((key) => ({ type: "trait", key, rank: 1 }));
  assert.equal(projectCharacterTraits(character, data).traits.length, 2);
  data.traits.find((item) => item.traitKey === "wings").prerequisites = [{ type: "trait", key: "storage" }];
  assert.equal(projectCharacterTraits(character, data).traits.length, 0);
});

test("Wings and Web tag grants unlock normal Technique choices without granting them automatically", () => {
  const data = traitData(), character = traitCharacter();
  data.traits.push({ ...data.traits[1], traitKey: "web-shooters", name: "Web Shooters", techniqueKeys: ["web-area"], grants: [{ type: "tag", tag: "Web", minRank: 1 }] });
  data.origins[0].features[0].grants.push({ type: "trait", key: "web-shooters" });
  for (const [techniqueKey, tag] of [["wing-blast", "Wings"], ["web-area", "Web"]]) {
    data.techniques.push({ ...data.techniques[0], techniqueKey, rank: 1, selectionRoutes: [{ type: "tag", name: tag }] });
  }
  data.traits[0].techniqueKeys.push("wing-blast");
  let projection = projectCharacterTraits(character, data);
  assert.deepEqual(projection.tags, ["Flight", "Web", "Wings"]);
  assert.deepEqual(projection.techniques.filter(item => item.active).map(item => item.techniqueKey), ["flight"]);
  for (const key of ["wing-blast", "web-area"]) {
    const technique = data.techniques.find(item => item.techniqueKey === key);
    assert.equal(getTechniqueSelectionState(technique, createPrerequisiteContext({ builder: character.builder, gameData: data })).eligible, true);
    technique.status = "incomplete";
    assert.equal(getTechniqueSelectionState(technique, createPrerequisiteContext({ builder: character.builder, gameData: data })).eligible, false);
  }
  delete character.builder.traitChoices[Object.keys(character.builder.traitChoices)[0]];
  projection = projectCharacterTraits(character, data);
  assert.deepEqual(projection.tags, ["Web"]);
  assert.deepEqual(projection.techniques, []);
});
