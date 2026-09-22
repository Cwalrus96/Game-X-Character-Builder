import assert from "node:assert/strict";
import test from "node:test";
import { FeatChoiceWidget } from "../public/js/builder/widgets/feat-choice-widget.js";
import { SetFeatSelection } from "../public/js/core/character-commands.js";
import { makeFeatChoicesFixture } from "./fixtures/feat-choices.mjs";

function harness({ result = { ok: false, reason: "cancelled" }, selected = [] } = {}) {
  const { gameData, character, classFeature } = makeFeatChoicesFixture();
  character.builder.selectedFeats = selected;
  const events = new Map();
  let focused = 0;
  const details = { innerHTML: "", append() {} };
  const mount = {
    innerHTML: "", attributes: {},
    addEventListener(type, handler) { events.set(type, handler); },
    removeEventListener(type) { events.delete(type); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelector(selector) { return selector.includes("data-feat-detail") ? details : { focus() { focused++; } }; },
  };
  const commands = [];
  const widgets = new Map();
  const page = {
    widgets,
    registerWidget(widget) { widgets.set(widget.id, widget); },
    unregisterWidget(widget) { widgets.delete(widget.id); },
    clearWidgets() {},
    getCharacter: () => character,
    async requestCharacterCommand(widget, command) { commands.push(command); return await result; },
  };
  let updates = 0;
  const widget = new FeatChoiceWidget(page, {
    entry: classFeature, sourceId: "class-feature:ninja:class-feat-2", gameData, mount,
    onChange() { updates++; },
  });
  const change = (value, owner = widget.id) => events.get("change")({ target: { dataset: { featSlot: "0", featWidget: owner }, value } });
  return { widget, mount, character, commands, widgets, events, change, details, focused: () => focused, updates: () => updates };
}

test("feat picker sends narrow replacement intent and restores cancelled selection and focus", async () => {
  const h = harness({ selected: ["class-a", "archetype-a"] });
  const before = structuredClone(h.character);
  assert.match(h.mount.innerHTML, /Choose a class feat/);
  assert.doesNotMatch(h.mount.innerHTML, /value="archetype-a"/);
  assert.match(h.details.innerHTML, /class-a description/);
  await h.change("class-b");
  assert.deepEqual(h.commands, [SetFeatSelection(["class-b", "archetype-a"])]);
  assert.deepEqual(h.character, before);
  assert.match(h.mount.innerHTML, /value="class-a" selected/);
  assert.doesNotMatch(h.mount.innerHTML, /role="alert"/);
  assert(h.focused() > 0);
  assert.equal(h.updates(), 0);
  h.widget.destroy();
  assert.equal(h.events.size, 0);
  assert.equal(h.widgets.size, 0);
});

test("feat picker blocks wrong-type, unmet-prerequisite, foreign, and duplicate in-flight actions", async () => {
  let finish;
  const result = new Promise((resolve) => { finish = resolve; });
  const h = harness({ result });
  await h.change("archetype-a");
  await h.change("needs-skill");
  await h.change("class-a", "nested-widget");
  assert.equal(h.commands.length, 0);
  h.widget.disable();
  await h.change("class-a");
  assert.equal(h.commands.length, 0);
  h.widget.enable();
  const pending = h.change("class-a");
  assert.equal(h.mount.attributes["aria-busy"], "true");
  await h.change("class-b");
  assert.equal(h.commands.length, 1);
  finish({ ok: false, errors: ["The granting feature changed."] });
  await pending;
  assert.match(h.mount.innerHTML, /role="alert"/);
  assert.match(h.mount.innerHTML, /The granting feature changed/);
  assert.equal(h.mount.attributes["aria-busy"], "false");
});

test("feat picker refreshes accepted changes and scopes clearing to its assigned answer", async () => {
  const h = harness({ selected: ["class-a", "archetype-a"], result: { ok: true } });
  await h.change("");
  assert.deepEqual(h.commands, [SetFeatSelection(["archetype-a"])]);
  assert.equal(h.updates(), 1);
  const focused = h.focused();
  h.widget.applyReconciledState();
  assert.equal(h.focused(), focused, "external updates must not steal focus");
});
