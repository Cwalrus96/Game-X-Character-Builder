#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { publishApprovedGameData, validateReleaseApproval } from "./game-data/publisher.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const approvalPath = path.join(repositoryRoot, "contracts", "game-data-release.json");
const runsDirectory = path.join(repositoryRoot, ".staging", "game-data", "runs");
const productionDirectory = path.join(repositoryRoot, "public", "data", "game-x");
const baselinePath = path.join(repositoryRoot, "contracts", "game-data-release-baseline.json");

function usage() {
  console.log([
    "Usage: node scripts/publish-game-data.mjs --confirm <candidate-run-id>",
    "",
    "Promotes only the exact artifacts approved in contracts/game-data-release.json.",
    "It does not fetch, regenerate, edit the Sheet, or deploy Firebase targets.",
  ].join("\n"));
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}
if (args.length !== 2 || args[0] !== "--confirm" || !args[1]) {
  usage();
  process.exitCode = 1;
} else {
  try {
    const approval = validateReleaseApproval(JSON.parse(await fs.readFile(approvalPath, "utf8")));
    if (args[1] !== approval.candidateRunId) {
      throw new Error("Confirmation run ID does not match the approved release contract.");
    }
    const result = await publishApprovedGameData({ approval, runsDirectory, productionDirectory, baselinePath });
    console.log(`Published approved game-data run ${result.reviewed.candidateRunId}.`);
    console.log(`Installed ${result.snapshot.files.length} exact artifacts and updated the release baseline.`);
    for (const warning of result.cleanupWarnings) {
      console.warn(`Published successfully; backup cleanup needs attention: ${warning.path}: ${warning.message}`);
    }
  } catch (error) {
    console.error(`Game-data publish failed: ${error.message}`);
    process.exitCode = 1;
  }
}
