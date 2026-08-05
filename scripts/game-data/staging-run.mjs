import fs from "node:fs/promises";
import path from "node:path";

import { buildArtifactDiff, parseArtifactFile, renderArtifactDiffMarkdown } from "./artifact-diff.mjs";
import {
  buildGameDataArtifacts,
  canonicalJson,
  EXPORTER_VERSION,
  RUNTIME_ARTIFACT_SCHEMA_VERSION,
  sha256,
} from "./artifact-builder.mjs";
import { validateAdaptedGameData } from "./model-validator.mjs";
import { validateRuntimeArtifacts } from "./runtime-artifact-acceptance.mjs";
import { adaptGameDataWorkbook } from "./source-adapters.mjs";
import { readWorkbookBytes } from "./workbook-reader.mjs";

async function pathExists(fileSystem, target) {
  try {
    await fileSystem.access(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function loadProductionArtifacts(directory, fileSystem) {
  const entries = await fileSystem.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name))) {
    const text = await fileSystem.readFile(path.join(directory, entry.name), "utf8");
    files.push(parseArtifactFile(entry.name, text));
  }
  return files;
}

function sourceSummary(provenance) {
  return {
    provider: provenance.provider || null,
    fileId: provenance.fileId || null,
    driveVersion: provenance.driveVersion || null,
    modifiedTime: provenance.modifiedTime || null,
    fetchedAt: provenance.fetchedAt || null,
    xlsxSha256: provenance.xlsxSha256 || null,
  };
}

async function installRun({ run, provenance, validationReport, artifactSet, exportReport, diff, fileSystem }) {
  if (await pathExists(fileSystem, run.runDirectory)) {
    throw new Error(`Staging run already exists and is immutable: ${run.runDirectory}`);
  }
  const parent = path.dirname(run.runDirectory);
  const temporary = path.join(parent, `.${path.basename(run.runDirectory)}.tmp-${process.pid}`);
  if (await pathExists(fileSystem, temporary)) {
    throw new Error(`Temporary staging run already exists: ${temporary}`);
  }
  await fileSystem.mkdir(temporary, { recursive: true });
  try {
    await fileSystem.writeFile(path.join(temporary, "source-provenance.json"), canonicalJson(provenance), "utf8");
    await fileSystem.writeFile(path.join(temporary, "validation-report.json"), canonicalJson(validationReport), "utf8");
    if (artifactSet) {
      const artifactDirectory = path.join(temporary, "artifacts");
      await fileSystem.mkdir(artifactDirectory);
      for (const file of artifactSet.files) {
        await fileSystem.writeFile(path.join(artifactDirectory, file.name), file.text, "utf8");
      }
      await fileSystem.writeFile(path.join(temporary, "export-report.json"), canonicalJson(exportReport), "utf8");
      await fileSystem.writeFile(path.join(temporary, "artifact-diff.json"), canonicalJson(diff), "utf8");
      await fileSystem.writeFile(path.join(temporary, "artifact-diff.md"), renderArtifactDiffMarkdown(diff), "utf8");
    }
    await fileSystem.rename(temporary, run.runDirectory);
  } catch (error) {
    await fileSystem.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function stageWorkbookSnapshot({
  workbookPath,
  provenancePath,
  run,
  productionDirectory,
  exportedAt = new Date().toISOString(),
  fileSystem = fs,
}) {
  const [workbookBytes, provenanceText] = await Promise.all([
    fileSystem.readFile(workbookPath),
    fileSystem.readFile(provenancePath, "utf8"),
  ]);
  const provenance = JSON.parse(provenanceText);
  const actualSourceHash = sha256(workbookBytes);
  if (provenance.xlsxSha256 && provenance.xlsxSha256 !== actualSourceHash) {
    throw new Error("Source workbook bytes do not match source-provenance.json.");
  }

  const adapted = adaptGameDataWorkbook(readWorkbookBytes(workbookBytes));
  const validation = validateAdaptedGameData(adapted);
  const baseReport = {
    reportVersion: 1,
    exportedAt,
    sourceSchemaVersion: Number(adapted.model.metadata.sourceSchemaVersion || 0),
    runtimeArtifactSchemaVersion: RUNTIME_ARTIFACT_SCHEMA_VERSION,
    exporterVersion: EXPORTER_VERSION,
    source: { ...sourceSummary(provenance), xlsxSha256: actualSourceHash },
    modelSha256: sha256(canonicalJson(adapted.model)),
    validation: {
      ok: validation.ok,
      counts: validation.counts,
      diagnostics: validation.diagnostics,
    },
    runtimeLoadAcceptance: { ok: false, diagnostics: [] },
  };

  if (!validation.ok) {
    await installRun({ run, provenance, validationReport: baseReport, fileSystem });
    return Object.freeze({ ok: false, run, validation, runtimeAcceptance: null, artifactSet: null, diff: null });
  }

  const artifactSet = buildGameDataArtifacts({ model: adapted.model, validation, provenance });
  const runtimeAcceptance = validateRuntimeArtifacts(artifactSet);
  const validationReport = {
    ...baseReport,
    modelSha256: artifactSet.modelSha256,
    runtimeLoadAcceptance: runtimeAcceptance,
  };
  if (!runtimeAcceptance.ok) {
    await installRun({ run, provenance, validationReport, fileSystem });
    return Object.freeze({ ok: false, run, validation, runtimeAcceptance, artifactSet: null, diff: null });
  }

  const productionFiles = await loadProductionArtifacts(productionDirectory, fileSystem);
  const diff = buildArtifactDiff(artifactSet.files, productionFiles);
  const exportReport = {
    reportVersion: 1,
    exportedAt,
    sourceSchemaVersion: Number(adapted.model.metadata.sourceSchemaVersion),
    runtimeArtifactSchemaVersion: artifactSet.schemaVersion,
    exporterVersion: artifactSet.exporterVersion,
    source: sourceSummary(provenance),
    modelSha256: artifactSet.modelSha256,
    runtimeLoadAcceptance: runtimeAcceptance,
    artifacts: artifactSet.files.map(({ name, byteLength, sha256: hash }) => ({ name, byteLength, sha256: hash })),
    recordCounts: Object.fromEntries([
      "classes", "classSkills", "classFeatures", "techniques", "feats", "origins", "originFeatures",
      "weaponBases", "weaponProfiles", "weaponEnhancements",
    ].map((key) => [key, adapted.model[key].length])),
    diffSummary: diff.summary,
  };
  await installRun({ run, provenance, validationReport, artifactSet, exportReport, diff, fileSystem });
  return Object.freeze({ ok: true, run, validation, runtimeAcceptance, artifactSet, diff, exportReport });
}
