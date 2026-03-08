// public/game-data.js
//
// Single source of truth for reading Game X exported JSON.
// All consumers should load via this module (no per-page fetch duplication).

import { sanitizeText, sanitizeStringArray, buildOptionKey } from "./data-sanitization.js";

let _gameXDataPromise = null;

export async function loadGameXData({ cache = "no-store" } = {}) {
  if (_gameXDataPromise) return _gameXDataPromise;

  _gameXDataPromise = (async () => {
    const res = await fetch("data/game-x/game-x-data.json", { cache });
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
  return Array.isArray(data?.classes) ? data.classes : [];
}

export async function loadGameXTechniques({ cache = "no-store" } = {}) {
  const data = await loadGameXData({ cache });
  return Array.isArray(data?.techniques) ? data.techniques : [];
}

export async function loadGameXOrigins({ cache = "no-store" } = {}) {
  const data = await loadGameXData({ cache });
  return Array.isArray(data?.origins) ? data.origins : [];
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


function normalizeSkillProgression(value) {
  const s = sanitizeText(value, { maxLen: 32, collapse: true }).toLowerCase();
  if (s === "fast" || s === "medium" || s === "slow") return s;
  return "";
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

function parseGrantedSkillEntry(rawName, rawProgression) {
  const originalName = sanitizeText(rawName, { maxLen: 160, collapse: true });
  const skillName = normalizeCombatSkillName(originalName);
  if (!skillName) return { skillName: "", progression: "" };

  const progression = normalizeSkillProgression(rawProgression) || extractSkillProgressionFromText(originalName);
  return { skillName, progression };
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

/**
 * Computes:
 * - knownCombatSkills: combat skills available to the character (used for filtering)
 * - grantedTechniqueNames: techniques automatically granted (do NOT consume slots)
 */
export function computeKnownCombatSkillsAndGrants(gameData, builder) {
  const data = (gameData && typeof gameData === "object") ? gameData : {};
  const b = (builder && typeof builder === "object") ? builder : {};

  const classKey = sanitizeText(b.classKey || "", { maxLen: 64, collapse: true });
  const level = Number.parseInt(String(b.level ?? 1), 10);
  const L = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;

  const knownCombatSkills = new Set();
  const grantedTechniqueNames = new Set();

  // ---- Base skills from class ----
  const classes = Array.isArray(data.classes) ? data.classes : [];
  const cls = classes.find((c) => String(c?.classKey || "") === String(classKey)) || null;

  if (cls) {
    if (cls.combatTechniqueSkill) {
      const n = normalizeCombatSkillName(cls.combatTechniqueSkill);
      if (n) knownCombatSkills.add(n);
    }

    const combatSkills = Array.isArray(cls.combatSkills) ? cls.combatSkills : [];
    for (const cs of combatSkills) {
      const n = normalizeCombatSkillName(cs?.name);
      if (n) knownCombatSkills.add(n);
    }
  }

  // ---- Grants from class features (including chosen options) ----
  const selectedOptKeys = new Set(
    sanitizeStringArray(b.selectedClassFeatureOptions, { maxItems: 500, maxLen: 200 })
  );

  const featuresByClass = (data.classFeatures && typeof data.classFeatures === "object") ? data.classFeatures : {};
  const features = Array.isArray(featuresByClass[classKey]) ? featuresByClass[classKey] : [];

  for (const f of features) {
    const fLevel = Number.parseInt(String(f?.level ?? 0), 10);
    const req = Number.isFinite(fLevel) ? fLevel : 0;
    if (req > L) continue;

    for (const s of (Array.isArray(f?.grantsSkills) ? f.grantsSkills : [])) {
      const n = normalizeCombatSkillName(s);
      if (n) knownCombatSkills.add(n);
    }
    for (const tName of (Array.isArray(f?.grantsTechniques) ? f.grantsTechniques : [])) {
      const n = sanitizeText(tName, { maxLen: 200, collapse: true });
      if (n) grantedTechniqueNames.add(n);
    }

    if (Array.isArray(f?.options) && f.options.length) {
      for (const opt of f.options) {
        const key = buildOptionKey(f, opt);
        if (!selectedOptKeys.has(key)) continue;

        for (const s of (Array.isArray(opt?.grantsSkills) ? opt.grantsSkills : [])) {
          const n = normalizeCombatSkillName(s);
          if (n) knownCombatSkills.add(n);
        }
        for (const tName of (Array.isArray(opt?.grantsTechniques) ? opt.grantsTechniques : [])) {
          const n = sanitizeText(tName, { maxLen: 200, collapse: true });
          if (n) grantedTechniqueNames.add(n);
        }
      }
    }
  }

  // ---- Grants from feats (if present in builder) ----
  const selectedFeatNames = new Set(
    sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 })
  );

  const feats = Array.isArray(data.feats) ? data.feats : [];
  for (const feat of feats) {
    const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
    if (!name || !selectedFeatNames.has(name)) continue;

    const minLevel = Number.parseInt(String(feat?.minLevel ?? 0), 10);
    const ml = Number.isFinite(minLevel) ? minLevel : 0;
    if (ml > L) continue;

    for (const s of (Array.isArray(feat?.grantsSkills) ? feat.grantsSkills : [])) {
      const n = normalizeCombatSkillName(s);
      if (n) knownCombatSkills.add(n);
    }
    for (const tName of (Array.isArray(feat?.grantsTechniques) ? feat.grantsTechniques : [])) {
      const n = sanitizeText(tName, { maxLen: 200, collapse: true });
      if (n) grantedTechniqueNames.add(n);
    }
  }

  knownCombatSkills.delete("");

  return { knownCombatSkills, grantedTechniqueNames };
}


export function computeGrantedSkillsState(gameData, builder) {
  const data = (gameData && typeof gameData === "object") ? gameData : {};
  const b = (builder && typeof builder === "object") ? builder : {};

  const classKey = sanitizeText(b.classKey || "", { maxLen: 64, collapse: true });
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

  const classes = Array.isArray(data.classes) ? data.classes : [];
  const cls = classes.find((c) => String(c?.classKey || "") === String(classKey)) || null;

  if (cls) {
    const classCombatSkills = Array.isArray(cls.combatSkills) ? cls.combatSkills : [];
    for (const entry of classCombatSkills) {
      const parsed = parseGrantedSkillEntry(entry?.name, entry?.progression);
      if (!parsed.skillName) continue;

      const rank = computeProgressionRankAtLevel(parsed.progression, L);
      grantedSkillNames.add(parsed.skillName);

      if (defenseLabelToField.has(parsed.skillName)) {
        fixedRanks[defenseLabelToField.get(parsed.skillName)] = rank;
      } else {
        pushGrantedSkill(grantedCombatSkills, parsed.skillName, rank, "Class");
      }
    }

    const baseCombatSkill = normalizeCombatSkillName(cls.combatTechniqueSkill);
    if (baseCombatSkill) {
      grantedSkillNames.add(baseCombatSkill);
      if (!grantedCombatSkills.has(baseCombatSkill) && !defenseLabelToField.has(baseCombatSkill)) {
        pushGrantedSkill(grantedCombatSkills, baseCombatSkill, "", "Class");
      }
    }
  }

  const selectedOptKeys = new Set(
    sanitizeStringArray(b.selectedClassFeatureOptions, { maxItems: 500, maxLen: 200 })
  );

  const featuresByClass = (data.classFeatures && typeof data.classFeatures === "object") ? data.classFeatures : {};
  const features = Array.isArray(featuresByClass[classKey]) ? featuresByClass[classKey] : [];

  function applySkillGrants(skills, sourceText, sourceName) {
    const rank = extractGrantedSkillRankFromText(sourceText) || computeProgressionRankAtLevel(extractSkillProgressionFromText(sourceText), L);
    for (const rawSkill of (Array.isArray(skills) ? skills : [])) {
      const skillName = normalizeCombatSkillName(rawSkill);
      if (!skillName) continue;
      grantedSkillNames.add(skillName);
      if (defenseLabelToField.has(skillName)) {
        const fieldKey = defenseLabelToField.get(skillName);
        if (rank !== "") fixedRanks[fieldKey] = rank;
      } else {
        pushGrantedSkill(grantedCombatSkills, skillName, rank, sourceName);
      }
    }
  }

  for (const f of features) {
    const fLevel = Number.parseInt(String(f?.level ?? 0), 10);
    const req = Number.isFinite(fLevel) ? fLevel : 0;
    if (req > L) continue;

    const featureText = descriptionBundle(f?.description, f?.grantsNotes, f?.name);
    applySkillGrants(f?.grantsSkills, featureText, sanitizeText(f?.name || "", { maxLen: 96, collapse: true }) || "Feature");

    if (Array.isArray(f?.options) && f.options.length) {
      for (const opt of f.options) {
        const key = buildOptionKey(f, opt);
        if (!selectedOptKeys.has(key)) continue;
        const optionText = descriptionBundle(opt?.description, opt?.grantsNotes, f?.description, f?.grantsNotes, opt?.name, f?.name);
        applySkillGrants(opt?.grantsSkills, optionText, sanitizeText(opt?.name || f?.name || "", { maxLen: 96, collapse: true }) || "Feature");
      }
    }
  }

  const selectedFeatNames = new Set(
    sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 })
  );

  const feats = Array.isArray(data.feats) ? data.feats : [];
  for (const feat of feats) {
    const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
    if (!name || !selectedFeatNames.has(name)) continue;

    const minLevel = Number.parseInt(String(feat?.minLevel ?? 0), 10);
    const ml = Number.isFinite(minLevel) ? minLevel : 0;
    if (ml > L) continue;

    const featText = descriptionBundle(feat?.description, feat?.grantsNotes, feat?.name);
    applySkillGrants(feat?.grantsSkills, featText, name || "Feat");
  }

  return {
    fixedRanks,
    grantedSkillNames,
    grantedCombatSkills: Array.from(grantedCombatSkills.values()).sort((a, b) => a.skill.localeCompare(b.skill)),
  };
}
