import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { previewBuilderChange, summarizeDependencyRemovals } from "../public/js/core/builder-dependencies.js";
import { BuilderPage } from "../public/js/builder/builder-page.js";
import { buildClassChangePatch } from "../public/js/builder/widgets/class-choice-widget.js";
import { buildCharacterDependencyGraph } from "../public/js/core/character-dependency-graph.js";
import { getChoiceCountState, getExpectedSelectionIssue } from "../public/js/core/choice-capacity.js";
import { buildGrantChoiceNodeId, resolveGrantChoiceId } from "../public/js/core/choice-identity.js";
import { buildOptionKey, sanitizeGrantChoices } from "../public/js/core/data-sanitization.js";

const gameData = JSON.parse(fs.readFileSync(new URL("../public/data/game-x/game-x-data.json", import.meta.url), "utf8"));

function magicalGuardianAccessoryKey(optionName) {
  const group = gameData.classFeatures["magical-guardian"].find((entry) => entry.name === "Guardian Accessory");
  const option = group.options.find((entry) => entry.name === optionName);
  return buildOptionKey(group, option);
}

function magicalGuardianAccessoryOption(optionName) {
  const group = gameData.classFeatures["magical-guardian"].find((entry) => entry.name === "Guardian Accessory");
  const option = group.options.find((entry) => entry.name === optionName);
  return { group, option, key: buildOptionKey(group, option) };
}

function gameDataWithSourceOwnedWeaponGrant() {
  return {
    ...gameData,
    classFeatures: {
      ...gameData.classFeatures,
      "magical-guardian": [
        ...gameData.classFeatures["magical-guardian"],
        {
          type: "feature",
          featureKey: "soulbound-arsenal",
          name: "Soulbound Arsenal",
          level: 2,
          grants: [{ type: "weapon", choiceId: "soulbound-weapon", rank: 2 }],
        },
      ],
    },
  };
}

test("choice count rules are shared for capacity and incomplete messages", () => {
  const state = getChoiceCountState({
    selectedCount: 1,
    expectedCount: 2,
    noun: "feat",
  });

  assert.equal(state.isComplete, false);
  assert.equal(state.isUnderExpected, true);
  assert.equal(state.isAtCapacity, false);
  assert.deepEqual(getExpectedSelectionIssue(state), {
    reason: "Expected 2 feats, but 1 selected.",
    previousValue: 1,
    nextValue: 2,
  });
});

test("class change commands preserve graph-owned dependent state for reconciliation", () => {
  assert.deepEqual(buildClassChangePatch("ninja"), {
    "builder.classKey": "ninja",
    "builder.primaryAttribute": "",
  });
});

test("dependency graph preview reconciles excess feat selections after a level drop", () => {
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: ["Animal Transformation", "Celestial Knight Path Initiate"],
    selectedFeatOptions: [],
    selectedTechniques: [],
  }, {
    "builder.level": 3,
  });

  assert.deepEqual(preview.reconciledBuilder.selectedFeats, ["Animal Transformation"]);
  assert(preview.warnings.some((warning) => warning.includes("remove 1 feat")));
  assert(preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.selectedFeats"
    && change.label === "Celestial Knight Path Initiate"
  )));
});

test("dependency graph preview reports incomplete option groups from selected feats", () => {
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: ["Celestial Knight Path Initiate"],
    selectedFeatOptions: [],
    selectedTechniques: [],
  }, {});

  assert(preview.changes.some((change) => (
    change.type === "incomplete"
    && change.storagePath === "builder.selectedFeatOptions"
    && change.label === "Celestial Knight Path Initiate"
  )));
  assert(!preview.changes.some((change) => (
    change.type === "incomplete"
    && change.storagePath === "builder.selectedClassFeatureOptions"
    && change.label === "Shining Weapon"
  )));
});

test("dependency graph preview reports incomplete feat slot selections", () => {
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: ["Animal Transformation"],
    selectedFeatOptions: [],
    selectedTechniques: [],
  }, {});

  assert(preview.changes.some((change) => (
    change.type === "incomplete"
    && change.storagePath === "builder.selectedFeats"
    && change.label === "Feats"
    && change.nextValue === 2
    && change.previousValue === 1
  )));
  assert(preview.warnings.some((warning) => warning.includes("Feats: Expected 2 feats, but 1 selected.")));
});

test("builder page allows non-destructive incomplete notices without confirmation", async () => {
  let appliedBuilder = null;
  const page = new BuilderPage({
    getGameData: () => gameData,
    getBuilder: () => ({
      classKey: "magical-guardian",
      level: 5,
      primaryAttribute: "attunement",
      attributes: { attunement: 4 },
      selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
      selectedFeats: [],
      selectedFeatOptions: [],
      selectedTechniques: [],
      grantChoices: {},
    }),
    onWorkingBuilderChange: (builder) => {
      appliedBuilder = builder;
    },
  });
  page.hydrateBuilder(page.getBuilder());

  const result = await page.requestChoiceChange({ id: "test-technique" }, {
    "builder.selectedTechniques": ["Healing Light"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(appliedBuilder.selectedTechniques, ["Healing Light"]);
  assert(result.preview.warnings.length > 0);
  assert.deepEqual(result.confirmationWarnings, []);
});

test("builder page blocks dependency removals when no confirmation handler is registered", async () => {
  let appliedBuilder = null;
  const originalBuilder = {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: ["Animal Transformation", "Celestial Knight Path Initiate"],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {},
  };
  const page = new BuilderPage({
    getGameData: () => gameData,
    getBuilder: () => originalBuilder,
    onWorkingBuilderChange: (builder) => {
      appliedBuilder = builder;
    },
  });
  page.hydrateBuilder(originalBuilder);

  const result = await page.requestChoiceChange({ id: "test-level" }, {
    "builder.level": 3,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "confirmation-required");
  assert(result.confirmationWarnings.some((warning) => warning.includes("remove 1 feat")));
  assert.equal(appliedBuilder, null);
  assert.equal(page.getWorkingBuilder().level, 5);
  assert.deepEqual(page.getWorkingBuilder().selectedFeats, originalBuilder.selectedFeats);
});

test("builder page never offers validation errors for confirmation", async () => {
  let confirmationCalls = 0;
  let appliedBuilder = null;
  const page = new BuilderPage({
    getBuilder: () => ({ level: 5 }),
    onWorkingBuilderChange: (builder) => {
      appliedBuilder = builder;
    },
    confirmDependencyPreview: async () => {
      confirmationCalls += 1;
      return true;
    },
  });
  page.hydrateBuilder({ level: 5 });
  page.previewChoiceChange = () => ({
    reconciledBuilder: { level: 1 },
    changes: [{
      type: "invalid",
      severity: "error",
      label: "Level",
      reason: "The proposed level is invalid.",
    }],
    warnings: [],
    errors: ["The proposed level is invalid."],
    ok: false,
  });

  const result = await page.requestChoiceChange({ id: "test-level" }, {
    "builder.level": 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "validation-error");
  assert.equal(confirmationCalls, 0);
  assert.equal(appliedBuilder, null);
  assert.equal(page.getWorkingBuilder().level, 5);
});

test("builder page cancellation leaves working and widget state unchanged", async () => {
  let workingBuilderChanges = 0;
  let widgetChanges = 0;
  const originalBuilder = {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: ["Animal Transformation", "Celestial Knight Path Initiate"],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {},
  };
  const page = new BuilderPage({
    getGameData: () => gameData,
    getBuilder: () => originalBuilder,
    onWorkingBuilderChange: () => {
      workingBuilderChanges += 1;
    },
    confirmDependencyPreview: async () => false,
  });
  page.hydrateBuilder(originalBuilder);

  const result = await page.requestChoiceChange({ id: "test-level" }, {
    "builder.level": 3,
  }, {
    applyWidgetChange: () => {
      widgetChanges += 1;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cancelled");
  assert.equal(workingBuilderChanges, 0);
  assert.equal(widgetChanges, 0);
  assert.equal(page.getWorkingBuilder().level, 5);
  assert.deepEqual(page.getWorkingBuilder().selectedFeats, originalBuilder.selectedFeats);
});

test("builder page applies the reconciled state after destructive confirmation", async () => {
  let confirmationWarnings = [];
  const originalBuilder = {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: ["Animal Transformation", "Celestial Knight Path Initiate"],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {},
  };
  const page = new BuilderPage({
    getGameData: () => gameData,
    getBuilder: () => originalBuilder,
    confirmDependencyPreview: async ({ warnings }) => {
      confirmationWarnings = warnings;
      return true;
    },
  });
  page.hydrateBuilder(originalBuilder);

  const result = await page.requestChoiceChange({ id: "test-level" }, {
    "builder.level": 3,
  });

  assert.equal(result.ok, true);
  assert(confirmationWarnings.some((warning) => warning.includes("remove 1 feat")));
  assert.equal(page.getWorkingBuilder().level, 3);
  assert.deepEqual(page.getWorkingBuilder().selectedFeats, ["Animal Transformation"]);
});

test("dependency graph creates source-owned grant choice nodes", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = `choice:builder.selectedClassFeatureOptions:${key}`;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const graph = buildCharacterDependencyGraph(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      [choiceId]: { choiceId, type: "technique", techniqueName: "Bolstering Aegis" },
    },
  });

  const choiceNodeId = buildGrantChoiceNodeId(choiceId);
  assert(graph.nodes.has(choiceNodeId));
  assert.equal(graph.nodes.get(choiceNodeId).sourceId, "grant:technique-choice:Dazzling Wand:spellcasting:0");
  assert(Array.from(graph.reverseEdges.get(choiceNodeId) || []).includes("grant:technique-choice:Dazzling Wand:spellcasting:0"));
});

test("dependency graph materializes source-owned weapons from grant choice answers", () => {
  const graph = buildCharacterDependencyGraph(gameDataWithSourceOwnedWeaponGrant(), {
    classKey: "magical-guardian",
    level: 2,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      "soulbound-weapon": {
        choiceId: "soulbound-weapon",
        type: "weapon",
        weaponKey: "arcane-blade",
        rank: 2,
        customName: "Star Edge",
        sourceLabel: "Soulbound Arsenal",
      },
    },
    weapons: [
      { id: "manual-weapon", weaponKey: "staff", rank: 1, customName: "Walking Staff" },
      {
        id: "grant_soulbound-weapon",
        choiceId: "soulbound-weapon",
        sourceChoiceId: "soulbound-weapon",
        generated: true,
        weaponKey: "tampered-weapon",
        rank: 8,
        customName: "Tampered",
      },
    ],
  });

  assert.deepEqual(graph.builder.weapons, [
    { id: "manual-weapon", weaponKey: "staff", rank: 1, customName: "Walking Staff", enhancements: [] },
    {
      id: "grant_soulbound-weapon",
      choiceId: "soulbound-weapon",
      sourceChoiceId: "soulbound-weapon",
      generated: true,
      weaponKey: "arcane-blade",
      rank: 2,
      customName: "Star Edge",
      enhancements: [],
    },
  ]);
  assert(graph.nodes.has("weapon:grant_soulbound-weapon"));
  assert(Array.from(graph.edges.get("grant-choice:soulbound-weapon") || []).includes("weapon:grant_soulbound-weapon"));
});

test("dependency graph removes source-owned weapons when their granting source disappears", () => {
  const preview = previewBuilderChange(gameDataWithSourceOwnedWeaponGrant(), {
    classKey: "magical-guardian",
    level: 2,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      "soulbound-weapon": {
        choiceId: "soulbound-weapon",
        type: "weapon",
        weaponKey: "arcane-blade",
        rank: 2,
        customName: "Star Edge",
        sourceLabel: "Soulbound Arsenal",
      },
    },
    weapons: [
      { id: "manual-weapon", weaponKey: "staff", rank: 1, customName: "Walking Staff" },
      {
        id: "grant_soulbound-weapon",
        choiceId: "soulbound-weapon",
        sourceChoiceId: "soulbound-weapon",
        generated: true,
        weaponKey: "arcane-blade",
        rank: 2,
        customName: "Star Edge",
      },
    ],
  }, {
    "builder.level": 1,
  });

  assert.deepEqual(preview.reconciledBuilder.weapons, [
    { id: "manual-weapon", weaponKey: "staff", rank: 1, customName: "Walking Staff", enhancements: [] },
  ]);
  assert.deepEqual(preview.patch["builder.weapons"], preview.reconciledBuilder.weapons);
  assert(preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.weapons"
    && change.label === "Star Edge"
  )));
  assert(preview.warnings.some((warning) => warning.includes("source-owned weapon")));
});

test("source-owned technique choices satisfy granted technique picks outside global technique slots", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = `choice:builder.selectedClassFeatureOptions:${key}`;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: ["Healing Light"],
    grantChoices: {
      [choiceId]: { choiceId, type: "technique", techniqueName: "Bolstering Aegis", skill: "spellcasting" },
    },
  }, {});

  assert(!preview.changes.some((change) => (
    change.type === "incomplete"
    && change.storagePath === "builder.selectedTechniques"
    && change.nextValue === 2
  )));
  assert(preview.reconciledBuilder.grantChoices[choiceId]);
});

test("source-owned technique choices report incomplete answers on the grant choice itself", () => {
  const { key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: ["Healing Light"],
    grantChoices: {},
  }, {});

  assert(preview.changes.some((change) => (
    change.type === "incomplete"
    && change.storagePath === "builder.grantChoices"
    && change.label === "Dazzling Wand"
    && change.reason === "Dazzling Wand grants a spellcasting technique. Choose 1 technique."
    && change.nextValue === 1
  )));
});

test("grant choice sanitization preserves source-owned technique answers", () => {
  assert.deepEqual(sanitizeGrantChoices({
    "choice-1": {
      choiceId: "ignored-in-favor-of-key",
      type: "technique",
      sourceId: "grant-choice-source",
      techniqueName: "Bolstering Aegis",
      skill: "Spellcasting",
    },
  }), {
    "choice-1": {
      choiceId: "choice-1",
      type: "technique",
      sourceId: "grant-choice-source",
      techniqueName: "Bolstering Aegis",
      skill: "Spellcasting",
      weaponKey: "",
      rank: 0,
      customName: "",
      enhancements: [],
      tags: [],
    },
  });
});

test("dependency graph removes orphaned grant choice answers", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = `choice:builder.selectedClassFeatureOptions:${key}`;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      [choiceId]: { choiceId, type: "technique", techniqueName: "Bolstering Aegis", sourceLabel: "Dazzling Wand" },
    },
  }, {
    "builder.selectedClassFeatureOptions": [],
  });

  assert.deepEqual(preview.reconciledBuilder.grantChoices, {});
  assert.deepEqual(preview.patch["builder.grantChoices"], {});
  assert(preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.grantChoices"
    && change.label === "Bolstering Aegis"
    && change.reason.includes("Dazzling Wand")
  )));
});

test("class changes report and reconcile source-owned answers without page pre-clears", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = "choice:builder.selectedClassFeatureOptions:" + key;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      [choiceId]: {
        choiceId,
        type: "technique",
        techniqueName: "Prismatic Burst",
        value: "Prismatic Burst",
        sourceLabel: "Dazzling Wand",
      },
    },
  }, buildClassChangePatch("ninja"));

  assert.equal(preview.proposedBuilder.classKey, "ninja");
  assert.deepEqual(preview.proposedBuilder.selectedClassFeatureOptions, [key]);
  assert(preview.proposedBuilder.grantChoices[choiceId]);
  assert.deepEqual(preview.reconciledBuilder.selectedClassFeatureOptions, []);
  assert.deepEqual(preview.reconciledBuilder.grantChoices, {});
  assert(preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.selectedClassFeatureOptions"
    && change.previousValue === key
    && change.reason === "This option is no longer available for the current class and level."
  )));
  assert(preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.grantChoices"
    && change.label === "Prismatic Burst"
    && change.reason.includes("Dazzling Wand")
  )));
  assert(summarizeDependencyRemovals(preview.changes).some((warning) => (
    warning === "Prismatic Burst was chosen from Dazzling Wand, which is no longer selected."
  )));
});

test("class change cancellation preserves source-owned state until confirmed", async () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = "choice:builder.selectedClassFeatureOptions:" + key;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const originalBuilder = {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      [choiceId]: {
        choiceId,
        type: "technique",
        techniqueName: "Prismatic Burst",
        value: "Prismatic Burst",
        sourceLabel: "Dazzling Wand",
      },
    },
  };
  let confirmChange = false;
  let presentedWarnings = [];
  const page = new BuilderPage({
    getGameData: () => gameData,
    getBuilder: () => originalBuilder,
    confirmDependencyPreview: async ({ warnings }) => {
      presentedWarnings = warnings;
      return confirmChange;
    },
  });
  page.hydrateBuilder(originalBuilder);

  const cancelled = await page.requestChoiceChange(
    { id: "class-choice" },
    buildClassChangePatch("ninja"),
  );

  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.reason, "cancelled");
  assert(presentedWarnings.some((warning) => warning.includes("Prismatic Burst")));
  assert.equal(page.getWorkingBuilder().classKey, "magical-guardian");
  assert.deepEqual(page.getWorkingBuilder().selectedClassFeatureOptions, [key]);
  assert(page.getWorkingBuilder().grantChoices[choiceId]);

  confirmChange = true;
  const confirmed = await page.requestChoiceChange(
    { id: "class-choice" },
    buildClassChangePatch("ninja"),
  );

  assert.equal(confirmed.ok, true);
  assert.equal(page.getWorkingBuilder().classKey, "ninja");
  assert.deepEqual(page.getWorkingBuilder().selectedClassFeatureOptions, []);
  assert.deepEqual(page.getWorkingBuilder().grantChoices, {});
});

test("immediate dependency summaries include source-owned choice removals", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = `choice:builder.selectedClassFeatureOptions:${key}`;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: [],
    grantChoices: {
      [choiceId]: {
        choiceId,
        type: "technique",
        techniqueName: "Prismatic Burst",
        value: "Prismatic Burst",
        sourceLabel: "Dazzling Wand",
      },
    },
  }, {
    "builder.selectedClassFeatureOptions": [],
  });

  assert.deepEqual(summarizeDependencyRemovals(preview.changes), [
    "Prismatic Burst was chosen from Dazzling Wand, which is no longer selected.",
  ]);
});

test("dependency graph migrates legacy truncated grant choice ids", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = `choice:builder.selectedClassFeatureOptions:${key}`;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const legacyChoiceId = sourceId;
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 1 },
    selectedClassFeatureOptions: [key],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: ["Healing Light"],
    grantChoices: {
      [legacyChoiceId]: { choiceId: legacyChoiceId, type: "technique", techniqueName: "Bolstering Aegis", skill: "spellcasting" },
    },
  }, {});

  assert(preview.reconciledBuilder.grantChoices[choiceId]);
  assert(!preview.reconciledBuilder.grantChoices[legacyChoiceId]);
  assert(!preview.changes.some((change) => (
    change.type === "incomplete"
    && change.storagePath === "builder.grantChoices"
  )));
});

test("dependency graph removes granted and source-owned techniques from normal technique selections", () => {
  const { option, key } = magicalGuardianAccessoryOption("Dazzling Wand");
  const sourceId = `choice:builder.selectedClassFeatureOptions:${key}`;
  const choiceId = resolveGrantChoiceId(option.grants[0], { sourceId, index: 0 });
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 4 },
    selectedClassFeatureOptions: [key],
    selectedFeats: ["Dazzling Transformation"],
    selectedFeatOptions: [],
    selectedTechniques: [
      "Prismatic Burst",
      "Dazzling Transformation",
      "Healing Light",
      "Bolstering Aegis",
      "Guardian Bubble",
      "Solar Charm",
    ],
    grantChoices: {
      [choiceId]: {
        choiceId,
        type: "technique",
        techniqueName: "Prismatic Burst",
        value: "Prismatic Burst",
        skill: "spellcasting",
        sourceId,
        sourceLabel: "Dazzling Wand",
      },
    },
  }, {});

  assert.deepEqual(preview.reconciledBuilder.selectedTechniques, [
    "Bolstering Aegis",
    "Guardian Bubble",
    "Healing Light",
    "Solar Charm",
  ]);
  assert(!preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.selectedTechniques"
    && change.reason === "Selected techniques exceed available technique picks."
  )));
});

test("dependency graph preview removes selected techniques that no longer fit available picks", () => {
  const preview = previewBuilderChange(gameData, {
    classKey: "magical-guardian",
    level: 5,
    primaryAttribute: "attunement",
    attributes: { attunement: 0 },
    selectedClassFeatureOptions: [magicalGuardianAccessoryKey("Dazzling Wand")],
    selectedFeats: [],
    selectedFeatOptions: [],
    selectedTechniques: ["Bolstering Aegis"],
  }, {
    "builder.selectedClassFeatureOptions": [],
  });

  assert.deepEqual(preview.reconciledBuilder.selectedTechniques, []);
  assert(preview.warnings.some((warning) => warning.includes("remove 1 selected technique")));
  assert(preview.changes.some((change) => (
    change.type === "remove"
    && change.storagePath === "builder.selectedTechniques"
    && change.label === "Bolstering Aegis"
  )));
});
