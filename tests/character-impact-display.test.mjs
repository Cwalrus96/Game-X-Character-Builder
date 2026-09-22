import assert from "node:assert/strict";
import test from "node:test";
import { describeCharacterChange } from "../public/js/builder/character-impact-display.js";
import { CharacterSessionPage } from "../public/js/builder/character-session-page.js";
import { SetClass } from "../public/js/core/character-commands.js";
import { reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";

const remove = (path, nodeId, label, before, code = "source-removed") => ({
  category: "confirmation-required", type: "remove", path, nodeId, label, before, code,
  message: "Internal diagnostic wording must not be used as the removal label.",
});

test("class removal summary uses consistent labels and combines a feat with its derived ability", () => {
  const impacts = [
    remove("builder.primaryAttribute", "class:new", "heart", "heart"),
    remove("builder.resources.charms", "resource:charms", "Charms", { name: "Charms" }),
    remove("builder.selectedFeats", "feat-selection:bright-form", "Bright Form", "bright-form"),
    remove("builder.sheet.repeatables.abilities", "feat-selection:bright-form", "Feat - Bright Form", { sourceId: "feat-selection:bright-form", name: "Feat - Bright Form" }, "source-owned-ability-removed"),
    remove("builder.sheet.repeatables.abilities", "class-feature:mage:feat-2", "Class Feature - Mage Feat", { sourceId: "class-feature:mage:feat-2", name: "Class Feature - Mage Feat" }, "source-owned-ability-removed"),
    remove("builder.sheet.repeatables.abilities", "class-feature:mage:feat-4", "Class Feature - Mage Feat", { sourceId: "class-feature:mage:feat-4", name: "Class Feature - Mage Feat" }, "source-owned-ability-removed"),
    { category: "error", type: "remove", message: "Blocking errors are not confirmable." },
    { category: "informational", message: "Choose a new primary attribute." },
  ];
  const gameData = { classFeatures: { mage: [{ featureKey: "feat-2", name: "Mage Feat", level: 2 }, { featureKey: "feat-4", name: "Mage Feat", level: 4 }] } };
  const original = JSON.stringify(impacts);
  const result = describeCharacterChange({ command: { type: "SetClass" }, impacts }, { gameData });
  assert.equal(result.message, "Changing your class will remove the following choices and features:");
  assert.deepEqual(result.messages, ["Primary attribute: Heart", "Resource: Charms", "Feat: Bright Form", "Class feature: Mage Feat (level 2)", "Class feature: Mage Feat (level 4)"]);
  assert.deepEqual(result.sections, []);
  assert.equal(JSON.stringify(impacts), original);
});

test("equal names retain distinct identities and old-class option summaries combine only the matching ability", () => {
  const impacts = [
    remove("builder.selectedFeats", "feat-selection:first", "Shared Name", "first"),
    remove("builder.selectedFeats", "feat-selection:second", "Shared Name", "second"),
    remove("builder.selectedClassFeatureOptions", "class-option:new:moon-path", "moon-path", "moon-path"),
    remove("builder.sheet.repeatables.abilities", "class-option:ninja:moon-path", "Class Feature - Moon Path", { sourceId: "class-option:ninja:moon-path", name: "Class Feature - Moon Path" }, "source-owned-ability-removed"),
  ];
  const result = describeCharacterChange({ impacts }, { gameData: GRAPH_GAME_DATA, character: makeGraphCharacter() });
  assert.deepEqual(result.messages, ["Feat: Shared Name", "Feat: Shared Name", "Class feature: Moon Path"]);
});

test("granted weapon and materialized equipment share one bullet; catalogue keys resolve to readable names", () => {
  const impacts = [
    remove("builder.grantChoices.bound", "grant-answer:bound", "Bound weapon", { choiceId: "bound", type: "weapon", weaponKey: "longsword" }),
    remove("builder.weapons", "weapon:generated", "longsword", { sourceChoiceId: "bound", weaponKey: "longsword" }),
    remove("builder.selectedTechniques", "technique-selection:shadow-step", "shadow-step", "shadow-step"),
    remove("builder.traitChoices.wings", "trait-choice:wings", "Mobility choice", { traitKey: "wings" }),
  ];
  const result = describeCharacterChange({ impacts }, { gameData: { ...GRAPH_GAME_DATA, traits: [{ traitKey: "wings", name: "Wings" }] } });
  assert.deepEqual(result.messages, ["Weapon: Longsword", "Technique: Shadow Step", "Trait: Wings"]);
});

test("adjustments show final scalar values separately and free techniques are not described as lost", () => {
  const change = (before, after) => ({ category: "confirmation-required", type: "change", path: "builder.attributes.heart", nodeId: "fact:attribute:heart", label: "heart", before, after });
  const proposal = {
    command: { type: "SetLevel" },
    proposed: { builder: { attributes: { heart: 5 } } },
    reconciled: { builder: { attributes: { heart: 2 } } },
    impacts: [
      remove("builder.selectedFeats", "feat-selection:shadow-adept", "Shadow Adept", "shadow-adept"),
      change(5, 3), change(3, 2),
      remove("builder.selectedTechniques", "technique-selection:shadow-step", "Shadow Step", "shadow-step", "automatic-technique-removed-from-normal-slots"),
      { category: "confirmation-required", type: "adjust", nodeId: "custom", message: "Review this unfamiliar adjustment.", before: {}, after: {} },
    ],
  };
  const result = describeCharacterChange(proposal, { gameData: GRAPH_GAME_DATA });
  assert.deepEqual(result.messages, ["Feat: Shadow Adept"]);
  assert.deepEqual(result.sections, [{ message: "It will also make these adjustments:", messages: ["Attribute: Heart — 5 → 2", "Technique: Shadow Step — now granted automatically", "Review this unfamiliar adjustment."] }]);
  const adjustmentsOnly = describeCharacterChange({ ...proposal, impacts: [change(5, 2)] });
  assert.equal(adjustmentsOnly.message, "Changing your level will make the following adjustments:");
  assert.deepEqual(adjustmentsOnly.messages, ["Attribute: Heart — 5 → 2"]);
});

test("readable confirmations preserve cancellation, exact acceptance and save snapshots", async () => {
  const original = makeGraphCharacter({ level: 2, primaryAttribute: "agility", selectedFeats: ["shadow-adept"], selectedClassFeatureOptions: ["moon-path"] });
  const { character } = reconcileCharacterGraph({ character: original, previousCharacter: original, gameData: GRAPH_GAME_DATA });
  let accept = false;
  let summary;
  const page = new CharacterSessionPage({ character, gameData: GRAPH_GAME_DATA, confirmImpacts: async payload => { summary = payload.summary; return accept; } });
  const before = page.getCharacter();
  const cancelled = await page.requestCharacterCommand(null, SetClass("guardian"));
  assert.equal(cancelled.reason, "cancelled");
  assert.deepEqual(page.getCharacter(), before);
  assert.equal(summary.messages.filter(value => value === "Feat: Shadow Adept").length, 1);
  assert.equal(summary.messages.filter(value => value === "Class feature: Moon Path").length, 1);
  assert.ok(summary.messages.includes("Primary attribute: Agility"));
  accept = true;
  const accepted = await page.requestCharacterCommand(null, SetClass("guardian"));
  assert.equal(accepted.ok, true);
  assert.deepEqual(page.getCharacter(), accepted.proposal.reconciled);
  let saved;
  await page.save(async snapshot => { saved = snapshot.character; return { revision: 1 }; });
  assert.deepEqual(saved, accepted.proposal.reconciled);
});

test("blocking failures never reach the readable confirmation dialog", async () => {
  let called = false;
  const page = new CharacterSessionPage({ character: makeGraphCharacter(), gameData: GRAPH_GAME_DATA, confirmImpacts: async () => { called = true; return true; } });
  const before = page.getCharacter();
  const result = await page.requestCharacterCommand(null, SetClass("missing-class"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "validation-error");
  assert.equal(called, false);
  assert.ok(result.errors.length);
  assert.deepEqual(page.getCharacter(), before);
});
