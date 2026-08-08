import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { SetClass, SetTechniqueSelection } from "../public/js/core/character-commands.js";
import {
  CharacterSession,
  normalizeCharacterImpacts,
} from "../public/js/core/character-session.js";

function makeCharacter() {
  return createDefaultCharacter({ ownerUid: "user_123" });
}

test("session construction protects persisted and working state from caller mutation", () => {
  const input = makeCharacter();
  const session = new CharacterSession({ character: input, revision: 3 });
  input.builder.name = "Mutated outside";

  const first = session.getState();
  assert.equal(first.persisted.builder.name, "");
  assert.equal(first.working.builder.name, "");
  assert.equal(first.revision, 3);
  assert.equal(first.dirty, false);
  assert.equal(Object.isFrozen(first.working.builder), true);
  assert.throws(() => {
    first.working.builder.name = "Attempted leak";
  }, TypeError);
  assert.equal(session.getState().working.builder.name, "");
});

test("proposal records all state layers and cannot be silently superseded", () => {
  const session = new CharacterSession({ character: makeCharacter() });
  const proposal = session.propose(SetClass("ninja"));
  const state = session.getState();

  assert.equal(state.persisted.builder.classKey, "");
  assert.equal(state.working.builder.classKey, "");
  assert.equal(state.proposed.builder.classKey, "ninja");
  assert.equal(state.reconciled.builder.classKey, "ninja");
  assert.deepEqual(proposal.reconciledDiff.map((item) => item.path), ["builder.classKey"]);
  assert.throws(
    () => session.propose(SetClass("guardian")),
    (error) => error.code === "proposal-already-pending",
  );
  assert.throws(
    () => session.acceptProposal("proposal:999"),
    (error) => error.code === "proposal-identity-mismatch",
  );
});

test("cancellation is side-effect free and informational proposals need no confirmation", () => {
  const session = new CharacterSession({
    character: makeCharacter(),
    reconcileCharacter: ({ proposed }) => ({
      character: proposed,
      impacts: [{
        type: "incomplete",
        severity: "warning",
        storagePath: "builder.selectedTechniques",
        code: "selection-incomplete",
      }],
    }),
  });
  const before = JSON.stringify(session.getState().working);
  const cancelled = session.propose(SetClass("ninja"));
  session.cancelProposal(cancelled.proposalId);
  assert.equal(JSON.stringify(session.getState().working), before);
  assert.equal(session.getState().dirty, false);

  const accepted = session.propose(SetClass("ninja"));
  assert.equal(accepted.impacts[0].category, "informational");
  session.acceptProposal(accepted.proposalId);
  assert.equal(session.getState().working.builder.classKey, "ninja");
  assert.equal(session.getState().dirty, true);
});

test("structured impacts are byte-deterministic independent of reconciler order", () => {
  const impacts = [
    {
      type: "change",
      category: "informational",
      path: "builder.selectedTechniques",
      code: "technique-selection-changed",
      before: null,
      after: ["shadow-step"],
    },
    {
      type: "remove",
      path: "builder.grantChoices.class-feat",
      code: "grant-choice-removed",
      previousValue: "old-choice",
    },
  ];
  const forward = normalizeCharacterImpacts(impacts);
  const reverse = normalizeCharacterImpacts([...impacts].reverse());

  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.map((impact) => impact.category), [
    "confirmation-required",
    "informational",
  ]);
  assert.equal(forward[1].before, null);
  assert.equal(Object.isFrozen(forward[1].after), true);
});

test("confirmation commits the exact reconciled state without rerunning reconciliation", () => {
  const character = makeCharacter();
  character.builder.selectedTechniques = ["shadow-step"];
  let reconcileCalls = 0;
  const session = new CharacterSession({
    character,
    reconcileCharacter: ({ proposed }) => {
      reconcileCalls += 1;
      const reconciled = structuredClone(proposed);
      reconciled.builder.selectedTechniques = [];
      return {
        character: reconciled,
        impacts: [{
          type: "remove",
          storagePath: "builder.selectedTechniques",
          code: "technique-removed",
          previousValue: "shadow-step",
        }],
      };
    },
  });

  const proposal = session.propose(SetClass("ninja"));
  assert.equal(reconcileCalls, 1);
  assert.equal(proposal.requiresConfirmation, true);
  assert.deepEqual(proposal.proposed.builder.selectedTechniques, ["shadow-step"]);
  assert.deepEqual(proposal.reconciled.builder.selectedTechniques, []);
  assert.throws(
    () => session.acceptProposal(proposal.proposalId),
    (error) => error.code === "proposal-confirmation-required",
  );
  session.acceptProposal(proposal.proposalId, { confirm: true });
  assert.equal(reconcileCalls, 1);
  assert.deepEqual(session.getState().working, proposal.reconciled);
});

test("blocking impacts and invalid reconciled characters can never be accepted", () => {
  const blocking = new CharacterSession({
    character: makeCharacter(),
    reconcileCharacter: ({ proposed }) => ({
      character: proposed,
      impacts: [{ severity: "error", code: "class-unavailable", path: "builder.classKey" }],
    }),
  });
  const blocked = blocking.propose(SetClass("ninja"));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.impacts[0].category, "error");
  assert.throws(
    () => blocking.acceptProposal(blocked.proposalId, { confirm: true }),
    (error) => error.code === "proposal-has-errors",
  );
  blocking.cancelProposal(blocked.proposalId);

  const invalid = new CharacterSession({
    character: makeCharacter(),
    reconcileCharacter: ({ proposed }) => {
      const result = structuredClone(proposed);
      result.builder.level = 99;
      return { character: result, impacts: [] };
    },
  });
  const invalidProposal = invalid.propose(SetClass("ninja"));
  assert.equal(invalidProposal.ok, false);
  assert.equal(invalidProposal.reconciled, null);
  assert(invalidProposal.impacts.some((impact) => impact.code === "out-of-range"));
});

test("save acknowledgement preserves edits accepted while the save was in flight", () => {
  const session = new CharacterSession({
    character: makeCharacter(),
    revision: 3,
    metadata: { revision: 3, createdAt: "created-at" },
  });
  const classProposal = session.propose(SetClass("ninja"));
  session.acceptProposal(classProposal.proposalId);
  const save = session.createSaveSnapshot();
  assert.equal(save.expectedRevision, 3);
  assert.equal(save.character.builder.classKey, "ninja");

  const techniqueProposal = session.propose(SetTechniqueSelection(["shadow-step"]));
  session.acceptProposal(techniqueProposal.proposalId);
  const state = session.acknowledgeSave(save.saveId, {
    revision: 4,
    metadata: { updatedAt: "updated-at" },
  });
  assert.equal(state.persisted.builder.classKey, "ninja");
  assert.deepEqual(state.persisted.builder.selectedTechniques, []);
  assert.deepEqual(state.working.builder.selectedTechniques, ["shadow-step"]);
  assert.equal(state.dirty, true);
  assert.equal(state.revision, 4);
  assert.equal(state.metadata.createdAt, "created-at");
  assert.equal(state.metadata.updatedAt, "updated-at");
});

test("session core has no Firebase, DOM, file, network, page, or widget dependency", async () => {
  for (const relativePath of [
    "../public/js/core/character-commands.js",
    "../public/js/core/character-state-diff.js",
    "../public/js/core/character-session.js",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /firebase|document\.|window\.|localStorage|sessionStorage|fetch\(|node:fs|node:http|node:https|\/pages\/|\/builder\//i,
    );
  }
});
