import { escapeHtml } from "../../../core/data-sanitization.js";

const esc = value => escapeHtml(String(value ?? ""));

/** Presentation only: eligibility and every numeric effect come from Rules. */
export function renderFightingStyleConditions(projection, conditions = {}) {
  return (projection.conditionChoices || []).map(({ key, label }) =>
    `<label class="roll-style-condition"><input type="checkbox" data-roll-style-condition="${esc(key)}" ${conditions[key] ? "checked" : ""}/> <span>${esc(label)}</span></label>`).join("");
}

export function renderFightingStyleNotes(projection, { criticalSuccess = false, includeConditions = false } = {}) {
  const effects = projection.rollEffects || {};
  const applied = [
    effects.damageBonus ? `+${effects.damageBonus} damage${effects.damageBonusOnHit ? " on a hit" : ""} included in successful damage outcomes.` : "",
    effects.defenseDiceBonus ? `+${effects.defenseDiceBonus}D included in this defense roll.` : "",
    effects.rangeMultiplier > 1 ? (projection.effectiveRange ? `Range ×${effects.rangeMultiplier}: ${projection.effectiveRange}.`
      : `Range ×${effects.rangeMultiplier}.${projection.rangeSource ? ` Apply the multiplier to the full authored range: ${projection.rangeSource}` : ""}`) : "",
    effects.ignoreAdjacentRangedPenalty ? "No penalty for this ranged attack against an adjacent target. Do not enter that penalty in modifiers." : "",
    effects.targetDefenseDicePenalty ? `The target takes −${effects.targetDefenseDicePenalty}D to its defense roll. Have the defender apply this before entering its result as TN.` : "",
  ].filter(Boolean);
  const conditions = includeConditions ? (projection.conditionChoices || []).filter(row => projection.conditions?.[row.key]).map(row => row.label) : [];
  const reminders = (projection.reminders || []).map(row => row.text);
  const triggered = criticalSuccess ? (projection.triggeredEffects || []).map(row => row.text ||
    `${row.defense} Defense −${row.dicePenalty}D. ${row.duration}`) : [];
  return [
    conditions.length ? `<p class="roll-help"><strong>Confirmed conditions:</strong> ${conditions.map(esc).join("; ")}</p>` : "",
    ...applied.map(text => `<p class="roll-help"><strong>Applied:</strong> ${esc(text)}</p>`),
    ...triggered.map(text => `<p class="roll-notice"><strong>Critical effect:</strong> ${esc(text)}</p>`),
    ...reminders.map(text => `<p class="roll-help">${esc(text)}</p>`),
  ].join("");
}
