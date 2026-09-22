import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { SetAttributeValue, SetClass, SetLevel, UpdateWeapon } from "../public/js/core/character-commands.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import {
  collectAffectedNodeIds,
} from "../public/js/core/graph-core.js";
import {
  GraphCompiler,
  compileCharacterGraph,
  createDefaultGraphHandlerRegistry,
} from "../public/js/core/graph-compiler.js";
import {
  createCharacterSessionGraphReconciler,
  reconcileCharacterGraph,
} from "../public/js/core/graph-reconciler.js";
import {
  GRAPH_GAME_DATA,
  makeGraphCharacter,
  makeTechniqueGrantAnswer,
  makeWeaponGrantAnswer,
} from "./fixtures/graph-core.mjs";

function node(graph, nodeId) {
  return graph.nodes.find((item) => item.id === nodeId);
}

function edge(graph, kind, from, to) {
  return graph.edges.find((item) => item.kind === kind && item.from === from && item.to === to);
}


test("GraphCompiler produces byte-deterministic typed nodes, ownership, bindings, and edges", () => {
  const character = makeGraphCharacter({
    selectedTechniques: ["shadow-step"],
    selectedClassFeatureOptions: ["moon-path"],
    grantChoices: { "moon-technique": makeTechniqueGrantAnswer() },
  });
  const compiler = new GraphCompiler({ gameData: GRAPH_GAME_DATA });
  const first = compiler.compile(character);
  const second = compiler.compile(structuredClone(character));

  assert.equal(first.ok, true, JSON.stringify(first.diagnostics));
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.nodes.map((item) => item.id), [...first.nodes.map((item) => item.id)].sort());

  const answer = node(first, "grant-answer:moon-technique");
  assert.equal(answer.sourceOwnerId, "class-option:ninja:moon-path");
  assert.deepEqual(answer.storageBinding, {
    path: "builder.grantChoices",
    kind: "keyed-record",
    key: "moon-technique",
  });
  assert(edge(first, "owns", "class-option:ninja:moon-path", answer.id));
  assert(edge(first, "satisfies", answer.id, "grant-choice:moon-technique"));
  assert.equal(node(first, "grant-choice:moon-technique").state, "selected");

  const selected = node(first, "technique-selection:shadow-step");
  assert.deepEqual(selected.storageBinding, {
    path: "builder.selectedTechniques",
    kind: "ordered-key-array",
  });
  assert(edge(first, "requires", selected.id, `requirement:${selected.id}:0:class`));
  assert(node(first, "automatic-technique:class-feature:ninja:shadow-training:stalk-prey:0"));
  const agility = node(first, "fact:attribute:agility");
  assert.deepEqual(agility.storageBinding, {
    path: "builder.attributes.agility",
    kind: "scalar",
  });
  assert.deepEqual(
    { minimum: agility.metadata.minimum, maximum: agility.metadata.maximum, valid: agility.metadata.valid },
    { minimum: 1, maximum: 5, valid: true },
  );
  assert.equal(Object.isFrozen(first.nodes), true);
  assert.equal(Object.isFrozen(first.nodes[0].metadata), true);
});

test("compilation ordering is stable when normalized collection order changes", () => {
  const character = makeGraphCharacter({ selectedTechniques: ["smoke-bomb", "shadow-step"] });
  const reversedData = structuredClone(GRAPH_GAME_DATA);
  reversedData.classes.reverse();
  reversedData.techniques.reverse();
  const forward = compileCharacterGraph({ character, gameData: GRAPH_GAME_DATA });
  const reversed = compileCharacterGraph({ character, gameData: reversedData });

  assert.equal(forward.ok, true);
  assert.equal(reversed.ok, true);
  assert.deepEqual(forward.nodes, reversed.nodes);
  assert.deepEqual(forward.edges, reversed.edges);
  assert.deepEqual(forward.diagnostics, reversed.diagnostics);
});

test("duplicate identities, dangling selections, and missing handlers fail with structured diagnostics", () => {
  const duplicateData = structuredClone(GRAPH_GAME_DATA);
  duplicateData.techniques.push(structuredClone(duplicateData.techniques[0]));
  const duplicate = compileCharacterGraph({
    character: makeGraphCharacter(),
    gameData: duplicateData,
  });
  assert.equal(duplicate.ok, false);
  assert(duplicate.diagnostics.some((item) => item.code === "duplicate-game-data-identity"));

  const dangling = compileCharacterGraph({
    character: makeGraphCharacter({ selectedTechniques: ["missing-technique"] }),
    gameData: GRAPH_GAME_DATA,
  });
  assert.equal(dangling.ok, false);
  assert(dangling.diagnostics.some((item) => item.code === "dangling-technique-reference"));

  const missingGrantRegistry = createDefaultGraphHandlerRegistry().removeGrant("technique");
  const missingGrant = compileCharacterGraph({
    character: makeGraphCharacter(),
    gameData: GRAPH_GAME_DATA,
    registry: missingGrantRegistry,
  });
  assert.equal(missingGrant.ok, false);
  assert(missingGrant.diagnostics.some((item) => item.code === "missing-grant-handler"));

  const missingPrerequisiteRegistry = createDefaultGraphHandlerRegistry().removePrerequisite("class");
  const missingPrerequisite = compileCharacterGraph({
    character: makeGraphCharacter({ selectedTechniques: ["shadow-step"] }),
    gameData: GRAPH_GAME_DATA,
    registry: missingPrerequisiteRegistry,
  });
  assert.equal(missingPrerequisite.ok, false);
  assert(missingPrerequisite.diagnostics.some((item) => item.code === "missing-prerequisite-handler"));

  const missingNodeRegistry = createDefaultGraphHandlerRegistry().removeNode("technique-selection");
  const missingNode = compileCharacterGraph({
    character: makeGraphCharacter({ selectedTechniques: ["shadow-step"] }),
    gameData: GRAPH_GAME_DATA,
    registry: missingNodeRegistry,
  });
  assert.equal(missingNode.ok, false);
  assert(missingNode.diagnostics.some((item) => item.code === "missing-node-handler"));
  assert(missingNode.diagnostics.some((item) => item.code === "dangling-graph-edge"));

  const displayNameGrantData = structuredClone(GRAPH_GAME_DATA);
  displayNameGrantData.classFeatures.ninja[0].grants = [{ type: "technique", name: "Stalk Prey" }];
  const displayNameGrant = compileCharacterGraph({
    character: makeGraphCharacter(),
    gameData: displayNameGrantData,
  });
  assert.equal(displayNameGrant.ok, false);
  assert(displayNameGrant.diagnostics.some((item) => item.code === "display-name-technique-grant"));

  const unhandledCharacter = makeGraphCharacter();
  unhandledCharacter.builder.bonds = [{ bondId: "bond:one", name: "Ally", rank: "1", keystone: "" }];
  const unhandled = compileCharacterGraph({
    character: unhandledCharacter,
    gameData: GRAPH_GAME_DATA,
  });
  assert.equal(unhandled.ok, true);
  assert(unhandled.nodes.some((item) => item.id === "bond:bond:one" && item.storageBinding?.key === "bond:one"));
});

test("feat selections and options have stable ownership and reconcile through capacity and prerequisites", () => {
  const character = makeGraphCharacter({
    level: 2,
    selectedFeats: ["shadow-adept", "moon-initiate"],
    selectedFeatOptions: ["moon-initiate-prison"],
  });
  const result = reconcileCharacterGraph({ character, gameData: GRAPH_GAME_DATA });

  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.selectedFeats, ["shadow-adept"]);
  assert.deepEqual(result.character.builder.selectedFeatOptions, []);
  assert(result.impacts.some((item) => item.code === "feat-slot-removed"));
  assert(result.impacts.some((item) => item.code === "feat-option-prerequisite-removed"));
  assert(result.graph.nodes.some((item) => (
    item.id === "feat-selection:shadow-adept"
      && item.storageBinding?.path === "builder.selectedFeats"
      && item.sourceOwnerId.startsWith("feat-slot:")
  )));
  assert(result.graph.nodes.some((item) => item.type === "feat-slot" && item.sourceOwnerId === "class-feature:ninja:ninja-feat"));
  assert.equal(result.graph.diagnostics.some((item) => item.code === "deferred-grant-domain" && item.message.includes("feat")), false);
  assert(result.graph.nodes.some((item) => item.id.startsWith("automatic-technique:feat-selection:shadow-adept")));

  const repeated = reconcileCharacterGraph({ character: result.character, gameData: GRAPH_GAME_DATA });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.character, result.character);
  assert.equal(repeated.impacts.some((item) => item.category === "confirmation-required"), false);
});

test("removing an explicit feat-grant source requires confirmation and cancellation preserves the feat", () => {
  const character = makeGraphCharacter({ level: 2, selectedFeats: ["shadow-adept"] });
  const session = new CharacterSession({
    character,
    reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GRAPH_GAME_DATA }),
  });
  const before = JSON.stringify(session.getState().working);
  const proposal = session.propose(SetLevel(1));
  assert.equal(proposal.ok, true);
  assert.equal(proposal.requiresConfirmation, true);
  assert.deepEqual(proposal.reconciled.builder.selectedFeats, []);
  assert(proposal.impacts.some((item) => item.code === "feat-slot-removed"));
  session.cancelProposal(proposal.proposalId);
  assert.equal(JSON.stringify(session.getState().working), before);
});

test("class-owned weapon answers materialize and disappear with their source", () => {
  const character = makeGraphCharacter({
    classKey: "guardian",
    grantChoices: { "guardian-armament": makeWeaponGrantAnswer() },
  });
  character.builder.primaryAttribute = "willpower";
  character.builder.attributes.agility = 0;
  character.builder.attributes.willpower = 1;
  const materialized = reconcileCharacterGraph({ character, gameData: GRAPH_GAME_DATA });
  assert.equal(materialized.ok, true, JSON.stringify(materialized.impacts));
  assert.equal(materialized.character.builder.weapons.length, 1);
  assert.equal(materialized.character.builder.weapons[0].weaponKey, "longsword");
  assert.equal(materialized.character.builder.weapons[0].sourceChoiceId, "guardian-armament");
  assert.deepEqual(materialized.character.builder.resources.resolve, {
    resourceKey: "resolve", name: "Resolve", capacity: 2, current: 2,
  });

  const changed = structuredClone(materialized.character);
  changed.builder.classKey = "ninja";
  const removed = reconcileCharacterGraph({
    character: changed,
    previousCharacter: materialized.character,
    gameData: GRAPH_GAME_DATA,
  });
  assert.equal(removed.ok, true, JSON.stringify(removed.impacts));
  assert.deepEqual(removed.character.builder.grantChoices, {});
  assert.deepEqual(removed.character.builder.weapons, []);
  assert.deepEqual(removed.character.builder.resources, {});
  assert(removed.impacts.some((item) => item.code === "orphaned-grant-answer-removed"));
  assert(removed.impacts.some((item) => item.code === "source-owned-weapon-removed"));
  assert(removed.impacts.some((item) => item.code === "source-owned-resource-removed"));
});

test("equipment compiles stable weapon and enhancement ownership with shared capacity rules", () => {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.weaponBases = [{
    weaponKey: "longsword",
    name: "Longsword",
    status: "playable",
    selectable: true,
    minRank: 1,
    tags: ["Versatile"],
    profiles: [{ profileType: "basicAttack", skill: "Melee Weapons" }],
  }];
  gameData.weaponEnhancements = [{
    enhancementKey: "basic_elemental_infusion",
    name: "Elemental Infusion",
    minRank: 1,
    prerequisites: [],
  }];
  const character = makeGraphCharacter();
  character.builder.sheet.repeatables.combatSkillsExtra.push({
    skill: "Melee Weapons",
    rank: "2",
  });
  character.builder.weapons.push({
    id: "weapon:test",
    choiceId: "",
    sourceChoiceId: "",
    generated: false,
    weaponKey: "longsword",
    rank: 1,
    customName: "Oathblade",
    enhancements: [{
      id: "enhancement:test",
      enhancementKey: "basic_elemental_infusion",
      rank: 1,
      selections: {},
      granted: false,
    }],
  });

  const result = reconcileCharacterGraph({ character, gameData });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.equal(node(result.graph, "weapon:weapon:test").sourceOwnerId, "root:character");
  assert.equal(node(result.graph, "weapon:weapon:test").storageBinding.key, "weapon:test");
  assert.equal(node(result.graph, "weapon-enhancement:weapon:test:enhancement:test").sourceOwnerId, "weapon:weapon:test");
  assert(edge(result.graph, "owns", "weapon:weapon:test", "weapon-enhancement:weapon:test:enhancement:test"));
  assert(result.impacts.some((item) => item.code === "weapon-enhancement-selection-incomplete"
    && item.category === "informational"));
  assert.equal(result.graph.metadata.weaponSlotUsage, 2);
  assert.equal(result.graph.metadata.weaponSlotCapacity, 4);
});

test("equipment rule violations are blocking and cannot be confirmed away", () => {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.weaponBases = [{
    weaponKey: "greatsword",
    name: "Greatsword",
    status: "playable",
    selectable: true,
    minRank: 1,
    tags: ["Heavy"],
    profiles: [{ profileType: "basicAttack", skill: "Melee Weapons" }],
  }];
  const character = makeGraphCharacter();
  character.builder.weapons.push({
    id: "weapon:greatsword",
    choiceId: "",
    sourceChoiceId: "",
    generated: false,
    weaponKey: "greatsword",
    rank: 1,
    customName: "",
    enhancements: [],
  }, {
    id: "weapon:second",
    choiceId: "",
    sourceChoiceId: "",
    generated: false,
    weaponKey: "greatsword",
    rank: 1,
    customName: "",
    enhancements: [],
  });

  const result = reconcileCharacterGraph({ character, gameData });
  assert.equal(result.ok, false);
  assert(result.impacts.some((item) => item.code === "weapon-slot-capacity-exceeded" && item.category === "error"));
  assert.equal(result.impacts.some((item) => item.category === "confirmation-required"), false);
});

test("generated weapons reject direct edits while cancellation preserves accepted state", () => {
  const character = makeGraphCharacter({
    classKey: "guardian",
    grantChoices: { "guardian-armament": makeWeaponGrantAnswer() },
  });
  character.builder.primaryAttribute = "willpower";
  character.builder.attributes.agility = 0;
  character.builder.attributes.willpower = 1;
  const materialized = reconcileCharacterGraph({ character, gameData: GRAPH_GAME_DATA }).character;
  const session = new CharacterSession({
    character: materialized,
    reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GRAPH_GAME_DATA }),
  });
  const before = JSON.stringify(session.getState().working);
  const proposal = session.propose(UpdateWeapon(materialized.builder.weapons[0].id, { customName: "Tampered" }));
  assert.equal(proposal.ok, false);
  assert(proposal.impacts.some((item) => item.code === "source-owned-weapon-edit-rejected"));
  session.cancelProposal(proposal.proposalId);
  assert.equal(JSON.stringify(session.getState().working), before);
});

test("equipment dependency changes require confirmation and cancellation is side-effect free", () => {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.weaponBases = [{
    weaponKey: "longsword",
    name: "Longsword",
    status: "playable",
    selectable: true,
    minRank: 1,
    tags: ["Versatile"],
    profiles: [{ profileType: "basicAttack", skill: "Melee Weapons" }],
  }];
  gameData.weaponEnhancements = [{ enhancementKey: "keen", name: "Keen", minRank: 1, prerequisites: [] }];
  const character = makeGraphCharacter();
  character.builder.sheet.repeatables.combatSkillsExtra.push({ skill: "Melee Weapons", rank: "2" });
  character.builder.weapons.push({
    id: "weapon:test",
    choiceId: "",
    sourceChoiceId: "",
    generated: false,
    weaponKey: "longsword",
    rank: 2,
    customName: "Oathblade",
    enhancements: [{
      id: "enhancement:keen",
      enhancementKey: "keen",
      rank: 2,
      selections: {},
      granted: false,
    }],
  });
  const session = new CharacterSession({
    character,
    reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }),
  });
  const before = JSON.stringify(session.getState().working);
  const proposal = session.propose(UpdateWeapon("weapon:test", { rank: 1 }));
  assert.equal(proposal.ok, true);
  assert.equal(proposal.requiresConfirmation, true);
  assert(proposal.impacts.some((item) => item.code === "weapon-enhancement-rank-reduced"));
  assert.equal(proposal.reconciled.builder.weapons[0].enhancements[0].rank, 1);
  session.cancelProposal(proposal.proposalId);
  assert.equal(JSON.stringify(session.getState().working), before);
});

test("attribute budget reconciliation requires confirmation and cancellation is side-effect free", () => {
  const character = makeGraphCharacter({ level: 1, agility: 4 });
  Object.assign(character.builder.attributes, {
    strength: 3,
    intellect: 3,
    willpower: 2,
  });
  const session = new CharacterSession({
    character,
    reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GRAPH_GAME_DATA }),
  });
  const before = JSON.stringify(session.getState().working);
  const proposal = session.propose(SetAttributeValue("heart", 3));
  assert.equal(proposal.ok, true);
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.reconciled.builder.attributes.heart, 3);
  assert.equal(proposal.reconciled.builder.attributes.strength, 1);
  assert(proposal.impacts.some((impact) => impact.code === "attribute-point-budget-applied"));
  session.cancelProposal(proposal.proposalId);
  assert.equal(JSON.stringify(session.getState().working), before);

  const repeated = reconcileCharacterGraph({
    character: proposal.reconciled,
    previousCharacter: proposal.reconciled,
    gameData: GRAPH_GAME_DATA,
  });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.character, proposal.reconciled);
  assert.equal(repeated.impacts.some((impact) => impact.category === "confirmation-required"), false);
});

test("lowering a primary attribute reconciles dependent technique capacity in the same proposal", () => {
  const character = makeGraphCharacter({
    level: 2,
    agility: 3,
    selectedTechniques: ["shadow-step", "smoke-bomb"],
  });
  const session = new CharacterSession({
    character,
    reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GRAPH_GAME_DATA }),
  });
  const proposal = session.propose(SetAttributeValue("agility", 1));
  assert.equal(proposal.ok, true);
  assert.equal(proposal.requiresConfirmation, true);
  assert.deepEqual(proposal.reconciled.builder.selectedTechniques, ["shadow-step"]);
  assert(proposal.impacts.some((impact) => impact.code === "technique-capacity-removed"));
});

test("class changes reconcile stable utility-skill ownership and projection snapshots", () => {
  const previous = makeGraphCharacter({ classKey: "ninja", primaryAttribute: "agility" });
  previous.builder.selectedClassUtilitySkills = ["athletics"];
  previous.builder.grantedCoreSkillSnapshot = ["athletics"];
  const proposed = structuredClone(previous);
  proposed.builder.classKey = "guardian";
  proposed.builder.primaryAttribute = "willpower";

  const result = reconcileCharacterGraph({
    character: proposed,
    previousCharacter: previous,
    gameData: GRAPH_GAME_DATA,
  });

  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.selectedClassUtilitySkills, []);
  assert.deepEqual(result.character.builder.grantedCoreSkillSnapshot, []);
  assert.ok(result.impacts.some((entry) => entry.code === "class-utility-skill-removed"));
});

test("custom handlers cannot hide cycles or dangling graph edges", () => {
  const cycleData = structuredClone(GRAPH_GAME_DATA);
  cycleData.classFeatures.ninja[0].grants = [{ type: "loop" }];
  const cycleRegistry = createDefaultGraphHandlerRegistry();
  cycleRegistry.registerGrant("loop", ({ graph, addTypedNode, path }) => {
    addTypedNode("fact", {
      id: "fact:loop-a", key: "loop-a", label: "Loop A", state: "automatic",
      sourceOwnerId: "root:character", storageBinding: null, metadata: {},
    }, path);
    addTypedNode("fact", {
      id: "fact:loop-b", key: "loop-b", label: "Loop B", state: "automatic",
      sourceOwnerId: "root:character", storageBinding: null, metadata: {},
    }, path);
    graph.addEdge({ kind: "offers", from: "fact:loop-a", to: "fact:loop-b" }, { path });
    graph.addEdge({ kind: "offers", from: "fact:loop-b", to: "fact:loop-a" }, { path });
  });
  const cyclic = compileCharacterGraph({
    character: makeGraphCharacter(),
    gameData: cycleData,
    registry: cycleRegistry,
  });
  assert.equal(cyclic.ok, false);
  assert(cyclic.diagnostics.some((item) => item.code === "graph-cycle"));

  const danglingData = structuredClone(GRAPH_GAME_DATA);
  danglingData.classFeatures.ninja[0].grants = [{ type: "dangling" }];
  const danglingRegistry = createDefaultGraphHandlerRegistry();
  danglingRegistry.registerGrant("dangling", ({ graph, grantNodeId, path }) => {
    graph.addEdge({ kind: "grants", from: grantNodeId, to: "missing:node" }, { path });
  });
  const dangling = compileCharacterGraph({
    character: makeGraphCharacter(),
    gameData: danglingData,
    registry: danglingRegistry,
  });
  assert.equal(dangling.ok, false);
  assert(dangling.diagnostics.some((item) => item.code === "dangling-graph-edge"));
});

test("GraphReconciler applies prerequisite, availability, capacity, and orphan removal to a fixed point", () => {
  const orphan = makeTechniqueGrantAnswer({ choiceId: "orphan-technique", sourceId: "class-feature:ninja:removed" });
  const input = makeGraphCharacter({
    agility: 1,
    selectedTechniques: ["shadow-step", "smoke-bomb", "moon-prison", "forbidden-form"],
    grantChoices: { "orphan-technique": orphan },
  });
  const before = structuredClone(input);
  const result = reconcileCharacterGraph({ character: input, gameData: GRAPH_GAME_DATA });

  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.equal(result.converged, true);
  assert.equal(result.iterations, 2);
  assert.deepEqual(result.character.builder.selectedTechniques, ["shadow-step"]);
  assert.deepEqual(result.character.builder.grantChoices, {});
  assert.deepEqual(input, before);
  assert(result.impacts.some((item) => item.code === "technique-prerequisite-removed"));
  assert(result.impacts.some((item) => item.code === "unavailable-technique-removed"));
  assert(result.impacts.some((item) => item.code === "technique-capacity-removed"));
  assert(result.impacts.some((item) => item.code === "orphaned-grant-answer-removed"));
  assert(result.impacts
    .filter((item) => item.type === "remove")
    .every((item) => item.category === "confirmation-required"));

  const idempotent = reconcileCharacterGraph({ character: result.character, gameData: GRAPH_GAME_DATA });
  assert.equal(idempotent.ok, true);
  assert.deepEqual(idempotent.character, result.character);
  assert.equal(idempotent.impacts.some((item) => item.category === "confirmation-required"), false);
});

test("blocking compiler failures remain errors and non-convergence exposes no partial state", () => {
  const danglingInput = makeGraphCharacter({ selectedTechniques: ["missing-technique"] });
  const blocked = reconcileCharacterGraph({ character: danglingInput, gameData: GRAPH_GAME_DATA });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.character, danglingInput);
  assert(blocked.impacts.some((item) => item.code === "dangling-technique-reference" && item.category === "error"));
  assert.equal(blocked.impacts.some((item) => item.category === "confirmation-required"), false);

  const changing = makeGraphCharacter({
    agility: 1,
    selectedTechniques: ["shadow-step", "smoke-bomb"],
  });
  const nonConvergent = reconcileCharacterGraph({
    character: changing,
    gameData: GRAPH_GAME_DATA,
    maxIterations: 1,
  });
  assert.equal(nonConvergent.ok, false);
  assert.equal(nonConvergent.converged, false);
  assert.deepEqual(nonConvergent.character, changing);
  assert(nonConvergent.impacts.some((item) => item.code === "graph-non-convergence" && item.category === "error"));
});

test("incomplete but valid selections remain deterministic informational impacts", () => {
  const character = makeGraphCharacter({
    agility: 2,
    selectedTechniques: ["shadow-step"],
    selectedClassFeatureOptions: ["moon-path"],
  });
  const result = reconcileCharacterGraph({ character, gameData: GRAPH_GAME_DATA });

  assert.equal(result.ok, true);
  assert.deepEqual(result.character.builder.selectedTechniques, character.builder.selectedTechniques);
  assert.deepEqual(result.character.builder.selectedClassFeatureOptions, character.builder.selectedClassFeatureOptions);
  assert.deepEqual(result.character.builder.autoAbilityNames, [
    "Class Feature - Ninja Feat",
    "Class Feature - Shadow Training",
    "Class Feature - Moon Path",
  ]);
  assert(result.impacts.some((item) => item.code === "technique-selection-incomplete"));
  assert(result.impacts.some((item) => item.code === "grant-choice-incomplete"));
  assert(result.impacts.every((item) => item.category === "informational"));
  assert.deepEqual(result.impacts, [...result.impacts].sort((left, right) => (
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.nodeId.localeCompare(right.nodeId)
  )));
});

test("derived ability display snapshots deduplicate labels without merging stable source records", () => {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.classFeatures.ninja.push(
    {
      classKey: "ninja",
      featureKey: "repeated-feat-slot-1",
      level: 2,
      name: "Repeated Feat Slot",
      description: "First independently owned feat slot.",
      type: "feature",
      prerequisites: [],
      grants: [],
    },
    {
      classKey: "ninja",
      featureKey: "repeated-feat-slot-2",
      level: 4,
      name: "Repeated Feat Slot",
      description: "Second independently owned feat slot.",
      type: "feature",
      prerequisites: [],
      grants: [],
    },
  );
  const result = reconcileCharacterGraph({
    character: makeGraphCharacter({ level: 4 }),
    gameData,
  });

  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.equal(
    result.character.builder.autoAbilityNames.filter((name) => name === "Class Feature - Repeated Feat Slot").length,
    1,
  );
  const repeatedAbilities = result.character.builder.sheet.repeatables.abilities
    .filter((ability) => ability.name === "Class Feature - Repeated Feat Slot");
  assert.equal(repeatedAbilities.length, 2);
  assert.equal(new Set(repeatedAbilities.map((ability) => ability.abilityId)).size, 2);
  assert.equal(new Set(repeatedAbilities.map((ability) => ability.sourceId)).size, 2);

  const idempotent = reconcileCharacterGraph({ character: result.character, gameData });
  assert.equal(idempotent.ok, true, JSON.stringify(idempotent.impacts));
  assert.deepEqual(idempotent.character, result.character);
});

test("affected closure follows ownership, satisfaction, and transitive requirement edges", () => {
  const previous = makeGraphCharacter({
    selectedTechniques: ["shadow-step"],
    selectedClassFeatureOptions: ["moon-path"],
    grantChoices: { "moon-technique": makeTechniqueGrantAnswer() },
  });
  const proposed = structuredClone(previous);
  proposed.builder.classKey = "guardian";
  const result = reconcileCharacterGraph({
    character: proposed,
    previousCharacter: previous,
    gameData: GRAPH_GAME_DATA,
  });

  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.selectedTechniques, []);
  assert.deepEqual(result.character.builder.selectedClassFeatureOptions, []);
  assert.deepEqual(result.character.builder.grantChoices, {});
  assert(result.affectedNodeIds.includes("class:ninja"));
  assert(result.affectedNodeIds.includes("class-feature:ninja:shadow-training"));
  assert(result.affectedNodeIds.includes("grant-answer:moon-technique"));
  assert(result.affectedNodeIds.includes("technique-selection:shadow-step"));

  const previousGraph = compileCharacterGraph({ character: previous, gameData: GRAPH_GAME_DATA });
  const closure = collectAffectedNodeIds(previousGraph, ["class:ninja"]);
  assert(closure.includes("automatic-technique:class-feature:ninja:shadow-training:stalk-prey:0"));
  assert(closure.includes("technique-selection:shadow-step"));
});

test("CharacterSession consumes graph reconciliation once and accepts the exact reviewed state", () => {
  const character = makeGraphCharacter({
    selectedTechniques: ["shadow-step"],
    selectedClassFeatureOptions: ["moon-path"],
    grantChoices: { "moon-technique": makeTechniqueGrantAnswer() },
  });
  const graphReconciler = createCharacterSessionGraphReconciler({ gameData: GRAPH_GAME_DATA });
  let calls = 0;
  const session = new CharacterSession({
    character,
    reconcileCharacter: (input) => {
      calls += 1;
      return graphReconciler(input);
    },
  });

  const proposal = session.propose(SetClass("guardian"));
  assert.equal(calls, 1);
  assert.equal(proposal.ok, true);
  assert.equal(proposal.requiresConfirmation, true);
  assert.deepEqual(proposal.reconciled.builder.selectedTechniques, []);
  assert.deepEqual(proposal.reconciled.builder.selectedClassFeatureOptions, []);
  assert.deepEqual(proposal.reconciled.builder.grantChoices, {});
  session.acceptProposal(proposal.proposalId, { confirm: true });
  assert.equal(calls, 1);
  assert.deepEqual(session.getState().working, proposal.reconciled);
});

test("cancelling a graph-backed proposal is byte-for-byte side-effect free", () => {
  const character = makeGraphCharacter({
    selectedTechniques: ["shadow-step"],
    selectedClassFeatureOptions: ["moon-path"],
    grantChoices: { "moon-technique": makeTechniqueGrantAnswer() },
  });
  const session = new CharacterSession({
    character,
    reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GRAPH_GAME_DATA }),
  });
  const before = JSON.stringify(session.getState().working);
  const proposal = session.propose(SetClass("guardian"));
  assert.equal(proposal.requiresConfirmation, true);
  session.cancelProposal(proposal.proposalId);
  assert.equal(JSON.stringify(session.getState().working), before);
  assert.deepEqual(character.builder.selectedTechniques, ["shadow-step"]);
  assert(character.builder.grantChoices["moon-technique"]);
});

test("generated selection cases converge, preserve input, and remain idempotent", () => {
  const pool = ["shadow-step", "smoke-bomb", "moon-prison", "forbidden-form"];
  for (let seed = 0; seed < 40; seed += 1) {
    const selected = pool.filter((_, index) => ((seed >> index) & 1) === 1);
    if (seed % 2) selected.reverse();
    const agility = 1 + (seed % 4);
    const level = 1 + (seed % 4);
    const character = makeGraphCharacter({ agility, level, selectedTechniques: selected });
    const inputBytes = JSON.stringify(character);
    const result = reconcileCharacterGraph({ character, gameData: GRAPH_GAME_DATA });
    assert.equal(result.ok, true, `seed ${seed}: ${JSON.stringify(result.impacts)}`);
    assert.equal(result.converged, true, `seed ${seed}`);
    assert.equal(JSON.stringify(character), inputBytes, `seed ${seed} mutated input`);
    assert(result.character.builder.selectedTechniques.length <= agility, `seed ${seed} exceeded capacity`);
    const repeated = reconcileCharacterGraph({ character: result.character, gameData: GRAPH_GAME_DATA });
    assert.equal(repeated.ok, true, `seed ${seed} repeat failed`);
    assert.deepEqual(repeated.character, result.character, `seed ${seed} was not idempotent`);
  }
});

test("graph core modules remain independent of Firebase, DOM, files, network, pages, and widgets", async () => {
  for (const relativePath of [
    "../public/js/core/graph-core.js",
    "../public/js/core/graph-compiler.js",
    "../public/js/core/graph-reconciler.js",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /firebase|document\.|window\.|localStorage|sessionStorage|fetch\(|node:fs|node:http|node:https|\/pages\/|\/builder\//i,
    );
  }
});
