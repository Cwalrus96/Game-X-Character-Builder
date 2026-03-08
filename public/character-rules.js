// public/character-rules.js
//
// Single source of truth for Game X rule math and derived values.
// Pure logic only: no Firestore, no DOM.

import { sanitizeText, toInt } from "./data-sanitization.js";
import { loadGameXClasses } from "./game-data.js";

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

export function clampLevel(level) {
  const n = Number.parseInt(String(level), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(12, n));
}

export function coerceAttrKey(v) {
  const s = sanitizeText(v, { maxLen: 32, collapse: true }).toLowerCase();
  return ATTR_KEYS.includes(s) ? s : "";
}



export const SKILL_RANK_OPTIONS = [
  { value: '', label: '' },
  { value: '0', label: '0 - Untrained' },
  { value: '1', label: '1 - Beginner' },
  { value: '2', label: '2 - Advanced' },
  { value: '3', label: '3 - Master' },
  { value: '4', label: '4 - Legendary' },
  { value: '5', label: '5 - Super' },
  { value: '6', label: '6 - Cosmic' },
];

export const DEFENSE_SKILL_FIELDS = [
  { key: 'rank_physdef', label: 'Physical Defense Training' },
  { key: 'rank_mentdef', label: 'Mental Defense Training' },
  { key: 'rank_spiritdef', label: 'Spiritual Defense Training' },
];

export const CORE_SKILL_FIELDS = [
  { key: 'rank_academics', label: 'Academics' },
  { key: 'rank_athletics', label: 'Athletics' },
  { key: 'rank_crafting', label: 'Crafting' },
  { key: 'rank_culinary', label: 'Culinary' },
  { key: 'rank_deception', label: 'Deception' },
  { key: 'rank_influence', label: 'Influence' },
  { key: 'rank_insight', label: 'Insight' },
  { key: 'rank_medicine', label: 'Medicine' },
  { key: 'rank_nature', label: 'Nature' },
  { key: 'rank_observation', label: 'Observation' },
  { key: 'rank_performance', label: 'Performance' },
  { key: 'rank_roguery', label: 'Roguery' },
  { key: 'rank_society', label: 'Society' },
  { key: 'rank_spirituality', label: 'Spirituality' },
  { key: 'rank_stealth', label: 'Stealth' },
];

export function normalizeSkillRank(value, { allowBlank = true } = {}) {
  const raw = sanitizeText(value, { maxLen: 8, collapse: true });
  if (allowBlank && raw === '') return '';
  return String(toInt(raw, { min: 0, max: 6 }));
}

export function formatSkillRankLabel(value) {
  const normalized = normalizeSkillRank(value, { allowBlank: true });
  const found = SKILL_RANK_OPTIONS.find((it) => String(it.value) === String(normalized));
  return found ? found.label : '';
}

export function normalizeAttributes(obj, { min = 0, max = 99 } = {}) {
  const src = (obj && typeof obj === "object") ? obj : {};
  const out = {};
  for (const k of ATTR_KEYS) {
    out[k] = toInt(src[k] ?? 0, { min, max });
  }
  return out;
}

// ---- Techniques (Game X rules) ----

// Combat Techniques: you know a number equal to your Primary Attribute.
export function computeTechniqueSlots(primaryAttrKey, attributes) {
  const p = coerceAttrKey(primaryAttrKey);
  const a = normalizeAttributes(attributes || {}, { min: 0, max: 99 });
  const slots = p ? toInt(a[p], { min: 0, max: 99 }) : 0;
  return { primaryAttrKey: p, slots };
}

// ---- Attribute caps / points (Game X rules) ----

// This math comes from the rules of the game, and should NOT change, unless the game rules change.
export function getAttributePointsToSpend(level) {
  const L = clampLevel(level);
  return 12 + 3 * (L - 1);
}

// This math comes from the rules of the game, and should NOT change, unless the game rules change.
export function getAttributeFinalCap(level) {
  const L = clampLevel(level);
  return 4 + Math.floor(L / 2);
}

// This math comes from the rules of the game, and should NOT change, unless the game rules change.
export function getAttributeEffectiveCap(level, attrKey, primaryAttrKey) {
  const L = clampLevel(level);
  const cap = getAttributeFinalCap(L);

  const a = coerceAttrKey(attrKey);
  const p = coerceAttrKey(primaryAttrKey);

  if (!a) return cap;
  if (L <= 2 && p && a !== p) return Math.max(0, cap - 1);
  return cap;
}

// ---- Derived sheet fields ----

// This math comes from the game rules, and should NOT be changed
const HP_MODELS = {
  low: { base: 40, per: 8 },
  medium: { base: 50, per: 10 },
  high: { base: 60, per: 12 },
};

function bestOf(a, b) {
  const x = Number.isFinite(a) ? a : 0;
  const y = Number.isFinite(b) ? b : 0;
  return Math.max(x, y);
}

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

// This math comes from the rules of the game, and should NOT change, unless the game rules change.
export function computeSpeed(attributes) {
  const a = normalizeAttributes(attributes || {});
  // Existing behavior: speed derived from agility.
  return 4 + a.agility;
}

// This math comes from the game rules, and should NOT be changed
export function computePhysicalDefense({ attributes, trainingRank } = {}) {
  const attrs = normalizeAttributes(attributes || {});
  const tr = toInt(trainingRank ?? 0, { min: 0, max: 6 });
  const base = bestOf(attrs.strength, attrs.agility);
  return base + tr;
}

// This math comes from the game rules, and should NOT be changed
export function computeMentalDefense({ attributes, trainingRank } = {}) {
  const attrs = normalizeAttributes(attributes || {});
  const tr = toInt(trainingRank ?? 0, { min: 0, max: 6 });
  const base = bestOf(attrs.intellect, attrs.willpower);
  return base + tr;
}

// This math comes from the game rules, and should NOT be changed
export function computeSpiritDefense({ attributes, trainingRank } = {}) {
  const attrs = normalizeAttributes(attributes || {});
  const tr = toInt(trainingRank ?? 0, { min: 0, max: 6 });
  const base = bestOf(attrs.attunement, attrs.heart);
  return base + tr;
}

// This math comes from the game rules, and should NOT be changed
export async function computeMaxHP({ level, classKey, attributes } = {}) {
  const L = clampLevel(level ?? 1);
  const attrs = normalizeAttributes(attributes || {});
  const hpModel = await getClassHpModel(classKey);
  const str = Number.isFinite(attrs.strength) ? attrs.strength : 0;
  return Math.round(hpModel.base + (hpModel.per * (L - 1)) + (str * (L + 2)));
}
