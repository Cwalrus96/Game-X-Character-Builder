import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  setStatus,
  showError,
  clearError,
  markStepVisited,
  confirmModal,
} from "./builder-common.js";
import { renderBuilderNav } from "./builder-nav.js";

import {
  ATTR_KEYS,
  ATTR_LABELS,
  clampLevel,
  getAttributePointsToSpend,
  getAttributeFinalCap,
  getAttributeEffectiveCap,
  buildAttributesUpdatePatch,
} from "./character-schema.js";


// ---- Page identity ----
const CURRENT_STEP_ID =
  document.querySelector("[data-builder-step]")?.getAttribute("data-builder-step") || "attributes";

// ---- Common shell UI ----
const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// ---- Nav mount ----
const navMount = document.getElementById("builderNav");

// ---- UI ----
const levelLabel = document.getElementById("levelLabel");
const primaryLabel = document.getElementById("primaryLabel");
const pointsEl = document.getElementById("points");
const remainingEl = document.getElementById("remaining");
const remainingPill = document.getElementById("remainingPill");
const capPrimaryEl = document.getElementById("capPrimary");
const capOtherEl = document.getElementById("capOther");
const capNote = document.getElementById("capNote");
const zeroNote = document.getElementById("zeroNote");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

const attrRows = [...document.querySelectorAll(".attrRow[data-attr]")].map((row) => {
  const key = row.getAttribute("data-attr");
  const input = row.querySelector("input.attrInput");
  return { key, row, input };
});

// ---- State ----
let ctx = null;
let charRef = null;
let currentDoc = null;

let level = 1;
let primaryAttr = ""; // attr key

function getBonusFor(key) {
  return key === primaryAttr ? 1 : 0;
}

function clampInt(v, min, max) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function getCurrentEffValues() {
  const out = {};
  for (const { key, input } of attrRows) {
    const effCap = getAttributeEffectiveCap(level, key, primaryAttr);
    const min = key === primaryAttr ? 1 : 0;
    out[key] = clampInt(input.value, min, effCap);
  }
  return out;
}

function effToBase(key, eff) {
  return Math.max(0, eff - getBonusFor(key));
}

function computeUsedBase(effMap) {
  let used = 0;
  for (const k of ATTR_KEYS) used += effToBase(k, effMap[k] ?? 0);
  return used;
}

function updateUI() {
  // ---- Primary Attribute indicator (row styling + "(Primary)" tag) ----
  for (const { key, row } of attrRows) {
    const isPrimary = Boolean(primaryAttr) && key === primaryAttr;

    row.classList.toggle("primary", isPrimary);

    const nameEl = row.querySelector(".attrName");
    if (!nameEl) continue;

    const existing = nameEl.querySelector(".primaryTag");
    if (existing) existing.remove();

    if (isPrimary) {
      const sub = document.createElement("sub");
      sub.className = "primaryTag";
      sub.textContent = "(Primary)";
      nameEl.appendChild(sub);
    }
  }
	
  if (!primaryAttr) {
    // Block editing if primary isn't set
    for (const { input } of attrRows) input.disabled = true;
    if (primaryLabel) primaryLabel.textContent = "—";
    return;
  }

  for (const { input } of attrRows) input.disabled = false;

  const effMap = getCurrentEffValues();

  // First, clamp each input to caps/mins
  for (const { key, input } of attrRows) {
    const effCap = getAttributeEffectiveCap(level, key, primaryAttr);
    const min = key === primaryAttr ? 1 : 0;
    const v = clampInt(input.value, min, effCap);
    input.value = String(v);
  }

  const clamped = getCurrentEffValues();
  const totalPoints = getAttributePointsToSpend(level);
  const used = computeUsedBase(clamped);
  const remaining = totalPoints - used;

  // Pills
  pointsEl.textContent = String(totalPoints);
  remainingEl.textContent = String(remaining);

  if (remaining < 0) {
    remainingPill.classList.add("danger");
    remainingPill.classList.remove("ok");
  } else if (remaining === 0) {
    remainingPill.classList.remove("danger");
    remainingPill.classList.add("ok");
  } else {
    remainingPill.classList.remove("danger");
    remainingPill.classList.remove("ok");
  }

  // Per-input max based on remaining (so you can't exceed total points even before saving)
  for (const { key, input } of attrRows) {
    const effCap = getAttributeEffectiveCap(level, key, primaryAttr);
    const bonus = getBonusFor(key);
    const currentEff = clamped[key] ?? 0;
    const currentBase = effToBase(key, currentEff);

    const maxBaseByTotal = currentBase + remaining;
    const maxEffByTotal = maxBaseByTotal + bonus;

    // If remaining is negative, don't reduce max below current value (it gets handled by warning)
    const computedMax = remaining >= 0 ? Math.min(effCap, maxEffByTotal) : effCap;

    input.max = String(Math.max(computedMax, key === primaryAttr ? 1 : 0));
    input.min = String(key === primaryAttr ? 1 : 0);
  }

  // Cap display
  const finalCap = getAttributeFinalCap(level);
  const primaryCap = getAttributeEffectiveCap(level, primaryAttr, primaryAttr);
  // Use any non-primary attribute as representative for other cap at level 1-2
  const sampleOther = ATTR_KEYS.find((k) => k !== primaryAttr) || "strength";
  const otherCap = getAttributeEffectiveCap(level, sampleOther, primaryAttr);

  capPrimaryEl.textContent = String(primaryCap);
  capOtherEl.textContent = String(otherCap);

  if (level <= 2) {
    capNote.style.display = "";
    capNote.textContent = `At level ${level}, your Primary Attribute can reach the normal cap (${finalCap}), but other attributes are capped at ${otherCap}.`;
  } else {
    capNote.style.display = "none";
    capNote.textContent = "";
  }

  // Zero warnings & row styling
  const zeros = [];
  for (const { key, row, input } of attrRows) {
    const v = Number.parseInt(input.value, 10) || 0;
    row.classList.toggle("zero", v === 0);
    if (v === 0) zeros.push(key);
  }

  if (zeros.length) {
    zeroNote.style.display = "";
    zeroNote.textContent = "Warning: One or more attributes are 0. This may be risky depending on the campaign.";
  } else {
    zeroNote.style.display = "none";
    zeroNote.textContent = "";
  }
}

function getAttributeWarnings() {
  const warnings = [];
  if (!primaryAttr) warnings.push("Primary Attribute is not set. Go back to the Class step.");

  const eff = getCurrentEffValues();
  const total = getAttributePointsToSpend(level);
  const used = computeUsedBase(eff);
  const remaining = total - used;

  if (remaining < 0) warnings.push("You have spent too many attribute points.");
  if (remaining > 0) warnings.push("You have unspent attribute points.");

  return warnings;
}

async function saveBuilder({ openSheetAfter = false, requireComplete = false } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = getAttributeWarnings();
  if (warnings.length && requireComplete) {
    showError(errorEl, warnings.join(" "));
    setStatus(statusEl, "Not saved.");
    return false;
  }

  if (warnings.length && !requireComplete) {
    const ok = await confirmModal({
      title: "Save anyway?",
      messageHtml: `<ul>${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`,
      okText: "Save anyway",
      cancelText: "Cancel",
    });
    if (!ok) {
      setStatus(statusEl, "Not saved.");
      return false;
    }
  }

  try {
    const eff = getCurrentEffValues();

    const patch = buildAttributesUpdatePatch({
      level,
      attributes: eff,
      primaryAttribute: primaryAttr,
    });

    await saveCharacterPatch(charRef, patch);

    // Update local cache
    currentDoc = currentDoc || {};
    currentDoc.builder = { ...(currentDoc.builder || {}), attributes: eff };

    setStatus(statusEl, "Saved.");

    if (openSheetAfter) {
      const url = new URL("editor.html", window.location.href);
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

// ---- Init ----
async function main() {
  try {
    ctx = await initBuilderAuth({
      whoamiEl,
      signOutBtn,
      gmHintEl,
      statusEl,
      errorEl,
    });

    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    await markStepVisited(charRef, CURRENT_STEP_ID);

    level = clampLevel(currentDoc?.builder?.level || 1);
    primaryAttr = String(currentDoc?.builder?.primaryAttribute || "");

    levelLabel.textContent = String(level);
    primaryLabel.textContent = ATTR_LABELS[primaryAttr] || (primaryAttr ? primaryAttr : "—");

    if (!primaryAttr) {
      showError(errorEl, "Primary Attribute not set. Go back to the Class step.");
    }

    // Load stored final attribute values (already includes the Primary +1 bonus)
    const storedAttrs = currentDoc?.builder?.attributes || {};
    const eff = {};
    for (const k of ATTR_KEYS) eff[k] = Number(storedAttrs[k] || 0);


    for (const { key, input } of attrRows) {
      const effCap = getAttributeEffectiveCap(level, key, primaryAttr);
      const min = key === primaryAttr ? 1 : 0;
      const v = clampInt(eff[key] ?? 0, min, effCap);
      input.value = String(v);
      input.addEventListener("input", updateUI);
      input.addEventListener("change", updateUI);
    }

    // Render nav (this is currently the last step, but nav still shows orientation)
    renderBuilderNav({
      mountEl: navMount,
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNext: async () => await saveBuilder({ openSheetAfter: false, requireComplete: true }),
    });

    saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false, requireComplete: false }));
    saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true, requireComplete: false }));

    updateUI();
    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading attributes step.");
    setStatus(statusEl, "Error.");
  }
}

main();
