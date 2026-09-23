import assert from "node:assert/strict";
import test from "node:test";
import { getOptionGroupCompletion } from "../public/js/core/option-choice-rules.js";
import { OptionGroupWidget } from "../public/js/builder/widgets/option-group-widget.js";
import { reconcileCharacterGraph, createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { SetClass, SetClassFeatureOptions, SetFeatOptions } from "../public/js/core/character-commands.js";
import { getBuilderStepInformationalMessages } from "../public/js/builder/builder-step-impacts.js";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";

const deferred = { expressionSyntaxVersion: 3, runtimeSupport: { status: "deferred", reasons: ["draft-record-granted"] } };
const choiceWarnings = (result) => result.impacts.filter((impact) => ["class-option-selection-incomplete", "feat-option-selection-incomplete"].includes(impact.code));

function fixture() {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  const group = gameData.classFeatures.ninja.find((entry) => entry.type === "optionGroup");
  const character = makeGraphCharacter({ selectedClassFeatureOptions: [], selectedFeats: [], selectedFeatOptions: [] });
  const reconcile = () => reconcileCharacterGraph({ character, previousCharacter: character, gameData });
  return { gameData, group, character, reconcile };
}

test("hidden, empty and unavailable Class groups do not demand impossible selections during save", () => {
  for (const kind of ["unready-options", "empty", "unready-group", "unmet-options"]) {
    const { gameData, group, character, reconcile } = fixture();
    if (kind === "unready-options") group.options.forEach((option) => Object.assign(option, deferred));
    if (kind === "empty") group.options = [];
    if (kind === "unready-group") Object.assign(group, deferred);
    if (kind === "unmet-options") group.options.forEach((option) => { option.prerequisites = [{ type: "class", key: "ninja", level: 12 }]; });
    const before = structuredClone(character);
    const result = reconcile();
    assert.equal(result.ok, true, kind);
    assert.deepEqual(choiceWarnings(result), [], kind);
    assert.equal(result.graph.nodes.find((node) => node.type === "choice-group").metadata.expectedCount, 1, "authored capacity is not rewritten");
    const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
    const refresh = session.propose(SetClass("ninja"));
    assert.equal(refresh.ok, true);
    assert.deepEqual(choiceWarnings(refresh), []);
    session.acceptProposal(refresh.proposalId, { confirm: true });
    assert.equal(session.createSaveSnapshot().character.builder.classKey, "ninja");
    assert.deepEqual(character, before);
  }
});

test("actionable Class reminders name their feature and disappear when its choice is selected", () => {
  const { gameData, group, character, reconcile } = fixture();
  group.options[1].prerequisites = [];
  Object.assign(group.options[0], deferred);
  const result = reconcile();
  const warnings = choiceWarnings(result);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, "Shadow Discipline: choose 1 more option (0/1 selected).");
  assert.ok(getBuilderStepInformationalMessages(result, "class").includes(warnings[0].message));
  assert.ok(!getBuilderStepInformationalMessages(result, "attributes").includes(warnings[0].message));
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const selection = session.propose(SetClassFeatureOptions(["master-path"]));
  assert.equal(selection.ok, true);
  assert.deepEqual(choiceWarnings(selection), []);
  session.acceptProposal(selection.proposalId, { confirm: true });
  assert.deepEqual(session.createSaveSnapshot().character.builder.selectedClassFeatureOptions, ["master-path"]);
});

test("Feat option reminders use the same readiness and prerequisite policy", () => {
  const { gameData, group, character, reconcile } = fixture();
  group.options = [];
  character.builder.selectedFeats = ["moon-initiate"];
  const feat = gameData.feats.find((entry) => entry.featKey === "moon-initiate");
  feat.options.forEach((option) => Object.assign(option, deferred));
  assert.deepEqual(choiceWarnings(reconcile()), []);
  feat.options[0].runtimeSupport = { status: "supported", reasons: [] };
  const warning = choiceWarnings(reconcile());
  assert.equal(warning.length, 1);
  assert.equal(warning[0].message, "Moon Initiate: choose 1 more option (0/1 selected).");
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const selection = session.propose(SetFeatOptions(["moon-initiate-shroud"]));
  assert.equal(selection.ok, true);
  assert.deepEqual(choiceWarnings(selection), []);
});

test("reminders ask only for remaining available choices while keeping capacity and selected counts", () => {
  const group = { name: "Adaptations", chooseCount: 3, options: [
    { featureKey: "chosen" }, { featureKey: "ready" }, { featureKey: "unfinished", ...deferred },
  ] };
  const selectedKeys = new Set(["chosen"]);
  const state = getOptionGroupCompletion(group, { selectedKeys });
  assert.equal(state.message, "Adaptations: choose 1 more option (1/3 selected).");
  assert.equal(state.expectedCount, 3);
  selectedKeys.add("ready");
  assert.equal(getOptionGroupCompletion(group, { selectedKeys }).message, "");
  group.chooseCount = 1;
  assert.match(getOptionGroupCompletion(group, { selectedKeys }).message, /Adaptations: Expected 1 option, but 2 selected/);
  const widget = { group, checkEntryPrerequisites: () => ({ ok: true, failureReasons: [] }) };
  assert.equal(OptionGroupWidget.prototype.checkAvailability.call(widget, group.options[2]).ok, false);
  assert.equal(OptionGroupWidget.prototype.checkAvailability.call(widget, group.options[1]).ok, true);
});

test("suppressing impossible reminders does not make unavailable selected options valid", () => {
  const { group, character, reconcile } = fixture();
  Object.assign(group.options[0], deferred);
  character.builder.selectedClassFeatureOptions = ["moon-path"];
  const result = reconcile();
  assert.equal(result.ok, false);
  assert.ok(result.impacts.some((impact) => impact.category === "error" && impact.code === "unavailable-feature-option"));
});
