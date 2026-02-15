// public/character-schema.js
//
// SINGLE SOURCE OF TRUTH for canonical character data stored in Firestore.
//
// Firestore document shape (relevant parts):
// {
//   schemaVersion: 3,
//   ownerUid: string,
//   builder: {
//     name: string,
//     portraitPath: string,          // Firebase Storage path (NOT a URL)
//     level: number,
//     classKey: string,              // kebab-case token
//     primaryAttribute: AttrKey,
//     attributes: AttributeMap,      // EFFECTIVE (final) values (includes +1 primary bonus)
//     selectedClassFeatureOptions: string[],
//     selectedFeats: string[],
//     autoAbilityNames: string[],
//     visitedSteps: string[],
//     lastVisitedAt: any,
//     sheet: {
//       fields: Record<string, any>,
//       repeatables: Record<string, any>,
//     }
//   },
//   createdAt: Timestamp,
//   updatedAt: Timestamp
// }
//
// IMPORTANT:
// - No legacy backfill. No reads/writes of old/duplicate locations.
// - The character sheet theme is derived from the class dropdown value; it is never stored.

export const CHARACTER_SCHEMA_VERSION = 3;

// ---- Attribute keys / labels ----

export const ATTR_KEYS = [
  "strength",
  "agility",
  "intellect",
  "willpower",
  "attunement",
  "heart",
];

export const ATTR_LABELS = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  willpower: "Willpower",
  attunement: "Attunement",
  heart: "Heart",
};

export function labelForAttrKey(k) {
  return ATTR_LABELS[k] || String(k || "");
}

// ---- Primitive helpers ----

function stripControlChars(s) {
  return String(s ?? "")
    // Remove C0/C1 controls except: \t (9), \n (10), \r (13)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}

function collapseSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function sanitizeText(value, { maxLen = 256, collapse = false } = {}) {
  let s = stripControlChars(value);
  s = collapse ? collapseSpaces(s) : String(s).trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizeCharName(value) {
  return sanitizeText(value, { maxLen: 64, collapse: true });
}

export function sanitizeStoragePath(value, { maxLen = 256 } = {}) {
  const s = sanitizeText(value, { maxLen, collapse: true });
  if (!s) return "";
  // Conservative allowed charset.
  if (!/^[a-zA-Z0-9_\-./]+$/.test(s)) return "";
  return s;
}

export function toInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function clampLevel(level) {
  return toInt(level, { min: 1, max: 12 });
}

/**
 * Normalize an enum-ish token for safe storage/lookup:
 * - trims, collapses whitespace, lowercases
 * - allows only [a-z0-9_-]
 */
export function normalizeEnumToken(value, { maxLen = 64 } = {}) {
  const s = sanitizeText(value, { maxLen, collapse: true }).toLowerCase();
  if (!s) return "";
  return s.replace(/[^a-z0-9_-]/g, "");
}

// ---- Attribute normalization + caps ----

export function coerceAttrKey(v) {
  const s = String(v || "").trim().toLowerCase();
  return ATTR_KEYS.includes(s) ? s : "";
}

export function normalizeAttributes(obj, { min = 0, max = 99 } = {}) {
  const out = {};
  const src = (obj && typeof obj === "object") ? obj : {};
  for (const k of ATTR_KEYS) out[k] = toInt(src[k], { min, max });
  return out;
}

// This math comes from the game rules, and should NOT be changed
export function getAttributePointsToSpend(level) {
  const L = clampLevel(level);
  return 12 + 3 * (L - 1);
}

// This math comes from the game rules, and should NOT be changed
export function getAttributeFinalCap(level) {
  const L = clampLevel(level);
  return 4 + Math.floor(L / 2);
}

// This math comes from the game rules, and should NOT be changed
export function getAttributeEffectiveCap(level, attrKey, primaryAttrKey) {
  const L = clampLevel(level);
  const cap = getAttributeFinalCap(L);

  const a = coerceAttrKey(attrKey);
  const p = coerceAttrKey(primaryAttrKey);

  if (!a) return cap;
  if (L <= 2 && p && a !== p) return Math.max(0, cap - 1);
  return cap;
}


// ---- Portrait storage path (Storage, not Firestore) ----

export function getPortraitStoragePath({ uid, charId } = {}) {
  const safeUid = sanitizeText(uid, { maxLen: 128, collapse: true });
  const safeId = sanitizeText(charId, { maxLen: 128, collapse: true });
  if (!safeUid || !safeId) return "";
  // Stable filename (no extension so contentType can vary).
  return `portraits/${safeUid}/${safeId}/portrait`;
}

// ---- Repeatables sanitization ----

function sanitizeStringArray(v, { maxItems = 200, maxLen = 128 } = {}) {
  const arr = Array.isArray(v) ? v : [];
  const out = [];
  for (const item of arr) {
    const s = sanitizeText(item, { maxLen, collapse: true });
    if (!s) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeRepeatableAbilities(v) {
  const arr = Array.isArray(v) ? v : [];
  const out = [];
  for (const raw of arr) {
    const o = (raw && typeof raw === "object") ? raw : {};
    const name = sanitizeText(o.name, { maxLen: 120, collapse: true });
    const text = sanitizeText(o.text, { maxLen: 4000, collapse: false });
    if (!name && !text) continue;
    out.push({ name, text });
    if (out.length >= 200) break;
  }
  return out;
}

// ---- Document construction / normalization ----

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

  return {
    // Keep timestamps if present for UI (characters list, etc.)
    createdAt: src.createdAt ?? null,
    updatedAt: src.updatedAt ?? null,

    schemaVersion: toInt(src.schemaVersion ?? CHARACTER_SCHEMA_VERSION, { min: 0, max: 9999 }),
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

      sheet: {
        fields: sheetFields,
        repeatables: sheetRepeatables,
      },
    },
  };
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

// ---- Patch sanitization gate for builder pages ----

/**
 * Sanitize an updateDoc patch (dot-path form).
 * This acts as a *schema gate* so builder pages cannot accidentally write outside builder.*.
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


// ---- Game X data loaders (JSON in /public/data) ----

// Cached for the lifetime of the page.
let _gameXClassesPromise = null;

/**
 * Loads the Game X class list from /data/game-x/classes.json.
 * This is UI/data plumbing used to avoid duplicating class data in HTML/JS.
 */
export async function loadGameXClasses({ cache = 'no-store' } = {}) {
  if (_gameXClassesPromise) return _gameXClassesPromise;

  _gameXClassesPromise = (async () => {
    const res = await fetch('./data/game-x/classes.json', { cache });
    if (!res.ok) throw new Error(`Failed to load classes.json (${res.status})`);

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  })();

  try {
    return await _gameXClassesPromise;
  } catch (e) {
    _gameXClassesPromise = null;
    throw e;
  }
}


// ---- Derived sheet fields (computed; not stored) ----

// This math comes from the game rules, and should NOT be changed
const HP_MODELS = {
  low: { base: 40, per: 8 },
  medium: { base: 50, per: 10 },
  high: { base: 60, per: 12 },
};

function normalizeHpProgressionLabel(v) {
  const s = sanitizeText(v, { maxLen: 16, collapse: true }).toLowerCase();
  if (s === 'low') return 'low';
  if (s === 'medium') return 'medium';
  if (s === 'high') return 'high';
  return '';
}

async function getClassHpModel(classKey) {
  const key = sanitizeText(classKey, { maxLen: 64, collapse: true });
  let prog = '';

  try {
    const list = await loadGameXClasses();
    const found = Array.isArray(list) ? list.find((c) => String(c?.classKey || '').trim() === key) : null;
    prog = normalizeHpProgressionLabel(found?.hpProgression || '');
  } catch (e) {
    // Best-effort; derive with defaults below.
    prog = '';
  }

  // Some entries in classes.json still have blank hpProgression while that data is being updated.
  // Defaulting to 'low' keeps derivations usable without duplicating class-specific tables here.
  const tier = prog || 'low';
  return HP_MODELS[tier] || HP_MODELS.low;
}

function bestOf(a, b) {
  const aa = Number.isFinite(a) ? a : 0;
  const bb = Number.isFinite(b) ? b : 0;
  return Math.max(aa, bb);
}

/**
 * Speed (in squares): 4 + Agility
 */
export function computeSpeed(attributes) {
  const attrs = normalizeAttributes(attributes || {});
  return 4 + (Number.isFinite(attrs.agility) ? attrs.agility : 0);
}

/**
 * Physical Defense total: Training Rank + best of (Strength, Agility)
 */
export function computePhysicalDefense({ attributes, trainingRank } = {}) {
  const attrs = normalizeAttributes(attributes || {});
  const tr = toInt(trainingRank ?? 0, { min: 0, max: 6 });
  const base = bestOf(attrs.strength, attrs.agility);
  return base + tr;
}

/**
 * Mental Defense total: Training Rank + best of (Intellect, Willpower)
 */
export function computeMentalDefense({ attributes, trainingRank } = {}) {
  const attrs = normalizeAttributes(attributes || {});
  const tr = toInt(trainingRank ?? 0, { min: 0, max: 6 });
  const base = bestOf(attrs.intellect, attrs.willpower);
  return base + tr;
}

/**
 * Spirit Defense total: Training Rank + best of (Attunement, Heart)
 */
export function computeSpiritDefense({ attributes, trainingRank } = {}) {
  const attrs = normalizeAttributes(attributes || {});
  const tr = toInt(trainingRank ?? 0, { min: 0, max: 6 });
  const base = bestOf(attrs.attunement, attrs.heart);
  return base + tr;
}

/**
 * HP Max:
 * BASE(L1) + (PER_LEVEL * (level-1)) + (Strength * (level + 2))
 */
export async function computeMaxHP({ level, classKey, attributes } = {}) {
  const L = clampLevel(level ?? 1);
  const attrs = normalizeAttributes(attributes || {});
  const hpModel = await getClassHpModel(classKey);
  const str = Number.isFinite(attrs.strength) ? attrs.strength : 0;
  return Math.round(hpModel.base + (hpModel.per * (L - 1)) + (str * (L + 2)));
}
