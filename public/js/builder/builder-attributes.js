import {
  clearError,
  confirmSaveWarnings,
  ensureBuilderShellUi,
  initBuilderAuth,
  markBuilderNavigationClean,
  openCharacterSheet,
  setStatus,
  showError,
} from "./builder-common.js";
import { renderBuilderNavMounts } from "./builder-nav.js";
import { getBuilderStepInformationalMessages } from "./builder-step-impacts.js?v=wpe11";
import { CharacterSessionPage } from "./character-session-page.js?v=wpe10";
import { AttributesWidget } from "./widgets/attributes-widget.js?v=wpe3";
import { VisitBuilderStep } from "../core/character-commands.js?v=wpe3";
import { readCharacter } from "../core/database-reader.js?v=wpe6";
import { replaceCharacter } from "../core/database-writer.js?v=wpe1";
import { loadGameXData } from "../core/game-data.js";
import { reconcileCharacterGraph } from "../core/graph-reconciler.js?v=wpe10";

const CURRENT_STEP_ID = "attributes";

ensureBuilderShellUi();

const elements = {
  signOutBtn: document.getElementById("signOutBtn"),
  gmHint: document.getElementById("gmHint"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  levelLabel: document.getElementById("levelLabel"),
  primaryLabel: document.getElementById("primaryLabel"),
  points: document.getElementById("points"),
  remaining: document.getElementById("remaining"),
  remainingPill: document.getElementById("remainingPill"),
  capPrimary: document.getElementById("capPrimary"),
  capOther: document.getElementById("capOther"),
  capNote: document.getElementById("capNote"),
  zeroNote: document.getElementById("zeroNote"),
  saveBtn: document.getElementById("saveBtn"),
  saveAndOpenBtn: document.getElementById("saveAndOpenBtn"),
};

const rows = [...document.querySelectorAll(".attrRow[data-attr]")].map((row) => ({
  key: row.getAttribute("data-attr"),
  row,
  input: row.querySelector("input.attrInput"),
}));

let ctx;
let currentDoc;
let gameData;
let attributesPage;
let attributesWidget;

function issues(reconciliation) {
  const impacts = reconciliation?.impacts || [];
  return {
    errors: impacts.filter((impact) => impact.category === "error").map((impact) => impact.message || impact.code),
    warnings: getBuilderStepInformationalMessages(reconciliation, CURRENT_STEP_ID),
  };
}

function renderNav() {
  renderBuilderNavMounts({
    currentStepId: CURRENT_STEP_ID,
    characterDoc: currentDoc,
    ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
    onBeforeNavigate: async () => saveBuilder({ intent: "navigate" }),
  });
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(elements.error);
  setStatus(elements.status, "Saving...");

  const visited = await attributesPage.requestCharacterCommand(null, VisitBuilderStep(CURRENT_STEP_ID));
  if (!visited.ok) {
    showError(elements.error, visited.errors?.join(" ") || "The attribute state could not be reconciled.");
    setStatus(elements.status, "Not saved.");
    return false;
  }

  const reconciliation = reconcileCharacterGraph({
    character: attributesPage.getCharacter(),
    previousCharacter: attributesPage.getCharacter(),
    gameData,
  });
  const { errors, warnings } = issues(reconciliation);
  if (errors.length) {
    showError(elements.error, errors.join(" "));
    setStatus(elements.status, "Not saved.");
    return false;
  }
  if (warnings.length) {
    const accepted = await confirmSaveWarnings({
      title: "Some character choices are incomplete",
      warnings,
      okText: intent === "navigate" ? "Save and Continue" : "Save",
      cancelText: "Cancel",
    });
    if (!accepted) {
      setStatus(elements.status, "Not saved.");
      return false;
    }
  }

  const saved = await attributesPage.save((snapshot) => replaceCharacter({
    ownerUid: ctx.editingUid,
    characterId: ctx.charId,
    character: snapshot.character,
    expectedRevision: snapshot.expectedRevision,
  }));
  if (!saved.ok) {
    console.error(saved.error);
    showError(elements.error, saved.error?.code === "character-revision-conflict"
      ? "This character changed in another tab. Reload before saving again."
      : "Could not save attributes.");
    setStatus(elements.status, "Error.");
    return false;
  }
  currentDoc = saved.state.working;
  setStatus(elements.status, "Saved.");
  markBuilderNavigationClean();
  renderNav();
  if (openSheetAfter) openCharacterSheet(ctx);
  return true;
}

async function main() {
  try {
    ctx = await initBuilderAuth({
      signOutBtn: elements.signOutBtn,
      gmHintEl: elements.gmHint,
      statusEl: elements.status,
      errorEl: elements.error,
    });
    setStatus(elements.status, "Loading game data...");
    gameData = await loadGameXData({ cache: "no-store" });
    setStatus(elements.status, "Loading character...");
    const loaded = await readCharacter({
      ownerUid: ctx.editingUid,
      characterId: ctx.charId,
      gameData,
    });
    currentDoc = loaded.character;
    attributesPage = new CharacterSessionPage({
      character: loaded.character,
      revision: loaded.revision,
      metadata: loaded.metadata,
      gameData,
      confirmImpacts: async ({ messages }) => confirmSaveWarnings({
        title: "Apply this attribute change?",
        warnings: messages,
        okText: "Apply Change",
        cancelText: "Cancel",
      }),
      onCommandRejected: ({ errors }) => {
        showError(elements.error, errors.join(" ") || "That attribute change is not valid.");
        setStatus(elements.status, "Change rejected.");
      },
      onStateChange: (state) => {
        currentDoc = state.working;
        clearError(elements.error);
        setStatus(elements.status, "Unsaved changes.");
      },
    });
    attributesWidget = new AttributesWidget(attributesPage, {
      elements,
      rows,
      onRejected: () => attributesWidget.render(),
    });

    const preview = reconcileCharacterGraph({
      character: currentDoc,
      previousCharacter: currentDoc,
      gameData,
    });
    const currentIssues = issues(preview);
    if (currentIssues.errors.length) {
      showError(elements.error, `Stored attributes need review. ${currentIssues.errors.join(" ")}`);
      setStatus(elements.status, "Review needed.");
    } else if (!currentDoc.builder.primaryAttribute) {
      showError(elements.error, "Primary Attribute not set. Go back to the Class step.");
      setStatus(elements.status, "Review needed.");
    } else if (preview.impacts.some((impact) => impact.category === "confirmation-required")) {
      showError(elements.error, "Stored attributes exceed the current caps or point budget. Save to review the exact adjustments.");
      setStatus(elements.status, "Review needed.");
    } else {
      setStatus(elements.status, "Ready.");
    }

    elements.saveBtn.addEventListener("click", () => saveBuilder());
    elements.saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true }));
    renderNav();
  } catch (error) {
    console.error(error);
    showError(elements.error, error?.message || "Could not load this step.");
    setStatus(elements.status, "Error.");
  }
}

main();
