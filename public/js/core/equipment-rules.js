import { computeEnhancementCapacity, getWeaponSkillRankCap } from "./weapon-utils.js";

/** A lower governing skill either leaves a legal rank or removes the weapon. */
export function getWeaponRankAfterSkillChange(definition, rank, skillRanks) {
  const nextRank = Math.min(rank, getWeaponSkillRankCap(definition, skillRanks));
  return nextRank >= Number(definition.minRank || 0) ? nextRank : null;
}

/** Preserve earlier purchases in stored order; source-granted enhancements are free. */
export function getExcessWeaponEnhancements(weapons, grantedSlots = 0) {
  const capacity = computeEnhancementCapacity(weapons, grantedSlots);
  const purchases = weapons.flatMap(weapon => weapon.enhancements
    .filter(enhancement => enhancement.granted !== true)
    .map(enhancement => ({ weaponId: weapon.id, enhancementId: enhancement.id })));
  return purchases.slice(capacity);
}
