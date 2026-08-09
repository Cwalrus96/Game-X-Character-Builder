import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildReleaseArtifactSnapshot,
  verifyReleaseArtifactBaseline,
} from "../scripts/game-data-release-baseline.mjs";
import { PRODUCTION_EXPORT_STATUS } from "../scripts/game-data-export-policy.mjs";

const approvedRelease = JSON.parse(fs.readFileSync(
  new URL("../contracts/game-data-release.json", import.meta.url),
  "utf8",
));

test("checked-in game-data artifacts match the Work Package B baseline", () => {
  const result = verifyReleaseArtifactBaseline();
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.actual, buildReleaseArtifactSnapshot());
  assert.equal(result.baseline.release.candidateRunId, approvedRelease.candidateRunId);
  assert.equal(result.baseline.sourceWorkbook.fileId, approvedRelease.source.fileId);
  assert.equal(result.baseline.sourceWorkbook.modifiedTime, approvedRelease.source.modifiedTime);
  assert.equal(result.baseline.sourceWorkbook.modelSha256, approvedRelease.source.modelSha256);
  assert.equal(result.baseline.schemaVersion, approvedRelease.source.runtimeArtifactSchemaVersion);
});

test("generic production export remains frozen after reviewed publishing", () => {
  assert.equal(PRODUCTION_EXPORT_STATUS, "frozen");
});
