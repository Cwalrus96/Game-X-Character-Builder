import { escapeHtml, sanitizeText, safeHtmlText } from "./data-sanitization.js";
import { canonicalSkillName } from "./skill-identity.js";

// Catalogue text is already bounded by the data contract. Do not truncate mechanics
// again in a display shared by choices, weapons and the character sheet.
const mechanicText = (value) => sanitizeText(value || "", { maxLen: Number.MAX_SAFE_INTEGER, collapse: false });
const mechanicHtml = (value) => escapeHtml(mechanicText(value));

export function renderTagChipsHtml(tags, chipClass = "tagChip") {
  if (!Array.isArray(tags) || !tags.length) return "—";
  return tags.map((tag) => `<span class="${chipClass}">${escapeHtml(tag)}</span>`).join(", ");
}

function formatCostLine(profile) {
  if (!profile) return "";
  if (profile.expressionSyntaxVersion === 3) {
    const types = { ActionOrReaction: "Action or Reaction", ActionOrFreeReaction: "Action or Free Reaction" };
    const actionType = types[profile.actionType] || profile.actionType;
    const actions = profile.actions;
    const parts = [actions === null || actions === undefined || !actionType
      ? "Actions: Unassigned" : `${actions === 0 ? "Free" : actions} ${actionType}`];
    if (profile.energyCostKind === "variable") parts.push("Variable Energy");
    else if (profile.energyCostKind === "fixed" && Number.isFinite(profile.energyCost)) parts.push(`${profile.energyCost} Energy`);
    else if (profile.energyCostKind === "conditional") parts.push((profile.energyCostOptions || []).map((option) => `${option.condition || option.key || option.label || "Condition"}: ${option.cost ?? option.value ?? "?"} Energy`).join("; ") || "Energy: Unassigned");
    else parts.push("Energy: Unassigned");
    if (profile.strainCost !== null && Number(profile.strainCost) > 0) parts.push(`${profile.strainCost} Strain`);
    if (profile.sustained) parts.push("Sustained");
    return `( ${parts.join(" + ")} )`;
  }
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

function formatAdditionalEnergyText(pump, syntaxVersion) {
  const value = mechanicText(pump);
  if (!value || value === "+0") return "";
  if (syntaxVersion !== 3 && /per energy/i.test(value) && !/(damage|ward|wards|range|reach|square|squares|target|targets|armor|healing|heal|speed|movement|die|dice|hit|hits)/i.test(value)) {
    return value.replace(/per energy/i, "Damage per Energy");
  }
  return value;
}

function formatRollLine(profile) {
  if (!profile || profile?.rollRequired === false) return "";
  const attribute = sanitizeText(profile?.attribute, { maxLen: 48, collapse: true });
  const skill = canonicalSkillName(sanitizeText(profile?.skill, { maxLen: 96, collapse: true }));
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
  const pumping = profile?.expressionSyntaxVersion === 3 ? profile.pumpingByRank : profile?.pumpDamageByRank;
  const pumpDamageByRank = pumping && typeof pumping === "object" ? pumping : null;
  const damage = mechanicText(damageByRank?.[rankKey] || profile?.damage);
  const additional = formatAdditionalEnergyText(pumpDamageByRank?.[rankKey] || "", profile?.expressionSyntaxVersion);
  return { damage, additional };
}

function formatBasicAttack(clauses, gameData) {
  const format = (clause) => {
    if (clause.type === "any") return clause.alternatives.map(format).join(" or ");
    const references = (gameData?.techniques || []).filter((technique) => technique.techniqueKey === clause.key);
    const label = clause.type === "weapon" ? "Weapon basic attack"
      : references.length === 1 ? references[0].techniqueName : `Technique: ${clause.key}`;
    const modifiers = [clause.attribute ? `attribute: ${clause.attribute}` : "", clause.defense ? `vs ${formatDefenseLabel(clause.defense)}` : ""].filter(Boolean);
    return `${label}${modifiers.length ? ` (${modifiers.join("; ")})` : ""}`;
  };
  return (clauses || []).map(format).join("; ");
}

export function renderTechniqueProfileHtml(profile, { rankValue = 0, heading = "", headingTag = "div", headingClass = "combat-profile-title", showRank = false, gameData = null, performance = null } = {}) {
  if (!profile) return "";
  if (performance) { profile = { ...profile, skill: performance.skillName }; rankValue = performance.rank; }
  const titleText = sanitizeText(heading || profile?.techniqueName || profile?.profileName || "", { maxLen: 160, collapse: true });
  const rank = Number.parseInt(String(profile?.rank ?? rankValue ?? 0), 10) || 0;
  const title = titleText ? `${titleText}${showRank && rank > 0 ? ` (Rank ${rank})` : ""}` : "";
  const tags = Array.isArray(profile?.tags) ? profile.tags.map((tag) => sanitizeText(tag, { maxLen: 64, collapse: true })).filter(Boolean) : [];
  const trigger = mechanicText(profile?.trigger);
  const rollLine = formatRollLine(profile);
  const rangeTargetsLine = formatRangeTargetsLine(profile);
  const description = mechanicText(profile?.description);
  const notes = mechanicText(profile?.notes);
  const bondEffect = mechanicText(profile?.bondEffect);
  const onSuccess = mechanicText(profile?.onSuccess);
  const onCritSuccess = mechanicText(profile?.onCriticalSuccess);
  const onFailure = mechanicText(profile?.onFailure);
  const onCritFailure = mechanicText(profile?.onCriticalFailure);
  const costLine = formatCostLine(profile);
  const dmg = getProfileDamageParts(profile, rankValue);
  const rows = [];
  if (performance?.skillName) rows.push(`<div class="combat-profile-line"><strong>Skill:</strong> ${escapeHtml(performance.skillName)} — Rank ${performance.rank}${performance.sourceLabel ? ` (${escapeHtml(performance.sourceLabel)})` : ""}</div>`);
  if (performance?.alternatives?.length > 1) rows.push(`<div class="combat-profile-line">Other available rolls: ${performance.alternatives.slice(1).map(option => `${escapeHtml(option.skillName)} — Rank ${option.rank}${option.sourceLabel ? ` (${escapeHtml(option.sourceLabel)})` : ""}`).join("; ")}</div>`);
  if (tags.length) rows.push(`<div class="combat-profile-line combat-profile-tags">${renderTagChipsHtml(tags, "tagChip")}</div>`);
  if (costLine) rows.push(`<div class="combat-profile-line combat-profile-cost">${safeHtmlText(costLine, 240)}</div>`);
  if (trigger) rows.push(`<div class="combat-profile-line"><strong>Trigger:</strong> ${mechanicHtml(trigger)}</div>`);
  if (rollLine) rows.push(`<div class="combat-profile-line">${safeHtmlText(rollLine, 320)}</div>`);
  if (profile.expressionSyntaxVersion === 3 && profile.basicAttack?.length) rows.push(`<div class="combat-profile-line"><strong>Basic attack:</strong> ${safeHtmlText(formatBasicAttack(profile.basicAttack, gameData), 2000)}</div>`);
  if (rangeTargetsLine) rows.push(`<div class="combat-profile-line">${safeHtmlText(rangeTargetsLine, 320)}</div>`);
  if (description) rows.push(`<div class="combat-profile-line">${mechanicHtml(description)}</div>`);
  if (dmg.damage) {
    const damageText = dmg.additional && profile.expressionSyntaxVersion !== 3 ? `${dmg.damage}, ${dmg.additional}` : dmg.damage;
    rows.push(`<div class="combat-profile-line"><strong>Damage:</strong> ${mechanicHtml(damageText)}</div>`);
  }
  if (dmg.additional && (profile.expressionSyntaxVersion === 3 || !dmg.damage)) {
    rows.push(`<div class="combat-profile-line"><strong>${profile.expressionSyntaxVersion === 3 ? "Pumping" : "Additional Energy"}:</strong> ${mechanicHtml(dmg.additional)}</div>`);
  }
  if (onSuccess) rows.push(`<div class="combat-profile-line"><strong>Success:</strong> ${mechanicHtml(onSuccess)}</div>`);
  if (onCritSuccess) rows.push(`<div class="combat-profile-line"><strong>Critical Success:</strong> ${mechanicHtml(onCritSuccess)}</div>`);
  if (onFailure) rows.push(`<div class="combat-profile-line"><strong>Failure:</strong> ${mechanicHtml(onFailure)}</div>`);
  if (onCritFailure) rows.push(`<div class="combat-profile-line"><strong>Critical Failure:</strong> ${mechanicHtml(onCritFailure)}</div>`);
  if (bondEffect) rows.push(`<div class="combat-profile-line"><strong>Bond Effect:</strong> ${mechanicHtml(bondEffect)}</div>`);
  if (notes) rows.push(`<div class="combat-profile-line">${mechanicHtml(notes)}</div>`);
  if (profile.expressionSyntaxVersion === 3 && profile.rankNotes) rows.push(`<div class="combat-profile-line">${mechanicHtml(profile.rankNotes)}</div>`);
  return `<div class="combat-profile">${title ? `<${headingTag} class="${headingClass}">${safeHtmlText(title, 200)}</${headingTag}>` : ""}${rows.join("")}</div>`;
}
