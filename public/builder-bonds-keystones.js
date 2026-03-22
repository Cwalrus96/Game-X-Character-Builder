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
import { buildBondsKeystonesUpdatePatch } from "./database-writer.js";
import { buildConstrainedSkillRankOptionsHtml, getBondRulesState } from "./character-rules.js";
import { sanitizeBondList, sanitizeKeystoneList, sanitizeText } from "./data-sanitization.js";

const CURRENT_STEP_ID = document.querySelector("[data-builder-step]")?.getAttribute("data-builder-step") || "bonds-keystones";

const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const navTopEl = document.getElementById("builderNavTop");
const navBottomEl = document.getElementById("builderNavBottom");

const levelValueEl = document.getElementById("levelValue");
const heartValueEl = document.getElementById("heartValue");
const bondRankCapValueEl = document.getElementById("bondRankCapValue");
const bondCountValueEl = document.getElementById("bondCountValue");
const bondStatusHintEl = document.getElementById("bondStatusHint");
const bondRulesHelpEl = document.getElementById("bondRulesHelp");
const bondCountHelpEl = document.getElementById("bondCountHelp");

const addBondBtn = document.getElementById("addBondBtn");
const bondListEl = document.getElementById("bondList");
const bondRowTemplate = document.getElementById("bondRowTemplate");

const backgroundKeystone1El = document.getElementById("backgroundKeystone1");
const backgroundKeystone2El = document.getElementById("backgroundKeystone2");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

let ctx = null;
let charRef = null;
let currentDoc = null;
let bonds = [];
let backgroundKeystones = ["", ""];

function currentBondRules() {
  return getBondRulesState({
    level: currentDoc?.builder?.level ?? 1,
    heart: currentDoc?.builder?.attributes?.heart ?? 0,
  });
}

function syncBackgroundStateFromInputs() {
  backgroundKeystones = sanitizeKeystoneList([
    backgroundKeystone1El?.value || "",
    backgroundKeystone2El?.value || "",
  ], { maxItems: 2, maxLen: 400 });
}

function fillBackgroundInputs() {
  const values = [...backgroundKeystones];
  while (values.length < 2) values.push("");
  if (backgroundKeystone1El) backgroundKeystone1El.value = values[0] || "";
  if (backgroundKeystone2El) backgroundKeystone2El.value = values[1] || "";
}

function renderBondMeta() {
  const { level, heart, rankCap, bondCountCap } = currentBondRules();
  const limit = bondCountCap;
  const countText = Number.isFinite(limit) ? `${bonds.length} / ${limit}` : String(bonds.length);

  if (levelValueEl) levelValueEl.textContent = String(level);
  if (heartValueEl) heartValueEl.textContent = String(heart);
  if (bondRankCapValueEl) bondRankCapValueEl.textContent = String(rankCap);
  if (bondCountValueEl) bondCountValueEl.textContent = countText;

  if (bondStatusHintEl) bondStatusHintEl.textContent = `Up to ${heart} bond${heart === 1 ? "" : "s"}`;
  if (bondRulesHelpEl) bondRulesHelpEl.textContent = `You can have up to ${heart} bond${heart === 1 ? "" : "s"}. Each bond starts at Rank 1, follows the normal rank cap (${rankCap} at level ${level}), and includes one Bond Keystone. You also get 2 Background Keystones.`;
  if (bondCountHelpEl) bondCountHelpEl.textContent = "Bonds represent spiritual connections to other characters. Bond count is capped by Heart, and bond rank uses the same cap progression as skills.";

  if (addBondBtn) {
    addBondBtn.disabled = bonds.length >= limit;
  }
}

function renderBonds() {
  if (!bondListEl || !bondRowTemplate) return;
  bondListEl.innerHTML = "";

  const { heart, rankCap } = currentBondRules();

  if (!bonds.length) {
    const empty = document.createElement("div");
    empty.className = "builderItem muted";
    empty.textContent = `No bonds added yet. You can leave them blank for now, or add up to your Heart score (${heart}).`;
    bondListEl.append(empty);
    renderBondMeta();
    return;
  }

  bonds.forEach((bond, index) => {
    const frag = bondRowTemplate.content.cloneNode(true);
    const row = frag.querySelector("[data-bond-row]");
    const nameEl = frag.querySelector('[data-field="name"]');
    const rankEl = frag.querySelector('[data-field="rank"]');
    const keystoneEl = frag.querySelector('[data-field="keystone"]');
    const removeBtn = frag.querySelector('[data-action="remove"]');

    if (!row || !nameEl || !rankEl || !keystoneEl || !removeBtn) return;

    rankEl.innerHTML = buildConstrainedSkillRankOptionsHtml(bond?.rank || "", { maxAllowed: rankCap });

    const safeRank = sanitizeText(bond?.rank || "", { maxLen: 8, collapse: true });
    nameEl.value = String(bond?.name || "");
    rankEl.value = safeRank && Number.parseInt(safeRank, 10) <= rankCap ? safeRank : "";
    keystoneEl.value = String(bond?.keystone || "");

    nameEl.addEventListener("input", () => {
      bonds[index].name = sanitizeText(nameEl.value || "", { maxLen: 96, collapse: true });
    });
    rankEl.addEventListener("change", () => {
      const raw = sanitizeText(rankEl.value || "", { maxLen: 8, collapse: true });
      bonds[index].rank = raw === "" ? "" : String(Math.max(1, Math.min(rankCap, Number.parseInt(raw, 10) || 1)));
      if (rankEl.value !== bonds[index].rank) rankEl.value = bonds[index].rank;
    });
    keystoneEl.addEventListener("input", () => {
      bonds[index].keystone = sanitizeText(keystoneEl.value || "", { maxLen: 400, collapse: true });
    });

    removeBtn.addEventListener("click", () => {
      bonds.splice(index, 1);
      renderBonds();
    });

    bondListEl.append(row);
  });

  renderBondMeta();
}

function addBond() {
  clearError(errorEl);
  const { bondCountCap: limit } = currentBondRules();
  if (Number.isFinite(limit) && bonds.length >= limit) {
    setStatus(statusEl, `You can only have up to ${limit} bond${limit === 1 ? "" : "s"}.`);
    return;
  }
  bonds.push({ name: "", rank: "1", keystone: "" });
  renderBonds();
}

function collectWarnings() {
  const warnings = [];
  const { level, heart, rankCap } = currentBondRules();

  if (heart > 0 && bonds.length === 0) {
    warnings.push(`No bonds are filled in. This character can have up to ${heart} bond${heart === 1 ? "" : "s"}.`);
  }

  bonds.forEach((bond, index) => {
    const name = sanitizeText(bond?.name || "", { maxLen: 96, collapse: true });
    const rank = sanitizeText(bond?.rank || "", { maxLen: 8, collapse: true });
    const keystone = sanitizeText(bond?.keystone || "", { maxLen: 400, collapse: true });
    const fieldsFilled = [name, rank, keystone].filter(Boolean).length;
    if (fieldsFilled > 0 && fieldsFilled < 3) {
      warnings.push(`Bond ${index + 1} is incomplete.`);
    }
    const numericRank = Number.parseInt(rank, 10);
    if (rank && (!Number.isFinite(numericRank) || numericRank < 1 || numericRank > rankCap)) {
      warnings.push(`Bond ${index + 1} has an invalid rank for level ${level}.`);
    }
  });

  const backgroundValues = [backgroundKeystone1El?.value || "", backgroundKeystone2El?.value || ""];
  backgroundValues.forEach((value, index) => {
    if (!sanitizeText(value, { maxLen: 400, collapse: true })) {
      warnings.push(`Background Keystone ${index + 1} is empty.`);
    }
  });

  return warnings;
}

function collectPatch() {
  syncBackgroundStateFromInputs();
  return buildBondsKeystonesUpdatePatch({
    bonds,
    backgroundKeystones: backgroundKeystones,
  });
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = collectWarnings();
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
    const patch = collectPatch();
    await saveCharacterPatch(charRef, patch);

    currentDoc = currentDoc || {};
    currentDoc.builder = {
      ...(currentDoc.builder || {}),
      bonds: patch["builder.bonds"],
      backgroundKeystones: patch["builder.backgroundKeystones"],
    };

    bonds = sanitizeBondList(currentDoc.builder.bonds, { maxItems: 50 });
    backgroundKeystones = sanitizeKeystoneList(currentDoc.builder.backgroundKeystones, { maxItems: 2, maxLen: 400 });
    fillBackgroundInputs();
    renderBonds();

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
    ctx = await initBuilderAuth({ whoamiEl, signOutBtn, gmHintEl, statusEl, errorEl });
    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    bonds = sanitizeBondList(currentDoc?.builder?.bonds, { maxItems: 50 });
    backgroundKeystones = sanitizeKeystoneList(currentDoc?.builder?.backgroundKeystones, { maxItems: 2, maxLen: 400 });
    fillBackgroundInputs();
    renderBonds();

    await markStepVisited(charRef, CURRENT_STEP_ID);

    if (addBondBtn) addBondBtn.addEventListener("click", addBond);
    if (backgroundKeystone1El) backgroundKeystone1El.addEventListener("input", syncBackgroundStateFromInputs);
    if (backgroundKeystone2El) backgroundKeystone2El.addEventListener("input", syncBackgroundStateFromInputs);

    if (saveBtn) saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false, intent: "save" }));
    if (saveAndOpenBtn) saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true, intent: "save" }));

    const navConfig = {
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNavigate: async () => await saveBuilder({ openSheetAfter: false, intent: "navigate" }),
    };

    renderBuilderNav({ mountEl: navTopEl, ...navConfig });
    renderBuilderNav({ mountEl: navBottomEl, ...navConfig });

    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Could not load builder step.");
    setStatus(statusEl, "Error.");
  }
}

main();
