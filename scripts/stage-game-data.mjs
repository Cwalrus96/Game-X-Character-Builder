#!/usr/bin/env node

import { spawn } from "node:child_process";
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
import { stageWorkbookSnapshot } from "./game-data/staging-run.mjs";

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
  runStaging = stageWorkbookSnapshot,
} = {}) {
  const { workbookPath, provenancePath } = sourcePaths || getDefaultSourcePaths(config);
  const run = stagingRun || createStagingRunPaths();
  assertSourceOutputPathAllowed(run.artifactDirectory);
  assertSourceOutputPathAllowed(run.provenancePath);
  assertSourceOutputPathAllowed(run.validationReportPath);
  assertSourceOutputPathAllowed(run.exportReportPath);
  assertSourceOutputPathAllowed(run.diffJsonPath);
  assertSourceOutputPathAllowed(run.diffMarkdownPath);
  assertGameDataExportTargetAllowed(run.artifactDirectory);

  const fetchCode = await runChild([path.join("scripts", "fetch-game-data-source.mjs")]);
  if (fetchCode !== 0) {
    return fetchCode;
  }

  console.log("Validating the canonical model and constructing deterministic ignored staging output.");
  console.log(`Staging run: ${path.relative(REPOSITORY_ROOT, run.runDirectory)}`);
  const result = await runStaging({
    workbookPath,
    provenancePath,
    run,
    productionDirectory: path.join(REPOSITORY_ROOT, "public", "data", "game-x"),
  });
  if (!result.ok) {
    console.error(`Staging stopped after validation; see ${path.relative(REPOSITORY_ROOT, run.validationReportPath)}.`);
    return 1;
  }
  console.log(`Staged ${result.artifactSet.files.length} artifacts; production remains untouched.`);
  console.log(`Diff: ${path.relative(REPOSITORY_ROOT, run.diffMarkdownPath)}`);
  return 0;
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
