import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReleaseArtifactSnapshot,
  compareReleaseArtifactSnapshot,
} from "../scripts/game-data-release-baseline.mjs";
import { buildGameDataArtifacts, canonicalJson } from "../scripts/game-data/artifact-builder.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";
import {
  inspectApprovedStagingRun,
  publishApprovedGameData,
  validateReleaseApproval,
} from "../scripts/game-data/publisher.mjs";
import { validateRuntimeArtifacts } from "../scripts/game-data/runtime-artifact-acceptance.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { buildSchemaV4Workbook } from "./fixtures/game-data-schema-v4.mjs";

const RUN_ID = "20260809T022801911Z-51956";
const PROVENANCE = Object.freeze({
  provenanceVersion: 1,
  provider: "fixture",
  fileId: "fixture-workbook",
  driveVersion: "647",
  modifiedTime: "2026-08-09T02:27:03.310Z",
  fetchedAt: "2026-08-09T02:28:06.574Z",
  xlsxSha256: "a".repeat(64),
});

async function fixtureRelease(root) {
  const adapted = adaptGameDataWorkbook(buildSchemaV4Workbook());
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true);
  const artifactSet = buildGameDataArtifacts({ model: adapted.model, validation, provenance: PROVENANCE });
  const runtimeLoadAcceptance = validateRuntimeArtifacts(artifactSet);
  assert.equal(runtimeLoadAcceptance.ok, true);
  const runsDirectory = path.join(root, "runs");
  const runDirectory = path.join(runsDirectory, RUN_ID);
  const artifactDirectory = path.join(runDirectory, "artifacts");
  await fsp.mkdir(artifactDirectory, { recursive: true });
  for (const file of artifactSet.files) await fsp.writeFile(path.join(artifactDirectory, file.name), file.text, "utf8");
  const validationReport = {
    sourceSchemaVersion: 4,
    runtimeArtifactSchemaVersion: 2,
    modelSha256: artifactSet.modelSha256,
    source: PROVENANCE,
    validation: { ok: true, counts: { errors: 0, warnings: 0 }, diagnostics: [] },
    runtimeLoadAcceptance,
  };
  const exportReport = {
    sourceSchemaVersion: 4,
    runtimeArtifactSchemaVersion: 2,
    modelSha256: artifactSet.modelSha256,
    source: PROVENANCE,
    runtimeLoadAcceptance,
    artifacts: artifactSet.files.map(({ name, byteLength, sha256 }) => ({ name, byteLength, sha256 })),
  };
  await Promise.all([
    fsp.writeFile(path.join(runDirectory, "validation-report.json"), canonicalJson(validationReport), "utf8"),
    fsp.writeFile(path.join(runDirectory, "export-report.json"), canonicalJson(exportReport), "utf8"),
    fsp.writeFile(path.join(runDirectory, "source-provenance.json"), canonicalJson(PROVENANCE), "utf8"),
    fsp.writeFile(path.join(runDirectory, "artifact-diff.json"), canonicalJson({ summary: { added: 1, removed: 1, changed: 8, unchanged: 0 }, files: [] }), "utf8"),
  ]);
  const approval = validateReleaseApproval({
    approvalVersion: 1,
    candidateRunId: RUN_ID,
    approvedOn: "2026-08-09",
    source: {
      fileId: PROVENANCE.fileId,
      driveVersion: PROVENANCE.driveVersion,
      modifiedTime: PROVENANCE.modifiedTime,
      xlsxSha256: PROVENANCE.xlsxSha256,
      modelSha256: artifactSet.modelSha256,
      sourceSchemaVersion: 4,
      runtimeArtifactSchemaVersion: 2,
    },
    artifacts: artifactSet.files.map(({ name, byteLength, sha256 }) => ({ name, byteLength, sha256 })),
    review: {
      diffReviewApproved: true,
      publishApproved: true,
      approvalContext: "Fixture approval.",
    },
  });
  return { approval, artifactSet, runsDirectory };
}

async function legacyProduction(root) {
  const productionDirectory = path.join(root, "game-x");
  await fsp.mkdir(productionDirectory);
  await fsp.writeFile(path.join(productionDirectory, "classes.json"), "[]\n", "utf8");
  await fsp.writeFile(path.join(productionDirectory, "export-report.json"), "{\"legacy\":true}\n", "utf8");
  await fsp.writeFile(path.join(productionDirectory, "game-x-data.json"), canonicalJson({ schemaVersion: 1, classes: [] }), "utf8");
  const baselinePath = path.join(root, "baseline.json");
  const baseline = { schemaVersion: 1, capturedOn: "2026-08-03", releaseArtifact: buildReleaseArtifactSnapshot(productionDirectory) };
  await fsp.writeFile(baselinePath, canonicalJson(baseline), "utf8");
  return { productionDirectory, baselinePath, baseline };
}

test("publish gate requires explicit dual approval and exact candidate bytes", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-inspect-"));
  try {
    const fixture = await fixtureRelease(root);
    const inspected = await inspectApprovedStagingRun(fixture);
    assert.equal(inspected.files.length, 9);

    const rejected = { ...fixture.approval, review: { ...fixture.approval.review, publishApproved: false } };
    assert.throws(() => validateReleaseApproval(rejected), /explicitly approve both/);

    await fsp.writeFile(path.join(fixture.runsDirectory, RUN_ID, "artifacts", "classes.json"), "[]\n", "utf8");
    await assert.rejects(inspectApprovedStagingRun(fixture), /does not match its reviewed bytes/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("publisher promotes only reviewed bytes, removes stale artifacts, and refreshes baseline", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-success-"));
  try {
    const fixture = await fixtureRelease(root);
    const production = await legacyProduction(root);
    const result = await publishApprovedGameData({ ...fixture, ...production });
    assert.deepEqual((await fsp.readdir(production.productionDirectory)).sort(), fixture.artifactSet.files.map((file) => file.name).sort());
    assert.equal(fs.existsSync(path.join(production.productionDirectory, "export-report.json")), false);
    assert.equal(fs.existsSync(path.join(production.productionDirectory, "class-skills.json")), true);
    assert.equal(result.baseline.schemaVersion, 2);
    assert.equal(result.baseline.release.candidateRunId, RUN_ID);
    assert.equal(compareReleaseArtifactSnapshot(result.baseline.releaseArtifact, buildReleaseArtifactSnapshot(production.productionDirectory)).length, 0);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("publisher restores production and baseline when the atomic install fails", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-rollback-"));
  try {
    const fixture = await fixtureRelease(root);
    const production = await legacyProduction(root);
    const beforeFiles = Object.fromEntries(await Promise.all((await fsp.readdir(production.productionDirectory)).map(async (name) => [
      name,
      await fsp.readFile(path.join(production.productionDirectory, name), "utf8"),
    ])));
    const beforeBaseline = await fsp.readFile(production.baselinePath, "utf8");
    let renameCount = 0;
    const failingFileSystem = new Proxy(fsp, {
      get(target, property) {
        if (property !== "rename") return Reflect.get(target, property);
        return async (...args) => {
          renameCount += 1;
          if (renameCount === 4) throw new Error("injected baseline install failure");
          return target.rename(...args);
        };
      },
    });
    await assert.rejects(
      publishApprovedGameData({ ...fixture, ...production, fileSystem: failingFileSystem }),
      /injected baseline install failure/,
    );
    assert.deepEqual((await fsp.readdir(production.productionDirectory)).sort(), Object.keys(beforeFiles).sort());
    for (const [name, text] of Object.entries(beforeFiles)) {
      assert.equal(await fsp.readFile(path.join(production.productionDirectory, name), "utf8"), text);
    }
    assert.equal(await fsp.readFile(production.baselinePath, "utf8"), beforeBaseline);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
