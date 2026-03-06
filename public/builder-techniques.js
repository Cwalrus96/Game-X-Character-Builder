// public/builder-techniques.js
// Techniques selection step: choose combat techniques by reference (techniqueName) and
// display granted techniques separately (doesn't use slots).

import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  markStepVisited,
  setStatus,
  showError,
  clearError,
  confirmSaveWarnings,
} from "./builder-common.js";

import { renderBuilderNav } from "./builder-nav.js";

import {
  coerceAttrKey,
  labelForAttrKey,
  computeTechniqueSlots,
} from "./character-rules.js";

import { buildTechniquesUpdatePatch } from "./database-writer.js";

import {
  loadGameXData,
  buildTechniqueIndexes,
  resolveTechniqueRef,
  computeKnownCombatSkillsAndGrants,
} from "./game-data.js";

import { safeHtmlText } from "./data-sanitization.js";

const CURRENT_STEP_ID = "techniques";

// ---- Common shell UI ----
const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// ---- Nav mounts ----
const navTop = document.getElementById("builderNavTop");
const navBottom = document.getElementById("builderNavBottom");

// ---- Step UI ----
const slotHintEl = document.getElementById("slotHint");
const slotPillsEl = document.getElementById("slotPills");
const techSearchEl = document.getElementById("techSearch");
const filterKnownSkillsEl = document.getElementById("filterKnownSkills");
const knownSkillsHelpEl = document.getElementById("knownSkillsHelp");
const grantedListEl = document.getElementById("grantedList");
const missingListEl = document.getElementById("missingList");
const techniqueGroupsEl = document.getElementById("techniqueGroups");
const openSheetLinkEl = document.getElementById("openSheetLink");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

// ---- State ----
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

let filterText = "";
let filterKnownSkills = true;

// Derived
let primaryAttrKey = "";
let slots = 0;
/** @type {Set<string>} */
let knownCombatSkills = new Set();
/** @type {Set<string>} */
let grantedTechniqueNames = new Set();

// ---- Helpers ----

function openSheet() {
  const url = new URL("editor.html", window.location.href);
  url.searchParams.set("charId", ctx.charId);
  if (ctx.claims?.gm && ctx.requestedUid) url.searchParams.set("uid", ctx.requestedUid);
  window.location.href = url.toString();
}

function resolveRef(ref) {
  const res = resolveTechniqueRef(ref, techIndexes);
  return res?.ok ? res.technique : null;
}

function getSelectedCounts() {
  let resolvedCount = 0;
  let missing = 0;
  for (const ref of selectedTechniques) {
    const t = resolveRef(ref);
    if (t) resolvedCount += 1;
    else missing += 1;
  }
  return { total: selectedTechniques.size, resolvedCount, missing };
}

function passesSearch(t) {
  if (!filterText) return true;
  const q = filterText.toLowerCase();
  const name = String(t?.techniqueName || "").toLowerCase();
  const skill = String(t?.skill || "").toLowerCase();
  const tags = Array.isArray(t?.tags) ? t.tags.join(" ").toLowerCase() : "";
  return name.includes(q) || skill.includes(q) || tags.includes(q);
}

function passesKnownSkillFilter(t) {
  if (!filterKnownSkills) return true;
  const skill = String(t?.skill || "").trim();
  if (!skill) return false;
  return knownCombatSkills.has(skill);
}

function deriveSkillsAndGrants() {
  const b = (currentDoc?.builder && typeof currentDoc.builder === "object") ? currentDoc.builder : {};
  const out = computeKnownCombatSkillsAndGrants(gameData, b);
  knownCombatSkills = out.knownCombatSkills;
  grantedTechniqueNames = out.grantedTechniqueNames;

  // If something is now granted, drop it from manual selection.
  for (const g of grantedTechniqueNames) {
    if (selectedTechniques.has(g)) selectedTechniques.delete(g);
  }
}

// ---- Rendering ----

function renderSlotSummary() {
  if (slotHintEl) {
    const label = primaryAttrKey ? (labelForAttrKey(primaryAttrKey) || primaryAttrKey) : "—";
    slotHintEl.textContent = primaryAttrKey
      ? `Slots = ${label} (${slots})`
      : "Primary Attribute not set.";
  }

  if (!slotPillsEl) return;
  slotPillsEl.innerHTML = "";

  const { total, missing } = getSelectedCounts();

  const pillSlots = document.createElement("span");
  pillSlots.className = "pill";
  pillSlots.textContent = `Slots: ${slots}`;

  const pillSel = document.createElement("span");
  pillSel.className = "pill";
  pillSel.textContent = `Selected: ${total} / ${slots}`;
  if (total > slots) pillSel.classList.add("danger");
  else if (slots > 0 && total === slots) pillSel.classList.add("ok");

  const pillMissing = document.createElement("span");
  pillMissing.className = "pill";
  pillMissing.textContent = `Missing refs: ${missing}`;
  if (missing) pillMissing.classList.add("danger");

  slotPillsEl.append(pillSlots, pillSel, pillMissing);
}

function renderKnownSkills() {
  if (!knownSkillsHelpEl) return;
  if (!knownCombatSkills.size) {
    knownSkillsHelpEl.textContent = "No combat skills detected (derived from class + feature/feat grants).";
    return;
  }
  const list = Array.from(knownCombatSkills).sort((a, b) => a.localeCompare(b));
  knownSkillsHelpEl.textContent = `Combat skills: ${list.join(", ")}`;
}

function renderGranted() {
  if (!grantedListEl) return;
  if (!grantedTechniqueNames.size) {
    grantedListEl.textContent = "—";
    return;
  }
  const names = Array.from(grantedTechniqueNames).sort((a, b) => a.localeCompare(b));
  grantedListEl.innerHTML = `<ul>${names.map((n) => `<li>${safeHtmlText(n, 200)}</li>`).join("")}</ul>`;
}

function renderMissingRefs() {
  if (!missingListEl) return;

  const missing = Array.from(selectedTechniques)
    .filter((ref) => !resolveRef(ref))
    .sort((a, b) => String(a).localeCompare(String(b)));

  missingListEl.innerHTML = "";
  if (!missing.length) {
    missingListEl.textContent = "—";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "optionList";

  for (const ref of missing) {
    const row = document.createElement("div");
    row.className = "optionRow";

    const left = document.createElement("div");
    left.style.flex = "1";

    const title = document.createElement("div");
    title.className = "optionTitle";
    title.textContent = ref;

    const desc = document.createElement("div");
    desc.className = "optionDesc muted";
    desc.textContent = "This technique no longer exists in the JSON data. Remove it or replace it.";

    left.append(title, desc);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn secondary";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => {
      selectedTechniques.delete(ref);
      renderAll();
    });

    row.append(left, btn);
    wrap.append(row);
  }

  missingListEl.append(wrap);
}

function renderTechniqueGroups() {
  if (!techniqueGroupsEl) return;

  const list = Array.isArray(gameData?.techniques) ? gameData.techniques : [];

  // Filter out granted techniques (shown elsewhere)
  const visible = list
    .filter((t) => {
      const name = String(t?.techniqueName || "").trim();
      if (!name) return false;
      if (grantedTechniqueNames.has(name)) return false;
      return true;
    })
    .filter(passesSearch)
    .filter(passesKnownSkillFilter);

  // Group by rank
  const byRank = new Map();
  for (const t of visible) {
    const r = Number.parseInt(String(t?.rank ?? 0), 10);
    const rank = Number.isFinite(r) ? r : 0;
    const arr = byRank.get(rank) || [];
    arr.push(t);
    byRank.set(rank, arr);
  }

  const ranks = Array.from(byRank.keys()).sort((a, b) => a - b);
  techniqueGroupsEl.innerHTML = "";

  if (!ranks.length) {
    const msg = document.createElement("div");
    msg.className = "muted";
    msg.textContent = filterKnownSkills
      ? "No techniques match your combat skills + filters. Try unchecking the skill filter."
      : "No techniques match your current filters.";
    techniqueGroupsEl.append(msg);
    return;
  }

  const { total: selectedCount } = getSelectedCounts();

  for (const rank of ranks) {
    const items = (byRank.get(rank) || []).slice().sort((a, b) => {
      return String(a.techniqueName || "").localeCompare(String(b.techniqueName || ""));
    });

    if (rank === 0) {
      const details = document.createElement("details");
      details.open = false;

      const summary = document.createElement("summary");
      summary.textContent = `Rank 0 (informational) — ${items.length}`;
      summary.style.cursor = "pointer";
      summary.style.fontWeight = "700";
      summary.style.marginBottom = "8px";

      const ul = document.createElement("ul");
      ul.style.margin = "8px 0 0 18px";

      for (const t of items) {
        const li = document.createElement("li");
        li.textContent = `${t.techniqueName}${t.skill ? ` — ${t.skill}` : ""}`;
        ul.append(li);
      }

      details.append(summary, ul);
      techniqueGroupsEl.append(details);
      continue;
    }

    const header = document.createElement("h3");
    header.className = "h3";
    header.textContent = `Rank ${rank}`;
    header.style.marginTop = "14px";

    const listEl = document.createElement("div");
    listEl.className = "optionList";

    for (const t of items) {
      const name = String(t?.techniqueName || "").trim();
      if (!name) continue;

      const row = document.createElement("div");
      row.className = "optionRow";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedTechniques.has(name);

      const atCap = selectedCount >= slots;
      if (slots <= 0) cb.disabled = true;
      else if (atCap && !cb.checked) cb.disabled = true;

      cb.addEventListener("change", () => {
        clearError(errorEl);
        if (cb.checked) {
          const { total } = getSelectedCounts();
          if (total >= slots) {
            cb.checked = false;
            setStatus(statusEl, "No technique slots remaining.");
            return;
          }
          selectedTechniques.add(name);
        } else {
          selectedTechniques.delete(name);
        }
        renderAll();
      });

      const body = document.createElement("div");
      body.style.flex = "1";

      const title = document.createElement("div");
      title.className = "optionTitle";
      title.textContent = name;

      const metaParts = [];
      if (t.skill) metaParts.push(String(t.skill));
      if (t.actionType) metaParts.push(String(t.actionType));
      if (t.actions != null) metaParts.push(`${t.actions}A`);
      if (t.energyCost != null) metaParts.push(`Energy ${t.energyCost}`);

      const meta = document.createElement("div");
      meta.className = "builderItemMeta muted";
      meta.textContent = metaParts.join(" • ") || "";

      const desc = document.createElement("div");
      desc.className = "optionDesc muted";
      const d = String(t.description || "").trim();
      const n = String(t.notes || "").trim();
      desc.textContent = d || n || "";

      body.append(title, meta);
      if (desc.textContent) body.append(desc);

      row.append(cb, body);
      listEl.append(row);
    }

    techniqueGroupsEl.append(header, listEl);
  }
}

function renderAll() {
  deriveSkillsAndGrants();
  renderSlotSummary();
  renderKnownSkills();
  renderGranted();
  renderMissingRefs();
  renderTechniqueGroups();
}

// ---- Save logic ----

function buildSortedSelectedArray() {
  const arr = Array.from(selectedTechniques).map((ref) => {
    const t = resolveRef(ref);
    return {
      ref,
      rank: t ? Number.parseInt(String(t.rank ?? 0), 10) : 9999,
      name: t ? String(t.techniqueName || ref) : ref,
    };
  });

  arr.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.name).localeCompare(String(b.name));
  });

  return arr.map((x) => x.ref);
}

function getSaveIssues() {
  const errors = [];
  const warnings = [];

  const { total, missing } = getSelectedCounts();

  if (!primaryAttrKey) warnings.push("Primary Attribute not set (go back to Class step). Technique slots will be 0.");

  if (total > slots) errors.push(`You selected ${total} techniques, but you only have ${slots} slots.`);
  if (slots > 0 && total < slots) warnings.push(`You have ${slots} slots, but only selected ${total} techniques.`);
  if (missing) warnings.push(`${missing} selected technique reference(s) no longer exist in the JSON.`);

  return { errors, warnings };
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
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

  // Remove anything that is now granted.
  for (const g of grantedTechniqueNames) {
    if (selectedTechniques.has(g)) selectedTechniques.delete(g);
  }

  const selectedArr = buildSortedSelectedArray();
  const patch = buildTechniquesUpdatePatch({ selectedTechniques: selectedArr });

  try {
    await saveCharacterPatch(charRef, patch);
    setStatus(statusEl, "Saved.");

    // Update local cache
    currentDoc = currentDoc || {};
    currentDoc.builder = { ...(currentDoc.builder || {}), selectedTechniques: selectedArr };

    if (openSheetAfter) openSheet();
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

    setStatus(statusEl, "Loading game data…");
    gameData = await loadGameXData({ cache: "no-store" });
    techIndexes = buildTechniqueIndexes(gameData?.techniques);

    setStatus(statusEl, "Loading character…");
    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    await markStepVisited(charRef, CURRENT_STEP_ID);

    // Pull builder state
    const b = (currentDoc?.builder && typeof currentDoc.builder === "object") ? currentDoc.builder : {};

    ({ primaryAttrKey, slots } = computeTechniqueSlots(b?.primaryAttribute, b?.attributes));

    const stored = Array.isArray(b.selectedTechniques) ? b.selectedTechniques : [];
    selectedTechniques = new Set(stored.map((x) => String(x || "").trim()).filter(Boolean));

    // Wire controls
    if (techSearchEl) {
      techSearchEl.addEventListener("input", () => {
        filterText = String(techSearchEl.value || "").trim();
        renderTechniqueGroups();
      });
    }

    if (filterKnownSkillsEl) {
      filterKnownSkillsEl.addEventListener("change", () => {
        filterKnownSkills = !!filterKnownSkillsEl.checked;
        renderAll();
      });
      filterKnownSkills = !!filterKnownSkillsEl.checked;
    }

    if (openSheetLinkEl) {
      openSheetLinkEl.addEventListener("click", (e) => {
        e.preventDefault();
        openSheet();
      });
    }

    if (saveBtn) saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false, intent: "save" }));
    if (saveAndOpenBtn) saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true, intent: "save" }));

    // Nav
    renderBuilderNav({
      mountEl: navTop,
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNavigate: async () => await saveBuilder({ openSheetAfter: false, intent: "navigate" }),
    });
    renderBuilderNav({
      mountEl: navBottom,
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNavigate: async () => await saveBuilder({ openSheetAfter: false, intent: "navigate" }),
    });

    // Initial render
    setStatus(statusEl, "Ready.");
    renderAll();

    if (!primaryAttrKey) {
      showError(errorEl, "Primary Attribute not set. Go back to the Class step.");
    }
  } catch (e) {
    console.error(e);
    showError(errorEl, "Could not load this step.");
    setStatus(statusEl, "Error.");
  }
}

main();
