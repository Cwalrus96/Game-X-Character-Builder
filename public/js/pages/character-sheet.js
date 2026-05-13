import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { db, storage } from "../core/firebase.js";
import { onAuth, getClaims, signOutNow } from "../core/auth-ui.js";

import { CHARACTER_SCHEMA_VERSION, getPortraitStoragePath } from "../core/database-writer.js";
import {
  ATTR_KEYS,
  labelForAttrKey,
  clampLevel,
  coerceAttrKey,
  DEFENSE_SKILL_FIELDS,
  CORE_SKILL_FIELDS,
  SKILL_RANK_OPTIONS,
  formatSkillRankLabel,
} from "../core/character-rules.js";
import {
  loadGameXClasses,
  loadGameXData,
  loadGameXOrigins,
  getOriginByKey,
  buildTechniqueIndexes,
  resolveTechniqueRef,
  computeKnownCombatSkillsAndGrants,
  computeGrantedSkillsState,
} from "../core/game-data.js";
import {
  computeWeaponSlotCost,
  getEffectiveTags,
  getEnhancementDef,
  getWeaponDef,
  renderTagChipsHtml,
  summarizeWeaponProfilesHtml,
  renderEnhancementDetailHtml,
} from "../core/weapon-utils.js";
import { renderTechniqueProfileHtml } from "../core/technique-utils.js";
import { ensureAppTopNav } from "../core/app-nav.js";
import { renderBuilderNav } from "../builder/builder-nav.js";
import {
  sanitizeCharName,
  sanitizeStoragePath,
  sanitizeText,
  toInt,
  escapeHtml,
  sanitizeSkillFields,
  sanitizeNamedSkillList,
  sanitizeBondList,
  sanitizeWeaponList,
  buildCharacterKeystoneEntries,
} from "../core/data-sanitization.js";

import {
  getAttributeEffectiveCap,
  normalizeAttributes,
  computeSpeed,
  computePhysicalDefense,
  computeMentalDefense,
  computeSpiritDefense,
  computeMaxHP,
} from "../core/character-rules.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

(() => {
  'use strict';

  // This page expects to be opened from the character list.
  const urlParams = new URLSearchParams(window.location.search);
  const charIdParam = urlParams.get('charId');
  const requestedUidParam = urlParams.get('uid');

  if (!charIdParam) {
    window.location.replace('/characters.html');
    return;
  }

  let editingUid = null;           // resolved after auth (may be GM-selected)
  const editingCharId = charIdParam;
  let isGMUser = false;

// ---------- Firebase (Auth + Firestore) ----------
  let currentUser = null;
  let cloudDocRef = null;          // users/<uid>/characters/<charId>
  let cloudReady = false;
  let cloudSaveTimer = null;
  let currentDoc = null;
  const CLOUD_SAVE_DEBOUNCE_MS = 1200;

  function cloudEnabled() {
    return !!(currentUser && cloudDocRef && cloudReady);
  }

  async function flushPendingSheetSave() {
    if (cloudSaveTimer) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = null;
      await saveCloudNow();
    }
    return true;
  }

  function renderSheetBuilderNav(characterDoc) {
    const appNav = ensureAppTopNav({
      mount: document.querySelector('.topbar'),
      active: 'builder',
      requestedUid: requestedUidParam,
      isGM: isGMUser,
      onSignOut: async () => {
        await signOutNow();
        window.location.href = '/login.html';
      },
    });
    if (appNav.signOut) appNav.signOut.style.display = 'inline-flex';

    const mountEl = appNav.builderNavSlot;
    if (!mountEl || !characterDoc) return;
    renderBuilderNav({
      mountEl,
      currentStepId: '',
      characterDoc,
      ctx: {
        charId: editingCharId,
        requestedUid: (isGMUser && requestedUidParam) ? requestedUidParam : null,
      },
      allowAllSteps: true,
      showControls: false,
      ariaLabel: 'Edit this character in the builder',
      onBeforeNavigate: flushPendingSheetSave,
    });
  }

  // ---- Class list (from JSON) ----
  // The editor stores classSelect as the canonical classKey (kebab-case).
  // We populate the dropdown from /data/game-x/classes.json to avoid duplicating class data in HTML/JS.
  let classOptionsPromise = null;

  async function ensureClassSelectOptions() {
    if (classOptionsPromise) return classOptionsPromise;
    classOptionsPromise = (async () => {
      if (!classSelect) return;

      try {
        const list = await loadGameXClasses();
        if (!Array.isArray(list)) return;

        const pending = sanitizeText(classSelect.dataset.pendingValue || classSelect.value || '', { maxLen: 64 });

        // Rebuild options
        classSelect.innerHTML = '';
        const naOpt = document.createElement('option');
        naOpt.value = '';
        naOpt.textContent = 'N/A / Other';
        classSelect.appendChild(naOpt);

        for (const it of list) {
          const key = sanitizeText(it?.classKey, { maxLen: 64 });
          const name = String(it?.name || '').trim();
          if (!key || !name) continue;
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = name;
          classSelect.appendChild(opt);
        }

        if (pending) {
          classSelect.value = pending;
          // If the key isn't in the list, keep it visible so we don't silently drop data.
          if (classSelect.value !== pending) {
            const opt = document.createElement('option');
            opt.value = pending;
            opt.textContent = pending;
            classSelect.appendChild(opt);
            classSelect.value = pending;
          }
        }

        delete classSelect.dataset.pendingValue;
        syncReadOnlyDisplays();
      } catch (e) {
        console.warn('Failed to populate class list:', e);
      }
    })();

    return classOptionsPromise;
  }

  const CANONICAL_FIELD_NAMES = new Set([
    'charName',
    'classSelect',
    'primaryAttribute',
    'level',
    // attributes
    ...ATTR_KEYS,
  ]);

  // Derived values (computed for display; not stored in sheet fields)
  const DERIVED_FIELD_NAMES = new Set([
    'hpmax',
    'speed',
    'physdef',
    'mentdef',
    'spiritdef',
  ]);
  const TEMPORARY_SHEET_FIELD_NAMES = new Set([
    'hpcur',
    'strain',
    'overstrained',
    'notes',
  ]);
  const TEMPORARY_SHEET_REPEATABLE_KEYS = new Set([
    'conditions',
  ]);


  const READ_ONLY_SKILL_FIELD_KEYS = [...DEFENSE_SKILL_FIELDS, ...CORE_SKILL_FIELDS].map(({ key }) => key);
  const READ_ONLY_CORE_FIELD_BY_LABEL = new Map(CORE_SKILL_FIELDS.map(({ key, label }) => [String(label), String(key)]));
  const READ_ONLY_SKILL_LABELS = new Map(SKILL_RANK_OPTIONS.map(({ value, label }) => [String(value), String(label)]));
  const READ_ONLY_SKILL_MIN_ROWS = {
    combatSkillsExtra: 2,
    settingSkills: 5,
  };

  let readOnlySkillFields = sanitizeSkillFields({}, { allowedKeys: READ_ONLY_SKILL_FIELD_KEYS });
  let readOnlySkillRepeatables = {
    combatSkillsExtra: [],
    settingSkills: [],
  };

  function escapeAttr(value) {
    return escapeHtml(String(value ?? '')).replaceAll('"', '&quot;');
  }

  function skillRankLabel(value) {
    return READ_ONLY_SKILL_LABELS.get(String(value ?? '')) || '';
  }

  function renderReadOnlyFixedSkillGrid(containerId, items, values) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = (Array.isArray(items) ? items : [])
      .map(({ key, label }) => `
        <div class="skill-chip skill-chip-static">
          <span class="skill-chip-label">${escapeHtml(label)}</span>
          <span class="skill-chip-value">${escapeHtml(skillRankLabel(values?.[key] ?? '')) || '&mdash;'}</span>
        </div>
      `)
      .join('');
  }

  function renderReadOnlyNamedSkillGrid(containerId, items, { minRows = 0 } = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rows = Array.isArray(items) ? items.slice() : [];
    while (rows.length < minRows) rows.push({ skill: '', rank: '' });

    container.innerHTML = rows
      .map((item) => `
        <div class="skill-chip skill-chip-static">
          <span class="skill-chip-label">${escapeHtml(String(item?.skill || '')) || '&mdash;'}</span>
          <span class="skill-chip-value">${escapeHtml(skillRankLabel(item?.rank ?? '')) || '&mdash;'}</span>
        </div>
      `)
      .join('');
  }

  function normalizeGrantedClassUtilitySkills(value) {
    return (Array.isArray(value) ? value : [])
      .map((name) => sanitizeText(name, { maxLen: 96, collapse: true }))
      .filter(Boolean);
  }

  function mergeGrantedClassUtilitySkillsIntoReadOnlyState({
    fields = {},
    repeatables = {},
    selectedClassUtilitySkills = [],
    grantedFixedRanks = {},
    grantedCombatSkills = [],
  } = {}) {
    const mergedFields = sanitizeSkillFields(fields, { allowedKeys: READ_ONLY_SKILL_FIELD_KEYS });
    const combatSkillsExtra = sanitizeNamedSkillList(repeatables?.combatSkillsExtra, { maxItems: 50 });
    const settingSkills = sanitizeNamedSkillList(repeatables?.settingSkills, { maxItems: 50 });

    for (const [fieldKey, rawRank] of Object.entries((grantedFixedRanks && typeof grantedFixedRanks === 'object') ? grantedFixedRanks : {})) {
      if (!READ_ONLY_SKILL_FIELD_KEYS.includes(fieldKey)) continue;
      const nextRank = sanitizeText(rawRank, { maxLen: 8, collapse: true });
      if (!nextRank) continue;

      const prev = Number.parseInt(String(mergedFields[fieldKey] || ''), 10);
      const next = Number.parseInt(String(nextRank), 10);
      if (!Number.isFinite(prev) || (Number.isFinite(next) && next > prev)) {
        mergedFields[fieldKey] = nextRank;
      }
    }

    const combatSeen = new Map();
    for (const row of combatSkillsExtra) {
      const skillName = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
      if (!skillName) continue;
      combatSeen.set(skillName.toLowerCase(), row);
    }

    for (const entry of (Array.isArray(grantedCombatSkills) ? grantedCombatSkills : [])) {
      const skillName = sanitizeText(entry?.skill, { maxLen: 96, collapse: true });
      const rank = sanitizeText(entry?.rank, { maxLen: 8, collapse: true });
      if (!skillName) continue;

      const key = skillName.toLowerCase();
      const existing = combatSeen.get(key);
      if (!existing) {
        const row = { skill: skillName, rank };
        combatSkillsExtra.unshift(row);
        combatSeen.set(key, row);
        continue;
      }

      const prev = Number.parseInt(String(existing.rank || ''), 10);
      const next = Number.parseInt(String(rank || ''), 10);
      if (!Number.isFinite(prev) || (Number.isFinite(next) && next > prev)) {
        existing.rank = rank;
      }
    }

    const grantedUtilitySkills = normalizeGrantedClassUtilitySkills(selectedClassUtilitySkills);
    const settingSeen = new Set(settingSkills.map((row) => sanitizeText(row?.skill, { maxLen: 96, collapse: true }).toLowerCase()).filter(Boolean));

    for (const skillName of grantedUtilitySkills) {
      const coreFieldKey = READ_ONLY_CORE_FIELD_BY_LABEL.get(skillName);
      if (coreFieldKey) {
        mergedFields[coreFieldKey] = '1';
        continue;
      }

      const dedupeKey = skillName.toLowerCase();
      if (settingSeen.has(dedupeKey)) continue;
      settingSeen.add(dedupeKey);
      settingSkills.unshift({ skill: skillName, rank: '1' });
    }

    return {
      fields: mergedFields,
      repeatables: {
        combatSkillsExtra,
        settingSkills,
      },
    };
  }

  function applyReadOnlySkillState({
    fields = {},
    repeatables = {},
    selectedClassUtilitySkills = [],
    grantedFixedRanks = {},
    grantedCombatSkills = [],
  } = {}) {
    const merged = mergeGrantedClassUtilitySkillsIntoReadOnlyState({
      fields,
      repeatables,
      selectedClassUtilitySkills,
      grantedFixedRanks,
      grantedCombatSkills,
    });

    readOnlySkillFields = merged.fields;
    readOnlySkillRepeatables = merged.repeatables;

    renderReadOnlyFixedSkillGrid('defenseSkillGrid', DEFENSE_SKILL_FIELDS, readOnlySkillFields);
    renderReadOnlyFixedSkillGrid('coreSkillGrid', CORE_SKILL_FIELDS, readOnlySkillFields);
    renderReadOnlyNamedSkillGrid('combatSkillGrid', readOnlySkillRepeatables.combatSkillsExtra, { minRows: READ_ONLY_SKILL_MIN_ROWS.combatSkillsExtra });
    renderReadOnlyNamedSkillGrid('settingSkillGrid', readOnlySkillRepeatables.settingSkills, { minRows: READ_ONLY_SKILL_MIN_ROWS.settingSkills });
  }

  function buildCanonicalFromForm(fields) {
    const name = sanitizeCharName(fields?.charName || '');
    const level = clampLevel(fields?.level ?? 1);
    const primaryAttribute = coerceAttrKey(fields?.primaryAttribute);
    const classKey = sanitizeText(fields?.classSelect, { maxLen: 64 });

    // Store EFFECTIVE (final) attribute values in builder.attributes
    const attrs = normalizeAttributes(fields || {});
    for (const k of ATTR_KEYS) {
      const cap = getAttributeEffectiveCap(level, k, primaryAttribute);
      const min = primaryAttribute && k === primaryAttribute ? 1 : 0;
      attrs[k] = toInt(attrs[k], { min, max: cap });
    }

    return { name, level, primaryAttribute, classKey, attributes: attrs };
  }

  function pickSheetOnlyFields(allFields) {
    const out = {};
    const src = (allFields && typeof allFields === 'object') ? allFields : {};
    for (const [k, v] of Object.entries(src)) {
      if (CANONICAL_FIELD_NAMES.has(k)) continue;
      if (DERIVED_FIELD_NAMES.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  function pickTemporarySheetFields(allFields) {
    const out = {};
    const src = (allFields && typeof allFields === 'object') ? allFields : {};
    for (const [k, v] of Object.entries(src)) {
      if (!TEMPORARY_SHEET_FIELD_NAMES.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  function pickTemporarySheetRepeatables(repeatables) {
    const out = {};
    const src = (repeatables && typeof repeatables === 'object') ? repeatables : {};
    for (const key of TEMPORARY_SHEET_REPEATABLE_KEYS) {
      if (key in src) out[key] = src[key];
    }
    return out;
  }

  function buildMergedSheetStateForSave({ allFields = {}, repeatables = {} } = {}) {
    const existingSheet = (currentDoc?.builder?.sheet && typeof currentDoc.builder.sheet === 'object') ? currentDoc.builder.sheet : {};
    const existingFields = (existingSheet.fields && typeof existingSheet.fields === 'object') ? existingSheet.fields : {};
    const existingRepeatables = (existingSheet.repeatables && typeof existingSheet.repeatables === 'object') ? existingSheet.repeatables : {};

    return {
      fields: {
        ...existingFields,
        ...pickTemporarySheetFields(allFields),
        ...readOnlySkillFields,
      },
      repeatables: {
        ...existingRepeatables,
        ...pickTemporarySheetRepeatables(repeatables),
        combatSkillsExtra: readOnlySkillRepeatables.combatSkillsExtra,
        settingSkills: readOnlySkillRepeatables.settingSkills,
      },
    };
  }

  // ---- Derived display (from character-schema.js) ----

  let derivedSeq = 0;

  function setNumberFieldByName(name, n) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    const val = Number.isFinite(n) ? String(Math.round(n)) : '';
    if (el.value !== val) el.value = val;
    syncReadOnlyFieldDisplay(el);
  }

  function accountDisplayName(user) {
    if (!user) return '';
    const displayName = sanitizeText(user.displayName || '', { maxLen: 120, collapse: true });
    if (displayName) return displayName;
    const email = sanitizeText(user.email || '', { maxLen: 160, collapse: true });
    if (!email) return '';
    return email.includes('@') ? email.split('@')[0] : email;
  }

  function displayTextForField(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const selected = el.options?.[el.selectedIndex];
      return sanitizeText(selected?.textContent || el.value || '', { maxLen: 160, collapse: true });
    }
    if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
    return sanitizeText(el.value || '', { maxLen: 400, collapse: true });
  }

  function ensureReadOnlyFieldDisplay(el) {
    if (!el || !el.name) return null;
    const field = el.closest('.identity-field, .attribute-item, td') || el.parentElement;
    if (!field) return null;
    let display = field.querySelector(`[data-readonly-display-for="${CSS.escape(el.name)}"]`);
    if (!display) {
      display = document.createElement('div');
      display.className = 'readonly-value sheet-readonly-value empty';
      display.dataset.readonlyDisplayFor = el.name;
      el.insertAdjacentElement('afterend', display);
    }
    return display;
  }

  function syncReadOnlyFieldDisplay(el) {
    if (!el || !el.name || !el.dataset.readonlyBacked) return;
    const display = ensureReadOnlyFieldDisplay(el);
    if (!display) return;
    const text = displayTextForField(el);
    display.textContent = text || '-';
    display.classList.toggle('empty', !text);
  }

  function syncReadOnlyDisplays() {
    document.querySelectorAll('[data-readonly-backed="true"]').forEach((el) => syncReadOnlyFieldDisplay(el));
  }

  async function updateDerivedDisplay(fieldsOverride = null) {
    const seq = ++derivedSeq;

    const allFields = fieldsOverride || collectFields();
    const canon = buildCanonicalFromForm(allFields);

    try {
      const speed = computeSpeed(canon.attributes);
const physdef = computePhysicalDefense({ attributes: canon.attributes, trainingRank: readOnlySkillFields.rank_physdef });
const mentdef = computeMentalDefense({ attributes: canon.attributes, trainingRank: readOnlySkillFields.rank_mentdef });
const spiritdef = computeSpiritDefense({ attributes: canon.attributes, trainingRank: readOnlySkillFields.rank_spiritdef });

setNumberFieldByName('speed', speed);
setNumberFieldByName('physdef', physdef);
setNumberFieldByName('mentdef', mentdef);
setNumberFieldByName('spiritdef', spiritdef);

const hpmax = await computeMaxHP({ level: canon.level, classKey: canon.classKey, attributes: canon.attributes });

if (seq !== derivedSeq) return; // stale

setNumberFieldByName('hpmax', hpmax);
} catch (e) {
      // Best-effort UI update; don't break the sheet.
      if (seq !== derivedSeq) return;
      console.warn('Derived field update failed:', e);
    }
  }

  // ---- Techniques from Builder (read-only display) ----

  let _gameXDataForTechniques = null;
  let _techniqueIndexes = null;

  async function ensureTechniqueData() {
    if (!_gameXDataForTechniques) {
      _gameXDataForTechniques = await loadGameXData({ cache: "no-store" });
    }
    if (!_techniqueIndexes) {
      _techniqueIndexes = buildTechniqueIndexes(_gameXDataForTechniques?.techniques);
    }
    return { gameData: _gameXDataForTechniques, indexes: _techniqueIndexes };
  }
async function renderBuilderTechniquesReadOnly(builder) {
  try {
    const mount = document.getElementById("selectedTechniquesFromBuilder");
    if (!mount) return;

    const b = builder && typeof builder === "object" ? builder : {};
    const selectedRefs = Array.isArray(b.selectedTechniques) ? b.selectedTechniques : [];

    const { gameData, indexes } = await ensureTechniqueData();
    const knownAndGrants = computeKnownCombatSkillsAndGrants(gameData, b) || {};
    const grants = knownAndGrants.grantedTechniqueNames || new Set();
    const knownCombatSkills = knownAndGrants.knownCombatSkills || new Set();
    const grantedSkillState = computeGrantedSkillsState(gameData, b);
    const repeatables = (b?.sheet?.repeatables && typeof b.sheet.repeatables === "object") ? b.sheet.repeatables : {};
    const extraCombatSkills = sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 });

    function getTechniqueSkillRank(technique) {
      const skillName = sanitizeText(technique?.skill, { maxLen: 96, collapse: true });
      if (!skillName) return Number(technique?.rank || 0);

      let rank = 0;
      const grantedCombat = Array.isArray(grantedSkillState?.grantedCombatSkills) ? grantedSkillState.grantedCombatSkills : [];
      for (const row of grantedCombat) {
        const skill = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
        if (skill !== skillName) continue;
        const value = Number.parseInt(String(row?.rank || "0"), 10);
        if (Number.isFinite(value)) rank = Math.max(rank, value);
      }

      for (const row of extraCombatSkills) {
        const skill = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
        if (skill !== skillName) continue;
        const value = Number.parseInt(String(row?.rank || "0"), 10);
        if (Number.isFinite(value)) rank = Math.max(rank, value);
      }

      return rank;
    }

    const origin = new Map();
    for (const ref of Array.from(grants)) origin.set(String(ref), 'Granted');
    for (const ref of selectedRefs) if (!origin.has(String(ref))) origin.set(String(ref), 'Selected');
    const rankZeroBasics = Array.isArray(gameData?.techniques)
      ? gameData.techniques.filter((tech) => {
          const name = String(tech?.techniqueName || "").trim();
          const skill = String(tech?.skill || "").trim();
          const rank = Number.parseInt(String(tech?.rank ?? 0), 10);
          if (!name || !skill || rank !== 0) return false;
          return knownCombatSkills.has(skill);
        })
      : [];
    for (const tech of rankZeroBasics) {
      const name = String(tech?.techniqueName || "").trim();
      if (name && !origin.has(name)) origin.set(name, 'Basic');
    }

    const items = [];
    for (const [ref, source] of origin.entries()) {
      const res = resolveTechniqueRef(ref, indexes);
      if (!res?.ok || !res.technique) continue;
      items.push({ source, tech: res.technique });
    }

    if (!items.length) {
      mount.innerHTML = '';
      return;
    }

    items.sort((a, b) => {
      const rankA = Number.parseInt(String(a.tech?.rank ?? 0), 10) || 0;
      const rankB = Number.parseInt(String(b.tech?.rank ?? 0), 10) || 0;
      if (rankA !== rankB) return rankA - rankB;
      return String(a.tech?.techniqueName || '').localeCompare(String(b.tech?.techniqueName || ''));
    });

    function renderTechniqueCard({ source, tech }) {
      return `
        <article class="ability-card technique-card technique-card-readonly">
          <div class="ability-card-head">
            <div style="flex:1; min-width:0;">${renderTechniqueProfileHtml(tech, { rankValue: getTechniqueSkillRank(tech), heading: String(tech?.techniqueName || 'Technique'), headingTag: 'div', headingClass: 'ability-name technique-title-static', showRank: true })}</div>
            <span class="technique-source-badge">${escapeHtml(source)}</span>
          </div>
        </article>
      `;
    }

    const basics = items.filter(({ tech }) => (Number.parseInt(String(tech?.rank ?? 0), 10) || 0) === 0);
    const ranked = items.filter(({ tech }) => (Number.parseInt(String(tech?.rank ?? 0), 10) || 0) > 0);

    mount.className = '';
    const sections = [];
    if (ranked.length) {
      sections.push(`<div class="cards">${ranked.map(renderTechniqueCard).join('')}</div>`);
    }
    if (basics.length) {
      sections.push(`
        <details style="margin-top:${ranked.length ? '12px' : '0'};">
          <summary style="cursor:pointer; font-weight:700; margin-bottom:8px;">Rank 0 Basics (${basics.length})</summary>
          <div class="cards" style="margin-top:8px;">${basics.map(renderTechniqueCard).join('')}</div>
        </details>
      `);
    }
    mount.innerHTML = sections.join('');
  } catch (e) {
    console.warn('renderBuilderTechniquesReadOnly failed', e);
  }
}


async function renderBuilderWeaponsReadOnly(builder) {
  try {
    const mount = document.getElementById("builderWeaponsCards");
    if (!mount) return;

    const b = builder && typeof builder === "object" ? builder : {};
    const weapons = sanitizeWeaponList(b.weapons, { maxItems: 20 });
    if (!weapons.length) {
      mount.innerHTML = '<article class="ability-card"><div class="muted">—</div></article>';
      return;
    }

    const { gameData } = await ensureTechniqueData();
    const weaponBases = Array.isArray(gameData?.weaponBases) ? gameData.weaponBases : [];
    const weaponEnhancements = Array.isArray(gameData?.weaponEnhancements) ? gameData.weaponEnhancements : [];

    mount.innerHTML = weapons.map((weapon, index) => {
      const weaponDef = getWeaponDef(weaponBases, weapon.weaponKey);
      const displayName = sanitizeText(weapon.customName || weaponDef?.name || weapon.weaponKey || `Weapon ${index + 1}`, { maxLen: 160, collapse: true });
      const baseName = sanitizeText(weaponDef?.name || weapon.weaponKey || "", { maxLen: 160, collapse: true });
      const tags = getEffectiveTags(weapon, weaponBases);
      const slotCost = computeWeaponSlotCost(weapon, weaponBases);
      const profilesHtml = weaponDef
        ? summarizeWeaponProfilesHtml(weaponDef, weapon.rank).replace(/equipmentMetaList/g, 'weapon-profile-list')
        : '<div class="muted">Unknown weapon base.</div>';
      const enhancements = Array.isArray(weapon.enhancements) ? weapon.enhancements : [];
      const enhancementsHtml = enhancements.length
        ? `<div class="weapon-card-subsection"><strong>Enhancements:</strong><div class="enhancement-detail-list">${enhancements.map((enh) => {
            const def = getEnhancementDef(weaponEnhancements, enh.enhancementKey);
            return renderEnhancementDetailHtml(def, enh, { collapsible: true });
          }).join('')}</div></div>`
        : '';

      return `
        <article class="ability-card technique-card-readonly">
          <div class="ability-card-head">
            <div>
              <div class="technique-title-static">${escapeHtml(displayName)}</div>
              <div class="weapon-card-meta">${baseName ? `${escapeHtml(baseName)} • ` : ''}Rank ${Number(weapon.rank || 0)} • Slots ${slotCost}</div>
            </div>
          </div>
          <div class="weapon-tag-row">${renderTagChipsHtml(tags, 'weapon-tag-chip')}</div>
          ${enhancementsHtml}
          <div class="weapon-card-subsection">${profilesHtml}</div>
        </article>`;
    }).join('');
  } catch (e) {
    console.warn('renderBuilderWeaponsReadOnly failed', e);
  }
}

  let _originsPromise = null;

  async function renderOriginReadOnly({ originKey, originKeystone } = {}) {
    const originEl = document.getElementById('originValue');
    if (!originEl) return;

    try {
      if (!_originsPromise) _originsPromise = loadGameXOrigins({ cache: 'no-store' });
      const origins = await _originsPromise;
      const origin = getOriginByKey(origins, originKey);
      originEl.textContent = origin?.name || '—';
      originEl.classList.toggle('empty', !origin);
    } catch (e) {
      console.warn('renderOriginReadOnly failed:', e);
      originEl.textContent = '—';
      originEl.classList.add('empty');
    }
  }

  function renderBondsReadOnly(bonds) {
    const mount = document.getElementById('bondCards');
    if (!mount) return;

    const items = sanitizeBondList(bonds, { maxItems: 50 });
    if (!items.length) {
      mount.innerHTML = '<article class="ability-card"><div class="muted">—</div></article>';
      return;
    }

    mount.innerHTML = items.map((bond, index) => {
      const name = sanitizeText(bond?.name || '', { maxLen: 96, collapse: true }) || `Bond ${index + 1}`;
      const rankLabel = formatSkillRankLabel(bond?.rank) || '—';
      const keystone = sanitizeText(bond?.keystone || '', { maxLen: 400, collapse: true });
      return `
        <article class="ability-card technique-card-readonly">
          <div class="ability-card-head">
            <div class="technique-title-static">${escapeHtml(name)}</div>
          </div>
          <div class="cards">
            <div><strong>Rank:</strong> ${escapeHtml(rankLabel)}</div>
            <div><strong>Bond Keystone:</strong> ${keystone ? escapeHtml(keystone) : '&mdash;'}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderKeystonesReadOnly(builder) {
    const mount = document.getElementById('keystoneCards');
    if (!mount) return;

    const items = buildCharacterKeystoneEntries(builder).filter((entry) => entry.source !== 'bond');
    if (!items.length) {
      mount.innerHTML = '<article class="ability-card"><div class="muted">—</div></article>';
      return;
    }

    mount.innerHTML = items.map((entry) => `
      <article class="ability-card technique-card-readonly">
        <div class="ability-card-head">
          <div class="technique-title-static">${escapeHtml(entry.title || 'Keystone')}</div>
          <span class="technique-source-badge">${escapeHtml(entry.source || 'keystone')}</span>
        </div>
        <div class="technique-text-static">${entry.text ? escapeHtml(entry.text) : '&mdash;'}</div>
      </article>
    `).join('');
  }

  async function resolvePortraitUrl(path) {
    const p = sanitizeStoragePath(path);
    if (!p) return '';
    try {
      const r = storageRef(storage, p);
      return await getDownloadURL(r);
    } catch (e) {
      console.warn('getDownloadURL failed:', e);
      return '';
    }
  }

  async function loadCloudOrInit() {
    if (!cloudDocRef) return;

    try {
      const snap = await getDoc(cloudDocRef);
      if (snap.exists()) {
        const raw = snap.data() || {};
        currentDoc = raw;

        // Canonical read path (no legacy backfill):
        const b = (raw?.builder && typeof raw.builder === 'object') ? raw.builder : {};
        const name = sanitizeCharName(b?.name || '');
        const portraitPath = sanitizeStoragePath(b?.portraitPath || '');
        const level = clampLevel(b?.level ?? 1);
        const primaryAttribute = coerceAttrKey(b?.primaryAttribute);
        const classKey = sanitizeText(b?.classKey, { maxLen: 64 });
        const originKey = sanitizeText(b?.originKey || '', { maxLen: 64, collapse: true });
        const originKeystone = sanitizeText(b?.originKeystone || '', { maxLen: 400, collapse: true });
        const bonds = sanitizeBondList(b?.bonds, { maxItems: 50 });

        const attrs = normalizeAttributes(b?.attributes || {});
        for (const k of ATTR_KEYS) {
          const cap = getAttributeEffectiveCap(level, k, primaryAttribute);
          const min = primaryAttribute && k === primaryAttribute ? 1 : 0;
          attrs[k] = toInt(attrs[k], { min, max: cap });
        }

        const sheetFields = (b?.sheet?.fields && typeof b.sheet.fields === 'object') ? b.sheet.fields : {};
        const sheetOnlyFields = pickSheetOnlyFields(sheetFields);
        const repeatables = (b?.sheet?.repeatables && typeof b.sheet.repeatables === 'object') ? b.sheet.repeatables : {};
        const selectedClassUtilitySkills = Array.isArray(b?.selectedClassUtilitySkills) ? b.selectedClassUtilitySkills : [];
        const computedGrantedSkills = computeGrantedSkillsState(await loadGameXData(), b);
        applyReadOnlySkillState({
          fields: sheetFields,
          repeatables,
          selectedClassUtilitySkills,
          grantedFixedRanks: computedGrantedSkills?.fixedRanks,
          grantedCombatSkills: computedGrantedSkills?.grantedCombatSkills,
        });
        const selectedTechniques = Array.isArray(b?.selectedTechniques) ? b.selectedTechniques : [];
        lockedAbilityNames = new Set(Array.isArray(b?.autoAbilityNames) ? b.autoAbilityNames.map((name) => String(name || '').trim()).filter(Boolean) : []);

        // Build a local/editor state (no duplicated canonical fields inside sheet fields).
        const state = {
          version: 3,
          savedAt: Date.now(),
          canonical: {
            name,
            level,
            primaryAttribute,
            classKey,
            attributes: attrs,
          },
          portrait: {
            path: portraitPath,
            previewDataUrl: '',
          },
          fields: sheetOnlyFields,
          repeatables,
        };

        applyState(state);
        renderOriginReadOnly({ originKey, originKeystone });
        renderBondsReadOnly(bonds);
        renderKeystonesReadOnly(b);
        // Render Builder-selected techniques (read-only).
        renderBuilderTechniquesReadOnly(b);
        renderBuilderWeaponsReadOnly(b);
        renderSheetBuilderNav(raw);
        if (portraitApi && portraitPath) {
          const url = await resolvePortraitUrl(portraitPath);
          portraitApi.set({ path: portraitPath, previewUrl: url });
        }

        cloudReady = true;
        return;
      }

      // No cloud doc yet → initialize from current sheet (local/default state)
      lockedAbilityNames = new Set();
      const allFields = collectFields();
      const canon = buildCanonicalFromForm(allFields);
      const state = collectState();
      const mergedSheetState = buildMergedSheetStateForSave({ allFields, repeatables: state?.repeatables || {} });

      renderOriginReadOnly({ originKey: '', originKeystone: '' });
      renderBondsReadOnly([]);
      renderKeystonesReadOnly({});
      renderBuilderWeaponsReadOnly({ weapons: [] });

      const baseline = {
        schemaVersion: CHARACTER_SCHEMA_VERSION,
        ownerUid: editingUid,
        builder: {
          name: sanitizeCharName(canon?.name || 'Character'),
          portraitPath: sanitizeStoragePath(state?.portrait?.path || ''),
          level: clampLevel(canon?.level ?? 1),
          attributes: normalizeAttributes(canon?.attributes || {}),
          classKey: sanitizeText(canon?.classKey || '', { maxLen: 64 }),
          primaryAttribute: coerceAttrKey(canon?.primaryAttribute),
          weapons: sanitizeWeaponList(currentDoc?.builder?.weapons, { maxItems: 20 }),
          // Temporary character-sheet state lives under builder.sheet.*
          sheet: {
            fields: mergedSheetState.fields,
            repeatables: mergedSheetState.repeatables,
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(cloudDocRef, baseline, { merge: true });
      currentDoc = baseline;

      renderBuilderTechniquesReadOnly((baseline && baseline.builder) ? baseline.builder : {});
      renderBuilderWeaponsReadOnly((baseline && baseline.builder) ? baseline.builder : {});
      renderSheetBuilderNav(baseline);

      cloudReady = true;
    } catch (e) {
      console.error('loadCloudOrInit error:', e);
      cloudReady = false;
    }
  }

  async function saveCloudNow() {
    if (!cloudEnabled()) return;

    try {

      const allFields = collectFields();
      const canon = buildCanonicalFromForm(allFields);
      const state = collectState();
      const mergedSheetState = buildMergedSheetStateForSave({ allFields, repeatables: state?.repeatables || {} });
      const existingBuilder = (currentDoc?.builder && typeof currentDoc.builder === 'object') ? currentDoc.builder : {};

      // Portrait upload (Cloud Storage).
      let portraitPath = sanitizeStoragePath(existingBuilder?.portraitPath || state?.portrait?.path || '');
      const pendingDelete = portraitApi?.consumePendingDelete ? portraitApi.consumePendingDelete() : '';
      const pending = portraitApi?.consumePendingUpload ? portraitApi.consumePendingUpload() : null;
      if (pending && pending.blob) {
        // Use a stable path so edits overwrite instead of creating junk.
        const storagePath = getPortraitStoragePath({ uid: editingUid, charId: editingCharId });
        if (!storagePath) throw new Error('Invalid portrait storage path');

        // If there was an older portrait at a different path, delete it to avoid junk.
        if (pendingDelete && pendingDelete !== storagePath) {
          try {
            await deleteObject(storageRef(storage, pendingDelete));
          } catch (e) {
            // ignore (missing object, perms, etc.)
          }
        }

        await uploadBytes(storageRef(storage, storagePath), pending.blob, { contentType: 'image/jpeg' });
        portraitPath = storagePath;
        if (portraitApi?.set) {
          const url = await resolvePortraitUrl(storagePath);
          portraitApi.set({ path: storagePath, previewUrl: url });
        }
      } else if (pendingDelete) {
        // Portrait cleared: delete the old object (best effort).
        try {
          await deleteObject(storageRef(storage, pendingDelete));
        } catch (e) {
          // ignore
        }
      }

      const cloudDoc = {
        schemaVersion: CHARACTER_SCHEMA_VERSION,
        ownerUid: editingUid,
        builder: {
          name: sanitizeCharName(existingBuilder?.name || canon?.name || 'Character'),
          portraitPath: portraitPath,
          level: clampLevel(existingBuilder?.level ?? canon?.level ?? 1),
          attributes: normalizeAttributes(existingBuilder?.attributes || canon?.attributes || {}),
          classKey: sanitizeText(existingBuilder?.classKey || canon?.classKey || '', { maxLen: 64 }),
          primaryAttribute: coerceAttrKey(existingBuilder?.primaryAttribute ?? canon?.primaryAttribute),
          weapons: sanitizeWeaponList(existingBuilder?.weapons, { maxItems: 20 }),
          sheet: {
            fields: mergedSheetState.fields,
            repeatables: mergedSheetState.repeatables,
          },
        },
        updatedAt: serverTimestamp(),
      };

      await setDoc(cloudDocRef, cloudDoc, { merge: true });

      currentDoc = currentDoc || {};
      currentDoc.builder = {
        ...(currentDoc.builder || {}),
        ...(cloudDoc.builder || {}),
      };

    } catch (e) {
      console.error('saveCloudNow error:', e);
    }
  }

  async function initAuth() {
    onAuth(async (user) => {
      currentUser = user;
      cloudDocRef = null;
      cloudReady = false;

      if (!user) {
        // Require auth for editing (D&D Beyond-style flow)
        const next = encodeURIComponent(window.location.href);
        window.location.href = `/login.html?next=${next}`;
        return;
      }

      // Read custom claims (GM) and resolve which user's character doc we are editing.
      try {
        const claims = await getClaims(user, { forceRefresh: true });
        isGMUser = !!claims.gm;
      } catch (e) {
        isGMUser = false;
      }

      editingUid = (isGMUser && requestedUidParam) ? requestedUidParam : user.uid;
      cloudDocRef = doc(db, 'users', editingUid, 'characters', editingCharId);

      const appNav = ensureAppTopNav({
        mount: document.querySelector('.topbar'),
        active: 'builder',
        requestedUid: requestedUidParam,
        isGM: isGMUser,
        onSignOut: async () => {
          await signOutNow();
          window.location.href = '/login.html';
        },
      });
      if (appNav.signOut) appNav.signOut.style.display = 'inline-flex';

      await loadCloudOrInit();
    });
  }

  const sheetEl = document.getElementById('sheet');
  const classSelect = document.getElementById('classSelect');

  // Placeholder; initialized after scheduleSave is defined
  let portraitApi = { get: () => '', set: () => {} };
  let lockedAbilityNames = new Set();

  function setTheme(classKey) {
    const key = sanitizeText(classKey, { maxLen: 64 });
    document.body.setAttribute('data-theme', key || 'na');
  }

  // ---------- Portrait module ----------

  function initPortrait(scheduleSave, { canEdit = true } = {}) {
    const box = document.querySelector('.portrait-box');
    const imgEl = document.getElementById('portraitPreview');
    const placeholderEl = document.getElementById('portraitPlaceholder');
    const clearBtn = document.getElementById('portraitClear');
    const input = document.getElementById('portraitUpload');

    let portraitPath = '';
    let previewUrl = '';
    let previewDataUrl = '';

    /** @type {{blob: Blob}|null} */
    let pendingUpload = null;
    /** @type {string} */
    let pendingDeletePath = '';

    function render() {
      const src = previewUrl || previewDataUrl || '';
      if (imgEl) {
        imgEl.src = src;
        imgEl.style.display = src ? 'block' : 'none';
      }
      if (placeholderEl) placeholderEl.style.display = src ? 'none' : 'block';
      if (clearBtn) clearBtn.style.display = (canEdit && src) ? 'flex' : 'none';
    }

    function set(next = {}) {
      if (next && typeof next === 'object') {
        if (typeof next.path === 'string') portraitPath = sanitizeStoragePath(next.path);
        if (typeof next.previewUrl === 'string') previewUrl = String(next.previewUrl || '');
        if (typeof next.previewDataUrl === 'string') previewDataUrl = String(next.previewDataUrl || '');
        // If we receive a cloud URL, prefer it over local preview data.
        if (previewUrl) previewDataUrl = '';
      }
      render();
    }

    function getState() {
      return {
        path: portraitPath,
        previewUrl,
        previewDataUrl,
      };
    }

    function consumePendingUpload() {
      const p = pendingUpload;
      pendingUpload = null;
      return p;
    }

    function consumePendingDelete() {
      const p = pendingDeletePath;
      pendingDeletePath = '';
      return sanitizeStoragePath(p);
    }

    function clear(opts = {}) {
      // Mark existing storage object for deletion on next cloud save.
      if (portraitPath) pendingDeletePath = portraitPath;
      portraitPath = '';
      previewUrl = '';
      previewDataUrl = '';
      pendingUpload = null;
      if (input) input.value = '';
      render();
      if (!opts || !opts.silent) scheduleSave();
    }

    async function fileToDataUrl(file) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
    }

    async function canvasToJpegBlob(canvas, quality = 0.85) {
      return await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async function handleFile(file) {
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        if (input) input.value = '';
        return;
      }

      // Downscale + center-crop to 512x512 (small + predictable).
      const dataUrl = await fileToDataUrl(file);

      const img = new Image();
      img.onload = async () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          previewDataUrl = dataUrl;
          pendingUpload = { blob: file };
          previewUrl = '';
          render();
          scheduleSave();
          return;
        }

        // White background (so transparent PNGs do not print oddly)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

        let outPreview = dataUrl;
        try {
          outPreview = canvas.toDataURL('image/jpeg', 0.85);
        } catch (e) {
          // keep dataUrl
        }

        const blob = (await canvasToJpegBlob(canvas, 0.85)) || file;

        previewDataUrl = outPreview;
        previewUrl = '';
        pendingUpload = { blob };
        render();
        scheduleSave();
      };
      img.onerror = () => {
        // fallback
        previewDataUrl = dataUrl;
        previewUrl = '';
        pendingUpload = { blob: file };
        render();
        scheduleSave();
      };
      img.src = dataUrl;
    }

    if (box && input && canEdit) {
      box.addEventListener('click', (e) => {
        // Ignore clicks on the clear button
        if (e && e.target && (e.target === clearBtn)) return;
        input.click();
      });
      box.addEventListener('keydown', (e) => {
        if (!e) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
    }

    if (input) {
      input.disabled = !canEdit;
      input.addEventListener('change', () => {
        if (!canEdit) return;
        const file = input.files && input.files[0];
        if (!file) return;
        handleFile(file);
      });
    }

    if (clearBtn) {
      clearBtn.disabled = !canEdit;
      clearBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        if (!canEdit) return;
        clear();
      });
    }

    if (box && !canEdit) {
      box.removeAttribute('role');
      box.removeAttribute('tabindex');
      box.setAttribute('aria-disabled', 'true');
      box.style.cursor = 'default';
    }

    render();

    return {
      set,
      getState,
      clear,
      consumePendingUpload,
      consumePendingDelete,
    };
  }

  // ---------- Form persistence ----------
  function collectFields() {
    const fields = {};
    const elements = document.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((el) => {
      if (el.type === 'file') return;
      const key = el.name;
      if (!key) return;
      if (el.type === 'checkbox') {
        fields[key] = !!el.checked;
      } else {
        fields[key] = el.value ?? '';
      }
    });
    return fields;
  }

  function applyFields(fields) {
    if (!fields || typeof fields !== 'object') return;
    const elements = document.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((el) => {
      if (el.type === 'file') return;
      const key = el.name;
      if (!key) return;
      if (!(key in fields)) return;

      const val = fields[key];
      if (el.type === 'checkbox') {
        el.checked = !!val;
      } else {
        el.value = (val ?? '');
      }
      syncReadOnlyFieldDisplay(el);
    });
  }

  function collectState() {
    const allFields = collectFields();
    const canon = buildCanonicalFromForm(allFields);
    const sheetOnly = pickTemporarySheetFields(allFields);
    const rep = pickTemporarySheetRepeatables(collectRepeatables());
    const portraitState = portraitApi?.getState ? portraitApi.getState() : { path: '', previewDataUrl: '' };

    return {
      version: 3,
      savedAt: new Date().toISOString(),
      canonical: {
        name: canon.name,
        level: canon.level,
        primaryAttribute: canon.primaryAttribute,
        classKey: canon.classKey,
        attributes: canon.attributes,
      },
      // local-only preview data is allowed here; NOT written to Firestore
      portrait: {
        path: sanitizeStoragePath(portraitState?.path || ''),
        previewDataUrl: String(portraitState?.previewDataUrl || ''),
      },
      fields: sheetOnly,
      repeatables: rep,
    };
  }

  function applyState(state) {
    if (!state || typeof state !== 'object') return;

    // We only accept v3 state (no legacy support).
    if (state.version !== 3) return;

    const canon = (state.canonical && typeof state.canonical === 'object') ? state.canonical : {};
    const level = clampLevel(canon?.level ?? 1);
    const primaryAttribute = coerceAttrKey(canon?.primaryAttribute);
    const classKey = sanitizeText(canon?.classKey, { maxLen: 64 });

    const attrs = normalizeAttributes(canon?.attributes || {});
    for (const k of ATTR_KEYS) {
      const cap = getAttributeEffectiveCap(level, k, primaryAttribute);
      const min = primaryAttribute && k === primaryAttribute ? 1 : 0;
      attrs[k] = toInt(attrs[k], { min, max: cap });
    }

    const mergedFields = {
      ...(state.fields && typeof state.fields === 'object' ? state.fields : {}),
      charName: sanitizeCharName(canon?.name || ''),
      playerName: editingUid === currentUser?.uid
        ? accountDisplayName(currentUser)
        : sanitizeText(state.fields?.playerName || requestedUidParam || '', { maxLen: 120, collapse: true }),
      classSelect: classKey,
      primaryAttribute: primaryAttribute,
      level: level,
    };

    for (const k of ATTR_KEYS) mergedFields[k] = attrs[k];

    // Ensure selects have options before applying field values.
    populatePrimaryAttributeSelect();

    // Apply fields first so classSelect is set from the stored canonical.
    applyFields(mergedFields);

    // Apply repeatables next.
    applyRepeatables(state.repeatables);

    // Theme must ALWAYS match the class dropdown value (derived; not saved).
    setTheme(classKey);
    if (classSelect) {
      // Ensure the dropdown eventually reflects the stored canonical value.
      classSelect.dataset.pendingValue = classKey || '';
      ensureClassSelectOptions();
    }

    // Portrait local preview restore (optional).
    if (portraitApi?.set && state.portrait && typeof state.portrait === 'object') {
      portraitApi.set({
        path: sanitizeStoragePath(state.portrait.path || ''),
        previewDataUrl: String(state.portrait.previewDataUrl || ''),
        previewUrl: '',
      });
    }

    // Derived fields are computed for display and not stored.
    updateDerivedDisplay(mergedFields);
  }


  function saveNow() {
    if (!cloudEnabled()) {
      return;
    }
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
    saveCloudNow();
  }

  function scheduleSave() {
    if (!cloudEnabled()) {
      return;
    }
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      cloudSaveTimer = null;
      saveCloudNow();
    }, CLOUD_SAVE_DEBOUNCE_MS);
  }

  // ---------- Repeatable list utility (for Pass 2+) ----------
  const repeatableLists = {}; 

  function setElementEditable(el, editable) {
    if (!el) return;
    const canEdit = !!editable;
    if (el.tagName === 'SELECT') {
      el.disabled = !canEdit;
      return;
    }
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.disabled = !canEdit;
      return;
    }
    if ('readOnly' in el) el.readOnly = !canEdit;
    if ('disabled' in el) el.disabled = false;
  }

  function applySheetOwnershipMode() {
    const namedElements = document.querySelectorAll('input[name], select[name], textarea[name]');
    namedElements.forEach((el) => {
      if (el.type === 'file') return;
      const key = String(el.name || '');
      if (!key) return;
      const editable = TEMPORARY_SHEET_FIELD_NAMES.has(key);
      const displayOnly = !editable || DERIVED_FIELD_NAMES.has(key);
      if (displayOnly) {
        el.dataset.readonlyBacked = 'true';
        ensureReadOnlyFieldDisplay(el);
        el.hidden = true;
        setElementEditable(el, true);
        syncReadOnlyFieldDisplay(el);
        return;
      }
      delete el.dataset.readonlyBacked;
      el.hidden = false;
      setElementEditable(el, true);
    });

    const addAbilityBtn = document.getElementById('addAbilityBtn');
    if (addAbilityBtn) {
      addAbilityBtn.hidden = true;
      addAbilityBtn.disabled = true;
    }
  }
  
  // Normalize saved values for repeatable row fields so inputs never display "undefined" or "[object Object]".
  function normalizeRowValue(v) {
    if (v === null || typeof v === 'undefined') return '';
    if (typeof v === 'object') return '';
    return String(v);
  }

  function lockAbilityRow(root) {
    root.classList.add('ability-card-locked');
    const removeBtn = root.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.hidden = true;
      removeBtn.disabled = true;
    }

    root.querySelectorAll('[data-field]').forEach((el) => {
      if ('readOnly' in el) el.readOnly = true;
      if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') {
        el.disabled = true;
      }
    });
  }

  function lockGrantedAbilityRow(root, data) {
    const name = String(data?.name || '').trim();
    const locked = !!name && lockedAbilityNames.has(name);
    lockAbilityRow(root);
    root.classList.toggle('ability-card-locked', locked);
  }
  
  // This is a lightweight helper around <template> cloning.
  function createRepeatableList({ container, templateId, addButton, onAdd }) {
    const tmpl = document.getElementById(templateId);
    if (!container || !tmpl) throw new Error('Repeatable list requires a container and a <template>.');

    function add(initialData) {
      const node = document.importNode(tmpl.content, true);
      const root = node.firstElementChild;
      if (!root) throw new Error('Template must have an element as its first child.');
      container.appendChild(node);
      if (typeof onAdd === 'function') onAdd(root, initialData);
      return root;
    }

    if (addButton) {
      addButton.addEventListener('click', () => add());
    }

    return { add };
  }


  // ---------- Repeatable lists (Pass 2) ----------
  function initRepeatableList({ key, containerId, templateId, addBtnId, fields, minRows, decorateRow, editable = true }) {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);

    if (!container) return null;
    const tmpl = document.getElementById(templateId);
    if (!tmpl) {
      // Missing template should not disable the whole sheet.
      return null;
    }

    const list = createRepeatableList({
      container,
      templateId,
      addButton: null,
      onAdd: (root, initialData) => {
        const data = initialData || {};
        (fields || []).forEach((f) => {
          const el = root.querySelector(`[data-field="${f}"]`);
          if (!el) return;

          if (el.type === 'number') {
            el.value = (data[f] === 0 || data[f]) ? String(data[f]) : '';
          } else {
            el.value = normalizeRowValue(data[f]);
          }
        });

        if (typeof decorateRow === 'function') decorateRow(root, data);
        if (!editable) lockAbilityRow(root);

        const removeBtn = root.querySelector('[data-action="remove"]');
        if (removeBtn && editable) {
          removeBtn.addEventListener('click', () => {
            root.remove();
            scheduleSave();
          });
        }
      }
    });

    function addRow(data) {
      return list.add(data);
    }

    function clear() {
      container.innerHTML = '';
    }

    function ensureMin() {
      const need = Number(minRows || 0);
      while (container.querySelectorAll('[data-repeatable-item]').length < need) {
        addRow();
      }
    }

    function read() {
      const items = [];
      const rows = container.querySelectorAll('[data-repeatable-item]');
      rows.forEach((row) => {
        const obj = {};
        let any = false;

        (fields || []).forEach((f) => {
          const el = row.querySelector(`[data-field="${f}"]`);
          if (!el) return;

          if (el.type === 'number') {
            const raw = String(el.value || '').trim();
            obj[f] = raw === '' ? '' : Number(raw);
          } else {
            obj[f] = String(el.value || '');
          }

          if (String(obj[f] || '').trim() !== '') any = true;
        });

        if (any) items.push(obj);
      });

      return items;
    }

    function load(items) {
      clear();
      (items || []).forEach((it) => addRow(it));
      ensureMin();
    }

    if (addBtn) {
      addBtn.hidden = !editable;
      addBtn.disabled = !editable;
    }

    if (addBtn && editable) {
      addBtn.addEventListener('click', () => {
        addRow();
        scheduleSave();
      });
    }

    const api = { key, container, addRow, clear, ensureMin, read, load };
    repeatableLists[key] = api;
    return api;
  }

  
  function populatePrimaryAttributeSelect() {
    const sel = document.getElementById('primaryAttribute');
    if (!sel) return;

    const current = coerceAttrKey(sel.value) || '';

    sel.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '';
    sel.appendChild(blank);

    for (const k of ATTR_KEYS) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = labelForAttrKey(k);
      sel.appendChild(opt);
    }

    if (current) sel.value = current;
    syncReadOnlyDisplays();
  }

// ---------- Tooltips (short hover/focus explanations) ----------
  function applyTooltipText() {
    const setTipForNamedField = (name, text) => {
      const field = document.querySelector(`[name="${name}"]`);
      if (field) field.dataset.tip = text;

      // If the field is inside a label with a visible <span>, also tag that <span> so hovering the label works.
      const label = field ? field.closest('label') : null;
      const span = label ? label.querySelector('span') : null;
      if (span) span.dataset.tip = text;
    };

    const setTipById = (id, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.dataset.tip = text;
      // Make section headers focusable so keyboard users can discover tips too.
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    };

    // Section-level guidance
    setTipById('resources_title', 'Track your core resources (HP, Spirit, etc.). Speed is measured in squares.');
    setTipById('attributes_title', 'Enter your 6 attributes. Defenses on this sheet are derived from Defense Training + your best attribute in that category.');
    setTipById('skills_title', 'Set your training ranks (0–6). Defense Training is tracked here; the total defense values appear in Attributes & Defenses.');
    setTipById('keystones_title', 'Keystones are your core narrative hooks (Origin/Bond/Background). They can trigger bonuses, complications, or story beats.');
    setTipById('notes_title', 'Freeform notes for reminders, NPC names, plot threads, or rules clarifications.');

    // Field-level tips (Attributes)
    setTipForNamedField('strength', 'Strength increases HP Max: +Strength × (Level + 2). It can also be your base for Physical Defense (best of Strength/Agility).');
    setTipForNamedField('agility', 'Agility increases Speed: Speed = 4 + Agility (in squares). It can also be your base for Physical Defense (best of Strength/Agility).');
    setTipForNamedField('intellect', 'Intellect can be your base for Mental Defense (best of Intellect/Willpower).');
    setTipForNamedField('willpower', 'Willpower can be your base for Mental Defense (best of Intellect/Willpower).');
    setTipForNamedField('attunement', 'Attunement sets your starting Power Die value and can be your base for Spiritual Defense (best of Attunement/Heart).');
    setTipForNamedField('heart', 'Heart can be your base for Spiritual Defense (best of Attunement/Heart).');

    // Derived resources
    setTipForNamedField('hpmax', 'Enter your maximum HP.');
    setTipForNamedField('speed', 'Enter your Speed in squares.');

    // Defense training (Skills section)
    setTipForNamedField('rank_physdef', 'Physical Defense Training. Total Physical Defense = Training + max(Strength, Agility).');
    setTipForNamedField('rank_mentdef', 'Mental Defense Training. Total Mental Defense = Training + max(Intellect, Willpower).');
    setTipForNamedField('rank_spiritdef', 'Spiritual Defense Training. Total Spiritual Defense = Training + max(Attunement, Heart).');

    // Total defenses (Attributes section)
    setTipForNamedField('physdef', 'Total Physical Defense = Training + max(Strength, Agility).');
    setTipForNamedField('mentdef', 'Total Mental Defense = Training + max(Intellect, Willpower).');
    setTipForNamedField('spiritdef', 'Total Spiritual Defense = Training + max(Attunement, Heart).');

    // Table headers in Resources (make hover obvious)
    const resourceHeaders = document.querySelectorAll('#resources th');
    if (resourceHeaders && resourceHeaders.length >= 3) {
      resourceHeaders[0].dataset.tip = 'HP: Max is your total; Current is what you have left.';
      resourceHeaders[1].dataset.tip = 'Strain: track current strain; check Overstrained when you exceed your limit.';
      resourceHeaders[2].dataset.tip = 'Speed is in squares.';
    }
  }

  function initTooltips() {
    const tip = document.getElementById('gxTooltip');
    if (!tip) return;

    let activeEl = null;
    let hideTimer = null;

    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const hide = () => {
      clearHideTimer();
      if (activeEl) activeEl.removeAttribute('aria-describedby');
      activeEl = null;
      tip.dataset.show = '0';
      tip.setAttribute('aria-hidden', 'true');
    };

    const position = (x, y) => {
      const pad = 10;
      const dx = 12;
      const dy = 12;

      tip.style.left = `${x + dx}px`;
      tip.style.top = `${y + dy}px`;
      const r = tip.getBoundingClientRect();

      let left = x + dx;
      let top = y + dy;

      if (r.right > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - r.width - pad);
      if (r.bottom > window.innerHeight - pad) top = Math.max(pad, y - r.height - dy);

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };

    const show = (el, x, y) => {
      const text = (el && el.dataset) ? String(el.dataset.tip || '') : '';
      if (!text) return;

      if (activeEl && activeEl !== el) activeEl.removeAttribute('aria-describedby');
      activeEl = el;
      activeEl.setAttribute('aria-describedby', 'gxTooltip');

      tip.textContent = text;
      tip.dataset.show = '1';
      tip.setAttribute('aria-hidden', 'false');
      position(x, y);
    };

    // Mouse/pen hover
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) return;
      show(el, e.clientX, e.clientY);
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (!activeEl || e.pointerType === 'touch') return;
      position(e.clientX, e.clientY);
    }, true);

    document.addEventListener('pointerout', (e) => {
      if (!activeEl || e.pointerType === 'touch') return;
      const to = e.relatedTarget;
      if (to && activeEl.contains && activeEl.contains(to)) return;
      hide();
    }, true);

    // Keyboard focus
    document.addEventListener('focusin', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      show(el, rect.left + rect.width / 2, rect.bottom);
    }, true);

    document.addEventListener('focusout', () => hide(), true);

    // Touch: tap to show, auto-hide
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) return;

      // Toggle when tapping the same element
      if (activeEl === el) {
        hide();
        return;
      }

      const rect = el.getBoundingClientRect();
      show(el, rect.left + rect.width / 2, rect.bottom);
      clearHideTimer();
      hideTimer = setTimeout(hide, 3500);
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    }, true);
  }

  function collectRepeatables() {
    const out = {};
    Object.keys(repeatableLists).forEach((k) => {
      out[k] = repeatableLists[k].read();
    });
    return out;
  }


  function applyRepeatables(repeatables) {
    const rep = (repeatables && typeof repeatables === 'object') ? { ...repeatables } : {};


    Object.keys(repeatableLists).forEach((k) => {
      repeatableLists[k].load(rep[k]);
    });
  }

  function resetRepeatablesToDefaults() {
    // Abilities: 3 blank cards
    if (repeatableLists.abilities) repeatableLists.abilities.load([]);
  }

  // ---------- Wire up events ----------
  portraitApi = initPortrait(scheduleSave, { canEdit: false });

  // Initialize read/write repeatable sections
initRepeatableList({ key: 'abilities', containerId: 'abilityCards', templateId: 'abilityCardTemplate', addBtnId: 'addAbilityBtn', fields: ['name','text'], minRows: 3, decorateRow: lockGrantedAbilityRow, editable: false });


  
  // Initialize Pass 3 repeatable sections
  initRepeatableList({ key: 'conditions', containerId: 'conditionsList', templateId: 'conditionRowTemplate', addBtnId: 'addConditionBtn', fields: ['name','n','notes'], minRows: 1 });
if (classSelect) {
    classSelect.addEventListener('change', (e) => {
      setTheme(e.target.value);
      updateDerivedDisplay();
      scheduleSave();
    });
  }

  if (sheetEl) {
    sheetEl.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') return;
      updateDerivedDisplay();
      scheduleSave();
    }, true);

    sheetEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') return;
      updateDerivedDisplay();
      scheduleSave();
    }, true);
  }


  // Expose a tiny debug API (optional)
  window.GameXSheet = {
    collectState,
    applyState,
    createRepeatableList
  };

  applyReadOnlySkillState();
  applySheetOwnershipMode();

  // Initialize tooltip text + behavior
  applyTooltipText();
  initTooltips();

  // Populate dropdown options (no class data duplicated in HTML)
  populatePrimaryAttributeSelect();
  ensureClassSelectOptions();

  resetRepeatablesToDefaults();

  // Initialize Firebase Auth (cloud sync)
  initAuth();
})();
