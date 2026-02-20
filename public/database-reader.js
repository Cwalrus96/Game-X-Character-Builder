// public/database-reader.js
//
// Single source of truth for reading/normalizing Character documents from Firestore.
//
// NOTE: This module is Game X specific.
// - No Firestore calls live here yet; this file focuses on normalization/shape.
// - Firestore IO wrappers will be centralized later.

import {
  sanitizeText,
  sanitizeCharName,
  sanitizeStoragePath,
  toInt,
} from "./data-sanitization.js";

import {
  ATTR_KEYS,
  CHARACTER_SCHEMA_VERSION,
  clampLevel,
  coerceAttrKey,
  normalizeAttributes,
  getAttributeEffectiveCap,
} from "./character-schema.js";

import {
  sanitizeStringArray,
  sanitizeRepeatableAbilities,
} from "./data-sanitization.js";

/**
 * Construct a canonical default character doc.
 * This is used when creating a new character and as the base for normalization.
 */
export function createDefaultCharacterDoc({ ownerUid } = {}) {
  const uid = sanitizeText(ownerUid, { maxLen: 128, collapse: true });

  const attrs = {};
  for (const k of ATTR_KEYS) attrs[k] = 0;

  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    ownerUid: uid,
    builder: {
      name: "",
      portraitPath: "",

      level: 1,
      classKey: "",
      primaryAttribute: "",
      attributes: attrs,

      selectedClassFeatureOptions: [],
      selectedFeats: [],
      autoAbilityNames: [],

      visitedSteps: [],
      lastVisitedAt: null,

      // New in Techniques ref-storage work (Option B)
      selectedTechniques: [],

      sheet: {
        fields: {},
        repeatables: {},
      },
    },
  };
}

/**
 * Normalize Firestore doc to the canonical shape used by builder + sheet.
 * No legacy support; missing fields are filled with defaults.
 */
export function normalizeCharacterDoc(raw) {
  const src = (raw && typeof raw === "object") ? raw : {};

  const base = createDefaultCharacterDoc({ ownerUid: src.ownerUid || "" });

  const b = (src.builder && typeof src.builder === "object") ? src.builder : {};

  const level = clampLevel(b.level ?? 1);
  const primary = coerceAttrKey(b.primaryAttribute);

  // Effective attrs are stored; clamp them to caps + mins.
  const attrs = normalizeAttributes(b.attributes || {});
  for (const k of ATTR_KEYS) {
    const cap = getAttributeEffectiveCap(level, k, primary);
    const min = primary && k === primary ? 1 : 0;
    attrs[k] = toInt(attrs[k], { min, max: cap });
  }

  const sheetSrc = (b.sheet && typeof b.sheet === "object") ? b.sheet : {};
  const sheetFields = (sheetSrc.fields && typeof sheetSrc.fields === "object") ? { ...sheetSrc.fields } : {};
  const sheetRepeatables = (sheetSrc.repeatables && typeof sheetSrc.repeatables === "object") ? { ...sheetSrc.repeatables } : {};

  // Normalize repeatables we currently care about.
  if (Object.prototype.hasOwnProperty.call(sheetRepeatables, "abilities")) {
    sheetRepeatables.abilities = sanitizeRepeatableAbilities(sheetRepeatables.abilities);
  }

  // Custom techniques remain full objects in repeatables (by design).
  // Stock techniques are refs stored in builder.selectedTechniques.

  return {
    // Keep timestamps if present for UI (characters list, etc.)
    createdAt: src.createdAt ?? null,
    updatedAt: src.updatedAt ?? null,

    schemaVersion: toInt(src.schemaVersion ?? base.schemaVersion, { min: 0, max: 9999 }),
    ownerUid: sanitizeText(src.ownerUid || "", { maxLen: 128, collapse: true }),

    builder: {
      name: sanitizeCharName(b.name || ""),
      portraitPath: sanitizeStoragePath(b.portraitPath || ""),

      level,
      classKey: sanitizeText(b.classKey || "", { maxLen: 64, collapse: true }),
      primaryAttribute: primary,
      attributes: attrs,

      selectedClassFeatureOptions: sanitizeStringArray(b.selectedClassFeatureOptions, { maxItems: 200, maxLen: 160 }),
      selectedFeats: sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 }),
      autoAbilityNames: sanitizeStringArray(b.autoAbilityNames, { maxItems: 500, maxLen: 200 }),

      visitedSteps: sanitizeStringArray(b.visitedSteps, { maxItems: 50, maxLen: 64 }),
      lastVisitedAt: b.lastVisitedAt ?? null,

      selectedTechniques: sanitizeStringArray(b.selectedTechniques, { maxItems: 500, maxLen: 200 }),

      sheet: {
        fields: sheetFields,
        repeatables: sheetRepeatables,
      },
    },
  };
}
