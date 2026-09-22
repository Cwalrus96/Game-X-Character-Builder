import assert from "node:assert/strict";
import test from "node:test";
import { buildWeaponChoicePatch, buildWeaponEnhancementChoicePatch } from "../public/js/builder/widgets/grant-widget-factory.js";
import { GrantChoiceState } from "../public/js/builder/grant-choice-state.js";
import { validateCharacter } from "../public/js/core/character-codec.js";
import { SetGrantChoices } from "../public/js/core/character-commands.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";

function fixture() {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.classFeatures.guardian[0].grants[0].enhancement = "bound";
  gameData.weaponBases[0].tags = ["Sharp", "One-Handed", "Reach +1"];
  gameData.weaponEnhancements = ["bound", "keen"].map((key) => ({
    enhancementKey: key, name: key, minRank: 1, prerequisites: [],
    status: "playable", selectionMode: key === "bound" ? "granted-only" : "selectable",
  }));
  const forcedEnhancements = [{ id: "bound-instance", enhancementKey: "bound", rank: 1, selections: {}, granted: true }];
  const character = makeGraphCharacter({ classKey: "guardian" });
  character.builder.primaryAttribute = "willpower";
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const options = { sourceId: "class-feature:guardian:soulbound-armament", sourceLabel: "Bound armament", forcedEnhancements, weaponBases: gameData.weaponBases };
  const answer = { ...buildWeaponChoicePatch({ ...options, patch: { weaponKey: "longsword", rank: 1 } }), choiceId: "guardian-armament" };
  return { gameData, session, options, answer };
}

test("a fresh granted weapon passes the exact character codec and materializes through the session", () => {
  const { session, answer } = fixture();
  const proposal = session.propose(SetGrantChoices({ [answer.choiceId]: answer }));
  assert.equal(proposal.ok, true, JSON.stringify(proposal.impacts));
  assert.equal(validateCharacter(proposal.reconciled).ok, true);
  session.acceptProposal(proposal.proposalId, { confirm: true });
  const saved = session.createSaveSnapshot().character;
  assert.equal(saved.builder.grantChoices[answer.choiceId].sourceId, "class-feature:guardian:soulbound-armament");
  assert.deepEqual(saved.builder.grantChoices[answer.choiceId].tags, ["sharp", "one-handed", "reach1"]);
  assert.equal(saved.builder.weapons.length, 1);
  assert.equal(saved.builder.weapons[0].sourceChoiceId, answer.choiceId);
  assert.equal(saved.builder.weapons[0].enhancements[0].granted, true);
});

test("enhancement input preserves the weapon's original owner and required enhancement", () => {
  const { session, options, answer } = fixture();
  const patch = buildWeaponEnhancementChoicePatch({ choice: answer, grant: { choiceRef: answer.choiceId, rank: 1 }, enhancementKey: "keen", forcedEnhancements: options.forcedEnhancements });
  const enhanced = buildWeaponChoicePatch({ ...options, sourceId: "class-feature:guardian:enhancement-feature", choice: answer, patch });
  assert.equal(enhanced.sourceId, answer.sourceId);
  assert.deepEqual(enhanced.enhancements.map(({ enhancementKey, granted }) => [enhancementKey, granted]), [["bound", true], ["keen", false]]);
  const proposal = session.propose(SetGrantChoices({ [answer.choiceId]: enhanced }));
  assert.equal(proposal.ok, true, JSON.stringify(proposal.impacts));
  assert.equal(validateCharacter(proposal.reconciled).ok, true);
  const cleared = buildWeaponEnhancementChoicePatch({ choice: enhanced, grant: { choiceRef: answer.choiceId }, enhancementKey: "", forcedEnhancements: options.forcedEnhancements });
  assert.deepEqual(cleared.enhancements, options.forcedEnhancements);
});

test("clearing a weapon deletes the answer and reviews generated-weapon removal without touching accepted state", () => {
  const { session, answer } = fixture();
  const initial = session.propose(SetGrantChoices({ [answer.choiceId]: answer }));
  session.acceptProposal(initial.proposalId, { confirm: true });
  const accepted = session.getState().working;
  let choices = { [answer.choiceId]: answer, unrelated: { value: "preserved" } };
  const original = structuredClone(choices);
  const state = new GrantChoiceState({ getChoices: () => choices, setChoices: next => { choices = next; } });
  state.removeChoice(answer.choiceId);
  assert.deepEqual(choices, { unrelated: original.unrelated });
  assert.deepEqual(answer, original[answer.choiceId]);
  const cleared = session.propose(SetGrantChoices({}));
  assert.equal(cleared.ok, true, JSON.stringify(cleared.impacts));
  assert.equal(cleared.requiresConfirmation, true);
  assert.equal(cleared.reconciled.builder.weapons.length, 0);
  session.cancelProposal(cleared.proposalId);
  assert.deepEqual(session.getState().working, accepted);
});
