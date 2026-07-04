// public/builder-techniques.js
// Techniques selection step. Technique-specific behavior lives in TechniquesWidget.

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
import { TechniquesWidget } from "./widgets/techniques-widget.js";

import { buildBuilderWithPatch, reconcileBuilderChange } from "../core/builder-dependencies.js";
import {
  loadGameXData,
  getGameXTechniques,
  buildTechniqueIndexes,
} from "../core/game-data.js";

const CURRENT_STEP_ID = "techniques";

ensureBuilderShellUi();

const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const slotHintEl = document.getElementById("slotHint");
const slotPillsEl = document.getElementById("slotPills");
const techSearchEl = document.getElementById("techSearch");
const filterKnownSkillsEl = document.getElementById("filterKnownSkills");
const knownSkillsHelpEl = document.getElementById("knownSkillsHelp");
const missingListEl = document.getElementById("missingList");
const techniqueGroupsEl = document.getElementById("techniqueGroups");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

/** @type {any} */
let ctx = null;
/** @type {any} */
let charRef = null;
/** @type {any} */
let currentDoc = null;
/** @type {any} */
let gameData = null;
/** @type {{ byName: Map<string, any>, byNorm: Map<string, any[]> } | null} */
let techIndexes = null;
/** @type {Set<string>} */
let selectedTechniques = new Set();
/** @type {TechniquesWidget | null} */
let techniquesWidget = null;

class TechniquesBuilderPage extends BuilderPage {}

const techniquesPage = new TechniquesBuilderPage({
  stepId: CURRENT_STEP_ID,
  getGameData: () => gameData,
  getBuilder: () => currentDoc?.builder || {},
  applyReconciledBuilder: (builder) => {
    if (Array.isArray(builder?.selectedTechniques)) {
      selectedTechniques = new Set(builder.selectedTechniques);
    }
  },
});

function applyLocalBuilderPatch(patch) {
  currentDoc = currentDoc || {};
  const previousBuilder = currentDoc.builder || {};
  currentDoc.builder = buildBuilderWithPatch(previousBuilder, patch);
  selectedTechniques = new Set(Array.isArray(currentDoc.builder.selectedTechniques) ? currentDoc.builder.selectedTechniques : []);
}

function renderNav() {
  renderBuilderNavMounts({
    currentStepId: CURRENT_STEP_ID,
    characterDoc: currentDoc,
    ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
    onBeforeNavigate: async () => await saveBuilder({ openSheetAfter: false, intent: "navigate" }),
  });
}

function getSaveIssues(reconciliation) {
  const errors = Array.isArray(reconciliation?.errors) ? reconciliation.errors : [];
  const warnings = Array.isArray(reconciliation?.warnings) ? reconciliation.warnings : [];
  return { errors, warnings: Array.from(new Set(warnings)) };
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving...");

  const widgetPatch = techniquesPage.getWidgetSavePatch({ currentDoc });
  const reconciliation = reconcileBuilderChange(gameData, currentDoc?.builder || {}, widgetPatch, {
    participants: techniquesPage.getDependencyParticipants(),
  });
  const { errors, warnings } = getSaveIssues(reconciliation);

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
    await saveCharacterPatch(charRef, reconciliation.patch);
    applyLocalBuilderPatch(reconciliation.patch);
    techniquesWidget?.render();
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

function previewStoredTechniques() {
  const widgetPatch = techniquesPage.getWidgetSavePatch({ currentDoc });
  return techniquesPage.previewChoiceChange(widgetPatch, {
    participants: techniquesPage.getDependencyParticipants(),
  });
}

async function main() {
  try {
    ctx = await initBuilderAuth({
      signOutBtn,
      gmHintEl,
      statusEl,
      errorEl,
    });

    setStatus(statusEl, "Loading game data...");
    gameData = await loadGameXData({ cache: "no-store" });
    techIndexes = buildTechniqueIndexes(getGameXTechniques(gameData));

    setStatus(statusEl, "Loading character...");
    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;
    await markStepVisited(charRef, CURRENT_STEP_ID);

    const stored = Array.isArray(currentDoc?.builder?.selectedTechniques) ? currentDoc.builder.selectedTechniques : [];
    selectedTechniques = new Set(stored.map((value) => String(value || "").trim()).filter(Boolean));

    techniquesWidget = new TechniquesWidget(techniquesPage, {
      slotHintEl,
      slotPillsEl,
      searchEl: techSearchEl,
      filterKnownSkillsEl,
      knownSkillsHelpEl,
      missingListEl,
      techniqueGroupsEl,
      getGameData: () => gameData,
      getBuilder: () => currentDoc?.builder || {},
      getTechniqueIndexes: () => techIndexes,
      getSelectedTechniques: () => selectedTechniques,
      setSelectedTechniques: (next) => {
        selectedTechniques = next instanceof Set ? next : new Set(next || []);
      },
      setStatus: (message) => setStatus(statusEl, message),
      clearError: () => clearError(errorEl),
    });

    const initialPreview = previewStoredTechniques();
    if (initialPreview.changes.some((change) => change?.type === "remove")) {
      selectedTechniques = new Set(Array.isArray(initialPreview.reconciledBuilder?.selectedTechniques)
        ? initialPreview.reconciledBuilder.selectedTechniques
        : []);
      showError(
        errorEl,
        `Some stored technique selections were adjusted to match your current character. Please review and save. ${initialPreview.warnings.join(" ")}`
      );
      setStatus(statusEl, "Review needed.");
    } else {
      setStatus(statusEl, "Ready.");
    }

    saveBtn?.addEventListener("click", () => saveBuilder({ openSheetAfter: false, intent: "save" }));
    saveAndOpenBtn?.addEventListener("click", () => saveBuilder({ openSheetAfter: true, intent: "save" }));

    techniquesWidget.render();
    renderNav();
  } catch (e) {
    console.error(e);
    showError(errorEl, "Could not load this step.");
    setStatus(statusEl, "Error.");
  }
}

main();
