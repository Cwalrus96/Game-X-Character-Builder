import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auditedModules = [
  "../public/js/builder/builder-class.js",
  "../public/js/builder/widgets/class-features-widget.js",
  "../public/js/builder/widgets/option-group-widget.js",
];

test("audited builder renderers do not interpolate game data through innerHTML", () => {
  for (const relativePath of auditedModules) {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\.innerHTML\s*=/, `${relativePath} must build data-derived UI with DOM text nodes.`);
  }
});
