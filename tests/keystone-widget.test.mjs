import test from "node:test";
import assert from "node:assert/strict";
import { KeystoneWidget } from "../public/js/builder/widgets/text-choice-widget.js";
import { KeystoneChoiceWidget } from "../public/js/builder/widgets/keystone-choice-widget.js";
import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { SetOriginKeystone, SetBackgroundKeystones, AddBond, UpdateBond, applyCharacterCommand } from "../public/js/core/character-commands.js";
import { getKeystoneChoices } from "../public/js/core/keystone-rules.js";

function mount() {
  return { innerHTML: "", events: {}, attrs: {},
    addEventListener(key, value) { this.events[key] = value; }, removeEventListener(key) { delete this.events[key]; },
    setAttribute(key, value) { this.attrs[key] = value; }, querySelector() { return { focus() {} }; }, remove() {},
  };
}

test("all Keystone bindings use the same labelled field, normalization and character commands", async () => {
  let character = createDefaultCharacter({ ownerUid: "keystone_test" });
  character = applyCharacterCommand(character, AddBond({ bondId: "bond:user:friend", name: "Friend", rank: "1", keystone: "" }));
  const page = { getCharacter: () => character, registerWidget() {}, async requestCharacterCommand(widget, command) { character = applyCharacterCommand(character, command); return { ok: true }; } };
  const bindings = [
    { id: "origin", label: "Origin Keystone", getValue: () => character.builder.originKeystone, command: SetOriginKeystone },
    { id: "background", label: "Background Keystone", getValue: () => character.builder.backgroundKeystones[0] || "", command: value => SetBackgroundKeystones(value ? [value] : []) },
    { id: "bond", label: "Bond Keystone", getValue: () => character.builder.bonds[0].keystone, command: value => UpdateBond("bond:user:friend", { keystone: value }) },
  ];
  const widgets = bindings.map(binding => new KeystoneWidget(page, { ...binding, mount: mount(), onChange: value => page.requestCharacterCommand(null, binding.command(value)) }));
  const choice = getKeystoneChoices({ type: "choice", filterType: "keystone" }, { sourceId: "feature:test", sourceLabel: "Feature Keystone" })[0];
  widgets.push(new KeystoneChoiceWidget(page, { choice, documentRef: { createElement: mount } }));
  for (const widget of widgets) {
    assert.match(widget.element.innerHTML, /<textarea class="input"/);
    assert.match(widget.element.innerHTML, /maxlength="400"/);
    assert.match(widget.element.innerHTML, /rows="3"/);
    assert.match(widget.element.innerHTML, new RegExp(`for="${widget.field.id}"`));
    await widget.change({ target: { id: widget.field.id, value: "  A <shared>\n Keystone. " } });
    assert.match(widget.element.innerHTML, /A &lt;shared&gt; Keystone\./);
    assert.doesNotMatch(widget.element.innerHTML, /selectedChoiceDetail/);
    assert.equal(widget.element.innerHTML.split("A &lt;shared&gt;").length, 2);
    await widget.change({ target: { id: widget.field.id, value: "x".repeat(410) } });
    assert.equal(widget.getValue().length, 400);
  }
  assert.equal(character.builder.originKeystone.length, 400);
  assert.equal(character.builder.backgroundKeystones[0].length, 400);
  assert.equal(character.builder.bonds[0].keystone.length, 400);
  assert.equal(character.builder.grantChoices[choice.choiceId].value.length, 400);
});

test("Keystone cancellation, pending and error states preserve accepted text and restore the current field", async () => {
  let finish, focused = 0;
  const element = mount(), calls = [];
  const widget = new KeystoneWidget(null, { id: "test", label: "Test Keystone", mount: element, getValue: () => "Accepted", help: "Help text", documentRef: { getElementById: () => ({ focus() { focused++; } }) },
    onChange: value => { calls.push(value); return new Promise(resolve => { finish = resolve; }); },
  });
  const change = value => widget.change({ target: { id: widget.field.id, value } });
  const pending = change("Replacement");
  assert.equal(element.attrs["aria-busy"], "true");
  await change("Duplicate"); assert.deepEqual(calls, ["Replacement"]);
  finish({ ok: false, reason: "cancelled" }); await pending;
  assert.match(element.innerHTML, />Accepted<\/textarea>/);
  assert.doesNotMatch(element.innerHTML, /role="alert"/);
  const invalid = change("Invalid"); finish({ ok: false, errors: ["The source changed."] }); await invalid;
  assert.match(element.innerHTML, /aria-invalid="true"/);
  assert.match(element.innerHTML, /aria-describedby="test:text:help test:text:error"/);
  assert.match(element.innerHTML, /The source changed/);
  assert.equal(focused, 2);
});

test("composed fields do not register a second character owner or unregister the enclosing widget", () => {
  let registrations = 0, unregistrations = 0;
  const page = { registerWidget() { registrations++; }, unregisterWidget() { unregistrations++; } };
  const widget = new KeystoneWidget(page, { id: "composed", label: "Keystone", mount: mount(), register: false, getValue: () => "", onChange() {} });
  widget.destroy();
  assert.equal(registrations, 0);
  assert.equal(unregistrations, 0);
});
