import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { GoogleAuth, Impersonated } from "google-auth-library";
import * as XLSX from "xlsx/xlsx.mjs";

import { assertCredentialOutsideRepository } from "../credential-policy.mjs";

export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
export const DRIVE_EXPORT_LIMIT_BYTES = 10 * 1024 * 1024;

const METADATA_FIELDS = [
  "id",
  "name",
  "mimeType",
  "modifiedTime",
  "version",
  "trashed",
  "webViewLink",
  "capabilities(canDownload)",
].join(",");

export function buildDriveMetadataUrl(fileId) {
  const id = encodeURIComponent(String(fileId || ""));
  const params = new URLSearchParams({
    fields: METADATA_FIELDS,
    supportsAllDrives: "true",
  });
  return `https://www.googleapis.com/drive/v3/files/${id}?${params}`;
}

export function buildDriveExportUrl(fileId, exportMimeType) {
  const id = encodeURIComponent(String(fileId || ""));
  const params = new URLSearchParams({ mimeType: String(exportMimeType || "") });
  return `https://www.googleapis.com/drive/v3/files/${id}/export?${params}`;
}

function requireMetadataString(metadata, field) {
  const value = metadata?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Drive metadata is missing required field "${field}".`);
  }
  return value.trim();
}

export function validateDriveSourceMetadata(metadata, config) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Drive returned invalid source metadata.");
  }

  const normalized = {
    id: requireMetadataString(metadata, "id"),
    name: requireMetadataString(metadata, "name"),
    mimeType: requireMetadataString(metadata, "mimeType"),
    modifiedTime: requireMetadataString(metadata, "modifiedTime"),
    version: requireMetadataString(metadata, "version"),
    webViewLink: typeof metadata.webViewLink === "string" ? metadata.webViewLink : null,
    trashed: metadata.trashed === true,
    canDownload: metadata.capabilities?.canDownload !== false,
  };

  if (normalized.id !== config.fileId) {
    throw new Error("Drive returned metadata for the wrong canonical source file.");
  }
  if (normalized.name !== config.expectedName) {
    throw new Error(`Canonical source name mismatch: expected "${config.expectedName}".`);
  }
  if (normalized.mimeType !== config.nativeMimeType) {
    throw new Error(`Canonical source MIME type mismatch: expected "${config.nativeMimeType}".`);
  }
  if (normalized.trashed) {
    throw new Error("Canonical game-data source is in the Drive trash.");
  }
  if (!normalized.canDownload) {
    throw new Error("Authenticated identity cannot download the canonical game-data source.");
  }
  if (!Number.isFinite(Date.parse(normalized.modifiedTime))) {
    throw new Error("Drive returned an invalid canonical source modifiedTime.");
  }

  return Object.freeze(normalized);
}

function isZipSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4) return false;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04)
    || (bytes[2] === 0x05 && bytes[3] === 0x06)
    || (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function workbookMetadataEntries(workbook) {
  const sheet = workbook.Sheets.Metadata;
  if (!sheet) throw new Error('Workbook is missing required sheet "Metadata".');
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  const header = rows[0] || [];
  if (String(header[0] || "").trim() !== "key" || String(header[1] || "").trim() !== "value") {
    throw new Error('Workbook Metadata sheet must begin with "key" and "value" columns.');
  }

  const entries = new Map();
  for (let index = 1; index < rows.length; index += 1) {
    const key = String(rows[index]?.[0] ?? "").trim();
    if (!key) continue;
    if (entries.has(key)) throw new Error(`Workbook Metadata contains duplicate key "${key}".`);
    entries.set(key, rows[index]?.[1]);
  }
  return entries;
}

function requireWorkbookMetadataInteger(entries, key) {
  const value = entries.get(key);
  const number = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Workbook Metadata key "${key}" must be a positive integer.`);
  }
  return number;
}

function inspectWorkbookContract(workbook, config) {
  const missingSheets = config.requiredSheets.filter((sheetName) => !workbook.SheetNames.includes(sheetName));
  if (missingSheets.length) {
    throw new Error(`Workbook is missing required sheet(s): ${missingSheets.join(", ")}.`);
  }

  const entries = workbookMetadataEntries(workbook);
  const observed = Object.freeze({
    sourceSchemaVersion: requireWorkbookMetadataInteger(entries, "sourceSchemaVersion"),
    grantSyntaxVersion: requireWorkbookMetadataInteger(entries, "grantSyntaxVersion"),
    prerequisiteSyntaxVersion: requireWorkbookMetadataInteger(entries, "prerequisiteSyntaxVersion"),
    canonicalWorkbookId: String(entries.get("canonicalWorkbookId") ?? "").trim(),
  });
  for (const field of ["sourceSchemaVersion", "grantSyntaxVersion", "prerequisiteSyntaxVersion"]) {
    if (observed[field] !== config[field]) {
      throw new Error(
        `Workbook Metadata ${field} mismatch: expected ${config[field]}, received ${observed[field]}.`,
      );
    }
  }
  if (observed.canonicalWorkbookId !== config.fileId) {
    throw new Error("Workbook Metadata canonicalWorkbookId does not match the configured Drive file ID.");
  }
  return observed;
}

export function validateExportedWorkbook(bytes, {
  maxBytes = DRIVE_EXPORT_LIMIT_BYTES,
  config,
} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error("Drive returned an empty workbook export.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Workbook export exceeds the ${maxBytes}-byte Drive export limit.`);
  }
  if (!isZipSignature(bytes)) {
    throw new Error("Drive response is not an XLSX/ZIP workbook.");
  }

  let workbook;
  try {
    // SheetJS annotates the supplied typed array while parsing. Parse a copy so
    // the exact downloaded byte object remains pristine for hashing and writing.
    workbook = XLSX.read(bytes.slice(), {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      dense: true,
    });
  } catch (error) {
    throw new Error("Drive response is not a structurally readable XLSX workbook.", { cause: error });
  }
  if (!Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error("Drive response contains no readable workbook sheets.");
  }
  if (config) inspectWorkbookContract(workbook, config);
  return bytes;
}

export function assertStableSourceRevision(before, after) {
  if (before.id !== after.id) {
    throw new Error("Canonical source identity changed during export.");
  }
  if (before.version !== after.version || before.modifiedTime !== after.modifiedTime) {
    throw new Error("Canonical source changed during export; retry to capture one stable revision.");
  }
}

export function buildSourceProvenance({ config, metadata, workbookBytes, fetchedAt }) {
  const timestamp = fetchedAt instanceof Date ? fetchedAt.toISOString() : String(fetchedAt || "");
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error("A valid fetchedAt timestamp is required for source provenance.");
  }

  return Object.freeze({
    provenanceVersion: 1,
    provider: config.provider,
    fileId: metadata.id,
    name: metadata.name,
    nativeMimeType: metadata.mimeType,
    exportMimeType: config.exportMimeType,
    sourceSchemaVersion: config.sourceSchemaVersion,
    grantSyntaxVersion: config.grantSyntaxVersion,
    prerequisiteSyntaxVersion: config.prerequisiteSyntaxVersion,
    driveVersion: metadata.version,
    modifiedTime: metadata.modifiedTime,
    fetchedAt: timestamp,
    byteLength: workbookBytes.byteLength,
    xlsxSha256: crypto.createHash("sha256").update(workbookBytes).digest("hex"),
    webViewLink: metadata.webViewLink,
  });
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

async function defaultDelay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function requestWithRetry(url, options, {
  fetchImpl = globalThis.fetch,
  maxAttempts = 3,
  delay = defaultDelay,
  operation = "Google Drive request",
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(Math.min(250 * (2 ** (attempt - 1)), 1000));
        continue;
      }
      break;
    }

    if (response.ok) return response;
    lastError = new Error(`${operation} failed with HTTP ${response.status}.`);
    if (!shouldRetryStatus(response.status) || attempt === maxAttempts) break;
    await delay(Math.min(250 * (2 ** (attempt - 1)), 1000));
  }

  throw lastError || new Error(`${operation} failed.`);
}

export async function createGoogleDriveRequest({
  repositoryRoot,
  env = process.env,
  fetchImpl = globalThis.fetch,
  googleAuthFactory = (options) => new GoogleAuth(options),
  impersonatedFactory = (options) => new Impersonated(options),
} = {}) {
  const credentialPath = String(env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (credentialPath) assertCredentialOutsideRepository(repositoryRoot, credentialPath);

  const targetPrincipal = String(env.GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT || "").trim();
  const auth = googleAuthFactory({
    // The source identity calls IAM Credentials when impersonating; the short-
    // lived target identity receives only Drive read access.
    scopes: [targetPrincipal ? CLOUD_PLATFORM_SCOPE : DRIVE_READONLY_SCOPE],
  });
  const sourceClient = await auth.getClient();
  const client = targetPrincipal
    ? impersonatedFactory({
      sourceClient,
      targetPrincipal,
      targetScopes: [DRIVE_READONLY_SCOPE],
      lifetime: 900,
    })
    : sourceClient;

  return async (url, options = {}) => {
    const authHeaders = await client.getRequestHeaders(url);
    const { operation = "Google Drive request", ...requestOptions } = options;
    const headers = new Headers(requestOptions.headers || {});
    if (typeof authHeaders?.forEach === "function") {
      authHeaders.forEach((value, key) => headers.set(key, value));
    } else {
      for (const [key, value] of Object.entries(authHeaders || {})) headers.set(key, value);
    }
    return requestWithRetry(url, { ...requestOptions, headers }, {
      fetchImpl,
      operation,
    });
  };
}

async function readMetadata(config, request, operation) {
  const response = await request(buildDriveMetadataUrl(config.fileId), { operation });
  let metadata;
  try {
    metadata = await response.json();
  } catch (error) {
    throw new Error("Drive returned unreadable source metadata.", { cause: error });
  }
  return validateDriveSourceMetadata(metadata, config);
}

export async function checkGoogleDriveSourceAccess({ config, request }) {
  return readMetadata(config, request, "Google Drive source access check");
}

export async function installFilePairAtomically(replacements, { fileSystem = fs } = {}) {
  if (!Array.isArray(replacements) || replacements.length !== 2) {
    throw new Error("Exactly two file replacements are required for an atomic source snapshot pair.");
  }
  const backedUp = [];
  const installed = [];
  try {
    for (const replacement of replacements) {
      try {
        await fileSystem.rename(replacement.target, replacement.backup);
        backedUp.push(replacement);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    for (const replacement of replacements) {
      await fileSystem.rename(replacement.temp, replacement.target);
      installed.push(replacement);
    }
  } catch (error) {
    for (const replacement of installed.reverse()) {
      await fileSystem.rm(replacement.target, { force: true });
    }
    for (const replacement of backedUp.reverse()) {
      await fileSystem.rename(replacement.backup, replacement.target);
    }
    throw error;
  }
  await Promise.all(backedUp.map((replacement) => fileSystem.rm(replacement.backup, { force: true })));
}

export async function acquireGoogleDriveSource({
  config,
  request,
  workbookPath,
  provenancePath,
  now = () => new Date(),
} = {}) {
  const before = await readMetadata(config, request, "Google Drive source metadata request");
  const exportResponse = await request(
    buildDriveExportUrl(config.fileId, config.exportMimeType),
    { operation: "Google Drive workbook export" },
  );
  const workbookBytes = validateExportedWorkbook(
    new Uint8Array(await exportResponse.arrayBuffer()),
    { config },
  );
  const after = await readMetadata(config, request, "Google Drive source verification request");
  assertStableSourceRevision(before, after);

  const provenance = buildSourceProvenance({
    config,
    metadata: after,
    workbookBytes,
    fetchedAt: now(),
  });

  await fs.mkdir(path.dirname(workbookPath), { recursive: true });
  await fs.mkdir(path.dirname(provenancePath), { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const workbookTemp = `${workbookPath}.${nonce}.tmp`;
  const provenanceTemp = `${provenancePath}.${nonce}.tmp`;
  const replacements = [
    { target: workbookPath, temp: workbookTemp, backup: `${workbookPath}.${nonce}.bak` },
    { target: provenancePath, temp: provenanceTemp, backup: `${provenancePath}.${nonce}.bak` },
  ];

  try {
    await fs.writeFile(workbookTemp, workbookBytes);
    await fs.writeFile(provenanceTemp, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

    await installFilePairAtomically(replacements);
  } finally {
    await Promise.allSettled([
      fs.rm(workbookTemp, { force: true }),
      fs.rm(provenanceTemp, { force: true }),
    ]);
  }

  return Object.freeze({ workbookPath, provenancePath, provenance });
}

export function formatSourceAcquisitionError(error) {
  const message = String(error?.message || error || "Unknown error.");
  const normalized = message.toLowerCase();
  if (
    normalized.includes("default credentials")
    || normalized.includes("could not load")
    || normalized.includes("credential") && normalized.includes("not")
  ) {
    return "Application Default Credentials are not configured for the game-data source fetch. See docs/data-pipeline.md.";
  }
  if (
    normalized.includes("http 401")
    || normalized.includes("http 403")
    || normalized.includes("invalid_scope")
    || normalized.includes("insufficient authentication")
  ) {
    return "Google Drive authentication lacks read-only access to the canonical Sheet. See docs/data-pipeline.md.";
  }
  return message;
}
