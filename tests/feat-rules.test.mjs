import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  allocateFeatsToExplicitSlots,
  createFeatGrantSlots,
  getExplicitFeatSlots,
  getFeatSelectionState,
} from "../public/js/core/feat-rules.js";

const published = JSON.parse(fs.readFileSync(
  new URL("../public/data/game-x/game-x-data.json", import.meta.url),
  "utf8",
));

const lowFeat = {
  type: "feature",
  featType: "class",
  featKey: "low-feat",
  name: "Low Feat",
  category: "example",
  prerequisites: [{ type: "class", key: "example", level: 2 }],
};
const highFeat = {
  type: "feature",
  featType: "class",
  featKey: "high-feat",
  name: "High Feat",
  category: "example",
  prerequisites: [{ type: "class", key: "example", level: 4 }],
};

test("levels alone never create feat capacity", () => {
  const gameData = { schemaVersion: 2, classes: [], classFeatures: {}, origins: [], feats: [] };
  const state = getFeatSelectionState(gameData, { level: 12, selectedFeats: [] });
  assert.equal(state.capacity, 0);
  assert.deepEqual(state.slots, []);
});

test("explicit feat grants create typed slots and deterministic maximum matching", () => {
  const slots = [
    ...createFeatGrantSlots({
      type: "feat", filterType: "class", category: "example", level: 4, count: 1,
    }, { sourceId: "feature:flexible", sourceLabel: "Flexible Feat", grantId: "grant:flexible" }),
    ...createFeatGrantSlots({
      type: "feat", filterType: "class", category: "example", level: 2, count: 1,
    }, { sourceId: "feature:restricted", sourceLabel: "Restricted Feat", grantId: "grant:restricted" }),
  ];

  for (const selectedFeatKeys of [["low-feat", "high-feat"], ["high-feat", "low-feat"]]) {
    const allocation = allocateFeatsToExplicitSlots({
      slots,
      feats: [lowFeat, highFeat],
      selectedFeatKeys,
    });
    assert.deepEqual(allocation.unmatchedFeatKeys, []);
    assert.equal(allocation.assignments.length, 2);
    assert.equal(
      allocation.assignments.find((item) => item.featKey === "high-feat").slot.sourceId,
      "feature:flexible",
    );
  }
});

test("published Magical Guardian capacity comes only from active explicit features", () => {
  const builder = {
    classKey: "magical-guardian",
    originKey: "",
    selectedClassFeatureOptions: [],
    selectedFeats: [],
    selectedFeatOptions: [],
  };
  assert.equal(getExplicitFeatSlots(published, { ...builder, level: 1 }).length, 0);
  assert.equal(getExplicitFeatSlots(published, { ...builder, level: 2 }).length, 2);
  assert.equal(getExplicitFeatSlots(published, { ...builder, level: 4 }).length, 3);

  const state = getFeatSelectionState(published, { ...builder, level: 4 });
  assert.equal(state.slots.filter((slot) => slot.filterType === "class").length, 2);
  assert.equal(state.slots.filter((slot) => slot.filterType === "archetype").length, 1);
  assert(state.availableFeats.every((feat) => feat.featType === "class"));
  assert.equal(state.availableFeats.some((feat) => feat.featKey === "instant-transformation"), true);
});

test("graph and portable feat widget import the same pure feat Rules projection", async () => {
  const graphSource = await readFile(new URL("../public/js/core/graph-compiler.js", import.meta.url), "utf8");
  const widgetSource = await readFile(new URL("../public/js/builder/widgets/feats-widget.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../public/js/builder/builder-class.js", import.meta.url), "utf8");
  const characterRulesSource = await readFile(new URL("../public/js/core/character-rules.js", import.meta.url), "utf8");
  assert.match(graphSource, /from "\.\/feat-rules\.js/);
  assert.match(widgetSource, /from "\.\.\/\.\.\/core\/feat-rules\.js/);
  assert.doesNotMatch(pageSource, /computeFeatSlots|getFeatSlots/);
  assert.doesNotMatch(characterRulesSource, /computeFeatSlots|Math\.floor\([^\n]*level[^\n]*\/\s*2/i);
});
