// public/data-sanitization.js
//
// Primitive sanitization helpers shared by database-reader and database-writer.
// Game X specific *policies* (like attribute caps) belong in character-rules.

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

export function sanitizeStringArray(v, { maxItems = 200, maxLen = 128 } = {}) {
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

export function sanitizeRepeatableAbilities(v) {
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

// ---- Selection key helpers (storage format) ----
// Canonical encoding for builder.selectedClassFeatureOptions.



export function sanitizeSkillRank(value, { allowBlank = true } = {}) {
  const raw = sanitizeText(value, { maxLen: 8, collapse: true });
  if (allowBlank && raw === "") return "";
  return String(toInt(raw, { min: 0, max: 6 }));
}

export function sanitizeSkillFields(value) {
  const src = (value && typeof value === "object") ? value : {};
  const out = {};
  for (const [key, raw] of Object.entries(src)) {
    if (!/^rank_[a-z0-9_]+$/i.test(String(key || ""))) continue;
    out[key] = sanitizeSkillRank(raw, { allowBlank: true });
  }
  return out;
}

export function sanitizeNamedSkillList(value, { maxItems = 200 } = {}) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of arr) {
    const row = (item && typeof item === "object") ? item : {};
    const skill = sanitizeText(row.skill, { maxLen: 96, collapse: true });
    const rank = sanitizeSkillRank(row.rank, { allowBlank: true });
    if (!skill && rank === "") continue;
    out.push({ skill, rank });
    if (out.length >= maxItems) break;
  }
  return out;
}


export function sanitizeBondList(value, { maxItems = 50 } = {}) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of arr) {
    const row = (item && typeof item === "object") ? item : {};
    const name = sanitizeText(row.name, { maxLen: 96, collapse: true });
    const keystone = sanitizeText(row.keystone, { maxLen: 400, collapse: true });
    const rawRank = sanitizeText(row.rank, { maxLen: 8, collapse: true });
    const rank = rawRank === "" ? "" : String(toInt(rawRank, { min: 1, max: 6 }));
    if (!name && !keystone && rank === "") continue;
    out.push({ name, rank, keystone });
    if (out.length >= maxItems) break;
  }
  return out;
}

export function sanitizeKeystoneList(value, { maxItems = 20, maxLen = 400 } = {}) {
  return sanitizeStringArray(value, { maxItems, maxLen });
}


export function sanitizeWeaponEnhancementSelections(value) {
  const src = (value && typeof value === "object" && !Array.isArray(value)) ? value : {};
  const out = {};
  for (const [key, raw] of Object.entries(src)) {
    const safeKey = normalizeEnumToken(key, { maxLen: 64 });
    if (!safeKey) continue;
    const safeValue = sanitizeText(raw, { maxLen: 96, collapse: true });
    if (!safeValue) continue;
    out[safeKey] = safeValue;
  }
  return out;
}

export function sanitizeWeaponEnhancementList(value, { maxItems = 20 } = {}) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of arr) {
    const row = (item && typeof item === "object") ? item : {};
    const id = sanitizeText(row.id, { maxLen: 64, collapse: true });
    const enhancementKey = normalizeEnumToken(row.enhancementKey, { maxLen: 64 });
    const rank = toInt(row.rank, { min: 0, max: 8 });
    const selections = sanitizeWeaponEnhancementSelections(row.selections);
    const granted = row.granted === true || row.granted === "true" || row.granted === 1 || row.granted === "1";
    if (!id && !enhancementKey) continue;
    out.push({ id, enhancementKey, rank, selections, ...(granted ? { granted: true } : {}) });
    if (out.length >= maxItems) break;
  }
  return out;
}

export function sanitizeWeaponList(value, { maxItems = 20 } = {}) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of arr) {
    const row = (item && typeof item === "object") ? item : {};
    const id = sanitizeText(row.id, { maxLen: 64, collapse: true });
    const choiceId = sanitizeText(row.choiceId, { maxLen: 96, collapse: true });
    const sourceChoiceId = sanitizeText(row.sourceChoiceId, { maxLen: 96, collapse: true });
    const weaponKey = normalizeEnumToken(row.weaponKey, { maxLen: 64 });
    const rank = toInt(row.rank, { min: 0, max: 8 });
    const customName = sanitizeText(row.customName, { maxLen: 120, collapse: true });
    const enhancements = sanitizeWeaponEnhancementList(row.enhancements, { maxItems: 20 });
    const generated = row.generated === true || row.generated === "true" || row.generated === 1 || row.generated === "1";
    if (!id && !weaponKey && !customName && !enhancements.length) continue;
    out.push({
      id,
      ...(choiceId ? { choiceId } : {}),
      ...(sourceChoiceId ? { sourceChoiceId } : {}),
      ...(generated ? { generated: true } : {}),
      weaponKey,
      rank,
      customName,
      enhancements,
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

export function sanitizeGrantChoices(value, { maxItems = 100 } = {}) {
  const src = (value && typeof value === "object" && !Array.isArray(value)) ? value : {};
  const out = {};
  for (const [rawChoiceId, rawChoice] of Object.entries(src)) {
    const choiceId = sanitizeText(rawChoiceId, { maxLen: 96, collapse: true });
    const choice = (rawChoice && typeof rawChoice === "object" && !Array.isArray(rawChoice)) ? rawChoice : {};
    if (!choiceId) continue;

    const type = normalizeEnumToken(choice.type, { maxLen: 64 });
    const sourceId = sanitizeText(choice.sourceId, { maxLen: 160, collapse: true });
    const sourceLabel = sanitizeText(choice.sourceLabel, { maxLen: 200, collapse: true });
    const value = sanitizeText(choice.value, { maxLen: 200, collapse: true });
    const techniqueName = sanitizeText(choice.techniqueName, { maxLen: 200, collapse: true });
    const skill = sanitizeText(choice.skill, { maxLen: 96, collapse: true });
    const weaponKey = normalizeEnumToken(choice.weaponKey, { maxLen: 64 });
    const rank = toInt(choice.rank, { min: 0, max: 8 });
    const customName = sanitizeText(choice.customName, { maxLen: 120, collapse: true });
    const enhancements = sanitizeWeaponEnhancementList(choice.enhancements, { maxItems: 20 });
    const tags = sanitizeStringArray(choice.tags, { maxItems: 50, maxLen: 96 });

    if (!type && !sourceId && !sourceLabel && !value && !techniqueName && !skill && !weaponKey && !customName && !enhancements.length && !tags.length) continue;
    out[choiceId] = {
      choiceId,
      type,
      ...(sourceId ? { sourceId } : {}),
      ...(sourceLabel ? { sourceLabel } : {}),
      ...(value ? { value } : {}),
      ...(techniqueName ? { techniqueName } : {}),
      ...(skill ? { skill } : {}),
      weaponKey,
      rank,
      customName,
      enhancements,
      tags,
    };
    if (Object.keys(out).length >= maxItems) break;
  }
  return out;
}

export function buildCharacterKeystoneEntries(builder) {
  const src = (builder && typeof builder === "object") ? builder : {};
  const originKeystone = sanitizeText(src.originKeystone || "", { maxLen: 400, collapse: true });
  const backgroundKeystones = sanitizeKeystoneList(src.backgroundKeystones, { maxItems: 20, maxLen: 400 });
  const bonds = sanitizeBondList(src.bonds, { maxItems: 50 });
  const out = [];

  if (originKeystone) {
    out.push({
      source: "origin",
      title: "Origin Keystone",
      text: originKeystone,
    });
  }

  backgroundKeystones.forEach((text, index) => {
    if (!text) return;
    out.push({
      source: "background",
      title: `Background Keystone ${index + 1}`,
      text,
    });
  });

  bonds.forEach((bond, index) => {
    const text = sanitizeText(bond?.keystone || "", { maxLen: 400, collapse: true });
    if (!text) return;
    out.push({
      source: "bond",
      title: sanitizeText(bond?.name || "", { maxLen: 96, collapse: true }) || `Bond ${index + 1}`,
      text,
      rank: sanitizeSkillRank(bond?.rank, { allowBlank: true }),
      bondName: sanitizeText(bond?.name || "", { maxLen: 96, collapse: true }),
    });
  });

  return out;
}
export function buildGroupId(group) {
  const cls = sanitizeText(group?.classKey || "", { maxLen: 64, collapse: true });
  const rawLevel = group?.level ?? group?.minLevel;
  const parsedLevel = Number.parseInt(String(rawLevel ?? ""), 10);
  const lvl = Number.isFinite(parsedLevel) ? parsedLevel : 0;
  const name = sanitizeText(group?.name || "", { maxLen: 96, collapse: true });
  return `${cls}|L${lvl}|${name}`;
}

export function buildOptionKey(group, option) {
  const gid = buildGroupId(group);
  const optName = sanitizeText(option?.name || "", { maxLen: 120, collapse: true });
  return `${gid}::${optName}`;
}

export function escapeHtml(value) {
  // Minimal HTML escaping for safe insertion into HTML contexts.
  // Prefer DOM APIs (textContent) where possible.
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeHtmlText(value, maxLen = 256) {
  // Convenience: sanitize text length/control chars, then escape for HTML.
  return escapeHtml(sanitizeText(value, { maxLen, collapse: false }));
}
