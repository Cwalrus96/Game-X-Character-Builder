import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  OBSERVED_UNSUPPORTED_GRANT_FIELDS,
  OBSERVED_UNSUPPORTED_GRANT_TYPES,
  OBSERVED_UNSUPPORTED_PREREQUISITE_FIELDS,
  OBSERVED_UNSUPPORTED_PREREQUISITE_TYPES,
  RUNTIME_PREREQUISITE_TYPES,
  SUPPORTED_GRANT_FIELDS,
  SUPPORTED_GRANT_TYPES,
  SUPPORTED_PREREQUISITE_FIELDS,
  SUPPORTED_STRUCTURED_PREREQUISITE_TYPES,
} from "../public/js/core/game-data-contract.js";
import { VALID_GRANT_TYPES } from "../public/js/core/grants.js";
import { VALID_PREREQUISITE_TYPES } from "../public/js/core/prerequisites.js";

test("runtime grant and prerequisite enums come from the shared game-data contract", () => {
  assert.deepEqual(Array.from(VALID_GRANT_TYPES), Array.from(SUPPORTED_GRANT_TYPES));
  assert.deepEqual(Array.from(VALID_PREREQUISITE_TYPES), Array.from(RUNTIME_PREREQUISITE_TYPES));
  assert(SUPPORTED_STRUCTURED_PREREQUISITE_TYPES.every((type) => VALID_PREREQUISITE_TYPES.has(type)));

  const exporter = fs.readFileSync(new URL("../scripts/export-game-data.mjs", import.meta.url), "utf8");
  assert.match(exporter, /from "\.\.\/public\/js\/core\/game-data-contract\.js"/);
  assert.doesNotMatch(exporter, /const VALID_GRANT_TYPES = new Set\(\[/);
  assert.doesNotMatch(exporter, /const VALID_PREREQUISITE_TYPES = new Set\(\[/);
});

test("live-only types and fields remain explicitly unsupported until implemented end to end", () => {
  assert.deepEqual(OBSERVED_UNSUPPORTED_GRANT_TYPES, ["familiar", "resource"]);
  assert.deepEqual(OBSERVED_UNSUPPORTED_GRANT_FIELDS, ["classKey", "level", "tag", "type"]);
  assert.deepEqual(OBSERVED_UNSUPPORTED_PREREQUISITE_TYPES, ["familiar"]);
  assert.deepEqual(OBSERVED_UNSUPPORTED_PREREQUISITE_FIELDS, ["classKey", "featKey", "minCount"]);

  assert(OBSERVED_UNSUPPORTED_GRANT_TYPES.every((type) => !SUPPORTED_GRANT_TYPES.includes(type)));
  assert(OBSERVED_UNSUPPORTED_GRANT_FIELDS.every((field) => !SUPPORTED_GRANT_FIELDS.includes(field)));
  assert(OBSERVED_UNSUPPORTED_PREREQUISITE_TYPES.every((type) => !SUPPORTED_STRUCTURED_PREREQUISITE_TYPES.includes(type)));
  assert(OBSERVED_UNSUPPORTED_PREREQUISITE_FIELDS.every((field) => !SUPPORTED_PREREQUISITE_FIELDS.includes(field)));
});
