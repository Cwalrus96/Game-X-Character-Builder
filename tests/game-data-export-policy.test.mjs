import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertGameDataExportTargetAllowed,
  PRODUCTION_DATA_DIRECTORY,
  PRODUCTION_EXPORT_STATUS,
} from "../scripts/game-data-export-policy.mjs";

test("production game-data exports remain frozen before Work Package B", () => {
  assert.equal(PRODUCTION_EXPORT_STATUS, "frozen");
  assert.throws(
    () => assertGameDataExportTargetAllowed(PRODUCTION_DATA_DIRECTORY),
    /Production game-data export is frozen/,
  );
  assert.throws(
    () => assertGameDataExportTargetAllowed(path.join(PRODUCTION_DATA_DIRECTORY, "nested")),
    /Production game-data export is frozen/,
  );
});

test("game-data exporter may still write to a staging directory", () => {
  assert.doesNotThrow(() => assertGameDataExportTargetAllowed(
    path.resolve(PRODUCTION_DATA_DIRECTORY, "..", "game-x-staging"),
  ));
});
