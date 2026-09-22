import assert from "node:assert/strict";
import test from "node:test";
import { FeatWidget } from "../public/js/builder/widgets/feat-widget.js";
import { OptionGroupWidget } from "../public/js/builder/widgets/option-group-widget.js";
import { checkPrerequisites } from "../public/js/core/prerequisites.js";

function element() {
  return {
    children: [], dataset: {}, style: {}, classList: { add() {} },
    textContent: "", setAttribute() {}, addEventListener() {},
    append(...children) { this.children.push(...children); },
  };
}

function textContent(node) {
  return [node.textContent, ...node.children.map(textContent)].join("\n");
}

const entry = {
  name: "Example feature", featKey: "example-feat", optionKey: "example-option",
  description: "Full feature description.",
  prerequisites: [{ type: "class", key: "ninja", level: 2 }],
};

function render(t, Widget, level, record = entry) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: element, createDocumentFragment: element };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const widget = new Widget(null, {
    feat: record,
    group: { name: "Feature options", chooseCount: 1, options: [record] },
    maxSlots: 1, showUnavailable: true,
    checkEntryPrerequisites: (option) => checkPrerequisites(option.prerequisites, {
      builder: { classKey: "ninja", level },
    }),
  });
  return textContent(widget.element);
}

for (const Widget of [FeatWidget, OptionGroupWidget]) {
  test(`${Widget.name} hides satisfied prerequisites and retains full descriptions`, (t) => {
    const text = render(t, Widget, 2);
    assert.match(text, /Full feature description/);
    assert.doesNotMatch(text, /Prerequisite:|Requires/);
  });

  test(`${Widget.name} explains unmet requirements when unavailable choices are shown`, (t) => {
    const text = render(t, Widget, 1);
    assert.match(text, /Prerequisite: Class: ninja level 2/);
    assert.match(text, /Requires/);
  });
}

test("unfinished options retain their readiness notice without repeating satisfied prerequisites", (t) => {
  const text = render(t, OptionGroupWidget, 2, {
    ...entry, expressionSyntaxVersion: 3,
    runtimeSupport: { status: "deferred", reasons: ["incomplete-content"] },
  });
  assert.match(text, /Unavailable: this option has incomplete content/);
  assert.doesNotMatch(text, /Prerequisite:/);
});
