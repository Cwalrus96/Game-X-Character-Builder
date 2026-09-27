import test from "node:test";
import assert from "node:assert/strict";
import { SingleChoiceCatalogue, MultipleChoiceCatalogue, choiceExpansionFor } from "../public/js/builder/widgets/choice-catalogue.js";
import { CatalogueWidget } from "../public/js/builder/widgets/catalogue-widget.js";

function element() {
  return { innerHTML: "", attrs: {}, events: {}, focused: 0,
    setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(key, value) { this.events[key] = value; },
    removeEventListener(key) { delete this.events[key]; }, querySelector() { return { focus: () => this.focused++ }; }, remove() {},
  };
}

const options = [{ key: "a", name: "First", contentHtml: "<p>Full first rules.</p>", referencesHtml: "<details><summary>Related rules</summary>More rules.</details>" }, { key: "b", name: "Second", contentHtml: "<p>Full second rules.</p>" }, { key: "old", name: "Old", disabled: true }];

test("single and multiple acquisition compose identical labelled rows and independent rule disclosures", () => {
  const common = { id: "choice", owner: "widget", label: "Choices", options, expandedChoices: new Set(["choice"]) };
  const single = new SingleChoiceCatalogue({ ...common, value: "a" });
  const multiple = new MultipleChoiceCatalogue({ ...common, values: ["a"] });
  assert.equal(single.row(options[0]).replace('type="radio"', 'type="checkbox"'), multiple.row(options[0]));
  assert.match(single.render(), /aria-controls="choice:control"/);
  assert.match(single.render(), /<\/label><details>/, "disclosures must not select a radio");
  assert.match(single.render(), /aria-label="First" checked/);
  assert.match(multiple.render(), /aria-label="First" checked/);
  single.toggle();
  assert.match(single.render(), /<select/);
  assert.doesNotMatch(single.render(), /Full first rules/);
  assert.equal(choiceExpansionFor({}).size, 0);
});

test("source labels containing spaces produce valid single-token accessible references", () => {
  const picker = new MultipleChoiceCatalogue({ id: "rank:1:skill:Ranged Weapons", label: "Ranged Weapons", owner: "techniques", options });
  assert.match(picker.render(), /aria-labelledby="rank%3A1%3Askill%3ARanged%20Weapons:label"/);
  assert.match(picker.render(), /id="rank%3A1%3Askill%3ARanged%20Weapons:label"/);
});

function harness({ result = { ok: false, reason: "cancelled" }, multiple = false, readOnly = false } = {}) {
  const mount = element(), calls = [], page = { widgets: new Map(), registerWidget(w) { this.widgets.set(w.id, w); }, unregisterWidget(w) { this.widgets.delete(w.id); } };
  class Picker extends CatalogueWidget {
    constructor() { super(page, { id: "owner", element: mount }); this.render(); }
    render() {
      this.beginChoices();
      mount.innerHTML = this.errorHtml() + this.renderChoice({ id: "one", label: "Pick one", options, value: "a", values: ["a"], disabled: readOnly,
        onChange: async (...args) => { calls.push(args); return await result; },
      }, { multiple });
      return mount;
    }
  }
  const widget = new Picker();
  const change = (value, checked, owner = "owner") => mount.events.change({ target: { dataset: { choiceOwner: owner, choiceId: "one" }, value, checked } });
  const toggle = () => mount.events.click({ target: { dataset: { choiceOwner: "owner", choiceToggle: "one" } } });
  return { mount, widget, change, toggle, calls, page };
}

test("read-only choices still expose rules through Expand without enabling selection", async () => {
  const h = harness({ readOnly: true });
  assert.doesNotMatch(h.mount.innerHTML, /Full first rules/);
  h.toggle();
  assert.match(h.mount.innerHTML, /Full first rules/);
  assert.match(h.mount.innerHTML, /aria-label="First" checked[^>]* disabled/);
  await h.change("b");
  assert.deepEqual(h.calls, []);
  h.toggle();
  assert.doesNotMatch(h.mount.innerHTML, /Full first rules/);
});

test("all catalogue selectors block foreign/unavailable/repeated intent and restore cancellation and focus", async () => {
  let finish;
  const h = harness({ result: new Promise(resolve => { finish = resolve; }) });
  await h.change("b", undefined, "nested-widget");
  await h.change("old"); await h.change("missing"); await h.change("a");
  assert.equal(h.calls.length, 0);
  h.toggle();
  const pending = h.change("b");
  assert.equal(h.mount.attrs["aria-busy"], "true");
  await h.change("");
  assert.equal(h.calls.length, 1);
  finish({ ok: false, reason: "cancelled" }); await pending;
  assert.match(h.mount.innerHTML, /aria-label="First" checked/);
  assert.match(h.mount.innerHTML, /aria-expanded="true"/);
  assert.doesNotMatch(h.mount.innerHTML, /role="alert"/);
  assert.ok(h.mount.focused > 0);
  h.widget.disable(); await h.change("b"); assert.equal(h.calls.length, 1);
  h.widget.destroy(); assert.equal(Object.keys(h.mount.events).length, 0);
});

test("multiple choices use the same rejected-command lifecycle without editing their selection", async () => {
  const h = harness({ result: { ok: false, errors: ["No capacity remains."] }, multiple: true });
  await h.change("b", true);
  assert.deepEqual(h.calls, [["b", true]]);
  assert.match(h.mount.innerHTML, /aria-label="First" checked/);
  assert.doesNotMatch(h.mount.innerHTML, /aria-label="Second" checked/);
  assert.match(h.mount.innerHTML, /role="alert">No capacity remains/);
  assert.equal(h.mount.attrs["aria-busy"], "false");
});

test("a rejected or throwing action cannot leave a picker busy or lose its accepted answer", async () => {
  const h = harness({ result: Promise.reject(new Error("Connection changed.")) });
  await h.change("b");
  assert.match(h.mount.innerHTML, /Connection changed/);
  assert.match(h.mount.innerHTML, /value="a" selected/);
  assert.equal(h.widget.busy, false);
});

test("rejection follows a source widget replaced during a proposal refresh", async () => {
  const h = harness();
  const replacement = harness();
  await h.widget.submitChange(async () => {
    h.widget.destroy();
    h.page.widgets.set(h.widget.id, replacement.widget);
    return { ok: false, errors: ["Choose an available option."] };
  }, { focus: current => current.focusChoice("one") });
  assert.match(replacement.mount.innerHTML, /role="alert">Choose an available option/);
  assert.ok(replacement.mount.focused > 0);
});
