// public/game-data.js
// Single source of truth for reading Game X exported JSON data.
//
// This module loads /public/data/game-x/game-x-data.json (the combined export)
// and provides small helpers for common lookups.
// No Firestore. No DOM. No game-rule enforcement (that belongs in character-rules.js later).

let _gameXDataPromise = null;

/**
 * Load combined Game X data from /data/game-x/game-x-data.json.
 * Cached for lifetime of the page. Resets cache on failure.
 */
export async function loadGameXData({ cache = "no-store" } = {}) {
  if (_gameXDataPromise) return _gameXDataPromise;

  _gameXDataPromise = (async () => {
    const res = await fetch("./data/game-x/game-x-data.json", { cache });
    if (!res.ok) throw new Error(`Failed to load game-x-data.json (${res.status})`);
    const data = await res.json();

    // Defensive shape normalization (lightweight)
    return {
      schemaVersion: Number.isFinite(data?.schemaVersion) ? data.schemaVersion : 0,
      generatedAt: String(data?.generatedAt || ""),
      classes: Array.isArray(data?.classes) ? data.classes : [],
      classFeatures: (data?.classFeatures && typeof data.classFeatures === "object") ? data.classFeatures : {},
      feats: Array.isArray(data?.feats) ? data.feats : [],
      techniques: Array.isArray(data?.techniques) ? data.techniques : [],
    };
  })();

  try {
    return await _gameXDataPromise;
  } catch (e) {
    _gameXDataPromise = null;
    throw e;
  }
}

export async function loadGameXClasses(opts) {
  const data = await loadGameXData(opts);
  return Array.isArray(data?.classes) ? data.classes : [];
}

export function normalizeNameKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build indexes for techniques by techniqueName (exact) and normalized fallback.
 * Useful to handle broken refs when names change slightly during development.
 */
export function buildTechniqueIndexes(techniques) {
  const list = Array.isArray(techniques) ? techniques : [];
  const byName = new Map();
  const byNorm = new Map(); // norm -> technique OR null if ambiguous

  for (const t of list) {
    const name = String(t?.techniqueName || "").trim();
    if (!name) continue;

    byName.set(name, t);

    const norm = normalizeNameKey(name);
    if (!norm) continue;

    if (!byNorm.has(norm)) {
      byNorm.set(norm, t);
    } else {
      // mark ambiguous
      byNorm.set(norm, null);
    }
  }

  return { byName, byNorm };
}

/**
 * Resolve a stored technique reference (techniqueName string) to a technique object.
 * Returns null if missing or ambiguous.
 */
export function resolveTechniqueRef(refName, indexes) {
  const name = String(refName ?? "").trim();
  if (!name) return null;

  const byName = indexes?.byName;
  const byNorm = indexes?.byNorm;

  if (byName && byName.has(name)) return byName.get(name) || null;

  const norm = normalizeNameKey(name);
  if (!norm || !byNorm) return null;

  const t = byNorm.get(norm);
  return t || null;
}
