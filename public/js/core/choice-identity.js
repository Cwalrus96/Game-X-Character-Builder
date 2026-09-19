import { sanitizeText } from "./data-sanitization.js";
import { legacySkillIdentity } from "./skill-identity.js";

const CHOICE_CREATING_GRANT_TYPES = new Set([
  "technique-choice",
  "weapon",
]);

export function normalizeChoiceId(value) {
  return sanitizeText(value, { maxLen: 96, collapse: true });
}

function normalizeDerivedIdentity(value) {
  return normalizeChoiceId(value).toLowerCase();
}

function choiceHash(value) {
  let hash = 5381;
  for (const ch of String(value || "")) {
    hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function resolveLegacyGrantChoiceId(grant, { sourceId = "", index = 0, normalizeSemantic = true } = {}) {
  const explicit = normalizeChoiceId(grant?.choiceId);
  if (explicit) return explicit;
  if (!grantCreatesChoice(grant)) return "";

  const source = normalizeChoiceId(sourceId || "source");
  const type = normalizeDerivedIdentity(grant?.type || "choice");
  const rawSkill = legacySkillIdentity(grant?.skillKey || grant?.key || grant?.skill || grant?.name || "");
  const skill = normalizeSemantic ? normalizeDerivedIdentity(rawSkill) : normalizeChoiceId(rawSkill === "targeting" ? "Targeting" : rawSkill);
  return normalizeChoiceId([source, type, skill, String(index)].filter(Boolean).join(":"));
}

export function grantCreatesChoice(grant) {
  return CHOICE_CREATING_GRANT_TYPES.has(String(grant?.type || ""));
}

export function getGrantChoiceCount(grant) {
  const count = Number.parseInt(String(grant?.count ?? 1), 10);
  return Number.isFinite(count) ? Math.max(1, Math.min(50, count)) : 1;
}

export function resolveGrantChoiceId(grant, { sourceId = "", index = 0 } = {}) {
  const explicit = normalizeChoiceId(grant?.choiceId);
  if (explicit) return explicit;
  if (!grantCreatesChoice(grant)) return "";

  const type = normalizeDerivedIdentity(grant?.type || "choice");
  const skill = normalizeDerivedIdentity(legacySkillIdentity(grant?.skillKey || grant?.key || grant?.skill || grant?.name || ""));
  const rawSource = sanitizeText(sourceId || "source", { maxLen: 260, collapse: true });
  const raw = [rawSource, type, skill, String(index)].filter(Boolean).join(":");
  const sourceSlug = normalizeChoiceId(rawSource.split(":").filter(Boolean).pop() || rawSource || "source");
  const readable = [sourceSlug, type, skill, String(index)].filter(Boolean).join(":");
  if (readable.length <= 96) return normalizeChoiceId(readable);
  return normalizeChoiceId([type, skill, choiceHash(raw)].filter(Boolean).join(":"));
}

export function resolveGrantChoiceIds(grant, { sourceId = "", index = 0 } = {}) {
  const count = getGrantChoiceCount(grant);
  if (count <= 1) return [resolveGrantChoiceId(grant, { sourceId, index })].filter(Boolean);

  const explicit = normalizeChoiceId(grant?.choiceId);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(resolveGrantChoiceId({
      ...grant,
      choiceId: explicit ? `${explicit}:${i + 1}` : "",
      count: 1,
    }, { sourceId, index: `${index}:${i + 1}` }));
  }
  return ids.filter(Boolean);
}

export function resolveGrantChoiceAliases(grant, { sourceId = "", index = 0 } = {}) {
  const canonical = resolveGrantChoiceId(grant, { sourceId, index });
  const legacy = resolveLegacyGrantChoiceId(grant, { sourceId, index });
  const displayCaseLegacy = resolveLegacyGrantChoiceId(grant, { sourceId, index, normalizeSemantic: false });
  return [canonical, legacy, displayCaseLegacy].filter((id, idx, arr) => id && arr.indexOf(id) === idx);
}

export function resolveGrantChoiceRef(grant) {
  return normalizeChoiceId(grant?.choiceRef);
}

export function buildGrantChoiceNodeId(choiceId) {
  const id = normalizeChoiceId(choiceId);
  return id ? `grant-choice:${id}` : "";
}
