import { sanitizeText, sanitizeWeaponList } from "./data-sanitization.js";

export const VALID_GRANT_TYPES = new Set([
  "skill",
  "technique",
  "technique-choice",
  "feat",
  "weapon",
  "weapon-enhancement",
  "equipment",
  "specialization",
]);

export function getGrantNotes(entry) {
  return sanitizeText(entry?.grantNotes ?? "", { maxLen: 4000, collapse: true });
}

export function normalizeSkillProgression(value) {
  const s = sanitizeText(value, { maxLen: 32, collapse: true }).toLowerCase();
  if (s === "fast" || s === "medium" || s === "slow") return s;
  if (s === "weapon skill") return s;
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
  const enhancement = sanitizeText(grant.enhancement, { maxLen: 96, collapse: true });
  const choiceId = sanitizeText(grant.choiceId, { maxLen: 96, collapse: true });
  const choiceRef = sanitizeText(grant.choiceRef, { maxLen: 96, collapse: true });
  const rank = Number.parseInt(String(grant.rank ?? ""), 10);
  const count = Number.parseInt(String(grant.count ?? ""), 10);
  const note = sanitizeText(grant.note, { maxLen: 400, collapse: true });
  const out = { type, source };

  if (name) out.name = name;
  if (key) out.key = key;
  if (skill) out.skill = skill;
  if (enhancement) out.enhancement = enhancement;
  if (choiceId) out.choiceId = choiceId;
  if (choiceRef) out.choiceRef = choiceRef;
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

export function isSourceOwnedWeapon(weapon) {
  return !!weapon && (weapon.generated === true || !!sanitizeText(weapon.sourceChoiceId, { maxLen: 96, collapse: true }));
}

export function buildGeneratedWeaponsFromGrantChoices(grantChoices = {}, existingWeapons = []) {
  const sanitizedExisting = sanitizeWeaponList(existingWeapons, { maxItems: 20 });
  const kept = sanitizedExisting.filter((weapon) => !isSourceOwnedWeapon(weapon));
  const generated = [];

  for (const [rawChoiceId, choice] of Object.entries(grantChoices || {})) {
    const choiceId = sanitizeText(choice?.choiceId || rawChoiceId, { maxLen: 96, collapse: true });
    const weaponKey = sanitizeText(choice?.weaponKey, { maxLen: 64, collapse: true });
    if (!choiceId || choice?.type !== "weapon" || !weaponKey) continue;

    const existing = sanitizedExisting.find((weapon) => weapon?.sourceChoiceId === choiceId || weapon?.choiceId === choiceId);
    generated.push({
      id: sanitizeText(existing?.id || `grant_${choiceId}`, { maxLen: 64, collapse: true }),
      choiceId,
      sourceChoiceId: choiceId,
      generated: true,
      weaponKey,
      rank: Number.parseInt(String(choice?.rank ?? 1), 10) || 1,
      customName: sanitizeText(choice?.customName || "Soulbound Weapon", { maxLen: 120, collapse: true }),
      enhancements: Array.isArray(choice?.enhancements) ? choice.enhancements : [],
    });
  }

  return sanitizeWeaponList(kept.concat(generated), { maxItems: 20 });
}
