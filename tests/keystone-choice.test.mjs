import assert from "node:assert/strict";
import test from "node:test";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";
import { getKeystoneChoices, buildKeystoneAnswer, isKeystoneGrant } from "../public/js/core/keystone-rules.js";
import { getExpressionRuntimeStatus } from "../public/js/core/game-data-contract.js";
import { decodeCharacter } from "../public/js/core/character-codec.js";
import { migrateCharacterDocument } from "../public/js/core/character-migrations.js";
import { buildCharacterKeystoneEntries } from "../public/js/core/data-sanitization.js";
import { reconcileCharacterGraph, createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { SetClass, SetGrantChoices } from "../public/js/core/character-commands.js";
import { getBuilderStepInformationalMessages } from "../public/js/builder/builder-step-impacts.js";
import { KeystoneChoiceWidget, registerKeystoneWidgetExtension } from "../public/js/builder/widgets/keystone-choice-widget.js";
import { GrantWidgetRegistry } from "../public/js/builder/widgets/grant-widget-registry.js";

const grant = { type: "choice", filterType: "keystone", count: 2 };
const sourceId = "class-feature:ninja:personal-oath";
const choices = getKeystoneChoices(grant, { sourceId, sourceLabel: "Personal Oath" });
function fixture() {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  const character = makeGraphCharacter({ selectedFeats: [], selectedFeatOptions: [], selectedClassFeatureOptions: [] });
  gameData.classFeatures.ninja.push({ classKey: "ninja", type: "feature", featureKey: "personal-oath", name: "Personal Oath", level: 1,
    expressionSyntaxVersion: 3, status: "playable", runtimeSupport: { status: "supported", reasons: [] }, grants: [grant], prerequisites: [] });
  return { gameData, character };
}

test("Keystone grants have independent source-owned slots and unsupported generic choices remain deferred", () => {
  assert.equal(choices.length, 2);
  assert.notEqual(choices[0].choiceId, choices[1].choiceId);
  assert.notEqual(choices[0].choiceId, getKeystoneChoices(grant, { sourceId: "feat-selection:personal-oath" })[0].choiceId);
  assert.equal(getExpressionRuntimeStatus("grant", grant, { syntaxVersion: 3 }), "implemented");
  for (const extra of [{ recipientRef: "artifact" }, { filterType: ["keystone", "familiar"] }, { choiceRef: "another" }, { key: "named-catalogue-entry" }]) {
    const unsupported = { ...grant, ...extra };
    assert.equal(isKeystoneGrant(unsupported), false);
    assert.equal(getExpressionRuntimeStatus("grant", unsupported, { syntaxVersion: 3 }), "stubbed");
  }
});

test("Keystone text uses the existing answer envelope, round trips and rejects malformed or oversized text", () => {
  const { character } = fixture();
  const text = 'My transformed body protects my friends, even when I fear its power. <&> "';
  const answer = buildKeystoneAnswer(choices[0], text.repeat(4).trim());
  character.builder.grantChoices[answer.choiceId] = answer;
  assert.equal(decodeCharacter(character).ok, true);
  assert.deepEqual(migrateCharacterDocument(JSON.parse(JSON.stringify(character))).value, character);
  assert.equal(buildCharacterKeystoneEntries(character.builder).find((entry) => entry.choiceId === answer.choiceId).text, answer.value);
  for (const value of ["", "x".repeat(401), " extra spaces ", "hidden\u0001control"]) {
    answer.value = value;
    assert.equal(decodeCharacter(character).ok, false, JSON.stringify(value));
  }
  answer.type = "technique";
  answer.value = "Ordinary answers still require stable keys";
  assert.equal(decodeCharacter(character).ok, false);
});

test("Keystone answers save independently and provider removal requires a cancellable proposal", () => {
  const { character, gameData } = fixture();
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  const answers = Object.fromEntries(choices.map((choice, i) => [choice.choiceId, buildKeystoneAnswer(choice, `My oath ${i + 1}.`)]));
  const proposal = session.propose(SetGrantChoices(answers));
  assert.equal(proposal.ok, true);
  assert.ok(!proposal.impacts.some((impact) => impact.code === "grant-choice-incomplete" && impact.label.startsWith("Personal Oath")));
  session.acceptProposal(proposal.proposalId, { confirm: true });
  const accepted = session.getState().working;
  const removal = session.propose(SetClass("guardian"));
  assert.equal(removal.requiresConfirmation, true);
  assert.equal(removal.impacts.filter((impact) => impact.before?.type === "keystone").length, 2);
  session.cancelProposal(removal.proposalId);
  assert.deepEqual(session.getState().working, accepted);
  assert.deepEqual(session.createSaveSnapshot().character.builder.grantChoices, answers);
  const retry = session.propose(SetClass("guardian"));
  session.acceptProposal(retry.proposalId, { confirm: true });
  assert.deepEqual(session.getState().working.builder.grantChoices, {});
});

test("missing Keystone warnings name the feature and follow its Class or Origin ownership", () => {
  const { character, gameData } = fixture();
  const result = reconcileCharacterGraph({ character, gameData });
  assert.equal(result.ok, true);
  assert.ok(getBuilderStepInformationalMessages(result, "class").includes("Personal Oath — Keystone 1: add your Keystone text."));
  assert.ok(!getBuilderStepInformationalMessages(result, "origin").some((message) => message.includes("Personal Oath")));
  const node = result.graph.nodes.find((entry) => entry.type === "grant-choice" && entry.metadata.answerType === "keystone");
  const scoped = { ...result, graph: { ...result.graph, nodes: result.graph.nodes.map((entry) => entry === node ? { ...entry, sourceOwnerId: "origin-feature:home:oath" } : entry) } };
  assert.ok(getBuilderStepInformationalMessages(scoped, "origin").includes("Personal Oath — Keystone 1: add your Keystone text."));
  assert.ok(!getBuilderStepInformationalMessages(scoped, "class").includes("Personal Oath — Keystone 1: add your Keystone text."));
});

test("wrong-owner Keystone answers do not survive reconciliation", () => {
  const { character, gameData } = fixture();
  character.builder.grantChoices[choices[0].choiceId] = { ...buildKeystoneAnswer(choices[0], "An oath."), sourceId: "feat-selection:someone-else" };
  const result = reconcileCharacterGraph({ character, gameData });
  assert.ok(result.impacts.some((impact) => impact.category === "confirmation-required" && impact.before?.type === "keystone"));
  assert.deepEqual(result.character.builder.grantChoices, {});
});

test("the shared widget edits, clears and restores text without losing another grant answer", async () => {
  const { character, gameData } = fixture();
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
  let accept = true;
  const widgets = new Map();
  const documentRef = { createElement: () => ({ innerHTML: "", addEventListener() {}, removeEventListener() {}, setAttribute() {}, querySelector: () => ({ focus() {} }), remove() {} }) };
  const page = { widgets, getCharacter: () => session.getState().working,
    registerWidget: (widget) => widgets.set(widget.id, widget), unregisterWidget: (widget) => widgets.delete(widget.id),
    requestCharacterCommand: async (widget, command) => {
      const proposal = session.propose(command);
      if (!accept) { session.cancelProposal(proposal.proposalId); return { ok: false, reason: "cancelled" }; }
      assert.equal(proposal.ok, true);
      session.acceptProposal(proposal.proposalId, { confirm: true });
      return { ok: true };
    },
  };
  const registry = new GrantWidgetRegistry();
  registerKeystoneWidgetExtension(registry, { documentRef });
  const entries = registry.get("choice")({ page, grant, entry: { name: "Personal Oath" }, sourceId, index: 0 });
  assert.equal(entries.length, 2);
  assert.ok(entries[0] instanceof KeystoneChoiceWidget);
  const change = (widget, value) => widget.change({ target: { dataset: { keystoneChoice: widget.choice.choiceId }, value } });
  await change(entries[0], '  My <form> & "friends".  ');
  await change(entries[1], "Another oath.");
  assert.match(entries[0].element.innerHTML, /My &lt;form&gt; &amp; &quot;friends&quot;/);
  assert.ok(entries[0].element.innerHTML.indexOf("selectedChoiceDetail") > entries[0].element.innerHTML.indexOf("</textarea>"));
  accept = false;
  await change(entries[0], "Cancelled replacement.");
  assert.ok(!entries[0].element.innerHTML.includes("Cancelled replacement"));
  accept = true;
  await change(entries[0], "");
  assert.equal(page.getCharacter().builder.grantChoices[choices[0].choiceId], undefined);
  assert.equal(page.getCharacter().builder.grantChoices[choices[1].choiceId].value, "Another oath.");
});
