// public/game-data.js
//
// Single source of truth for reading Game X exported JSON.
// All consumers should load via this module (no per-page fetch duplication).

import { sanitizeText, sanitizeStringArray } from "./data-sanitization.js";
import { projectSkillNames } from "./skill-identity.js";
import { getEntryRequiredLevel, collectSelectedEntries } from "./option-groups.js";
import {
  getEntryGrants,
  sanitizeGrantType,
} from "./grants.js";

let _gameXDataPromise = null;

export { getEntryGrants, getGrantName, getGrantNotes } from "./grants.js";

export async function loadGameXData({ cache = "default" } = {}) {
  if (_gameXDataPromise) return _gameXDataPromise;

  _gameXDataPromise = (async () => {
    const dataUrl = new URL("../../data/game-x/game-x-data.json", import.meta.url);
    const res = await fetch(dataUrl, { cache });
    if (!res.ok) throw new Error(`Could not load game-x-data.json (${res.status})`);
    return projectSkillNames(await res.json());
  })();

  try {
    return await _gameXDataPromise;
  } catch (e) {
    _gameXDataPromise = null;
    throw e;
  }
}

export async function loadGameXClasses({ cache = "default" } = {}) {
  const data = await loadGameXData({ cache });
  return getGameXClasses(data);
}

export async function loadGameXTechniques({ cache = "default" } = {}) {
  const data = await loadGameXData({ cache });
  return getGameXTechniques(data);
}

export async function loadGameXOrigins({ cache = "default" } = {}) {
  const data = await loadGameXData({ cache });
  return getGameXOrigins(data);
}

export function getGameXClasses(gameData) {
  return Array.isArray(gameData?.classes) ? gameData.classes : [];
}

export function getGameXClassFeatures(gameData, classKey) {
  const key = sanitizeText(classKey || "", { maxLen: 64, collapse: true });
  const featuresByClass = (gameData?.classFeatures && typeof gameData.classFeatures === "object") ? gameData.classFeatures : {};
  return Array.isArray(featuresByClass[key]) ? featuresByClass[key] : [];
}

export function getGameXFeats(gameData) {
  return Array.isArray(gameData?.feats) ? gameData.feats : [];
}

export function getFeatClassKey(feat) {
  const legacyClassKey = sanitizeText(feat?.classKey || "", { maxLen: 64, collapse: true });
  if (legacyClassKey) return legacyClassKey;
  if (String(feat?.featType || "").trim().toLowerCase() !== "class") return "";
  return sanitizeText(feat?.category || "", { maxLen: 64, collapse: true });
}

export function getGameXFeatsForClass(gameData, classKey) {
  const key = sanitizeText(classKey || "", { maxLen: 64, collapse: true });
  return getGameXFeats(gameData).filter((feat) => getFeatClassKey(feat) === key);
}

export function getGameXTechniques(gameData) {
  return Array.isArray(gameData?.techniques) ? gameData.techniques : [];
}

export function getGameXOrigins(gameData) {
  return Array.isArray(gameData?.origins) ? gameData.origins : [];
}

export function getGameXWeaponBases(gameData) {
  return Array.isArray(gameData?.weaponBases) ? gameData.weaponBases : [];
}

export function getGameXWeaponEnhancements(gameData) {
  return Array.isArray(gameData?.weaponEnhancements) ? gameData.weaponEnhancements : [];
}

export function getOriginByKey(origins, originKey) {
  const key = sanitizeText(originKey || "", { maxLen: 64, collapse: true });
  const list = Array.isArray(origins) ? origins : [];
  return list.find((origin) => String(origin?.originKey || "").trim() === key) || null;
}

export function buildTechniqueIndexes(techniques) {
  const byKey = new Map();
  const byName = new Map();
  const byNorm = new Map();

  const list = Array.isArray(techniques) ? techniques : [];
  for (const t of list) {
    const key = String(t?.techniqueKey ?? "").trim();
    const name = String(t?.techniqueName ?? "").trim();
    if (key) byKey.set(key, t);
    if (!name) continue;
    byName.set(name, t);
    const norm = normalizeRef(name);
    if (norm) {
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm).push(t);
    }
  }

  return { byKey, byName, byNorm };
}

export function normalizeRef(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a stored technique reference (techniqueName) against the exported list.
 * - exact match first
 * - then normalized match if it is unambiguous
 */
export function resolveTechniqueRef(refName, indexes) {
  const raw = String(refName ?? "").trim();
  if (!raw) return { ok: false, technique: null };

  const { byKey, byName, byNorm } = indexes || {};
  if (byKey instanceof Map && byKey.has(raw)) {
    return { ok: true, technique: byKey.get(raw) };
  }
  if (byName instanceof Map && byName.has(raw)) {
    return { ok: true, technique: byName.get(raw) };
  }

  const norm = normalizeRef(raw);
  if (byNorm instanceof Map && byNorm.has(norm)) {
    const matches = byNorm.get(norm);
    if (Array.isArray(matches) && matches.length === 1) {
      return { ok: true, technique: matches[0] };
    }
  }

  return { ok: false, technique: null };
}

function getClassFeaturesForBuilder(data, builder) {
  const b = (builder && typeof builder === "object") ? builder : {};
  const classKey = sanitizeText(b.classKey || "", { maxLen: 64, collapse: true });
  const level = Number.parseInt(String(b.level ?? 1), 10);
  const L = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;
  const selectedOptKeys = new Set(
    sanitizeStringArray(b.selectedClassFeatureOptions, { maxItems: 500, maxLen: 200 })
  );

  const features = getGameXClassFeatures(data, classKey);
  const out = [];

  for (const f of features) {
    if (getEntryRequiredLevel(f) > L) continue;
    out.push(f);
    collectSelectedEntries([f], selectedOptKeys, out);
  }

  return out;
}

function getSelectedFeatsForBuilder(data, builder) {
  const b = (builder && typeof builder === "object") ? builder : {};
  const level = Number.parseInt(String(b.level ?? 1), 10);
  const L = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;
  const selectedFeatKeys = new Set(
    sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 })
  );
  const selectedFeatOptKeys = new Set(
    sanitizeStringArray(b.selectedFeatOptions, { maxItems: 500, maxLen: 200 })
  );

  const feats = getGameXFeats(data);
  const out = [];
  for (const feat of feats) {
    const key = sanitizeText(feat?.featKey || "", { maxLen: 128, collapse: true });
    if (!key || !selectedFeatKeys.has(key)) continue;
    if (getEntryRequiredLevel(feat) > L) continue;
    out.push(feat);
    collectSelectedEntries([feat], selectedFeatOptKeys, out);
  }
  return out;
}

function getOriginEntriesForBuilder(data, builder) {
  const b = (builder && typeof builder === "object") ? builder : {};
  const originKey = sanitizeText(b.originKey || "", { maxLen: 64, collapse: true });
  if (!originKey) return [];
  const origin = getOriginByKey(getGameXOrigins(data), originKey);
  if (!origin) return [];
  return [origin].concat(Array.isArray(origin.features) ? origin.features : []);
}

function getActiveGrantEntries(gameData, builder) {
  const data = (gameData && typeof gameData === "object") ? gameData : {};
  return []
    .concat(getClassFeaturesForBuilder(data, builder))
    .concat(getSelectedFeatsForBuilder(data, builder))
    .concat(getOriginEntriesForBuilder(data, builder));
}

/**
 * Builds the single grants view for a character.
 *
 * A grant collection answers: "Given this builder state, what mechanical
 * grants are active?"  Pages should derive skills, techniques, equipment
 * affordances, and future grant-driven UI from this object instead of
 * rediscovering class features, selected options, feats, and origins.
 */
export function createCharacterGrantCollection(gameData, builder) {
  const entries = getActiveGrantEntries(gameData, builder);
  const grants = entries.flatMap((entry) => getEntryGrants(entry));
  const byType = new Map();

  for (const grant of grants) {
    if (!byType.has(grant.type)) byType.set(grant.type, []);
    byType.get(grant.type).push(grant);
  }

  const getAll = (type = "") => {
    const cleanType = type ? sanitizeGrantType(type, { name: "grant collection lookup" }) : "";
    return cleanType ? (byType.get(cleanType) || []) : grants;
  };

  return {
    entries,
    grants,
    byType,
    getAll,
    skillGrants: byType.get("skill") || [],
    techniqueGrants: byType.get("technique") || [],
    techniqueChoiceGrants: byType.get("technique-choice") || [],
    weaponGrants: byType.get("weapon") || [],
    weaponEnhancementGrants: byType.get("weapon-enhancement") || [],
    specializationGrants: byType.get("specialization") || [],
  };
}
