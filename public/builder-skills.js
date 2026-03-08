import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  setStatus,
  showError,
  clearError,
  markStepVisited,
  confirmSaveWarnings,
} from "./builder-common.js";
import { renderBuilderNav } from "./builder-nav.js";
import {
  DEFENSE_SKILL_FIELDS,
  CORE_SKILL_FIELDS,
  SKILL_RANK_OPTIONS,
  clampLevel,
  getStandardSkillRankCap,
  getSpendableSkillPoints,
  getSkillPointCostForRank,
} from "./character-rules.js";
import {
  sanitizeSkillFields,
  sanitizeNamedSkillList,
  sanitizeText,
  sanitizeStringArray,
  buildOptionKey,
} from "./data-sanitization.js";
import { loadGameXData, computeGrantedSkillsState } from "./game-data.js";

const CURRENT_STEP_ID =
  document.querySelector("[data-builder-step]")?.getAttribute("data-builder-step") || "skills";

const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const navTop = document.getElementById("builderNav");
const navBottom = document.getElementById("builderNavBottom");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");
const addCombatSkillBtn = document.getElementById("addCombatSkillBtn");
const addSettingSkillBtn = document.getElementById("addSettingSkillBtn");

const skillPointsTotalEl = document.getElementById("skillPointsTotal");
const skillPointsSpentEl = document.getElementById("skillPointsSpent");
const skillPointsRemainingEl = document.getElementById("skillPointsRemaining");
const skillPointsRemainingPillEl = document.getElementById("skillPointsRemainingPill");
const skillRankCapEl = document.getElementById("skillRankCap");

const classUtilitySkillsCardEl = document.getElementById("classUtilitySkillsCard");
const classUtilitySkillsMetaEl = document.getElementById("classUtilitySkillsMeta");
const classUtilitySkillOptionsEl = document.getElementById("classUtilitySkillOptions");

let ctx = null;
let charRef = null;
let currentDoc = null;

const MIN_COMBAT_SKILL_ROWS = 2;
const MIN_SETTING_SKILL_ROWS = 5;
const CLASS_UTILITY_SKILL_CHOICE_COUNT = 2;

const repeatableLists = {};

let gameData = null;
let grantedSkillState = {
  fixedRanks: {
    rank_physdef: "",
    rank_mentdef: "",
    rank_spiritdef: "",
  },
  grantedSkillNames: new Set(),
  grantedCombatSkills: [],
};
let selectedClassUtilitySkills = [];
let classUtilitySkillOptions = [];
let skillCapBonusByName = new Map();

const DEFENSE_TRAINING_BY_SKILL = Object.freeze({
  "Physical Defense": "rank_physdef",
  "Mental Defense": "rank_mentdef",
  "Spiritual Defense": "rank_spiritdef",
});

const CORE_FIELD_BY_LABEL = new Map(CORE_SKILL_FIELDS.map(({ key, label }) => [label, key]));
const DEFENSE_SKILL_NAMES = new Set(Object.keys(DEFENSE_TRAINING_BY_SKILL));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSkillName(value) {
  return sanitizeText(value, { maxLen: 96, collapse: true });
}

function normalizeRankValue(value) {
  const raw = sanitizeText(value, { maxLen: 8, collapse: true });
  if (raw === "") return "";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return "";
  return String(Math.max(0, Math.min(6, n)));
}

function numericRank(value) {
  const raw = normalizeRankValue(value);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function currentLevel() {
  return clampLevel(currentDoc?.builder?.level ?? 1);
}

function currentIntellect() {
  return Number.parseInt(String(currentDoc?.builder?.attributes?.intellect ?? 0), 10) || 0;
}

function defenseFieldKeyForSkillName(name) {
  return DEFENSE_TRAINING_BY_SKILL[normalizeSkillName(name)] || "";
}

function grantedDefenseFieldMap() {
  return new Map(Object.entries(grantedSkillState.fixedRanks || {}).filter(([, value]) => String(value || "") !== ""));
}

function getGrantedCoreSkillRanks() {
  const out = new Map();
  for (const skillName of selectedClassUtilitySkills) {
    const fieldKey = CORE_FIELD_BY_LABEL.get(skillName);
    if (fieldKey) out.set(fieldKey, "1");
  }
  return out;
}

function grantedFixedFieldMap() {
  const out = grantedDefenseFieldMap();
  for (const [fieldKey, rank] of getGrantedCoreSkillRanks()) out.set(fieldKey, rank);
  return out;
}

function getGrantedSettingSkills() {
  return selectedClassUtilitySkills
    .filter((skillName) => !CORE_FIELD_BY_LABEL.has(skillName) && !DEFENSE_SKILL_NAMES.has(skillName))
    .map((skillName) => ({ skill: skillName, rank: "1", source: "Class" }));
}

function previousGrantedSkillSnapshot() {
  return new Set(
    sanitizeStringArray(currentDoc?.builder?.grantedSkillSnapshot, { maxItems: 200, maxLen: 96 })
      .map((name) => normalizeSkillName(name))
      .filter(Boolean),
  );
}

function previousGrantedCoreSkillSnapshot() {
  return new Set(
    sanitizeStringArray(currentDoc?.builder?.grantedCoreSkillSnapshot, { maxItems: 50, maxLen: 64 })
      .map((key) => sanitizeText(key, { maxLen: 64, collapse: true }))
      .filter(Boolean),
  );
}

function sanitizeSelectedClassUtilitySkills(value) {
  const allowed = new Set((Array.isArray(classUtilitySkillOptions) ? classUtilitySkillOptions : []).map((name) => normalizeSkillName(name)));
  const seen = new Set();
  const out = [];
  for (const name of sanitizeStringArray(value, { maxItems: 20, maxLen: 96 })) {
    const skill = normalizeSkillName(name);
    if (!skill || !allowed.has(skill) || seen.has(skill)) continue;
    seen.add(skill);
    out.push(skill);
    if (out.length >= CLASS_UTILITY_SKILL_CHOICE_COUNT) break;
  }
  return out;
}


function sanitizeEditableFixedValues(value) {
  const fixed = sanitizeSkillFields(value);
  const grantedNow = new Set(getGrantedCoreSkillRanks().keys());
  const grantedBefore = previousGrantedCoreSkillSnapshot();

  for (const fieldKey of grantedNow) {
    fixed[fieldKey] = "";
  }
  for (const fieldKey of grantedBefore) {
    if (!grantedNow.has(fieldKey)) fixed[fieldKey] = "";
  }

  return fixed;
}

function sanitizeCombatSkillExtras(value) {
  const rows = sanitizeNamedSkillList(value, { maxItems: 50 });
  const grantedNow = grantedSkillState.grantedSkillNames instanceof Set
    ? grantedSkillState.grantedSkillNames
    : new Set();
  const grantedBefore = previousGrantedSkillSnapshot();
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const skill = normalizeSkillName(row?.skill);
    const rank = normalizeRankValue(row?.rank);

    if (!skill && rank === "") continue;
    if (!skill) continue;
    if (DEFENSE_SKILL_NAMES.has(skill)) continue;
    if (grantedNow.has(skill)) continue;
    if (grantedBefore.has(skill) && !grantedNow.has(skill)) continue;

    const dedupeKey = skill.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({ skill, rank });
  }

  return out;
}

function sanitizeSettingSkillExtras(value) {
  const rows = sanitizeNamedSkillList(value, { maxItems: 50 });
  const granted = new Set(getGrantedSettingSkills().map((row) => normalizeSkillName(row.skill).toLowerCase()));
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const skill = normalizeSkillName(row?.skill);
    const rank = normalizeRankValue(row?.rank);

    if (!skill && rank === "") continue;
    if (!skill) continue;

    const dedupeKey = skill.toLowerCase();
    if (granted.has(dedupeKey) || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({ skill, rank });
  }

  return out;
}

function extractSkillCapBonusesFromText(text, targetMap) {
  const source = sanitizeText(text, { maxLen: 4000, collapse: true });
  if (!source) return;
  const regex = /train the\s+(.+?)\s+skill up to\s+(\d+)\s+rank higher than the standard skill rank cap/gi;
  let match = regex.exec(source);
  while (match) {
    const skillName = normalizeSkillName(match[1]);
    const bonus = Number.parseInt(String(match[2] || "0"), 10);
    if (skillName && Number.isFinite(bonus) && bonus > 0) {
      const prev = targetMap.get(skillName) || 0;
      targetMap.set(skillName, Math.max(prev, bonus));
    }
    match = regex.exec(source);
  }
}

function computeSkillCapBonusMap() {
  const out = new Map();
  const builder = (currentDoc?.builder && typeof currentDoc.builder === "object") ? currentDoc.builder : {};
  const classKey = normalizeSkillName(builder.classKey);
  const level = currentLevel();
  const selectedOptionKeys = new Set(sanitizeStringArray(builder.selectedClassFeatureOptions, { maxItems: 500, maxLen: 200 }));
  const selectedFeatNames = new Set(sanitizeStringArray(builder.selectedFeats, { maxItems: 200, maxLen: 160 }));

  const featuresByClass = (gameData?.classFeatures && typeof gameData.classFeatures === "object") ? gameData.classFeatures : {};
  const features = Array.isArray(featuresByClass[classKey]) ? featuresByClass[classKey] : [];
  for (const feature of features) {
    const featureLevel = Number.parseInt(String(feature?.level ?? 0), 10);
    if (Number.isFinite(featureLevel) && featureLevel > level) continue;
    extractSkillCapBonusesFromText([feature?.name, feature?.description, feature?.grantsNotes].filter(Boolean).join(" "), out);
    for (const option of (Array.isArray(feature?.options) ? feature.options : [])) {
      const optionKey = buildOptionKey(feature, option);
      if (!selectedOptionKeys.has(optionKey)) continue;
      extractSkillCapBonusesFromText([option?.name, option?.description, option?.grantsNotes].filter(Boolean).join(" "), out);
    }
  }

  const feats = Array.isArray(gameData?.feats) ? gameData.feats : [];
  for (const feat of feats) {
    const featName = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
    if (!featName || !selectedFeatNames.has(featName)) continue;
    const minLevel = Number.parseInt(String(feat?.minLevel ?? 0), 10);
    if (Number.isFinite(minLevel) && minLevel > level) continue;
    extractSkillCapBonusesFromText([feat?.name, feat?.description, feat?.grantsNotes].filter(Boolean).join(" "), out);
  }

  return out;
}

function skillRankOptionsHtml(selectedValue = "") {
  return SKILL_RANK_OPTIONS
    .map(({ value, label }) => `<option value="${escapeHtml(value)}"${String(selectedValue) === String(value) ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function constrainedSkillRankOptionsHtml(selectedValue = "", maxAllowed = 6) {
  const selected = normalizeRankValue(selectedValue);
  return SKILL_RANK_OPTIONS
    .map(({ value, label }) => {
      const normalizedValue = normalizeRankValue(value);
      const numericValue = Number.parseInt(normalizedValue, 10);
      const shouldDisable = normalizedValue !== "" && Number.isFinite(numericValue) && numericValue > maxAllowed && normalizedValue !== selected;
      return `<option value="${escapeHtml(value)}"${String(selected) === String(value) ? " selected" : ""}${shouldDisable ? " disabled" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderGrantedSkillGrid(containerId, rows, markerAttr) {
  const container = document.getElementById(containerId);
  if (!container) return;

  [...container.querySelectorAll(`[${markerAttr}]`)].forEach((node) => node.remove());

  const html = (Array.isArray(rows) ? rows : [])
    .map((row) => `
      <label class="skill-chip skill-chip-static" ${markerAttr}>
        <span class="skill-chip-label">${escapeHtml(normalizeSkillName(row?.skill))}</span>
        <select aria-label="${escapeHtml(normalizeSkillName(row?.skill))} rank" class="skill-rank-select" disabled>
          ${skillRankOptionsHtml(String(row?.rank ?? ""))}
        </select>
      </label>
    `)
    .join("");

  if (html) container.insertAdjacentHTML("afterbegin", html);
}

function renderFixedSkillGrid(containerId, items, values) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const grantedByField = grantedFixedFieldMap();
  container.innerHTML = (Array.isArray(items) ? items : [])
    .map(({ key, label }) => {
      const grantedRank = grantedByField.get(key);
      const rankValue = grantedRank ?? values?.[key] ?? "";
      const isLocked = grantedRank !== undefined;
      return `
        <label class="skill-chip skill-chip-static">
          <span class="skill-chip-label">${escapeHtml(label)}</span>
          <select aria-label="${escapeHtml(label)} rank" class="skill-rank-select" name="${escapeHtml(key)}"${isLocked ? " disabled" : ""}>
            ${skillRankOptionsHtml(rankValue)}
          </select>
        </label>
      `;
    })
    .join("");

  for (const selectEl of container.querySelectorAll(".skill-rank-select:not([disabled])")) {
    selectEl.addEventListener("change", refreshSkillPointSummaryAndCaps);
  }
}

function createRepeatableList({ key, containerId, addBtnId, minRows = 0, preserveGrantedRows = false }) {
  const container = document.getElementById(containerId);
  const addBtn = document.getElementById(addBtnId);
  const tmpl = document.getElementById("skillChipTemplate");
  if (!container || !tmpl) return null;

  function hydrateRow(root, data = {}) {
    const skillInput = root.querySelector('[data-field="skill"]');
    const rankSelect = root.querySelector('[data-field="rank"]');
    const removeBtn = root.querySelector('[data-action="remove"]');
    const rankValue = normalizeRankValue(data.rank ?? "");
    if (rankSelect) rankSelect.innerHTML = skillRankOptionsHtml(rankValue);
    if (skillInput) {
      skillInput.value = String(data.skill || "");
      skillInput.addEventListener("input", refreshSkillPointSummaryAndCaps);
    }
    if (rankSelect) {
      rankSelect.value = String(rankValue);
      rankSelect.addEventListener("change", refreshSkillPointSummaryAndCaps);
    }
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        root.remove();
        refreshSkillPointSummaryAndCaps();
      });
    }
  }

  function addRow(data = {}) {
    const node = document.importNode(tmpl.content, true);
    const root = node.firstElementChild;
    container.appendChild(node);
    if (root) hydrateRow(root, data);
    refreshSkillPointSummaryAndCaps();
    return root;
  }

  function clear() {
    container.innerHTML = "";
  }

  function clearRepeatableRows() {
    [...container.querySelectorAll("[data-repeatable-item]")].forEach((row) => row.remove());
  }

  function ensureMin() {
    while (container.querySelectorAll("[data-repeatable-item]").length < minRows) addRow({});
  }

  function load(items) {
    if (preserveGrantedRows) clearRepeatableRows();
    else clear();
    const rows = Array.isArray(items) ? items : [];
    rows.forEach((it) => addRow(it));
    ensureMin();
    refreshSkillPointSummaryAndCaps();
  }

  function read() {
    const rows = [...container.querySelectorAll("[data-repeatable-item]")];
    return rows
      .map((row) => ({
        skill: row.querySelector('[data-field="skill"]')?.value || "",
        rank: row.querySelector('[data-field="rank"]')?.value || "",
      }));
  }

  if (addBtn) addBtn.addEventListener("click", () => addRow({}));

  const api = { key, load, read };
  repeatableLists[key] = api;
  return api;
}

function getCurrentSkillState() {
  const sheetFields = (currentDoc?.builder?.sheet?.fields && typeof currentDoc.builder.sheet.fields === "object")
    ? currentDoc.builder.sheet.fields
    : {};
  const repeatables = (currentDoc?.builder?.sheet?.repeatables && typeof currentDoc.builder.sheet.repeatables === "object")
    ? currentDoc.builder.sheet.repeatables
    : {};

  return {
    fixed: sanitizeEditableFixedValues(sheetFields),
    combatSkillsExtra: sanitizeCombatSkillExtras(repeatables.combatSkillsExtra),
    settingSkills: sanitizeSettingSkillExtras(repeatables.settingSkills),
  };
}

function getLiveFixedValues() {
  const out = {};
  for (const { key } of [...DEFENSE_SKILL_FIELDS, ...CORE_SKILL_FIELDS]) {
    const el = document.querySelector(`[name="${key}"]`);
    out[key] = el ? el.value : "";
  }
  return sanitizeEditableFixedValues(out);
}

function getLiveState() {
  const hasRenderedFields = document.querySelector(`[name="${CORE_SKILL_FIELDS[0]?.key || ''}"]`);
  if (!hasRenderedFields) return getCurrentSkillState();
  return {
    fixed: getLiveFixedValues(),
    combatSkillsExtra: sanitizeCombatSkillExtras(repeatableLists.combatSkillsExtra?.read()),
    settingSkills: sanitizeSettingSkillExtras(repeatableLists.settingSkills?.read()),
  };
}

function getClassRecord() {
  const classKey = sanitizeText(currentDoc?.builder?.classKey || "", { maxLen: 64, collapse: true });
  return (Array.isArray(gameData?.classes) ? gameData.classes : []).find((it) => String(it?.classKey || "") === classKey) || null;
}

function renderClassUtilitySkillOptions() {
  const cls = getClassRecord();
  classUtilitySkillOptions = Array.isArray(cls?.utilitySkillOptions)
    ? cls.utilitySkillOptions.map((name) => normalizeSkillName(name)).filter(Boolean)
    : [];
  selectedClassUtilitySkills = sanitizeSelectedClassUtilitySkills(selectedClassUtilitySkills);

  if (!classUtilitySkillsCardEl || !classUtilitySkillOptionsEl || !classUtilitySkillsMetaEl) return;

  if (!classUtilitySkillOptions.length) {
    classUtilitySkillsCardEl.style.display = "none";
    classUtilitySkillOptionsEl.innerHTML = "";
    classUtilitySkillsMetaEl.textContent = "";
    selectedClassUtilitySkills = [];
    return;
  }

  classUtilitySkillsCardEl.style.display = "";
  classUtilitySkillsMetaEl.textContent = `Choose ${CLASS_UTILITY_SKILL_CHOICE_COUNT} of ${classUtilitySkillOptions.length}`;

  classUtilitySkillOptionsEl.innerHTML = classUtilitySkillOptions
    .map((skillName) => {
      const checked = selectedClassUtilitySkills.includes(skillName);
      return `
        <label class="optionRow">
          <input type="checkbox" data-class-utility-skill value="${escapeHtml(skillName)}"${checked ? " checked" : ""} />
          <div>
            <div class="optionTitle">${escapeHtml(skillName)}</div>
            <div class="optionDesc">Granted at Rank 1 and does not cost Skill Points.</div>
          </div>
        </label>
      `;
    })
    .join("");

  for (const checkbox of classUtilitySkillOptionsEl.querySelectorAll("[data-class-utility-skill]")) {
    checkbox.addEventListener("change", onClassUtilitySkillChoiceChanged);
  }
}

function loadUiFromState(state) {
  renderClassUtilitySkillOptions();
  renderFixedSkillGrid("defenseSkillGrid", DEFENSE_SKILL_FIELDS, state.fixed);
  renderFixedSkillGrid("coreSkillGrid", CORE_SKILL_FIELDS, state.fixed);
  renderGrantedSkillGrid("combatSkillGrid", grantedSkillState.grantedCombatSkills, "data-granted-skill");
  renderGrantedSkillGrid("settingSkillGrid", getGrantedSettingSkills(), "data-granted-setting-skill");
  repeatableLists.combatSkillsExtra?.load(state.combatSkillsExtra);
  repeatableLists.settingSkills?.load(state.settingSkills);
  refreshSkillPointSummaryAndCaps();
}

function loadUiFromDoc() {
  loadUiFromState(getCurrentSkillState());
}

function selectedClassUtilitySkillSnapshot() {
  return Array.from(selectedClassUtilitySkills || []);
}

function skillNameForFieldKey(fieldKey) {
  const found = CORE_SKILL_FIELDS.find(({ key }) => key === fieldKey);
  return found?.label || "";
}

function skillPointCostForRank(rank, { grantedRank = 0 } = {}) {
  return getSkillPointCostForRank(rank, { grantedRank });
}

function setAddSkillButtonState(buttonEl, remaining) {
  if (!buttonEl) return;
  const disabled = remaining <= 0;
  buttonEl.disabled = disabled;
  buttonEl.title = disabled ? "No Skill Points remaining." : "";
}

function skillCapForName(skillName) {
  const baseCap = getStandardSkillRankCap(currentLevel());
  const bonus = skillCapBonusByName.get(normalizeSkillName(skillName)) || 0;
  return Math.max(0, Math.min(6, baseCap + bonus));
}

function computeSpendState() {
  const fixed = getLiveFixedValues();
  const combat = sanitizeCombatSkillExtras(repeatableLists.combatSkillsExtra?.read());
  const setting = sanitizeSettingSkillExtras(repeatableLists.settingSkills?.read());

  let spent = 0;
  for (const { key } of CORE_SKILL_FIELDS) {
    const grantedRank = getGrantedCoreSkillRanks().get(key) || 0;
    spent += skillPointCostForRank(fixed[key], { grantedRank });
  }
  for (const row of combat) {
    spent += skillPointCostForRank(row.rank);
  }
  for (const row of setting) {
    spent += skillPointCostForRank(row.rank);
  }

  const total = getSpendableSkillPoints(currentLevel(), currentIntellect());
  return {
    total,
    spent,
    remaining: total - spent,
    fixed,
    combat,
    setting,
  };
}

function constrainRankSelect(selectEl, { skillName, maxAllowed }) {
  if (!selectEl || selectEl.disabled) return;
  const currentValue = normalizeRankValue(selectEl.value);
  selectEl.innerHTML = constrainedSkillRankOptionsHtml(currentValue, maxAllowed);
  selectEl.value = currentValue;
  const selected = selectEl.querySelector(`option[value="${CSS.escape(currentValue)}"]`);
  if (selected) selected.selected = true;
  selectEl.title = maxAllowed >= 0 ? `Rank cap for ${skillName}: ${maxAllowed}` : "";
}

function refreshSkillPointSummaryAndCaps() {
  const spendState = computeSpendState();
  const baseCap = getStandardSkillRankCap(currentLevel());

  if (skillPointsTotalEl) skillPointsTotalEl.textContent = String(spendState.total);
  if (skillPointsSpentEl) skillPointsSpentEl.textContent = String(spendState.spent);
  if (skillPointsRemainingEl) skillPointsRemainingEl.textContent = String(spendState.remaining);
  if (skillRankCapEl) skillRankCapEl.textContent = String(baseCap);
  if (skillPointsRemainingPillEl) {
    skillPointsRemainingPillEl.classList.remove("ok", "danger");
    skillPointsRemainingPillEl.classList.add(spendState.remaining < 0 ? "danger" : "ok");
  }

  setAddSkillButtonState(addCombatSkillBtn, spendState.remaining);
  setAddSkillButtonState(addSettingSkillBtn, spendState.remaining);

  for (const { key } of CORE_SKILL_FIELDS) {
    const selectEl = document.querySelector(`[name="${key}"]`);
    const currentRank = numericRank(selectEl?.value);
    const headroom = Math.max(0, spendState.remaining) + currentRank;
    constrainRankSelect(selectEl, {
      skillName: skillNameForFieldKey(key),
      maxAllowed: Math.min(skillCapForName(skillNameForFieldKey(key)), headroom),
    });
  }

  for (const row of document.querySelectorAll("#combatSkillGrid [data-repeatable-item]")) {
    const skillName = normalizeSkillName(row.querySelector('[data-field="skill"]')?.value);
    const rankSelect = row.querySelector('[data-field="rank"]');
    const currentRank = numericRank(rankSelect?.value);
    const headroom = Math.max(0, spendState.remaining) + currentRank;
    constrainRankSelect(rankSelect, {
      skillName,
      maxAllowed: Math.min(skillCapForName(skillName), headroom),
    });
  }

  for (const row of document.querySelectorAll("#settingSkillGrid [data-repeatable-item]")) {
    const skillName = normalizeSkillName(row.querySelector('[data-field="skill"]')?.value);
    const rankSelect = row.querySelector('[data-field="rank"]');
    const currentRank = numericRank(rankSelect?.value);
    const headroom = Math.max(0, spendState.remaining) + currentRank;
    constrainRankSelect(rankSelect, {
      skillName,
      maxAllowed: Math.min(skillCapForName(skillName), headroom),
    });
  }
}

function onClassUtilitySkillChoiceChanged() {
  const nextSelected = sanitizeSelectedClassUtilitySkills(
    [...classUtilitySkillOptionsEl.querySelectorAll("[data-class-utility-skill]:checked")].map((el) => el.value),
  );

  if (nextSelected.length < [...classUtilitySkillOptionsEl.querySelectorAll("[data-class-utility-skill]:checked")].length) {
    renderClassUtilitySkillOptions();
  }

  selectedClassUtilitySkills = nextSelected;
  loadUiFromState(getLiveState());
}

function collectSkillPatch() {
  const existingFields = (currentDoc?.builder?.sheet?.fields && typeof currentDoc.builder.sheet.fields === "object")
    ? { ...currentDoc.builder.sheet.fields }
    : {};
  const existingRepeatables = (currentDoc?.builder?.sheet?.repeatables && typeof currentDoc.builder.sheet.repeatables === "object")
    ? { ...currentDoc.builder.sheet.repeatables }
    : {};

  return {
    "builder.sheet.fields": {
      ...existingFields,
      ...getLiveFixedValues(),
    },
    "builder.sheet.repeatables": {
      ...existingRepeatables,
      combatSkillsExtra: sanitizeCombatSkillExtras(repeatableLists.combatSkillsExtra?.read()),
      settingSkills: sanitizeSettingSkillExtras(repeatableLists.settingSkills?.read()),
    },
    "builder.selectedClassUtilitySkills": selectedClassUtilitySkillSnapshot(),
    "builder.grantedCoreSkillSnapshot": Array.from(getGrantedCoreSkillRanks().keys()),
    "builder.grantedSkillSnapshot": Array.from(grantedSkillState.grantedSkillNames || []),
  };
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = [];
  const patch = collectSkillPatch();
  const fixed = patch["builder.sheet.fields"];
  const combat = patch["builder.sheet.repeatables"].combatSkillsExtra || [];
  const grantedCombat = Array.isArray(grantedSkillState.grantedCombatSkills) ? grantedSkillState.grantedCombatSkills : [];
  const spendState = computeSpendState();

  if (Object.values(fixed).every((v) => String(v || "").trim() === "")) {
    warnings.push("All fixed skill ranks are blank.");
  }
  if (!combat.length && !grantedCombat.length) warnings.push("No Combat & Class Skills are filled in.");
  if (classUtilitySkillOptions.length && selectedClassUtilitySkills.length < Math.min(CLASS_UTILITY_SKILL_CHOICE_COUNT, classUtilitySkillOptions.length)) {
    warnings.push("Not all class utility skill choices are selected.");
  }
  if (spendState.remaining < 0) warnings.push(`Skill Points overspent by ${Math.abs(spendState.remaining)}.`);

  if (warnings.length) {
    const ok = await confirmSaveWarnings({
      title: "Save with warnings?",
      warnings,
      okText: intent === "navigate" ? "Save and Continue" : "Save",
      cancelText: "Cancel",
    });
    if (!ok) {
      setStatus(statusEl, "Not saved.");
      return false;
    }
  }

  try {
    await saveCharacterPatch(charRef, patch);

    currentDoc = currentDoc || {};
    currentDoc.builder = currentDoc.builder || {};
    currentDoc.builder.sheet = currentDoc.builder.sheet || {};
    currentDoc.builder.sheet.fields = patch["builder.sheet.fields"];
    currentDoc.builder.sheet.repeatables = patch["builder.sheet.repeatables"];
    currentDoc.builder.selectedClassUtilitySkills = patch["builder.selectedClassUtilitySkills"];
    currentDoc.builder.grantedCoreSkillSnapshot = patch["builder.grantedCoreSkillSnapshot"];
    currentDoc.builder.grantedSkillSnapshot = patch["builder.grantedSkillSnapshot"];

    setStatus(statusEl, "Saved.");

    if (openSheetAfter) {
      const url = new URL("character-sheet.html", window.location.href);
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

async function main() {
  try {
    createRepeatableList({ key: "combatSkillsExtra", containerId: "combatSkillGrid", addBtnId: "addCombatSkillBtn", minRows: MIN_COMBAT_SKILL_ROWS, preserveGrantedRows: true });
    createRepeatableList({ key: "settingSkills", containerId: "settingSkillGrid", addBtnId: "addSettingSkillBtn", minRows: MIN_SETTING_SKILL_ROWS, preserveGrantedRows: true });

    ctx = await initBuilderAuth({ whoamiEl, signOutBtn, gmHintEl, statusEl, errorEl });
    gameData = await loadGameXData();
    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    await markStepVisited(charRef, CURRENT_STEP_ID);

    const computedGrantedSkills = computeGrantedSkillsState(gameData, currentDoc?.builder);
    grantedSkillState = {
      fixedRanks: computedGrantedSkills?.fixedRanks || grantedSkillState.fixedRanks,
      grantedSkillNames: computedGrantedSkills?.grantedSkillNames || new Set(),
      grantedCombatSkills: computedGrantedSkills?.grantedCombatSkills || [],
    };
    selectedClassUtilitySkills = sanitizeStringArray(currentDoc?.builder?.selectedClassUtilitySkills, { maxItems: 20, maxLen: 96 });
    skillCapBonusByName = computeSkillCapBonusMap();
    loadUiFromDoc();

    const navArgs = {
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNavigate: async () => await saveBuilder({ intent: "navigate" }),
    };
    renderBuilderNav({ ...navArgs, mountEl: navTop });
    renderBuilderNav({ ...navArgs, mountEl: navBottom });

    if (saveBtn) saveBtn.addEventListener("click", () => saveBuilder({ intent: "save" }));
    if (saveAndOpenBtn) saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true, intent: "save" }));

    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Could not load Skills step.");
    setStatus(statusEl, "Error.");
  }
}

main();
