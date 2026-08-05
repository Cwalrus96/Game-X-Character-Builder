import { sanitizeText, sanitizeWeaponList } from "./data-sanitization.js";
import { GRANT_EXPRESSION_REGISTRY, SUPPORTED_GRANT_TYPES } from "./game-data-contract.js";
import { formatExpressionDiagnostic, normalizeExpressionObject, resolveCapacityExpression } from "./game-data-expressions.js";

export const VALID_GRANT_TYPES = new Set(SUPPORTED_GRANT_TYPES);

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

  sanitizeGrantType(grant.type, source);
  const { source: _existingSource, ...expression } = grant;
  const result = normalizeExpressionObject("grant", expression, { context: getGrantSourceLabel(source) });
  if (!result.ok) throw new Error(formatExpressionDiagnostic(result.diagnostics[0]));
  return { ...result.value, source };
}

export function getEntryGrants(entry) {
  if (!Array.isArray(entry?.grants)) return [];
  return entry.grants.map((grant) => sanitizeGrant(grant, entry));
}

export function getGrantName(grant) {
  return sanitizeText(grant?.name || grant?.key || grant?.resourceKey || "", { maxLen: 200, collapse: true });
}

export function getGrantRuntimeStatus(grant) {
  return GRANT_EXPRESSION_REGISTRY[String(grant?.type || "")]?.runtimeStatus || "unknown";
}

export function initializeGrantedResource(grant, context = {}) {
  const normalized = sanitizeGrant(grant, context.source || grant?.source);
  if (normalized.type !== "resource") throw new Error("Only resource grants can initialize resource state.");
  const capacity = resolveCapacityExpression(normalized.count, context);
  if (!Number.isInteger(capacity)) throw new Error(`Resource "${normalized.resourceKey}" capacity cannot be resolved.`);
  return {
    resourceKey: normalized.resourceKey,
    name: normalized.name || normalized.resourceKey,
    capacity,
    current: capacity,
  };
}

export function normalizeResourceCurrent(value, capacity) {
  const max = Number.isFinite(Number(capacity)) ? Math.max(0, Math.trunc(Number(capacity))) : 0;
  const current = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : max;
  return Math.max(0, Math.min(max, current));
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
