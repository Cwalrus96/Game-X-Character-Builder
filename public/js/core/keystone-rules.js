import { getGrantChoiceCount } from "./choice-identity.js";

export const KEYSTONE_TEXT_LIMIT = 400;

/** Only free-text character Keystones are implemented; other generic choices stay deferred. */
export function isKeystoneGrant(grant) {
  const filters = Array.isArray(grant?.filterType) ? grant.filterType : [grant?.filterType];
  return grant?.type === "choice" && filters.length === 1 && filters[0] === "keystone"
    && !grant.recipientRef && !grant.key && !grant.name && !grant.choiceRef;
}

function identityPart(value) {
  let hash = 5381;
  for (const ch of String(value)) hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

export function getKeystoneChoices(grant, { sourceId, index = 0, sourceLabel = "Keystone" } = {}) {
  if (!sourceId || !isKeystoneGrant(grant)) return [];
  const count = getGrantChoiceCount(grant);
  const rawId = `${sourceId}:keystone:${grant.choiceId || index}`;
  const baseId = rawId.length <= 240 && /^[A-Za-z0-9_.:/-]+$/.test(rawId)
    ? rawId : `keystone:${identityPart(rawId)}`;
  return Array.from({ length: count }, (_, slot) => ({
    choiceId: `${baseId}:${slot + 1}`, sourceId,
    label: count > 1 ? `${sourceLabel} — Keystone ${slot + 1}` : sourceLabel,
  }));
}

export function buildKeystoneAnswer(choice, value) {
  return {
    choiceId: choice.choiceId, sourceId: choice.sourceId, sourceLabel: choice.label,
    type: "keystone", value, techniqueKey: "", skillKey: "", weaponKey: "", rank: 0,
    customName: "", enhancements: [], tags: [],
  };
}

export function getKeystoneAnswerState(answer, choice) {
  if (answer?.type !== "keystone") return { valid: false, reason: "This choice requires Keystone text." };
  if (answer.sourceId !== choice.sourceId) return { valid: false, reason: "The Keystone belongs to a different granting feature." };
  return { valid: Boolean(answer.value), reason: answer.value ? "" : "Add text for this Keystone." };
}
