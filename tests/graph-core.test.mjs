import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SetClass } from "../public/js/core/character-commands.js";
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
  unhandledCharacter.builder.selectedFeats = ["unmigrated-feat"];
  const unhandled = compileCharacterGraph({
    character: unhandledCharacter,
    gameData: GRAPH_GAME_DATA,
  });
  assert.equal(unhandled.ok, false);
  assert(unhandled.diagnostics.some((item) => item.code === "unhandled-character-domain"));
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
  assert.deepEqual(result.character, character);
  assert(result.impacts.some((item) => item.code === "technique-selection-incomplete"));
  assert(result.impacts.some((item) => item.code === "grant-choice-incomplete"));
  assert(result.impacts.every((item) => item.category === "informational"));
  assert.deepEqual(result.impacts, [...result.impacts].sort((left, right) => (
    left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.nodeId.localeCompare(right.nodeId)
  )));
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
