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
  markBuilderNavigationClean,
} from "./builder-common.js";

import { renderBuilderNavMounts } from "./builder-nav.js";
import { BuilderPage } from "./builder-page.js";
import { GrantChoiceState } from "./grant-choice-state.js";
import { ClassChoiceWidget } from "./widgets/class-choice-widget.js";
import { ClassFeaturesWidget } from "./widgets/class-features-widget.js";
import { FeatsWidget } from "./widgets/feats-widget.js";
import { GrantChoicesWidget } from "./widgets/grant-choices-widget.js";
import { createGrantWidgets } from "./widgets/grant-widget-factory.js";
import { LevelChoiceWidget } from "./widgets/level-choice-widget.js";
import { OptionGroupWidget } from "./widgets/option-group-widget.js";
import { PrimaryAttributeWidget } from "./widgets/primary-attribute-widget.js";

import { loadGameXData, getGameXClasses, getGameXClassFeatures, getGameXFeats, getGameXWeaponBases, getGameXWeaponEnhancements } from "../core/game-data.js";

import { ATTR_KEYS, clampLevel, coerceAttrKey, labelForAttrKey } from "../core/character-rules.js";
import { buildBuilderWithPatch, reconcileBuilderChange, summarizeDependencyChanges, summarizeDependencyRemovals } from "../core/builder-dependencies.js";
import { sanitizeText } from "../core/data-sanitization.js";
import { checkPrerequisites } from "../core/prerequisites.js";
import {
  collectSelectedEntries,
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

let primaryAttributeWidget = null;
let classFeaturesWidget = null;
let featsWidget = null;

class ClassBuilderPage extends BuilderPage {}

const classPage = new ClassBuilderPage({
  stepId: CURRENT_STEP_ID,
  getSaveContext: () => ({
    currentDoc,
    grantChoices,
  }),
  getGameData: () => gameData,
  getBuilder: () => currentDoc?.builder || {},
  onWorkingBuilderChange: (builder) => {
    currentDoc = currentDoc || {};
    currentDoc.builder = builder;
    applyReconciledChoiceState(builder);
  },
  filterImmediateWarnings: (preview) => getImmediateDependencyWarnings(preview),
  confirmDependencyPreview: async ({ warnings }) => {
    if (!warnings.length) return true;
    return await confirmSaveWarnings({
      title: "Apply this change?",
      warnings,
      okText: "Apply Change",
      cancelText: "Cancel",
    });
  },
  applyReconciledBuilder: (builder) => {
    applyReconciledChoiceState(builder);
  },
});
new GrantChoicesWidget(classPage, {
  getGrantChoices: () => grantChoices,
  getExistingWeapons: () => currentDoc?.builder?.weapons || [],
});
new OptionGroupWidget(classPage, {
  id: "feat-option-collection",
  storagePath: "builder.selectedFeatOptions",
  getSelectedKeys: () => selectedFeatOptionKeys,
  scope: "page",
});
const grantChoiceState = new GrantChoiceState({
  getChoices: () => grantChoices,
  setChoices: (next) => {
    grantChoices = next;
  },
  onChange: () => {
    renderFeatures();
    renderFeats();
  },
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
    ...classPage.getWorkingBuilder(),
    level: clampLevel(selectedLevel),
    classKey: selectedClassKey,
    primaryAttribute: selectedPrimary,
    selectedClassFeatureOptions: Array.from(selectedFeatureOptionKeys),
    selectedFeats: Array.from(selectedFeatNames),
    selectedFeatOptions: Array.from(selectedFeatOptionKeys),
    grantChoices,
  };
}

function applyReconciledChoiceState(builder = {}) {
  if (typeof builder.classKey !== "undefined") {
    selectedClassKey = String(builder.classKey || "");
  }
  if (typeof builder.primaryAttribute !== "undefined") {
    selectedPrimary = String(builder.primaryAttribute || "");
  }
  if (typeof builder.level !== "undefined") {
    selectedLevel = clampLevel(builder.level || 1);
    if (levelEl) levelEl.value = String(selectedLevel);
  }
  if (Array.isArray(builder.selectedClassFeatureOptions)) {
    selectedFeatureOptionKeys = new Set(builder.selectedClassFeatureOptions);
  }
  if (Array.isArray(builder.selectedFeats)) {
    selectedFeatNames = new Set(builder.selectedFeats);
  }
  if (Array.isArray(builder.selectedFeatOptions)) {
    selectedFeatOptionKeys = new Set(builder.selectedFeatOptions);
  }
  if (builder.grantChoices && typeof builder.grantChoices === "object") {
    grantChoices = { ...builder.grantChoices };
  }
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

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""));
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

  }

  const previewPatch = classPage.getWidgetSavePatch({ currentDoc, grantChoices });
  const preview = classPage.previewChoiceChange(previewPatch);
  const dependencyWarnings = getPageDependencyWarnings(preview, previewPatch);
  warnings.push(...dependencyWarnings);
  errors.push(...preview.errors);

  if (classChanged && levelDecreased && !dependencyWarnings.length) {
    warnings.push(`Changing class and reducing level may require reviewing later builder choices.`);
  }

  return { errors, warnings };
}

function getImmediateDependencyWarnings(preview) {
  return summarizeDependencyRemovals(preview?.changes);
}

function getPageDependencyWarnings(preview, pagePatch = {}) {
  const pagePaths = new Set(Object.keys(pagePatch || {}));
  const changes = Array.isArray(preview?.changes) ? preview.changes : [];
  return summarizeDependencyChanges(changes.filter((change) => {
    if (change?.type !== "incomplete") return true;
    return pagePaths.has(change.storagePath);
  }));
}

function buildAutoAbilities(builderState = null) {
  /** @type {{name: string, text: string}[]} */
  const out = [];
  const state = builderState && typeof builderState === "object" ? builderState : getClassStepBuilderState();
  const classKey = String(state.classKey || "");
  const level = clampLevel(state.level || 1);
  const featureOptionKeys = new Set(Array.isArray(state.selectedClassFeatureOptions) ? state.selectedClassFeatureOptions : []);
  const featNames = new Set(Array.isArray(state.selectedFeats) ? state.selectedFeats : []);
  const featOptionKeys = new Set(Array.isArray(state.selectedFeatOptions) ? state.selectedFeatOptions : []);

  if (!classKey) return out;

  const visible = computeVisibleClassFeatures(classKey, level);

  for (const f of visible) {
    if (String(f?.type) !== "feature") continue;
    const n = String(f?.name || "").trim();
    if (!n) continue;
    out.push({
      name: `Class Feature - ${n}`,
      text: String(f?.description || "").trim(),
    });
  }

  for (const option of collectSelectedEntries(visible, featureOptionKeys)) {
    const n = String(option?.name || "").trim();
    if (!n) continue;
    out.push({
      name: `Class Feature - ${n}`,
      text: String(option?.description || "").trim(),
    });
  }

  const visibleFeats = computeVisibleFeats(classKey, level);
  const featByName = new Map(visibleFeats.map((f) => [String(f?.name || "").trim(), f]));

  for (const name of Array.from(featNames)) {
    const feat = featByName.get(name);
    if (!feat) continue;
    out.push({
      name: `Feat - ${name}`,
      text: String(feat?.description || "").trim(),
    });
  }

  const selectedFeats = Array.from(featNames)
    .map((name) => featByName.get(name))
    .filter(Boolean);
  for (const option of collectSelectedEntries(selectedFeats, featOptionKeys)) {
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
  if (primaryAttributeWidget) {
    primaryAttributeWidget.render();
    if (primaryEl) selectedPrimary = String(primaryEl.value || "");
    return;
  }
  if (!primaryEl) return;
  const cls = getClassByKey(selectedClassKey);
  const allowed = getAllowedPrimaryAttributes(cls);

  primaryEl.replaceChildren();
  for (const key of allowed) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = labelForAttrKey(key) || (key[0].toUpperCase() + key.slice(1));
    primaryEl.append(option);
  }
  if (selectedPrimary && allowed.includes(/** @type {any} */ (selectedPrimary))) {
    primaryEl.value = selectedPrimary;
  } else {
    selectedPrimary = allowed[0] || "";
    primaryEl.value = selectedPrimary;
  }
}

function renderClassDetails() {
  if (!classDetailsEl) return;
  classDetailsEl.replaceChildren();
  const cls = getClassByKey(selectedClassKey);
  if (!cls) {
    classDetailsEl.textContent = "Select a class to view details.";
    return;
  }

  const title = document.createElement("div");
  const titleText = document.createElement("strong");
  titleText.textContent = sanitizeText(cls.name || cls.classKey || "Class", { maxLen: 200 });
  title.append(titleText);
  classDetailsEl.append(title);

  const appendDetail = (value, { label = "", primary = false } = {}) => {
    const line = document.createElement("div");
    line.className = `muted classDetailLine${primary ? " classDetailLine--primary" : ""}`;
    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "muted";
      labelEl.textContent = `${label}: `;
      line.append(labelEl);
    }
    line.append(document.createTextNode(value));
    classDetailsEl.append(line);
  };

  if (cls.pitch) appendDetail(sanitizeText(cls.pitch, { maxLen: 1200 }));
  if (cls.examples) appendDetail(sanitizeText(cls.examples, { maxLen: 500 }), { label: "Examples" });
  if (cls.notes) appendDetail(sanitizeText(cls.notes, { maxLen: 800 }), { label: "Notes" });


  const allowed = getAllowedPrimaryAttributes(cls);
  if (allowed.length) {
    const labels = allowed.map((k) => labelForAttrKey(k) || k);
    appendDetail(labels.join(" / "), { label: "Primary Attributes", primary: true });
  }
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

function inferGrantWidgetSourceId(entry, {
  scope = "feature",
  sourceId = "",
  storagePath = "",
  optionKey = "",
} = {}) {
  const provided = sanitizeText(sourceId, { maxLen: 260, collapse: true });
  if (provided) return provided;
  const key = sanitizeText(optionKey, { maxLen: 240, collapse: true });
  if (storagePath && key) return `choice:${storagePath}:${key}`;
  if (scope === "feat") {
    const featName = sanitizeText(entry?.name || "", { maxLen: 160, collapse: true });
    return featName ? `feat:${featName}` : "";
  }
  const featureKey = sanitizeText(entry?.featureKey || entry?.name || "", { maxLen: 240, collapse: true });
  return featureKey ? `classFeature:${featureKey}` : "";
}

function createGrantChoiceWidgets(entry, options = {}) {
  const sourceId = inferGrantWidgetSourceId(entry, options);
  const optionKeys = options.scope === "feat" ? selectedFeatOptionKeys : selectedFeatureOptionKeys;
  const widgets = createGrantWidgets({
    page: classPage,
    entry,
    grantChoiceState,
    weaponBases,
    weaponEnhancements,
    grantContextEntries: computeVisibleClassFeatures(selectedClassKey, selectedLevel),
    getSelectedEntries: (entry) => collectSelectedEntries([entry], optionKeys),
    prerequisiteContext: { gameData, builder: getClassStepBuilderState() },
    gameData,
    getBuilder: getClassStepBuilderState,
    getGrantChoices: () => grantChoices,
    getExistingWeapons: () => currentDoc?.builder?.weapons || [],
    sourceId,
    scope: options.scope || "features",
    onChange: () => {
      updateUiForSelection();
      renderNav();
    },
  });
  if (!widgets.length) return null;

  const container = document.createElement("div");
  container.className = "grantChoiceWidgets";
  for (const widget of widgets) container.append(widget.element);

  return container.childElementCount ? container : null;
}

function createOptionGroupElement(group, selectedKeys, onChange, depth = 0, {
  context = "feature",
  trackUnavailable = null,
  isActive = null,
} = {}) {
  return new OptionGroupWidget(classPage, {
    group,
    selectedKeys,
    storagePath: context === "feat" ? "builder.selectedFeatOptions" : "builder.selectedClassFeatureOptions",
    onChange,
    depth,
    context,
    collapsedGroups,
    showUnavailable: context === "feat" ? showUnavailableFeats() : showUnavailableFeatures(),
    checkEntryPrerequisites,
    trackUnavailable,
    createGrantWidgets: createGrantChoiceWidgets,
    setStatus: (message) => setStatus(statusEl, message),
    isActive: typeof isActive === "function" ? isActive : (dependencyContext = {}) => {
      if (context !== "feat") return true;
      const builder = dependencyContext.reconciledBuilder || dependencyContext.proposedBuilder || getClassStepBuilderState();
      const selectedFeats = Array.isArray(builder.selectedFeats) ? builder.selectedFeats : [];
      return selectedFeats.includes(String(group?.name || "").trim());
    },
    scope: context,
  }).element;
}

function renderFeatures() {
  classFeaturesWidget?.render();
}

function renderFeats() {
  featsWidget?.render();
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
  renderFeatures();
  renderFeats();
}

async function saveClassStep({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

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
    const widgetPatch = classPage.getWidgetSavePatch({ currentDoc, grantChoices });
    const reconciliation = reconcileBuilderChange(gameData, classPage.getWorkingBuilder(), widgetPatch);
    const autoAbilities = buildAutoAbilities(reconciliation.reconciledBuilder);
    const autoNames = autoAbilities.map((a) => a.name);
    const oldAutoNames = currentDoc?.builder?.autoAbilityNames || [];
    const existingAbilities = currentDoc?.builder?.sheet?.repeatables?.abilities || [];
    const existingRepeatables = (currentDoc?.builder?.sheet?.repeatables && typeof currentDoc.builder.sheet.repeatables === "object")
      ? currentDoc.builder.sheet.repeatables
      : {};
    const dependencyRepeatables = (reconciliation.patch["builder.sheet.repeatables"] && typeof reconciliation.patch["builder.sheet.repeatables"] === "object")
      ? reconciliation.patch["builder.sheet.repeatables"]
      : existingRepeatables;
    const mergedAbilities = mergeAbilities(existingAbilities, oldAutoNames, autoAbilities);
    const staticPatch = {
      "builder.autoAbilityNames": autoNames,
      "builder.sheet.repeatables": {
        ...dependencyRepeatables,
        abilities: mergedAbilities,
      },
    };
    const patch = { ...reconciliation.patch, ...staticPatch };

    await saveCharacterPatch(charRef, patch);
    await markStepVisited(charRef, CURRENT_STEP_ID);

    // Update local cache
    const prevBuilder = classPage.getWorkingBuilder();
    classPage.setWorkingBuilder(buildBuilderWithPatch(prevBuilder, patch));
    selectedFeatureOptionKeys = new Set(Array.isArray(currentDoc.builder.selectedClassFeatureOptions) ? currentDoc.builder.selectedClassFeatureOptions : []);
    selectedFeatNames = new Set(Array.isArray(currentDoc.builder.selectedFeats) ? currentDoc.builder.selectedFeats : []);
    selectedFeatOptionKeys = new Set(Array.isArray(currentDoc.builder.selectedFeatOptions) ? currentDoc.builder.selectedFeatOptions : []);
    grantChoices = (currentDoc.builder.grantChoices && typeof currentDoc.builder.grantChoices === "object") ? { ...currentDoc.builder.grantChoices } : {};

    setStatus(statusEl, "Saved.");
    markBuilderNavigationClean();

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
    classPage.hydrateBuilder(currentDoc?.builder || {});

    // Hydrate state from doc
    selectedLevel = clampLevel(currentDoc?.builder?.level || 1);
    if (levelEl) levelEl.value = String(selectedLevel);

    selectedClassKey = String(currentDoc?.builder?.classKey || "");
    selectedPrimary = String(currentDoc?.builder?.primaryAttribute || "");
    selectedFeatureOptionKeys = new Set(Array.isArray(currentDoc?.builder?.selectedClassFeatureOptions) ? currentDoc.builder.selectedClassFeatureOptions : []);
    selectedFeatNames = new Set(Array.isArray(currentDoc?.builder?.selectedFeats) ? currentDoc.builder.selectedFeats : []);
    selectedFeatOptionKeys = new Set(Array.isArray(currentDoc?.builder?.selectedFeatOptions) ? currentDoc.builder.selectedFeatOptions : []);
    grantChoices = (currentDoc?.builder?.grantChoices && typeof currentDoc.builder.grantChoices === "object") ? { ...currentDoc.builder.grantChoices } : {};

    new ClassChoiceWidget(classPage, {
      selectEl: classSelectEl,
      classes: getGameXClasses(gameData),
      getValue: () => selectedClassKey,
      setValue: (value) => {
        selectedClassKey = String(value || "");
      },
      getClassInfo: classSelectableInfo,
      onChange: () => {
        updateUiForSelection();
        renderNav();
      },
    });

    new LevelChoiceWidget(classPage, {
      selectEl: levelEl,
      getValue: () => clampLevel(selectedLevel),
      setValue: (value) => {
        selectedLevel = clampLevel(value);
      },
      onChange: (nextLevel, preview) => {
        updateUiForSelection();
        renderNav();
      },
    });

    primaryAttributeWidget = new PrimaryAttributeWidget(classPage, {
      selectEl: primaryEl,
      getOptions: () => getAllowedPrimaryAttributes(getClassByKey(selectedClassKey)),
      getOptionLabel: (key) => labelForAttrKey(key) || (String(key).charAt(0).toUpperCase() + String(key).slice(1)),
      getValue: () => {
        const allowed = getAllowedPrimaryAttributes(getClassByKey(selectedClassKey));
        return selectedPrimary && allowed.includes(/** @type {any} */ (selectedPrimary)) ? selectedPrimary : (allowed[0] || "");
      },
      setValue: (value) => {
        selectedPrimary = String(value || "");
      },
    });

    classFeaturesWidget = new ClassFeaturesWidget(classPage, {
      containerEl: featuresEl,
      hintEl: featureHintEl,
      prereqNoticeEl: featurePrereqNoticeEl,
      getClassKey: () => selectedClassKey,
      getLevel: () => clampLevel(selectedLevel),
      getSelectedFeatureOptionKeys: () => selectedFeatureOptionKeys,
      setSelectedFeatureOptionKeys: (next) => {
        selectedFeatureOptionKeys = next instanceof Set ? next : new Set(next || []);
      },
      getAvailableFeatures: ({ gameData: data = gameData, builder = {} } = {}) => {
        const classKey = builder.classKey ?? selectedClassKey;
        const level = builder.level ?? selectedLevel;
        const L = clampLevel(level);
        return getGameXClassFeatures(data || gameData, classKey)
          .filter((feature) => Number(feature?.level || 0) <= L);
      },
      showUnavailable: showUnavailableFeatures,
      checkEntryPrerequisites,
      renderOptionGroup: createOptionGroupElement,
      renderGrantWidgets: createGrantChoiceWidgets,
    });

    featsWidget = new FeatsWidget(classPage, {
      containerEl: featsEl,
      hintEl: featHintEl,
      prereqNoticeEl: featPrereqNoticeEl,
      getClassKey: () => selectedClassKey,
      getLevel: () => clampLevel(selectedLevel),
      getSelectedFeatNames: () => selectedFeatNames,
      setSelectedFeatNames: (next) => {
        selectedFeatNames = next instanceof Set ? next : new Set(next || []);
      },
      getSelectedFeatOptionKeys: () => selectedFeatOptionKeys,
      setSelectedFeatOptionKeys: (next) => {
        selectedFeatOptionKeys = next instanceof Set ? next : new Set(next || []);
      },
      getAvailableFeats: ({ gameData: data = gameData, builder = {} } = {}) => {
        const classKey = builder.classKey ?? selectedClassKey;
        const level = builder.level ?? selectedLevel;
        const feats = Array.isArray(data?.feats) ? data.feats : getGameXFeats(gameData);
        const L = clampLevel(level);
        return feats
          .filter((feat) => String(feat?.classKey || "") === String(classKey || ""))
          .filter((feat) => Number(feat?.minLevel || 0) <= L);
      },
      getFeatSlots,
      showUnavailable: showUnavailableFeats,
      checkEntryPrerequisites,
      renderOptionGroup: (group) => createOptionGroupElement(group, selectedFeatOptionKeys, renderFeats, 1, { context: "feat" }),
      setStatus: (message) => setStatus(statusEl, message),
      onChange: renderFeats,
    });

    // Wire events
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
