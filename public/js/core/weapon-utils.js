import { escapeHtml, sanitizeText, safeHtmlText } from "./data-sanitization.js";

export function getWeaponDef(weaponBases, weaponKey) {
  const list = Array.isArray(weaponBases) ? weaponBases : [];
  return list.find((weapon) => String(weapon?.weaponKey || "") === String(weaponKey || "")) || null;
}

export function getEnhancementDef(weaponEnhancements, enhancementKey) {
  const list = Array.isArray(weaponEnhancements) ? weaponEnhancements : [];
  return list.find((enhancement) => String(enhancement?.enhancementKey || "") === String(enhancementKey || "")) || null;
}

export function getBasicAttackProfiles(weaponDef) {
  const profiles = Array.isArray(weaponDef?.profiles) ? weaponDef.profiles : [];
  return profiles.filter((profile) => String(profile?.profileType || "") === "basicAttack");
}

export function getWeaponSkillNames(weaponDef) {
  const skills = new Set();
  for (const profile of getBasicAttackProfiles(weaponDef)) {
    const skill = sanitizeText(profile?.skill, { maxLen: 96, collapse: true });
    if (skill) skills.add(skill);
  }
  return Array.from(skills);
}

export function hasTag(tags, tagPrefix) {
  const prefix = String(tagPrefix || "").toLowerCase();
  return (Array.isArray(tags) ? tags : []).some((tag) => String(tag || "").toLowerCase().startsWith(prefix));
}

export function getEffectiveTags(weapon, weaponBases) {
  const weaponDef = getWeaponDef(weaponBases, weapon?.weaponKey);
  const baseTags = Array.isArray(weaponDef?.tags) ? weaponDef.tags : [];
  const tags = [...baseTags];
  const enhancements = Array.isArray(weapon?.enhancements) ? weapon.enhancements : [];

  const addTag = (tag) => {
    if (!tag) return;
    if (!tags.includes(tag)) tags.push(tag);
  };

  const removeTag = (tagName) => {
    for (let i = tags.length - 1; i >= 0; i -= 1) {
      if (String(tags[i] || "").toLowerCase() === String(tagName || "").toLowerCase()) tags.splice(i, 1);
    }
  };

  for (const enhancement of enhancements) {
    const key = String(enhancement?.enhancementKey || "");
    if (key === "rapid_retrieval" || key === "instant_retrieval") addTag("Returning");
    if (key === "weighted") addTag("Heavy");
    if (key === "lightweight") removeTag("Heavy");
    if (key === "defensive") addTag("Defensive");

    if (key === "basic_elemental_infusion") {
      const element = sanitizeText(enhancement?.selections?.element, { maxLen: 32, collapse: true });
      if (element) addTag(element);
    }
  }

  return tags;
}

export function computeWeaponSlotCost(weapon, weaponBases) {
  const tags = getEffectiveTags(weapon, weaponBases);
  if (hasTag(tags, "heavy") || hasTag(tags, "two-handed")) return 3;
  if (hasTag(tags, "volley") || hasTag(tags, "concealed")) return 1;
  return 2;
}

export function computeTotalWeaponSlots(weapons, weaponBases) {
  return (Array.isArray(weapons) ? weapons : []).reduce((sum, weapon) => sum + computeWeaponSlotCost(weapon, weaponBases), 0);
}

export function isEnhancementCompatible(enhancementDef, weapon, weaponBases) {
  if (!enhancementDef || !weapon) return false;
  const prereq = String(enhancementDef?.prerequisites || "None").trim();
  if (!prereq || /^none$/i.test(prereq)) return true;

  const weaponDef = getWeaponDef(weaponBases, weapon.weaponKey);
  const tags = getEffectiveTags(weapon, weaponBases);
  const basicProfiles = getBasicAttackProfiles(weaponDef);
  const hasMeleeProfile = basicProfiles.some((profile) => String(profile?.skill || "") === "Melee Weapons");
  const hasRangedProfile = basicProfiles.some((profile) => String(profile?.skill || "") === "Targeting");

  if (/requires\s+"thrown"\s+tag/i.test(prereq)) return hasTag(tags, "thrown");
  if (/melee weapon only/i.test(prereq)) return hasMeleeProfile;
  if (/ranged weapon only/i.test(prereq)) return hasRangedProfile;
  if (/heavy weapon concept/i.test(prereq)) return hasTag(tags, "heavy");

  return true;
}

export function formatAttackLine(profile, weaponRank) {
  if (!profile) return "";
  const attribute = sanitizeText(profile?.attribute, { maxLen: 48, collapse: true });
  const skill = sanitizeText(profile?.skill, { maxLen: 96, collapse: true });
  const defense = sanitizeText(profile?.defense, { maxLen: 48, collapse: true });
  const range = sanitizeText(profile?.range, { maxLen: 96, collapse: true });
  const targets = sanitizeText(profile?.targets, { maxLen: 96, collapse: true });
  const damageByRank = (profile?.damageByRank && typeof profile.damageByRank === "object") ? profile.damageByRank : null;
  const pumpDamageByRank = (profile?.pumpDamageByRank && typeof profile.pumpDamageByRank === "object") ? profile.pumpDamageByRank : null;
  const rankKey = String(Math.max(0, Math.min(6, Number(weaponRank || 0))));
  const damage = sanitizeText(damageByRank?.[rankKey] || profile?.damage || "", { maxLen: 160, collapse: true });
  const pump = sanitizeText(pumpDamageByRank?.[rankKey] || "", { maxLen: 96, collapse: true });
  const baseLine = `${attribute} (${skill}) vs ${defense} Defense. ${range}, ${targets}. Damage: ${damage}.`;
  return pump ? `${baseLine} ${pump}.` : baseLine;
}

export function summarizeWeaponProfilesHtml(weaponDef, weaponRank) {
  const profiles = Array.isArray(weaponDef?.profiles) ? weaponDef.profiles : [];
  const blocks = [];

  for (const profile of profiles) {
    const type = String(profile?.profileType || '');
    const rawName = sanitizeText(profile?.profileName || '', { maxLen: 120, collapse: true });
    let heading = rawName || 'Profile';
    if (type === 'criticalEffect') heading = `Critical Effect — ${rawName || 'Critical Effect'}`;
    if (type === 'alternateUse') heading = `Alternate Use — ${rawName || 'Alternate Use'}`;
    blocks.push(renderCombatProfileHtml(profile, { rankValue: weaponRank, heading, headingTag: 'div', headingClass: 'combat-profile-title', showRank: false }));
  }

  if (!blocks.length && weaponDef?.description) {
    blocks.push(`<div class="combat-profile"><div class="combat-profile-line">${safeHtmlText(sanitizeText(weaponDef.description, { maxLen: 1200, collapse: true }), 1200)}</div></div>`);
  }

  return `<div class="equipmentMetaList">${blocks.join('')}</div>`;
}

export function renderTagChipsHtml(tags, chipClass = "tagChip") {
  if (!Array.isArray(tags) || !tags.length) return "—";
  return tags.map((tag) => `<span class="${chipClass}">${escapeHtml(tag)}</span>`).join("");
}


function formatCostLine(profile) {
  if (!profile) return "";
  const parts = [];
  const actions = Number.parseInt(String(profile?.actions ?? ""), 10);
  const actionType = sanitizeText(profile?.actionType, { maxLen: 32, collapse: true }) || "Action";
  if (Number.isFinite(actions) && actions > 0) {
    parts.push(`${actions} ${actionType}${actions === 1 ? '' : 's'}`);
  } else if (actionType) {
    parts.push(actionType);
  }
  const energyCost = Number.parseInt(String(profile?.energyCost ?? ""), 10);
  if (Number.isFinite(energyCost) && energyCost > 0) parts.push(`${energyCost} Energy`);
  const strainCost = Number.parseInt(String(profile?.strainCost ?? ""), 10);
  if (Number.isFinite(strainCost) && strainCost > 0) parts.push(`${strainCost} Strain`);
  if (profile?.sustained) parts.push('Sustained');
  return parts.length ? `( ${parts.join(' + ')} )` : '';
}

function formatDefenseLabel(defense) {
  const value = sanitizeText(defense, { maxLen: 64, collapse: true });
  if (!value) return '';
  return /defense$/i.test(value) ? value : `${value} Defense`;
}

function formatAdditionalEnergyText(pump) {
  const value = sanitizeText(pump, { maxLen: 160, collapse: true });
  if (!value || value === '+0') return '';
  if (/per energy/i.test(value) && !/(damage|ward|wards|range|reach|square|squares|target|targets|armor|healing|heal|speed|movement|die|dice|hit|hits)/i.test(value)) {
    return value.replace(/per energy/i, 'Damage per Energy');
  }
  return value;
}

function formatRollLine(profile) {
  if (!profile || profile?.rollRequired === false) return '';
  const attribute = sanitizeText(profile?.attribute, { maxLen: 48, collapse: true });
  const skill = sanitizeText(profile?.skill, { maxLen: 96, collapse: true });
  const defense = formatDefenseLabel(profile?.defense);
  const range = sanitizeText(profile?.range, { maxLen: 96, collapse: true });
  const targets = sanitizeText(profile?.targets, { maxLen: 96, collapse: true });
  const parts = [];
  if (attribute || skill || defense) parts.push(`${attribute} (${skill}) vs ${defense}.`.replace(/^ \(/,'(').replace(/\(\) /,'').replace(/\s+/g,' ').trim());
  const trailing = [range, targets].filter(Boolean).join(', ');
  if (trailing) parts.push(trailing);
  return parts.join(' ');
}

function getProfileDamageParts(profile, rankValue = 0) {
  const rankKey = String(Math.max(0, Math.min(6, Number(rankValue || 0))));
  const damageByRank = (profile?.damageByRank && typeof profile.damageByRank === 'object') ? profile.damageByRank : null;
  const pumpDamageByRank = (profile?.pumpDamageByRank && typeof profile.pumpDamageByRank === 'object') ? profile.pumpDamageByRank : null;
  const damage = sanitizeText(damageByRank?.[rankKey] || profile?.damage || '', { maxLen: 160, collapse: true });
  const additional = formatAdditionalEnergyText(pumpDamageByRank?.[rankKey] || '');
  return { damage, additional };
}

export function renderCombatProfileHtml(profile, { rankValue = 0, heading = '', headingTag = 'div', headingClass = 'combat-profile-title', showRank = false } = {}) {
  if (!profile) return '';
  const titleText = sanitizeText(heading || profile?.techniqueName || profile?.profileName || '', { maxLen: 160, collapse: true });
  const rank = Number.parseInt(String(profile?.rank ?? rankValue ?? 0), 10) || 0;
  const title = titleText ? `${titleText}${showRank && rank > 0 ? ` (Rank ${rank})` : ''}` : '';
  const trigger = sanitizeText(profile?.trigger, { maxLen: 240, collapse: true });
  const rollLine = formatRollLine(profile);
  const description = sanitizeText(profile?.description || '', { maxLen: 1200, collapse: true });
  const notes = sanitizeText(profile?.notes || '', { maxLen: 1200, collapse: true });
  const bondEffect = sanitizeText(profile?.bondEffect || '', { maxLen: 400, collapse: true });
  const onSuccess = sanitizeText(profile?.onSuccess || '', { maxLen: 400, collapse: true });
  const onCritSuccess = sanitizeText(profile?.onCriticalSuccess || '', { maxLen: 400, collapse: true });
  const onFailure = sanitizeText(profile?.onFailure || '', { maxLen: 400, collapse: true });
  const onCritFailure = sanitizeText(profile?.onCriticalFailure || '', { maxLen: 400, collapse: true });
  const costLine = formatCostLine(profile);
  const dmg = getProfileDamageParts(profile, rankValue);
  const rows = [];
  if (costLine) rows.push(`<div class="combat-profile-line combat-profile-cost">${safeHtmlText(costLine, 240)}</div>`);
  if (trigger) rows.push(`<div class="combat-profile-line"><strong>Trigger:</strong> ${safeHtmlText(trigger, 320)}</div>`);
  if (rollLine) rows.push(`<div class="combat-profile-line">${safeHtmlText(rollLine, 320)}</div>`);
  if (description) rows.push(`<div class="combat-profile-line">${safeHtmlText(description, 1200)}</div>`);
  if (dmg.damage) {
    const damageText = dmg.additional ? `${dmg.damage}, ${dmg.additional}` : dmg.damage;
    rows.push(`<div class="combat-profile-line"><strong>Damage:</strong> ${safeHtmlText(damageText, 240)}</div>`);
  }
  if (onSuccess) rows.push(`<div class="combat-profile-line"><strong>Success:</strong> ${safeHtmlText(onSuccess, 500)}</div>`);
  if (onCritSuccess) rows.push(`<div class="combat-profile-line"><strong>Critical Success:</strong> ${safeHtmlText(onCritSuccess, 500)}</div>`);
  if (onFailure) rows.push(`<div class="combat-profile-line"><strong>Failure:</strong> ${safeHtmlText(onFailure, 500)}</div>`);
  if (onCritFailure) rows.push(`<div class="combat-profile-line"><strong>Critical Failure:</strong> ${safeHtmlText(onCritFailure, 500)}</div>`);
  if (bondEffect) rows.push(`<div class="combat-profile-line"><strong>Bond Effect:</strong> ${safeHtmlText(bondEffect, 500)}</div>`);
  if (notes) rows.push(`<div class="combat-profile-line">${safeHtmlText(notes, 1200)}</div>`);
  return `<div class="combat-profile">${title ? `<${headingTag} class="${headingClass}">${safeHtmlText(title, 200)}</${headingTag}>` : ''}${rows.join('')}</div>`;
}

export function renderEnhancementDetailHtml(enhancementDef, enhancement, { collapsible = false } = {}) {
  const label = sanitizeText(enhancementDef?.name || enhancement?.enhancementKey || 'Unknown Enhancement', { maxLen: 120, collapse: true });
  const rank = Number(enhancement?.rank || enhancementDef?.minRank || 0);
  const sels = (enhancement?.selections && typeof enhancement.selections === 'object' && !Array.isArray(enhancement.selections)) ? enhancement.selections : {};
  const selEntries = Object.entries(sels)
    .map(([k, v]) => `${sanitizeText(k, { maxLen: 64, collapse: true })}: ${sanitizeText(v, { maxLen: 96, collapse: true })}`)
    .filter(Boolean);
  const bodyParts = [];
  const description = sanitizeText(enhancementDef?.description || '', { maxLen: 1200, collapse: true });
  const notes = sanitizeText(enhancementDef?.notes || '', { maxLen: 1200, collapse: true });
  if (description) bodyParts.push(description);
  if (notes) bodyParts.push(notes);
  if (selEntries.length) bodyParts.push(selEntries.join(' • '));
  const summary = `${label} • Rank ${rank}`;
  const body = bodyParts.join(' ');
  if (!collapsible) {
    return `<div class="enhancement-detail"><div class="enhancement-detail-title">${safeHtmlText(summary, 220)}</div>${body ? `<div class="enhancement-detail-body">${safeHtmlText(body, 1500)}</div>` : ''}</div>`;
  }
  return `<details class="enhancement-detail enhancement-detail-collapsible"><summary class="enhancement-detail-summary">${safeHtmlText(summary, 220)}</summary>${body ? `<div class="enhancement-detail-body">${safeHtmlText(body, 1500)}</div>` : ''}</details>`;
}
