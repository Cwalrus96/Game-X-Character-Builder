// public/builder-techniques.js
// Techniques selection step. Technique-specific behavior lives in TechniquesWidget.

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
import { TechniquesWidget } from "./widgets/techniques-widget.js?v=wpe1";

import { SetTechniqueSelection, VisitBuilderStep } from "../core/character-commands.js?v=wpe1";
import { readCharacter } from "../core/database-reader.js?v=wpe6";
import { replaceCharacter } from "../core/database-writer.js?v=wpe1";
import { reconcileCharacterGraph } from "../core/graph-reconciler.js?v=wpe10";
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
let currentDoc = null;
/** @type {any} */
let gameData = null;
/** @type {{ byName: Map<string, any>, byNorm: Map<string, any[]> } | null} */
let techIndexes = null;
/** @type {Set<string>} */
let selectedTechniques = new Set();
/** @type {TechniquesWidget | null} */
let techniquesWidget = null;

let techniquesPage = null;

function renderNav() {
  renderBuilderNavMounts({
    currentStepId: CURRENT_STEP_ID,
    characterDoc: currentDoc,
    ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
    onBeforeNavigate: async () => await saveBuilder({ openSheetAfter: false, intent: "navigate" }),
  });
}

function getSaveIssues(reconciliation) {
  const impacts = Array.isArray(reconciliation?.impacts) ? reconciliation.impacts : [];
  return {
    errors: impacts.filter((impact) => impact.category === "error").map((impact) => impact.message || impact.code),
    warnings: getBuilderStepInformationalMessages(reconciliation, CURRENT_STEP_ID),
  };
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving...");

  const refresh = await techniquesPage.requestCharacterCommand(
    null,
    SetTechniqueSelection([...selectedTechniques]),
  );
  if (!refresh.ok) {
    showError(errorEl, refresh.errors?.join(" ") || "The technique selection could not be reconciled.");
    setStatus(statusEl, "Not saved.");
    return false;
  }
  const reconciliation = reconcileCharacterGraph({
    character: techniquesPage.getCharacter(),
    previousCharacter: techniquesPage.getCharacter(),
    gameData,
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

  const visited = await techniquesPage.requestCharacterCommand(null, VisitBuilderStep(CURRENT_STEP_ID));
  if (!visited.ok) {
    showError(errorEl, visited.errors?.join(" ") || "The visited builder step could not be recorded.");
    setStatus(statusEl, "Not saved.");
    return false;
  }

  const saved = await techniquesPage.save((snapshot) => replaceCharacter({
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
  selectedTechniques = new Set(currentDoc.builder.selectedTechniques);
  techniquesWidget?.render();
  setStatus(statusEl, "Saved.");
  markBuilderNavigationClean();
  if (openSheetAfter) openCharacterSheet(ctx);
  return true;
}

function previewStoredTechniques() {
  return reconcileCharacterGraph({
    character: techniquesPage.getCharacter(),
    previousCharacter: techniquesPage.getCharacter(),
    gameData,
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
    const loaded = await readCharacter({
      ownerUid: ctx.editingUid,
      characterId: ctx.charId,
      gameData,
    });
    currentDoc = loaded.character;
    techniquesPage = new CharacterSessionPage({
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
        selectedTechniques = new Set(currentDoc.builder.selectedTechniques);
      },
    });

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
    if (initialPreview.impacts.some((impact) => impact?.category === "confirmation-required")) {
      showError(
        errorEl,
        `Some stored technique selections need review before they can be saved. ${initialPreview.impacts
          .filter((impact) => impact.category === "confirmation-required")
          .map((impact) => impact.message || impact.code)
          .join(" ")}`
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
