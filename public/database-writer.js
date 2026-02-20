// public/database-writer.js
//
// Single source of truth for *sanitizing* Firestore update patches.
// (Actual read/write wrappers will be centralized here in a later refactor step.)

import {
  sanitizeText,
  sanitizeCharName,
  sanitizeStoragePath,
  sanitizeStringArray,
  sanitizeRepeatableAbilities,
  toInt,
  clampLevel,
} from "./data-sanitization.js";

import {
  normalizeAttributes,
  coerceAttrKey,
} from "./character-schema.js";

/**
 * Sanitize an updateDoc patch (dot-path form).
 * This acts as a schema gate so pages cannot accidentally write outside builder.*.
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
    // Cannot cap without knowing level/primary in this generic gate; we still keep values tidy.
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

  // Custom techniques (full objects) are stored in the sheet repeatables.
  // We intentionally do not sanitize their internal schema here yet.

  return out;
}