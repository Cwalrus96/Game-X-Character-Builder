// public/builder-class.js
// Class selection step: class, level, primary attribute, class feature options, and feats.

import {
  initBuilderAuth,
  openCharacterSheet,
  setStatus,
  showError,
  clearError,
  confirmSaveWarnings,
  ensureBuilderShellUi,
  markBuilderNavigationClean,
} from "./builder-common.js";

import { renderBuilderNavMounts } from "./builder-nav.js";
import { getBuilderStepInformationalMessages } from "./builder-step-impacts.js?v=wpe11";
import { CharacterSessionPage } from "./character-session-page.js?v=wpe10";
import { GrantChoiceState } from "./grant-choice-state.js";
import { ClassChoiceWidget } from "./widgets/class-choice-widget.js?v=wpe1";
import { ClassFeaturesWidget } from "./widgets/class-features-widget.js";
import { GrantChoicesWidget } from "./widgets/grant-choices-widget.js";
import { createGrantWidgets } from "./widgets/grant-widget-factory.js?v=wpe8";
import { LevelChoiceWidget } from "./widgets/level-choice-widget.js?v=wpe1";
import { OptionGroupWidget } from "./widgets/option-group-widget.js?v=wpe7";
import { PrimaryAttributeWidget } from "./widgets/primary-attribute-widget.js?v=wpe1";
import { TraitWidget } from "./widgets/trait-widget.js";

import { loadGameXData, getGameXClasses, getGameXClassFeatures, getGameXWeaponBases, getGameXWeaponEnhancements } from "../core/game-data.js?v=wpe1";

import { ATTR_KEYS, clampLevel, coerceAttrKey, labelForAttrKey } from "../core/character-rules.js?v=wpe1";
import { SetClass, SetGrantChoices, VisitBuilderStep } from "../core/character-commands.js?v=wpe1";
import { readCharacter } from "../core/database-reader.js?v=wpe6";
import { replaceCharacter } from "../core/database-writer.js?v=wpe1";
import { reconcileCharacterGraph } from "../core/graph-reconciler.js?v=wpe10";
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
const expandedFeatChoices = new Set();

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
const featureHintEl = document.getElementById("featureHint");
const showUnavailableFeaturesEl = document.getElementById("showUnavailableFeatures");

const incompleteBannerEl = document.getElementById("classIncompleteBanner");
const incompleteReasonEl = document.getElementById("classIncompleteReason");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

let primaryAttributeWidget = null;
let classFeaturesWidget = null;

let classPage = null;
const grantChoiceState = new GrantChoiceState({
  getChoices: () => grantChoices,
  setChoices: (next) => {
    grantChoices = next;
  },
  onChange: async () => {
    const acceptedChoices = classPage?.getCharacter()?.builder?.grantChoices || {};
    const result = await classPage?.requestCharacterCommand?.(null, SetGrantChoices(grantChoices));
    if (result && !result.ok) grantChoices = { ...acceptedChoices };
    renderFeatures();
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

function computeVisibleClassFeatures(classKey, level) {
  const all = getGameXClassFeatures(gameData, classKey);
  const L = clampLevel(level);
  return all.filter((f) => Number(f?.level || 0) <= L);
}

function getClassStepBuilderState() {
  return {
    ...(classPage?.getCharacter()?.builder || currentDoc?.builder || {}),
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
  return !!showUnavailableFeaturesEl?.checked;
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

  const reconciliation = reconcileCharacterGraph({
    character: classPage.getCharacter(),
    previousCharacter: classPage.getCharacter(),
    gameData,
  });
  errors.push(...reconciliation.impacts
    .filter((impact) => impact.category === "error")
    .map((impact) => impact.message || impact.code));
  warnings.push(...getBuilderStepInformationalMessages(reconciliation, CURRENT_STEP_ID));

  return { errors, warnings };
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
  const key = sanitizeText(optionKey, { maxLen: 240, collapse: true });
  if (scope === "feat") {
    if (key) return `feat-option:${key}`;
    const featKey = sanitizeText(entry?.featKey || "", { maxLen: 128, collapse: true });
    return featKey ? `feat-selection:${featKey}` : provided;
  }
  if (key) return `class-option:${selectedClassKey}:${key}`;
  const featureKey = sanitizeText(entry?.featureKey || entry?.name || "", { maxLen: 240, collapse: true });
  return featureKey ? `class-feature:${selectedClassKey}:${featureKey}` : provided;
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
    scope: options.widgetScope || options.scope || "features",
    expandedChoices: expandedFeatChoices,
    showUnavailable: showUnavailableFeatures,
    renderFeatOptions: (feat, widgetScope) => createOptionGroupElement(
      feat, selectedFeatOptionKeys, updateUiForSelection, 0, { context: "feat", widgetScope },
    ),
    renderFeatGrants: (feat, widgetScope) => createGrantChoiceWidgets(feat, { scope: "feat", widgetScope }),
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
  widgetScope = context,
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
    showUnavailable: showUnavailableFeatures(),
    checkEntryPrerequisites,
    trackUnavailable,
    createGrantWidgets: (entry, options) => createGrantChoiceWidgets(entry, { ...options, widgetScope }),
    setStatus: (message) => setStatus(statusEl, message),
    isActive: typeof isActive === "function" ? isActive : (dependencyContext = {}) => {
      if (context !== "feat") return true;
      const builder = dependencyContext.reconciledBuilder || dependencyContext.proposedBuilder || getClassStepBuilderState();
      const selectedFeats = Array.isArray(builder.selectedFeats) ? builder.selectedFeats : [];
      return selectedFeats.includes(String(group?.featKey || "").trim());
    },
    scope: widgetScope,
  }).element;
}

function renderFeatures() {
  classFeaturesWidget?.render();
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

  renderPrimaryOptions();
  renderClassDetails();
  renderFeatures();
}

async function saveClassStep({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const refresh = await classPage.requestCharacterCommand(
    null,
    SetClass(classPage.getCharacter().builder.classKey),
  );
  if (!refresh.ok) {
    if (refresh.reason !== "cancelled") showError(errorEl, refresh.errors?.join(" ") || "The character could not be reconciled.");
    setStatus(statusEl, "Not saved.");
    return false;
  }

  const { errors, warnings } = getSaveIssues();
  if (errors.length) {
    showError(errorEl, errors.join(" "));
    setStatus(statusEl, "Not saved.");
    return false;
  }

  if (warnings.length) {
    const ok = await confirmSaveWarnings({
      title: "Some information is incomplete",
      warnings: Array.from(new Set(warnings)),
      okText: intent === "navigate" ? "Save and Continue" : "Save",
      cancelText: "Cancel",
    });
    if (!ok) {
      setStatus(statusEl, "Not saved.");
      return false;
    }
  }

  const visited = await classPage.requestCharacterCommand(null, VisitBuilderStep(CURRENT_STEP_ID));
  if (!visited.ok) {
    showError(errorEl, visited.errors?.join(" ") || "The visited builder step could not be recorded.");
    setStatus(statusEl, "Not saved.");
    return false;
  }

  const saved = await classPage.save((snapshot) => replaceCharacter({
    ownerUid: ctx.editingUid,
    characterId: ctx.charId,
    character: snapshot.character,
    expectedRevision: snapshot.expectedRevision,
  }));
  if (!saved.ok) {
    console.error(saved.error);
    showError(errorEl, saved.error?.code === "character-revision-conflict"
      ? "This character changed in another tab. Reload before saving again."
      : "Could not save.");
    setStatus(statusEl, "Error.");
    return false;
  }

  currentDoc = saved.state.working;
  applyReconciledChoiceState(currentDoc.builder);
  setStatus(statusEl, "Saved.");
  markBuilderNavigationClean();
  if (openSheetAfter) openCharacterSheet(ctx);
  return true;
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

    gameData = await loadGameXData();
    weaponBases = getGameXWeaponBases(gameData).slice().sort(compareByName);
    weaponEnhancements = getGameXWeaponEnhancements(gameData).slice().sort(compareByName);
    const loaded = await readCharacter({
      ownerUid: ctx.editingUid,
      characterId: ctx.charId,
      gameData,
    });
    currentDoc = loaded.character;
    classPage = new CharacterSessionPage({
      character: loaded.character,
      revision: loaded.revision,
      metadata: loaded.metadata,
      gameData,
      confirmImpacts: async ({ messages }) => confirmSaveWarnings({
        title: "Apply this change?",
        warnings: messages,
        okText: "Apply Change",
        cancelText: "Cancel",
      }),
      onCommandRejected: ({ errors }) => showError(errorEl, errors.join(" ") || "That change is not valid."),
      onStateChange: (state) => {
        currentDoc = state.working;
        applyReconciledChoiceState(currentDoc.builder);
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
        return selectedPrimary && allowed.includes(/** @type {any} */ (selectedPrimary)) ? selectedPrimary : "";
      },
      setValue: (value) => {
        selectedPrimary = String(value || "");
      },
    });

    classFeaturesWidget = new ClassFeaturesWidget(classPage, {
      containerEl: featuresEl,
      hintEl: featureHintEl,
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

    const traitMount = document.createElement("section");
    traitMount.className = "card";
    traitMount.setAttribute("aria-label", "Traits supplied by your features");
    featuresEl.closest("section").after(traitMount);
    new TraitWidget(classPage, { gameData, mount: traitMount });

    // Wire events
    showUnavailableFeaturesEl?.addEventListener("change", renderFeatures);

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
