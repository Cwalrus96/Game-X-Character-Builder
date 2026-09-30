import { escapeHtml } from "../../core/data-sanitization.js";
import { getEffectiveTags, getWeaponDef, renderTagChipsHtml, summarizeWeaponProfilesHtml, renderWeaponStyleDetailsHtml } from "../../core/weapon-utils.js?v=weapon-styles1";
import { getFightingStyleProjection } from "../../core/fighting-style-rules.js";

/** Shared, choice-owned detail region, currently composed into expanded weapon cards.
 * contentHtml must come from an escaping domain renderer, never raw authored text.
 */
export function renderSelectedChoiceHtml({ choiceId, selectedKey, label = "Selected choice", contentHtml = "" } = {}) {
  if (!selectedKey || !contentHtml) return "";
  return `<div class="selectedChoiceDetail" data-choice-selection="${escapeHtml(choiceId)}" data-selected-key="${escapeHtml(selectedKey)}" role="region" aria-label="${escapeHtml(label)}">${contentHtml}</div>`;
}

/** DOM-based widgets use the same result component as template-based widgets. */
export function appendSelectedChoice(element, options) {
  const html = renderSelectedChoiceHtml(options);
  if (html) element.insertAdjacentHTML("beforeend", html);
}

/** Ordinary and granted weapon choices show the same authored text and profiles. */
export function renderSelectedWeaponHtml({ choiceId, weapon, weaponBases = [], gameData = null, builder = null, label = "Selected weapon" } = {}) {
  if (!weapon?.weaponKey) return "";
  const definition = getWeaponDef(weaponBases, weapon.weaponKey);
  const tags = getEffectiveTags(weapon, weaponBases);
  const fightingStyle = gameData && builder ? getFightingStyleProjection(gameData, builder, { weapon: { ...weapon, effectiveTags: tags } }) : null;
  return renderSelectedChoiceHtml({
    choiceId, selectedKey: weapon.weaponKey, label,
    contentHtml: `<div class="optionTitle">${escapeHtml(definition?.name || weapon.weaponKey)}</div>
      <div class="optionDesc">${escapeHtml(definition?.description || "")}</div>
      ${renderTagChipsHtml(fightingStyle?.effectiveWeaponTags || tags)}
      ${definition?.profiles?.length ? summarizeWeaponProfilesHtml(definition, weapon.rank, { weapon, fightingStyle }) : renderWeaponStyleDetailsHtml(fightingStyle)}`,
  });
}
