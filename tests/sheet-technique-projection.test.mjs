import test from "node:test";
import assert from "node:assert/strict";
import { projectSheetTechniques } from "../public/js/core/sheet-technique-projection.js";
import { GRAPH_GAME_DATA, makeGraphCharacter, makeTechniqueGrantAnswer } from "./fixtures/graph-core.mjs";

function fixture() {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  const character = makeGraphCharacter({ selectedClassFeatureOptions: ["moon-path"],
    grantChoices: { "moon-technique": makeTechniqueGrantAnswer() } });
  return { character, gameData };
}
const granted = input => projectSheetTechniques(input).filter(item => item.tech.techniqueKey === "moon-shroud");

test("the sheet includes a feature's chosen technique outside normal selected techniques without saving it", () => {
  const input = fixture(), before = structuredClone(input);
  const items = granted(input);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Granted by Moon Path");
  assert.deepEqual(input.character.builder.selectedTechniques, []);
  assert.deepEqual(input, before);
});

test("unselected, wrong-class and level-locked granting sources do not restore stale answers", () => {
  const removed = fixture();
  removed.character.builder.selectedClassFeatureOptions = [];
  assert.deepEqual(granted(removed), []);
  const changedClass = fixture();
  changedClass.character.builder.classKey = "guardian";
  assert.deepEqual(granted(changedClass), []);
  const locked = fixture();
  locked.gameData.classFeatures.ninja.find(entry => entry.featureKey === "shadow-discipline").level = 3;
  assert.deepEqual(granted(locked), []);
});

test("wrong owners, mismatched filters, missing records and unmet prerequisites are not displayed as grants", () => {
  const wrongOwner = fixture();
  wrongOwner.character.builder.grantChoices["moon-technique"].sourceId = "class-option:ninja:other-path";
  assert.deepEqual(granted(wrongOwner), []);
  const mismatch = fixture();
  mismatch.gameData.techniques.find(tech => tech.techniqueKey === "moon-shroud").tagKeys = ["sun"];
  assert.deepEqual(granted(mismatch), []);
  const missing = fixture();
  missing.gameData.techniques = missing.gameData.techniques.filter(tech => tech.techniqueKey !== "moon-shroud");
  assert.deepEqual(granted(missing), []);
  const unmet = fixture();
  unmet.gameData.techniques.find(tech => tech.techniqueKey === "moon-shroud").prerequisites = [{ type: "class", key: "ninja", level: 3 }];
  assert.deepEqual(granted(unmet), []);
});

test("skill-filtered grants support a technique with multiple skill routes and use its effective skill rank", () => {
  const input = fixture();
  const option = input.gameData.classFeatures.ninja.find(entry => entry.featureKey === "shadow-discipline").options[0];
  option.grants = [{ type: "technique-choice", skill: "Spellcasting", choiceId: "moon-technique", count: 1 }];
  const technique = input.gameData.techniques.find(tech => tech.techniqueKey === "moon-shroud");
  Object.assign(technique, { expressionSyntaxVersion: 3, status: "playable", runtimeSupport: { execution: "supported" },
    rank: 1, rollRequired: false, skill: "Spellcasting, Psionics", skillKeys: ["spellcasting", "psionics"],
    selectionRoutes: [{ type: "skill", name: "Spellcasting" }, { type: "skill", name: "Psionics" }] });
  input.character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Spellcasting", rank: "2" }];
  const [item] = granted(input);
  assert.ok(item);
  assert.equal(item.tech.rollRequired, false);
  assert.equal(item.performance.skillName, "Spellcasting");
  assert.equal(item.performance.rank, 2);
});

test("techniques shared by selected, fixed and choice grants appear once using stable identity", () => {
  const input = fixture();
  input.character.builder.selectedTechniques = ["moon-shroud"];
  input.gameData.classFeatures.ninja[0].grants.push({ type: "technique", key: "moon-shroud" });
  input.gameData.techniques.find(tech => tech.techniqueKey === "moon-shroud").techniqueName = "Renamed Shroud";
  const [item] = granted(input);
  assert.equal(granted(input).length, 1);
  assert.equal(item.tech.techniqueName, "Renamed Shroud");
  assert.equal(item.source, "Granted by Moon Path");
  assert(projectSheetTechniques(input).some(item => item.tech.techniqueKey === "stalk-prey"));
});

test("source-owned technique answers from origins use the same projection", () => {
  const input = fixture();
  input.character.builder.selectedClassFeatureOptions = [];
  input.character.builder.originKey = "moon-born";
  input.gameData.origins = [{ originKey: "moon-born", name: "Moon Born", status: "playable", selectable: true,
    grants: [{ type: "technique-choice", tag: "moon", choiceId: "moon-technique" }], features: [] }];
  input.character.builder.grantChoices["moon-technique"].sourceId = "origin:moon-born";
  assert.equal(granted(input)[0]?.source, "Granted by Moon Born");
});
