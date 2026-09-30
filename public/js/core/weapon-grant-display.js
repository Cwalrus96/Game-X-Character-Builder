import { escapeHtml } from "./data-sanitization.js";
import { renderTechniqueProfileHtml, renderTagChipsHtml } from "./technique-utils.js?v=sheet-rolls7";
import { getTechniquePerformance, createTechniqueContext } from "./technique-rules.js";
import { getWeaponAttackProfile } from "./weapon-attack-rules.js";
import { getFightingStyleProjection } from "./fighting-style-rules.js";
import { getEffectiveTags, renderWeaponStyleDetailsHtml } from "./weapon-utils.js?v=weapon-styles1";

/** Shared read-only equipment presentation, retaining the owning Trait and full attack rules. */
export function renderGrantedWeaponHtml(weapon, { gameData, builder, renderRollButton = () => "" }) {
  const base = (gameData.weaponBases || []).find(row => row.weaponKey === weapon.weaponKey);
  const context = createTechniqueContext({ gameData, builder, weapons: [weapon] });
  const techniques = (weapon.techniqueKeys || []).map(key => (gameData.techniques || []).find(row => row.techniqueKey === key)).filter(Boolean);
  const fightingStyle = getFightingStyleProjection(gameData, builder, { weapon: { ...weapon, effectiveTags: getEffectiveTags(weapon, gameData.weaponBases) } });
  return `<article class="optionRow equipmentWeaponRow ability-card" data-derived-weapon="${escapeHtml(weapon.id)}">
    <h3>${escapeHtml(weapon.name)} · Rank ${weapon.rank}</h3>
    <div class="help">Granted by ${escapeHtml(weapon.sourceLabel)} · No equipment slots</div>
    <div class="weapon-tag-row">${renderTagChipsHtml(fightingStyle.effectiveWeaponTags, "tagChip weapon-tag-chip")}</div>
    ${base?.traitsText ? `<p>${escapeHtml(base.traitsText)}</p>` : ""}
    <div class="equipmentMetaList">${techniques.map(technique => renderTechniqueProfileHtml(getWeaponAttackProfile(technique, weapon, { profiles: techniques }), { gameData, heading: technique.techniqueName, headingTag: "h4", rollButtonHtml: renderRollButton(technique),
      performance: getTechniquePerformance(technique, context, { skillName: weapon.associatedSkill, rank: weapon.rank, weaponId: weapon.id, sourceLabel: weapon.sourceLabel }) })).join("")}${renderWeaponStyleDetailsHtml(fightingStyle)}</div>
  </article>`;
}
