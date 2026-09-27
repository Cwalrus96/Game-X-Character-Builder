/** Adapt the existing explicit Reach N equation; unknown equations remain deferred. */
export function weaponReachByRank(tags, traitsText) {
  if (!(tags || []).some(tag => /^reach\s+n$/i.test(tag))) return null;
  const match = String(traitsText || "").trim().match(/^Reach N:\s*N equals (?:(\d+)\s*\+\s*)?the associated skill rank\.$/i);
  if (!match) return null;
  const offset = Number(match[1] || 0);
  return Object.fromEntries(Array.from({ length: 7 }, (_, rank) => [rank, rank + offset]));
}
