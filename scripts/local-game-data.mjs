import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expectedRuntimeArtifacts } from "./game-data/publisher.mjs";
import { validateRuntimeGameData } from "../public/js/core/game-data.js";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function installLocalGameData(runDirectory, { outputDirectory = path.join(root, "public/local-review") } = {}) {
  const readJson = async (name) => JSON.parse(await fs.readFile(path.join(runDirectory, name), "utf8"));
  const [report, validation, provenance, diff, source] = await Promise.all([
    readJson("export-report.json"), readJson("validation-report.json"), readJson("source-provenance.json"), readJson("artifact-diff.json"),
    fs.readFile(path.join(root, "contracts/game-data-source.json"), "utf8").then(JSON.parse),
  ]);
  if (!validation.validation?.ok || !validation.runtimeLoadAcceptance?.ok || !report.runtimeLoadAcceptance?.ok
    || report.modelSha256 !== validation.modelSha256 || !diff
    || provenance.fileId !== source.fileId || report.source?.fileId !== provenance.fileId
    || validation.source?.xlsxSha256 !== provenance.xlsxSha256) {
    throw new Error("Local review requires a complete validated canonical-source staging run.");
  }
  const expected = expectedRuntimeArtifacts(report.runtimeArtifactSchemaVersion);
  if (report.artifacts.length !== expected.length || expected.some((name) => !report.artifacts.some((item) => item.name === name))) {
    throw new Error("Staging run is missing required runtime artifacts.");
  }
  const artifacts = await Promise.all(report.artifacts.map(async (item) => {
    const bytes = await fs.readFile(path.join(runDirectory, "artifacts", item.name));
    if (bytes.length !== item.byteLength || createHash("sha256").update(bytes).digest("hex") !== item.sha256) {
      throw new Error(`Staged artifact does not match its report: ${item.name}`);
    }
    return { name: item.name, bytes };
  }));
  const combined = JSON.parse(artifacts.find((item) => item.name === "game-x-data.json").bytes);
  const runtime = validateRuntimeGameData(combined);
  if (!runtime.ok) throw new Error(runtime.diagnostics.map((item) => item.message).join(" "));
  await fs.mkdir(outputDirectory, { recursive: true });
  // Validate the entire candidate before replacing any local review bytes.
  for (const { name, bytes } of artifacts) await fs.writeFile(path.join(outputDirectory, name), bytes);
  await fs.writeFile(path.join(outputDirectory, "review-source.json"), JSON.stringify({ run: path.basename(runDirectory), provenance }, null, 2) + "\n");
  return { artifactCount: artifacts.length, run: path.basename(runDirectory) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2];
  if (!run) throw new Error("Usage: node scripts/local-game-data.mjs <validated staging-run directory>");
  const result = await installLocalGameData(path.resolve(run));
  console.log(`Local review now uses ${result.artifactCount} verified artifacts from ${result.run}. Production data is unchanged.`);
}
