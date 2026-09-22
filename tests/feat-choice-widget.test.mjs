import assert from "node:assert/strict";
import test from "node:test";
import { FeatChoiceWidget } from "../public/js/builder/widgets/feat-choice-widget.js";
import { SetFeatSelection } from "../public/js/core/character-commands.js";
import { makeFeatChoicesFixture } from "./fixtures/feat-choices.mjs";

function harness({ result = { ok: false, reason: "cancelled" }, selected = [], widgetOptions = {} } = {}) {
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
  const options = {
    entry: classFeature, sourceId: "class-feature:ninja:class-feat-2", gameData, mount,
    expandedChoices: new Set(), ...widgetOptions,
    onChange() { updates++; },
  };
  const widget = new FeatChoiceWidget(page, options);
  const change = (value, owner = widget.id) => events.get("change")({ target: { dataset: { featSlot: "0", featWidget: owner }, value } });
  const toggle = () => events.get("click")({ target: { dataset: { featExpand: "0", featWidget: widget.id } } });
  return { widget, mount, character, commands, widgets, events, change, toggle, details, page, options, focused: () => focused, updates: () => updates };
}

test("feat picker sends narrow replacement intent and restores cancelled selection and focus", async () => {
  const h = harness({ selected: ["class-a", "archetype-a"] });
  const before = structuredClone(h.character);
  assert.match(h.mount.innerHTML, /Choose a class feat/);
  assert.doesNotMatch(h.mount.innerHTML, /value="archetype-a"/);
  assert.doesNotMatch(h.mount.innerHTML, /class-a description/);
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

test("compact and expanded feat choices always exclude unavailable feats even when other options are shown", () => {
  const h = harness({ selected: ["class-a"], widgetOptions: { showUnavailable: () => true } });
  const before = structuredClone(h.character);
  assert.match(h.mount.innerHTML, /<select/);
  assert.match(h.mount.innerHTML, />class-a<\/option>/);
  assert.doesNotMatch(h.mount.innerHTML, /needs-skill|unfinished|archetype-a|class-high|class-a description/);
  assert.match(h.mount.innerHTML, /aria-expanded="false"/);
  h.toggle();
  assert.match(h.mount.innerHTML, /aria-expanded="true"/);
  assert.match(h.mount.innerHTML, /class-a description/);
  assert.match(h.mount.innerHTML, /class-b description/);
  assert.doesNotMatch(h.mount.innerHTML, /<select|needs-skill|unfinished|archetype-a|class-high/);
  assert.match(h.mount.innerHTML, /value="class-a" aria-label="class-a" checked/);
  assert.match(h.mount.innerHTML, /Prerequisite: Class: ninja level 2/);
  h.toggle();
  assert.match(h.mount.innerHTML, /value="class-a" selected/);
  assert.doesNotMatch(h.mount.innerHTML, /class-a description|type="radio"/);
  assert.deepEqual(h.character, before);
  assert.deepEqual(h.commands, [], "view toggles must not submit character commands");
});

test("expanded radio choices use the same reviewed command and restore a cancelled selection", async () => {
  const h = harness({ selected: ["class-a", "archetype-a"] });
  h.toggle();
  await h.change("class-b");
  assert.deepEqual(h.commands, [SetFeatSelection(["class-b", "archetype-a"])]);
  assert.match(h.mount.innerHTML, /aria-expanded="true"/);
  assert.match(h.mount.innerHTML, /value="class-a" aria-label="class-a" checked/);
  assert.doesNotMatch(h.mount.innerHTML, /value="class-b" aria-label="class-b" checked/);
  assert.deepEqual(h.character.builder.selectedFeats, ["class-a", "archetype-a"]);
  assert(h.focused() > 0);
});

test("feat description expansion survives session updates and coordinator widget recreation", () => {
  const h = harness({ selected: ["class-a"] });
  h.toggle();
  h.character.builder.selectedFeats = ["class-b"];
  h.widget.applyReconciledState();
  assert.match(h.mount.innerHTML, /value="class-b" aria-label="class-b" checked/);
  h.widget.destroy();
  const replacement = new FeatChoiceWidget(h.page, h.options);
  assert.match(h.mount.innerHTML, /aria-expanded="true"/);
  assert.match(h.mount.innerHTML, /class-a description/);
  assert.match(h.mount.innerHTML, /value="class-b" aria-label="class-b" checked/);
  assert.equal(h.commands.length, 0);
  replacement.destroy();
});

test("expanded feat descriptions escape authored markup and keep full multiline text", () => {
  const h = harness();
  h.options.gameData.feats[0].description = '<script>unsafe()</script>\nSecond line & more text.';
  h.toggle();
  assert.match(h.mount.innerHTML, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;\nSecond line &amp; more text\./);
  assert.doesNotMatch(h.mount.innerHTML, /<script>/);
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
