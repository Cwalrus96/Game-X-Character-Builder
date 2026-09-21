import assert from "node:assert/strict";
import test from "node:test";
import { TraitWidget } from "../public/js/builder/widgets/trait-widget.js";
import { SetTraitChoice, RemoveTraitChoice } from "../public/js/core/character-commands.js";
import { projectCharacterTraits } from "../public/js/core/trait-rules.js";

function harness({ result = { ok: true }, projection = {}, character = { builder: {} }, gameData = {}, project = null } = {}) {
  const events = new Map();
  let focused = 0;
  const mount = {
    innerHTML: "", attributes: {},
    addEventListener(type, handler) { events.set(type, handler); },
    removeEventListener(type) { events.delete(type); },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector() { return { focus() { focused++; } }; },
  };
  const commands = [];
  const widgets = [];
  const page = {
    getCharacter: () => character,
    registerWidget(widget) { widgets.push(widget); },
    unregisterWidget(widget) { widgets.splice(widgets.indexOf(widget), 1); },
    async requestCharacterCommand(widget, command) { commands.push(command); return await result; },
  };
  const state = {
    choices: [{ choiceId: "trait-choice:one", sourceId: "feature:one", recipientId: "character", label: "Choose a movement Trait", traitKey: "", options: [{ traitKey: "wings", name: "Wings", rank: 1, eligible: true }, { traitKey: "unknown", name: "Unfinished", eligible: false, reason: "Incomplete" }] }],
    activations: [{ activationId: "activation:one", sourceId: "feature:one", label: "Activate form", active: false, hasOverride: false, eligible: true, costText: "1 Action + 2 Energy", durationText: "While in this form" }],
    traits: [], ...projection,
  };
  const widget = new TraitWidget(page, { mount, gameData, project: project || (() => state) });
  return { widget, mount, character, commands, widgets, state, events, focused: () => focused };
}

test("TraitWidget sends only static source-owned choices without mutating character state", async () => {
  const h = harness();
  const before = structuredClone(h.character);
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "wings" } });
  h.state.choices[0].traitKey = "wings";
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "" } });
  await h.events.get("change")({ target: { dataset: { traitActivation: "0" }, checked: true } });
  assert.deepEqual(h.commands, [
    SetTraitChoice({ choiceId: "trait-choice:one", sourceId: "feature:one", recipientId: "character", traitKey: "wings" }),
    RemoveTraitChoice("trait-choice:one"),
  ]);
  assert.deepEqual(h.character, before);
  const focusCount = h.focused();
  h.widget.applyReconciledState(h.character);
  assert.equal(h.focused(), focusCount, "other widget changes must not steal focus");
});

test("TraitWidget respects eligibility and disabled state and restores cancelled selections", async () => {
  const h = harness({ result: { ok: false, reason: "cancelled", errors: [] } });
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "" } });
  assert.equal(h.commands.length, 0, "an unanswered choice cannot submit a stale removal");
  assert.equal(h.events.has("click"), false, "there are no activation/reset controls");
  assert.doesNotMatch(h.mount.innerHTML, /data-reset-trait-activation/);
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "unknown" } });
  assert.equal(h.commands.length, 0);
  h.widget.disable();
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "wings" } });
  assert.equal(h.commands.length, 0);
  h.widget.enable();
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "wings" } });
  assert.equal(h.commands.length, 1);
  assert.doesNotMatch(h.mount.innerHTML, /value="wings" selected|role="alert"/);
  assert.equal(h.mount.attributes["aria-busy"], "false");
  h.widget.destroy();
  assert.equal(h.events.size, 0);
  assert.equal(h.widgets.length, 0);
});

test("TraitWidget prevents duplicate submissions while the session reviews a proposal", async () => {
  let finish;
  const result = new Promise((resolve) => { finish = resolve; });
  const h = harness({ result });
  const pending = h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "wings" } });
  assert.equal(h.mount.attributes["aria-busy"], "true");
  assert.match(h.mount.innerHTML, /data-trait-choice="0" disabled/);
  await h.events.get("change")({ target: { dataset: { traitChoice: "0" }, value: "wings" } });
  assert.equal(h.commands.length, 1);
  finish({ ok: false, errors: ["The granting feature is no longer available."] });
  await pending;
  assert.match(h.mount.innerHTML, /role="alert"/);
  assert.match(h.mount.innerHTML, /granting feature is no longer available/);
  assert.equal(h.mount.attributes["aria-busy"], "false");
});

test("TraitWidget exposes referenced current-source Traits without creating choice or activation controls", () => {
  const h = harness({ projection: { choices: [], activations: [], traits: [{ traitKey: "climber", name: "Climber", rank: 2, referenceOnly: true, sourceLabel: "Wall Crawler", sourceDescription: "While this adaptation is active." }] } });
  assert.match(h.mount.innerHTML, /Rank 2 · Reference · Wall Crawler/);
  assert.match(h.mount.innerHTML, /While this adaptation is active/);
  assert.doesNotMatch(h.mount.innerHTML, /<select|<input|<button/);
  assert.deepEqual(h.commands, []);
});

test("TraitWidget distinguishes acquired Traits and references without exposing gameplay switches", () => {
  const character = { builder: { originKey: "test-origin", level: 1, traitChoices: {}, traitActivations: {} } };
  const trait = { traitKey: "liquid-form", name: "Liquid Form", rank: 1, description: "Move through narrow openings.", tags: ["Body"], grants: [{ type: "tag", tag: "Liquid", minRank: 1 }], expressionSyntaxVersion: 3 };
  const feature = { originKey: "test-origin", featureKey: "liquid-form-provider", name: "Liquid Form Provider", level: 1, description: "While this form is active.", traitKeys: ["liquid-form"], grants: [], expressionSyntaxVersion: 3 };
  const gameData = { schemaVersion: 3, traits: [trait], origins: [{ originKey: "test-origin", name: "Test Origin", features: [feature] }] };
  const h = harness({ character, gameData, project: projectCharacterTraits });
  assert.match(h.mount.innerHTML, /Rank unknown · Reference/);
  assert.match(h.mount.innerHTML, /While this form is active/);
  assert.doesNotMatch(h.mount.innerHTML, /<input|Granted tags: Liquid/);

  feature.grants = [{ type: "trait", key: "liquid-form" }];
  h.widget.applyReconciledState(character);
  assert.match(h.mount.innerHTML, /Rank 1 · Acquired/);
  assert.match(h.mount.innerHTML, /Trait categories: Body/);
  assert.match(h.mount.innerHTML, /Granted tags: Liquid/);
  assert.match(h.mount.innerHTML, /While this form is active/);
  assert.doesNotMatch(h.mount.innerHTML, /<input|data-trait-activation|data-reset-trait-activation/);
  assert.deepEqual(character.builder.traitActivations, {});
});
