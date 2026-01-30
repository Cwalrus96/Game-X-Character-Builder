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

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

const params = new URLSearchParams(window.location.search);
const charId = params.get("charId");
const requestedUid = params.get("uid");

if (!charId) {
  window.location.replace("characters.html");
  throw new Error("Missing charId");
}

let currentUser = null;
let claims = { gm: false };
let editingUid = null;
let charRef = null;
let currentDoc = null;
let pendingPortraitFile = null;
let portraitPath = "";
let portraitUrl = "";

const ATTRS = ["strength", "agility", "intellect", "willpower", "attunement", "heart"];

function showError(msg) {
  if (!msg) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
    return;
  }
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function capAtLevel(level) {
  // Handbook table: L1=4, L2=5, L3=5, L4=6...
  return 4 + Math.floor(level / 2);
}

function pointsAtLevel(level) {
  // 12 at level 1, +3 per level.
  return 12 + 3 * (level - 1);
}

function maxThisStep(level) {
  // Your note: some levels show a higher final cap than is reachable on this step
  // (because Primary Attribute increases happen later).
  const cap = capAtLevel(level);
  return (level === 1 || level % 2 === 0) ? cap - 1 : cap;
}

function readAttrValues() {
  const values = {};
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const input = row.querySelector(".attrInput");
    const n = Number(input.value);
    values[key] = Number.isFinite(n) ? n : 0;
  });
  return values;
}

function writeAttrValues(values) {
  document.querySelectorAll(".attrRow").forEach((row) => {
    const key = row.getAttribute("data-attr");
    const input = row.querySelector(".attrInput");
    if (!input) return;
    const v = values && typeof values[key] === "number" ? values[key] : 0;
    input.value = String(v);
  });
}

function updateDerivedUI() {
  const level = Number(levelSelect.value || 1);
  const cap = capAtLevel(level);
  const stepCap = maxThisStep(level);
  const points = pointsAtLevel(level);

  pointsEl.textContent = String(points);
  capEl.textContent = String(cap);
  stepCapEl.textContent = String(stepCap);

  if (stepCap < cap) {
    capNoteEl.style.display = "block";
    capNoteEl.textContent =
      "Note: At this level, you cannot increase an attribute to the max on this step. " +
      "You will gain an additional +1 to your Primary Attribute at a future step.";
  } else {
    capNoteEl.style.display = "none";
    capNoteEl.textContent = "";
  }

  let totalSpent = 0;
  let anyZero = false;

  document.querySelectorAll(".attrRow").forEach((row) => {
    const input = row.querySelector(".attrInput");
    const raw = Number(input.value);
    const clamped = clamp(Number.isFinite(raw) ? raw : 0, 0, stepCap);
    if (clamped !== raw) input.value = String(clamped);

    totalSpent += clamped;
    if (clamped === 0) anyZero = true;

    row.classList.toggle("zero", clamped === 0);
  });

  if (anyZero) {
    zeroNoteEl.style.display = "block";
    zeroNoteEl.textContent =
      "Leaving an attribute at 0 is not advised — skill rolls with an attribute of 0 automatically fail.";
  } else {
    zeroNoteEl.style.display = "none";
    zeroNoteEl.textContent = "";
  }

  const remaining = points - totalSpent;
  if (remaining === 0) {
    setStatus("Points assigned. Ready to save.");
  } else if (remaining > 0) {
    setStatus(`You have ${remaining} attribute point(s) left to spend.`);
  } else {
    setStatus(`You have overspent by ${Math.abs(remaining)} point(s). Reduce attributes to continue.`);
  }

  const canSave = remaining === 0;
  saveBtn.disabled = !canSave;
  saveAndOpenBtn.disabled = !canSave;
  saveBtn.style.opacity = canSave ? "1" : "0.6";
  saveAndOpenBtn.style.opacity = canSave ? "1" : "0.6";
}

function setPortraitPreview(url) {
  if (!url) {
    portraitPreview.style.display = "none";
    portraitPreview.src = "";
    return;
  }
  portraitPreview.src = url;
  portraitPreview.style.display = "block";
}

async function loadCharacterDoc() {
  charRef = doc(db, "users", editingUid, "characters", charId);
  const snap = await getDoc(charRef);
  if (!snap.exists()) throw new Error("Character not found.");

  currentDoc = snap.data() || {};

  charNameInput.value = currentDoc.name || "";

  portraitPath = currentDoc.portraitPath || "";
  portraitUrl = currentDoc.portraitUrl || "";
  setPortraitPreview(portraitUrl || "");

  const b = currentDoc.builder || {};
  const lvl = typeof b.level === "number" ? b.level : (Number(currentDoc.sheet?.fields?.level) || 1);
  levelSelect.value = String(clamp(lvl, 1, 12));

  const attrs = (b.attributes && typeof b.attributes === "object") ? b.attributes : (currentDoc.sheet?.fields || {});
  writeAttrValues({
    strength: Number(attrs.strength) || 0,
    agility: Number(attrs.agility) || 0,
    intellect: Number(attrs.intellect) || 0,
    willpower: Number(attrs.willpower) || 0,
    attunement: Number(attrs.attunement) || 0,
    heart: Number(attrs.heart) || 0,
  });

  updateDerivedUI();
}

async function ensureSheetMap() {
  // Handles old docs where sheet might be null; updateDoc(field paths) needs a map.
  await setDoc(charRef, { sheet: { fields: {} } }, { merge: true });
}

async function saveBuilder({ openSheetAfter = false } = {}) {
  showError("");

  const name = (charNameInput.value || "").trim();
  if (name.length < 1) return showError("Please enter a character name.");

  const level = Number(levelSelect.value || 1);
  const cap = capAtLevel(level);
  const stepCap = maxThisStep(level);
  const points = pointsAtLevel(level);

  const attrs = readAttrValues();
  let total = 0;
  for (const k of ATTRS) {
    const v = clamp(Number(attrs[k]) || 0, 0, stepCap);
    attrs[k] = v;
    total += v;
  }
  if (total !== points) {
    showError("Attribute points must add up exactly before saving.");
    updateDerivedUI();
    return;
  }
  if (stepCap > cap) return showError("Internal error: step cap exceeded final cap.");

  saveBtn.disabled = true;
  saveAndOpenBtn.disabled = true;

  try {
    await ensureSheetMap();

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
      if (claims.gm && requestedUid) url.searchParams.set("uid", requestedUid);
      window.location.href = url.toString();
    }
  } catch (e) {
    console.error(e);
    showError("Could not save.");
  } finally {
    updateDerivedUI();
  }
}

async function uploadPortrait() {
  showError("");
  if (!pendingPortraitFile) return showError("Choose an image first.");
  if (!charRef) return;

  const file = pendingPortraitFile;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `portraits/${editingUid}/${charId}/${Date.now()}_${safeName}`;

  uploadPortraitBtn.disabled = true;

  try {
    const objRef = storageRef(storage, path);
    await uploadBytes(objRef, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(objRef);

    portraitPath = path;
    portraitUrl = url;
    setPortraitPreview(url);

    await ensureSheetMap();
    await updateDoc(charRef, {
      portraitPath,
      portraitUrl,
      "sheet.portrait": portraitUrl,
      updatedAt: serverTimestamp(),
    });

    setStatus("Portrait uploaded.");
  } catch (e) {
    console.error(e);
    showError("Could not upload portrait (permissions or network issue).");
  } finally {
    uploadPortraitBtn.disabled = false;
  }
}

async function clearPortrait() {
  showError("");

  try {
    if (portraitPath) {
      const objRef = storageRef(storage, portraitPath);
      await deleteObject(objRef).catch(() => {});
    }

    portraitPath = "";
    portraitUrl = "";
    setPortraitPreview("");
    portraitFile.value = "";
    pendingPortraitFile = null;

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

// ---- wire up ----
await initAuthRedirectHandling();

signOutBtn?.addEventListener("click", () => signOutNow());

levelSelect.addEventListener("change", updateDerivedUI);
document.querySelectorAll(".attrInput").forEach((input) => input.addEventListener("input", updateDerivedUI));

portraitFile.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  pendingPortraitFile = file || null;
  if (file) setPortraitPreview(URL.createObjectURL(file));
});

uploadPortraitBtn.addEventListener("click", () => uploadPortrait());
clearPortraitBtn.addEventListener("click", () => clearPortrait());

saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false }));
saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true }));

onAuth(async (user) => {
  currentUser = user;
  if (!user) return (window.location.href = "login.html");

  whoamiEl.textContent = user.email || user.displayName || "Signed in";
  signOutBtn.style.display = "inline-block";

  claims = await getClaims(user, { forceRefresh: true });

  if (requestedUid) {
    if (!claims.gm) return (window.location.href = "characters.html");
    editingUid = requestedUid;
    gmHint.style.display = "inline";
    gmHint.textContent = "GM View";
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
