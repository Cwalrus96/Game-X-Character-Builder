import { storage } from "./firebase.js";
import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  setStatus,
  showError,
  clearError,
  markStepVisited,
  confirmModal,
  buildBuilderUrl,
} from "./builder-common.js";
import { renderBuilderNav } from "./builder-nav.js";

import {
  ATTR_KEYS,
  clampLevel,
  getAttributePointsToSpend,
  getAttributeFinalCap,
  getAttributeMaxDuringBasicsStep,
  normalizeAttributes,
  sumAttributes,
  getBasicsWarnings,
  buildBasicsUpdatePatch,
} from "./character-schema.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

import {
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ---- Page identity (keeps each page self-contained) ----
const CURRENT_STEP_ID =
  document.querySelector("[data-builder-step]")?.getAttribute("data-builder-step") || "basics";

// ---- Common shell UI ----
const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// ---- Nav mount ----
const navMount = document.getElementById("builderNav");

// ---- Step-specific UI ----
const charNameInput = document.getElementById("charName");
const portraitFile = document.getElementById("portraitFile");
const portraitPreview = document.getElementById("portraitPreview");
const uploadPortraitBtn = document.getElementById("uploadPortraitBtn");
const clearPortraitBtn = document.getElementById("clearPortraitBtn");

const levelSelect = document.getElementById("level");
const pointsEl = document.getElementById("points");
const remainingEl = document.getElementById("remaining");
const remainingPill = document.getElementById("remainingPill");
const capEl = document.getElementById("cap");
const stepCapEl = document.getElementById("stepCap");
const capNoteEl = document.getElementById("capNote");
const zeroNoteEl = document.getElementById("zeroNote");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

// ---- State ----
let ctx = null;              // { charId, requestedUid, editingUid, user, claims }
let charRef = null;
let currentDoc = null;

let pendingPortraitFile = null;
let portraitPath = "";
let portraitUrl = "";

// Attributes are always described in the same order for UI consistency.
const ATTRS = ATTR_KEYS;
const attrRows = [...document.querySelectorAll(".attrRow")];
const attrInputsByKey = Object.fromEntries(
  attrRows.map((row) => {
    const k = row.dataset.attr;
    const input = row.querySelector(".attrInput");
    return [k, input];
  })
);

// ---- Small utilities ----
function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function readAttrValues() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of ATTRS) out[k] = clamp(attrInputsByKey[k]?.value || 0, 0, 99);
  return normalizeAttributes(out);
}

function writeAttrValues(values) {
  for (const k of ATTRS) {
    if (attrInputsByKey[k]) attrInputsByKey[k].value = String(clamp(values[k] ?? 0, 0, 99));
  }
}

function sumAttrs(values) {
  return sumAttributes(normalizeAttributes(values));
}

function setPortraitPreview(url) {
  if (!portraitPreview) return;
  if (!url) {
    portraitPreview.src = "";
    portraitPreview.style.display = "none";
    return;
  }
  portraitPreview.src = url;
  portraitPreview.style.display = "block";
}

function setFieldMaxes() {
  const level = clampLevel(levelSelect.value);
  const perAttrCap = getAttributeFinalCap(level);
  const perStepCap = getAttributeMaxDuringBasicsStep(level);
  const totalPoints = getAttributePointsToSpend(level);

  const values = readAttrValues();
  const used = sumAttrs(values);
  const remaining = totalPoints - used;

  // Each input's max is dynamic:
  // - cannot exceed per-attribute cap
  // - cannot exceed per-step cap (if desired)
  // - cannot exceed total remaining + current value
  for (const k of ATTRS) {
    const input = attrInputsByKey[k];
    if (!input) continue;

    const current = clamp(input.value, 0, 99);
    const maxByTotal = current + Math.max(0, remaining);
    const maxAllowed = Math.min(perAttrCap, perStepCap, maxByTotal);

    input.max = String(maxAllowed);

    // If current value is already above what is allowed (e.g., level lowered),
    // clamp it so the UI and computed totals remain consistent.
    if (current > maxAllowed) {
      input.value = String(maxAllowed);
    }
  }
}

function updateDerivedUI() {
  const level = clampLevel(levelSelect.value);
  const totalPoints = getAttributePointsToSpend(level);
  const perAttrCap = getAttributeFinalCap(level);
  const perStepCap = getAttributeMaxDuringBasicsStep(level);

  const values = readAttrValues();
  const used = sumAttrs(values);
  const remaining = totalPoints - used;

  if (pointsEl) pointsEl.textContent = String(totalPoints);
  if (capEl) capEl.textContent = String(perAttrCap);
  if (stepCapEl) stepCapEl.textContent = String(perStepCap);

  if (remainingEl) remainingEl.textContent = String(remaining);

  if (remainingPill) {
    remainingPill.classList.remove("danger", "ok");
    remainingPill.classList.add(remaining === 0 ? "ok" : "danger");
  }

  // 0-values warning: your rules say rolling 0 dice auto-fails.
  // We don't block, but we do warn.
  const zeros = ATTRS.filter((k) => (Number(values[k]) || 0) === 0);
  for (const row of attrRows) row.classList.toggle("zero", zeros.includes(row.dataset.attr));

  if (zeroNoteEl) {
    zeroNoteEl.style.display = zeros.length ? "block" : "none";
    if (zeros.length) zeroNoteEl.textContent = "Warning: An attribute at 0 will auto-fail rolls using that attribute.";
  }

  // Note: at levels 1-2, the Basics step can't reach the final cap because
  // Primary Attribute selection (+1) happens later on the Class step.
  if (capNoteEl) {
    if (perStepCap < perAttrCap) {
      capNoteEl.style.display = "block";
      capNoteEl.textContent =
        "Note: At this level, you cannot increase an attribute to the final cap on this step. " +
        "You will gain an additional +1 to your Primary Attribute on the Class step.";
    } else {
      capNoteEl.style.display = "none";
      capNoteEl.textContent = "";
    }
  }

  setFieldMaxes();
}

function getWarningsForSave() {
  const level = clampLevel(levelSelect.value);
  const attrs = readAttrValues();
  return getBasicsWarnings({ level, attributes: attrs });
}

// ---- Portrait storage helpers ----
async function uploadPortrait() {
  if (!pendingPortraitFile) return { url: portraitUrl, path: portraitPath };

  // Store in a predictable location for this character.
  const file = pendingPortraitFile;
  // Prefer MIME type over filename (more reliable).
  const type = String(file.type || "").toLowerCase();
  const safeExt =
    type === "image/jpeg" ? "jpg" :
    type === "image/png" ? "png" :
    type === "image/webp" ? "webp" :
    type === "image/gif" ? "gif" : "png";

  // Keep the path stable so re-uploads overwrite cleanly.
  const storagePath = `portraits/${ctx.editingUid}/${ctx.charId}/portrait.${safeExt}`;
  const r = storageRef(storage, storagePath);

  await uploadBytes(r, file, { contentType: file.type || "image/*" });
  const url = await getDownloadURL(r);

  pendingPortraitFile = null;
  return { url, path: storagePath };
}

async function clearPortrait() {
  if (portraitPath) {
    try {
      await deleteObject(storageRef(storage, portraitPath));
    } catch (e) {
      // Non-fatal: object may not exist.
      console.warn("delete portrait failed:", e);
    }
  }
  portraitPath = "";
  portraitUrl = "";
  pendingPortraitFile = null;
  if (portraitFile) portraitFile.value = "";
  setPortraitPreview("");
  // Persist clear (best effort)
  if (charRef) {
    await saveCharacterPatch(charRef, { portraitPath: "", portraitUrl: "" });
  }
}

// Sheet helper: ensure sheet.fields exists so update paths are valid
async function ensureSheetMap() {
  if (!charRef) return;
  if (currentDoc?.sheet?.fields && typeof currentDoc.sheet.fields === "object") return;
  await setDoc(charRef, { sheet: { fields: {} } }, { merge: true });
}

// ---- Save logic (used by Save buttons and by Next auto-save) ----
async function saveBuilder({ openSheetAfter = false } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = getWarningsForSave();
  if (warnings.length) {
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
    // Portrait: auto-upload on save if a file is selected
    if (pendingPortraitFile) {
      try {
        const up = await uploadPortrait();
        portraitUrl = up.url || "";
        portraitPath = up.path || "";
      } catch (e) {
        console.warn("portrait upload failed:", e);
        const ok = await confirmModal({
          title: "Portrait upload failed",
          messageHtml: "Save without portrait?",
          okText: "Save without portrait",
          cancelText: "Cancel",
        });
        if (!ok) {
          setStatus(statusEl, "Not saved.");
          return false;
        }
      }
    }

    await ensureSheetMap();

    const level = clampLevel(levelSelect.value);
    const attrs = readAttrValues();

    const patch = buildBasicsUpdatePatch({
      name: (charNameInput?.value || "").trim(),
      level,
      attributes: attrs,
      portraitPath,
      portraitUrl,
    });

    await saveCharacterPatch(charRef, patch);

    setStatus(statusEl, "Saved.");

    // Update local cache (avoid spreading dot-path keys into the root object)
    currentDoc = currentDoc || {};
    currentDoc.name = patch.name;
    currentDoc.portraitPath = portraitPath;
    currentDoc.portraitUrl = portraitUrl;
    currentDoc.builder = { ...(currentDoc.builder || {}), level, attributes: attrs };
    currentDoc.sheet = currentDoc.sheet || {};
    currentDoc.sheet.fields = { ...(currentDoc.sheet.fields || {}), charName: patch["sheet.fields.charName"], level, ...attrs };

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
  } finally {
    updateDerivedUI();
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

    // Mark this step as visited (non-fatal if it fails)
    await markStepVisited(charRef, CURRENT_STEP_ID);

    // Populate UI from doc
    charNameInput.value = currentDoc.name || "";

    portraitPath = currentDoc.portraitPath || "";
    portraitUrl = currentDoc.portraitUrl || "";
    setPortraitPreview(portraitUrl || "");

    const b = currentDoc.builder || {};
    levelSelect.value = String(clampLevel(b.level || 1));

    const attrs = normalizeAttributes(b.attributes || {});
    writeAttrValues(attrs);

    // Wire events
    levelSelect.addEventListener("change", () => updateDerivedUI());

    for (const k of ATTRS) {
      const input = attrInputsByKey[k];
      if (!input) continue;
      input.addEventListener("input", () => updateDerivedUI());
      input.addEventListener("change", () => updateDerivedUI());
    }

    if (portraitFile) {
      portraitFile.addEventListener("change", () => {
        const f = portraitFile.files && portraitFile.files[0];
        if (!f) return;
        pendingPortraitFile = f;
        setPortraitPreview(URL.createObjectURL(f));
      });
    }

    if (uploadPortraitBtn) {
      uploadPortraitBtn.addEventListener("click", async () => {
        clearError(errorEl);
        setStatus(statusEl, "Uploading…");
        try {
          if (!pendingPortraitFile) {
            setStatus(statusEl, "No file selected.");
            return;
          }
          const up = await uploadPortrait();
          portraitUrl = up.url || "";
          portraitPath = up.path || "";
          setPortraitPreview(portraitUrl);
          await saveCharacterPatch(charRef, { portraitPath, portraitUrl });
          setStatus(statusEl, "Portrait uploaded.");
        } catch (e) {
          console.error(e);
          showError(errorEl, "Portrait upload failed.");
          setStatus(statusEl, "Error.");
        }
      });
    }

    if (clearPortraitBtn) clearPortraitBtn.addEventListener("click", clearPortrait);

    saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false }));
    saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true }));

    // Render builder nav (step list + prev/next).
    // Next auto-save: the nav calls this before navigating.
    renderBuilderNav({
      mountEl: navMount,
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNext: async () => {
        // If/when there is a next step, we auto-save before navigation.
        // Keep consistent with your "save anytime" philosophy.
        return await saveBuilder({ openSheetAfter: false });
      },
    });

    updateDerivedUI();
    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading builder.");
    setStatus(statusEl, "Error.");
  }
}

main();
