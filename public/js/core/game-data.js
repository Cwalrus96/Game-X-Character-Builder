// public/game-data.js
//
// Single source of truth for reading Game X exported JSON.
// All consumers should load via this module (no per-page fetch duplication).

import { sanitizeText, sanitizeStringArray } from "./data-sanitization.js";
import { getEntryRequiredLevel, collectSelectedEntries } from "./option-groups.js";
import {
  getEntryGrants,
  getGrantName,
  getGrantNotes,
  normalizeSkillProgression,
  sanitizeGrantType,
} from "./grants.js";

let _gameXDataPromise = null;

export { getEntryGrants, getGrantName, getGrantNotes } from "./grants.js";

export async function loadGameXData({ cache = "no-store" } = {}) {
  if (_gameXDataPromise) return _gameXDataPromise;

  _gameXDataPromise = (async () => {
    const dataUrl = new URL("../../data/game-x/game-x-data.json", import.meta.url);
    const res = await fetch(dataUrl, { cache });
    if (!res.ok) throw new Error(`Could not load game-x-data.json (${res.status})`);
    return await res.json();
  })();

  try {
    return await _gameXDataPromise;
  } catch (e) {
    _gameXDataPromise = null;
    throw e;
  }
}

export async function loadGameXClasses({ cache = "no-store" } = {}) {
  const data = await loadGameXData({ cache });
  return getGameXClasses(data);
}

export async function loadGameXTechniques({ cache = "no-store" } = {}) {
  const data = await loadGameXData({ cache });
  return getGameXTechniques(data);
}

export async function loadGameXOrigins({ cache = "no-store" } = {}) {
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
  const byName = new Map();
  const byNorm = new Map();

  const list = Array.isArray(techniques) ? techniques : [];
  for (const t of list) {
    const name = String(t?.techniqueName ?? "").trim();
    if (!name) continue;
    byName.set(name, t);
    const norm = normalizeRef(name);
    if (norm) {
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm).push(t);
    }
  }

  return { byName, byNorm };
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

  const { byName, byNorm } = indexes || {};
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

function grantSourceText(entry) {
  return descriptionBundle(entry?.description, getGrantNotes(entry), entry?.name);
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
  const selectedFeatNames = new Set(
    sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 })
  );
  const selectedFeatOptKeys = new Set(
    sanitizeStringArray(b.selectedFeatOptions, { maxItems: 500, maxLen: 200 })
  );

  const feats = getGameXFeats(data);
  const out = [];
  for (const feat of feats) {
    const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
    if (!name || !selectedFeatNames.has(name)) continue;
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


function extractSkillProgressionFromText(value) {
  const s = sanitizeText(value, { maxLen: 4000, collapse: true });
  const m = s.match(/\b(fast|medium|slow)\b(?:\s+skill\s+progression)?/i);
  return m ? normalizeSkillProgression(m[1]) : "";
}

function extractGrantedSkillRankFromText(value) {
  const s = sanitizeText(value, { maxLen: 4000, collapse: true }).toLowerCase();
  if (!s) return "";
  if (/\badvanced training\b/.test(s)) return "2";
  if (/\bbeginner training\b/.test(s) || /\brank\s*1\b/.test(s)) return "1";
  if (/\buntrained\b/.test(s) || /\brank\s*0\b/.test(s)) return "0";
  return "";
}

function computeProgressionRankAtLevel(progression, level) {
  const prog = normalizeSkillProgression(progression);
  const L = Number.parseInt(String(level ?? 1), 10);
  const currentLevel = Number.isFinite(L) ? Math.max(1, Math.min(12, L)) : 1;

  if (!prog) return "";

  let rank = prog === "slow" ? 0 : 1;
  const breakpoints = prog === "fast"
    ? [3, 5, 7, 9, 11]
    : prog === "medium"
      ? [4, 7, 9, 11]
      : [3, 6, 9, 11];

  for (const bp of breakpoints) {
    if (currentLevel >= bp) rank += 1;
  }

  return String(Math.max(0, Math.min(6, rank)));
}

function descriptionBundle(...parts) {
  return parts
    .map((part) => sanitizeText(part, { maxLen: 4000, collapse: true }))
    .filter(Boolean)
    .join(" ");
}

function pushGrantedSkill(target, skillName, rank, source) {
  const skill = sanitizeText(skillName, { maxLen: 96, collapse: true });
  if (!skill) return;
  const src = sanitizeText(source, { maxLen: 96, collapse: true }) || "Granted";
  const existing = target.get(skill);
  const nextRank = sanitizeText(rank, { maxLen: 8, collapse: true });

  if (!existing) {
    target.set(skill, { skill, rank: nextRank, source: src });
    return;
  }

  const prevRank = Number.parseInt(String(existing.rank || ""), 10);
  const currRank = Number.parseInt(String(nextRank || ""), 10);
  if (!Number.isFinite(prevRank) && Number.isFinite(currRank)) {
    target.set(skill, { skill, rank: nextRank, source: src });
    return;
  }
  if (Number.isFinite(prevRank) && Number.isFinite(currRank) && currRank > prevRank) {
    target.set(skill, { skill, rank: nextRank, source: src });
  }
}

function normalizeCombatSkillName(raw) {
  const s = sanitizeText(raw, { maxLen: 96, collapse: true });
  if (!s) return "";
  // Keep the part before ':' or ' (' if present.
  const beforeColon = s.split(":")[0];
  const beforeParen = beforeColon.split("(")[0];
  const out = sanitizeText(beforeParen, { maxLen: 96, collapse: true });
  if (!out) return "";
  // Filter obvious junk tokens.
  if (/^medium$/i.test(out) || /^fast$/i.test(out) || /^slow$/i.test(out)) return "";
  return out;
}

function splitCombatSkillNames(raw) {
  const s = sanitizeText(raw, { maxLen: 200, collapse: true });
  if (!s) return [];
  return s
    .split(",")
    .map((part) => normalizeCombatSkillName(part))
    .filter(Boolean);
}

function matchesPrimaryCondition(text, primaryAttribute) {
  const s = sanitizeText(text, { maxLen: 200, collapse: true }).toLowerCase();
  if (!s) return true;
  const primary = sanitizeText(primaryAttribute, { maxLen: 32, collapse: true }).toLowerCase();
  if (!/primary/.test(s)) return true;
  if (!primary) return false;
  return s.includes(primary);
}

function resolveClassCombatSkillEntries(cls, primaryAttribute) {
  const out = [];
  const rawEntries = Array.isArray(cls?.combatSkills) ? cls.combatSkills : [];
  let pendingSkillName = "";

  for (const entry of rawEntries) {
    const rawName = sanitizeText(entry?.name, { maxLen: 160, collapse: true });
    const explicitProgression = normalizeSkillProgression(entry?.progression);
    if (!rawName && !explicitProgression) continue;

    const skillName = normalizeCombatSkillName(rawName);
    const progression = explicitProgression || extractSkillProgressionFromText(rawName);

    if (skillName) {
      pendingSkillName = skillName;
      if (!matchesPrimaryCondition(rawName, primaryAttribute)) continue;
      out.push({ skillName, progression });
      continue;
    }

    if (pendingSkillName && progression && matchesPrimaryCondition(rawName, primaryAttribute)) {
      out.push({ skillName: pendingSkillName, progression });
    }
  }

  return out;
}

/**
 * Computes:
 * - knownCombatSkills: combat skills available to the character (used for filtering)
 * - grantedTechniqueNames: techniques automatically granted (do NOT consume slots)
 * - techniqueChoiceGrants: extra technique picks constrained by grant fields
 */
export function computeKnownCombatSkillsAndGrants(gameData, builder) {
  const data = (gameData && typeof gameData === "object") ? gameData : {};
  const b = (builder && typeof builder === "object") ? builder : {};
  const grantCollection = createCharacterGrantCollection(data, b);

  const classKey = sanitizeText(b.classKey || "", { maxLen: 64, collapse: true });
  const primaryAttribute = sanitizeText(b.primaryAttribute || "", { maxLen: 32, collapse: true });
  const level = Number.parseInt(String(b.level ?? 1), 10);
  const L = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;

  const knownCombatSkills = new Set();
  const grantedTechniqueNames = new Set();

  for (const skill of ["Martial Arts", "Melee Weapons", "Targeting"]) {
    knownCombatSkills.add(skill);
  }

  // ---- Base skills from class ----
  const classes = getGameXClasses(data);
  const cls = classes.find((c) => String(c?.classKey || "") === String(classKey)) || null;

  if (cls) {
    for (const n of splitCombatSkillNames(cls.combatTechniqueSkill)) {
      knownCombatSkills.add(n);
    }

    const combatSkills = resolveClassCombatSkillEntries(cls, primaryAttribute);
    for (const cs of combatSkills) {
      if (cs?.skillName) knownCombatSkills.add(cs.skillName);
    }
  }

  // ---- Grants from the centralized character grant collection ----
  for (const grant of grantCollection.skillGrants) {
    const n = normalizeCombatSkillName(getGrantName(grant));
    if (n) knownCombatSkills.add(n);
  }
  for (const grant of grantCollection.techniqueGrants) {
    const n = getGrantName(grant);
    if (n) grantedTechniqueNames.add(n);
  }

  knownCombatSkills.delete("");

  return {
    knownCombatSkills,
    grantedTechniqueNames,
    techniqueChoiceGrants: grantCollection.techniqueChoiceGrants,
  };
}


export function computeGrantedSkillsState(gameData, builder) {
  const data = (gameData && typeof gameData === "object") ? gameData : {};
  const b = (builder && typeof builder === "object") ? builder : {};
  const grantCollection = createCharacterGrantCollection(data, b);

  const classKey = sanitizeText(b.classKey || "", { maxLen: 64, collapse: true });
  const primaryAttribute = sanitizeText(b.primaryAttribute || "", { maxLen: 32, collapse: true });
  const level = Number.parseInt(String(b.level ?? 1), 10);
  const L = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;

  const fixedRanks = {
    rank_physdef: "",
    rank_mentdef: "",
    rank_spiritdef: "",
  };
  const defenseLabelToField = new Map([
    ["Physical Defense", "rank_physdef"],
    ["Mental Defense", "rank_mentdef"],
    ["Spiritual Defense", "rank_spiritdef"],
  ]);

  const grantedSkillNames = new Set();
  const grantedCombatSkills = new Map();

  for (const skill of ["Martial Arts", "Melee Weapons", "Targeting"]) {
    pushGrantedSkill(grantedCombatSkills, skill, "0", "Common");
  }

  const classes = getGameXClasses(data);
  const cls = classes.find((c) => String(c?.classKey || "") === String(classKey)) || null;

  if (cls) {
    const classCombatSkills = resolveClassCombatSkillEntries(cls, primaryAttribute);
    for (const entry of classCombatSkills) {
      if (!entry.skillName) continue;

      const rank = computeProgressionRankAtLevel(entry.progression, L);
      grantedSkillNames.add(entry.skillName);

      if (defenseLabelToField.has(entry.skillName)) {
        fixedRanks[defenseLabelToField.get(entry.skillName)] = rank;
      } else {
        pushGrantedSkill(grantedCombatSkills, entry.skillName, rank, "Class");
      }
    }

    for (const baseCombatSkill of splitCombatSkillNames(cls.combatTechniqueSkill)) {
      grantedSkillNames.add(baseCombatSkill);
      if (!grantedCombatSkills.has(baseCombatSkill) && !defenseLabelToField.has(baseCombatSkill)) {
        pushGrantedSkill(grantedCombatSkills, baseCombatSkill, "", "Class");
      }
    }
  }

  function applySkillGrant(grant) {
    const source = grant?.source || {};
    const skillName = normalizeCombatSkillName(getGrantName(grant));
    if (!skillName) return;

    const explicitRank = Number.parseInt(String(grant?.rank ?? ""), 10);
    const progressionRank = Number.parseInt(
      computeProgressionRankAtLevel(grant?.progression, L)
        || computeProgressionRankAtLevel(extractSkillProgressionFromText(grantSourceText(source)), L)
        || "",
      10
    );
    const textRank = Number.parseInt(extractGrantedSkillRankFromText(grantSourceText(source)), 10);
    const ranks = [explicitRank, progressionRank, textRank].filter(Number.isFinite);
    const rank = ranks.length ? String(Math.max(0, Math.min(6, Math.max(...ranks)))) : "";
    const sourceName = sanitizeText(source?.name || source?.featureName || "", { maxLen: 96, collapse: true }) || "Granted";

    grantedSkillNames.add(skillName);
    if (defenseLabelToField.has(skillName)) {
      const fieldKey = defenseLabelToField.get(skillName);
      if (rank !== "") fixedRanks[fieldKey] = rank;
    } else {
      pushGrantedSkill(grantedCombatSkills, skillName, rank, sourceName);
    }
  }

  for (const grant of grantCollection.skillGrants) {
    applySkillGrant(grant);
  }

  return {
    fixedRanks,
    grantedSkillNames,
    grantedCombatSkills: Array.from(grantedCombatSkills.values()).sort((a, b) => a.skill.localeCompare(b.skill)),
  };
}
