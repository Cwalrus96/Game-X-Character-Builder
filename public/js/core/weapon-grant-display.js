import { escapeHtml } from "./data-sanitization.js";
import { renderTechniqueProfileHtml, renderTagChipsHtml } from "./technique-utils.js";
import { getTechniquePerformance, createTechniqueContext } from "./technique-rules.js";

/** Shared read-only equipment presentation, retaining the owning Trait and full attack rules. */
export function renderGrantedWeaponHtml(weapon, { gameData, builder }) {
  const base = (gameData.weaponBases || []).find(row => row.weaponKey === weapon.weaponKey);
  const context = createTechniqueContext({ gameData, builder, weapons: [weapon] });
  const techniques = (weapon.techniqueKeys || []).map(key => (gameData.techniques || []).find(row => row.techniqueKey === key)).filter(Boolean);
  return `<article class="optionRow equipmentWeaponRow ability-card" data-derived-weapon="${escapeHtml(weapon.id)}">
    <h3>${escapeHtml(weapon.name)} · Rank ${weapon.rank}</h3>
    <div class="help">Granted by ${escapeHtml(weapon.sourceLabel)} · No equipment slots</div>
    <div class="weapon-tag-row">${renderTagChipsHtml(weapon.tags, "tagChip weapon-tag-chip")}</div>
    ${base?.traitsText ? `<p>${escapeHtml(base.traitsText)}</p>` : ""}
    <div class="equipmentMetaList">${techniques.map(technique => renderTechniqueProfileHtml(technique, { gameData, heading: technique.techniqueName, headingTag: "h4",
      performance: getTechniquePerformance(technique, context, { skillName: weapon.associatedSkill, rank: weapon.rank, weaponId: weapon.id, sourceLabel: weapon.sourceLabel }) })).join("")}</div>
  </article>`;
}
