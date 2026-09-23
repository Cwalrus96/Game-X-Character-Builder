import assert from "node:assert/strict";
import test from "node:test";
import { OriginWidget } from "../public/js/builder/widgets/origin-widget.js";
import { createTraitGrantWidget } from "../public/js/builder/widgets/trait-widget.js";
import { traitData, traitCharacter } from "./fixtures/traits.mjs";

function element() {
  return { innerHTML: "", children: [], dataset: {},
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
    append(child) { this.children.push(child); }, appendChild(child) { this.append(child); },
    querySelector() { return null; },
  };
}

test("Origin Traits mount at their own feature and disappear when a new Origin has no grants", (t) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: element };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const gameData = traitData(), character = traitCharacter();
  const plain = { ...gameData.origins[0], originKey: "plain", name: "Plain Origin", features: [] };
  gameData.origins.push(plain);
  const before = structuredClone(character);
  const widgets = new Map();
  const page = {
    getCharacter: () => character,
    registerWidget(widget) { widgets.set(widget.id, widget); },
    unregisterWidget(widget) { widgets.delete(widget.id); },
    clearWidgets({ scope }) {
      for (const [id, widget] of widgets) if (widget.scope === scope) { widget.destroy({ unregister: false }); widgets.delete(id); }
    },
  };
  const elements = Object.fromEntries(["originSelect", "originKeystone", "originSummary", "originDetails", "originStatusHint"].map((name) => [name, element()]));
  const featureMount = element();
  elements.originDetails.querySelector = (selector) => selector === '[data-origin-traits="0"]' ? featureMount : null;
  const expandedChoices = new Set();
  const originWidget = new OriginWidget(page, { gameData, elements,
    renderTraitGrants: (entry, scope) => createTraitGrantWidget(page, { entry, scope, gameData, expandedChoices })?.element,
  });
  assert.equal(featureMount.children.length, 1);
  assert.equal(elements.originSummary.children.length, 0, "the feature grant must not appear in an Origin-wide summary");
  const traitWidget = widgets.get("traits:origin-feature:test-origin:adaptation");
  assert.ok(traitWidget);
  assert.match(traitWidget.element.innerHTML, /value="wings" selected>wings<\/option>/);
  assert.doesNotMatch(traitWidget.element.innerHTML, /value="advanced"|value="unfinished"/);
  assert.deepEqual(character, before);
  character.builder.originKey = "plain";
  originWidget.applyReconciledState(character);
  assert.equal(widgets.size, 1, "only the Origin widget survives removal of its granting feature");
  assert.equal(traitWidget.element.innerHTML, "");
  assert.equal(elements.originDetails.innerHTML.includes("data-origin-traits"), false);
  originWidget.destroy();
  assert.equal(widgets.size, 0);
});

test("a future Origin Trait feature and a reference-only feature do not create active choice widgets", () => {
  const gameData = traitData(), character = traitCharacter();
  const feature = gameData.origins[0].features[0];
  const page = { getCharacter: () => character };
  feature.level = 5;
  assert.equal(createTraitGrantWidget(page, { entry: feature, gameData }), null);
  assert.equal(createTraitGrantWidget(page, { entry: { ...feature, level: 1, grants: [], traitKeys: ["wings"] }, gameData }), null);
});
