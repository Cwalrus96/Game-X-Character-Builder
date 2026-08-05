#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  REPOSITORY_ROOT,
  assertSourceOutputPathAllowed,
  createStagingRunPaths,
  getDefaultSourcePaths,
  readGameDataSourceConfig,
} from "./game-data/config.mjs";
import { assertGameDataExportTargetAllowed } from "./game-data-export-policy.mjs";

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REPOSITORY_ROOT,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Child process stopped by signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

export async function main({
  config = readGameDataSourceConfig(),
  sourcePaths,
  stagingRun,
  runChild = runNode,
  fileSystem = fs,
} = {}) {
  const { workbookPath, provenancePath } = sourcePaths || getDefaultSourcePaths(config);
  const run = stagingRun || createStagingRunPaths();
  assertSourceOutputPathAllowed(run.artifactDirectory);
  assertSourceOutputPathAllowed(run.provenancePath);
  assertGameDataExportTargetAllowed(run.artifactDirectory);

  const fetchCode = await runChild([path.join("scripts", "fetch-game-data-source.mjs")]);
  if (fetchCode !== 0) {
    return fetchCode;
  }

  await fileSystem.mkdir(run.runDirectory, { recursive: true });
  await fileSystem.copyFile(provenancePath, run.provenancePath);

  console.log("Running the current exporter against ignored staging output.");
  console.log(`Staging run: ${path.relative(REPOSITORY_ROOT, run.runDirectory)}`);
  console.log("Until WPB-EXPRESSIONS/ADAPTERS are complete, schema-v4 validation failures are expected and must not be bypassed.");
  return runChild([
    path.join("scripts", "export-game-data.mjs"),
    workbookPath,
    run.artifactDirectory,
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`Staged game-data export failed: ${error.message}`);
      process.exitCode = 1;
    });
}
