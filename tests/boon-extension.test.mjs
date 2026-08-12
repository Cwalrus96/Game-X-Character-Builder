import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultGraphHandlerRegistry, compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { GrantWidgetRegistry } from "../public/js/builder/widgets/grant-widget-registry.js";
import { createGrantWidgets } from "../public/js/builder/widgets/grant-widget-factory.js";
import { registerBoonWidgetExtension } from "../public/js/builder/widgets/boon-extension.js";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";

function boonGrant() {
  return {
    type: "choice",
    filterType: "boon",
    key: "guardian-angel",
    name: "Guardian Angel",
    note: "Someone watches over this hero.",
    count: 1,
  };
}

test("Boon adapter extends generic grant traversal through registries", () => {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.classFeatures.guardian[0].grants.push(boonGrant());
  const registry = createDefaultGraphHandlerRegistry();
  const graph = compileCharacterGraph({
    character: makeGraphCharacter({ classKey: "guardian", primaryAttribute: "heart", heart: 1 }),
    gameData,
    registry,
  });
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  const boon = graph.nodes.find((node) => node.type === "boon");
  assert.equal(boon.key, "guardian-angel");
  assert.equal(boon.sourceOwnerId, "class-feature:guardian:soulbound-armament");
  assert.equal(boon.storageBinding, null);
  assert.ok(graph.edges.some((edge) => edge.kind === "materializes" && edge.to === boon.id));
});

test("Boon widget mounts through the generic grant widget registry", () => {
  const documentRef = {
    createElement() {
      return { className: "", dataset: {}, innerHTML: "", remove() {} };
    },
  };
  const registry = registerBoonWidgetExtension(new GrantWidgetRegistry(), { documentRef });
  const registered = [];
  const page = { registerWidget(widget) { registered.push(widget); } };
  const widgets = createGrantWidgets({ page, entry: { name: "A Blessing", grants: [boonGrant()] }, registry });
  assert.equal(widgets.length, 1);
  assert.equal(widgets[0].id, "boon:guardian-angel");
  assert.equal(widgets[0].element.dataset.boonKey, "guardian-angel");
  assert.deepEqual(registry.describe(), ["choice"]);
  assert.equal(registered[0], widgets[0]);
});

test("Boon extension requires no Boon branch in graph traversal or page controllers", async () => {
  const graphCompiler = await readFile(new URL("../public/js/core/graph-compiler.js", import.meta.url), "utf8");
  const factory = await readFile(new URL("../public/js/builder/widgets/grant-widget-factory.js", import.meta.url), "utf8");
  const pageFiles = [
    "../public/js/builder/builder-class.js",
    "../public/js/builder/builder-origin.js",
    "../public/js/builder/builder-skills.js",
    "../public/js/builder/builder-bonds-keystones.js",
  ];
  assert.doesNotMatch(graphCompiler, /boon/i);
  assert.match(factory, /registry\?\.get/);
  for (const path of pageFiles) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /boon/i);
  }
});
