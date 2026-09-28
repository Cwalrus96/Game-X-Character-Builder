import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";
import { collectAffectedNodeIds } from "../public/js/core/graph-core.js";
import { projectTechniqueOwnership } from "../public/js/core/technique-ownership.js";
import { getTechniqueGrantSelectionState } from "../public/js/core/technique-grant-rules.js";
import { projectSheetTechniques } from "../public/js/core/sheet-technique-projection.js";
import { projectCharacterKeystones } from "../public/js/core/keystone-projection.js";
import { buildKeystoneAnswer, getKeystoneChoices } from "../public/js/core/keystone-rules.js";
import { getExplicitFeatSlots } from "../public/js/core/feat-rules.js";
import { createPrerequisiteContext, checkPrerequisites } from "../public/js/core/prerequisites.js";
import { getTechniqueRollChoices } from "../public/js/core/sheet-roll-context.js";
import { TechniquesWidget } from "../public/js/builder/widgets/techniques-widget.js";
import { TechniqueChoiceWidget } from "../public/js/builder/widgets/technique-choice-widget.js";
import { CharacterSessionPage } from "../public/js/builder/character-session-page.js";
import { SetClassFeatureOptions } from "../public/js/core/character-commands.js";
import { projectCharacterTraits } from "../public/js/core/trait-projection.js";
import { computeGrantedSkillsState } from "../public/js/core/skill-rules.js";

const ownerKinds = ["class-feature", "class-option", "origin", "origin-feature", "feat-selection", "feat-option"];
const ready = { expressionSyntaxVersion: 3, status: "playable", selectable: true };

function fixture(kind = "class-option", grant = { type: "technique-choice", skill: "Spellcasting", choiceId: "bonus" }) {
  const technique = { ...ready, techniqueKey: "shared-strike", techniqueName: "Shared Strike", rank: 1,
    skill: "Spellcasting", skillKeys: ["spellcasting"], tags: ["Arcane"], tagKeys: ["Arcane"],
    selectionRoutes: [{ type: "skill", name: "Spellcasting" }, { type: "granted" }],
    rollRequired: true, attribute: "Heart", defense: "Spiritual", damage: "5 + Hits", prerequisites: [] };
  const gameData = { schemaVersion: 3, expressionSyntaxVersion: 3,
    classes: [{ ...ready, classKey: "mage", name: "Mage", primaryAttributeA: "Heart", combatTechniqueSkill: "Spellcasting" }],
    classSkills: [], classFeatures: { mage: [{ ...ready, type: "feature", classKey: "mage", featureKey: "feat-slot", level: 1, name: "Training", grants: [{ type: "feat", key: "provider", count: 1 }] }] },
    origins: [{ ...ready, originKey: "home", name: "Home", features: [], grants: [] }],
    feats: [{ ...ready, featKey: "provider", name: "Provider", type: "feature", grants: [], prerequisites: [] }],
    traits: [], techniques: [technique, { ...technique, techniqueKey: "follow-up", techniqueName: "Follow Up", prerequisites: [{ type: "technique", key: "shared-strike" }] }],
    weaponBases: [], weaponEnhancements: [] };
  const character = createDefaultCharacter({ ownerUid: "source_test" });
  Object.assign(character.builder, { classKey: "mage", primaryAttribute: "heart", originKey: "home", level: 2 });
  character.builder.attributes.heart = 2;
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Spellcasting", rank: "2" }];
  const entry = { ...ready, type: "feature", featureKey: "gift", name: "Gift", level: 1, grants: [grant], prerequisites: [] };
  let sourceId;
  if (kind === "class-feature") { entry.classKey = "mage"; gameData.classFeatures.mage.push(entry); sourceId = "class-feature:mage:gift"; }
  if (kind === "class-option") {
    Object.assign(entry, { classKey: "mage", type: "option" });
    gameData.classFeatures.mage.push({ ...ready, type: "optionGroup", classKey: "mage", featureKey: "path", name: "Path", chooseCount: 1, level: 1, options: [entry] });
    character.builder.selectedClassFeatureOptions = ["gift"]; sourceId = "class-option:mage:gift";
  }
  if (kind === "origin") { Object.assign(gameData.origins[0], { grants: [grant], name: "Gift" }); sourceId = "origin:home"; }
  if (kind === "origin-feature") { entry.originKey = "home"; gameData.origins[0].features.push(entry); sourceId = "origin-feature:home:gift"; }
  if (kind === "feat-selection") { Object.assign(gameData.feats[0], { grants: [grant], name: "Gift" }); character.builder.selectedFeats = ["provider"]; sourceId = "feat-selection:provider"; }
  if (kind === "feat-option") {
    Object.assign(entry, { type: "option", featKey: "gift" }); delete entry.featureKey;
    Object.assign(gameData.feats[0], { type: "optionGroup", chooseCount: 1, options: [entry] });
    character.builder.selectedFeats = ["provider"]; character.builder.selectedFeatOptions = ["gift"]; sourceId = "feat-option:gift";
  }
  const removeSource = () => {
    if (kind.startsWith("class")) character.builder.classKey = "";
    if (kind.startsWith("origin")) character.builder.originKey = "";
    if (kind.startsWith("feat")) character.builder.selectedFeats = [];
  };
  return { gameData, character, builder: character.builder, technique, sourceId, entry, removeSource };
}

function answer(f, key = "shared-strike") {
  f.builder.grantChoices.bonus = { choiceId: "bonus", type: "technique", techniqueKey: key, sourceId: f.sourceId,
    sourceLabel: "Stale label", value: "", skillKey: "spellcasting", weaponKey: "", rank: 0, customName: "", enhancements: [], tags: [] };
}
function widget(f) {
  return Object.assign(Object.create(TechniquesWidget.prototype), {
    getBuilder: () => f.builder, getGameData: () => f.gameData, getTechniqueIndexes: () => null,
    getSelectedTechniques: () => new Set(f.builder.selectedTechniques),
  });
}
const known = f => checkPrerequisites([{ type: "technique", key: "shared-strike" }], { builder: f.builder, gameData: f.gameData }).ok;

for (const kind of ownerKinds) {
  test(`${kind}: the same Technique is known, displayed, rolled and removed consistently`, () => {
    for (const choice of [false, true]) {
      const f = fixture(kind, choice ? undefined : { type: "technique", key: "shared-strike" });
      if (choice) answer(f);
      const before = structuredClone(f.character);
      assert.equal(known(f), true);
      const control = widget(f), context = control.getTechniqueContext();
      assert.equal(control.isFreeTechniqueName("shared-strike", context), true);
      assert.equal(control.getTechniqueSkillRank(f.technique, context), 2);
      const [card] = projectSheetTechniques(f).filter(item => item.tech.techniqueKey === "shared-strike");
      assert.ok(card);
      assert.equal(card.source, "Granted by Gift");
      const grantedRoll = getTechniqueRollChoices({ technique: card.tech, builder: f.builder, gameData: f.gameData, provider: card.provider });
      const ordinary = structuredClone(f.builder);
      ordinary.grantChoices = {}; ordinary.selectedTechniques = ["shared-strike"];
      assert.deepEqual(grantedRoll, getTechniqueRollChoices({ technique: f.technique, builder: ordinary, gameData: f.gameData }));
      assert.deepEqual(f.character, before);
      f.builder.selectedTechniques = ["follow-up"];
      const graph = compileCharacterGraph(f);
      assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
      const requirement = graph.nodes.find(node => node.id === "requirement:technique-selection:follow-up:0:technique");
      assert.equal(requirement.metadata.met, true);
      assert(graph.edges.some(edge => edge.kind === "satisfies" && edge.to === requirement.id
        && edge.from.startsWith(choice ? "grant-answer:" : "automatic-technique:")));
      assert(collectAffectedNodeIds(graph, [f.sourceId]).includes("technique-selection:follow-up"));
      const previousCharacter = structuredClone(f.character);
      f.removeSource();
      assert.equal(known(f), false);
      assert.equal(widget(f).getTechniqueContext().grantedTechniqueNames.has("shared-strike"), false);
      assert.equal(projectSheetTechniques(f).some(item => item.tech.techniqueKey === "shared-strike"), false);
      const reconciled = reconcileCharacterGraph({ ...f, previousCharacter });
      assert.equal(reconciled.ok, true, JSON.stringify(reconciled.impacts));
      assert.equal(reconciled.character.builder.selectedTechniques.includes("follow-up"), false);
      assert(reconciled.impacts.some(impact => impact.category === "confirmation-required" && impact.path === "builder.selectedTechniques"));
    }
  });

  test(`${kind}: Keystone answers share text behavior and require their active owner`, () => {
    const grant = { type: "choice", filterType: "keystone", count: 1 };
    const f = fixture(kind, grant);
    const choice = getKeystoneChoices(grant, { sourceId: f.sourceId, sourceLabel: "Old source label", index: 0 })[0];
    f.builder.grantChoices[choice.choiceId] = buildKeystoneAnswer(choice, "I protect my friends.");
    f.builder.originKeystone = "Remember home.";
    f.builder.backgroundKeystones = ["Keep learning."];
    f.builder.bonds = [{ bondId: "friend", name: "Friend", rank: "1", keystone: "Stand together." }];
    const entries = projectCharacterKeystones(f);
    assert.deepEqual(entries.map(item => item.text), ["Remember home.", "Keep learning.", "Stand together.", "I protect my friends."]);
    assert.equal(entries.at(-1).title, "Gift");
    f.removeSource();
    assert.equal(projectCharacterKeystones(f).some(item => item.source === "grant"), false);
  });
}

test("ordinary learning and Trait grants supply the same prerequisite and roll context", () => {
  const f = fixture("origin-feature", { type: "trait", key: "gift-trait", rank: 2 });
  f.gameData.traits = [{ ...ready, traitKey: "gift-trait", name: "Gift Trait", description: "An arcane gift.", rank: 1,
    techniqueKeys: ["shared-strike"], grants: [], prerequisites: [] }];
  assert.equal(known(f), true);
  const [card] = projectSheetTechniques(f).filter(item => item.tech.techniqueKey === "shared-strike");
  assert.equal(card.performance.rank, 2);
  assert.equal(widget(f).getTechniqueContext().grantedTechniqueNames.has("shared-strike"), true);
  f.removeSource(); f.builder.selectedTechniques = ["shared-strike"];
  assert.equal(known(f), true);
  assert.equal(projectSheetTechniques(f).find(item => item.tech.techniqueKey === "shared-strike").source, "Selected");
});

test("grant cycles cannot invent known Techniques, and a fixed grant can unlock a dependent Trait", () => {
  const f = fixture("class-feature", { type: "technique", key: "shared-strike" });
  f.entry.prerequisites = [{ type: "technique", key: "shared-strike" }];
  assert.equal(known(f), false);
  f.entry.prerequisites = [];
  f.gameData.origins[0].grants = [{ type: "trait", key: "reward", rank: 1 }];
  f.gameData.traits = [{ ...ready, traitKey: "reward", name: "Reward", description: "Learned mastery.", rank: 1,
    prerequisites: [{ type: "technique", key: "shared-strike" }], grants: [], techniqueKeys: [] }];
  assert(projectTechniqueOwnership(f).traitProjection.traits.some(trait => trait.traitKey === "reward"));
  assert(projectCharacterTraits(f.character, f.gameData).traits.some(trait => trait.traitKey === "reward"));
});

test("unanswered feature choices never add ordinary technique capacity", () => {
  const f = fixture(), control = widget(f), context = control.getTechniqueContext();
  assert.equal(context.slots, 2);
  assert.equal(control.selectedTechniquesFitSlots(new Set(["a", "b", "c"]), context), false);
  answer(f);
  f.builder.selectedTechniques = ["shared-strike"];
  assert.deepEqual(control.getSavePatch(), { "builder.selectedTechniques": [] });
});

test("skill, tag and identity choices use the same filters and rank checks in the picker and graph", () => {
  const f = fixture(); answer(f);
  const picker = Object.assign(Object.create(TechniqueChoiceWidget.prototype), { gameData: f.gameData, grant: f.entry.grants[0], getBuilder: () => f.builder });
  assert.equal(picker.getAvailableTechniques().some(item => item.techniqueKey === "shared-strike"), true);
  f.technique.rank = 3;
  assert.equal(picker.getAvailableTechniques().some(item => item.techniqueKey === "shared-strike"), false);
  assert.equal(compileCharacterGraph(f).nodes.find(node => node.id === "grant-answer:bonus").metadata.valid, false);
  assert.equal(known(f), false);
  f.technique.rank = 1;
  for (const grant of [{ type: "technique", tag: "Arcane" }, { type: "technique", key: ["shared-strike", "other"] }]) {
    picker.grant = grant;
    assert.equal(picker.getAvailableTechniques().some(item => item.techniqueKey === "shared-strike"), true);
    assert.equal(getTechniqueGrantSelectionState(f.technique, grant, createPrerequisiteContext(f)).eligible, true);
  }
});

test("Feat grants inside Feats allocate identically to grants from other features", () => {
  const f = fixture("feat-selection", { type: "feat", key: "second", count: 1 });
  f.gameData.feats.push({ ...ready, featKey: "second", name: "Second Feat", prerequisites: [], grants: [{ type: "technique", key: "shared-strike" }] });
  f.builder.selectedFeats.push("second");
  const graph = compileCharacterGraph(f);
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.find(node => node.id === "feat-selection:second").metadata.slotMatched, true);
  assert.equal(getExplicitFeatSlots(f.gameData, f.builder).length, 2);
  assert.equal(known(f), true);
  f.builder.selectedFeats = ["second"];
  assert.equal(known(f), false, "an orphaned Feat cannot supply a Technique");
  assert.equal(compileCharacterGraph(f).nodes.find(node => node.id === "feat-selection:second").metadata.slotMatched, false);
});

test("nested Feat options retain the same owner and grant behavior", () => {
  const f = fixture("feat-option"); answer(f);
  f.gameData.feats[0].options = [{ ...ready, featKey: "nested", name: "Nested", type: "optionGroup", chooseCount: 1, grants: [], options: [f.entry] }];
  f.builder.selectedFeatOptions.push("nested");
  assert.equal(known(f), true);
  const graph = compileCharacterGraph(f);
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.find(node => node.id === "grant-answer:bonus").metadata.valid, true);
  assert.equal(graph.nodes.find(node => node.id === "feat-option:gift").metadata.orphaned, false);
  assert.equal(reconcileCharacterGraph(f).character.builder.grantChoices.bonus?.techniqueKey, "shared-strike");
});

test("an option group can itself grant the same Technique without losing its source", () => {
  const f = fixture("class-option", { type: "technique", key: "shared-strike" });
  const group = f.gameData.classFeatures.mage.find(entry => entry.featureKey === "path");
  group.grants = f.entry.grants; f.entry.grants = [];
  f.builder.selectedClassFeatureOptions = [];
  assert.equal(known(f), true);
  const graph = compileCharacterGraph(f);
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  assert(graph.nodes.some(node => node.id === "automatic-technique:class-feature:mage:path:shared-strike:0"));
});

test("invalid ancestor prerequisites hide Feat slots consistently with graph validation", () => {
  const f = fixture("class-option", { type: "feat", key: "second", count: 1 });
  f.gameData.classFeatures.mage.find(entry => entry.featureKey === "path").prerequisites = [{ type: "class", key: "mage", level: 3 }];
  assert.equal(getExplicitFeatSlots(f.gameData, f.builder).length, 1);
  assert.equal(compileCharacterGraph(f).metadata.featCapacity, 1);
});

test("overlapping sources produce one Technique and losing one preserves its dependents", () => {
  const f = fixture(); answer(f);
  f.gameData.origins[0].grants = [{ type: "technique", key: "shared-strike" }];
  f.builder.selectedTechniques = ["follow-up"];
  const before = structuredClone(f.character);
  assert.equal(projectSheetTechniques(f).filter(item => item.tech.techniqueKey === "shared-strike").length, 1);
  f.builder.selectedClassFeatureOptions = [];
  const result = reconcileCharacterGraph({ ...f, previousCharacter: before });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.equal(result.character.builder.selectedTechniques.includes("follow-up"), true);
  assert.equal(result.character.builder.grantChoices.bonus, undefined);
  assert.equal(known({ ...f, builder: result.character.builder }), true);
});

test("losing a granted Technique reviews its dependents; Cancel and Apply use the same proposal", async () => {
  const f = fixture(); answer(f); f.builder.selectedTechniques = ["follow-up"];
  const initial = reconcileCharacterGraph(f);
  assert.equal(initial.ok, true, JSON.stringify(initial.impacts));
  let accept = false;
  const reviews = [];
  const page = new CharacterSessionPage({ character: initial.character, gameData: f.gameData, revision: 3,
    confirmImpacts: review => { reviews.push(review); return accept; } });
  const command = SetClassFeatureOptions([]);
  const cancelled = await page.requestCharacterCommand(null, command);
  assert.equal(cancelled.reason, "cancelled", JSON.stringify(cancelled));
  assert.deepEqual(page.getCharacter(), initial.character);
  assert(reviews[0].summary.messages.includes("Technique: Follow Up"));
  accept = true;
  assert.equal((await page.requestCharacterCommand(null, command)).ok, true);
  assert.deepEqual(page.getCharacter(), reviews[1].proposal.reconciled);
  assert.deepEqual(page.getCharacter().builder.selectedTechniques, []);
  assert.equal(page.getCharacter().builder.grantChoices.bonus, undefined);
  assert.deepEqual(page.session.createSaveSnapshot().character, page.getCharacter());
});

test("inactive owners cannot grant access, fixed Techniques, or choices at any source", () => {
  for (const kind of ownerKinds) {
    const f = fixture(kind); answer(f);
    const owner = kind === "origin" ? f.gameData.origins[0] : kind === "feat-selection" ? f.gameData.feats[0] : f.entry;
    owner.prerequisites = [{ type: "class", key: "mage", level: 3 }];
    assert.equal(known(f), false, kind);
    assert.equal(compileCharacterGraph(f).metadata.activeChoiceIds.includes("bonus"), false, kind);
    owner.prerequisites = []; owner.level = 3;
    assert.equal(known(f), false, kind);
    assert.equal(compileCharacterGraph(f).metadata.activeChoiceIds.includes("bonus"), false, kind);
  }
});

test("Traits, their weapons, and linked attacks have the same behavior at every owner", () => {
  for (const kind of ownerKinds) {
    const f = fixture(kind, { type: "trait", key: "gift-trait", rank: 2 });
    f.gameData.traits = [{ ...ready, traitKey: "gift-trait", name: "Gift Trait", description: "A weapon gift.", rank: 1,
      techniqueKeys: [], grants: [{ type: "weapon", key: "arcane-blade" }], prerequisites: [] }];
    f.gameData.weaponBases = [{ ...ready, weaponKey: "arcane-blade", name: "Arcane Blade", minRank: 1,
      tags: ["Natural"], techniqueKeys: ["shared-strike"], profiles: [] }];
    const projection = projectCharacterTraits(f.character, f.gameData);
    assert.equal(projection.traits.length, 1, kind);
    assert.equal(projection.weapons[0].rank, 2, kind);
    assert.equal(projection.weapons[0].sourceId, f.sourceId, kind);
    assert.equal(known(f), true, kind);
    assert.equal(projectSheetTechniques(f).find(item => item.tech.techniqueKey === "shared-strike").performance.rank, 2, kind);
    f.removeSource();
    assert.equal(projectCharacterTraits(f.character, f.gameData).weapons.length, 0, kind);
  }
});

test("Skill grants use the same ranks at every owner and weaker defense grants cannot replace stronger ones", () => {
  for (const kind of ownerKinds) {
    const f = fixture(kind, { type: "skill", name: "Spellcasting", rank: 2 });
    assert.equal(computeGrantedSkillsState(f.gameData, f.builder).grantedCombatSkills.find(item => item.skill === "Spellcasting").rank, "2", kind);
    const defense = fixture(kind, { type: "skill", name: "Physical Defense", rank: 1 });
    defense.gameData.classFeatures.mage.unshift({ ...ready, type: "feature", classKey: "mage", featureKey: "strong-defense", level: 1,
      grants: [{ type: "skill", name: "Physical Defense", rank: 3 }] });
    assert.equal(computeGrantedSkillsState(defense.gameData, defense.builder).fixedRanks.rank_physdef, "3", kind);
  }
});
