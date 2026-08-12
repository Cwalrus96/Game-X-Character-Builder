import assert from "node:assert/strict";
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
import { isGameDataRecordSelectable } from "../public/js/core/selection-rules.js";
import { VALID_PREREQUISITE_TYPES } from "../public/js/core/prerequisites.js";

test("runtime grant and prerequisite enums are derived from the shared typed registries", () => {
  assert.deepEqual(Array.from(VALID_GRANT_TYPES), Array.from(SUPPORTED_GRANT_TYPES));
  assert.deepEqual(Array.from(VALID_PREREQUISITE_TYPES), Array.from(RUNTIME_PREREQUISITE_TYPES));
  assert(SUPPORTED_STRUCTURED_PREREQUISITE_TYPES.every((type) => VALID_PREREQUISITE_TYPES.has(type)));
  assert(SUPPORTED_GRANT_FIELDS.includes("resourceKey"));
  assert(SUPPORTED_PREREQUISITE_FIELDS.includes("minCount"));
});

test("all observed schema-v4 expression constructs are represented rather than unsupported", () => {
  assert.deepEqual(OBSERVED_UNSUPPORTED_GRANT_TYPES, []);
  assert.deepEqual(OBSERVED_UNSUPPORTED_GRANT_FIELDS, []);
  assert.deepEqual(OBSERVED_UNSUPPORTED_PREREQUISITE_TYPES, []);
  assert.deepEqual(OBSERVED_UNSUPPORTED_PREREQUISITE_FIELDS, []);
});

test("selection policy excludes drafts and distinguishes normal from grant-owned choices", () => {
  assert.equal(isGameDataRecordSelectable({ selectionMode: "selectable", selectable: true }), true);
  assert.equal(isGameDataRecordSelectable({ selectionMode: "granted-only", selectable: false }), false);
  assert.equal(isGameDataRecordSelectable(
    { selectionMode: "granted-only", selectable: false },
    { allowGrantedOnly: true },
  ), true);
  assert.equal(isGameDataRecordSelectable(
    { selectionMode: "draft", selectable: false },
    { allowGrantedOnly: true },
  ), false);
  assert.equal(isGameDataRecordSelectable({ techniqueName: "Legacy reviewed record" }), true);
  assert.equal(isGameDataRecordSelectable({ selectionMode: "unexpected", selectable: true }), false);
});
