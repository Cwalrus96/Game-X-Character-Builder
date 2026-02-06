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
} from "./builder-common.js";
import { renderBuilderNav } from "./builder-nav.js";


import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";


// ---- Page identity ----
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

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

// ---- State ----
let ctx = null;              // { charId, requestedUid, editingUid, user, claims }
let charRef = null;
let currentDoc = null;

let pendingPortraitFile = null;
let portraitPath = "";
let portraitUrl = "";

// ---- Portrait storage helpers ----
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

async function uploadPortrait() {
  if (!pendingPortraitFile) return { url: portraitUrl, path: portraitPath };

  const file = pendingPortraitFile;
  const type = String(file.type || "").toLowerCase();
  const safeExt =
    type === "image/jpeg" ? "jpg" :
    type === "image/png" ? "png" :
    type === "image/webp" ? "webp" :
    type === "image/gif" ? "gif" : "png";

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
      console.warn("delete portrait failed:", e);
    }
  }
  portraitPath = "";
  portraitUrl = "";
  pendingPortraitFile = null;
  if (portraitFile) portraitFile.value = "";
  setPortraitPreview("");
  if (charRef) {
    await saveCharacterPatch(charRef, { "builder.portraitPath": "" });
  }
}


function getProfileWarnings() {
  const warnings = [];
  const name = (charNameInput?.value || "").trim();
  if (!name) warnings.push("Character name is empty.");
  return warnings;
}

// ---- Save logic ----
async function saveBuilder({ openSheetAfter = false, requireComplete = false } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const warnings = getProfileWarnings();
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
  } else if (warnings.length && requireComplete) {
    showError(errorEl, warnings.join(" "));
    setStatus(statusEl, "Not saved.");
    return false;
  }

  try {
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
    // --- Canonical patch: builder.name + builder.portraitPath only ---
    const patch = {
      "builder.name": (charNameInput?.value || "").trim(),
      "builder.portraitPath": portraitPath,
    };

    await saveCharacterPatch(charRef, patch);

    setStatus(statusEl, "Saved.");

    // Update local cache (only what Profile touches)
    currentDoc = currentDoc || {};
    currentDoc.builder = { ...(currentDoc.builder || {}), name: patch["builder.name"], portraitPath };

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

    // Populate UI from doc
    charNameInput.value = currentDoc?.builder?.name || "";

    portraitPath = currentDoc?.builder?.portraitPath || "";
    portraitUrl = "";
    if (portraitPath) {
      try {
        portraitUrl = await getDownloadURL(storageRef(storage, portraitPath));
      } catch (e) {
        console.warn("portrait getDownloadURL failed:", e);
      }
    }
    setPortraitPreview(portraitUrl || "");

    // Wire events
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
          await saveCharacterPatch(charRef, { "builder.portraitPath": portraitPath });
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

    // Builder nav (prev/next). Next auto-saves before navigation.
    renderBuilderNav({
      mountEl: navMount,
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNext: async () => await saveBuilder({ openSheetAfter: false, requireComplete: true }),
    });

	const navBottom = document.getElementById("builderNavBottom");
	renderBuilderNav({
	  mountEl: navBottom,
	  currentStepId: CURRENT_STEP_ID,
	  characterDoc: currentDoc,
	  ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
	  onBeforeNext: async () => {
		return await saveBuilder({ openSheetAfter: false });
	  },
	});

    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading builder.");
    setStatus(statusEl, "Error.");
  }
}

main();
