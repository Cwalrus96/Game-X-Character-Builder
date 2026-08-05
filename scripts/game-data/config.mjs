import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePathThroughExistingAncestor } from "../game-data-export-policy.mjs";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_SOURCE_CONFIG_PATH = path.join(
  REPOSITORY_ROOT,
  "contracts",
  "game-data-source.json",
);
export const DEFAULT_SOURCE_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  ".staging",
  "game-data",
  "source",
);
export const DEFAULT_STAGING_RUNS_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  ".staging",
  "game-data",
  "runs",
);

const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function requireNonemptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Game-data source config field "${field}" must be a nonempty string.`);
  }
  return value.trim();
}

function requireSafeFileName(value, field) {
  const fileName = requireNonemptyString(value, field);
  if (path.basename(fileName) !== fileName || fileName === "." || fileName === "..") {
    throw new Error(`Game-data source config field "${field}" must be a plain file name.`);
  }
  return fileName;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Game-data source config field "${field}" must be a positive integer.`);
  }
  return value;
}

function requireUniqueSheetNames(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Game-data source config field "requiredSheets" must be a nonempty array.');
  }
  const sheetNames = value.map((sheetName, index) => (
    requireNonemptyString(sheetName, `requiredSheets[${index}]`)
  ));
  if (new Set(sheetNames).size !== sheetNames.length) {
    throw new Error('Game-data source config field "requiredSheets" must not contain duplicates.');
  }
  return Object.freeze(sheetNames);
}

export function validateGameDataSourceConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Game-data source config must be a JSON object.");
  }

  if (value.contractVersion !== 1) {
    throw new Error(`Unsupported game-data source contract version: ${value.contractVersion}.`);
  }
  if (value.provider !== "google-drive") {
    throw new Error(`Unsupported game-data source provider: ${value.provider}.`);
  }
  const config = {
    contractVersion: value.contractVersion,
    provider: value.provider,
    fileId: requireNonemptyString(value.fileId, "fileId"),
    expectedName: requireNonemptyString(value.expectedName, "expectedName"),
    nativeMimeType: requireNonemptyString(value.nativeMimeType, "nativeMimeType"),
    exportMimeType: requireNonemptyString(value.exportMimeType, "exportMimeType"),
    sourceSchemaVersion: requirePositiveInteger(value.sourceSchemaVersion, "sourceSchemaVersion"),
    grantSyntaxVersion: requirePositiveInteger(value.grantSyntaxVersion, "grantSyntaxVersion"),
    prerequisiteSyntaxVersion: requirePositiveInteger(
      value.prerequisiteSyntaxVersion,
      "prerequisiteSyntaxVersion",
    ),
    requiredSheets: requireUniqueSheetNames(value.requiredSheets),
    workbookFileName: requireSafeFileName(value.workbookFileName, "workbookFileName"),
    provenanceFileName: requireSafeFileName(value.provenanceFileName, "provenanceFileName"),
  };

  if (config.nativeMimeType !== GOOGLE_SHEETS_MIME_TYPE) {
    throw new Error(`Canonical source must be a native Google Sheet (${GOOGLE_SHEETS_MIME_TYPE}).`);
  }
  if (config.exportMimeType !== XLSX_MIME_TYPE) {
    throw new Error(`Canonical source export must use XLSX (${XLSX_MIME_TYPE}).`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(config.fileId)) {
    throw new Error("Game-data source fileId contains unsupported characters.");
  }

  return Object.freeze(config);
}

export function readGameDataSourceConfig(configPath = DEFAULT_SOURCE_CONFIG_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read game-data source config: ${error.message}`, { cause: error });
  }
  return validateGameDataSourceConfig(parsed);
}

export function getDefaultSourcePaths(config, sourceDirectory = DEFAULT_SOURCE_DIRECTORY) {
  return Object.freeze({
    workbookPath: path.join(sourceDirectory, config.workbookFileName),
    provenancePath: path.join(sourceDirectory, config.provenanceFileName),
  });
}

export function createStagingRunPaths({
  runsDirectory = DEFAULT_STAGING_RUNS_DIRECTORY,
  now = new Date(),
  processId = process.pid,
} = {}) {
  const timestamp = now instanceof Date ? now.toISOString() : String(now || "");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("A valid staging run time is required.");
  if (!Number.isInteger(processId) || processId < 1) throw new Error("A positive staging process ID is required.");
  const runId = `${timestamp.replace(/[-:.]/g, "")}-${processId}`;
  const runDirectory = path.join(runsDirectory, runId);
  return Object.freeze({
    runId,
    runDirectory,
    artifactDirectory: path.join(runDirectory, "artifacts"),
    provenancePath: path.join(runDirectory, "source-provenance.json"),
  });
}

function isSameOrNestedResolvedPath(candidatePath, parentPath) {
  const relative = path.relative(
    resolvePathThroughExistingAncestor(parentPath),
    resolvePathThroughExistingAncestor(candidatePath),
  );
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSameOrNestedLexicalPath(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertSourceOutputPathAllowed(outputPath, {
  repositoryRoot = REPOSITORY_ROOT,
  stagingRoot = path.join(REPOSITORY_ROOT, ".staging"),
} = {}) {
  if (!outputPath) throw new Error("A source output path is required.");
  const isLexicallyInsideRepository = isSameOrNestedLexicalPath(outputPath, repositoryRoot);
  if (isLexicallyInsideRepository && !isSameOrNestedLexicalPath(outputPath, stagingRoot)) {
    throw new Error("Source snapshots and provenance may be written only under .staging or outside the repository.");
  }
  if (isLexicallyInsideRepository) {
    const stagingResolved = resolvePathThroughExistingAncestor(stagingRoot);
    if (path.relative(path.resolve(stagingRoot), stagingResolved) !== "") {
      throw new Error("The repository .staging directory must not be a symlink or junction.");
    }
    if (!isSameOrNestedResolvedPath(outputPath, stagingRoot)) {
      throw new Error("Source output resolves outside the repository .staging directory.");
    }
  } else if (isSameOrNestedResolvedPath(outputPath, repositoryRoot)) {
    throw new Error("An external source output path must not resolve back inside the repository.");
  }
  return outputPath;
}

export function assertDistinctSourceOutputPaths(workbookPath, provenancePath) {
  const workbookResolved = resolvePathThroughExistingAncestor(workbookPath);
  const provenanceResolved = resolvePathThroughExistingAncestor(provenancePath);
  const isSameOrNested = (candidate, parent) => {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  if (
    isSameOrNested(workbookResolved, provenanceResolved)
    || isSameOrNested(provenanceResolved, workbookResolved)
  ) {
    throw new Error("Workbook and provenance outputs must be distinct, non-nested file paths.");
  }
  for (const [label, outputPath] of [["Workbook", workbookPath], ["Provenance", provenancePath]]) {
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      throw new Error(`${label} output must be a file path, not a directory.`);
    }
  }
}
