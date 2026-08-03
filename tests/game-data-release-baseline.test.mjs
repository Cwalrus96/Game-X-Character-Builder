import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleaseArtifactSnapshot,
  verifyReleaseArtifactBaseline,
} from "../scripts/game-data-release-baseline.mjs";
import { PRODUCTION_EXPORT_STATUS } from "../scripts/game-data-export-policy.mjs";

test("checked-in game-data artifacts match the Work Package B baseline", () => {
  const result = verifyReleaseArtifactBaseline();
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.actual, buildReleaseArtifactSnapshot());
  assert.equal(result.baseline.sourceWorkbook.fileId, "1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI");
  assert.equal(result.baseline.sourceWorkbook.modifiedTime, "2026-07-31T21:50:31.191Z");
});

test("production export remains frozen while the baseline is being repaired", () => {
  assert.equal(PRODUCTION_EXPORT_STATUS, "frozen");
});
