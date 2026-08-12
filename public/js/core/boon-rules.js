import { sanitizeText } from "./data-sanitization.js";

export const BOON_CHOICE_FILTER_TYPE = "boon";

export function normalizeBoonGrant(grant = {}) {
  if (grant?.type !== "choice" || grant?.filterType !== BOON_CHOICE_FILTER_TYPE) return null;
  const boonKey = sanitizeText(grant.key, { maxLen: 128, collapse: true }).toLowerCase();
  const name = sanitizeText(grant.name || grant.key, { maxLen: 120, collapse: true });
  const description = sanitizeText(grant.note || "", { maxLen: 4000, collapse: false });
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,127})$/.test(boonKey) || !name) return null;
  return Object.freeze({ boonKey, name, description });
}
