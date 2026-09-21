import fs from "node:fs/promises";
import path from "node:path";

import {
  buildReleaseArtifactSnapshot,
  compareReleaseArtifactSnapshot,
  summarizeCombinedGameData,
} from "../game-data-release-baseline.mjs";
import { resolvePathThroughExistingAncestor } from "../game-data-export-policy.mjs";
import { canonicalJson, sha256 } from "./artifact-builder.mjs";
import { validateRuntimeArtifacts } from "./runtime-artifact-acceptance.mjs";

export const RELEASE_APPROVAL_VERSION = 1;
export const EXPECTED_RUNTIME_ARTIFACTS = Object.freeze([
  "classes.json",
  "class-skills.json",
  "class-features.json",
  "feats.json",
  "techniques.json",
  "origins.json",
  "weapon-bases.json",
  "weapon-enhancements.json",
  "game-x-data.json",
]);

export function expectedRuntimeArtifacts(schemaVersion) {
  if (schemaVersion === 2) return EXPECTED_RUNTIME_ARTIFACTS;
  if (schemaVersion === 3) return Object.freeze([...EXPECTED_RUNTIME_ARTIFACTS, "traits.json"]);
  throw new Error(`Unsupported approved runtime artifact schema: ${schemaVersion}.`);
}

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Release approval field "${field}" must be an object.`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Release approval field "${field}" must be a nonempty string.`);
  }
  return value.trim();
}

function requireHash(value, field) {
  const hash = requireString(value, field);
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`Release approval field "${field}" must be a lowercase SHA-256 hash.`);
  }
  return hash;
}

function assertExactArtifactNames(artifacts, schemaVersion) {
  const actual = artifacts.map((artifact) => artifact.name).slice().sort();
  const expected = expectedRuntimeArtifacts(schemaVersion).slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Release approval must name exactly the ${expected.length} schema-v${schemaVersion} runtime artifacts.`);
  }
}

export function validateReleaseApproval(value) {
  const approval = requireObject(value, "root");
  if (approval.approvalVersion !== RELEASE_APPROVAL_VERSION) {
    throw new Error(`Unsupported release approval version: ${approval.approvalVersion}.`);
  }
  const candidateRunId = requireString(approval.candidateRunId, "candidateRunId");
  if (!/^\d{8}T\d{9}Z-\d+$/.test(candidateRunId)) {
    throw new Error("Release approval candidateRunId is not a safe immutable staging-run ID.");
  }
  const source = requireObject(approval.source, "source");
  const sourceSchemaVersion = Number(source.sourceSchemaVersion);
  const runtimeArtifactSchemaVersion = Number(source.runtimeArtifactSchemaVersion);
  if (!((sourceSchemaVersion === 4 && runtimeArtifactSchemaVersion === 2)
      || (sourceSchemaVersion === 5 && runtimeArtifactSchemaVersion === 3))) {
    throw new Error("Release approval requires the supported source/runtime pair 4/2 or 5/3.");
  }
  const driveVersion = sourceSchemaVersion === 5 && source.driveVersion === null
    ? null : requireString(source.driveVersion, "source.driveVersion");
  const review = requireObject(approval.review, "review");
  if (review.diffReviewApproved !== true || review.publishApproved !== true) {
    throw new Error("Release approval must explicitly approve both WPB-DIFF-REVIEW and WPB-PUBLISH.");
  }
  const artifacts = Array.isArray(approval.artifacts) ? approval.artifacts.map((artifact, index) => {
    const item = requireObject(artifact, `artifacts[${index}]`);
    const name = requireString(item.name, `artifacts[${index}].name`);
    if (path.basename(name) !== name || !name.endsWith(".json")) {
      throw new Error(`Release approval artifact name is unsafe: ${name}.`);
    }
    if (!Number.isInteger(item.byteLength) || item.byteLength < 1) {
      throw new Error(`Release approval artifact ${name} must have a positive byteLength.`);
    }
    return Object.freeze({
      name,
      byteLength: item.byteLength,
      sha256: requireHash(item.sha256, `artifacts[${index}].sha256`),
    });
  }) : [];
  if (new Set(artifacts.map((artifact) => artifact.name)).size !== artifacts.length) {
    throw new Error("Release approval artifact names must be unique.");
  }
  assertExactArtifactNames(artifacts, runtimeArtifactSchemaVersion);
  return Object.freeze({
    approvalVersion: approval.approvalVersion,
    candidateRunId,
    approvedOn: requireString(approval.approvedOn, "approvedOn"),
    source: Object.freeze({
      fileId: requireString(source.fileId, "source.fileId"),
      driveVersion,
      modifiedTime: requireString(source.modifiedTime, "source.modifiedTime"),
      xlsxSha256: requireHash(source.xlsxSha256, "source.xlsxSha256"),
      modelSha256: requireHash(source.modelSha256, "source.modelSha256"),
      sourceSchemaVersion,
      runtimeArtifactSchemaVersion,
    }),
    artifacts: Object.freeze(artifacts),
    review: Object.freeze({
      diffReviewApproved: true,
      publishApproved: true,
      approvalContext: requireString(review.approvalContext, "review.approvalContext"),
    }),
  });
}

function isSameOrNestedPath(candidate, parent) {
  const relative = path.relative(
    resolvePathThroughExistingAncestor(parent),
    resolvePathThroughExistingAncestor(candidate),
  );
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertExactChildPath(candidate, parent, name, label) {
  const expected = path.resolve(parent, name);
  if (path.resolve(candidate) !== expected || !isSameOrNestedPath(candidate, parent)) {
    throw new Error(`${label} must be the exact expected path under its trusted parent.`);
  }
}

async function pathExists(target, fileSystem = fs) {
  try {
    await fileSystem.access(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(target, fileSystem = fs) {
  return JSON.parse(await fileSystem.readFile(target, "utf8"));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function inspectApprovedStagingRun({ approval, runsDirectory, fileSystem = fs }) {
  const reviewed = validateReleaseApproval(approval);
  const runDirectory = path.join(runsDirectory, reviewed.candidateRunId);
  assertExactChildPath(runDirectory, runsDirectory, reviewed.candidateRunId, "Candidate run");
  const artifactDirectory = path.join(runDirectory, "artifacts");
  const [validationReport, exportReport, provenance, diff] = await Promise.all([
    readJson(path.join(runDirectory, "validation-report.json"), fileSystem),
    readJson(path.join(runDirectory, "export-report.json"), fileSystem),
    readJson(path.join(runDirectory, "source-provenance.json"), fileSystem),
    readJson(path.join(runDirectory, "artifact-diff.json"), fileSystem),
  ]);

  if (validationReport?.validation?.ok !== true || validationReport?.validation?.counts?.errors !== 0) {
    throw new Error("Approved staging run does not have zero-error structural validation.");
  }
  if (validationReport?.runtimeLoadAcceptance?.ok !== true || exportReport?.runtimeLoadAcceptance?.ok !== true) {
    throw new Error("Approved staging run did not pass runtime-load acceptance.");
  }
  if (!diff?.summary || Object.values(diff.summary).some((value) => !Number.isInteger(value))) {
    throw new Error("Approved staging run is missing its complete artifact diff summary.");
  }
  const expectedSource = reviewed.source;
  for (const field of ["fileId", "driveVersion", "modifiedTime", "xlsxSha256"]) {
    const matches = expectedSource[field] === null
      ? Object.hasOwn(provenance, field) && provenance[field] === null
      : String(provenance?.[field] ?? "") === String(expectedSource[field]);
    if (!matches) {
      throw new Error(`Approved staging provenance does not match source.${field}.`);
    }
  }
  if (exportReport?.modelSha256 !== expectedSource.modelSha256) {
    throw new Error("Approved staging model hash does not match the release approval.");
  }
  if (Number(exportReport?.sourceSchemaVersion) !== expectedSource.sourceSchemaVersion) {
    throw new Error("Approved staging source schema does not match the release approval.");
  }
  if (Number(exportReport?.runtimeArtifactSchemaVersion) !== expectedSource.runtimeArtifactSchemaVersion) {
    throw new Error("Approved staging runtime schema does not match the release approval.");
  }
  for (const [field, expected] of Object.entries({ sourceSchemaVersion: expectedSource.sourceSchemaVersion, runtimeArtifactSchemaVersion: expectedSource.runtimeArtifactSchemaVersion, modelSha256: expectedSource.modelSha256 })) {
    if (validationReport[field] !== expected) throw new Error(`Staging validation report does not match approved ${field}.`);
  }

  const stagedEntries = await fileSystem.readdir(artifactDirectory, { withFileTypes: true });
  if (stagedEntries.some((entry) => !entry.isFile())) throw new Error("Staged artifact directory must contain only the reviewed regular files.");
  assertExactArtifactNames(stagedEntries, expectedSource.runtimeArtifactSchemaVersion);
  assertExactArtifactNames(exportReport.artifacts || [], expectedSource.runtimeArtifactSchemaVersion);

  const exportArtifacts = new Map((exportReport?.artifacts || []).map((item) => [item.name, item]));
  const files = [];
  for (const expected of reviewed.artifacts) {
    const bytes = await fileSystem.readFile(path.join(artifactDirectory, expected.name));
    const text = bytes.toString("utf8");
    const observed = { name: expected.name, byteLength: bytes.length, sha256: sha256(bytes) };
    if (!sameJson(observed, expected)) {
      throw new Error(`Approved staged artifact does not match its reviewed bytes: ${expected.name}.`);
    }
    const reported = exportArtifacts.get(expected.name);
    if (!reported || reported.byteLength !== expected.byteLength || reported.sha256 !== expected.sha256) {
      throw new Error(`Staging export report does not match the reviewed artifact: ${expected.name}.`);
    }
    files.push(Object.freeze({ ...observed, text }));
  }
  const runtimeAcceptance = validateRuntimeArtifacts({ files });
  if (!runtimeAcceptance.ok) {
    throw new Error(`Reviewed staged bytes fail fresh runtime acceptance: ${runtimeAcceptance.diagnostics.map((item) => item.message).join(" ")}`);
  }
  const combined = JSON.parse(files.find((file) => file.name === "game-x-data.json").text);
  if (combined.schemaVersion !== expectedSource.runtimeArtifactSchemaVersion || combined.sourceSchemaVersion !== expectedSource.sourceSchemaVersion) {
    throw new Error("Reviewed combined artifact schema does not match the approved source/runtime pair.");
  }
  for (const field of ["fileId", "driveVersion", "modifiedTime", "modelSha256"]) {
    if (combined.sourceRevision?.[field] !== expectedSource[field]) throw new Error(`Reviewed combined artifact sourceRevision.${field} does not match approval.`);
  }
  return Object.freeze({ reviewed, runDirectory, files: Object.freeze(files), validationReport, exportReport, provenance, diff });
}

function buildPublishedBaseline(reviewed, productionDirectory) {
  const snapshot = buildReleaseArtifactSnapshot(productionDirectory);
  return {
    schemaVersion: reviewed.source.runtimeArtifactSchemaVersion,
    capturedOn: reviewed.approvedOn,
    sourceWorkbook: {
      fileId: reviewed.source.fileId,
      title: "game-x-class-data",
      url: `https://docs.google.com/spreadsheets/d/${reviewed.source.fileId}/edit`,
      driveVersion: reviewed.source.driveVersion,
      modifiedTime: reviewed.source.modifiedTime,
      xlsxSha256: reviewed.source.xlsxSha256,
      modelSha256: reviewed.source.modelSha256,
      sourceSchemaVersion: reviewed.source.sourceSchemaVersion,
    },
    release: {
      candidateRunId: reviewed.candidateRunId,
      runtimeArtifactSchemaVersion: reviewed.source.runtimeArtifactSchemaVersion,
      approvalContext: reviewed.review.approvalContext,
    },
    releaseArtifact: snapshot,
  };
}

export async function publishApprovedGameData({
  approval,
  runsDirectory,
  productionDirectory,
  baselinePath,
  fileSystem = fs,
}) {
  const inspected = await inspectApprovedStagingRun({ approval, runsDirectory, fileSystem });
  const currentBaseline = await readJson(baselinePath, fileSystem);
  const currentSnapshot = buildReleaseArtifactSnapshot(productionDirectory);
  const drift = compareReleaseArtifactSnapshot(currentBaseline.releaseArtifact, currentSnapshot);
  if (drift.length) throw new Error("Current production artifacts do not match the pre-publish release baseline.");

  const parent = path.dirname(productionDirectory);
  assertExactChildPath(productionDirectory, parent, path.basename(productionDirectory), "Production directory");
  const suffix = `${inspected.reviewed.candidateRunId}-${process.pid}`;
  const dataTemporary = path.join(parent, `.${path.basename(productionDirectory)}.publish-${suffix}`);
  const dataBackup = path.join(parent, `.${path.basename(productionDirectory)}.rollback-${suffix}`);
  const baselineTemporary = `${baselinePath}.publish-${suffix}`;
  const baselineBackup = `${baselinePath}.rollback-${suffix}`;
  for (const target of [dataTemporary, dataBackup, baselineTemporary, baselineBackup]) {
    if (await pathExists(target, fileSystem)) throw new Error(`Publish transaction path already exists: ${target}`);
  }

  await fileSystem.mkdir(dataTemporary);
  let dataMoved = false;
  let dataInstalled = false;
  let baselineMoved = false;
  let baselineInstalled = false;
  let published;
  try {
    for (const file of inspected.files) {
      await fileSystem.writeFile(path.join(dataTemporary, file.name), file.text, "utf8");
    }
    const preparedSnapshot = buildReleaseArtifactSnapshot(dataTemporary);
    const expectedSnapshot = {
      directory: "public/data/game-x",
      files: inspected.reviewed.artifacts.map(({ name, byteLength, sha256: hash }) => ({ name, bytes: byteLength, sha256: hash })),
      counts: summarizeCombinedGameData(JSON.parse(inspected.files.find((file) => file.name === "game-x-data.json").text)),
    };
    if (compareReleaseArtifactSnapshot(expectedSnapshot, preparedSnapshot).length) {
      throw new Error("Prepared production directory differs from the approved staged artifacts.");
    }
    const nextBaseline = buildPublishedBaseline(inspected.reviewed, dataTemporary);
    await fileSystem.writeFile(baselineTemporary, canonicalJson(nextBaseline), "utf8");

    await fileSystem.rename(productionDirectory, dataBackup);
    dataMoved = true;
    await fileSystem.rename(dataTemporary, productionDirectory);
    dataInstalled = true;
    await fileSystem.rename(baselinePath, baselineBackup);
    baselineMoved = true;
    await fileSystem.rename(baselineTemporary, baselinePath);
    baselineInstalled = true;

    const publishedBaseline = await readJson(baselinePath, fileSystem);
    const publishedSnapshot = buildReleaseArtifactSnapshot(productionDirectory);
    if (compareReleaseArtifactSnapshot(publishedBaseline.releaseArtifact, publishedSnapshot).length) {
      throw new Error("Post-publish artifacts do not match the new release baseline.");
    }
    published = { reviewed: inspected.reviewed, baseline: publishedBaseline, snapshot: publishedSnapshot };
  } catch (error) {
    if (baselineInstalled) await fileSystem.rm(baselinePath, { force: true });
    if (baselineMoved) await fileSystem.rename(baselineBackup, baselinePath);
    if (dataInstalled) await fileSystem.rm(productionDirectory, { recursive: true, force: true });
    if (dataMoved) await fileSystem.rename(dataBackup, productionDirectory);
    await fileSystem.rm(dataTemporary, { recursive: true, force: true });
    await fileSystem.rm(baselineTemporary, { force: true });
    throw error;
  }

  // Both replacements are verified. Backup cleanup must not roll back an install
  // after its restore source may already have been removed.
  const cleanupWarnings = [];
  for (const [target, options] of [[dataBackup, { recursive: true, force: true }], [baselineBackup, { force: true }]]) {
    try {
      await fileSystem.rm(target, options);
    } catch (error) {
      cleanupWarnings.push(Object.freeze({ path: target, message: error.message }));
    }
  }
  return Object.freeze({ ...published, cleanupWarnings: Object.freeze(cleanupWarnings) });
}
