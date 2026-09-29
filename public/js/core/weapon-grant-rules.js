import { isGameDataRecordExecutable } from "./selection-rules.js";
import { isTraitWeaponChoice, traitOptionLabel } from "./trait-option-rules.js";
import { getWeaponSkillNames } from "./weapon-utils.js";
import { canonicalSkillName } from "./skill-identity.js";

/** The same grant restrictions apply in the picker and saved-answer validation. */
export function weaponMatchesGrant(definition, grant) {
  if (!definition) return false;
  const values = value => Array.isArray(value) ? value : value ? [value] : [];
  const keys = values(grant.key || grant.weaponKey);
  if (keys.length && !keys.includes(definition.weaponKey)) return false;
  const skills = values(grant.skill).map(canonicalSkillName);
  if (skills.length && !skills.some(skill => getWeaponSkillNames(definition).includes(skill))) return false;
  const tags = values(grant.tag).map(tag => String(tag).toLowerCase());
  return !tags.length || tags.some(tag => (definition.tags || []).some(value => String(value).toLowerCase() === tag));
}

/** Automatic weapons are projections of their provider, never equipment purchases. */
export function projectTraitWeapons(traits, gameData) {
  const weapons = [];
  for (const trait of traits) {
    if (!trait.active || trait.referenceOnly || trait.recipientId !== "character") continue;
    for (const [index, grant] of (trait.grants || []).entries()) {
      if (grant.type !== "weapon") continue;
      const selectable = isTraitWeaponChoice(grant);
      if (!selectable && (typeof grant.key !== "string" || Object.keys(grant).some(key => !["type", "key", "count"].includes(key)))) continue;
      for (let slot = 1; slot <= (grant.count ?? 1); slot++) {
        const selected = (trait.optionChoices || []).find(choice => choice.localId === grant.choiceId && choice.slot === slot && choice.valid);
        const base = (gameData.weaponBases || []).find(row => row.weaponKey === (selectable ? selected?.value : grant.key));
        if (!base || !isGameDataRecordExecutable(base) || trait.rank < base.minRank) continue;
        const tags = (base.tags || []).map(tag => /^reach\s+n$/i.test(tag) && base.reachByRank?.[trait.rank] != null
          ? `Reach ${base.reachByRank[trait.rank]}` : tag);
        if (trait.traitKey === "integrated-weapon" && !tags.some(tag => /^natural$/i.test(tag))) tags.push("Natural");
        weapons.push({ id: `trait-weapon:${trait.id}:${index}:${base.weaponKey}:${slot}`, weaponKey: base.weaponKey,
          name: base.name, customName: "", rank: trait.rank, tags, effectiveTags: tags, enhancements: [],
          derived: true, generated: true, traitId: trait.id, sourceId: trait.sourceId,
          sourceLabel: traitOptionLabel(trait), associatedSkill: trait.associatedSkill || "", techniqueKeys: base.techniqueKeys || [] });
      }
    }
  }
  return weapons;
}
