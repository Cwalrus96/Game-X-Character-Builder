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
import { CharacterSessionPage } from "./character-session-page.js?v=wpe13";
import { BondsKeystonesWidget } from "./widgets/bonds-keystones-widget.js?v=wpe13";
import { VisitBuilderStep } from "../core/character-commands.js?v=wpe5";
import { readCharacter } from "../core/database-reader.js?v=wpe6";
import { replaceCharacter } from "../core/database-writer.js?v=wpe1";
import { loadGameXData } from "../core/game-data.js";
import { reconcileCharacterGraph } from "../core/graph-reconciler.js?v=wpe13";

const CURRENT_STEP_ID = "bonds-keystones";
ensureBuilderShellUi();

const elements = {
  root: document.querySelector("main.builder"),
  signOutBtn: document.getElementById("signOutBtn"),
  gmHint: document.getElementById("gmHint"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  saveBtn: document.getElementById("saveBtn"),
  saveAndOpenBtn: document.getElementById("saveAndOpenBtn"),
  levelValue: document.getElementById("levelValue"),
  heartValue: document.getElementById("heartValue"),
  bondRankCapValue: document.getElementById("bondRankCapValue"),
  bondCountValue: document.getElementById("bondCountValue"),
  bondStatusHint: document.getElementById("bondStatusHint"),
  bondRulesHelp: document.getElementById("bondRulesHelp"),
  bondCountHelp: document.getElementById("bondCountHelp"),
  addBondBtn: document.getElementById("addBondBtn"),
  bondList: document.getElementById("bondList"),
  bondRowTemplate: document.getElementById("bondRowTemplate"),
  backgroundKeystone1: document.getElementById("backgroundKeystone1"),
  backgroundKeystone2: document.getElementById("backgroundKeystone2"),
};

let ctx;
let currentDoc;
let gameData;
let page;
let widget;

function bondIssues(reconciliation) {
  const relevant = (impact) => impact.path.startsWith("builder.bonds")
    || impact.path.startsWith("builder.backgroundKeystones")
    || impact.code.includes("bond")
    || impact.code.includes("keystone");
  return {
    errors: reconciliation.impacts.filter((item) => item.category === "error" && relevant(item)).map((item) => item.message || item.code),
    warnings: getBuilderStepInformationalMessages(reconciliation, CURRENT_STEP_ID),
    confirmations: reconciliation.impacts.filter((item) => item.category === "confirmation-required" && relevant(item)),
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
    showError(elements.error, visited.errors.join(" ") || "The bond state could not be reconciled.");
    setStatus(elements.status, "Not saved.");
    return false;
  }
  const currentIssues = bondIssues(reconcileCharacterGraph({ character: page.getCharacter(), previousCharacter: page.getCharacter(), gameData }));
  if (currentIssues.errors.length) {
    showError(elements.error, currentIssues.errors.join(" "));
    setStatus(elements.status, "Not saved.");
    return false;
  }
  if (currentIssues.warnings.length && !await confirmSaveWarnings({
    title: "Save with incomplete Bonds or Keystones?",
    warnings: currentIssues.warnings,
    okText: intent === "navigate" ? "Save and Continue" : "Save",
    cancelText: "Cancel",
  })) {
    setStatus(elements.status, "Not saved.");
    return false;
  }
  const saved = await page.save((snapshot) => replaceCharacter({
    ownerUid: ctx.editingUid,
    characterId: ctx.charId,
    character: snapshot.character,
    expectedRevision: snapshot.expectedRevision,
  }));
  if (!saved.ok) {
    showError(elements.error, saved.error?.code === "character-revision-conflict"
      ? "This character changed in another tab. Reload before saving again."
      : "Could not save Bonds and Keystones.");
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
      character: loaded.character,
      revision: loaded.revision,
      metadata: loaded.metadata,
      gameData,
      confirmImpacts: ({ messages }) => confirmSaveWarnings({ title: "Apply this Bond change?", warnings: messages, okText: "Apply Change", cancelText: "Cancel" }),
      onCommandRejected: ({ errors }) => { showError(elements.error, errors.join(" ") || "That Bond change is not valid."); setStatus(elements.status, "Change rejected."); },
      onStateChange: (state) => { currentDoc = state.working; clearError(elements.error); setStatus(elements.status, "Unsaved changes."); },
    });
    await page.requestCharacterCommand(null, VisitBuilderStep(CURRENT_STEP_ID));
    widget = new BondsKeystonesWidget(page, { elements, onRejected: () => widget.render() });
    const preview = bondIssues(reconcileCharacterGraph({ character: currentDoc, previousCharacter: currentDoc, gameData }));
    if (preview.errors.length) {
      showError(elements.error, `Stored Bonds or Keystones need review. ${preview.errors.join(" ")}`);
      setStatus(elements.status, "Review needed.");
    } else if (preview.confirmations.length) {
      showError(elements.error, "Stored Bonds exceed current limits. Edit or save to review the exact adjustments.");
      setStatus(elements.status, "Review needed.");
    } else setStatus(elements.status, page.getState().dirty ? "Ready. Unsaved changes." : "Ready.");
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
