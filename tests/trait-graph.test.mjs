import assert from "node:assert/strict";
import test from "node:test";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { collectAffectedNodeIds } from "../public/js/core/graph-core.js";
import { reconcileCharacterGraph, createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { SetOrigin, SetTraitChoice } from "../public/js/core/character-commands.js";
import { traitCharacter, traitData } from "./fixtures/traits.mjs";

test("Trait graph owns answers, active tags satisfy selection and automatic techniques use no slots", () => {
  const character = traitCharacter(), gameData = traitData();
  character.builder.selectedTechniques = ["flight", "aerial-dodge"];
  const result = reconcileCharacterGraph({ character, gameData });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.selectedTechniques, ["aerial-dodge"]);
  assert.deepEqual(result.graph.metadata.automaticTechniqueKeys, ["flight"]);
  assert(result.graph.nodes.some((item) => item.type === "trait-choice" && item.storageBinding.key === Object.keys(character.builder.traitChoices)[0]));
  assert(collectAffectedNodeIds(result.graph, [`trait-choice:${Object.keys(character.builder.traitChoices)[0]}`]).includes("technique-selection:aerial-dodge"));
  assert.equal(reconcileCharacterGraph({ character: result.character, gameData }).impacts.some((item) => item.category === "confirmation-required"), false);
});

test("each automatic Trait links directly to its granting feature without activation nodes", () => {
  const gameData = traitData(), character = traitCharacter();
  character.builder.traitChoices = {};
  gameData.origins[0].features[0].grants = ["wings", "liquid"].map((key) => ({ type: "trait", key }));
  const graph = compileCharacterGraph({ character, gameData });
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  for (const key of ["wings", "liquid"]) {
    const node = graph.nodes.find((item) => item.type === "trait" && item.key === key);
    assert(graph.edges.some((edge) => edge.from === "origin-feature:test-origin:adaptation" && edge.to === node.id));
  }
  assert.equal(graph.nodes.some(node => node.type === "trait-activation"), false);
});

test("removing a Trait provider reviews dependent removals and cancellation preserves every answer", () => {
  const gameData = traitData();
  let character = traitCharacter(); character.builder.selectedTechniques = ["aerial-dodge"];
  character = reconcileCharacterGraph({ character, gameData }).character;
  const session = new CharacterSession({ character, revision: 2, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const before = session.getState().working;
  const proposal = session.propose(SetOrigin(""));
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  assert(proposal.impacts.some((item) => item.code === "orphaned-trait-choice"));
  assert(proposal.impacts.some((item) => item.path === "builder.selectedTechniques"));
  session.cancelProposal(proposal.proposalId);
  assert.deepEqual(session.getState().working, before);
  const accepted = session.propose(SetOrigin(""));
  session.acceptProposal(accepted.proposalId, { confirm: true });
  assert.deepEqual(session.getState().working.builder.traitChoices, {});
  assert.deepEqual(session.getState().working.builder.traitActivations, {});
  assert.deepEqual(session.getState().working.builder.selectedTechniques, []);
});

test("replacing a chosen Trait reviews dependent Technique access and cancellation restores the answer", () => {
  const gameData = traitData(); let character = traitCharacter();
  character.builder.selectedTechniques = ["aerial-dodge"];
  character = reconcileCharacterGraph({ character, gameData }).character;
  const session = new CharacterSession({ character, revision: 0, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const answer = Object.values(character.builder.traitChoices)[0];
  const proposal = session.propose(SetTraitChoice({ ...answer, traitKey: "liquid" }));
  assert(proposal.impacts.some((item) => item.path === "builder.selectedTechniques"));
  session.cancelProposal(proposal.proposalId);
  assert.equal(Object.values(session.getState().working.builder.traitChoices)[0].traitKey, "wings");
  const accepted = session.propose(SetTraitChoice({ ...answer, traitKey: "liquid" }));
  session.acceptProposal(accepted.proposalId, { confirm: true });
  assert.equal(Object.keys(session.getState().working.builder.traitChoices).length, 1);
  assert.deepEqual(compileCharacterGraph({ character: session.getState().working, gameData }).metadata.automaticTechniqueKeys, []);
});
