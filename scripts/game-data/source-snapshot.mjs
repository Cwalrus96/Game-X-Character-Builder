import { createHash } from "node:crypto";
import { validateExportedWorkbook } from "./google-drive-source.mjs";

/** Verify an already acquired native export without borrowing its transport credentials. */
export function validateAcquiredSnapshot(bytes, provenance, config) {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    throw new Error("An acquired snapshot requires its provenance object.");
  }
  for (const [field, expected] of Object.entries({
    provenanceVersion: 1, provider: config.provider, fileId: config.fileId,
    name: config.expectedName, nativeMimeType: config.nativeMimeType,
    exportMimeType: config.exportMimeType, sourceSchemaVersion: config.sourceSchemaVersion,
    grantSyntaxVersion: config.grantSyntaxVersion, prerequisiteSyntaxVersion: config.prerequisiteSyntaxVersion,
  })) {
    if (provenance[field] !== expected) throw new Error(`Snapshot provenance ${field} does not match the source contract.`);
  }
  for (const field of ["modifiedTime", "fetchedAt"]) {
    if (typeof provenance[field] !== "string" || !Number.isFinite(Date.parse(provenance[field]))) {
      throw new Error(`Snapshot provenance requires a valid ${field}.`);
    }
  }
  if (provenance.driveVersion !== null && (typeof provenance.driveVersion !== "string" || !provenance.driveVersion.trim())) {
    throw new Error("Snapshot provenance driveVersion must be a nonempty string or explicit null when unavailable.");
  }
  if (!/^[a-f0-9]{64}$/.test(provenance.xlsxSha256 || "")) {
    throw new Error("Snapshot provenance requires an exact XLSX SHA-256.");
  }
  if (provenance.byteLength !== bytes.byteLength) throw new Error("Snapshot byte length does not match its provenance.");
  if (createHash("sha256").update(bytes).digest("hex") !== provenance.xlsxSha256) {
    throw new Error("Snapshot bytes do not match their provenance SHA-256.");
  }
  validateExportedWorkbook(bytes, { config });
  return Object.freeze({ fileId: provenance.fileId, xlsxSha256: provenance.xlsxSha256 });
}
