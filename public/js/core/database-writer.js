// public/database-writer.js
//
// Single source of truth for writing/sanitizing Firestore update patches.
// All Firestore writes from Builder pages should flow through this module.

import {
  collection,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "../../vendor/firebase/firebase-firestore.js";

import { loadGameXData } from "./game-data.js";
import { createCharacterMigrationReferences } from "./character-migrations.js";
import {
  CharacterPersistenceError,
  applyCharacterPatch,
  assertPersistenceResult,
  checkCharacterRevision,
  createStoredCharacter,
  decodeStoredCharacter,
  planCharacterReplacement,
  requireCharacterIdentity,
} from "./character-persistence.js";

import {
  sanitizeText,
  sanitizeCharName,
  sanitizeStoragePath,
  sanitizeStringArray,
  sanitizeSkillFields,
  sanitizeNamedSkillList,
  sanitizeRepeatableAbilities,
  sanitizeBondList,
  sanitizeWeaponList,
  sanitizeGrantChoices,
  toInt,
} from "./data-sanitization.js";

import {
  ATTR_KEYS,
  clampLevel,
  coerceAttrKey,
  normalizeAttributes,
  getAttributeEffectiveCap,
} from "./character-rules.js";

// Compatibility export for the deployed v4 page path. New persistence writes
// always use the schema version owned by CharacterCodec.
export const TRANSITIONAL_CHARACTER_SCHEMA_VERSION = 4;
export const CHARACTER_SCHEMA_VERSION = TRANSITIONAL_CHARACTER_SCHEMA_VERSION;

const DEFAULT_FIRESTORE_API = Object.freeze({
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
});

async function resolveMigrationReferences({ references, gameData } = {}) {
  if (references) return references;
  const source = gameData || await loadGameXData();
  return createCharacterMigrationReferences(source);
}

async function resolveFirestore(firestore) {
  if (firestore) return firestore;
  return (await import("./firebase.js")).db;
}

function requireExistingSnapshot(snapshot) {
  if (snapshot.exists()) return;
  throw new CharacterPersistenceError(
    "character-not-found",
    `Character ${snapshot.id || "document"} does not exist.`,
  );
}

function assertDecodedCharacter(decoded, characterId) {
  if (decoded.ok) return decoded;
  throw new CharacterPersistenceError(
    "character-write-invalid-stored-value",
    `Character ${characterId} could not be decoded before writing.`,
    { diagnostics: decoded.diagnostics },
  );
}

/** Create a new exact canonical character at revision 1. */
export async function createCharacter({
  ownerUid,
  firestore = null,
  firestoreApi = DEFAULT_FIRESTORE_API,
} = {}) {
  const uid = requireCharacterIdentity(ownerUid, "ownerUid");
  const resolvedFirestore = await resolveFirestore(firestore);
  const characterRef = firestoreApi.doc(
    firestoreApi.collection(resolvedFirestore, "users", uid, "characters"),
  );
  const timestamp = firestoreApi.serverTimestamp();
  const created = createStoredCharacter({
    ownerUid: uid,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  assertPersistenceResult(created, "character-create-invalid", "New character did not satisfy the canonical schema.");
  await firestoreApi.setDoc(characterRef, created.value);
  return Object.freeze({
    characterId: characterRef.id,
    ownerUid: uid,
    character: created.character,
    revision: created.revision,
  });
}

/**
 * Replace canonical character state at an exact expected revision. A stale
 * caller is rejected; Firestore remains unchanged.
 */
export async function replaceCharacter({
  ownerUid,
  characterId,
  character,
  expectedRevision,
  firestore = null,
  firestoreApi = DEFAULT_FIRESTORE_API,
} = {}) {
  const uid = requireCharacterIdentity(ownerUid, "ownerUid");
  const id = requireCharacterIdentity(characterId, "characterId");
  const resolvedFirestore = await resolveFirestore(firestore);
  const characterRef = firestoreApi.doc(resolvedFirestore, "users", uid, "characters", id);

  return firestoreApi.runTransaction(resolvedFirestore, async (transaction) => {
    const snapshot = await transaction.get(characterRef);
    requireExistingSnapshot(snapshot);
    const plan = planCharacterReplacement(snapshot.data(), character, {
      expectedRevision,
      expectedOwnerUid: uid,
      createdAt: firestoreApi.serverTimestamp(),
      updatedAt: firestoreApi.serverTimestamp(),
    });
    assertPersistenceResult(plan, "character-save-invalid", "Character save did not satisfy the persistence contract.");
    transaction.set(characterRef, plan.value);
    return Object.freeze({
      characterId: id,
      ownerUid: uid,
      character,
      revision: plan.revision,
    });
  });
}

/**
 * Apply a narrow builder or sheet patch to the latest stored value inside the
 * transaction. This preserves unrelated fields while retaining strict stale-
 * revision rejection.
 */
export async function patchCharacter({
  ownerUid,
  characterId,
  patch,
  scope = "builder",
  expectedRevision,
  references = null,
  gameData = null,
  firestore = null,
  firestoreApi = DEFAULT_FIRESTORE_API,
} = {}) {
  const uid = requireCharacterIdentity(ownerUid, "ownerUid");
  const id = requireCharacterIdentity(characterId, "characterId");
  const resolvedReferences = await resolveMigrationReferences({ references, gameData });
  const resolvedFirestore = await resolveFirestore(firestore);
  const characterRef = firestoreApi.doc(resolvedFirestore, "users", uid, "characters", id);

  return firestoreApi.runTransaction(resolvedFirestore, async (transaction) => {
    const snapshot = await transaction.get(characterRef);
    requireExistingSnapshot(snapshot);
    const raw = snapshot.data();
    const decoded = assertDecodedCharacter(decodeStoredCharacter(raw, {
      references: resolvedReferences,
      expectedOwnerUid: uid,
    }), id);
    const patched = applyCharacterPatch(decoded.character, patch, { scope });
    assertPersistenceResult(patched, "character-patch-invalid", "Character patch did not satisfy the canonical schema.");
    const plan = planCharacterReplacement(raw, patched.value, {
      expectedRevision,
      expectedOwnerUid: uid,
      createdAt: firestoreApi.serverTimestamp(),
      updatedAt: firestoreApi.serverTimestamp(),
    });
    assertPersistenceResult(plan, "character-save-invalid", "Character patch could not be persisted.");
    transaction.set(characterRef, plan.value);
    return Object.freeze({
      characterId: id,
      ownerUid: uid,
      character: patched.value,
      revision: plan.revision,
      migrated: decoded.migrated,
      migration: decoded.migration,
    });
  });
}

/** Delete only the exact revision the caller reviewed. */
export async function deleteCharacter({
  ownerUid,
  characterId,
  expectedRevision,
  firestore = null,
  firestoreApi = DEFAULT_FIRESTORE_API,
} = {}) {
  const uid = requireCharacterIdentity(ownerUid, "ownerUid");
  const id = requireCharacterIdentity(characterId, "characterId");
  const resolvedFirestore = await resolveFirestore(firestore);
  const characterRef = firestoreApi.doc(resolvedFirestore, "users", uid, "characters", id);
  return firestoreApi.runTransaction(resolvedFirestore, async (transaction) => {
    const snapshot = await transaction.get(characterRef);
    requireExistingSnapshot(snapshot);
    const raw = snapshot.data();
    const revisionCheck = checkCharacterRevision(raw, expectedRevision);
    assertPersistenceResult(
      revisionCheck,
      "character-delete-invalid-revision",
      "Character delete revision was invalid or stale.",
    );
    transaction.delete(characterRef);
    return Object.freeze({ characterId: id, ownerUid: uid, revision: revisionCheck.actualRevision });
  });
}

// ---- Storage path helpers ----

export function getPortraitStoragePath({ uid, charId } = {}) {
  const safeUid = sanitizeText(uid, { maxLen: 128, collapse: true });
  const safeId = sanitizeText(charId, { maxLen: 128, collapse: true });
  if (!safeUid || !safeId) return "";
  // Stable filename (no extension so contentType can vary).
  return `portraits/${safeUid}/${safeId}/portrait`;
}

// ---- Canonical patch builders (dot-path keys for updateDoc) ----

export function buildProfileUpdatePatch({ name, portraitPath } = {}) {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    "builder.name": sanitizeCharName(name || ""),
    "builder.portraitPath": sanitizeStoragePath(portraitPath || ""),
  };
}

export function buildAttributesUpdatePatch({ level, attributes, primaryAttribute } = {}) {
  const L = clampLevel(level ?? 1);
  const primary = coerceAttrKey(primaryAttribute);

  const attrs = normalizeAttributes(attributes || {});
  for (const k of ATTR_KEYS) {
    const cap = getAttributeEffectiveCap(L, k, primary);
    const min = primary && k === primary ? 1 : 0;
    attrs[k] = toInt(attrs[k], { min, max: cap });
  }

  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    "builder.level": L,
    "builder.primaryAttribute": primary,
    "builder.attributes": attrs,
  };
}

export function buildTechniquesUpdatePatch({ selectedTechniques } = {}) {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    "builder.selectedTechniques": sanitizeStringArray(selectedTechniques, { maxItems: 500, maxLen: 200 }),
  };
}

export function buildOriginUpdatePatch({ originKey, originKeystone } = {}) {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    "builder.originKey": sanitizeText(originKey || "", { maxLen: 64, collapse: true }),
    "builder.originKeystone": sanitizeText(originKeystone || "", { maxLen: 400, collapse: true }),
  };
}

export function buildBondsKeystonesUpdatePatch({ bonds, backgroundKeystones } = {}) {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    "builder.bonds": sanitizeBondList(bonds, { maxItems: 50 }),
    "builder.backgroundKeystones": sanitizeStringArray(backgroundKeystones, { maxItems: 2, maxLen: 400 }),
  };
}

export function buildWeaponsUpdatePatch({ weapons } = {}) {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    "builder.weapons": sanitizeWeaponList(weapons, { maxItems: 20 }),
  };
}

// ---- Patch sanitization gate for builder pages ----

/**
 * Sanitize an updateDoc patch (dot-path form).
 * Acts as a schema gate so pages cannot accidentally write outside builder.*.
 */
export function sanitizeUpdatePatch(patch) {
  const src = (patch && typeof patch === "object") ? patch : {};
  const out = { ...src };

  // Allow only root schemaVersion plus builder.* writes.
  for (const k of Object.keys(out)) {
    if (k === "schemaVersion") continue;
    if (k.startsWith("builder.")) continue;
    delete out[k];
  }

  if (Object.prototype.hasOwnProperty.call(out, "schemaVersion")) {
    out.schemaVersion = toInt(out.schemaVersion, { min: 0, max: 9999 });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.name")) {
    out["builder.name"] = sanitizeCharName(out["builder.name"]);
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.portraitPath")) {
    out["builder.portraitPath"] = sanitizeStoragePath(out["builder.portraitPath"]);
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.level")) {
    out["builder.level"] = clampLevel(out["builder.level"]);
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.classKey")) {
    out["builder.classKey"] = sanitizeText(out["builder.classKey"], { maxLen: 64, collapse: true });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.primaryAttribute")) {
    out["builder.primaryAttribute"] = coerceAttrKey(out["builder.primaryAttribute"]);
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.originKey")) {
    out["builder.originKey"] = sanitizeText(out["builder.originKey"], { maxLen: 64, collapse: true });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.originKeystone")) {
    out["builder.originKeystone"] = sanitizeText(out["builder.originKeystone"], { maxLen: 400, collapse: true });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.attributes")) {
    // Cannot cap without knowing level/primary in this generic gate; keep values tidy.
    out["builder.attributes"] = normalizeAttributes(out["builder.attributes"], { min: 0, max: 99 });
  }

  const arrayFieldSanitizers = {
    "builder.selectedClassFeatureOptions": { maxItems: 500, maxLen: 200 },
    "builder.selectedClassUtilitySkills": { maxItems: 50, maxLen: 96 },
    "builder.selectedFeats": { maxItems: 200, maxLen: 160 },
    "builder.selectedFeatOptions": { maxItems: 500, maxLen: 200 },
    "builder.autoAbilityNames": { maxItems: 500, maxLen: 200 },
    "builder.grantedCoreSkillSnapshot": { maxItems: 50, maxLen: 64 },
    "builder.grantedSkillSnapshot": { maxItems: 200, maxLen: 96 },
    "builder.backgroundKeystones": { maxItems: 2, maxLen: 400 },
    "builder.visitedSteps": { maxItems: 50, maxLen: 64 },
    "builder.selectedTechniques": { maxItems: 500, maxLen: 200 },
  };

  for (const [key, opts] of Object.entries(arrayFieldSanitizers)) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = sanitizeStringArray(out[key], opts);
    }
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.bonds")) {
    out["builder.bonds"] = sanitizeBondList(out["builder.bonds"], { maxItems: 50 });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.weapons")) {
    out["builder.weapons"] = sanitizeWeaponList(out["builder.weapons"], { maxItems: 20 });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.grantChoices")) {
    out["builder.grantChoices"] = sanitizeGrantChoices(out["builder.grantChoices"], { maxItems: 100 });
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.sheet.fields")) {
    out["builder.sheet.fields"] = sanitizeSkillFields(out["builder.sheet.fields"]);
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.sheet.repeatables")) {
    const repeatables = (out["builder.sheet.repeatables"] && typeof out["builder.sheet.repeatables"] === "object")
      ? out["builder.sheet.repeatables"]
      : {};
    out["builder.sheet.repeatables"] = {
      ...repeatables,
      combatSkillsExtra: sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 }),
      settingSkills: sanitizeNamedSkillList(repeatables.settingSkills, { maxItems: 50 }),
    };
    if (Object.prototype.hasOwnProperty.call(repeatables, "abilities")) {
      out["builder.sheet.repeatables"].abilities = sanitizeRepeatableAbilities(repeatables.abilities);
    }
  }

  // Repeatables we currently understand
  if (Object.prototype.hasOwnProperty.call(out, "builder.sheet.repeatables.abilities")) {
    out["builder.sheet.repeatables.abilities"] = sanitizeRepeatableAbilities(out["builder.sheet.repeatables.abilities"]);
  }

  return out;
}

// ---- Firestore IO helpers (Builder) ----

/**
 * Save a partial update to a character doc.
 * Applies sanitizeUpdatePatch() and stamps updatedAt.
 *
 * @param {any} charRef
 * @param {Record<string, any>} patch
 */
export async function saveCharacterPatch(charRef, patch) {
  const cleaned = sanitizeUpdatePatch(patch || {});
  await updateDoc(charRef, { ...cleaned, updatedAt: serverTimestamp() });
}

/**
 * Mark a builder step as visited on the character doc.
 *
 * @param {any} charRef
 * @param {string} stepId
 */
export async function markStepVisited(charRef, stepId) {
  try {
    await updateDoc(charRef, {
      "builder.visitedSteps": arrayUnion(stepId),
      "builder.lastVisitedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Could not mark step visited:", e);
  }
}
