/** Direct damaging attacks explicitly provided by a weapon, in authored order. */
export function getWeaponBasicAttacks(profiles) {
  return (profiles || []).filter(profile => profile && profile.rollRequired === true && !profile.basicAttack?.length && profile.damage);
}

/** A wrapper's explicit range defines how its underlying attack is delivered.
 * Inspect authored range fields only, outermost first; never infer from names
 * or descriptive prose. A mixed range remains a player choice.
 */
export function getWeaponAttackKind(profiles = []) {
  for (const profile of profiles) {
    const range = String(profile?.range || "").trim();
    const kinds = [...new Set((range.match(/\b(?:melee|ranged|thrown)\b/gi) || []).map(kind => kind.toLowerCase()))];
    if (kinds.length) return kinds.length === 1 ? kinds[0] : "";
    if (/^range\s+\d+\b/i.test(range)) return "ranged";
  }
  return "";
}

/** Apply an owned weapon's attack rules without changing the shared catalogue.
 * Explicit Technique overrides are applied after the weapon's own mechanics.
 */
export function getWeaponAttackProfile(profile, weapon, { profiles = [], overrides = {} } = {}) {
  if (!profile) return profile;
  const agile = (weapon?.enhancements || []).some(enhancement => enhancement.enhancementKey === "agile_weapon");
  const weaponAttribute = attribute => agile && String(attribute || "").toLowerCase() === "strength" ? "Agility" : attribute;
  const resolved = { ...profile, ...(profile.attribute ? { attribute: weaponAttribute(profile.attribute) } : {}), ...overrides };
  if (weapon && resolved.attribute === "Weapon Attribute") {
    const attributes = [...new Set(getWeaponBasicAttacks(profiles).map(attack => weaponAttribute(attack.attribute)).filter(Boolean))];
    if (attributes.length === 1) resolved.attribute = attributes[0];
  }
  return resolved;
}
