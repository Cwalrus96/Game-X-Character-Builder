import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx/xlsx.mjs";
import { readGameDataSourceConfig, createStagingRunPaths } from "../scripts/game-data/config.mjs";
import { validateAcquiredSnapshot } from "../scripts/game-data/source-snapshot.mjs";
import { parseStageArgs, main } from "../scripts/stage-game-data.mjs";
import { stageWorkbookSnapshot } from "../scripts/game-data/staging-run.mjs";
import { buildSchemaV5Workbook } from "./fixtures/game-data-schema-v5.mjs";

function fixture(overrides = {}) {
  const config = { ...readGameDataSourceConfig(), ...overrides };
  const workbook = XLSX.utils.book_new();
  const source = buildSchemaV5Workbook();
  for (const name of config.requiredSheets) {
    const rows = name === "Metadata" ? [["key", "value"],
      ["canonicalWorkbookId", config.fileId], ["sourceSchemaVersion", config.sourceSchemaVersion],
      ["grantSyntaxVersion", config.grantSyntaxVersion], ["prerequisiteSyntaxVersion", config.prerequisiteSyntaxVersion]]
      : [source.sheets[name].headers, ...source.sheets[name].rows.map(row => row.values)];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const bytes = Buffer.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  const provenance = {
    provenanceVersion: 1, provider: config.provider, fileId: config.fileId, name: config.expectedName,
    nativeMimeType: config.nativeMimeType, exportMimeType: config.exportMimeType,
    sourceSchemaVersion: config.sourceSchemaVersion, grantSyntaxVersion: config.grantSyntaxVersion,
    prerequisiteSyntaxVersion: config.prerequisiteSyntaxVersion, driveVersion: null,
    modifiedTime: "2026-09-21T18:00:00Z", fetchedAt: "2026-09-21T18:01:00Z",
    byteLength: bytes.byteLength, xlsxSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return { config, bytes, provenance };
}

test("native snapshot staging verifies canonical identity, exact bytes, and workbook versions independently of transport", () => {
  const { config, bytes, provenance } = fixture();
  assert.deepEqual(validateAcquiredSnapshot(bytes, provenance, config), { fileId: config.fileId, xlsxSha256: provenance.xlsxSha256 });
  for (const [field, value] of Object.entries({ fileId: "another-file", byteLength: 1, xlsxSha256: "0".repeat(64), sourceSchemaVersion: 99, fetchedAt: "bad", driveVersion: undefined })) {
    assert.throws(() => validateAcquiredSnapshot(bytes, { ...provenance, [field]: value }, config), /Snapshot/i, field);
  }
  const altered = bytes.slice(); altered[altered.length - 1] ^= 1;
  assert.throws(() => validateAcquiredSnapshot(altered, provenance, config), /SHA-256/);
  const wrongVersion = fixture({ sourceSchemaVersion: 99 });
  assert.throws(() => validateAcquiredSnapshot(wrongVersion.bytes, { ...provenance, byteLength: wrongVersion.bytes.length, xlsxSha256: wrongVersion.provenance.xlsxSha256 }, config), /Metadata sourceSchemaVersion mismatch/);
});

test("snapshot CLI is explicit and cannot accidentally bypass acquisition", async () => {
  assert.equal(parseStageArgs([]).workbookPath, "");
  assert.throws(() => parseStageArgs(["--snapshot", "x.xlsx"]), /supplied together/);
  assert.throws(() => parseStageArgs(["--snapshot", "--provenance", "x.json"]), /requires a path/);
  assert.throws(() => parseStageArgs(["--skip-fetch"]), /Unknown/);
  assert.throws(() => parseStageArgs(["--snapshot", "a.xlsx", "--snapshot", "b.xlsx"]), /only once/);
  let fetched = false;
  assert.equal(await main({ argv: ["--help"], runChild: async () => { fetched = true; return 0; } }), 0);
  assert.equal(fetched, false);
});

test("snapshot CLI stages verified source files without authentication and rejects a swapped file first", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-snapshot-"));
  try {
    const { config, bytes, provenance } = fixture();
    const workbookPath = path.join(root, "source.xlsx");
    const provenancePath = path.join(root, "source.json");
    await fs.writeFile(workbookPath, bytes);
    await fs.writeFile(provenancePath, JSON.stringify(provenance));
    let fetches = 0, staged = 0;
    const options = {
      argv: ["--snapshot", workbookPath, "--provenance", provenancePath], config,
      stagingRun: createStagingRunPaths({ runsDirectory: path.join(root, "runs") }),
      runChild: async () => { fetches += 1; return 1; },
      runStaging: async received => {
        staged += 1;
        assert.equal(received.workbookPath, workbookPath);
        assert.equal(received.provenancePath, provenancePath);
        return { ok: true, artifactSet: { files: [] } };
      },
    };
    assert.equal(await main(options), 0);
    assert.equal(fetches, 0);
    assert.equal(staged, 1);
    await fs.writeFile(workbookPath, "swapped bytes");
    await assert.rejects(main(options), /byte length/);
    assert.equal(staged, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("snapshot staging consumes the verified pair even if both paths change after validation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-snapshot-race-"));
  try {
    const { config, bytes, provenance } = fixture();
    const workbookPath = path.join(root, "source.xlsx");
    const provenancePath = path.join(root, "source.json");
    await fs.writeFile(workbookPath, bytes);
    await fs.writeFile(provenancePath, JSON.stringify(provenance));
    const run = createStagingRunPaths({ runsDirectory: path.join(root, "runs") });
    let result;
    assert.equal(await main({
      argv: ["--snapshot", workbookPath, "--provenance", provenancePath], config, stagingRun: run,
      runChild: async () => { throw new Error("Snapshot mode must not fetch."); },
      runStaging: async options => {
        await fs.writeFile(workbookPath, "replaced after verification");
        await fs.writeFile(provenancePath, JSON.stringify({ ...provenance, fileId: "unvalidated-replacement" }));
        result = await stageWorkbookSnapshot(options);
        return result;
      },
    }), 0);
    assert.equal(result.ok, true);
    assert.equal(result.artifactSet.combined.sourceRevision.fileId, config.fileId);
    assert.equal(result.artifactSet.combined.techniques[0].techniqueKey, "shared-strike");
    assert.deepEqual(JSON.parse(await fs.readFile(run.provenancePath, "utf8")), provenance);
    assert.equal(result.exportReport.source.xlsxSha256, provenance.xlsxSha256);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
