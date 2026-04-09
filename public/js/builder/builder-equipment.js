import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  markStepVisited,
  setStatus,
  showError,
  clearError,
  confirmSaveWarnings,
} from "./builder-common.js";
import { renderBuilderNav } from "./builder-nav.js";
import { buildWeaponsUpdatePatch } from "../core/database-writer.js";
import { escapeHtml, sanitizeNamedSkillList, sanitizeText } from "../core/data-sanitization.js";
import { loadGameXData, computeGrantedSkillsState } from "../core/game-data.js";
import {
  computeTotalWeaponSlots,
  computeWeaponSlotCost,
  getBasicAttackProfiles,
  getEffectiveTags,
  getEnhancementDef,
  getWeaponDef,
  getWeaponSkillNames,
  hasTag,
  isEnhancementCompatible,
  renderEnhancementDetailHtml,
  renderTagChipsHtml,
  summarizeWeaponProfilesHtml,
} from "../core/weapon-utils.js";

const CURRENT_STEP_ID = "equipment";
const MAX_WEAPON_SLOTS = 4;

const ENHANCEMENT_SELECTION_SPECS = Object.freeze({
  basic_elemental_infusion: [
    { key: "element", label: "Element", type: "select", options: ["Water", "Fire", "Earth", "Wind"] },
  ],
  bane_weapon: [
    { key: "trait", label: "Bane Trait", type: "text", placeholder: "Spirit, Monster, Fire, etc." },
  ],
  swiss_army_weapon: [
    { key: "skill", label: "Utility Skill", type: "text", placeholder: "Technology, Medicine, Crafting, etc." },
  ],
});

let ctx;
let charRef;
let currentDoc;
let currentWeapons = [];
let gameData = null;
let weaponBases = [];
let weaponEnhancements = [];
let grantedSkillState = null;
let showOutOfRank = false;

const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const navTopEl = document.getElementById("builderNavTop");
const navBottomEl = document.getElementById("builderNavBottom");

const equipmentStatusHintEl = document.getElementById("equipmentStatusHint");
const weaponCountValueEl = document.getElementById("weaponCountValue");
const enhancementCountValueEl = document.getElementById("enhancementCountValue");
const slotUsagePillEl = document.getElementById("slotUsagePill");
const slotUsageValueEl = document.getElementById("slotUsageValue");
const meleeSkillRankValueEl = document.getElementById("meleeSkillRankValue");
const targetingSkillRankValueEl = document.getElementById("targetingSkillRankValue");

const weaponBaseSelectEl = document.getElementById("weaponBaseSelect");
const addWeaponBtn = document.getElementById("addWeaponBtn");
const weaponListEl = document.getElementById("weaponList");
const showOutOfRankEl = document.getElementById("showOutOfRank");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

function makeLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

function countEnhancements(weapons) {
  const list = Array.isArray(weapons) ? weapons : [];
  return list.reduce((sum, weapon) => sum + (Array.isArray(weapon?.enhancements) ? weapon.enhancements.length : 0), 0);
}

function getBuilderRepeatables() {
  const repeatables = currentDoc?.builder?.sheet?.repeatables;
  return (repeatables && typeof repeatables === "object") ? repeatables : {};
}

function getSkillRanks() {
  const repeatables = getBuilderRepeatables();
  const extraCombatSkills = sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 });
  const ranks = {
    "Melee Weapons": 0,
    Targeting: 0,
  };

  const grantedCombat = Array.isArray(grantedSkillState?.grantedCombatSkills) ? grantedSkillState.grantedCombatSkills : [];
  for (const row of grantedCombat) {
    const skill = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
    const rank = Number.parseInt(String(row?.rank || "0"), 10);
    if ((skill === "Melee Weapons" || skill === "Targeting") && Number.isFinite(rank)) {
      ranks[skill] = Math.max(ranks[skill], Math.max(0, rank));
    }
  }

  for (const row of extraCombatSkills) {
    const skill = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
    const rank = Number.parseInt(String(row?.rank || "0"), 10);
    if ((skill === "Melee Weapons" || skill === "Targeting") && Number.isFinite(rank)) {
      ranks[skill] = Math.max(ranks[skill], Math.max(0, rank));
    }
  }

  return ranks;
}

function getWeaponSkillRankCap(weaponDef, skillRanks) {
  const relevantSkills = getWeaponSkillNames(weaponDef);
  if (!relevantSkills.length) return 0;
  return relevantSkills.reduce((maxRank, skillName) => Math.max(maxRank, Number(skillRanks?.[skillName] || 0)), 0);
}

function formatSkillRankLabel(weaponDef, skillRanks) {
  const relevantSkills = getWeaponSkillNames(weaponDef);
  if (!relevantSkills.length) return "No attack skill found.";
  return relevantSkills.map((skillName) => `${skillName} ${Number(skillRanks?.[skillName] || 0)}`).join(" • ");
}

function getEnhancementSelectionSpecs(enhancementKey) {
  return ENHANCEMENT_SELECTION_SPECS[String(enhancementKey || "")] || [];
}

function getVisibleWeaponBases() {
  const skillRanks = getSkillRanks();
  return weaponBases.filter((weapon) => showOutOfRank || Number(weapon?.minRank || 0) <= getWeaponSkillRankCap(weapon, skillRanks));
}

function getVisibleEnhancements(weapon) {
  return weaponEnhancements.filter((enhancement) => {
    if (!enhancement) return false;
    if (!showOutOfRank && Number(enhancement.minRank || 0) > Number(weapon?.rank || 0)) return false;
    return isEnhancementCompatible(enhancement, weapon, weaponBases);
  });
}

function buildWeaponBaseOptions(selectedKey = "") {
  const selectedDef = getWeaponDef(weaponBases, selectedKey);
  const visible = getVisibleWeaponBases();
  const seen = new Set();
  const parts = ['<option value="">Select a weapon…</option>'];

  for (const weapon of visible) {
    seen.add(String(weapon.weaponKey || ""));
    const selected = String(weapon.weaponKey || "") === String(selectedKey || "") ? " selected" : "";
    parts.push(`<option value="${escapeHtml(weapon.weaponKey)}"${selected}>${escapeHtml(weapon.name)} (Rank ${Number(weapon.minRank || 0)}+)</option>`);
  }

  if (selectedKey && selectedDef && !seen.has(String(selectedKey))) {
    parts.push(`<option value="${escapeHtml(selectedDef.weaponKey)}" selected>${escapeHtml(selectedDef.name)} — out of rank</option>`);
  }

  return parts.join("");
}

function buildRankOptions(minRank, maxRank, selectedRank) {
  const low = Math.max(0, Number(minRank || 0));
  const high = Math.max(low, Number(maxRank || low), Number(selectedRank || low));
  const out = [];
  for (let rank = low; rank <= high; rank += 1) {
    out.push(`<option value="${rank}"${rank === Number(selectedRank) ? " selected" : ""}>Rank ${rank}</option>`);
  }
  return out.join("");
}

function buildEnhancementOptions(weapon, selectedKey) {
  const selectedDef = getEnhancementDef(weaponEnhancements, selectedKey);
  const compatible = getVisibleEnhancements(weapon);
  const seen = new Set();
  const out = ['<option value="">Select an enhancement…</option>'];

  for (const enhancement of compatible) {
    seen.add(enhancement.enhancementKey);
    out.push(`<option value="${escapeHtml(enhancement.enhancementKey)}"${enhancement.enhancementKey === selectedKey ? " selected" : ""}>${escapeHtml(enhancement.name)} (Rank ${Number(enhancement.minRank || 0)}+)</option>`);
  }

  if (selectedKey && selectedDef && !seen.has(selectedKey)) {
    out.push(`<option value="${escapeHtml(selectedKey)}" selected>${escapeHtml(selectedDef.name)} — unavailable</option>`);
  } else if (selectedKey && !selectedDef) {
    out.push(`<option value="${escapeHtml(selectedKey)}" selected>${escapeHtml(selectedKey)} — unknown</option>`);
  }

  return out.join("");
}

function buildEnhancementSelectionFields(enhancement, weaponIndex, enhancementIndex) {
  const specs = getEnhancementSelectionSpecs(enhancement?.enhancementKey);
  if (!specs.length) return "";
  return specs.map((spec) => {
    const value = sanitizeText(enhancement?.selections?.[spec.key], { maxLen: 96, collapse: true });
    if (spec.type === "select") {
      const options = ['<option value="">Choose…</option>']
        .concat((Array.isArray(spec.options) ? spec.options : []).map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`))
        .join("");
      return `
        <div class="equipmentField">
          <label class="label" for="weapon-${weaponIndex}-enhancement-${enhancementIndex}-${spec.key}">${escapeHtml(spec.label)}</label>
          <select id="weapon-${weaponIndex}-enhancement-${enhancementIndex}-${spec.key}" class="input" data-enhancement-selection data-weapon-index="${weaponIndex}" data-enhancement-index="${enhancementIndex}" data-selection-key="${escapeHtml(spec.key)}">${options}</select>
        </div>`;
    }
    return `
      <div class="equipmentField">
        <label class="label" for="weapon-${weaponIndex}-enhancement-${enhancementIndex}-${spec.key}">${escapeHtml(spec.label)}</label>
        <input id="weapon-${weaponIndex}-enhancement-${enhancementIndex}-${spec.key}" class="input" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(spec.placeholder || "")}" data-enhancement-selection data-weapon-index="${weaponIndex}" data-enhancement-index="${enhancementIndex}" data-selection-key="${escapeHtml(spec.key)}" />
      </div>`;
  }).join("");
}

function collectWeaponWarnings(weapon, skillRanks) {
  const warnings = [];
  const weaponDef = getWeaponDef(weaponBases, weapon?.weaponKey);
  if (!weaponDef) {
    warnings.push("Unknown weapon base.");
    return warnings;
  }

  const minRank = Number(weaponDef?.minRank || 0);
  const selectedRank = Number(weapon?.rank || minRank);
  const skillCap = getWeaponSkillRankCap(weaponDef, skillRanks);
  if (selectedRank < minRank) warnings.push(`Weapon rank is below the base minimum (Rank ${minRank}).`);
  if (selectedRank > skillCap) warnings.push(`Selected rank exceeds current supported skill rank (${skillCap}).`);

  const enhancements = Array.isArray(weapon?.enhancements) ? weapon.enhancements : [];
  if (enhancements.length > selectedRank) warnings.push(`This weapon has ${enhancements.length} enhancement(s), but Rank ${selectedRank} supports ${selectedRank} slot(s).`);

  enhancements.forEach((enhancement) => {
    const enhancementDef = getEnhancementDef(weaponEnhancements, enhancement?.enhancementKey);
    if (!enhancementDef) {
      warnings.push(`Unknown enhancement: ${enhancement?.enhancementKey || "(blank)"}.`);
      return;
    }

    const enhancementRank = Number(enhancement?.rank || enhancementDef.minRank || 0);
    const minEnhancementRank = Number(enhancementDef?.minRank || 0);
    if (enhancementRank < minEnhancementRank) warnings.push(`${enhancementDef.name} is below its minimum rank (${minEnhancementRank}).`);
    if (enhancementRank > selectedRank) warnings.push(`${enhancementDef.name} exceeds this weapon's rank.`);
    if (!isEnhancementCompatible(enhancementDef, weapon, weaponBases)) warnings.push(`${enhancementDef.name} does not meet this weapon's prerequisites.`);

    for (const spec of getEnhancementSelectionSpecs(enhancement?.enhancementKey)) {
      const value = sanitizeText(enhancement?.selections?.[spec.key], { maxLen: 96, collapse: true });
      if (!value) warnings.push(`${enhancementDef.name} is missing ${spec.label.toLowerCase()}.`);
    }
  });

  return warnings;
}

function normalizeWeaponForUi(rawWeapon) {
  const weapon = (rawWeapon && typeof rawWeapon === "object") ? rawWeapon : {};
  return {
    id: sanitizeText(weapon.id || makeLocalId("w"), { maxLen: 64, collapse: true }),
    weaponKey: sanitizeText(weapon.weaponKey || "", { maxLen: 64, collapse: true }),
    rank: Number.parseInt(String(weapon.rank ?? 0), 10) || 0,
    customName: sanitizeText(weapon.customName || "", { maxLen: 120, collapse: true }),
    enhancements: Array.isArray(weapon.enhancements)
      ? weapon.enhancements.map((enhancement) => ({
          id: sanitizeText(enhancement?.id || makeLocalId("e"), { maxLen: 64, collapse: true }),
          enhancementKey: sanitizeText(enhancement?.enhancementKey || "", { maxLen: 64, collapse: true }),
          rank: Number.parseInt(String(enhancement?.rank ?? 0), 10) || 0,
          selections: (enhancement?.selections && typeof enhancement.selections === "object" && !Array.isArray(enhancement.selections)) ? { ...enhancement.selections } : {},
        }))
      : [],
  };
}

function renderWeaponBaseSelect() {
  weaponBaseSelectEl.innerHTML = buildWeaponBaseOptions();
}

function renderWeapons() {
  const weapons = Array.isArray(currentWeapons) ? currentWeapons : [];
  const skillRanks = getSkillRanks();
  const enhancementCount = countEnhancements(weapons);
  const slotUsage = computeTotalWeaponSlots(weapons, weaponBases);

  weaponCountValueEl.textContent = String(weapons.length);
  enhancementCountValueEl.textContent = String(enhancementCount);
  slotUsageValueEl.textContent = `${slotUsage} / ${MAX_WEAPON_SLOTS}`;
  meleeSkillRankValueEl.textContent = String(skillRanks["Melee Weapons"] || 0);
  targetingSkillRankValueEl.textContent = String(skillRanks.Targeting || 0);
  slotUsagePillEl.classList.toggle("danger", slotUsage > MAX_WEAPON_SLOTS);
  equipmentStatusHintEl.textContent = weapons.length ? "Ready." : "No weapons selected.";

  if (!weapons.length) {
    weaponListEl.innerHTML = '<div class="emptyState">No weapons selected.</div>';
    return;
  }

  weaponListEl.innerHTML = weapons.map((weapon, weaponIndex) => {
    const weaponDef = getWeaponDef(weaponBases, weapon.weaponKey);
    const displayName = sanitizeText(weapon.customName || weaponDef?.name || weapon.weaponKey || `Weapon ${weaponIndex + 1}`, { maxLen: 160, collapse: true });
    const effectiveTags = getEffectiveTags(weapon, weaponBases);
    const weaponWarnings = collectWeaponWarnings(weapon, skillRanks);
    const skillLabel = weaponDef ? formatSkillRankLabel(weaponDef, skillRanks) : "No attack skill found.";
    const selectedRank = Number(weapon?.rank || 0);
    const skillCap = weaponDef ? getWeaponSkillRankCap(weaponDef, skillRanks) : 0;
    const minRank = weaponDef ? Number(weaponDef.minRank || 0) : 0;
    const weaponRankOptions = buildRankOptions(minRank, Math.max(minRank, skillCap), selectedRank || minRank);
    const slotCost = computeWeaponSlotCost(weapon, weaponBases);
    const profilesHtml = weaponDef ? summarizeWeaponProfilesHtml(weaponDef, selectedRank) : '<div class="help">Unknown weapon base.</div>';
    const weaponOptions = buildWeaponBaseOptions(weapon.weaponKey);
    const warningsHtml = weaponWarnings.length ? `<ul class="warningList">${weaponWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : "";

    const enhancements = Array.isArray(weapon.enhancements) ? weapon.enhancements : [];
    const enhancementRowsHtml = enhancements.length ? enhancements.map((enhancement, enhancementIndex) => {
      const enhancementDef = getEnhancementDef(weaponEnhancements, enhancement.enhancementKey);
      const minEnhancementRank = Number(enhancementDef?.minRank || 0);
      const enhancementRank = Number(enhancement?.rank || minEnhancementRank);
      const enhancementOptions = buildEnhancementOptions(weapon, enhancement.enhancementKey);
      const enhancementRankOptions = buildRankOptions(minEnhancementRank, Math.max(minEnhancementRank, Number(weapon.rank || 0)), enhancementRank);
      const selectionFields = buildEnhancementSelectionFields(enhancement, weaponIndex, enhancementIndex);
      const detailHtml = renderEnhancementDetailHtml(enhancementDef, enhancement, { collapsible: false });
      const prereq = sanitizeText(enhancementDef?.prerequisites || "", { maxLen: 200, collapse: true });
      return `
        <div class="optionRow equipmentEnhancementRow" data-enhancement-index="${enhancementIndex}">
          <div class="equipmentEnhancementMain">
            <div class="equipmentGrid equipmentGrid--enhancement">
              <div class="equipmentField">
                <label class="label" for="weapon-${weaponIndex}-enhancement-${enhancementIndex}-key">Enhancement</label>
                <select id="weapon-${weaponIndex}-enhancement-${enhancementIndex}-key" class="input" data-enhancement-key data-weapon-index="${weaponIndex}" data-enhancement-index="${enhancementIndex}">${enhancementOptions}</select>
              </div>
              <div class="equipmentField equipmentField--compact">
                <label class="label" for="weapon-${weaponIndex}-enhancement-${enhancementIndex}-rank">Rank</label>
                <select id="weapon-${weaponIndex}-enhancement-${enhancementIndex}-rank" class="input" data-enhancement-rank data-weapon-index="${weaponIndex}" data-enhancement-index="${enhancementIndex}">${enhancementRankOptions}</select>
              </div>
            </div>
            ${selectionFields ? `<div class="equipmentGrid equipmentGrid--enhancementSelections">${selectionFields}</div>` : ""}
            ${detailHtml}
            ${prereq && !/^none$/i.test(prereq) ? `<div class="help">Prerequisite: ${escapeHtml(prereq)}</div>` : ""}
          </div>
          <div class="equipmentRowActions">
            <button class="btn secondary" type="button" data-remove-enhancement data-weapon-index="${weaponIndex}" data-enhancement-index="${enhancementIndex}">Remove</button>
          </div>
        </div>`;
    }).join("") : '<div class="emptyState emptyState--nested">No enhancements.</div>';

    return `
      <section class="builderItem equipmentWeaponCard" data-weapon-index="${weaponIndex}">
        <div class="cardHeaderRow equipmentCardHeader">
          <div>
            <div class="builderItemTitle">${escapeHtml(displayName)}</div>
            <div class="builderItemMeta">${weaponDef ? escapeHtml(weaponDef.name) : escapeHtml(weapon.weaponKey || "Unknown weapon")} • Slots ${slotCost} • ${escapeHtml(skillLabel)}</div>
          </div>
          <button class="btn secondary" type="button" data-remove-weapon="${weaponIndex}">Remove Weapon</button>
        </div>

        <div class="equipmentGrid">
          <div class="equipmentField">
            <label class="label" for="weapon-${weaponIndex}-base">Weapon Base</label>
            <select id="weapon-${weaponIndex}-base" class="input" data-weapon-key="${weaponIndex}">${weaponOptions}</select>
          </div>
          <div class="equipmentField equipmentField--compact">
            <label class="label" for="weapon-${weaponIndex}-rank">Rank</label>
            <select id="weapon-${weaponIndex}-rank" class="input" data-weapon-rank="${weaponIndex}">${weaponRankOptions}</select>
          </div>
        </div>

        <div class="equipmentGrid">
          <div class="equipmentField">
            <label class="label" for="weapon-${weaponIndex}-custom-name">Custom Name</label>
            <input id="weapon-${weaponIndex}-custom-name" class="input" type="text" value="${escapeHtml(weapon.customName || "")}" data-weapon-custom-name="${weaponIndex}" />
          </div>
          <div class="equipmentField">
            <label class="label">Tags</label>
            <div class="tagChipRow">${renderTagChipsHtml(effectiveTags, "tagChip")}</div>
          </div>
        </div>

        <div class="builderItemBody">${profilesHtml}</div>
        ${warningsHtml}

        <div class="equipmentSubsection">
          <div class="cardHeaderRow">
            <h3>Enhancements</h3>
            <button class="btn" type="button" data-add-enhancement="${weaponIndex}">Add Enhancement</button>
          </div>
          <div class="help">${enhancements.length} / ${Math.max(0, selectedRank)} slot${Math.max(0, selectedRank) === 1 ? "" : "s"} used.</div>
          <div class="optionList">${enhancementRowsHtml}</div>
        </div>
      </section>`;
  }).join("");
}

function addWeapon() {
  const weaponKey = sanitizeText(weaponBaseSelectEl.value, { maxLen: 64, collapse: true });
  if (!weaponKey) return;
  const weaponDef = getWeaponDef(weaponBases, weaponKey);
  currentWeapons.push({ id: makeLocalId("w"), weaponKey, rank: Number(weaponDef?.minRank || 0), customName: "", enhancements: [] });
  weaponBaseSelectEl.value = "";
  renderWeapons();
}

function removeWeapon(index) {
  currentWeapons.splice(index, 1);
  renderWeapons();
}

function addEnhancement(weaponIndex) {
  const weapon = currentWeapons[weaponIndex];
  if (!weapon) return;
  const compatible = getVisibleEnhancements(weapon);
  const first = compatible[0] || null;
  weapon.enhancements = Array.isArray(weapon.enhancements) ? weapon.enhancements : [];
  weapon.enhancements.push({ id: makeLocalId("e"), enhancementKey: first?.enhancementKey || "", rank: Number(first?.minRank || 0), selections: {} });
  renderWeapons();
}

function removeEnhancement(weaponIndex, enhancementIndex) {
  const weapon = currentWeapons[weaponIndex];
  if (!weapon || !Array.isArray(weapon.enhancements)) return;
  weapon.enhancements.splice(enhancementIndex, 1);
  renderWeapons();
}

function updateWeaponKey(weaponIndex, weaponKey) {
  const weapon = currentWeapons[weaponIndex];
  if (!weapon) return;
  const weaponDef = getWeaponDef(weaponBases, weaponKey);
  weapon.weaponKey = weaponKey;
  const minRank = Number(weaponDef?.minRank || 0);
  weapon.rank = Math.max(minRank, Number(weapon.rank || minRank));
  renderWeapons();
}

function updateWeaponRank(weaponIndex, rankValue) {
  const weapon = currentWeapons[weaponIndex];
  if (!weapon) return;
  const rank = Number.parseInt(String(rankValue), 10);
  weapon.rank = Number.isFinite(rank) ? Math.max(0, rank) : 0;
  for (const enhancement of Array.isArray(weapon.enhancements) ? weapon.enhancements : []) {
    if (Number(enhancement.rank || 0) > weapon.rank) enhancement.rank = weapon.rank;
  }
  renderWeapons();
}

function updateWeaponCustomName(weaponIndex, value) {
  const weapon = currentWeapons[weaponIndex];
  if (!weapon) return;
  weapon.customName = sanitizeText(value, { maxLen: 120, collapse: true });
}

function updateEnhancementKey(weaponIndex, enhancementIndex, enhancementKey) {
  const weapon = currentWeapons[weaponIndex];
  const enhancement = weapon?.enhancements?.[enhancementIndex];
  if (!enhancement) return;
  const enhancementDef = getEnhancementDef(weaponEnhancements, enhancementKey);
  enhancement.enhancementKey = enhancementKey;
  enhancement.rank = Math.max(Number(enhancement.rank || 0), Number(enhancementDef?.minRank || 0));
  enhancement.selections = {};
  renderWeapons();
}

function updateEnhancementRank(weaponIndex, enhancementIndex, rankValue) {
  const weapon = currentWeapons[weaponIndex];
  const enhancement = weapon?.enhancements?.[enhancementIndex];
  if (!enhancement) return;
  const rank = Number.parseInt(String(rankValue), 10);
  enhancement.rank = Number.isFinite(rank) ? Math.max(0, rank) : 0;
  renderWeapons();
}

function updateEnhancementSelection(weaponIndex, enhancementIndex, selectionKey, value) {
  const weapon = currentWeapons[weaponIndex];
  const enhancement = weapon?.enhancements?.[enhancementIndex];
  if (!enhancement) return;
  enhancement.selections = (enhancement.selections && typeof enhancement.selections === "object" && !Array.isArray(enhancement.selections)) ? enhancement.selections : {};
  const nextValue = sanitizeText(value, { maxLen: 96, collapse: true });
  if (nextValue) enhancement.selections[selectionKey] = nextValue;
  else delete enhancement.selections[selectionKey];
}

function getSaveWarnings() {
  const warnings = [];
  const skillRanks = getSkillRanks();
  const totalSlots = computeTotalWeaponSlots(currentWeapons, weaponBases);
  if (totalSlots > MAX_WEAPON_SLOTS) warnings.push(`Weapon slots exceeded: ${totalSlots} / ${MAX_WEAPON_SLOTS}.`);
  currentWeapons.forEach((weapon, index) => {
    const weaponDef = getWeaponDef(weaponBases, weapon.weaponKey);
    const label = sanitizeText(weapon.customName || weaponDef?.name || weapon.weaponKey || `Weapon ${index + 1}`, { maxLen: 160, collapse: true });
    for (const warning of collectWeaponWarnings(weapon, skillRanks)) warnings.push(`${label}: ${warning}`);
  });
  return warnings;
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = getSaveWarnings();
  if (warnings.length) {
    const ok = await confirmSaveWarnings({ title: "Save with warnings?", warnings, okText: intent === "navigate" ? "Save and Continue" : "Save", cancelText: "Cancel" });
    if (!ok) {
      setStatus(statusEl, "Not saved.");
      return false;
    }
  }

  try {
    const patch = buildWeaponsUpdatePatch({ weapons: currentWeapons });
    await saveCharacterPatch(charRef, patch);
    currentWeapons = Array.isArray(patch["builder.weapons"]) ? patch["builder.weapons"].map((weapon) => normalizeWeaponForUi(weapon)) : [];
    currentDoc = currentDoc || {};
    currentDoc.builder = { ...(currentDoc.builder || {}), weapons: Array.isArray(patch["builder.weapons"]) ? patch["builder.weapons"] : [] };
    renderWeapons();
    setStatus(statusEl, "Saved.");
    if (openSheetAfter) {
      const url = new URL("/character-sheet.html", window.location.href);
      url.searchParams.set("charId", ctx.charId);
      if (ctx.claims?.gm && ctx.requestedUid) url.searchParams.set("uid", ctx.requestedUid);
      window.location.href = url.toString();
    }
    return true;
  } catch (e) {
    console.error(e);
    showError(errorEl, "Could not save.");
    setStatus(statusEl, "Error.");
    return false;
  }
}

function bindPageEvents() {
  addWeaponBtn.addEventListener("click", () => addWeapon());
  saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false }));
  saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true }));
  showOutOfRankEl?.addEventListener("change", () => {
    showOutOfRank = !!showOutOfRankEl.checked;
    renderWeaponBaseSelect();
    renderWeapons();
  });

  weaponListEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-remove-weapon")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-remove-weapon"), 10);
      if (Number.isFinite(weaponIndex)) removeWeapon(weaponIndex);
      return;
    }
    if (target.hasAttribute("data-add-enhancement")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-add-enhancement"), 10);
      if (Number.isFinite(weaponIndex)) addEnhancement(weaponIndex);
      return;
    }
    if (target.hasAttribute("data-remove-enhancement")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-index"), 10);
      const enhancementIndex = Number.parseInt(target.getAttribute("data-enhancement-index"), 10);
      if (Number.isFinite(weaponIndex) && Number.isFinite(enhancementIndex)) removeEnhancement(weaponIndex, enhancementIndex);
    }
  });

  weaponListEl.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.hasAttribute("data-weapon-key")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-key"), 10);
      if (Number.isFinite(weaponIndex)) updateWeaponKey(weaponIndex, target.value);
      return;
    }
    if (target.hasAttribute("data-weapon-rank")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-rank"), 10);
      if (Number.isFinite(weaponIndex)) updateWeaponRank(weaponIndex, target.value);
      return;
    }
    if (target.hasAttribute("data-enhancement-key")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-index"), 10);
      const enhancementIndex = Number.parseInt(target.getAttribute("data-enhancement-index"), 10);
      if (Number.isFinite(weaponIndex) && Number.isFinite(enhancementIndex)) updateEnhancementKey(weaponIndex, enhancementIndex, target.value);
      return;
    }
    if (target.hasAttribute("data-enhancement-rank")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-index"), 10);
      const enhancementIndex = Number.parseInt(target.getAttribute("data-enhancement-index"), 10);
      if (Number.isFinite(weaponIndex) && Number.isFinite(enhancementIndex)) updateEnhancementRank(weaponIndex, enhancementIndex, target.value);
      return;
    }
    if (target.hasAttribute("data-enhancement-selection")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-index"), 10);
      const enhancementIndex = Number.parseInt(target.getAttribute("data-enhancement-index"), 10);
      const selectionKey = sanitizeText(target.getAttribute("data-selection-key"), { maxLen: 64, collapse: true });
      if (Number.isFinite(weaponIndex) && Number.isFinite(enhancementIndex) && selectionKey) updateEnhancementSelection(weaponIndex, enhancementIndex, selectionKey, target.value);
    }
  });

  weaponListEl.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target.hasAttribute("data-weapon-custom-name")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-custom-name"), 10);
      if (Number.isFinite(weaponIndex)) updateWeaponCustomName(weaponIndex, target.value);
      return;
    }
    if (target.hasAttribute("data-enhancement-selection")) {
      const weaponIndex = Number.parseInt(target.getAttribute("data-weapon-index"), 10);
      const enhancementIndex = Number.parseInt(target.getAttribute("data-enhancement-index"), 10);
      const selectionKey = sanitizeText(target.getAttribute("data-selection-key"), { maxLen: 64, collapse: true });
      if (Number.isFinite(weaponIndex) && Number.isFinite(enhancementIndex) && selectionKey) updateEnhancementSelection(weaponIndex, enhancementIndex, selectionKey, target.value);
    }
  });
}

async function main() {
  try {
    ctx = await initBuilderAuth({ whoamiEl, signOutBtn, gmHintEl, statusEl, errorEl });
    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    gameData = await loadGameXData();
    weaponBases = Array.isArray(gameData?.weaponBases) ? gameData.weaponBases.slice().sort(compareByName) : [];
    weaponEnhancements = Array.isArray(gameData?.weaponEnhancements) ? gameData.weaponEnhancements.slice().sort(compareByName) : [];
    grantedSkillState = computeGrantedSkillsState(gameData, currentDoc?.builder || {});
    currentWeapons = Array.isArray(currentDoc?.builder?.weapons) ? currentDoc.builder.weapons.map((weapon) => normalizeWeaponForUi(weapon)) : [];

    renderWeaponBaseSelect();
    renderWeapons();
    bindPageEvents();
    await markStepVisited(charRef, CURRENT_STEP_ID);

    const navConfig = {
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNavigate: async () => await saveBuilder({ openSheetAfter: false, intent: "navigate" }),
    };
    renderBuilderNav({ mountEl: navTopEl, ...navConfig });
    renderBuilderNav({ mountEl: navBottomEl, ...navConfig });
    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Could not load builder step.");
    setStatus(statusEl, "Error.");
  }
}

main();
