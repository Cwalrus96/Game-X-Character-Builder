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
