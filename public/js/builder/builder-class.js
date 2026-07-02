// public/builder-class.js
// Class selection step: class, level, primary attribute, class feature options, and feats.

import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  markStepVisited,
  openCharacterSheet,
  setStatus,
  showError,
  clearError,
  confirmSaveWarnings,
  ensureBuilderShellUi,
} from "./builder-common.js";

import { renderBuilderNavMounts } from "./builder-nav.js";
import { BuilderPage } from "./builder-page.js";
import { GrantChoicesWidget } from "./widgets/grant-choices-widget.js";
import { WeaponChoiceWidget } from "./widgets/weapon-choice-widget.js";
import { WeaponEnhancementChoiceWidget } from "./widgets/weapon-enhancement-choice-widget.js";

import { loadGameXData, getGameXClasses, getGameXClassFeatures, getGameXFeats, getGameXWeaponBases, getGameXWeaponEnhancements } from "../core/game-data.js";

import { ATTR_KEYS, clampLevel, coerceAttrKey, labelForAttrKey } from "../core/character-rules.js";
import { sanitizeText, buildGroupId, buildOptionKey } from "../core/data-sanitization.js";
import { checkPrerequisites, formatPrerequisites } from "../core/prerequisites.js";
import { getEffectiveTags } from "../core/weapon-utils.js";
import {
  collectOptionGroups,
  collectSelectedEntries,
  deleteSelectedDescendants,
  isGroupComplete,
  isOptionGroup,
  selectedCountForGroup,
} from "../core/option-groups.js";
const CURRENT_STEP_ID = "class";

ensureBuilderShellUi();

/** @type {any} */
let ctx;
/** @type {any} */
let charRef;
/** @type {any} */
let currentDoc;

/** @type {any} */
let gameData;
let weaponBases = [];
let weaponEnhancements = [];

// In-memory state
let selectedClassKey = "";
let selectedPrimary = "";
let selectedLevel = 1;
/** @type {Set<string>} */
let selectedFeatureOptionKeys = new Set();
/** @type {Set<string>} */
let selectedFeatNames = new Set();
/** @type {Set<string>} */
let selectedFeatOptionKeys = new Set();
/** @type {Record<string, any>} */
let grantChoices = {};

/** optionKey -> option object */
/** @type {Map<string, any>} */
const optionByKey = new Map();

/** groupId -> collapsed? */
/** @type {Map<string, boolean>} */
const collapsedGroups = new Map();

// ---- DOM ----
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const classSelectEl = document.getElementById("classSelect");
const levelEl = document.getElementById("level");
const primaryEl = document.getElementById("primaryAttribute");
const classDetailsEl = document.getElementById("classDetails");

const featuresEl = document.getElementById("features");
const featsEl = document.getElementById("feats");
const featureHintEl = document.getElementById("featureHint");
const featHintEl = document.getElementById("featHint");
const showUnavailableFeaturesEl = document.getElementById("showUnavailableFeatures");
const showUnavailableFeatsEl = document.getElementById("showUnavailableFeats");
const featurePrereqNoticeEl = document.getElementById("featurePrereqNotice");
const featPrereqNoticeEl = document.getElementById("featPrereqNotice");

const incompleteBannerEl = document.getElementById("classIncompleteBanner");
const incompleteReasonEl = document.getElementById("classIncompleteReason");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

let hiddenUnavailableFeatureCount = 0;
let unavailableFeatureCount = 0;
let hiddenUnavailableFeatCount = 0;
let unavailableFeatCount = 0;

class ClassBuilderPage extends BuilderPage {}

const classPage = new ClassBuilderPage({
  stepId: CURRENT_STEP_ID,
  getSaveContext: () => ({
    currentDoc,
    grantChoices,
  }),
});
new GrantChoicesWidget(classPage, {
  getGrantChoices: () => grantChoices,
  getExistingWeapons: () => currentDoc?.builder?.weapons || [],
});

// ---- Helpers ----


function getClassByKey(classKey) {
  const arr = getGameXClasses(gameData);
  return arr.find((c) => String(c.classKey) === String(classKey)) || null;
}

function classSelectableInfo(classObj) {
  if (!classObj) return { ok: false, reason: "Missing class data." };

  const missing = [];
  const req = ["primaryAttributeA", "primaryAttributeB", "hpProgression", "combatTechniqueSkill"];
  for (const k of req) {
    if (!classObj[k]) missing.push(k);
  }

  const cf = getGameXClassFeatures(gameData, classObj.classKey);
  if (!Array.isArray(cf) || !cf.length) missing.push("classFeatures");

  if (!missing.length) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `Missing: ${missing.join(", ")}.`,
  };
}

function getAllowedPrimaryAttributes(classObj) {
  const a = coerceAttrKey(classObj?.primaryAttributeA);
  const b = coerceAttrKey(classObj?.primaryAttributeB);
  const allowed = [a, b].filter(Boolean);
  // Keep stable ordering and only allow real attributes.
  return allowed.filter((k) => ATTR_KEYS.includes(/** @type {any} */ (k)));
}

function getFeatSlots(level) {
  // Rule (temporary): 1 slot at every even level.
  const L = clampLevel(level);
  return Math.floor(L / 2);
}

function computeVisibleClassFeatures(classKey, level) {
  const all = getGameXClassFeatures(gameData, classKey);
  const L = clampLevel(level);
  return all.filter((f) => Number(f?.level || 0) <= L);
}

function computeVisibleFeats(classKey, level) {
  const all = getGameXFeats(gameData);
  const L = clampLevel(level);
  return all
    .filter((f) => String(f?.classKey || "") === String(classKey))
    .filter((f) => Number(f?.minLevel || 0) <= L);
}

function getClassStepBuilderState() {
  return {
    ...(currentDoc?.builder || {}),
    level: clampLevel(selectedLevel),
    classKey: selectedClassKey,
    primaryAttribute: selectedPrimary,
    selectedClassFeatureOptions: Array.from(selectedFeatureOptionKeys),
    selectedFeats: Array.from(selectedFeatNames),
    selectedFeatOptions: Array.from(selectedFeatOptionKeys),
    grantChoices,
  };
}

function checkEntryPrerequisites(entry, { deferUnresolvedChoices = false } = {}) {
  return checkPrerequisites(entry?.prerequisites, {
    gameData,
    builder: getClassStepBuilderState(),
    deferUnresolvedChoices,
  });
}

function showUnavailableFeatures() {
  return showUnavailableFeaturesEl ? !!showUnavailableFeaturesEl.checked : true;
}

function showUnavailableFeats() {
  return showUnavailableFeatsEl ? !!showUnavailableFeatsEl.checked : true;
}

function setPrerequisiteNotice(el, unavailableCount, hiddenCount) {
  if (!el) return;
  if (!unavailableCount) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = hiddenCount
    ? `${hiddenCount} unavailable option${hiddenCount === 1 ? "" : "s"} hidden by prerequisites.`
    : `${unavailableCount} option${unavailableCount === 1 ? " is" : "s are"} unavailable because prerequisites are not met.`;
}

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

function getChoice(choiceId) {
  const id = sanitizeText(choiceId, { maxLen: 96, collapse: true });
  return id ? (grantChoices[id] || null) : null;
}

function getForcedEnhancementsForChoice(choiceId) {
  const out = [];
  const entries = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
  const addFromEntry = (entry) => {
    for (const grant of Array.isArray(entry?.grants) ? entry.grants : []) {
      if (grant?.type !== "weapon" || grant?.choiceId !== choiceId || !grant?.enhancement) continue;
      out.push({
        id: `${choiceId}-${grant.enhancement}`,
        enhancementKey: grant.enhancement,
        rank: Number.parseInt(String(grant.rank ?? 1), 10) || 1,
        selections: {},
        granted: true,
      });
    }
  };
  for (const entry of entries) {
    addFromEntry(entry);
    for (const option of collectSelectedEntries([entry], selectedFeatureOptionKeys)) addFromEntry(option);
  }
  return out;
}

function updateGrantChoice(choiceId, patch = {}) {
  const id = sanitizeText(choiceId, { maxLen: 96, collapse: true });
  if (!id) return;
  const previous = grantChoices[id] || {};
  const next = { ...previous, ...patch, choiceId: id, type: patch.type || previous.type || "weapon" };
  if (!next.weaponKey) {
    delete grantChoices[id];
    pruneUnavailableSelectionsForPrerequisites();
    return;
  }
  const forcedEnhancements = getForcedEnhancementsForChoice(id);
  const optionalEnhancements = Array.isArray(next.enhancements)
    ? next.enhancements.filter((enhancement) => !enhancement?.granted && enhancement?.enhancementKey)
    : [];
  next.enhancements = forcedEnhancements.concat(optionalEnhancements);
  const weapon = next.weaponKey ? { weaponKey: next.weaponKey, rank: next.rank, enhancements: next.enhancements } : null;
  next.tags = weapon ? getEffectiveTags(weapon, weaponBases) : [];
  if (!next.weaponKey && !next.enhancements.length) delete grantChoices[id];
  else grantChoices[id] = next;
  pruneUnavailableSelectionsForPrerequisites();
}

function setChoiceEnhancement(choiceId, grant, enhancementKey) {
  const id = sanitizeText(choiceId, { maxLen: 96, collapse: true });
  const key = sanitizeText(enhancementKey, { maxLen: 96, collapse: true });
  const choice = grantChoices[id] || { choiceId: id, type: "weapon" };
  const forced = getForcedEnhancementsForChoice(id);
  const optional = key
    ? [{
        id: `${id}-${key}`,
        enhancementKey: key,
        rank: Number.parseInt(String(grant?.rank ?? 1), 10) || 1,
        selections: {},
      }]
    : [];
  updateGrantChoice(id, { ...choice, enhancements: forced.concat(optional) });
}

function pruneUnavailableSelectionsForPrerequisites() {
  let changed = false;
  const pruneGroups = (entries, selectedKeys) => {
    for (const group of Array.isArray(entries) ? entries : []) {
      if (!isOptionGroup(group)) continue;
      for (const option of Array.isArray(group.options) ? group.options : []) {
        const key = buildOptionKey(group, option);
        if (!selectedKeys.has(key)) continue;
        const prereqCheck = checkEntryPrerequisites(option);
        if (!prereqCheck.ok) {
          selectedKeys.delete(key);
          deleteSelectedDescendants(option, selectedKeys);
          changed = true;
          continue;
        }
        if (isOptionGroup(option)) pruneGroups([option], selectedKeys);
      }
    }
  };

  const visibleFeatures = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
  pruneGroups(visibleFeatures, selectedFeatureOptionKeys);

  const visibleFeats = computeVisibleFeats(selectedClassKey, selectedLevel);
  for (const feat of visibleFeats) {
    const name = String(feat?.name || "").trim();
    if (!name || !selectedFeatNames.has(name)) continue;
    const prereqCheck = checkEntryPrerequisites(feat);
    if (!prereqCheck.ok) {
      selectedFeatNames.delete(name);
      deleteSelectedDescendants(feat, selectedFeatOptionKeys);
      changed = true;
    }
  }

  const selectedFeats = visibleFeats.filter((feat) => selectedFeatNames.has(String(feat?.name || "").trim()));
  pruneGroups(selectedFeats, selectedFeatOptionKeys);
  return changed;
}

function pruneSelectionsForLevel() {
  // Prune feats (minLevel + slot cap)
  if (selectedClassKey) {
    const visibleFeats = computeVisibleFeats(selectedClassKey, selectedLevel);
    const allowed = new Set(visibleFeats.map((f) => String(f?.name || "").trim()).filter(Boolean));
    selectedFeatNames = new Set(Array.from(selectedFeatNames).filter((n) => allowed.has(n)));

    const maxSlots = getFeatSlots(selectedLevel);
    if (selectedFeatNames.size > maxSlots) {
      selectedFeatNames = new Set(Array.from(selectedFeatNames).slice(0, maxSlots));
    }

    // Prune feature option keys that are not present at/below level.
    optionByKey.clear();
    const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
    const allowedOptKeys = new Set();
    for (const group of collectOptionGroups(visible)) {
      for (const option of Array.isArray(group?.options) ? group.options : []) {
        const k = buildOptionKey(group, option);
        allowedOptKeys.add(k);
        optionByKey.set(k, option);
      }
    }

    selectedFeatureOptionKeys = new Set(Array.from(selectedFeatureOptionKeys).filter((k) => allowedOptKeys.has(k)));

    const selectedFeats = visibleFeats.filter((feat) => selectedFeatNames.has(String(feat?.name || "").trim()));
    const allowedFeatOptKeys = new Set();
    for (const group of collectOptionGroups(selectedFeats)) {
      for (const option of Array.isArray(group?.options) ? group.options : []) {
        allowedFeatOptKeys.add(buildOptionKey(group, option));
      }
    }
    selectedFeatOptionKeys = new Set(Array.from(selectedFeatOptionKeys).filter((key) => allowedFeatOptKeys.has(key)));
  }
}

function getSaveIssues() {
  clearError(errorEl);

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  const prevClassKey = String(currentDoc?.builder?.classKey || "");
  const classChanged = !!selectedClassKey && !!prevClassKey && prevClassKey !== selectedClassKey;

  const prevLevelRaw = Number(currentDoc?.builder?.level || 1);
  const prevLevel = clampLevel(prevLevelRaw);
  const nextLevel = clampLevel(selectedLevel);
  const levelDecreased = nextLevel < prevLevel;

  const cls = getClassByKey(selectedClassKey);
  if (!cls) {
    warnings.push("Choose a class.");
  } else {
    const selectable = classSelectableInfo(cls);
    if (!selectable.ok) {
      warnings.push("This class is marked Coming Soon (data may be incomplete).");
    }

    const allowedPrimary = getAllowedPrimaryAttributes(cls);
    if (!selectedPrimary || !allowedPrimary.includes(/** @type {any} */ (selectedPrimary))) {
      warnings.push("Choose a Primary Attribute.");
    }

    // Class option groups: top-level groups always apply; child groups apply
    // only after their parent option is selected.
    const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
    const checkGroups = (entries, selectedKeys, prefix) => {
      for (const group of Array.isArray(entries) ? entries : []) {
        if (!isOptionGroup(group)) continue;
        const chooseCount = Number(group?.chooseCount || 0);
        if (chooseCount && !isGroupComplete(group, selectedKeys)) {
          warnings.push(`Finish selecting options for: ${prefix}${group.name} (choose ${chooseCount}).`);
        }
        const selectedChildren = (Array.isArray(group?.options) ? group.options : [])
          .filter((option) => selectedKeys.has(buildOptionKey(group, option)));
        checkGroups(selectedChildren, selectedKeys, prefix);
      }
    };
    checkGroups(visible, selectedFeatureOptionKeys, "");

    for (const option of collectSelectedEntries(visible, selectedFeatureOptionKeys)) {
      const prereqCheck = checkEntryPrerequisites(option);
      if (!prereqCheck.ok) {
        warnings.push(`${option.name || "Selected class option"} no longer meets prerequisites: ${prereqCheck.failureReasons.join(" ")}`);
      }
    }

    const visibleFeats = computeVisibleFeats(selectedClassKey, selectedLevel);
    const selectedFeats = visibleFeats.filter((feat) => selectedFeatNames.has(String(feat?.name || "").trim()));
    checkGroups(selectedFeats, selectedFeatOptionKeys, "feat ");
    for (const feat of selectedFeats) {
      const prereqCheck = checkEntryPrerequisites(feat);
      if (!prereqCheck.ok) {
        warnings.push(`${feat.name || "Selected feat"} no longer meets prerequisites: ${prereqCheck.failureReasons.join(" ")}`);
      }
    }
    for (const option of collectSelectedEntries(selectedFeats, selectedFeatOptionKeys)) {
      const prereqCheck = checkEntryPrerequisites(option);
      if (!prereqCheck.ok) {
        warnings.push(`${option.name || "Selected feat option"} no longer meets prerequisites: ${prereqCheck.failureReasons.join(" ")}`);
      }
    }
  }

  // Cascading invalidation: lowering level can prune selections.
  // (We warn and then auto-prune on save to keep the sheet consistent.)
  if (levelDecreased && selectedClassKey) {
    // Feats: minLevel + slot cap.
    const storedFeats = Array.isArray(currentDoc?.builder?.selectedFeats)
      ? currentDoc.builder.selectedFeats.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    if (storedFeats.length) {
      const allowedVisible = computeVisibleFeats(selectedClassKey, nextLevel);
      const allowedByName = new Set(allowedVisible.map((f) => String(f?.name || "").trim()).filter(Boolean));
      let kept = storedFeats.filter((n) => allowedByName.has(n));
      const nextSlots = getFeatSlots(nextLevel);
      if (kept.length > nextSlots) kept = kept.slice(0, nextSlots);
      const droppedCount = Math.max(0, storedFeats.length - kept.length);
      if (droppedCount) {
        warnings.push(
          `Lowering level to ${nextLevel} will remove ${droppedCount} feat${droppedCount === 1 ? "" : "s"} that no longer fit your level/slot limits.`
        );
      }
    }

    // Feature options: options for features above the new level will be cleared.
    const storedOpts = Array.isArray(currentDoc?.builder?.selectedClassFeatureOptions)
      ? currentDoc.builder.selectedClassFeatureOptions.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (storedOpts.length) {
      const visible = computeVisibleClassFeatures(selectedClassKey, nextLevel);
      const allowedOptKeys = new Set();
      for (const group of collectOptionGroups(visible)) {
        for (const option of Array.isArray(group?.options) ? group.options : []) {
          allowedOptKeys.add(buildOptionKey(group, option));
        }
      }

      const kept = storedOpts.filter((k) => allowedOptKeys.has(k));
      const droppedCount = Math.max(0, storedOpts.length - kept.length);
      if (droppedCount) {
        warnings.push(
          `Lowering level to ${nextLevel} will clear ${droppedCount} class option selection${droppedCount === 1 ? "" : "s"} from higher-level features.`
        );
      }
    }

    const storedFeatOpts = Array.isArray(currentDoc?.builder?.selectedFeatOptions)
      ? currentDoc.builder.selectedFeatOptions.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (storedFeatOpts.length) {
      const visibleFeats = computeVisibleFeats(selectedClassKey, nextLevel);
      const allowedVisibleFeatNames = new Set(visibleFeats.map((feat) => String(feat?.name || "").trim()).filter(Boolean));
      const selectedVisibleFeats = visibleFeats.filter((feat) => allowedVisibleFeatNames.has(String(feat?.name || "").trim()));
      const allowedFeatOptKeys = new Set();
      for (const group of collectOptionGroups(selectedVisibleFeats)) {
        for (const option of Array.isArray(group?.options) ? group.options : []) {
          allowedFeatOptKeys.add(buildOptionKey(group, option));
        }
      }
      const kept = storedFeatOpts.filter((key) => allowedFeatOptKeys.has(key));
      const droppedCount = Math.max(0, storedFeatOpts.length - kept.length);
      if (droppedCount) {
        warnings.push(
          `Lowering level to ${nextLevel} will clear ${droppedCount} feat option selection${droppedCount === 1 ? "" : "s"} from higher-level feats.`
        );
      }
    }
  }

  // Cascading invalidation: class changes make prior technique picks invalid.
  // Warn and (on save) clear them so the Techniques step starts from a clean slate.
  if (classChanged) {
    const storedTechniques = Array.isArray(currentDoc?.builder?.selectedTechniques)
      ? currentDoc.builder.selectedTechniques
      : [];
    if (storedTechniques.length) {
      warnings.push(
        `Changing class will clear ${storedTechniques.length} selected technique${
          storedTechniques.length === 1 ? "" : "s"
        }.`
      );
    }
  }

  // Feats: cannot exceed slots (this is invalid, not just missing data).
  const maxSlots = getFeatSlots(selectedLevel);
  if (selectedFeatNames.size > maxSlots) {
    errors.push(`Too many feats selected (${selectedFeatNames.size}/${maxSlots}).`);
  }
  if (selectedFeatNames.size < maxSlots) {
    warnings.push(`You can select ${maxSlots} feats, but only selected ${selectedFeatNames.size}.`);
  }

  return { errors, warnings };
}

function buildAutoAbilities() {
  /** @type {{name: string, text: string}[]} */
  const out = [];

  if (!selectedClassKey) return out;

  const L = clampLevel(selectedLevel);
  const visible = computeVisibleClassFeatures(selectedClassKey, L);

  for (const f of visible) {
    if (String(f?.type) !== "feature") continue;
    const n = String(f?.name || "").trim();
    if (!n) continue;
    out.push({
      name: `Class Feature - ${n}`,
      text: String(f?.description || "").trim(),
    });
  }

  for (const option of collectSelectedEntries(visible, selectedFeatureOptionKeys)) {
    const n = String(option?.name || "").trim();
    if (!n) continue;
    out.push({
      name: `Class Feature - ${n}`,
      text: String(option?.description || "").trim(),
    });
  }

  const visibleFeats = computeVisibleFeats(selectedClassKey, L);
  const featByName = new Map(visibleFeats.map((f) => [String(f?.name || "").trim(), f]));

  for (const name of Array.from(selectedFeatNames)) {
    const feat = featByName.get(name);
    if (!feat) continue;
    out.push({
      name: `Feat - ${name}`,
      text: String(feat?.description || "").trim(),
    });
  }

  const selectedFeats = Array.from(selectedFeatNames)
    .map((name) => featByName.get(name))
    .filter(Boolean);
  for (const option of collectSelectedEntries(selectedFeats, selectedFeatOptionKeys)) {
    const n = String(option?.name || "").trim();
    if (!n) continue;
    out.push({
      name: `Feat Option - ${n}`,
      text: String(option?.description || "").trim(),
    });
  }

  return out;
}
function mergeAbilities(existingAbilities, oldAutoNames, newAutoAbilities) {
  const oldSet = new Set(Array.isArray(oldAutoNames) ? oldAutoNames : []);
  const kept = (Array.isArray(existingAbilities) ? existingAbilities : [])
    .filter((it) => it && typeof it === "object")
    .filter((it) => {
      const n = String(it.name || "").trim();
      return !oldSet.has(n);
    })
    .map((it) => ({ name: String(it.name || ""), text: String(it.text || "") }));

  const merged = kept.concat(newAutoAbilities);
  return merged;
}


function renderPrimaryOptions() {
  if (!primaryEl) return;
  const cls = getClassByKey(selectedClassKey);
  const allowed = getAllowedPrimaryAttributes(cls);

  primaryEl.innerHTML = allowed
    .map((k) => `<option value="${k}">${labelForAttrKey(k) || (k[0].toUpperCase() + k.slice(1))}</option>`)
    .join("");
  if (selectedPrimary && allowed.includes(/** @type {any} */ (selectedPrimary))) {
    primaryEl.value = selectedPrimary;
  } else {
    selectedPrimary = allowed[0] || "";
    primaryEl.value = selectedPrimary;
  }
}

function renderClassDetails() {
  if (!classDetailsEl) return;
  const cls = getClassByKey(selectedClassKey);
  if (!cls) {
    classDetailsEl.textContent = "Select a class to view details.";
    return;
  }

  const lines = [];
  lines.push(`<div><strong>${sanitizeText(cls.name || cls.classKey || "Class", { maxLen: 200 })}</strong></div>`);
  if (cls.pitch) lines.push(`<div class="muted" style="margin-top:6px">${sanitizeText(cls.pitch, { maxLen: 1200 })}</div>`);
  if (cls.examples) lines.push(`<div class="muted" style="margin-top:6px"><span class="muted">Examples:</span> ${sanitizeText(cls.examples, { maxLen: 500 })}</div>`);
  if (cls.notes) lines.push(`<div class="muted" style="margin-top:6px"><span class="muted">Notes:</span> ${sanitizeText(cls.notes, { maxLen: 800 })}</div>`);


  const allowed = getAllowedPrimaryAttributes(cls);
  if (allowed.length) {
    const labels = allowed.map((k) => labelForAttrKey(k) || k);
    lines.push(`<div style="margin-top:10px"><span class="muted">Primary Attributes:</span> ${labels.join(" / ")}</div>`);
  }

  classDetailsEl.innerHTML = lines.join("");
}

function setIncompleteBanner(isIncomplete, reasonText) {
  if (!incompleteBannerEl || !incompleteReasonEl) return;
  if (!isIncomplete) {
    incompleteBannerEl.style.display = "none";
    incompleteReasonEl.textContent = "";
    return;
  }
  incompleteBannerEl.style.display = "block";
  incompleteReasonEl.textContent = reasonText ? ` ${reasonText}` : "";
}

function createGrantChoiceWidgets(entry, { scope = "features" } = {}) {
  const grants = Array.isArray(entry?.grants) ? entry.grants : [];
  const choiceGrants = grants.filter((grant) =>
    (grant?.type === "weapon" && grant?.choiceId) ||
    (grant?.type === "weapon-enhancement" && grant?.choiceRef)
  );
  if (!choiceGrants.length) return null;

  const container = document.createElement("div");
  container.className = "grantChoiceWidgets";

  for (const grant of choiceGrants) {
    if (grant.type === "weapon") {
      const choiceId = sanitizeText(grant.choiceId, { maxLen: 96, collapse: true });
      const choice = getChoice(choiceId);
      const widget = new WeaponChoiceWidget(classPage, {
        grant,
        choice,
        weaponBases,
        weaponEnhancements,
        forcedEnhancements: getForcedEnhancementsForChoice(choiceId),
        getGrantChoices: () => grantChoices,
        getExistingWeapons: () => currentDoc?.builder?.weapons || [],
        scope,
        onChange: (patch) => {
          updateGrantChoice(choiceId, patch);
          renderFeatures();
        },
      });
      container.append(widget.element);
      continue;
    }

    if (grant.type === "weapon-enhancement") {
      const choiceId = sanitizeText(grant.choiceRef, { maxLen: 96, collapse: true });
      const widget = new WeaponEnhancementChoiceWidget(classPage, {
        grant,
        choice: getChoice(choiceId),
        forcedEnhancements: getForcedEnhancementsForChoice(choiceId),
        weaponBases,
        weaponEnhancements,
        prerequisiteContext: { gameData, builder: getClassStepBuilderState() },
        getGrantChoices: () => grantChoices,
        getExistingWeapons: () => currentDoc?.builder?.weapons || [],
        scope,
        onChange: (enhancementKey) => {
          setChoiceEnhancement(choiceId, grant, enhancementKey);
          renderFeatures();
        },
      });
      container.append(widget.element);
    }
  }

  return container.childElementCount ? container : null;
}

function createOptionGroupElement(group, selectedKeys, onChange, depth = 0, { context = "feature" } = {}) {
  const chooseCount = Number(group?.chooseCount || 0);
  const opts = Array.isArray(group?.options) ? group.options : [];
  const gid = buildGroupId(group);
  const isCollapsed = collapsedGroups.get(gid) ?? false;
  const showUnavailable = context === "feat" ? showUnavailableFeats() : showUnavailableFeatures();

  for (const option of opts) {
    optionByKey.set(buildOptionKey(group, option), option);
  }

  const container = document.createElement("div");
  container.className = "optionGroup";
  if (depth > 0) container.style.marginLeft = "18px";

  const headerBtn = document.createElement("button");
  headerBtn.type = "button";
  headerBtn.className = "optionGroupHeader";
  headerBtn.setAttribute("aria-expanded", String(!isCollapsed));

  const selectedCount = selectedCountForGroup(group, selectedKeys);
  headerBtn.innerHTML = `
    <span>${sanitizeText(group.name || "Options", { maxLen: 200 })}</span>
    <span class="muted">choose ${chooseCount} - ${selectedCount}/${chooseCount}</span>
  `;

  const body = document.createElement("div");
  body.className = "optionGroupBody";
  body.style.display = isCollapsed ? "none" : "block";

  headerBtn.addEventListener("click", () => {
    const nowCollapsed = !(body.style.display === "none");
    body.style.display = nowCollapsed ? "none" : "block";
    collapsedGroups.set(gid, nowCollapsed);
    headerBtn.setAttribute("aria-expanded", String(!nowCollapsed));
  });

  if (group.description) {
    const desc = document.createElement("div");
    desc.className = "muted";
    desc.style.margin = "6px 0 10px 0";
    desc.textContent = String(group.description);
    body.append(desc);
  }

  const list = document.createElement("div");
  list.className = "optionList";

  const picked = selectedCountForGroup(group, selectedKeys);
  const limitReached = chooseCount > 0 && picked >= chooseCount;

  for (const option of opts) {
    const key = buildOptionKey(group, option);
    const checked = selectedKeys.has(key);
    const prereqCheck = checkEntryPrerequisites(option);
    const prereqText = formatPrerequisites(option?.prerequisites);
    const isUnavailable = !prereqCheck.ok;
    if (isUnavailable) {
      if (context === "feat") unavailableFeatCount += 1;
      else unavailableFeatureCount += 1;
    }
    if (isUnavailable && !showUnavailable && !checked) {
      if (context === "feat") hiddenUnavailableFeatCount += 1;
      else hiddenUnavailableFeatureCount += 1;
      continue;
    }

    const row = document.createElement("label");
    row.className = "optionRow";
    if (isUnavailable) {
      row.classList.add("isUnavailable");
      row.title = prereqCheck.failureReasons[0] || "Prerequisites not met.";
    }

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = key;
    cb.checked = checked;
    cb.disabled = !checked && (limitReached || isUnavailable);
    cb.title = isUnavailable ? (prereqCheck.failureReasons[0] || "Prerequisites not met.") : "";

    cb.addEventListener("change", () => {
      if (cb.checked) {
        const currentPrereqCheck = checkEntryPrerequisites(option);
        if (!currentPrereqCheck.ok) {
          cb.checked = false;
          setStatus(statusEl, currentPrereqCheck.failureReasons[0] || "Prerequisites not met.");
          return;
        }
        if (chooseCount > 0 && selectedCountForGroup(group, selectedKeys) >= chooseCount) {
          cb.checked = false;
          return;
        }
        selectedKeys.add(key);
      } else {
        selectedKeys.delete(key);
        deleteSelectedDescendants(option, selectedKeys);
      }
      onChange();
    });

    const title = document.createElement("div");
    title.className = "optionTitle";
    title.textContent = String(option.name || "Option");

    const desc = document.createElement("div");
    desc.className = "muted optionDesc";
    desc.textContent = String(option.description || "");

    const textWrap = document.createElement("div");
    textWrap.append(title, desc);
    const grantWidgets = createGrantChoiceWidgets(option, { scope: context });
    if (grantWidgets) textWrap.append(grantWidgets);
    if (prereqText) {
      const prereqEl = document.createElement("div");
      prereqEl.className = "muted optionDesc";
      prereqEl.textContent = `Prerequisite: ${prereqText}`;
      textWrap.append(prereqEl);
    }
    if (isUnavailable) {
      const failureEl = document.createElement("div");
      failureEl.className = "muted optionDesc";
      failureEl.textContent = prereqCheck.failureReasons[0] || "Prerequisites not met.";
      textWrap.append(failureEl);
    }
    row.append(cb, textWrap);
    list.append(row);

    if (checked && isOptionGroup(option)) {
      list.append(createOptionGroupElement(option, selectedKeys, onChange, depth + 1, { context }));
    }
  }

  body.append(list);
  container.append(headerBtn, body);
  return container;
}

function renderFeatures() {
  if (!featuresEl) return;
  classPage.clearWidgets({ scope: "feature" });
  featuresEl.innerHTML = "";
  optionByKey.clear();
  hiddenUnavailableFeatureCount = 0;
  unavailableFeatureCount = 0;

  if (!selectedClassKey) {
    featuresEl.innerHTML = `<p class="muted">Choose a class to view features.</p>`;
    setPrerequisiteNotice(featurePrereqNoticeEl, 0, 0);
    return;
  }

  const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);

  if (featureHintEl) featureHintEl.textContent = `Showing features up to level ${clampLevel(selectedLevel)}.`;

  if (!visible.length) {
    featuresEl.innerHTML = `<p class="muted">No features available.</p>`;
    setPrerequisiteNotice(featurePrereqNoticeEl, 0, 0);
    return;
  }

  for (const f of visible) {
    const type = String(f?.type || "");

    if (type === "feature") {
      const card = document.createElement("div");
      card.className = "builderItem";
      card.innerHTML = `
        <div class="builderItemTitle">${sanitizeText(f.name || "Feature", { maxLen: 200 })}</div>
        <div class="muted builderItemMeta">Level ${Number(f.level || 1)}</div>
        <div class="builderItemBody">${sanitizeText(f.description || "", { maxLen: 2000 })}</div>
      `;
      const grantWidgets = createGrantChoiceWidgets(f, { scope: "feature" });
      if (grantWidgets) card.append(grantWidgets);
      featuresEl.append(card);
      continue;
    }

    if (type === "optionGroup") {
      featuresEl.append(createOptionGroupElement(f, selectedFeatureOptionKeys, renderFeatures, 0, { context: "feature" }));
      continue;
    }
  }

  setPrerequisiteNotice(featurePrereqNoticeEl, unavailableFeatureCount, hiddenUnavailableFeatureCount);
}

function renderFeats() {
  if (!featsEl) return;
  classPage.clearWidgets({ scope: "feat" });
  featsEl.innerHTML = "";
  hiddenUnavailableFeatCount = 0;
  unavailableFeatCount = 0;

  if (!selectedClassKey) {
    featsEl.innerHTML = `<p class="muted">Choose a class to view feats.</p>`;
    if (featHintEl) featHintEl.textContent = "";
    setPrerequisiteNotice(featPrereqNoticeEl, 0, 0);
    return;
  }

  const maxSlots = getFeatSlots(selectedLevel);
  const visible = computeVisibleFeats(selectedClassKey, selectedLevel);
  const used = selectedFeatNames.size;

  if (featHintEl) featHintEl.textContent = `Slots: ${used}/${maxSlots}`;

  if (maxSlots <= 0) {
    featsEl.innerHTML = `<p class="muted">No feat slots at level ${clampLevel(selectedLevel)}. (First slot at level 2.)</p>`;
    setPrerequisiteNotice(featPrereqNoticeEl, 0, 0);
    return;
  }

  if (!visible.length) {
    featsEl.innerHTML = `<p class="muted">No feats available for this class at your level.</p>`;
    setPrerequisiteNotice(featPrereqNoticeEl, 0, 0);
    return;
  }

  const list = document.createElement("div");
  list.className = "optionList";

  const updateDisables = () => {
    const limitReached = selectedFeatNames.size >= maxSlots;
    const boxes = list.querySelectorAll("input[type=checkbox]");
    boxes.forEach((box) => {
      if (box.checked) box.disabled = false;
      else box.disabled = limitReached || box.dataset.prereqOk === "false";
    });
  };

  for (const feat of visible) {
    const name = String(feat?.name || "").trim();
    if (!name) continue;
    const row = document.createElement("label");
    row.className = "optionRow";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedFeatNames.has(name);
    const prereqCheck = checkEntryPrerequisites(feat);
    const prereqText = formatPrerequisites(feat?.prerequisites);
    const isUnavailable = !prereqCheck.ok;
    if (isUnavailable) unavailableFeatCount += 1;
    if (isUnavailable && !showUnavailableFeats() && !cb.checked) {
      hiddenUnavailableFeatCount += 1;
      continue;
    }
    cb.dataset.prereqOk = prereqCheck.ok ? "true" : "false";
    if (isUnavailable) {
      row.classList.add("isUnavailable");
      row.title = prereqCheck.failureReasons[0] || "Prerequisites not met.";
      cb.title = row.title;
    }

    cb.addEventListener("change", () => {
      if (cb.checked) {
        const currentPrereqCheck = checkEntryPrerequisites(feat);
        if (!currentPrereqCheck.ok) {
          cb.checked = false;
          setStatus(statusEl, currentPrereqCheck.failureReasons[0] || "Prerequisites not met.");
          return;
        }
        if (selectedFeatNames.size >= maxSlots) {
          cb.checked = false;
          return;
        }
        selectedFeatNames.add(name);
      } else {
        selectedFeatNames.delete(name);
        deleteSelectedDescendants(feat, selectedFeatOptionKeys);
      }
      renderFeats();
    });

    const title = document.createElement("div");
    title.className = "optionTitle";
    title.textContent = name;

    const desc = document.createElement("div");
    desc.className = "muted optionDesc";
    desc.textContent = String(feat?.description || "");

    const textWrap = document.createElement("div");
    textWrap.append(title, desc);
    if (prereqText) {
      const prereqEl = document.createElement("div");
      prereqEl.className = "muted optionDesc";
      prereqEl.textContent = `Prerequisite: ${prereqText}`;
      textWrap.append(prereqEl);
    }
    if (isUnavailable) {
      const failureEl = document.createElement("div");
      failureEl.className = "muted optionDesc";
      failureEl.textContent = prereqCheck.failureReasons[0] || "Prerequisites not met.";
      textWrap.append(failureEl);
    }

    row.append(cb, textWrap);
    list.append(row);

    if (cb.checked && isOptionGroup(feat)) {
      list.append(createOptionGroupElement(feat, selectedFeatOptionKeys, renderFeats, 1, { context: "feat" }));
    }
  }

  featsEl.append(list);
  if (!list.children.length) {
    featsEl.innerHTML = `<p class="muted">No selectable feats match the current filters.</p>`;
  }
  updateDisables();
  setPrerequisiteNotice(featPrereqNoticeEl, unavailableFeatCount, hiddenUnavailableFeatCount);
}

function updateUiForSelection() {
  const cls = getClassByKey(selectedClassKey);
  const selectable = classSelectableInfo(cls);

  setIncompleteBanner(!!cls && !selectable.ok, selectable.reason);

  // Disable controls if incomplete
  // Even if a class is "Coming Soon", allow saving (warn on save instead of blocking).
  const dim = !!cls && !selectable.ok;
  if (primaryEl) primaryEl.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
  if (saveAndOpenBtn) saveAndOpenBtn.disabled = false;
  if (featuresEl) featuresEl.style.opacity = dim ? "0.6" : "1";
  if (featsEl) featsEl.style.opacity = dim ? "0.6" : "1";

  renderPrimaryOptions();
  renderClassDetails();
  pruneSelectionsForLevel();
  pruneUnavailableSelectionsForPrerequisites();
  renderFeatures();
  renderFeats();
}

async function saveClassStep({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  pruneUnavailableSelectionsForPrerequisites();
  const { errors, warnings } = getSaveIssues();
  if (errors.length) {
    showError(errorEl, errors.join(" "));
    setStatus(statusEl, "Not saved.");
    return false;
  }

  if (warnings.length) {
    const ok = await confirmSaveWarnings({
      title: "Some information is incomplete",
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
    const prevClassKey = String(currentDoc?.builder?.classKey || "");
    const classChanged = !!selectedClassKey && !!prevClassKey && prevClassKey !== selectedClassKey;

    // Always enforce pruning at save time (manual saves and navigation saves).
    pruneSelectionsForLevel();
    pruneUnavailableSelectionsForPrerequisites();

    const autoAbilities = buildAutoAbilities();
    const autoNames = autoAbilities.map((a) => a.name);
    const oldAutoNames = currentDoc?.builder?.autoAbilityNames || [];
    const existingAbilities = currentDoc?.builder?.sheet?.repeatables?.abilities || [];
    const mergedAbilities = mergeAbilities(existingAbilities, oldAutoNames, autoAbilities);

    const staticPatch = {
      "builder.level": clampLevel(selectedLevel),
      "builder.classKey": sanitizeText(selectedClassKey, { maxLen: 64 }),
      "builder.primaryAttribute": sanitizeText(selectedPrimary, { maxLen: 32 }),
      "builder.selectedClassFeatureOptions": Array.from(selectedFeatureOptionKeys),
      "builder.selectedFeats": Array.from(selectedFeatNames),
      "builder.selectedFeatOptions": Array.from(selectedFeatOptionKeys),
      ...(classChanged ? { "builder.selectedTechniques": [] } : {}),
      "builder.autoAbilityNames": autoNames,
      "builder.sheet.repeatables.abilities": mergedAbilities,
    };
    const widgetPatch = classPage.getWidgetSavePatch({ currentDoc, grantChoices });
    const patch = { ...staticPatch, ...widgetPatch };

    await saveCharacterPatch(charRef, patch);
    await markStepVisited(charRef, CURRENT_STEP_ID);

    // Update local cache
    const prevBuilder = currentDoc.builder || {};
    const prevSheet = (prevBuilder.sheet && typeof prevBuilder.sheet === "object") ? prevBuilder.sheet : {};
    const prevRepeatables =
      (prevSheet.repeatables && typeof prevSheet.repeatables === "object") ? prevSheet.repeatables : {};

    currentDoc.builder = {
      ...prevBuilder,
      level: clampLevel(selectedLevel),
      classKey: selectedClassKey,
      primaryAttribute: selectedPrimary,
      selectedClassFeatureOptions: Array.from(selectedFeatureOptionKeys),
      selectedFeats: Array.from(selectedFeatNames),
      selectedFeatOptions: Array.from(selectedFeatOptionKeys),
      grantChoices: patch["builder.grantChoices"] || grantChoices,
      weapons: patch["builder.weapons"] || prevBuilder.weapons || [],
      ...(classChanged ? { selectedTechniques: [] } : {}),
      autoAbilityNames: autoNames,
      sheet: {
        ...prevSheet,
        repeatables: {
          ...prevRepeatables,
          abilities: mergedAbilities,
        },
      },
    };

    setStatus(statusEl, "Saved.");

    if (openSheetAfter) openCharacterSheet(ctx);

    return true;
  } catch (e) {
    console.error(e);
    showError(errorEl, "Could not save.");
    setStatus(statusEl, "Error.");
    return false;
  }
}

function renderNav() {
  // Render nav on both top and bottom.
  const navArgs = {
    currentStepId: CURRENT_STEP_ID,
    characterDoc: currentDoc,
    ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
    onBeforeNavigate: async () => {
      // Auto-save before navigation (warn, but allow).
      return await saveClassStep({ openSheetAfter: false, intent: "navigate" });
    },
  };

  renderBuilderNavMounts(navArgs);
}

async function main() {
  try {
    ctx = await initBuilderAuth({
      signOutBtn,
      gmHintEl,
      statusEl,
      errorEl,
    });

    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    gameData = await loadGameXData();
    weaponBases = getGameXWeaponBases(gameData).slice().sort(compareByName);
    weaponEnhancements = getGameXWeaponEnhancements(gameData).slice().sort(compareByName);

    // Populate dropdown
    const classes = getGameXClasses(gameData).slice();
    classes.sort((a, b) => String(a?.name || a?.classKey || "").localeCompare(String(b?.name || b?.classKey || "")));

    classSelectEl.innerHTML = `<option value="">— Choose —</option>` +
      classes
        .map((c) => {
          const info = classSelectableInfo(c);
          const label = `${sanitizeText(c.name || c.classKey, { maxLen: 200 })}${info.ok ? "" : " (Coming Soon)"}`;
          return `<option value="${sanitizeText(c.classKey, { maxLen: 64 })}">${label}</option>`;
        })
        .join("");

    // Hydrate state from doc
    selectedLevel = clampLevel(currentDoc?.builder?.level || 1);
    if (levelEl) levelEl.value = String(selectedLevel);

    selectedClassKey = String(currentDoc?.builder?.classKey || "");
    selectedPrimary = String(currentDoc?.builder?.primaryAttribute || "");
    selectedFeatureOptionKeys = new Set(Array.isArray(currentDoc?.builder?.selectedClassFeatureOptions) ? currentDoc.builder.selectedClassFeatureOptions : []);
    selectedFeatNames = new Set(Array.isArray(currentDoc?.builder?.selectedFeats) ? currentDoc.builder.selectedFeats : []);
    selectedFeatOptionKeys = new Set(Array.isArray(currentDoc?.builder?.selectedFeatOptions) ? currentDoc.builder.selectedFeatOptions : []);
    grantChoices = (currentDoc?.builder?.grantChoices && typeof currentDoc.builder.grantChoices === "object") ? { ...currentDoc.builder.grantChoices } : {};

    if (selectedClassKey) classSelectEl.value = selectedClassKey;

    // Wire events
    classSelectEl.addEventListener("change", () => {
      selectedClassKey = String(classSelectEl.value || "");
      // Reset selections when switching classes (but keep level)
      selectedPrimary = "";
      selectedFeatureOptionKeys = new Set();
      selectedFeatNames = new Set();
      selectedFeatOptionKeys = new Set();
      grantChoices = {};
      updateUiForSelection();
      renderNav();
    });

    levelEl.addEventListener("change", () => {
      selectedLevel = clampLevel(levelEl.value);
      pruneSelectionsForLevel();
      updateUiForSelection();
      renderNav();
    });

    primaryEl.addEventListener("change", () => {
      selectedPrimary = String(primaryEl.value || "");
    });

    showUnavailableFeaturesEl?.addEventListener("change", renderFeatures);
    showUnavailableFeatsEl?.addEventListener("change", renderFeats);

    saveBtn.addEventListener("click", () => saveClassStep({ openSheetAfter: false, intent: "save" }));
    saveAndOpenBtn.addEventListener("click", () => saveClassStep({ openSheetAfter: true, intent: "save" }));

    updateUiForSelection();
    renderNav();
    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading class step.");
    setStatus(statusEl, "Error.");
  }
}

main();
