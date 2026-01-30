import { db, storage } from "./firebase.js";
import { onAuth, signOutNow, initAuthRedirectHandling, getClaims } from "./auth-ui.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

// ---- DOM ----
const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHint = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const charNameInput = document.getElementById("charName");
const portraitFile = document.getElementById("portraitFile");
const portraitPreview = document.getElementById("portraitPreview");
const uploadPortraitBtn = document.getElementById("uploadPortraitBtn");
const clearPortraitBtn = document.getElementById("clearPortraitBtn");

const levelSelect = document.getElementById("level");
const pointsEl = document.getElementById("points");
const capEl = document.getElementById("cap");
const stepCapEl = document.getElementById("stepCap");
const capNoteEl = document.getElementById("capNote");
const zeroNoteEl = document.getElementById("zeroNote");

// New UI (may not exist on older HTML; we guard with ?.)
const remainingEl = document.getElementById("remaining");
const remainingPill = document.getElementById("remainingPill");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

// Confirmation modal (new)
const confirmModal = document.getElementById("confirmModal");
const confirmMsg = document.getElementById("confirmMsg");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmOkBtn = document.getElementById("confirmOkBtn");

// ---- state ----
const urlParams = new URLSearchParams(window.location.search);
const charId = urlParams.get("charId");
const requestedUid = urlParams.get("uid");

let currentUser = null;
let claims = null;

let editingUid = null;
let charRef = null;
let currentDoc = null;

let pendingPortraitFile = null;
let portraitPath = "";
let portraitUrl = "";

const ATTRS = ["strength", "agility", "intellect", "willpower", "attunement", "heart"];
const ATTR_LABEL = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  willpower: "Willpower",
  attunement: "Attunement",
  heart: "Heart",
};

// These override/ensure accurate mechanical tooltip text,
// even if the HTML was pasted from an earlier draft.
const ATTR_MECH_TIPS = {
  strength:
    "When you increase Strength, increase your HP by 2 + your new level. Strength is also used for most melee and unarmed attacks.",
  agility:
    "Speed = 4 + Agility. When you increase Agility, your movement Speed increases by +1. Many ranged attacks use Agility.",
  intellect:
    "Each time you increase Intellect, you gain +2 Skill Points. Intellect is also used for Investigation actions.",
  willpower:
    "Willpower improves your ability to accumulate Strain without becoming Overstrained, and helps resist mental effects.",
  heart:
    "When you increase Heart, you gain additional Bond points (details TBD in the handbook). Heart is used for Bond actions such as Assist.",
  attunement:
    "When you increase Attunement, your Power Die increases by +1. Outside combat, your starting Power Die equals your Attunement.",
};

function showError(msg) {
  if (!errorEl) return;
  if (!msg) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
    return;
  }
  errorEl.style.display = "block";
  errorEl.textContent = msg;
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function capAtLevel(level) {
  // Handbook table: L1=4, L2=5, L3=5, L4=6...
  return 4 + Math.floor(level / 2);
}

function pointsAtLevel(level) {
  // L1 = 12, +3 per level thereafter
  return 12 + 3 * (level - 1);
}

function maxThisStep(level) {
  // Some levels show a higher final cap than is reachable on this step
  // (because Primary Attribute increases happen later).
  const cap = capAtLevel(level);
  return level === 1 || level % 2 === 0 ? cap - 1 : cap;
}

function setPortraitPreview(urlOrBlob) {
  if (!portraitPreview) return;
  if (!urlOrBlob) {
    portraitPreview.style.display = "none";
    portraitPreview.src = "";
    return;
  }
  portraitPreview.src = urlOrBlob;
  portraitPreview.style.display = "block";
}

function readAttrValues() {
  const values = {};
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const input = row.querySelector(".attrInput");
    values[key] = Number(input.value) || 0;
  });
  // Ensure all exist
  for (const k of ATTRS) values[k] = Number(values[k]) || 0;
  return values;
}

function applyAttrValues(values) {
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const input = row.querySelector(".attrInput");
    if (key in values) input.value = String(Number(values[key]) || 0);
  });
}

function sumAttrs(values) {
  return ATTRS.reduce((acc, k) => acc + (Number(values[k]) || 0), 0);
}

function enforceConstraintsOnce({ level }) {
  const cap = capAtLevel(level);
  const stepCap = maxThisStep(level);
  const points = pointsAtLevel(level);

  // 1) Clamp each attribute to [0, stepCap]
  let values = readAttrValues();
  for (const k of ATTRS) values[k] = clamp(Number(values[k]) || 0, 0, stepCap);

  // 2) If (somehow) overspent, reduce highest stats first until within points.
  let total = sumAttrs(values);
  if (total > points) {
    let overspend = total - points;
    // Reduce repeatedly; only 6 attrs so it's cheap.
    while (overspend > 0) {
      // pick the attribute with the highest value > 0
      let pick = null;
      for (const k of ATTRS) {
        if (values[k] > 0 && (pick === null || values[k] > values[pick])) pick = k;
      }
      if (!pick) break;
      values[pick] -= 1;
      overspend -= 1;
    }
  }

  // 3) Dynamic per-input max so you can't exceed total points.
  // Compute total again after reduction.
  total = sumAttrs(values);

  let changed = false;
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const input = row.querySelector(".attrInput");
    const current = Number(values[key]) || 0;
    const otherSum = total - current;
    const maxByPoints = Math.max(0, points - otherSum);
    const newMax = Math.min(stepCap, maxByPoints);

    input.max = String(newMax);

    const clamped = clamp(current, 0, newMax);
    if (clamped !== current) {
      values[key] = clamped;
      changed = true;
    }
  });

  if (changed) applyAttrValues(values);

  return { cap, stepCap, points, values, total: sumAttrs(values) };
}

function setRemainingPill(remaining) {
  if (!remainingPill) return;
  remainingPill.classList.remove("ok", "danger");
  if (remaining === 0) remainingPill.classList.add("ok");
  else remainingPill.classList.add("danger");
}

function updateTooltipsIfPresent() {
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const btn = row.querySelector(".tipBtn");
    if (btn && ATTR_MECH_TIPS[key]) {
      btn.setAttribute("data-tip", ATTR_MECH_TIPS[key]);
      // Add semantic role for assistive tech if you later expand the tooltip implementation.
      btn.setAttribute("aria-label", `${ATTR_LABEL[key]} mechanics`);
    }
  });
}

function updateDerivedUI() {
  showError("");

  const level = Number(levelSelect?.value || 1);

  // Iterate a couple times to stabilize max clamping if needed.
  let state = null;
  for (let i = 0; i < 3; i++) state = enforceConstraintsOnce({ level });

  const { cap, stepCap, points, values, total } = state;

  if (pointsEl) pointsEl.textContent = String(points);
  if (capEl) capEl.textContent = String(cap);
  if (stepCapEl) stepCapEl.textContent = String(stepCap);

  if (capNoteEl) {
    if (stepCap < cap) {
      capNoteEl.style.display = "block";
      capNoteEl.textContent =
        "Note: At this level, you cannot increase an attribute to the final cap on this step. " +
        "Primary Attribute increases happen later.";
    } else {
      capNoteEl.style.display = "none";
      capNoteEl.textContent = "";
    }
  }

  const remaining = points - total;
  if (remainingEl) remainingEl.textContent = String(remaining);
  setRemainingPill(remaining);

  // Highlight zero attributes (and show warning text)
  const zeros = [];
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const v = Number(values[key]) || 0;
    if (v === 0) {
      row.classList.add("zero");
      zeros.push(ATTR_LABEL[key] || key);
    } else {
      row.classList.remove("zero");
    }
  });

  if (zeroNoteEl) {
    if (zeros.length > 0) {
      zeroNoteEl.style.display = "block";
      zeroNoteEl.textContent =
        "Warning: Any roll tied to an Attribute at 0 automatically fails (0 Hits). " +
        `Currently at 0: ${zeros.join(", ")}.`;
    } else {
      zeroNoteEl.style.display = "none";
      zeroNoteEl.textContent = "";
    }
  }

  if (remaining === 0) setStatus("Points assigned. You can save or continue.");
  else if (remaining > 0) setStatus(`You have ${remaining} attribute point(s) remaining.`);
  else setStatus(`You have overspent by ${Math.abs(remaining)} point(s).`);
}

function listIssuesForSave() {
  const level = Number(levelSelect?.value || 1);
  const points = pointsAtLevel(level);
  const values = readAttrValues();
  const stepCap = maxThisStep(level);

  // Clamp to compute remaining accurately (even if user typed a weird value)
  for (const k of ATTRS) values[k] = clamp(Number(values[k]) || 0, 0, stepCap);

  const total = sumAttrs(values);
  const remaining = points - total;

  const zeros = ATTRS.filter((k) => (Number(values[k]) || 0) === 0).map((k) => ATTR_LABEL[k]);

  const issues = [];
  if (remaining !== 0) {
    if (remaining > 0) issues.push(`You still have ${remaining} attribute point(s) remaining.`);
    else issues.push(`You have overspent by ${Math.abs(remaining)} point(s).`);
  }
  if (zeros.length > 0) {
    issues.push(
      "These attributes are 0 (related rolls automatically fail): " + zeros.join(", ")
    );
  }
  return issues;
}

let _confirmAction = null;

function openConfirmModal(issues, action) {
  if (!confirmModal || !confirmMsg || !confirmOkBtn || !confirmCancelBtn) {
    // Fallback if modal is missing: just run action.
    action();
    return;
  }

  _confirmAction = action;

  const ul = document.createElement("ul");
  ul.style.margin = "8px 0 0 18px";
  ul.style.padding = "0";
  ul.style.color = "#333";
  for (const issue of issues) {
    const li = document.createElement("li");
    li.textContent = issue;
    ul.appendChild(li);
  }

  // Replace contents safely
  confirmMsg.innerHTML = "";
  confirmMsg.appendChild(document.createTextNode("This step looks incomplete. If you save now:"));
  confirmMsg.appendChild(ul);

  confirmModal.style.display = "flex";

  // focus default action for keyboard users
  confirmOkBtn.focus();
}

function closeConfirmModal() {
  if (!confirmModal) return;
  confirmModal.style.display = "none";
  _confirmAction = null;
}

async function loadCharacterDoc() {
  if (!charId) throw new Error("Missing charId in URL.");
  charRef = doc(db, "users", editingUid, "characters", charId);

  const snap = await getDoc(charRef);
  if (!snap.exists()) throw new Error("Character not found.");

  currentDoc = snap.data() || {};

  if (charNameInput) charNameInput.value = currentDoc.name || "";

  portraitPath = currentDoc.portraitPath || "";
  portraitUrl = currentDoc.portraitUrl || "";
  setPortraitPreview(portraitUrl || "");

  const b = currentDoc.builder || {};
  const lvl = Number(b.level || 1);
  if (levelSelect) levelSelect.value = String(clamp(lvl, 1, 12));

  const attrs = (b.attributes || {});
  applyAttrValues({
    strength: Number(attrs.strength) || 0,
    agility: Number(attrs.agility) || 0,
    intellect: Number(attrs.intellect) || 0,
    willpower: Number(attrs.willpower) || 0,
    attunement: Number(attrs.attunement) || 0,
    heart: Number(attrs.heart) || 0,
  });

  updateTooltipsIfPresent();
  updateDerivedUI();
}

async function ensureSheetMap() {
  // Handles old docs where sheet might be null; updateDoc(field paths) needs a map.
  await setDoc(charRef, { sheet: { fields: {} } }, { merge: true });
}

async function tryUploadPortraitIfNeeded() {
  // If a file is selected, we upload it as part of Save even if the user didn't click Upload.
  if (!pendingPortraitFile) return { portraitPath, portraitUrl };

  if (!charRef) throw new Error("No character document reference.");

  const file = pendingPortraitFile;
  const safeName = (file.name || "portrait").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `portraits/${editingUid}/${charId}/${Date.now()}_${safeName}`;

  if (uploadPortraitBtn) uploadPortraitBtn.disabled = true;

  try {
    const objRef = storageRef(storage, path);
    await uploadBytes(objRef, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(objRef);

    portraitPath = path;
    portraitUrl = url;

    // Save immediately so editor.html sees it even if something else fails later.
    await ensureSheetMap();
    await updateDoc(charRef, {
      portraitPath: portraitPath,
      portraitUrl: portraitUrl,
      "sheet.portrait": portraitUrl,
      updatedAt: serverTimestamp(),
    });

    pendingPortraitFile = null;
    setStatus("Portrait uploaded.");
    return { portraitPath, portraitUrl };
  } catch (e) {
    console.error(e);
    // Let caller decide if they want to proceed without portrait.
    throw new Error("Could not upload portrait (permissions or network issue).");
  } finally {
    if (uploadPortraitBtn) uploadPortraitBtn.disabled = false;
  }
}

async function uploadPortrait() {
  showError("");
  if (!pendingPortraitFile) return showError("Choose an image first.");
  try {
    await tryUploadPortraitIfNeeded();
  } catch (e) {
    showError(e.message || "Could not upload portrait.");
  }
}

async function clearPortrait() {
  showError("");
  if (!charRef) return;

  // Best effort delete old object (if any).
  try {
    if (portraitPath) {
      const objRef = storageRef(storage, portraitPath);
      await deleteObject(objRef);
    }
  } catch (e) {
    // Ignore storage delete failures; we still clear references.
    console.warn("deleteObject failed:", e);
  }

  portraitPath = "";
  portraitUrl = "";
  pendingPortraitFile = null;

  if (portraitFile) portraitFile.value = "";
  setPortraitPreview("");

  try {
    await ensureSheetMap();
    await updateDoc(charRef, {
      portraitPath: "",
      portraitUrl: "",
      "sheet.portrait": "",
      updatedAt: serverTimestamp(),
    });
    setStatus("Portrait cleared.");
  } catch (e) {
    console.error(e);
    showError("Could not clear portrait.");
  }
}

async function saveBuilder({ openSheetAfter = false } = {}) {
  showError("");

  const name = (charNameInput?.value || "").trim();
  if (name.length < 1) return showError("Please enter a character name.");

  const level = Number(levelSelect?.value || 1);
  const cap = capAtLevel(level);
  const stepCap = maxThisStep(level);
  const points = pointsAtLevel(level);

  // Clamp + enforce constraints before saving
  updateDerivedUI();
  const attrs = readAttrValues();
  for (const k of ATTRS) attrs[k] = clamp(Number(attrs[k]) || 0, 0, stepCap);

  // Auto-upload portrait if a file is selected
  // (If it fails, we give a prompt to save without it.)
  if (pendingPortraitFile) {
    try {
      await tryUploadPortraitIfNeeded();
    } catch (e) {
      // Ask whether to proceed without portrait.
      openConfirmModal(
        [String(e.message || "Portrait upload failed."), "Save without portrait?"],
        async () => {
          closeConfirmModal();
          pendingPortraitFile = null; // Don't retry automatically
          await saveBuilder({ openSheetAfter });
        }
      );
      return;
    }
  }

  // If the doc was never initialized properly, ensure sheet map exists.
  await ensureSheetMap();

  try {
    await updateDoc(charRef, {
      ownerUid: editingUid,
      name,
      portraitPath: portraitPath || "",
      portraitUrl: portraitUrl || "",

      builder: { level, attributes: attrs, updatedAt: serverTimestamp() },

      // Mirror into the sheet so the editor is auto-filled:
      "sheet.fields.charName": name,
      "sheet.fields.level": level,

      "sheet.fields.strength": attrs.strength,
      "sheet.fields.agility": attrs.agility,
      "sheet.fields.intellect": attrs.intellect,
      "sheet.fields.willpower": attrs.willpower,
      "sheet.fields.attunement": attrs.attunement,
      "sheet.fields.heart": attrs.heart,

      "sheet.portrait": portraitUrl || "",

      updatedAt: serverTimestamp(),
    });

    setStatus("Saved.");

    if (openSheetAfter) {
      const url = new URL("editor.html", window.location.href);
      url.searchParams.set("charId", charId);
      if (claims?.gm && requestedUid) url.searchParams.set("uid", requestedUid);
      window.location.href = url.toString();
    }
  } catch (e) {
    console.error(e);
    showError("Could not save.");
  } finally {
    updateDerivedUI();
  }
}

async function saveWithOptionalConfirm(openSheetAfter) {
  const issues = listIssuesForSave();
  if (issues.length > 0) {
    openConfirmModal(issues, async () => {
      closeConfirmModal();
      await saveBuilder({ openSheetAfter });
    });
  } else {
    await saveBuilder({ openSheetAfter });
  }
}

// ---- wire up ----
await initAuthRedirectHandling();

if (signOutBtn) signOutBtn.addEventListener("click", () => signOutNow());

levelSelect?.addEventListener("change", updateDerivedUI);
document.querySelectorAll(".attrInput").forEach((input) =>
  input.addEventListener("input", updateDerivedUI)
);

portraitFile?.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  pendingPortraitFile = file || null;

  if (file) {
    setPortraitPreview(URL.createObjectURL(file));
  } else {
    // If user clears selection without clicking Clear, keep existing stored portrait preview.
    setPortraitPreview(portraitUrl || "");
  }
});

uploadPortraitBtn?.addEventListener("click", () => uploadPortrait());
clearPortraitBtn?.addEventListener("click", () => clearPortrait());

saveBtn?.addEventListener("click", () => saveWithOptionalConfirm(false));
saveAndOpenBtn?.addEventListener("click", () => saveWithOptionalConfirm(true));

// Confirmation modal events
confirmCancelBtn?.addEventListener("click", () => closeConfirmModal());
confirmOkBtn?.addEventListener("click", () => {
  if (typeof _confirmAction === "function") _confirmAction();
});

// click outside modal card closes
confirmModal?.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Close modal if open
    if (confirmModal && confirmModal.style.display !== "none") {
      closeConfirmModal();
      return;
    }
    // Hide tooltip: blur focused tip button
    const el = document.activeElement;
    if (el && el.classList && el.classList.contains("tipBtn")) {
      el.blur();
    }
  }
});

onAuth(async (user) => {
  currentUser = user;
  if (!user) return (window.location.href = "login.html");

  if (whoamiEl) whoamiEl.textContent = user.email || user.displayName || "Signed in";
  if (signOutBtn) signOutBtn.style.display = "inline-block";

  claims = await getClaims(user, { forceRefresh: true });

  if (requestedUid) {
    if (!claims?.gm) return (window.location.href = "characters.html");
    editingUid = requestedUid;
    if (gmHint) {
      gmHint.style.display = "inline";
      gmHint.textContent = "GM View";
    }
  } else {
    editingUid = user.uid;
  }

  try {
    await loadCharacterDoc();
    setStatus("Ready.");
  } catch (e) {
    console.error(e);
    showError(e.message || "Could not load character.");
  }
});
