import assert from "node:assert/strict";
import test from "node:test";
import { getFeatGrantChoices, getFeatSelectionState } from "../public/js/core/feat-rules.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { CharacterSessionPage } from "../public/js/builder/character-session-page.js";
import { SetFeatSelection, SetLevel } from "../public/js/core/character-commands.js";
import { makeFeatChoicesFixture } from "./fixtures/feat-choices.mjs";

test("each feature offers only its feat type, categories, level and qualified options", () => {
  const { gameData, character, classFeature, archetypeFeature } = makeFeatChoicesFixture();
  const [classChoice] = getFeatGrantChoices(gameData, character.builder, { entry: classFeature });
  assert.deepEqual(classChoice.options.map((option) => option.featKey), ["class-a", "class-b", "needs-skill"]);
  assert.equal(classChoice.options.find((option) => option.featKey === "needs-skill").eligible, false);
  assert.match(classChoice.options.find((option) => option.featKey === "needs-skill").reason, /Athletics/);
  const [archetypeChoice] = getFeatGrantChoices(gameData, character.builder, { entry: archetypeFeature });
  assert.deepEqual(archetypeChoice.options.map((option) => option.featKey), ["archetype-a", "archetype-b", "multiclass"]);
  assert(archetypeChoice.options.every((option) => option.eligible));
  character.builder.level = 1;
  assert.deepEqual(getFeatGrantChoices(gameData, character.builder, { entry: classFeature }), []);
  character.builder.level = 2;
  classFeature.prerequisites = [{ type: "skill", name: "Athletics", rank: 5 }];
  assert.deepEqual(getFeatGrantChoices(gameData, character.builder, { entry: classFeature }), []);
});

test("replacing one grant's feat preserves other grants and works at capacity", () => {
  const { gameData, character, classFeature } = makeFeatChoicesFixture();
  character.builder.selectedFeats = ["class-a", "archetype-a"];
  const before = structuredClone(character);
  const [choice] = getFeatGrantChoices(gameData, character.builder, { entry: classFeature });
  assert.equal(choice.featKey, "class-a");
  assert.deepEqual(choice.options.find((option) => option.featKey === "class-b").nextFeatKeys, ["class-b", "archetype-a"]);
  assert.deepEqual(choice.clearedFeatKeys, ["archetype-a"]);
  assert.deepEqual(character, before);
});

test("graph and widgets assign saved feats to the same stable feature even if catalogue order changes", () => {
  const { gameData, character, classFeature, laterFeature } = makeFeatChoicesFixture();
  character.builder.level = 4;
  character.builder.selectedFeats = ["class-a", "class-high", "archetype-a"];
  for (const order of [gameData.classFeatures.ninja, [...gameData.classFeatures.ninja].reverse()]) {
    gameData.classFeatures.ninja = order;
    const graph = compileCharacterGraph({ gameData, character });
    const state = getFeatSelectionState(gameData, character.builder);
    for (const assignment of state.assignments) {
      const node = graph.nodes.find((node) => node.id === `feat-selection:${assignment.featKey}`);
      const slot = graph.nodes.find((slot) => slot.id === node.sourceOwnerId);
      assert.equal(slot.metadata.sourceKey, assignment.slot.sourceKey);
    }
    assert.equal(getFeatGrantChoices(gameData, character.builder, { entry: classFeature })[0].featKey, "class-a");
    assert.equal(getFeatGrantChoices(gameData, character.builder, { entry: laterFeature })[0].featKey, "class-high");
  }
});

test("multiple grant slots avoid duplicate choices and keep earlier answers on ordinary additions", () => {
  const { gameData, character, classFeature } = makeFeatChoicesFixture();
  classFeature.grants[0].count = 2;
  character.builder.selectedFeats = ["class-a"];
  let choices = getFeatGrantChoices(gameData, character.builder, { entry: classFeature });
  assert.equal(choices.length, 2);
  assert.equal(choices[0].featKey, "class-a");
  assert.equal(choices[1].options.find((option) => option.featKey === "class-a").eligible, false);
  character.builder.selectedFeats.push("class-b");
  choices = getFeatGrantChoices(gameData, character.builder, { entry: classFeature });
  assert.deepEqual(choices.map((choice) => choice.featKey), ["class-a", "class-b"]);
});

test("removing a granting level reviews feats together and cancellation preserves saved answers", async () => {
  const { gameData, character } = makeFeatChoicesFixture();
  character.builder.selectedFeats = ["class-a", "archetype-a"];
  let accept = false;
  const page = new CharacterSessionPage({ character, gameData, confirmImpacts: async () => accept });
  const before = page.getCharacter();
  assert.equal((await page.requestCharacterCommand(null, SetLevel(1))).reason, "cancelled");
  assert.deepEqual(page.getCharacter(), before);
  accept = true;
  assert.equal((await page.requestCharacterCommand(null, SetLevel(1))).ok, true);
  assert.deepEqual(page.getCharacter().builder.selectedFeats, []);
});

test("a full class/archetype selection and replacement survive exact session save and reload", async () => {
  const { gameData, character, classFeature, archetypeFeature } = makeFeatChoicesFixture();
  const page = new CharacterSessionPage({ character, gameData, confirmImpacts: async () => true });
  assert.equal((await page.requestCharacterCommand(null, SetFeatSelection(["class-a", "archetype-a"]))).ok, true);
  const replacement = getFeatGrantChoices(gameData, page.getCharacter().builder, { entry: classFeature })[0].options.find((option) => option.featKey === "class-b");
  assert.equal((await page.requestCharacterCommand(null, SetFeatSelection(replacement.nextFeatKeys))).ok, true);
  let saved;
  assert.equal((await page.save(async (snapshot) => { saved = snapshot.character; return { revision: 1 }; })).ok, true);
  const reloaded = new CharacterSessionPage({ character: saved, revision: 1, gameData });
  assert.equal(getFeatGrantChoices(gameData, reloaded.getCharacter().builder, { entry: classFeature })[0].featKey, "class-b");
  assert.equal(getFeatGrantChoices(gameData, reloaded.getCharacter().builder, { entry: archetypeFeature })[0].featKey, "archetype-a");
});
