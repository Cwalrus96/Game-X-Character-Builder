import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getBuilderStepInformationalMessages,
  getBuilderStepOwnedPaths,
  impactBelongsToBuilderStep,
} from "../public/js/builder/builder-step-impacts.js";

const reconciliation = {
  impacts: [
    { category: "informational", path: "builder.primaryAttribute", code: "primary", message: "Choose a primary attribute." },
    { category: "informational", path: "builder.attributes", code: "attributes", message: "Two attribute points remain." },
    { category: "informational", path: "builder.originKey", code: "origin", message: "Choose an Origin." },
    { category: "informational", path: "builder.selectedFeats", code: "feat", message: "Choose a class feat." },
    { category: "informational", path: "builder.selectedTechniques", code: "technique", message: "Choose a technique." },
    { category: "informational", path: "builder.sheet.fields.rank_nature", code: "skill", message: "Skill points remain." },
    { category: "informational", path: "builder.weapons.0.enhancements", code: "weapon", message: "Choose an enhancement." },
    { category: "informational", path: "builder.bonds.0", code: "bond", message: "Complete this Bond." },
    { category: "informational", path: "gameData.classFeatures.magical-guardian.0", code: "deferred", message: "Runtime implementation is deferred." },
    { category: "informational", path: "builder.attributesExtra", code: "near-match", message: "Not an attribute path." },
    { category: "error", path: "builder.originKey", code: "error", message: "Structural error." },
    { category: "confirmation-required", path: "builder.selectedTechniques", code: "remove", message: "Remove a technique." },
  ],
};

test("incomplete save notices include only fields owned by the current builder page", () => {
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "attributes"), [
    "Two attribute points remain.",
  ]);
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "class"), [
    "Choose a primary attribute.",
    "Choose a class feat.",
  ]);
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "origin"), ["Choose an Origin."]);
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "skills"), ["Skill points remain."]);
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "equipment"), ["Choose an enhancement."]);
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "techniques"), ["Choose a technique."]);
  assert.deepEqual(getBuilderStepInformationalMessages(reconciliation, "bonds-keystones"), ["Complete this Bond."]);
});

test("page ownership uses exact path boundaries and does not depend on visit history", () => {
  assert.equal(impactBelongsToBuilderStep({ path: "builder.attributes.agility" }, "attributes"), true);
  assert.equal(impactBelongsToBuilderStep({ path: "builder.attributesExtra" }, "attributes"), false);
  assert.equal(impactBelongsToBuilderStep({ path: "builder.originKey" }, "attributes"), false);
  assert.deepEqual(getBuilderStepOwnedPaths("unknown"), []);
  assert.deepEqual(getBuilderStepInformationalMessages({
    ...reconciliation,
    character: { builder: { visitedSteps: ["origin", "skills"] } },
  }, "attributes"), ["Two attribute points remain."]);
});

test("all migrated page save flows use the centralized informational scope", async () => {
  for (const file of [
    "builder-class.js",
    "builder-attributes.js",
    "builder-origin.js",
    "builder-skills.js",
    "builder-equipment.js",
    "builder-techniques.js",
    "builder-bonds-keystones.js",
  ]) {
    const source = await readFile(new URL(`../public/js/builder/${file}`, import.meta.url), "utf8");
    assert.match(source, /getBuilderStepInformationalMessages/);
  }
});
