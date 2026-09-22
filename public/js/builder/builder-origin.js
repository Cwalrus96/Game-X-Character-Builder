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
import { OriginWidget } from "./widgets/origin-widget.js?v=wpe5";
import { TraitWidget } from "./widgets/trait-widget.js";
import { VisitBuilderStep } from "../core/character-commands.js?v=wpe4";
import { readCharacter } from "../core/database-reader.js?v=wpe6";
import { replaceCharacter } from "../core/database-writer.js?v=wpe1";
import { loadGameXData } from "../core/game-data.js";
import { reconcileCharacterGraph } from "../core/graph-reconciler.js?v=wpe10";

const CURRENT_STEP_ID = "origin";
ensureBuilderShellUi();

const elements = {
  signOutBtn: document.getElementById("signOutBtn"),
  gmHint: document.getElementById("gmHint"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  originSelect: document.getElementById("originSelect"),
  originKeystone: document.getElementById("originKeystone"),
  originSummary: document.getElementById("originSummary"),
  originDetails: document.getElementById("originDetails"),
  originStatusHint: document.getElementById("originStatusHint"),
  saveBtn: document.getElementById("saveBtn"),
  saveAndOpenBtn: document.getElementById("saveAndOpenBtn"),
};

let ctx;
let currentDoc;
let gameData;
let page;

function issues(reconciliation) {
  return {
    errors: reconciliation.impacts.filter((item) => item.category === "error").map((item) => item.message || item.code),
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
  const visited = await page.requestCharacterCommand(null, VisitBuilderStep(CURRENT_STEP_ID));
  if (!visited.ok) {
    showError(elements.error, visited.errors.join(" ") || "The origin state could not be reconciled.");
    setStatus(elements.status, "Not saved.");
    return false;
  }
  const currentIssues = issues(reconcileCharacterGraph({ character: page.getCharacter(), previousCharacter: page.getCharacter(), gameData }));
  if (currentIssues.errors.length) {
    showError(elements.error, currentIssues.errors.join(" "));
    setStatus(elements.status, "Not saved.");
    return false;
  }
  if (currentIssues.warnings.length && !await confirmSaveWarnings({
    title: "Some origin information is incomplete",
    warnings: currentIssues.warnings,
    okText: intent === "navigate" ? "Save and Continue" : "Save",
    cancelText: "Cancel",
  })) {
    setStatus(elements.status, "Not saved.");
    return false;
  }
  const saved = await page.save((snapshot) => replaceCharacter({ ownerUid: ctx.editingUid, characterId: ctx.charId, character: snapshot.character, expectedRevision: snapshot.expectedRevision }));
  if (!saved.ok) {
    showError(elements.error, saved.error?.code === "character-revision-conflict" ? "This character changed in another tab. Reload before saving again." : "Could not save origin.");
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
    ctx = await initBuilderAuth({ signOutBtn: elements.signOutBtn, gmHintEl: elements.gmHint, statusEl: elements.status, errorEl: elements.error });
    setStatus(elements.status, "Loading game data...");
    gameData = await loadGameXData({ cache: "no-store" });
    const loaded = await readCharacter({ ownerUid: ctx.editingUid, characterId: ctx.charId, gameData });
    currentDoc = loaded.character;
    page = new CharacterSessionPage({
      character: loaded.character, revision: loaded.revision, metadata: loaded.metadata, gameData,
      confirmImpacts: ({ messages }) => confirmSaveWarnings({ title: "Apply this origin change?", warnings: messages, okText: "Apply Change", cancelText: "Cancel" }),
      onCommandRejected: ({ errors }) => { showError(elements.error, errors.join(" ") || "That origin change is not valid."); setStatus(elements.status, "Change rejected."); },
      onStateChange: (state) => { currentDoc = state.working; clearError(elements.error); setStatus(elements.status, "Unsaved changes."); },
    });
    new OriginWidget(page, { gameData, elements });
    const traitMount = document.createElement("section");
    traitMount.setAttribute("aria-label", "Traits supplied by your features");
    elements.originDetails.after(traitMount);
    new TraitWidget(page, { gameData, mount: traitMount });
    const previewIssues = issues(reconcileCharacterGraph({ character: currentDoc, previousCharacter: currentDoc, gameData }));
    if (previewIssues.errors.length) {
      showError(elements.error, `Stored origin data needs review. ${previewIssues.errors.join(" ")}`);
      setStatus(elements.status, "Review needed.");
    } else setStatus(elements.status, "Ready.");
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
