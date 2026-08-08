import {
  CHARACTER_CODEC_FIELDS,
  CHARACTER_SCHEMA_VERSION,
  createDefaultCharacter,
  encodeCharacter,
} from "./character-codec.js";
import { migrateCharacterDocument } from "./character-migrations.js";
import { isSheetOwnedUpdatePath } from "./sheet-state.js";

export const INITIAL_CHARACTER_REVISION = 1;
export const LEGACY_CHARACTER_REVISION = 0;

const BUILDER_PATCH_PATHS = Object.freeze([
  ...CHARACTER_CODEC_FIELDS.builder
    .filter((key) => key !== "sheet")
    .map((key) => `builder.${key}`),
  "builder.sheet.fields",
  "builder.sheet.repeatables",
  "builder.sheet.repeatables.abilities",
]);

const BUILDER_PATCH_PATH_SET = new Set(BUILDER_PATCH_PATHS);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const output = {};
    for (const [key, child] of Object.entries(value)) output[key] = cloneValue(child);
    return output;
  }
  return value;
}

function freezeDiagnostics(diagnostics) {
  return Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function diagnostic(code, path, message) {
  return Object.freeze({ code, path, message });
}

export class CharacterPersistenceError extends Error {
  constructor(code, message, { diagnostics = [], cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CharacterPersistenceError";
    this.code = code;
    this.diagnostics = freezeDiagnostics(diagnostics);
  }
}

export class CharacterConflictError extends CharacterPersistenceError {
  constructor({ expectedRevision, actualRevision } = {}) {
    const details = diagnostic(
      "character-revision-conflict",
      "metadata.revision",
      `Character revision ${expectedRevision} is stale; the current revision is ${actualRevision}.`,
    );
    super("character-revision-conflict", details.message, { diagnostics: [details] });
    this.name = "CharacterConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function setPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = cloneValue(value);
}

export function requireCharacterIdentity(value, label = "character identity") {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(text)) {
    throw new CharacterPersistenceError(
      "invalid-character-identity",
      `${label} must be a stable Firestore path segment using letters, digits, period, underscore, colon, or hyphen.`,
    );
  }
  return text;
}

export function validateCharacterRevision(value, { allowMissing = true } = {}) {
  if ((value === undefined || value === null) && allowMissing) {
    return Object.freeze({ ok: true, value: LEGACY_CHARACTER_REVISION, diagnostics: Object.freeze([]) });
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    return Object.freeze({
      ok: false,
      value: null,
      diagnostics: Object.freeze([
        diagnostic("invalid-character-revision", "metadata.revision", "Character revision must be a nonnegative safe integer."),
      ]),
    });
  }
  return Object.freeze({ ok: true, value, diagnostics: Object.freeze([]) });
}

export function decodeStoredCharacter(rawDocument, { references = null, expectedOwnerUid = "" } = {}) {
  const migration = migrateCharacterDocument(rawDocument, { references });
  const diagnostics = [...migration.diagnostics];
  const revisionResult = validateCharacterRevision(migration.metadata.revision);
  diagnostics.push(...revisionResult.diagnostics);

  if (migration.ok && expectedOwnerUid && migration.value.ownerUid !== expectedOwnerUid) {
    diagnostics.push(diagnostic(
      "character-owner-mismatch",
      "character.ownerUid",
      "Stored character owner does not match the requested owner path.",
    ));
  }

  const ok = migration.ok && revisionResult.ok && diagnostics.length === 0;
  const metadata = Object.freeze({
    ...migration.metadata,
    revision: revisionResult.ok ? revisionResult.value : null,
  });
  return Object.freeze({
    ok,
    character: ok ? cloneValue(migration.value) : null,
    metadata,
    revision: metadata.revision,
    migrated: migration.fromVersion !== CHARACTER_SCHEMA_VERSION,
    migration,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function encodeStoredCharacter(character, {
  revision,
  createdAt,
  updatedAt,
  lastVisitedAt,
} = {}) {
  const encoded = encodeCharacter(character);
  const revisionResult = validateCharacterRevision(revision, { allowMissing: false });
  const diagnostics = [...encoded.diagnostics, ...revisionResult.diagnostics];
  const ok = encoded.ok && revisionResult.ok && diagnostics.length === 0;
  return Object.freeze({
    ok,
    value: ok ? {
      ...encoded.value,
      revision: revisionResult.value,
      createdAt: createdAt ?? null,
      updatedAt: updatedAt ?? null,
      lastVisitedAt: lastVisitedAt ?? null,
    } : null,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function createStoredCharacter({ ownerUid, createdAt, updatedAt, lastVisitedAt } = {}) {
  const character = createDefaultCharacter({ ownerUid });
  const encoded = encodeStoredCharacter(character, {
    revision: INITIAL_CHARACTER_REVISION,
    createdAt,
    updatedAt,
    lastVisitedAt,
  });
  return Object.freeze({
    ...encoded,
    character: encoded.ok ? cloneValue(character) : null,
    revision: encoded.ok ? INITIAL_CHARACTER_REVISION : null,
  });
}

export function isAllowedCharacterPatchPath(path, { scope = "builder" } = {}) {
  if (scope === "sheet") return isSheetOwnedUpdatePath(path);
  if (scope !== "builder") return false;
  return BUILDER_PATCH_PATH_SET.has(String(path || ""));
}

export function applyCharacterPatch(character, patch, { scope = "builder" } = {}) {
  const encoded = encodeCharacter(character);
  const diagnostics = [...encoded.diagnostics];
  if (!isPlainObject(patch)) {
    diagnostics.push(diagnostic("invalid-character-patch", "patch", "Character patch must be a plain object."));
  }

  const output = encoded.ok ? cloneValue(encoded.value) : null;
  if (output && isPlainObject(patch)) {
    for (const [path, value] of Object.entries(patch)) {
      if (!isAllowedCharacterPatchPath(path, { scope })) {
        diagnostics.push(diagnostic(
          "unsupported-character-write-path",
          `patch.${path}`,
          `Character ${scope} writes do not own path "${path}".`,
        ));
        continue;
      }
      setPath(output, path, value);
    }
  }

  const finalEncoded = output ? encodeCharacter(output) : { ok: false, diagnostics: [] };
  diagnostics.push(...finalEncoded.diagnostics);
  const ok = encoded.ok && finalEncoded.ok && diagnostics.length === 0;
  return Object.freeze({
    ok,
    value: ok ? finalEncoded.value : null,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function checkCharacterRevision(rawDocument, expectedRevision) {
  const expected = validateCharacterRevision(expectedRevision, { allowMissing: false });
  const actual = validateCharacterRevision(rawDocument?.revision);
  const diagnostics = [...expected.diagnostics, ...actual.diagnostics];

  if (expected.ok && actual.ok && expected.value !== actual.value) {
    diagnostics.push(diagnostic(
      "character-revision-conflict",
      "metadata.revision",
      `Character revision ${expected.value} is stale; the current revision is ${actual.value}.`,
    ));
  }

  const ok = expected.ok && actual.ok && diagnostics.length === 0;
  return Object.freeze({
    ok,
    expectedRevision: expected.ok ? expected.value : null,
    actualRevision: actual.ok ? actual.value : null,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function planCharacterReplacement(rawDocument, character, {
  expectedRevision,
  expectedOwnerUid = "",
  createdAt,
  updatedAt,
} = {}) {
  const revisionCheck = checkCharacterRevision(rawDocument, expectedRevision);
  const diagnostics = [...revisionCheck.diagnostics];
  if (expectedOwnerUid && character?.ownerUid !== expectedOwnerUid) {
    diagnostics.push(diagnostic(
      "character-owner-mismatch",
      "character.ownerUid",
      "Canonical character owner does not match the destination owner path.",
    ));
  }

  const nextRevision = revisionCheck.ok ? revisionCheck.actualRevision + 1 : null;
  const encoded = nextRevision === null
    ? { ok: false, value: null, diagnostics: [] }
    : encodeStoredCharacter(character, {
      revision: nextRevision,
      createdAt: rawDocument?.createdAt ?? createdAt,
      updatedAt,
      lastVisitedAt: rawDocument?.lastVisitedAt ?? rawDocument?.builder?.lastVisitedAt ?? null,
    });
  diagnostics.push(...encoded.diagnostics);

  const ok = revisionCheck.ok && encoded.ok && diagnostics.length === 0;
  return Object.freeze({
    ok,
    value: ok ? encoded.value : null,
    expectedRevision: revisionCheck.expectedRevision,
    previousRevision: revisionCheck.actualRevision,
    actualRevision: revisionCheck.actualRevision,
    revision: ok ? nextRevision : null,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function assertPersistenceResult(result, code, message) {
  if (result?.ok) return result;
  const conflict = result?.diagnostics?.find((item) => item.code === "character-revision-conflict");
  if (conflict) {
    throw new CharacterConflictError({
      expectedRevision: result.expectedRevision,
      actualRevision: result.actualRevision ?? result.previousRevision,
    });
  }
  throw new CharacterPersistenceError(code, message, {
    diagnostics: result?.diagnostics || [],
  });
}

export const CHARACTER_PERSISTENCE_FIELDS = Object.freeze({
  builderPatchPaths: BUILDER_PATCH_PATHS,
  metadata: Object.freeze(["createdAt", "updatedAt", "revision", "lastVisitedAt"]),
});
