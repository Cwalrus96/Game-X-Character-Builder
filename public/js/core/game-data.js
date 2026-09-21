// public/game-data.js
//
// Single source of truth for reading Game X exported JSON.
// All consumers should load via this module (no per-page fetch duplication).

import { sanitizeText, sanitizeStringArray } from "./data-sanitization.js";
import { projectSkillNames } from "./skill-identity.js";
import { getEntryRequiredLevel, collectSelectedEntries } from "./option-groups.js";
import { isGameDataRecordExecutable } from "./selection-rules.js";
import {
  getEntryGrants,
  sanitizeGrantType,
} from "./grants.js";

let _gameXDataPromise = null;

export { getEntryGrants, getGrantName, getGrantNotes } from "./grants.js";

export const SUPPORTED_RUNTIME_ARTIFACT_VERSIONS = Object.freeze([2, 3]);

export function validateRuntimeGameData(data) {
  const diagnostics = [];
  if (!SUPPORTED_RUNTIME_ARTIFACT_VERSIONS.includes(data?.schemaVersion)) {
    diagnostics.push({ code: "runtime-schema-version", message: "Expected runtime artifact schema 2 or 3." });
  }
  const fields = ["classes", "classSkills", "feats", "techniques", "origins", "weaponBases", "weaponEnhancements"];
  if (data?.schemaVersion === 3) {
    fields.push("traits");
    if (data.sourceSchemaVersion !== 5 || data.expressionSyntaxVersion !== 3) {
      diagnostics.push({ code: "runtime-source-version", message: "Runtime artifact schema 3 requires source schema 5 and expression syntax 3." });
    }
  }
  for (const field of fields) {
    if (!Array.isArray(data?.[field])) diagnostics.push({ code: "runtime-collection-shape", message: `${field} must be an array.` });
  }
  if (!data?.classFeatures || typeof data.classFeatures !== "object" || Array.isArray(data.classFeatures)) {
    diagnostics.push({ code: "runtime-collection-shape", message: "classFeatures must be indexed by class key." });
  }
  if (data?.schemaVersion === 3) {
    const visit = (entries) => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry?.expressionSyntaxVersion !== 3 || !["supported", "deferred"].includes(entry?.runtimeSupport?.status)) {
          diagnostics.push({ code: "runtime-support-metadata", message: `Missing versioned execution status on ${entry?.featureKey || entry?.featKey || entry?.techniqueKey || entry?.traitKey || entry?.name || "record"}.` });
        }
        visit(entry?.options);
        visit(entry?.features);
      }
    };
    for (const field of fields.filter((field) => field !== "classSkills")) visit(data[field]);
    for (const entries of Object.values(data.classFeatures || {})) visit(entries);
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export async function loadGameXData({ cache = "default" } = {}) {
  if (_gameXDataPromise) return _gameXDataPromise;

  _gameXDataPromise = (async () => {
    const dataUrl = new URL("../../data/game-x/game-x-data.json", import.meta.url);
    const res = await fetch(dataUrl, { cache });
    if (!res.ok) throw new Error(`Could not load game-x-data.json (${res.status})`);
    const data = await res.json();
    const validation = validateRuntimeGameData(data);
    if (!validation.ok) throw new Error(validation.diagnostics.map((item) => item.message).join(" "));
    return projectSkillNames(data);
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

export function getGameXTraits(gameData) {
  return Array.isArray(gameData?.traits) ? gameData.traits : [];
}

export function resolveTraitRef(refKey, gameData) {
  const key = String(refKey ?? "").trim();
  // This user-authored rename is an identity alias, not a general key rewrite.
  const canonical = key === "mech-integrated-weapon" ? "integrated-weapon" : key;
  const traits = getGameXTraits(gameData);
  const exact = traits.filter((trait) => trait.traitKey === key);
  if (exact.length === 1) return { ok: true, trait: exact[0] };
  const matches = traits.filter((trait) => trait.traitKey === canonical);
  return matches.length === 1 ? { ok: true, trait: matches[0] } : { ok: false, trait: null };
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
    // A repeated label is legal; never resolve that ambiguous label to the last row.
    if (byName.has(name)) byName.set(name, null);
    else byName.set(name, t);
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

function collectRuntimeSelectedEntries(entries, selectedKeys, out) {
  for (const entry of entries) {
    if (entry?.expressionSyntaxVersion !== 3) {
      collectSelectedEntries([entry], selectedKeys, out);
      continue;
    }
    if (!isGameDataRecordExecutable(entry)) continue;
    for (const option of entry.options || []) {
      const key = option.featureKey || option.featKey;
      if (!key || !selectedKeys.has(key)) continue;
      out.push(option);
      collectRuntimeSelectedEntries([option], selectedKeys, out);
    }
  }
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
  if (byName instanceof Map && byName.get(raw)) {
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
    collectRuntimeSelectedEntries([f], selectedOptKeys, out);
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
    collectRuntimeSelectedEntries([feat], selectedFeatOptKeys, out);
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
  const allEntries = getActiveGrantEntries(gameData, builder);
  const entries = allEntries.filter(isGameDataRecordExecutable);
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
    deferredEntries: allEntries.filter((entry) => !isGameDataRecordExecutable(entry)),
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
