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
import { stageWorkbookSnapshot } from "./game-data/staging-run.mjs";
import { validateAcquiredSnapshot } from "./game-data/source-snapshot.mjs";

export function parseStageArgs(argv) {
  const options = { help: false, workbookPath: "", provenancePath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") options.help = true;
    else if (option === "--snapshot" || option === "--provenance") {
      const value = String(argv[++index] || "").trim();
      if (!value || value.startsWith("--")) throw new Error(`${option} requires a path.`);
      const field = option === "--snapshot" ? "workbookPath" : "provenancePath";
      if (options[field]) throw new Error(`${option} may be specified only once.`);
      options[field] = path.resolve(value);
    } else throw new Error(`Unknown staging option: ${option}`);
  }
  if (Boolean(options.workbookPath) !== Boolean(options.provenancePath)) {
    throw new Error("--snapshot and --provenance must be supplied together.");
  }
  return Object.freeze(options);
}

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
  argv = [],
  config = readGameDataSourceConfig(),
  sourcePaths,
  stagingRun,
  runChild = runNode,
  runStaging = stageWorkbookSnapshot,
} = {}) {
  const options = parseStageArgs(argv);
  if (options.help) {
    console.log("Usage: npm run stage:data [-- --snapshot <native-export.xlsx> --provenance <source-provenance.json>]\nWithout snapshot options, fetches the canonical Sheet through read-only ADC.\nSnapshot mode validates the supplied export's identity, versions, byte length, and hash before staging; it does not claim a fresh acquisition or restored authentication.");
    return 0;
  }
  const { workbookPath, provenancePath } = options.workbookPath ? options : sourcePaths || getDefaultSourcePaths(config);
  const run = stagingRun || createStagingRunPaths();
  assertSourceOutputPathAllowed(run.artifactDirectory);
  assertSourceOutputPathAllowed(run.provenancePath);
  assertSourceOutputPathAllowed(run.validationReportPath);
  assertSourceOutputPathAllowed(run.exportReportPath);
  assertSourceOutputPathAllowed(run.diffJsonPath);
  assertSourceOutputPathAllowed(run.diffMarkdownPath);
  assertGameDataExportTargetAllowed(run.artifactDirectory);

  let sourceSnapshot = null;
  if (options.workbookPath) {
    assertSourceOutputPathAllowed(workbookPath);
    assertSourceOutputPathAllowed(provenancePath);
    const [bytes, provenanceText] = await Promise.all([fs.readFile(workbookPath), fs.readFile(provenancePath, "utf8")]);
    const provenance = JSON.parse(provenanceText);
    validateAcquiredSnapshot(bytes, provenance, config);
    sourceSnapshot = Object.freeze({ workbookBytes: bytes, provenance });
    console.log("Verified supplied native source snapshot and provenance; no new Drive acquisition was performed.");
  } else {
    const fetchCode = await runChild([path.join("scripts", "fetch-game-data-source.mjs")]);
    if (fetchCode !== 0) return fetchCode;
  }

  console.log("Validating the canonical model and constructing deterministic ignored staging output.");
  console.log(`Staging run: ${path.relative(REPOSITORY_ROOT, run.runDirectory)}`);
  const result = await runStaging({
    workbookPath,
    provenancePath,
    sourceSnapshot,
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
  main({ argv: process.argv.slice(2) })
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`Staged game-data export failed: ${error.message}`);
      process.exitCode = 1;
    });
}
