import assert from "node:assert/strict";
import test from "node:test";
import { TechniquesWidget } from "../public/js/builder/widgets/techniques-widget.js";
import { TechniqueChoiceWidget } from "../public/js/builder/widgets/technique-choice-widget.js";

function fixture(active = true) {
  const technique = (techniqueKey, status = "playable", selectionRoutes = [{ type: "granted" }]) => ({
    techniqueKey, techniqueName: techniqueKey, status, rank: 1,
    expressionSyntaxVersion: 3, selectionRoutes, prerequisites: [],
  });
  const gameData = {
    schemaVersion: 3, techniques: [technique("ready"), technique("draft", "draft"), technique("unfinished", "incomplete"),
      { ...technique("liquid-strike", "playable", [{ type: "tag", name: "Liquid" }]), rank: 3 }],
    traits: [{ traitKey: "liquid-form", name: "Liquid Form", rank: 1, description: "Flow through narrow openings.",
      expressionSyntaxVersion: 3, tags: ["Body"], grants: [{ type: "tag", tag: "Liquid", minRank: 1 }], techniqueKeys: ["ready", "draft", "unfinished"] }],
    origins: [{ originKey: "test-origin", name: "Test Origin", features: [{
      originKey: "test-origin", featureKey: "form", name: "Liquid Form Provider", level: 1,
      expressionSyntaxVersion: 3, grants: [{ type: "trait", key: "liquid-form", rank: 3 }],
    }] }],
  };
  const builder = { originKey: "test-origin", level: 1, selectedTechniques: [], traitChoices: {},
    traitActivations: { "origin:test-origin:form": { activationId: "origin:test-origin:form", sourceId: "origin:test-origin", active } } };
  const widget = Object.create(TechniquesWidget.prototype);
  widget.getBuilder = () => builder;
  widget.getGameData = () => gameData;
  widget.getTechniqueIndexes = () => null;
  widget.getSelectedTechniques = () => new Set(builder.selectedTechniques);
  return { widget, builder, gameData };
}

test("active Trait techniques appear as free grants at their provider rank without enabling unfinished records", () => {
  const { widget, builder, gameData } = fixture();
  const context = widget.getTechniqueContext();
  assert.deepEqual([...context.grantedTechniqueNames], ["ready"]);
  assert.equal(context.grantedTechniqueDetails.get("ready").label, "Granted by Liquid Form");
  assert.equal(widget.getTechniqueSkillRank(gameData.techniques[0], context), 3);
  assert.equal(widget.passesKnownSkillFilter(gameData.techniques[0], context), true);
  builder.selectedTechniques = ["ready"];
  assert.equal(context.slots, 0);
  assert.equal(widget.selectedTechniquesFitSlots(widget.selectedTechniques(), context), true);
  assert.deepEqual(widget.getSavePatch(), { "builder.selectedTechniques": [] }, "a source-owned grant consumes no learned selection");
});

test("legacy inactive form state does not suppress static acquisition or mutate choices", () => {
  const { widget, builder, gameData } = fixture(false);
  const before = structuredClone(builder);
  const context = widget.getTechniqueContext();
  assert.deepEqual([...context.grantedTechniqueNames], ["ready"]);
  assert.equal(widget.passesKnownSkillFilter(gameData.techniques[0], context), true);
  assert.deepEqual(builder, before);
});

test("both Technique widgets receive active Trait tag ranks from the shared prerequisite context", () => {
  const { widget, builder, gameData } = fixture();
  const technique = gameData.techniques.find((record) => record.techniqueKey === "liquid-strike");
  const context = widget.getTechniqueContext();
  assert.equal(widget.getTechniqueAccess(technique, context).eligible, true);
  assert.equal(widget.getTechniqueSkillRank(technique, context), 3);
  const choice = Object.create(TechniqueChoiceWidget.prototype);
  choice.gameData = gameData;
  choice.grant = { skill: "Martial Arts" };
  assert.equal(choice.getTechniqueSkillRank(technique, context), 3);
  builder.traitActivations["origin:test-origin:form"].active = false;
  assert.equal(choice.getTechniqueSkillRank(technique, widget.getTechniqueContext()), 3);
  assert.equal(widget.getTechniqueAccess(technique, widget.getTechniqueContext()).eligible, true);
  builder.originKey = "";
  assert.equal(widget.getTechniqueAccess(technique, widget.getTechniqueContext()).eligible, false);
});
