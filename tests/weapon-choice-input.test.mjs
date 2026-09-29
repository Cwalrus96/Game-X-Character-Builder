import assert from "node:assert/strict";
import test from "node:test";
import { buildWeaponChoicePatch, buildWeaponEnhancementChoicePatch } from "../public/js/builder/widgets/grant-widget-factory.js";
import { GrantChoiceState } from "../public/js/builder/grant-choice-state.js";
import { validateCharacter } from "../public/js/core/character-codec.js";
import { SetGrantChoices, AddWeaponEnhancement, UpdateWeaponEnhancement, RemoveWeaponEnhancement } from "../public/js/core/character-commands.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { createCharacterSessionGraphReconciler, reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";

function fixture({ bonus = 0 } = {}) {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.classFeatures.guardian[0].grants[0].enhancement = "bound";
  if (bonus) gameData.classFeatures.guardian[0].grants.push({ type: "weapon-enhancement", rank: 1, count: bonus });
  gameData.weaponBases[0].tags = ["Sharp", "One-Handed", "Reach +1"];
  gameData.weaponEnhancements = ["bound", "keen", "defensive"].map((key) => ({
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

test("bonus enhancement capacity works on a granted weapon while its automatic enhancement stays protected", () => {
  const { session, answer } = fixture({ bonus: 1 });
  const accept = command => {
    const proposal = session.propose(command);
    assert.equal(proposal.ok, true, JSON.stringify(proposal.impacts));
    assert.equal(proposal.requiresConfirmation, false, JSON.stringify(proposal.impacts));
    session.acceptProposal(proposal.proposalId);
    return session.getState().working;
  };
  let character = accept(SetGrantChoices({ [answer.choiceId]: answer }));
  const weaponId = character.builder.weapons[0].id;
  for (const key of ["keen", "defensive"]) character = accept(AddWeaponEnhancement(weaponId, {
    id: `extra-${key}`, enhancementKey: key, rank: 1, selections: {}, granted: false,
  }));
  assert.equal(character.builder.weapons[0].enhancements.length, 3);
  assert.deepEqual(character.builder.weapons[0].enhancements, character.builder.grantChoices[answer.choiceId].enhancements);
  character = accept(UpdateWeaponEnhancement(weaponId, "extra-keen", { selections: { element: "Fire" } }));
  assert.equal(character.builder.grantChoices[answer.choiceId].enhancements[1].selections.element, "Fire");
  const before = structuredClone(character);
  const excessive = session.propose(AddWeaponEnhancement(weaponId, { id: "excess", enhancementKey: "keen", rank: 1, selections: {}, granted: false }));
  assert.equal(excessive.requiresConfirmation, true);
  assert.ok(excessive.impacts.some(item => item.code === "weapon-enhancement-capacity-removed"));
  session.cancelProposal(excessive.proposalId);
  assert.deepEqual(session.getState().working, before);
  for (const command of [RemoveWeaponEnhancement(weaponId, "bound-instance"), UpdateWeaponEnhancement(weaponId, "bound-instance", { rank: 2 })]) {
    assert.throws(() => session.propose(command), /supplied automatically/);
  }
  character = accept(RemoveWeaponEnhancement(weaponId, "extra-keen"));
  assert.deepEqual(character.builder.weapons[0].enhancements.map(e => e.id), ["bound-instance", "extra-defensive"]);
  assert.equal(validateCharacter(session.createSaveSnapshot().character).ok, true);
});

test("editing the original class enhancement retains optional enhancements added in Equipment", () => {
  const { options, answer } = fixture();
  const existing = { ...answer, enhancements: [...answer.enhancements,
    { id: "original", enhancementKey: "keen", rank: 1, selections: {}, granted: false },
    { id: "bonus", enhancementKey: "defensive", rank: 1, selections: {}, granted: false }] };
  const changed = buildWeaponEnhancementChoicePatch({ choice: existing, grant: { rank: 1 }, enhancementKey: "keen", forcedEnhancements: options.forcedEnhancements });
  assert.deepEqual(changed.enhancements.at(-1), existing.enhancements.at(-1));
});

test("missing weapon answers name their feature and saved answers obey the same skill filter as the picker", () => {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.classFeatures.guardian[0].grants = [{ type: "weapon", skill: "Ranged Weapons", rank: 1 }];
  const base = gameData.weaponBases[0];
  gameData.weaponBases = [
    { ...base, expressionSyntaxVersion: 3, techniqueSkills: ["Melee Weapons"] },
    { ...base, weaponKey: "bow", name: "Bow", expressionSyntaxVersion: 3, techniqueSkills: ["Ranged Weapons"] },
  ];
  const character = makeGraphCharacter({ classKey: "guardian" });
  character.builder.primaryAttribute = "willpower";
  const incomplete = reconcileCharacterGraph({ character, gameData });
  const choice = incomplete.graph.nodes.find(node => node.type === "grant-choice");
  const reminder = incomplete.impacts.find(item => item.code === "grant-choice-incomplete");
  assert.equal(reminder.category, "informational");
  assert.match(reminder.message, /Soulbound Armament: choose a Rank 1 weapon using Ranged Weapons/);
  const answer = { ...buildWeaponChoicePatch({ sourceId: choice.sourceOwnerId, sourceLabel: choice.label, weaponBases: gameData.weaponBases, patch: { weaponKey: "bow", rank: 1 } }), choiceId: choice.key };
  character.builder.grantChoices[choice.key] = answer;
  const answered = reconcileCharacterGraph({ character, gameData });
  assert.equal(answered.ok, true, JSON.stringify(answered.impacts));
  assert.equal(answered.impacts.some(item => item.code === "grant-choice-incomplete"), false);
  character.builder.grantChoices[choice.key].weaponKey = base.weaponKey;
  const invalid = compileCharacterGraph({ character, gameData }).nodes.find(node => node.type === "grant-answer");
  assert.equal(invalid.metadata.valid, false);
  assert.match(invalid.metadata.reason, /does not match/);
});

test("enhancement input preserves the weapon's original owner and required enhancement", () => {
  const { session, options, answer } = fixture();
  const patch = buildWeaponEnhancementChoicePatch({ choice: answer, grant: { choiceRef: answer.choiceId, rank: 1 }, enhancementKey: "keen", forcedEnhancements: options.forcedEnhancements, selections: { element: "Fire" } });
  const enhanced = buildWeaponChoicePatch({ ...options, sourceId: "class-feature:guardian:enhancement-feature", choice: answer, patch });
  assert.equal(enhanced.sourceId, answer.sourceId);
  assert.deepEqual(enhanced.enhancements.map(({ enhancementKey, granted }) => [enhancementKey, granted]), [["bound", true], ["keen", false]]);
  const proposal = session.propose(SetGrantChoices({ [answer.choiceId]: enhanced }));
  assert.equal(proposal.ok, true, JSON.stringify(proposal.impacts));
  assert.equal(validateCharacter(proposal.reconciled).ok, true);
  assert.deepEqual(enhanced.enhancements.find(entry => !entry.granted).selections, { element: "Fire" });
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
