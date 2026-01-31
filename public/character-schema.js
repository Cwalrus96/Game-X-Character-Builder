// public/character-schema.js
/**
 * Game X — Canonical Character Schema (Single Source of Truth)
 * -----------------------------------------------------------
 *
 * This module is the SINGLE SOURCE OF TRUTH for how character data is:
 *   1) stored in Firestore
 *   2) interpreted by Builder pages
 *   3) mirrored into the Character Sheet editor (editor.html)
 *
 * IMPORTANT:
 * - Other pages should not re-implement rule math (attribute caps, points, etc.)
 *   or invent their own field names. They should call helpers in this module.
 * - When you add new builder steps (e.g., Choose Class), add fields here first.
 *
 * Design goals:
 * - Backwards compatible with existing saved documents
 * - Safe, centralized sanitation/normalization of common fields
 * - Modular helpers so each page stays thin
 */

export const CHARACTER_SCHEMA_VERSION = 1;

// ---------- Canonical keys ----------

/** Attributes are always handled in this stable order. */
export const ATTR_KEYS = /** @type {const} */ ([
  "strength",
  "agility",
  "intellect",
  "willpower",
  "attunement",
  "heart",
]);

/** @typedef {typeof ATTR_KEYS[number]} AttrKey */

/** @typedef {{ [K in AttrKey]: number }} AttributeMap */

// ---------- Basic sanitation helpers ("good enough") ----------

/**
 * @param {any} v
 * @param {{min?: number, max?: number}} [opts]
 */
export function toInt(v, opts = {}) {
  const min = Number.isFinite(opts.min) ? /** @type {number} */ (opts.min) : 0;
  const max = Number.isFinite(opts.max) ? /** @type {number} */ (opts.max) : 999;
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Remove control characters + collapse whitespace. This is *not* HTML sanitization;
 * the UI must still render user strings via textContent (not innerHTML).
 *
 * @param {any} v
 * @param {{maxLen?: number}} [opts]
 */
export function sanitizeText(v, opts = {}) {
  const maxLen = Number.isFinite(opts.maxLen) ? /** @type {number} */ (opts.maxLen) : 200;
  let s = String(v ?? "");
  // Remove non-printing control chars.
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/**
 * Character display name.
 * @param {any} v
 */
export function sanitizeCharName(v) {
  return sanitizeText(v, { maxLen: 48 });
}

/**
 * URLs are stored as plain strings; we do a light "good enough" check.
 * @param {any} v
 */
export function sanitizeUrl(v) {
  const s = sanitizeText(v, { maxLen: 2048 });
  if (!s) return "";
  try {
    const u = new URL(s);
    // Allow only http/https for safety.
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

/**
 * Storage paths should be simple and predictable.
 * @param {any} v
 */
export function sanitizeStoragePath(v) {
  const s = sanitizeText(v, { maxLen: 512 });
  if (!s) return "";
  // Prevent odd path tricks. Keep it conservative.
  if (s.includes("..") || s.startsWith("/") || s.includes("\\")) return "";
  return s;
}

// ---------- Game-rule helpers (keep math centralized!) ----------

/**
 * Your builder currently supports levels 1-12.
 * @param {any} level
 */
export function clampLevel(level) {
  return toInt(level, { min: 1, max: 12 });
}

/**
 * Attribute points to spend during the "Basics" step.
 * Level 1 starts with 12; each level adds +3.
 * (Primary Attribute bonuses are applied later, during class selection.)
 *
 * @param {number} level
 */
export function getAttributePointsToSpend(level) {
  const L = clampLevel(level);
  return 12 + 3 * (L - 1);
}

/**
 * Final per-attribute cap at a given level.
 * Cap starts at 4 at level 1 and increases by 1 every even level.
 *
 * @param {number} level
 */
export function getAttributeFinalCap(level) {
  const L = clampLevel(level);
  return 4 + Math.floor(L / 2);
}

/**
 * During the Basics step (before a class is selected), you said:
 * - Level 2 cap is 5, but you can only *reach* 5 at level 2 by choosing a Primary Attribute later.
 * - This restriction should apply only at levels 1 and 2.
 *
 * @param {number} level
 */
export function getAttributeMaxDuringBasicsStep(level) {
  const cap = getAttributeFinalCap(level);
  return clampLevel(level) <= 2 ? cap - 1 : cap;
}

/**
 * Normalize an attribute map into a complete, integer-valued map.
 * @param {any} attrs
 */
export function normalizeAttributes(attrs) {
  /** @type {AttributeMap} */
  const out = /** @type {any} */ ({});
  const src = (attrs && typeof attrs === "object") ? attrs : {};
  for (const k of ATTR_KEYS) {
    out[k] = toInt(src[k], { min: 0, max: 99 });
  }
  return out;
}

/**
 * @param {AttributeMap} attrs
 */
export function sumAttributes(attrs) {
  return ATTR_KEYS.reduce((acc, k) => acc + (Number(attrs?.[k]) || 0), 0);
}

/**
 * Warning strings for saving from the Basics step.
 * @param {{ level: number, attributes: AttributeMap }} args
 */
export function getBasicsWarnings(args) {
  const level = clampLevel(args.level);
  const attrs = normalizeAttributes(args.attributes);
  const total = getAttributePointsToSpend(level);
  const used = sumAttributes(attrs);
  const remaining = total - used;

  /** @type {string[]} */
  const warnings = [];
  if (remaining !== 0) warnings.push(`You have <strong>${remaining}</strong> unspent attribute point(s).`);

  const zeros = ATTR_KEYS.filter((k) => (Number(attrs[k]) || 0) === 0);
  if (zeros.length) warnings.push(`Some attributes are <strong>0</strong> (auto-fail on rolls): ${zeros.join(", ")}.`);

  return warnings;
}

// ---------- Document normalization / patch helpers ----------

/**
 * Create a new Character doc baseline (safe defaults).
 * This is intentionally small; the sheet/editor populates additional fields.
 *
 * @param {{ ownerUid: string, name?: string }} args
 */
export function createDefaultCharacterDoc(args) {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    ownerUid: String(args.ownerUid || ""),
    name: sanitizeCharName(args.name || "Character"),
    portraitUrl: "",
    portraitPath: "",
    builder: {
      level: 1,
      attributes: normalizeAttributes({}),
      visitedSteps: [],
    },
    // Sheet is optional; editor.html can add it.
    sheet: {
      fields: {},
    },
  };
}

/**
 * Normalize a raw Firestore doc into a safe, predictable shape.
 * Keeps unknown fields (forward-compatible), but ensures known sub-objects exist.
 *
 * @param {any} raw
 */
export function normalizeCharacterDoc(raw) {
  const doc = (raw && typeof raw === "object") ? { ...raw } : {};

  // Schema versioning hook.
  if (!Number.isFinite(doc.schemaVersion)) doc.schemaVersion = CHARACTER_SCHEMA_VERSION;

  // Core fields
  doc.name = sanitizeCharName(doc.name || "");
  doc.portraitUrl = sanitizeUrl(doc.portraitUrl || "");
  doc.portraitPath = sanitizeStoragePath(doc.portraitPath || "");

  // Builder block
  if (!doc.builder || typeof doc.builder !== "object") doc.builder = {};
  if (!Number.isFinite(doc.builder.level)) {
    // Backfill from sheet when migrating old docs.
    const lvl = doc?.sheet?.fields?.level;
    doc.builder.level = Number.isFinite(lvl) ? clampLevel(lvl) : 1;
  } else {
    doc.builder.level = clampLevel(doc.builder.level);
  }

  if (!doc.builder.attributes || typeof doc.builder.attributes !== "object") {
    // Backfill from sheet when migrating old docs.
    const sf = doc?.sheet?.fields || {};
    doc.builder.attributes = normalizeAttributes(sf);
  } else {
    doc.builder.attributes = normalizeAttributes(doc.builder.attributes);
  }

  if (!Array.isArray(doc.builder.visitedSteps)) doc.builder.visitedSteps = [];

  // Sheet block
  if (!doc.sheet || typeof doc.sheet !== "object") doc.sheet = {};
  if (!doc.sheet.fields || typeof doc.sheet.fields !== "object") doc.sheet.fields = {};

  return doc;
}

/**
 * Build the update patch for the "Basics" builder step.
 * Uses dot-path keys to avoid clobbering unrelated maps.
 *
 * @param {{
 *  name: any,
 *  level: any,
 *  attributes: any,
 *  portraitUrl: any,
 *  portraitPath: any,
 * }} args
 */
export function buildBasicsUpdatePatch(args) {
  const level = clampLevel(args.level);
  const attrs = normalizeAttributes(args.attributes);

  const name = sanitizeCharName(args.name);
  const portraitUrl = sanitizeUrl(args.portraitUrl);
  const portraitPath = sanitizeStoragePath(args.portraitPath);

  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    name,
    portraitUrl,
    portraitPath,

    "builder.level": level,
    "builder.attributes": attrs,

    // Mirror key Basics values into the sheet so editor.html displays them immediately.
    "sheet.fields.charName": name,
    "sheet.fields.level": level,
    "sheet.fields.strength": attrs.strength,
    "sheet.fields.agility": attrs.agility,
    "sheet.fields.intellect": attrs.intellect,
    "sheet.fields.willpower": attrs.willpower,
    "sheet.fields.attunement": attrs.attunement,
    "sheet.fields.heart": attrs.heart,
  };
}

/**
 * Apply canonical fields into a sheet state (for editor.html), without overwriting
 * unrelated sheet data.
 *
 * @param {any} normalizedDoc A doc that has been normalized by normalizeCharacterDoc().
 */
export function getSheetStateForEditor(normalizedDoc) {
  const doc = normalizeCharacterDoc(normalizedDoc);
  const sheet = (doc.sheet && typeof doc.sheet === "object") ? { ...doc.sheet } : {};
  sheet.fields = (sheet.fields && typeof sheet.fields === "object") ? { ...sheet.fields } : {};

  // Builder fields are canonical for these.
  const level = clampLevel(doc.builder.level);
  const attrs = normalizeAttributes(doc.builder.attributes);

  // Always reflect canonical basics into fields.
  sheet.fields.charName = sheet.fields.charName || doc.name || "";
  sheet.fields.level = level;
  for (const k of ATTR_KEYS) sheet.fields[k] = attrs[k];

  // Portrait is stored at top-level; sheet.portrait is used by the sheet editor.
  if (doc.portraitUrl && !sheet.portrait) sheet.portrait = doc.portraitUrl;

  return sheet;
}

/**
 * Central sanitation for update patches written to Firestore.
 * This keeps "security" behind the scenes (pages shouldn't each do it).
 *
 * NOTE: This is intentionally conservative and only touches known keys.
 * Unknown keys pass through untouched.
 *
 * @param {Record<string, any>} patch
 */
export function sanitizeUpdatePatch(patch) {
  const out = { ...patch };

  if (Object.prototype.hasOwnProperty.call(out, "schemaVersion")) {
    out.schemaVersion = CHARACTER_SCHEMA_VERSION;
  }

  if (Object.prototype.hasOwnProperty.call(out, "name")) {
    out.name = sanitizeCharName(out.name);
    // Keep sheet charName in sync if caller is also updating it.
    if (Object.prototype.hasOwnProperty.call(out, "sheet.fields.charName")) {
      out["sheet.fields.charName"] = sanitizeCharName(out["sheet.fields.charName"]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(out, "portraitUrl")) {
    out.portraitUrl = sanitizeUrl(out.portraitUrl);
  }
  if (Object.prototype.hasOwnProperty.call(out, "portraitPath")) {
    out.portraitPath = sanitizeStoragePath(out.portraitPath);
  }

  if (Object.prototype.hasOwnProperty.call(out, "builder.level")) {
    out["builder.level"] = clampLevel(out["builder.level"]);
  }
  if (Object.prototype.hasOwnProperty.call(out, "builder.attributes")) {
    out["builder.attributes"] = normalizeAttributes(out["builder.attributes"]);
  }

  // Sanitize mirrored sheet fields when present.
  if (Object.prototype.hasOwnProperty.call(out, "sheet.fields.level")) {
    out["sheet.fields.level"] = clampLevel(out["sheet.fields.level"]);
  }

  for (const k of ATTR_KEYS) {
    const key = `sheet.fields.${k}`;
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = toInt(out[key], { min: 0, max: 99 });
    }
  }

  if (Object.prototype.hasOwnProperty.call(out, "sheet.portrait")) {
    out["sheet.portrait"] = sanitizeUrl(out["sheet.portrait"]);
  }

  return out;
}
