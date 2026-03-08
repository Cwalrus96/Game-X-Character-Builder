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
} from "./character-rules.js";
import {
  sanitizeSkillFields,
  sanitizeNamedSkillList,
  sanitizeText,
  buildOptionKey,
} from "./data-sanitization.js";
import { loadGameXData } from "./game-data.js";

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

let ctx = null;
let charRef = null;
let currentDoc = null;

const MIN_COMBAT_SKILL_ROWS = 2;
const MIN_SETTING_SKILL_ROWS = 5;

const repeatableLists = {};

let gameData = null;
let grantedCombatSkills = [];

const DEFENSE_TRAINING_BY_SKILL = Object.freeze({
  "Physical Defense": "rank_physdef",
  "Mental Defense": "rank_mentdef",
  "Spiritual Defense": "rank_spiritdef",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function progressionRankAtLevel(progression, level) {
  const p = sanitizeText(progression, { maxLen: 16, collapse: true }).toLowerCase();
  const L = Number.isFinite(Number(level)) ? Math.max(1, Math.min(12, Number(level))) : 1;
  if (p === "fast") return Math.min(6, Math.floor((L + 1) / 2));
  if (p === "medium") {
    if (L >= 11) return 5;
    if (L >= 9) return 4;
    if (L >= 7) return 3;
    if (L >= 4) return 2;
    return 1;
  }
  if (p === "slow") {
    if (L >= 11) return 4;
    if (L >= 9) return 3;
    if (L >= 6) return 2;
    if (L >= 3) return 1;
    return 0;
  }
  return null;
}

function progressionFromText(value) {
  const text = sanitizeText(value, { maxLen: 1000, collapse: true });
  const match = text.match(/\b(fast|medium|slow)\s+skill progression\b/i);
  return match ? match[1].toLowerCase() : "";
}

function getGrantedCombatSkills() {
  const data = (gameData && typeof gameData === "object") ? gameData : {};
  const builder = (currentDoc?.builder && typeof currentDoc.builder === "object") ? currentDoc.builder : {};
  const classKey = sanitizeText(builder.classKey, { maxLen: 64, collapse: true });
  const level = Number.parseInt(String(builder.level ?? 1), 10);
  const L = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;
  const out = [];
  const seen = new Set();

  function addGrantedSkill(name, progression) {
    const skill = sanitizeText(name, { maxLen: 96, collapse: true });
    const prog = sanitizeText(progression, { maxLen: 16, collapse: true }).toLowerCase();
    if (!skill || !prog || seen.has(skill)) return;
    const rank = progressionRankAtLevel(prog, L);
    if (rank == null) return;
    seen.add(skill);
    out.push({ skill, progression: prog, rank: String(rank) });
  }

  const cls = (Array.isArray(data.classes) ? data.classes : []).find((it) => String(it?.classKey || "") === classKey);
  for (const row of (Array.isArray(cls?.combatSkills) ? cls.combatSkills : [])) {
    addGrantedSkill(row?.name, row?.progression);
  }

  const selectedOptionKeys = new Set(Array.isArray(builder.selectedClassFeatureOptions) ? builder.selectedClassFeatureOptions : []);
  const classFeatures = (data.classFeatures && typeof data.classFeatures === "object") ? data.classFeatures : {};
  const features = Array.isArray(classFeatures[classKey]) ? classFeatures[classKey] : [];
  for (const feature of features) {
    const featureLevel = Number.parseInt(String(feature?.level ?? 0), 10);
    if (Number.isFinite(featureLevel) && featureLevel > L) continue;

    const directProgression = progressionFromText(feature?.description);
    for (const skill of (Array.isArray(feature?.grantsSkills) ? feature.grantsSkills : [])) {
      addGrantedSkill(skill, directProgression);
    }

    if (!Array.isArray(feature?.options) || !feature.options.length) continue;
    const optionProgression = progressionFromText(feature?.description);
    for (const option of feature.options) {
      if (!selectedOptionKeys.has(buildOptionKey(feature, option))) continue;
      for (const skill of (Array.isArray(option?.grantsSkills) ? option.grantsSkills : [])) {
        addGrantedSkill(skill, optionProgression || progressionFromText(option?.description));
      }
    }
  }

  return out;
}

function defenseFieldKeyForSkillName(name) {
  return DEFENSE_TRAINING_BY_SKILL[sanitizeText(name, { maxLen: 96, collapse: true })] || "";
}

function grantedDefenseFieldMap() {
  const out = new Map();
  for (const row of grantedCombatSkills) {
    const fieldKey = defenseFieldKeyForSkillName(row?.skill);
    if (fieldKey) out.set(fieldKey, row);
  }
  return out;
}

function grantedSkillMap() {
  return new Map(
    grantedCombatSkills
      .filter((row) => !defenseFieldKeyForSkillName(row?.skill))
      .map((row) => [row.skill, row]),
  );
}

function skillRankOptionsHtml(selectedValue = "") {
  return SKILL_RANK_OPTIONS
    .map(({ value, label }) => `<option value="${escapeHtml(value)}"${String(selectedValue) === String(value) ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderFixedSkillGrid(containerId, items, values) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const grantedDefenseByField = grantedDefenseFieldMap();
  container.innerHTML = (Array.isArray(items) ? items : [])
    .map(({ key, label }) => {
      const granted = grantedDefenseByField.get(key);
      const rankValue = granted?.rank ?? values?.[key] ?? "";
      const isLocked = Boolean(granted);
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
}

function createRepeatableList({ key, containerId, addBtnId, minRows = 0, isCombatSkillList = false }) {
  const container = document.getElementById(containerId);
  const addBtn = document.getElementById(addBtnId);
  const tmpl = document.getElementById("skillChipTemplate");
  if (!container || !tmpl) return null;

  function hydrateRow(root, data = {}) {
    const skillInput = root.querySelector('[data-field="skill"]');
    const rankSelect = root.querySelector('[data-field="rank"]');
    const removeBtn = root.querySelector('[data-action="remove"]');
    const granted = isCombatSkillList ? grantedSkillMap().get(String(data.skill || "")) : null;
    const rankValue = granted?.rank ?? data.rank ?? "";
    if (rankSelect && !rankSelect.options.length) rankSelect.innerHTML = skillRankOptionsHtml(rankValue);
    if (skillInput) {
      skillInput.value = String(data.skill || "");
      if (granted) skillInput.disabled = true;
    }
    if (rankSelect) {
      rankSelect.value = String(rankValue);
      if (granted) rankSelect.disabled = true;
    }
    if (removeBtn) {
      if (granted) {
        removeBtn.hidden = true;
        removeBtn.disabled = true;
      } else {
        removeBtn.addEventListener("click", () => {
          root.remove();
        });
      }
    }
  }

  function addRow(data = {}) {
    const node = document.importNode(tmpl.content, true);
    const root = node.firstElementChild;
    container.appendChild(node);
    if (root) hydrateRow(root, data);
    return root;
  }

  function clear() {
    container.innerHTML = "";
  }

  function ensureMin() {
    while (container.querySelectorAll("[data-repeatable-item]").length < minRows) addRow({});
  }

  function load(items) {
    clear();
    const rows = Array.isArray(items) ? items : [];
    if (isCombatSkillList) {
      grantedCombatSkills.forEach((it) => addRow(it));
      rows
        .filter((it) => !grantedSkillMap().has(String(it?.skill || "")))
        .forEach((it) => addRow(it));
    } else {
      rows.forEach((it) => addRow(it));
    }
    ensureMin();
  }

  function read() {
    const rows = [...container.querySelectorAll("[data-repeatable-item]")];
    return rows
      .map((row) => ({
        skill: row.querySelector('[data-field="skill"]')?.value || "",
        rank: row.querySelector('[data-field="rank"]')?.value || "",
      }))
      .filter((row) => !(isCombatSkillList && grantedSkillMap().has(String(row.skill || ""))));
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
    fixed: sanitizeSkillFields(sheetFields),
    combatSkillsExtra: sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 }),
    settingSkills: sanitizeNamedSkillList(repeatables.settingSkills, { maxItems: 50 }),
  };
}

function loadUiFromDoc() {
  const state = getCurrentSkillState();
  renderFixedSkillGrid("defenseSkillGrid", DEFENSE_SKILL_FIELDS, state.fixed);
  renderFixedSkillGrid("coreSkillGrid", CORE_SKILL_FIELDS, state.fixed);
  repeatableLists.combatSkillsExtra?.load(state.combatSkillsExtra);
  repeatableLists.settingSkills?.load(state.settingSkills);
}

function collectSkillPatch() {
  const existingFields = (currentDoc?.builder?.sheet?.fields && typeof currentDoc.builder.sheet.fields === "object")
    ? { ...currentDoc.builder.sheet.fields }
    : {};
  const existingRepeatables = (currentDoc?.builder?.sheet?.repeatables && typeof currentDoc.builder.sheet.repeatables === "object")
    ? { ...currentDoc.builder.sheet.repeatables }
    : {};

  const fixedValues = {};
  for (const { key } of [...DEFENSE_SKILL_FIELDS, ...CORE_SKILL_FIELDS]) {
    const el = document.querySelector(`[name="${key}"]`);
    fixedValues[key] = el ? el.value : "";
  }

  return {
    "builder.sheet.fields": {
      ...existingFields,
      ...sanitizeSkillFields(fixedValues),
    },
    "builder.sheet.repeatables": {
      ...existingRepeatables,
      combatSkillsExtra: sanitizeNamedSkillList(repeatableLists.combatSkillsExtra?.read(), { maxItems: 50 }),
      settingSkills: sanitizeNamedSkillList(repeatableLists.settingSkills?.read(), { maxItems: 50 }),
    },
  };
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = [];
  const fixed = collectSkillPatch()["builder.sheet.fields"];
  const combat = collectSkillPatch()["builder.sheet.repeatables"].combatSkillsExtra || [];
  const setting = collectSkillPatch()["builder.sheet.repeatables"].settingSkills || [];

  if (Object.values(fixed).every((v) => String(v || "").trim() === "")) {
    warnings.push("All fixed skill ranks are blank.");
  }
  if (!combat.length) warnings.push("No Combat & Class Skills are filled in.");
  if (!setting.length) warnings.push("No Setting Skills are filled in.");

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
    const patch = collectSkillPatch();
    await saveCharacterPatch(charRef, patch);

    currentDoc = currentDoc || {};
    currentDoc.builder = currentDoc.builder || {};
    currentDoc.builder.sheet = currentDoc.builder.sheet || {};
    currentDoc.builder.sheet.fields = patch["builder.sheet.fields"];
    currentDoc.builder.sheet.repeatables = patch["builder.sheet.repeatables"];

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
    createRepeatableList({ key: "combatSkillsExtra", containerId: "combatSkillGrid", addBtnId: "addCombatSkillBtn", minRows: MIN_COMBAT_SKILL_ROWS, isCombatSkillList: true });
    createRepeatableList({ key: "settingSkills", containerId: "settingSkillGrid", addBtnId: "addSettingSkillBtn", minRows: MIN_SETTING_SKILL_ROWS });

    ctx = await initBuilderAuth({ whoamiEl, signOutBtn, gmHintEl, statusEl, errorEl });
    gameData = await loadGameXData();
    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    await markStepVisited(charRef, CURRENT_STEP_ID);

    grantedCombatSkills = getGrantedCombatSkills();
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
