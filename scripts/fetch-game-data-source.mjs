#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SOURCE_CONFIG_PATH,
  REPOSITORY_ROOT,
  assertDistinctSourceOutputPaths,
  assertSourceOutputPathAllowed,
  getDefaultSourcePaths,
  readGameDataSourceConfig,
} from "./game-data/config.mjs";
import {
  acquireGoogleDriveSource,
  checkGoogleDriveSourceAccess,
  createGoogleDriveRequest,
  formatSourceAcquisitionError,
} from "./game-data/google-drive-source.mjs";

function usage() {
  return `Fetch the canonical private Google Sheet through read-only Google Drive access.

Usage:
  node scripts/fetch-game-data-source.mjs [options]

Options:
  --check                 Verify metadata access without downloading or writing.
  --config <path>         Source descriptor (default: contracts/game-data-source.json).
  --out <path>            XLSX snapshot path (default: .staging/game-data/source/...).
  --provenance <path>     Provenance JSON path beside the snapshot.
  --help, -h              Show this help without requiring credentials.

Authentication:
  Uses Google Application Default Credentials with drive.readonly scope.
  Optionally set GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT to a dedicated service
  account that has Viewer access to the canonical Sheet. Credential files must
  remain outside this repository. See docs/data-pipeline.md.
`;
}

export function parseFetchArgs(argv) {
  const options = {
    check: false,
    help: false,
    configPath: DEFAULT_SOURCE_CONFIG_PATH,
    workbookPath: "",
    provenancePath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || "");
    if (value === "--check") options.check = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--config" || value === "--out" || value === "--provenance") {
      const next = String(argv[index + 1] || "").trim();
      if (!next) throw new Error(`${value} requires a path.`);
      index += 1;
      if (value === "--config") options.configPath = path.resolve(next);
      if (value === "--out") options.workbookPath = path.resolve(next);
      if (value === "--provenance") options.provenancePath = path.resolve(next);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  return Object.freeze(options);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseFetchArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const config = readGameDataSourceConfig(options.configPath);
  const defaults = getDefaultSourcePaths(config);
  const workbookPath = options.workbookPath || defaults.workbookPath;
  const provenancePath = options.provenancePath || defaults.provenancePath;
  assertSourceOutputPathAllowed(workbookPath);
  assertSourceOutputPathAllowed(provenancePath);
  assertDistinctSourceOutputPaths(workbookPath, provenancePath);
  const request = await createGoogleDriveRequest({ repositoryRoot: REPOSITORY_ROOT });

  if (options.check) {
    const metadata = await checkGoogleDriveSourceAccess({ config, request });
    console.log(`Canonical Sheet access verified (version ${metadata.version}, modified ${metadata.modifiedTime}).`);
    return;
  }

  const result = await acquireGoogleDriveSource({
    config,
    request,
    workbookPath,
    provenancePath,
  });
  console.log(`Canonical Sheet fetched to ${path.relative(REPOSITORY_ROOT, result.workbookPath)}.`);
  console.log(`Source SHA-256: ${result.provenance.xlsxSha256}`);
  console.log(`Provenance: ${path.relative(REPOSITORY_ROOT, result.provenancePath)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`Game-data source fetch failed: ${formatSourceAcquisitionError(error)}`);
    process.exitCode = 1;
  });
}
