// Game X roll math. No DOM, character mutation, persistence or animation state.
export function requireRollNumber(value, label, { min = 0, max = 9999, half = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max
    || !Number.isInteger(value * (half ? 2 : 1))) {
    throw new Error(`${label} must be ${half ? "a whole or half number" : "a whole number"} from ${min} to ${max}.`);
  }
  return value;
}

export function buildDicePool({ attribute, skillRank, modifiers = [] }) {
  requireRollNumber(attribute, "Attribute");
  requireRollNumber(skillRank, "Skill rank");
  const adjustment = modifiers.reduce((sum, value) => sum + requireRollNumber(value, "Dice modifier", { min: -99, max: 99, half: true }), 0);
  const total = attribute === 0 ? 0 : Math.max(0, attribute + skillRank + adjustment);
  const whole = Math.floor(total);
  return Object.freeze({ attribute, skillRank, adjustment, total,
    dice: Math.min(10, whole), coin: total % 1 === 0.5, automaticHits: Math.max(0, whole - 10),
    reason: attribute === 0 ? "Attribute is zero: 0 Hits without rolling." : total === 0 ? "The dice pool is zero: 0 Hits without rolling." : "" });
}

// Randomness is injected so the exact same rules can be tested with known faces.
export function resolveDicePool(pool, nextFace) {
  const dice = Array.from({ length: pool.dice }, () => {
    const face = requireRollNumber(nextFace(6), "Die face", { min: 1, max: 6 });
    return Object.freeze({ face, hits: Math.floor((face - 1) / 2) });
  });
  const coin = pool.coin ? requireRollNumber(nextFace(2), "Coin face", { min: 1, max: 2 }) - 1 : null;
  const hits = dice.reduce((sum, die) => sum + die.hits, 0) + (coin ?? 0) + pool.automaticHits;
  return Object.freeze({ pool, dice: Object.freeze(dice), coin, hits });
}

export function resolveRollOutcome(hits, targetNumber) {
  requireRollNumber(hits, "Hits", { max: 100000 });
  if (targetNumber === null || targetNumber === undefined || targetNumber === "") return null;
  requireRollNumber(targetNumber, "Target number", { max: 100000 });
  const margin = hits - targetNumber;
  const criticals = margin >= 3 ? Math.floor(margin / 3) : 0;
  const key = criticals ? "criticalSuccess" : margin >= 0 ? "success" : margin >= -3 ? "failure" : "criticalFailure";
  const label = { criticalSuccess: "Critical success", success: "Success", failure: "Failure", criticalFailure: "Critical failure" }[key];
  return Object.freeze({ key, label, margin, criticals, multiplier: criticals ? 1 + criticals : margin >= 0 ? 1 : margin >= -3 ? 0.5 : 0 });
}

export function buildDamageBands(fullDamage, hits, { normalCritical = false } = {}) {
  requireRollNumber(fullDamage, "Damage", { max: 1000000 });
  requireRollNumber(hits, "Hits", { max: 100000 });
  const rows = [
    { key: "criticalFailure", label: "Critical failure", margin: "−4 or less", damage: 0, multiplier: 0 },
    { key: "failure", label: "Failure", margin: "−3 to −1", damage: Math.floor(fullDamage / 2), multiplier: 0.5 },
    { key: "success", label: "Success", margin: "0 to +2", damage: fullDamage, multiplier: 1 },
  ];
  // Include every attainable tier with nonnegative TN, plus the first three for reference.
  for (let tier = 1; tier <= Math.max(3, Math.floor(hits / 3)); tier += 1) {
    rows.push({ key: "criticalSuccess", tier, label: `Critical success ×${normalCritical ? 1 : tier + 1}`,
      margin: `+${tier * 3} to +${tier * 3 + 2}`, damage: fullDamage * (normalCritical ? 1 : tier + 1), multiplier: normalCritical ? 1 : tier + 1 });
  }
  return rows;
}
