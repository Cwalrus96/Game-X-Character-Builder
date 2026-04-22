import { escapeHtml, sanitizeText, safeHtmlText } from "./data-sanitization.js";

export function renderTagChipsHtml(tags, chipClass = "tagChip") {
  if (!Array.isArray(tags) || !tags.length) return "—";
  return tags.map((tag) => `<span class="${chipClass}">${escapeHtml(tag)}</span>`).join(", ");
}

function formatCostLine(profile) {
  if (!profile) return "";
  const parts = [];
  const actions = Number.parseInt(String(profile?.actions ?? ""), 10);
  const rawActionType = sanitizeText(profile?.actionType, { maxLen: 32, collapse: true }) || "Action";
  const actionType = rawActionType === "ActionOrReaction" ? "Action or Reaction" : rawActionType;
  if (Number.isFinite(actions) && actions > 0) {
    parts.push(`${actions} ${actionType}${actions === 1 ? "" : "s"}`);
  } else if (actionType) {
    parts.push(actionType);
  }
  const energyCost = Number.parseInt(String(profile?.energyCost ?? ""), 10);
  if (profile?.pumpable === true || (Number.isFinite(energyCost) && energyCost < 0)) parts.push("Variable Energy");
  else if (Number.isFinite(energyCost) && energyCost > 0) parts.push(`${energyCost} Energy`);
  const strainCost = Number.parseInt(String(profile?.strainCost ?? ""), 10);
  if (Number.isFinite(strainCost) && strainCost > 0) parts.push(`${strainCost} Strain`);
  if (profile?.sustained) parts.push("Sustained");
  return parts.length ? `( ${parts.join(" + ")} )` : "";
}

function formatDefenseLabel(defense) {
  const value = sanitizeText(defense, { maxLen: 64, collapse: true });
  if (!value) return "";
  return /defense$/i.test(value) ? value : `${value} Defense`;
}

function formatAdditionalEnergyText(pump) {
  const value = sanitizeText(pump, { maxLen: 160, collapse: true });
  if (!value || value === "+0") return "";
  if (/per energy/i.test(value) && !/(damage|ward|wards|range|reach|square|squares|target|targets|armor|healing|heal|speed|movement|die|dice|hit|hits)/i.test(value)) {
    return value.replace(/per energy/i, "Damage per Energy");
  }
  return value;
}

function formatRollLine(profile) {
  if (!profile || profile?.rollRequired === false) return "";
  const attribute = sanitizeText(profile?.attribute, { maxLen: 48, collapse: true });
  const skill = sanitizeText(profile?.skill, { maxLen: 96, collapse: true });
  const defense = formatDefenseLabel(profile?.defense);
  const parts = [];
  const attackParts = [];
  if (attribute || skill) attackParts.push(`${attribute} (${skill})`.replace(/^ \(/, "(").replace(/\(\)/, "").replace(/\s+/g, " ").trim());
  if (defense) attackParts.push(`vs ${defense}`);
  if (attackParts.length) parts.push(`${attackParts.join(" ")}.`);
  return parts.join(" ");
}

function formatRangeTargetsLine(profile) {
  if (!profile) return "";
  const range = sanitizeText(profile?.range, { maxLen: 96, collapse: true });
  const targets = sanitizeText(profile?.targets, { maxLen: 96, collapse: true });
  const parts = [];
  if (range) parts.push(`Range: ${range}`);
  if (targets) parts.push(`Targets: ${targets}`);
  return parts.join(". ");
}

function getProfileDamageParts(profile, rankValue = 0) {
  const rankKey = String(Math.max(0, Math.min(6, Number(rankValue || 0))));
  const damageByRank = (profile?.damageByRank && typeof profile.damageByRank === "object") ? profile.damageByRank : null;
  const pumpDamageByRank = (profile?.pumpDamageByRank && typeof profile.pumpDamageByRank === "object") ? profile.pumpDamageByRank : null;
  const damage = sanitizeText(damageByRank?.[rankKey] || profile?.damage || "", { maxLen: 160, collapse: true });
  const additional = formatAdditionalEnergyText(pumpDamageByRank?.[rankKey] || "");
  return { damage, additional };
}

export function renderTechniqueProfileHtml(profile, { rankValue = 0, heading = "", headingTag = "div", headingClass = "combat-profile-title", showRank = false } = {}) {
  if (!profile) return "";
  const titleText = sanitizeText(heading || profile?.techniqueName || profile?.profileName || "", { maxLen: 160, collapse: true });
  const rank = Number.parseInt(String(profile?.rank ?? rankValue ?? 0), 10) || 0;
  const title = titleText ? `${titleText}${showRank && rank > 0 ? ` (Rank ${rank})` : ""}` : "";
  const tags = Array.isArray(profile?.tags) ? profile.tags.map((tag) => sanitizeText(tag, { maxLen: 64, collapse: true })).filter(Boolean) : [];
  const trigger = sanitizeText(profile?.trigger, { maxLen: 240, collapse: true });
  const rollLine = formatRollLine(profile);
  const rangeTargetsLine = formatRangeTargetsLine(profile);
  const description = sanitizeText(profile?.description || "", { maxLen: 1200, collapse: true });
  const notes = sanitizeText(profile?.notes || "", { maxLen: 1200, collapse: true });
  const bondEffect = sanitizeText(profile?.bondEffect || "", { maxLen: 400, collapse: true });
  const onSuccess = sanitizeText(profile?.onSuccess || "", { maxLen: 400, collapse: true });
  const onCritSuccess = sanitizeText(profile?.onCriticalSuccess || "", { maxLen: 400, collapse: true });
  const onFailure = sanitizeText(profile?.onFailure || "", { maxLen: 400, collapse: true });
  const onCritFailure = sanitizeText(profile?.onCriticalFailure || "", { maxLen: 400, collapse: true });
  const costLine = formatCostLine(profile);
  const dmg = getProfileDamageParts(profile, rankValue);
  const rows = [];
  if (tags.length) rows.push(`<div class="combat-profile-line combat-profile-tags">${renderTagChipsHtml(tags, "tagChip")}</div>`);
  if (costLine) rows.push(`<div class="combat-profile-line combat-profile-cost">${safeHtmlText(costLine, 240)}</div>`);
  if (trigger) rows.push(`<div class="combat-profile-line"><strong>Trigger:</strong> ${safeHtmlText(trigger, 320)}</div>`);
  if (rollLine) rows.push(`<div class="combat-profile-line">${safeHtmlText(rollLine, 320)}</div>`);
  if (rangeTargetsLine) rows.push(`<div class="combat-profile-line">${safeHtmlText(rangeTargetsLine, 320)}</div>`);
  if (description) rows.push(`<div class="combat-profile-line">${safeHtmlText(description, 1200)}</div>`);
  if (dmg.damage) {
    const damageText = dmg.additional ? `${dmg.damage}, ${dmg.additional}` : dmg.damage;
    rows.push(`<div class="combat-profile-line"><strong>Damage:</strong> ${safeHtmlText(damageText, 240)}</div>`);
  } else if (dmg.additional) {
    rows.push(`<div class="combat-profile-line"><strong>Additional Energy:</strong> ${safeHtmlText(dmg.additional, 240)}</div>`);
  }
  if (onSuccess) rows.push(`<div class="combat-profile-line"><strong>Success:</strong> ${safeHtmlText(onSuccess, 500)}</div>`);
  if (onCritSuccess) rows.push(`<div class="combat-profile-line"><strong>Critical Success:</strong> ${safeHtmlText(onCritSuccess, 500)}</div>`);
  if (onFailure) rows.push(`<div class="combat-profile-line"><strong>Failure:</strong> ${safeHtmlText(onFailure, 500)}</div>`);
  if (onCritFailure) rows.push(`<div class="combat-profile-line"><strong>Critical Failure:</strong> ${safeHtmlText(onCritFailure, 500)}</div>`);
  if (bondEffect) rows.push(`<div class="combat-profile-line"><strong>Bond Effect:</strong> ${safeHtmlText(bondEffect, 500)}</div>`);
  if (notes) rows.push(`<div class="combat-profile-line">${safeHtmlText(notes, 1200)}</div>`);
  return `<div class="combat-profile">${title ? `<${headingTag} class="${headingClass}">${safeHtmlText(title, 200)}</${headingTag}>` : ""}${rows.join("")}</div>`;
}
