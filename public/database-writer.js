// public/database-writer.js
//
// Single source of truth for writing/sanitizing Firestore update patches.
// All Firestore writes from Builder pages should flow through this module.

import {
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  sanitizeText,
  sanitizeCharName,
  sanitizeStoragePath,
  sanitizeStringArray,
  sanitizeRepeatableAbilities,
  toInt,
} from "./data-sanitization.js";

import {
  ATTR_KEYS,
  clampLevel,
  coerceAttrKey,
  normalizeAttributes,
  getAttributeEffectiveCap,
} from "./character-rules.js";

export const CHARACTER_SCHEMA_VERSION = 3;

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

  if (Object.prototype.hasOwnProperty.call(out, "builder.attributes")) {
    // Cannot cap without knowing level/primary in this generic gate; keep values tidy.
    out["builder.attributes"] = normalizeAttributes(out["builder.attributes"], { min: 0, max: 99 });
  }

  for (const key of [
    "builder.selectedClassFeatureOptions",
    "builder.selectedFeats",
    "builder.autoAbilityNames",
    "builder.visitedSteps",
    "builder.selectedTechniques",
  ]) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = sanitizeStringArray(out[key], { maxItems: 500, maxLen: 200 });
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
