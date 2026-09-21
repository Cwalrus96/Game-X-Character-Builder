import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx/xlsx.mjs";

import { buildArtifactDiff, parseArtifactFile } from "../scripts/game-data/artifact-diff.mjs";
import { buildGameDataArtifacts, sha256 } from "../scripts/game-data/artifact-builder.mjs";
import { createStagingRunPaths } from "../scripts/game-data/config.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { stageWorkbookSnapshot } from "../scripts/game-data/staging-run.mjs";
import { buildSchemaV4Workbook, VALID_SCHEMA_V4_RECORDS } from "./fixtures/game-data-schema-v4.mjs";

function workbookBytes(records = VALID_SCHEMA_V4_RECORDS) {
  const source = buildSchemaV4Workbook({ records });
  const workbook = XLSX.utils.book_new();
  for (const name of source.sheetNames) {
    const sheet = source.sheets[name];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows.map((row) => row.values)]),
      name,
    );
  }
  return Buffer.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

async function writeSource(root, bytes) {
  const workbookPath = path.join(root, "source.xlsx");
  const provenancePath = path.join(root, "source-provenance.json");
  const provenance = {
    provenanceVersion: 1,
    provider: "fixture",
    fileId: "fixture-workbook",
    driveVersion: "42",
    modifiedTime: "2026-08-04T10:00:00.000Z",
    fetchedAt: "2026-08-04T10:01:00.000Z",
    xlsxSha256: sha256(bytes),
  };
  await fs.writeFile(workbookPath, bytes);
  await fs.writeFile(provenancePath, `${JSON.stringify(provenance)}\n`, "utf8");
  return { workbookPath, provenancePath };
}

async function writeProduction(root) {
  const productionDirectory = path.join(root, "production");
  await fs.mkdir(productionDirectory);
  await fs.writeFile(path.join(productionDirectory, "classes.json"), "[]\n", "utf8");
  await fs.writeFile(path.join(productionDirectory, "export-report.json"), "{\"legacy\":true}\n", "utf8");
  return productionDirectory;
}

test("validated schema-v4 workbook creates a complete immutable staging run without touching production", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-staging-test-"));
  try {
    const source = await writeSource(root, workbookBytes());
    const productionDirectory = await writeProduction(root);
    const beforeProduction = await fs.readFile(path.join(productionDirectory, "classes.json"), "utf8");
    const run = createStagingRunPaths({
      runsDirectory: path.join(root, "runs"),
      now: new Date("2026-08-04T12:00:00.000Z"),
      processId: 41,
    });
    const result = await stageWorkbookSnapshot({
      ...source,
      run,
      productionDirectory,
      exportedAt: "2026-08-04T12:00:01.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(result.runtimeAcceptance.ok, true, JSON.stringify(result.runtimeAcceptance.diagnostics));
    assert.equal(result.artifactSet.files.length, 9);
    assert.deepEqual((await fs.readdir(run.artifactDirectory)).sort(), [
      "class-features.json", "class-skills.json", "classes.json", "feats.json", "game-x-data.json",
      "origins.json", "techniques.json", "weapon-bases.json", "weapon-enhancements.json",
    ]);
    for (const output of [
      run.provenancePath, run.validationReportPath, run.exportReportPath, run.diffJsonPath, run.diffMarkdownPath,
    ]) assert.equal(await fs.stat(output).then(() => true), true);
    assert.equal(await fs.readFile(path.join(productionDirectory, "classes.json"), "utf8"), beforeProduction);
    const combined = JSON.parse(await fs.readFile(path.join(run.artifactDirectory, "game-x-data.json"), "utf8"));
    assert.equal(combined.schemaVersion, 2);
    assert.equal(combined.techniques[0].techniqueKey, "stalk-prey");
    assert.equal(combined.techniques[0].techniqueName, "Stalk Prey");
    assert.equal(combined.classFeatures.ninja[0].grants[0].key, "stalk-prey");
    assert.equal(combined.sourceRevision.modelSha256, result.artifactSet.modelSha256);
    assert.equal("xlsxSha256" in combined.sourceRevision, false);
    const stagedSourceBytes = await fs.readFile(source.workbookPath);
    assert.equal(result.exportReport.source.xlsxSha256, sha256(stagedSourceBytes));
    assert.equal(result.diff.summary.removed, 1);
    await assert.rejects(stageWorkbookSnapshot({ ...source, run, productionDirectory }), /immutable/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("identical validated input produces byte-identical artifacts across distinct runs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-determinism-test-"));
  try {
    const source = await writeSource(root, workbookBytes());
    const productionDirectory = await writeProduction(root);
    const firstRun = createStagingRunPaths({ runsDirectory: path.join(root, "runs"), now: new Date("2026-08-04T12:00:00Z"), processId: 1 });
    const secondRun = createStagingRunPaths({ runsDirectory: path.join(root, "runs"), now: new Date("2026-08-04T13:00:00Z"), processId: 2 });
    const first = await stageWorkbookSnapshot({ ...source, run: firstRun, productionDirectory, exportedAt: "2026-08-04T12:00:00Z" });
    const second = await stageWorkbookSnapshot({ ...source, run: secondRun, productionDirectory, exportedAt: "2026-08-04T13:00:00Z" });
    assert.deepEqual(
      first.artifactSet.files.map(({ name, sha256: hash }) => [name, hash]),
      second.artifactSet.files.map(({ name, sha256: hash }) => [name, hash]),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("transport-specific XLSX provenance does not change runtime artifact bytes", () => {
  const adapted = adaptGameDataWorkbook(buildSchemaV4Workbook());
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"));
  const revision = {
    fileId: "fixture-workbook",
    driveVersion: "42",
    modifiedTime: "2026-08-04T10:00:00.000Z",
  };
  const first = buildGameDataArtifacts({
    model: adapted.model,
    validation,
    provenance: { ...revision, fetchedAt: "2026-08-04T10:01:00.000Z", xlsxSha256: "a".repeat(64) },
  });
  const second = buildGameDataArtifacts({
    model: adapted.model,
    validation,
    provenance: { ...revision, fetchedAt: "2026-08-04T10:02:00.000Z", xlsxSha256: "b".repeat(64) },
  });

  assert.deepEqual(
    first.files.map(({ name, sha256: hash }) => [name, hash]),
    second.files.map(({ name, sha256: hash }) => [name, hash]),
  );
  assert.deepEqual(first.combined.sourceRevision, {
    fileId: revision.fileId,
    driveVersion: revision.driveVersion,
    modifiedTime: revision.modifiedTime,
    modelSha256: first.modelSha256,
  });
});

test("validation errors stage diagnostics only and never construct runtime artifacts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-invalid-staging-test-"));
  try {
    const records = {
      ...VALID_SCHEMA_V4_RECORDS,
      Techniques: [{ ...VALID_SCHEMA_V4_RECORDS.Techniques[0], selectionMode: "manual" }],
    };
    const source = await writeSource(root, workbookBytes(records));
    const productionDirectory = await writeProduction(root);
    const run = createStagingRunPaths({ runsDirectory: path.join(root, "runs"), now: new Date("2026-08-04T12:00:00Z"), processId: 3 });
    const result = await stageWorkbookSnapshot({ ...source, run, productionDirectory });
    assert.equal(result.ok, false);
    assert.equal(result.artifactSet, null);
    assert.equal(await fs.stat(run.validationReportPath).then(() => true), true);
    await assert.rejects(fs.stat(run.artifactDirectory), /ENOENT/);
    await assert.rejects(fs.stat(run.exportReportPath), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("artifact construction refuses an unvalidated model", () => {
  assert.throws(() => buildGameDataArtifacts({ model: {}, validation: { ok: false }, provenance: {} }), /successful whole-model validation/);
});

test("artifact construction preserves recursively nested option groups", () => {
  const records = {
    ...VALID_SCHEMA_V4_RECORDS,
    ClassFeatures: [
      { classKey: "ninja", level: 1, rowType: "OPTION_GROUP", featureKey: "outer", name: "Outer", description: "Outer choice.", chooseCount: 1 },
      { classKey: "ninja", level: 1, rowType: "OPTION_GROUP", featureKey: "inner", name: "Inner", parentKey: "outer", description: "Inner choice.", chooseCount: 1 },
      { classKey: "ninja", level: 1, rowType: "OPTION", featureKey: "answer", name: "Answer", parentKey: "inner", description: "Nested answer." },
    ],
  };
  const adapted = adaptGameDataWorkbook(buildSchemaV4Workbook({ records }));
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"));
  const artifacts = buildGameDataArtifacts({ model: adapted.model, validation, provenance: {} });
  assert.equal(artifacts.combined.classFeatures.ninja[0].options[0].featureKey, "inner");
  assert.equal(artifacts.combined.classFeatures.ninja[0].options[0].options[0].featureKey, "answer");
});

test("artifact diff reports both exact field paths and stable-identity semantic changes", () => {
  const prior = parseArtifactFile("classes.json", '[{"classKey":"ninja","name":"Ninja"}]\n');
  const next = parseArtifactFile("classes.json", '[{"classKey":"ninja","name":"Shinobi"},{"classKey":"mage","name":"Mage"}]\n');
  const diff = buildArtifactDiff([next], [prior]);
  assert.equal(diff.summary.changed, 1);
  assert.deepEqual(diff.files[0].semantic.added, ["mage"]);
  assert.equal(diff.files[0].semantic.changed[0].id, "ninja");
  assert(diff.files[0].semantic.changed[0].fields.some((field) => field.path === "/name"));
  assert(diff.files[0].structural.some((field) => field.path === "/0/name"));
});

test("semantic diff explicitly bridges legacy technique names and identifies weapon profiles by composite", () => {
  const oldTechniques = parseArtifactFile("techniques.json", '[{"techniqueName":"Stalk Prey","damage":"1"}]\n');
  const newTechniques = parseArtifactFile("techniques.json", '[{"techniqueKey":"stalk-prey","techniqueName":"Stalk Prey","damage":"2"}]\n');
  const techniqueDiff = buildArtifactDiff([newTechniques], [oldTechniques]).files[0].semantic;
  assert.equal(techniqueDiff.legacyIdentityBridges, 1);
  assert.deepEqual(techniqueDiff.added, []);
  assert.deepEqual(techniqueDiff.removed, []);
  assert.equal(techniqueDiff.changed[0].id, "stalk-prey");

  const oldWeapons = parseArtifactFile("weapon-bases.json", '[{"weaponKey":"blade","profiles":[{"profileType":"basic","profileName":"Slash","rank":0,"damage":"1"}]}]\n');
  const newWeapons = parseArtifactFile("weapon-bases.json", '[{"weaponKey":"blade","profiles":[{"profileType":"basic","profileName":"Slash","rank":0,"damage":"2"}]}]\n');
  const weaponDiff = buildArtifactDiff([newWeapons], [oldWeapons]).files[0].semantic;
  assert.match(weaponDiff.identityPolicy, /weaponKey\/profileType\/profileName\/rank/);
  assert(weaponDiff.changed.some((record) => record.id === "blade/basic/Slash/0"));
});

test("semantic diff keeps separate class skill roles and conditions and identifies Traits by key", () => {
  const rows = [
    { classKey: "warrior", skillKey: "martial-arts", role: "combat-technique", whenPrimaryAttribute: "Strength", progression: "fast" },
    { classKey: "warrior", skillKey: "martial-arts", role: "combat", whenPrimaryAttribute: "Agility", progression: "slow" },
  ];
  const next = rows.map(row => ({ ...row })); next[0].progression = "medium";
  const diff = buildArtifactDiff([parseArtifactFile("class-skills.json", JSON.stringify(next))], [parseArtifactFile("class-skills.json", JSON.stringify(rows))]);
  assert.equal(diff.files[0].semantic.changed.length, 1);
  assert.equal(diff.files[0].semantic.changed[0].id, "warrior/martial-arts/combat-technique/Strength/");
  const traits = buildArtifactDiff([parseArtifactFile("traits.json", '[{"traitKey":"wings","name":"Wings"}]')], []);
  assert.deepEqual(traits.files[0].semantic.added, ["wings"]);
});
