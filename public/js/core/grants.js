import { sanitizeText } from "./data-sanitization.js";

export const VALID_GRANT_TYPES = new Set([
  "skill",
  "technique",
  "technique-choice",
  "feat",
  "weapon",
  "weapon-enhancement",
  "equipment",
]);

export function getGrantNotes(entry) {
  return sanitizeText(entry?.grantNotes ?? "", { maxLen: 4000, collapse: true });
}

export function normalizeSkillProgression(value) {
  const s = sanitizeText(value, { maxLen: 32, collapse: true }).toLowerCase();
  if (s === "fast" || s === "medium" || s === "slow") return s;
  return "";
}

export function getGrantSourceLabel(source) {
  return sanitizeText(source?.name || source?.featureName || source?.featureKey || source?.featKey || "", {
    maxLen: 120,
    collapse: true,
  }) || "Unknown source";
}

export function sanitizeGrantType(value, source) {
  const type = sanitizeText(value, { maxLen: 64, collapse: true });
  if (!type) throw new Error(`Grant from ${getGrantSourceLabel(source)} is missing type.`);
  if (!VALID_GRANT_TYPES.has(type)) {
    throw new Error(`Grant from ${getGrantSourceLabel(source)} has unsupported type "${type}".`);
  }
  return type;
}

export function sanitizeGrant(grant, source) {
  if (!grant || typeof grant !== "object") {
    throw new Error(`Grant from ${getGrantSourceLabel(source)} must be an object.`);
  }

  const type = sanitizeGrantType(grant.type, source);
  const name = sanitizeText(grant.name, { maxLen: 200, collapse: true });
  const key = sanitizeText(grant.key, { maxLen: 96, collapse: true });
  const progression = normalizeSkillProgression(grant.progression);
  const skill = sanitizeText(grant.skill, { maxLen: 96, collapse: true });
  const rank = Number.parseInt(String(grant.rank ?? ""), 10);
  const count = Number.parseInt(String(grant.count ?? ""), 10);
  const note = sanitizeText(grant.note, { maxLen: 400, collapse: true });
  const out = { type, source };

  if (name) out.name = name;
  if (key) out.key = key;
  if (skill) out.skill = skill;
  if (progression) out.progression = progression;
  if (Number.isFinite(rank)) out.rank = rank;
  if (Number.isFinite(count)) out.count = count;
  if (note) out.note = note;
  return out;
}

export function getEntryGrants(entry) {
  if (!Array.isArray(entry?.grants)) return [];
  return entry.grants.map((grant) => sanitizeGrant(grant, entry));
}

export function getGrantName(grant) {
  return sanitizeText(grant?.name || grant?.key || "", { maxLen: 200, collapse: true });
}
