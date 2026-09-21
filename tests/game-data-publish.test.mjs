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
import { buildGameDataArtifacts, canonicalJson, sha256 } from "../scripts/game-data/artifact-builder.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";
import {
  inspectApprovedStagingRun,
  publishApprovedGameData,
  validateReleaseApproval,
} from "../scripts/game-data/publisher.mjs";
import { validateRuntimeArtifacts } from "../scripts/game-data/runtime-artifact-acceptance.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { buildSchemaV4Workbook } from "./fixtures/game-data-schema-v4.mjs";
import { buildSchemaV5Workbook } from "./fixtures/game-data-schema-v5.mjs";

const RUN_ID = "20260809T022801911Z-51956";
const V3_RUN_ID = "20260921T183411964Z-31844";
const PROVENANCE = Object.freeze({
  provenanceVersion: 1,
  provider: "fixture",
  fileId: "fixture-workbook",
  driveVersion: "647",
  modifiedTime: "2026-08-09T02:27:03.310Z",
  fetchedAt: "2026-08-09T02:28:06.574Z",
  xlsxSha256: "a".repeat(64),
});

async function fixtureRelease(root, { schemaVersion = 2 } = {}) {
  const sourceSchemaVersion = schemaVersion === 3 ? 5 : 4;
  const runId = schemaVersion === 3 ? V3_RUN_ID : RUN_ID;
  const provenance = { ...PROVENANCE, ...(schemaVersion === 3 ? { driveVersion: null } : {}) };
  const adapted = adaptGameDataWorkbook(schemaVersion === 3 ? buildSchemaV5Workbook() : buildSchemaV4Workbook());
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true);
  const artifactSet = buildGameDataArtifacts({ model: adapted.model, validation, provenance });
  const runtimeLoadAcceptance = validateRuntimeArtifacts(artifactSet);
  assert.equal(runtimeLoadAcceptance.ok, true);
  const runsDirectory = path.join(root, "runs");
  const runDirectory = path.join(runsDirectory, runId);
  const artifactDirectory = path.join(runDirectory, "artifacts");
  await fsp.mkdir(artifactDirectory, { recursive: true });
  for (const file of artifactSet.files) await fsp.writeFile(path.join(artifactDirectory, file.name), file.text, "utf8");
  const validationReport = {
    sourceSchemaVersion,
    runtimeArtifactSchemaVersion: schemaVersion,
    modelSha256: artifactSet.modelSha256,
    source: provenance,
    validation: { ok: true, counts: { errors: 0, warnings: 0 }, diagnostics: [] },
    runtimeLoadAcceptance,
  };
  const exportReport = {
    sourceSchemaVersion,
    runtimeArtifactSchemaVersion: schemaVersion,
    modelSha256: artifactSet.modelSha256,
    source: provenance,
    runtimeLoadAcceptance,
    artifacts: artifactSet.files.map(({ name, byteLength, sha256 }) => ({ name, byteLength, sha256 })),
  };
  await Promise.all([
    fsp.writeFile(path.join(runDirectory, "validation-report.json"), canonicalJson(validationReport), "utf8"),
    fsp.writeFile(path.join(runDirectory, "export-report.json"), canonicalJson(exportReport), "utf8"),
    fsp.writeFile(path.join(runDirectory, "source-provenance.json"), canonicalJson(provenance), "utf8"),
    fsp.writeFile(path.join(runDirectory, "artifact-diff.json"), canonicalJson({ summary: { added: 1, removed: 1, changed: 8, unchanged: 0 }, files: [] }), "utf8"),
  ]);
  const approval = validateReleaseApproval({
    approvalVersion: 1,
    candidateRunId: runId,
    approvedOn: "2026-08-09",
    source: {
      fileId: provenance.fileId,
      driveVersion: provenance.driveVersion,
      modifiedTime: provenance.modifiedTime,
      xlsxSha256: provenance.xlsxSha256,
      modelSha256: artifactSet.modelSha256,
      sourceSchemaVersion,
      runtimeArtifactSchemaVersion: schemaVersion,
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

test("schema-v3 approval requires its exact ten files, supported version pair, and explicit provenance", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-v3-gates-"));
  try {
    const fixture = await fixtureRelease(root, { schemaVersion: 3 });
    assert.equal((await inspectApprovedStagingRun(fixture)).files.length, 10);
    assert.equal(fixture.approval.source.driveVersion, null);
    for (const gate of ["diffReviewApproved", "publishApproved"]) {
      assert.throws(() => validateReleaseApproval({ ...fixture.approval, review: { ...fixture.approval.review, [gate]: false } }), /explicitly approve both/);
    }
    for (const source of [
      { sourceSchemaVersion: 4, runtimeArtifactSchemaVersion: 3 },
      { sourceSchemaVersion: 5, runtimeArtifactSchemaVersion: 2 },
      { sourceSchemaVersion: 6, runtimeArtifactSchemaVersion: 3 },
    ]) assert.throws(() => validateReleaseApproval({ ...fixture.approval, source: { ...fixture.approval.source, ...source } }), /supported source\/runtime pair/);
    for (const driveVersion of [undefined, "", "  "]) {
      assert.throws(() => validateReleaseApproval({ ...fixture.approval, source: { ...fixture.approval.source, driveVersion } }), /source.driveVersion/);
    }
    const old = await fixtureRelease(root);
    assert.throws(() => validateReleaseApproval({ ...old.approval, source: { ...old.approval.source, driveVersion: null } }), /source.driveVersion/);
    assert.throws(() => validateReleaseApproval({ ...fixture.approval, artifacts: fixture.approval.artifacts.filter(file => file.name !== "traits.json") }), /exactly the 10/);
    assert.throws(() => validateReleaseApproval({ ...old.approval, artifacts: fixture.approval.artifacts }), /exactly the 9/);
    assert.throws(() => validateReleaseApproval({ ...fixture.approval, artifacts: [...fixture.approval.artifacts, fixture.approval.artifacts[0]] }), /must be unique/);
    await fsp.writeFile(path.join(fixture.runsDirectory, V3_RUN_ID, "artifacts", "traits.json"), "[]\n");
    await assert.rejects(inspectApprovedStagingRun(fixture), /does not match its reviewed bytes: traits.json/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("staged schema-v3 reports and directory cannot substitute, omit, or add approved evidence", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-v3-evidence-"));
  try {
    const fixture = await fixtureRelease(root, { schemaVersion: 3 });
    const run = path.join(fixture.runsDirectory, V3_RUN_ID);
    const cases = [
      ["source-provenance.json", value => { delete value.driveVersion; }, /source.driveVersion/],
      ["source-provenance.json", value => { value.driveVersion = "null"; }, /source.driveVersion/],
      ["validation-report.json", value => { value.validation.counts.errors = 1; }, /zero-error/],
      ["validation-report.json", value => { value.runtimeArtifactSchemaVersion = 2; }, /validation report.*runtimeArtifactSchemaVersion/],
      ["export-report.json", value => { value.artifacts.pop(); }, /exactly the 10/],
      ["export-report.json", value => { value.artifacts.push(value.artifacts[0]); }, /exactly the 10/],
      ["export-report.json", value => { value.runtimeLoadAcceptance.ok = false; }, /runtime-load/],
      ["artifact-diff.json", value => { delete value.summary; }, /artifact diff summary/],
    ];
    for (const [name, mutate, expected] of cases) {
      const file = path.join(run, name);
      const original = await fsp.readFile(file, "utf8");
      const edited = JSON.parse(original);
      mutate(edited);
      await fsp.writeFile(file, canonicalJson(edited));
      await assert.rejects(inspectApprovedStagingRun(fixture), expected);
      await fsp.writeFile(file, original);
    }
    const extra = path.join(run, "artifacts", "unreviewed.json");
    await fsp.writeFile(extra, "[]\n");
    await assert.rejects(inspectApprovedStagingRun(fixture), /exactly the 10/);
    await fsp.rm(extra);
    await fsp.mkdir(path.join(run, "artifacts", "nested"));
    await assert.rejects(inspectApprovedStagingRun(fixture), /only the reviewed regular files/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("v2 to v3 promotion and explicitly approved v2 restoration retain exact file sets and baseline counts", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-versions-"));
  try {
    const old = await fixtureRelease(root);
    const next = await fixtureRelease(root, { schemaVersion: 3 });
    const production = await legacyProduction(root);
    await publishApprovedGameData({ ...old, ...production });
    const published = await publishApprovedGameData({ ...next, ...production });
    assert.equal(published.baseline.schemaVersion, 3);
    assert.equal(published.baseline.release.runtimeArtifactSchemaVersion, 3);
    assert.equal(published.baseline.sourceWorkbook.driveVersion, null);
    assert.equal(published.snapshot.files.length, 10);
    assert.equal(published.snapshot.counts.traits, next.artifactSet.combined.traits.length);
    assert.equal(compareReleaseArtifactSnapshot(published.baseline.releaseArtifact, buildReleaseArtifactSnapshot(production.productionDirectory)).length, 0);
    const restored = await publishApprovedGameData({ ...old, ...production });
    assert.equal(restored.baseline.schemaVersion, 2);
    assert.equal(restored.snapshot.files.length, 9);
    assert.equal(Object.hasOwn(restored.snapshot.counts, "traits"), false);
    assert.equal(fs.existsSync(path.join(production.productionDirectory, "traits.json")), false);
    assert.deepEqual(restored.snapshot.files, old.artifactSet.files.map(file => ({ name: file.name, bytes: file.byteLength, sha256: file.sha256 })).sort((a, b) => a.name.localeCompare(b.name)));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("reviewed combined bytes must retain the approved source revision", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-source-revision-"));
  try {
    const fixture = await fixtureRelease(root, { schemaVersion: 3 });
    const run = path.join(fixture.runsDirectory, V3_RUN_ID);
    const combinedPath = path.join(run, "artifacts", "game-x-data.json");
    const combined = JSON.parse(await fsp.readFile(combinedPath, "utf8"));
    combined.sourceRevision.fileId = "another-workbook";
    const text = canonicalJson(combined);
    const replacement = { name: "game-x-data.json", byteLength: Buffer.byteLength(text), sha256: sha256(text) };
    await fsp.writeFile(combinedPath, text);
    const reportPath = path.join(run, "export-report.json");
    const report = JSON.parse(await fsp.readFile(reportPath, "utf8"));
    report.artifacts = report.artifacts.map(file => file.name === replacement.name ? replacement : file);
    await fsp.writeFile(reportPath, canonicalJson(report));
    const approval = { ...fixture.approval, artifacts: fixture.approval.artifacts.map(file => file.name === replacement.name ? replacement : file) };
    await assert.rejects(inspectApprovedStagingRun({ ...fixture, approval }), /sourceRevision.fileId/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("backup cleanup failure preserves the verified install after its data backup was removed", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-cleanup-"));
  try {
    const fixture = await fixtureRelease(root, { schemaVersion: 3 });
    const production = await legacyProduction(root);
    const baselineBackup = `${production.baselinePath}.rollback-${V3_RUN_ID}-${process.pid}`;
    const failingFileSystem = new Proxy(fsp, { get(target, property) {
      if (property !== "rm") return Reflect.get(target, property);
      return async (file, ...args) => {
        if (file === baselineBackup) throw new Error("injected backup cleanup failure");
        return target.rm(file, ...args);
      };
    } });
    const result = await publishApprovedGameData({ ...fixture, ...production, fileSystem: failingFileSystem });
    assert.deepEqual(result.cleanupWarnings, [{ path: baselineBackup, message: "injected backup cleanup failure" }]);
    assert.equal(result.baseline.schemaVersion, 3);
    assert.equal(result.snapshot.files.length, 10);
    assert.deepEqual(buildReleaseArtifactSnapshot(production.productionDirectory), result.snapshot);
    assert.deepEqual(JSON.parse(await fsp.readFile(production.baselinePath, "utf8")), result.baseline);
    assert.equal(fs.existsSync(baselineBackup), true);
    assert.equal(fs.existsSync(path.join(root, `.game-x.rollback-${V3_RUN_ID}-${process.pid}`)), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

for (const [from, to] of [[2, 3], [3, 2]]) for (const failAt of [1, 2, 3, 4]) {
  test(`schema ${from} to ${to} failed install ${failAt} restores every artifact and baseline byte`, async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "game-x-publish-v3-rollback-"));
    try {
      const first = await fixtureRelease(root, { schemaVersion: from });
      const next = await fixtureRelease(root, { schemaVersion: to });
      const production = await legacyProduction(root);
      await publishApprovedGameData({ ...first, ...production });
      const before = buildReleaseArtifactSnapshot(production.productionDirectory);
      const baselineBytes = await fsp.readFile(production.baselinePath, "utf8");
      let renames = 0;
      const failingFileSystem = new Proxy(fsp, { get(target, property) {
        if (property !== "rename") return Reflect.get(target, property);
        return async (...args) => {
          if (++renames === failAt) throw new Error("injected cross-version install failure");
          return target.rename(...args);
        };
      } });
      await assert.rejects(publishApprovedGameData({ ...next, ...production, fileSystem: failingFileSystem }), /injected cross-version install failure/);
      assert.deepEqual(buildReleaseArtifactSnapshot(production.productionDirectory), before);
      assert.equal(await fsp.readFile(production.baselinePath, "utf8"), baselineBytes);
      assert.deepEqual((await fsp.readdir(root)).sort(), ["baseline.json", "game-x", "runs"]);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
}
