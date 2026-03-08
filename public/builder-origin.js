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
import { loadGameXOrigins, getOriginByKey } from "./game-data.js";
import { buildOriginUpdatePatch } from "./database-writer.js";
import { escapeHtml, sanitizeText } from "./data-sanitization.js";

const CURRENT_STEP_ID = "origin";

let ctx;
let charRef;
let currentDoc;
let origins = [];

const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const navTopEl = document.getElementById("builderNavTop");
const navBottomEl = document.getElementById("builderNavBottom");

const originSelectEl = document.getElementById("originSelect");
const originKeystoneEl = document.getElementById("originKeystone");
const originSummaryEl = document.getElementById("originSummary");
const originDetailsEl = document.getElementById("originDetails");
const originStatusHintEl = document.getElementById("originStatusHint");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

function isSelectable(origin) {
  return String(origin?.status || "") === "playable";
}

function statusLabel(origin) {
  const status = String(origin?.status || "");
  if (status === "playable") return "Playable";
  if (status === "draft") return "Draft";
  if (status === "incomplete") return "Incomplete";
  return "Unknown";
}

function populateOriginSelect() {
  originSelectEl.innerHTML = '<option value="">Select an origin…</option>';

  for (const origin of origins) {
    const opt = document.createElement("option");
    opt.value = String(origin?.originKey || "");
    opt.textContent = `${origin?.name || "Origin"} — ${statusLabel(origin)}`;
    opt.disabled = !isSelectable(origin);
    originSelectEl.appendChild(opt);
  }
}

function renderList(title, items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return "";
  return `
    <section class="builderItem">
      <div class="builderItemTitle">${escapeHtml(title)}</div>
      <ul class="help" style="margin-top:8px; padding-left:18px;">
        ${list.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderFeatures(features) {
  const list = Array.isArray(features) ? features : [];
  if (!list.length) return "";
  return `
    <section class="builderItem">
      <div class="builderItemTitle">Features</div>
      <div class="optionList" style="margin-top:8px;">
        ${list.map((feature) => `
          <div class="optionRow">
            <div>
              <div class="optionTitle">${escapeHtml(String(feature?.name || "Feature"))}</div>
              <div class="optionDesc">${escapeHtml(String(feature?.description || ""))}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSelectedOrigin() {
  const selected = getOriginByKey(origins, originSelectEl.value);
  if (!selected) {
    originSummaryEl.textContent = "Select an origin to see its details.";
    originSummaryEl.className = "builderItem muted";
    originDetailsEl.innerHTML = "";
    originStatusHintEl.textContent = "";
    return;
  }

  originSummaryEl.className = "builderItem";
  originSummaryEl.innerHTML = `
    <div class="builderItemTitle">${escapeHtml(String(selected?.name || "Origin"))}</div>
    <div class="builderItemMeta">${escapeHtml(statusLabel(selected))}</div>
    <div class="builderItemBody">${escapeHtml(String(selected?.summary || selected?.description || ""))}</div>
  `;

  originStatusHintEl.textContent = statusLabel(selected);

  const examples = Array.isArray(selected?.examples) && selected.examples.length
    ? selected.examples.join(", ")
    : "";

  originDetailsEl.innerHTML = `
    ${selected?.description ? `<section class="builderItem"><div class="builderItemTitle">Description</div><div class="builderItemBody">${escapeHtml(String(selected.description))}</div></section>` : ""}
    ${renderFeatures(selected?.features)}
    ${renderList("Roleplay Questions", selected?.roleplayQuestions)}
    ${renderList("Higher Level Upgrades", selected?.higherLevelUpgrades)}
    ${examples ? `<section class="builderItem"><div class="builderItemTitle">Examples</div><div class="builderItemBody">${escapeHtml(examples)}</div></section>` : ""}
  `;
}

function getWarnings() {
  const warnings = [];
  const selected = getOriginByKey(origins, originSelectEl.value);
  if (!selected) warnings.push("Origin is not selected.");
  if (selected && !isSelectable(selected)) warnings.push("Selected origin is not currently playable in the builder.");
  if (!sanitizeText(originKeystoneEl.value || "", { maxLen: 400, collapse: true })) {
    warnings.push("Origin Keystone is empty.");
  }
  return warnings;
}

async function saveBuilder({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = getWarnings();
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
    const patch = buildOriginUpdatePatch({
      originKey: originSelectEl.value,
      originKeystone: originKeystoneEl.value,
    });

    await saveCharacterPatch(charRef, patch);
    currentDoc = currentDoc || {};
    currentDoc.builder = {
      ...(currentDoc.builder || {}),
      originKey: patch["builder.originKey"],
      originKeystone: patch["builder.originKeystone"],
    };

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

    origins = await loadGameXOrigins({ cache: "no-store" });
    populateOriginSelect();

    originSelectEl.value = String(currentDoc?.builder?.originKey || "");
    originKeystoneEl.value = String(currentDoc?.builder?.originKeystone || "");
    renderSelectedOrigin();

    await markStepVisited(charRef, CURRENT_STEP_ID);

    originSelectEl.addEventListener("change", renderSelectedOrigin);

    saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false, intent: "save" }));
    saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true, intent: "save" }));

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
