import { escapeHtml } from "../../core/data-sanitization.js";
import { getEffectiveTags, getWeaponDef, renderTagChipsHtml, summarizeWeaponProfilesHtml } from "../../core/weapon-utils.js";

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
export function renderSelectedWeaponHtml({ choiceId, weapon, weaponBases = [], label = "Selected weapon" } = {}) {
  if (!weapon?.weaponKey) return "";
  const definition = getWeaponDef(weaponBases, weapon.weaponKey);
  return renderSelectedChoiceHtml({
    choiceId, selectedKey: weapon.weaponKey, label,
    contentHtml: `<div class="optionTitle">${escapeHtml(definition?.name || weapon.weaponKey)}</div>
      <div class="optionDesc">${escapeHtml(definition?.description || "")}</div>
      ${renderTagChipsHtml(getEffectiveTags(weapon, weaponBases))}
      ${definition?.profiles?.length ? summarizeWeaponProfilesHtml(definition, weapon.rank) : ""}`,
  });
}
