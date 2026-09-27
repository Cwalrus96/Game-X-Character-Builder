import { isGameDataRecordExecutable } from "./selection-rules.js";

/** Automatic weapons are projections of their provider, never equipment purchases. */
export function projectTraitWeapons(traits, gameData) {
  const weapons = [];
  for (const trait of traits) {
    if (!trait.active || trait.referenceOnly || trait.recipientId !== "character") continue;
    for (const [index, grant] of (trait.grants || []).entries()) {
      if (grant.type !== "weapon" || typeof grant.key !== "string") continue;
      if (Object.keys(grant).some(key => !["type", "key", "count"].includes(key))) continue;
      const base = (gameData.weaponBases || []).find(row => row.weaponKey === grant.key);
      if (!base || !isGameDataRecordExecutable(base) || trait.rank < base.minRank) continue;
      for (let slot = 1; slot <= (grant.count ?? 1); slot++) {
        const tags = (base.tags || []).map(tag => /^reach\s+n$/i.test(tag) && base.reachByRank?.[trait.rank] != null
          ? `Reach ${base.reachByRank[trait.rank]}` : tag);
        weapons.push({ id: `trait-weapon:${trait.id}:${index}:${base.weaponKey}:${slot}`, weaponKey: base.weaponKey,
          name: base.name, customName: "", rank: trait.rank, tags, effectiveTags: tags, enhancements: [],
          derived: true, generated: true, traitId: trait.id, sourceId: trait.sourceId,
          sourceLabel: trait.name, associatedSkill: trait.associatedSkill || "", techniqueKeys: base.techniqueKeys || [] });
      }
    }
  }
  return weapons;
}
