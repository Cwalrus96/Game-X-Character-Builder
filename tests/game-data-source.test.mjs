import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as XLSX from "xlsx/xlsx.mjs";

import { main as fetchMain, parseFetchArgs } from "../scripts/fetch-game-data-source.mjs";
import {
  DEFAULT_STAGING_RUNS_DIRECTORY,
  REPOSITORY_ROOT,
  assertDistinctSourceOutputPaths,
  assertSourceOutputPathAllowed,
  createStagingRunPaths,
  getDefaultSourcePaths,
  readGameDataSourceConfig,
  validateGameDataSourceConfig,
} from "../scripts/game-data/config.mjs";
import {
  CLOUD_PLATFORM_SCOPE,
  DRIVE_READONLY_SCOPE,
  acquireGoogleDriveSource,
  assertStableSourceRevision,
  buildDriveExportUrl,
  buildDriveMetadataUrl,
  buildSourceProvenance,
  createGoogleDriveRequest,
  formatSourceAcquisitionError,
  installFilePairAtomically,
  requestWithRetry,
  validateDriveSourceMetadata,
  validateExportedWorkbook,
} from "../scripts/game-data/google-drive-source.mjs";
import { assertGameDataExportTargetAllowed } from "../scripts/game-data-export-policy.mjs";
import { main as stageMain } from "../scripts/stage-game-data.mjs";

const config = readGameDataSourceConfig();
const metadata = Object.freeze({
  id: config.fileId,
  name: config.expectedName,
  mimeType: config.nativeMimeType,
  modifiedTime: "2026-08-04T02:05:29.623Z",
  version: "98765",
  trashed: false,
  webViewLink: "https://docs.google.com/spreadsheets/d/example/edit",
  capabilities: { canDownload: true },
});

function buildWorkbookBytes({ metadataOverrides = {}, omittedSheet = "" } = {}) {
  const workbook = XLSX.utils.book_new();
  const metadataRows = [
    ["key", "value"],
    ["sourceSchemaVersion", config.sourceSchemaVersion],
    ["grantSyntaxVersion", config.grantSyntaxVersion],
    ["prerequisiteSyntaxVersion", config.prerequisiteSyntaxVersion],
    ["canonicalWorkbookId", config.fileId],
  ].map(([key, value]) => [key, Object.hasOwn(metadataOverrides, key) ? metadataOverrides[key] : value]);

  for (const sheetName of config.requiredSheets) {
    if (sheetName === omittedSheet) continue;
    const rows = sheetName === "Metadata" ? metadataRows : [["fixture"]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));
}

const xlsxBytes = buildWorkbookBytes();

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function binaryResponse(bytes, status = 200) {
  return new Response(bytes, {
    status,
    headers: { "content-type": config.exportMimeType },
  });
}

test("canonical game-data source descriptor is strict and resolves to ignored staging", () => {
  assert.equal(config.contractVersion, 1);
  assert.equal(config.provider, "google-drive");
  assert.equal(config.sourceSchemaVersion, 5);
  assert.equal(config.grantSyntaxVersion, 3);
  assert.equal(config.prerequisiteSyntaxVersion, 3);
  assert.equal(config.requiredSheets.length, 13);
  assert(config.requiredSheets.includes("Traits"));
  assert(!config.requiredSheets.includes("ClassSkills"));
  assert(!config.requiredSheets.includes("WeaponProfiles"));
  assert.equal(config.fileId, "1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI");
  const paths = getDefaultSourcePaths(config);
  assert.match(path.relative(REPOSITORY_ROOT, paths.workbookPath), /^\.staging[\\/]game-data[\\/]source/);
  assert.match(path.relative(REPOSITORY_ROOT, paths.provenancePath), /^\.staging[\\/]game-data[\\/]source/);
  const run = createStagingRunPaths({
    now: new Date("2026-08-04T12:34:56.789Z"),
    processId: 42,
  });
  assert.equal(run.runId, "20260804T123456789Z-42");
  assert.equal(path.dirname(run.runDirectory), DEFAULT_STAGING_RUNS_DIRECTORY);
  assert.equal(path.basename(run.artifactDirectory), "artifacts");
  assert.doesNotThrow(() => assertGameDataExportTargetAllowed(run.artifactDirectory));
  assert.doesNotThrow(() => assertSourceOutputPathAllowed(paths.workbookPath));
  assert.doesNotThrow(() => assertSourceOutputPathAllowed(path.join(os.tmpdir(), "game-x-source.xlsx")));
  assert.throws(
    () => assertSourceOutputPathAllowed(path.join(REPOSITORY_ROOT, "public", "data", "game-x", "game-x-data.json")),
    /only under \.staging or outside/,
  );
  assert.doesNotThrow(() => assertDistinctSourceOutputPaths(paths.workbookPath, paths.provenancePath));
  assert.throws(
    () => assertDistinctSourceOutputPaths(paths.workbookPath, paths.workbookPath),
    /distinct, non-nested/,
  );
  assert.throws(
    () => assertDistinctSourceOutputPaths(paths.workbookPath, path.join(paths.workbookPath, "nested.json")),
    /distinct, non-nested/,
  );

  assert.throws(
    () => validateGameDataSourceConfig({ ...config, sourceSchemaVersion: 0 }),
    /sourceSchemaVersion.*positive integer/,
  );
  assert.throws(
    () => validateGameDataSourceConfig({ ...config, requiredSheets: [...config.requiredSheets, "Metadata"] }),
    /must not contain duplicates/,
  );
  assert.throws(
    () => validateGameDataSourceConfig({ ...config, workbookFileName: "../source.xlsx" }),
    /plain file name/,
  );
});

test("source output guards reject staging junctions and external paths redirected into the repository", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-source-path-test-"));
  const repositoryRoot = path.join(temporaryRoot, "repository");
  const redirectedRoot = path.join(repositoryRoot, "redirected");
  const stagingRoot = path.join(repositoryRoot, ".staging");
  const externalLink = path.join(temporaryRoot, "external-link");
  try {
    await fs.mkdir(redirectedRoot, { recursive: true });
    await fs.symlink(redirectedRoot, stagingRoot, "junction");
    assert.throws(
      () => assertSourceOutputPathAllowed(path.join(stagingRoot, "source.xlsx"), {
        repositoryRoot,
        stagingRoot,
      }),
      /must not be a symlink or junction/,
    );

    await fs.symlink(redirectedRoot, externalLink, "junction");
    assert.throws(
      () => assertSourceOutputPathAllowed(path.join(externalLink, "source.xlsx"), {
        repositoryRoot,
        stagingRoot: path.join(repositoryRoot, "unused-staging"),
      }),
      /must not resolve back inside the repository/,
    );
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Drive URLs bind the fixed file ID, fields, and XLSX MIME type", () => {
  const metadataUrl = new URL(buildDriveMetadataUrl(config.fileId));
  assert.equal(metadataUrl.pathname, `/drive/v3/files/${config.fileId}`);
  assert.match(metadataUrl.searchParams.get("fields"), /modifiedTime/);
  assert.match(metadataUrl.searchParams.get("fields"), /version/);
  assert.equal(metadataUrl.searchParams.get("supportsAllDrives"), "true");

  const exportUrl = new URL(buildDriveExportUrl(config.fileId, config.exportMimeType));
  assert.equal(exportUrl.pathname, `/drive/v3/files/${config.fileId}/export`);
  assert.equal(exportUrl.searchParams.get("mimeType"), config.exportMimeType);
});

test("Drive metadata validation rejects wrong, trashed, or unavailable sources", () => {
  const normalized = validateDriveSourceMetadata(metadata, config);
  assert.equal(normalized.version, metadata.version);
  assert.equal(normalized.canDownload, true);

  assert.throws(
    () => validateDriveSourceMetadata({ ...metadata, mimeType: "text/plain" }, config),
    /MIME type mismatch/,
  );
  assert.throws(
    () => validateDriveSourceMetadata({ ...metadata, trashed: true }, config),
    /Drive trash/,
  );
  assert.throws(
    () => validateDriveSourceMetadata({ ...metadata, capabilities: { canDownload: false } }, config),
    /cannot download/,
  );
});

test("workbook validation opens XLSX and verifies required tabs and Metadata contract", () => {
  assert.equal(validateExportedWorkbook(xlsxBytes, { config }), xlsxBytes);
  assert.throws(() => validateExportedWorkbook(new Uint8Array()), /empty workbook/);
  assert.throws(
    () => validateExportedWorkbook(new Uint8Array([1, 2, 3, 4])),
    /not an XLSX/,
  );
  assert.throws(
    () => validateExportedWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])),
    /not a structurally readable XLSX/,
  );
  assert.throws(
    () => validateExportedWorkbook(buildWorkbookBytes({ omittedSheet: "Traits" }), { config }),
    /missing required sheet.*Traits/,
  );
  assert.throws(
    () => validateExportedWorkbook(buildWorkbookBytes({
      metadataOverrides: { sourceSchemaVersion: config.sourceSchemaVersion - 1 },
    }), { config }),
    /sourceSchemaVersion mismatch/,
  );
  assert.throws(
    () => validateExportedWorkbook(buildWorkbookBytes({
      metadataOverrides: { canonicalWorkbookId: "wrong-id" },
    }), { config }),
    /canonicalWorkbookId/,
  );

  const normalized = validateDriveSourceMetadata(metadata, config);
  const provenance = buildSourceProvenance({
    config,
    metadata: normalized,
    workbookBytes: xlsxBytes,
    fetchedAt: new Date("2026-08-04T12:00:00.000Z"),
  });
  assert.equal(provenance.fileId, config.fileId);
  assert.equal(provenance.driveVersion, metadata.version);
  assert.equal(provenance.sourceSchemaVersion, 5);
  assert.equal(provenance.grantSyntaxVersion, 3);
  assert.equal(provenance.prerequisiteSyntaxVersion, 3);
  assert.equal(provenance.byteLength, xlsxBytes.byteLength);
  assert.match(provenance.xlsxSha256, /^[a-f0-9]{64}$/);
});

test("source revision must remain stable across metadata/export/metadata", () => {
  const normalized = validateDriveSourceMetadata(metadata, config);
  assert.doesNotThrow(() => assertStableSourceRevision(normalized, { ...normalized }));
  assert.throws(
    () => assertStableSourceRevision(normalized, { ...normalized, version: "98766" }),
    /changed during export/,
  );
  assert.throws(
    () => assertStableSourceRevision(normalized, {
      ...normalized,
      modifiedTime: "2026-08-04T02:06:00.000Z",
    }),
    /changed during export/,
  );
});

test("Drive requests retry transient responses but not authorization failures", async () => {
  let transientCalls = 0;
  const recovered = await requestWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => {
      transientCalls += 1;
      return new Response("", { status: transientCalls < 3 ? 503 : 200 });
    },
    delay: async () => {},
  });
  assert.equal(recovered.status, 200);
  assert.equal(transientCalls, 3);

  let unauthorizedCalls = 0;
  await assert.rejects(
    requestWithRetry("https://example.invalid", {}, {
      fetchImpl: async () => {
        unauthorizedCalls += 1;
        return new Response("", { status: 403 });
      },
      delay: async () => {},
    }),
    /HTTP 403/,
  );
  assert.equal(unauthorizedCalls, 1);
});

test("credential paths inside the repository are rejected before authentication", async () => {
  let authConstructed = false;
  await assert.rejects(
    createGoogleDriveRequest({
      repositoryRoot: REPOSITORY_ROOT,
      env: { GOOGLE_APPLICATION_CREDENTIALS: path.join(REPOSITORY_ROOT, "secret.json") },
      googleAuthFactory: () => {
        authConstructed = true;
        return {};
      },
    }),
    /inside the repository/,
  );
  assert.equal(authConstructed, false);
});

test("service-account impersonation keeps source and target scopes separate", async () => {
  let authOptions;
  let impersonationOptions;
  const sourceClient = { getRequestHeaders: async () => ({}) };
  const targetClient = { getRequestHeaders: async () => ({ authorization: "Bearer test" }) };
  const request = await createGoogleDriveRequest({
    repositoryRoot: REPOSITORY_ROOT,
    env: { GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT: "sheet-reader@example.iam.gserviceaccount.com" },
    googleAuthFactory: (options) => {
      authOptions = options;
      return { getClient: async () => sourceClient };
    },
    impersonatedFactory: (options) => {
      impersonationOptions = options;
      return targetClient;
    },
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.get("authorization"), "Bearer test");
      assert.equal(Object.hasOwn(options, "operation"), false);
      return new Response("", { status: 200 });
    },
  });

  assert.deepEqual(authOptions.scopes, [CLOUD_PLATFORM_SCOPE]);
  assert.equal(impersonationOptions.sourceClient, sourceClient);
  assert.deepEqual(impersonationOptions.targetScopes, [DRIVE_READONLY_SCOPE]);
  assert.equal(impersonationOptions.lifetime, 900);
  const response = await request("https://example.invalid");
  assert.equal(response.status, 200);
});

test("acquisition writes only a validated stable workbook and provenance", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-source-test-"));
  const workbookPath = path.join(temporaryRoot, "source.xlsx");
  const provenancePath = path.join(temporaryRoot, "source-provenance.json");
  const responses = [jsonResponse(metadata), binaryResponse(xlsxBytes), jsonResponse(metadata)];
  let index = 0;

  try {
    await fs.writeFile(workbookPath, "old workbook", "utf8");
    await fs.writeFile(provenancePath, "{\"old\":true}\n", "utf8");
    const result = await acquireGoogleDriveSource({
      config,
      request: async () => responses[index++],
      workbookPath,
      provenancePath,
      now: () => new Date("2026-08-04T12:00:00.000Z"),
    });
    assert.deepEqual(new Uint8Array(await fs.readFile(workbookPath)), xlsxBytes);
    const writtenProvenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
    assert.deepEqual(writtenProvenance, result.provenance);
    assert.equal(index, 3);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("a source revision change preserves the previous snapshot pair", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-source-change-test-"));
  const workbookPath = path.join(temporaryRoot, "source.xlsx");
  const provenancePath = path.join(temporaryRoot, "source-provenance.json");
  const changed = { ...metadata, version: "98766", modifiedTime: "2026-08-04T02:06:00.000Z" };
  const responses = [jsonResponse(metadata), binaryResponse(xlsxBytes), jsonResponse(changed)];
  let index = 0;

  try {
    await fs.writeFile(workbookPath, "previous workbook", "utf8");
    await fs.writeFile(provenancePath, "{\"previous\":true}\n", "utf8");
    await assert.rejects(
      acquireGoogleDriveSource({
        config,
        request: async () => responses[index++],
        workbookPath,
        provenancePath,
      }),
      /changed during export/,
    );
    assert.equal(await fs.readFile(workbookPath, "utf8"), "previous workbook");
    assert.equal(await fs.readFile(provenancePath, "utf8"), "{\"previous\":true}\n");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("paired installation rolls back both prior files if the second install fails", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-source-rollback-test-"));
  const firstTarget = path.join(temporaryRoot, "source.xlsx");
  const secondTarget = path.join(temporaryRoot, "source.json");
  const firstTemp = path.join(temporaryRoot, "source.xlsx.tmp");
  const missingSecondTemp = path.join(temporaryRoot, "missing-source.json.tmp");
  const replacements = [
    { target: firstTarget, temp: firstTemp, backup: `${firstTarget}.bak` },
    { target: secondTarget, temp: missingSecondTemp, backup: `${secondTarget}.bak` },
  ];
  try {
    await fs.writeFile(firstTarget, "old workbook", "utf8");
    await fs.writeFile(secondTarget, "old provenance", "utf8");
    await fs.writeFile(firstTemp, "new workbook", "utf8");
    await assert.rejects(installFilePairAtomically(replacements), /ENOENT/);
    assert.equal(await fs.readFile(firstTarget, "utf8"), "old workbook");
    assert.equal(await fs.readFile(secondTarget, "utf8"), "old provenance");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("fetch CLI arguments support safe help/check and explicit staging paths", () => {
  const help = parseFetchArgs(["--help"]);
  assert.equal(help.help, true);
  const parsed = parseFetchArgs([
    "--check",
    "--out",
    "tmp/source.xlsx",
    "--provenance",
    "tmp/source.json",
  ]);
  assert.equal(parsed.check, true);
  assert.equal(parsed.workbookPath, path.resolve("tmp/source.xlsx"));
  assert.throws(() => parseFetchArgs(["--unknown"]), /Unknown option/);
});

test("fetch CLI rejects production and overlapping outputs before authentication", async () => {
  const productionPath = path.join(REPOSITORY_ROOT, "public", "data", "game-x", "classes.json");
  await assert.rejects(fetchMain(["--out", productionPath]), /only under \.staging or outside/);
  const sharedPath = path.join(REPOSITORY_ROOT, ".staging", "game-data", "source", "shared.bin");
  await assert.rejects(
    fetchMain(["--out", sharedPath, "--provenance", sharedPath]),
    /distinct, non-nested/,
  );
});

test("stage CLI invokes fetch before the canonical-model staging boundary", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "game-x-stage-cli-test-"));
  const sourcePaths = {
    workbookPath: path.join(temporaryRoot, "source.xlsx"),
    provenancePath: path.join(temporaryRoot, "source-provenance.json"),
  };
  const stagingRun = createStagingRunPaths({
    runsDirectory: path.join(temporaryRoot, "runs"),
    now: new Date("2026-08-04T12:34:56.789Z"),
    processId: 42,
  });
  const calls = [];
  const stagingCalls = [];
  try {
    await fs.writeFile(sourcePaths.workbookPath, xlsxBytes);
    await fs.writeFile(sourcePaths.provenancePath, "{\"fixture\":true}\n", "utf8");
    const exitCode = await stageMain({
      config,
      sourcePaths,
      stagingRun,
      runChild: async (args) => {
        calls.push(args);
        return 0;
      },
      runStaging: async (options) => {
        stagingCalls.push(options);
        return { ok: true, artifactSet: { files: [{ name: "fixture.json" }] } };
      },
    });
    assert.equal(exitCode, 0);
    assert.deepEqual(calls[0], [path.join("scripts", "fetch-game-data-source.mjs")]);
    assert.equal(calls.length, 1);
    assert.equal(stagingCalls[0].workbookPath, sourcePaths.workbookPath);
    assert.equal(stagingCalls[0].provenancePath, sourcePaths.provenancePath);
    assert.equal(stagingCalls[0].run, stagingRun);

    let childCalled = false;
    await assert.rejects(stageMain({
      config,
      sourcePaths,
      stagingRun: {
        ...stagingRun,
        runDirectory: path.join(REPOSITORY_ROOT, "public", "data", "game-x"),
        artifactDirectory: path.join(REPOSITORY_ROOT, "public", "data", "game-x"),
        provenancePath: path.join(REPOSITORY_ROOT, "public", "data", "game-x", "source.json"),
      },
      runChild: async () => {
        childCalled = true;
        return 0;
      },
      runStaging: async () => {
        throw new Error("must not stage");
      },
    }), /only under \.staging or outside/);
    assert.equal(childCalled, false);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("authentication errors are concise and do not echo provider response bodies", () => {
  assert.match(
    formatSourceAcquisitionError(new Error("Google Drive request failed with HTTP 403.")),
    /lacks read-only access/,
  );
  assert.match(
    formatSourceAcquisitionError(new Error("Could not load the default credentials")),
    /not configured/,
  );
});
