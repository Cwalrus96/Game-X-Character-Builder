import { db, storage } from "../core/firebase.js";
import { onAuth, signOutNow, initAuthRedirectHandling, getClaims } from "../core/auth-ui.js";
import { ensureAppTopNav } from "../core/app-nav.js";
import { createDefaultCharacterDoc } from "../core/database-reader.js";
import { sanitizeStoragePath } from "../core/data-sanitization.js";
import { loadGameXData } from "../core/game-data.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  addDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  ref as storageRef,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

const topbarEl = document.querySelector(".topbar");
let appNav = ensureAppTopNav({
  mount: topbarEl,
  active: window.location.hash === "#profileCard" ? "profile" : "characters",
  onSignOut: async () => signOutNow(),
});

const profileCard = document.getElementById("profileCard");
const profileHint = document.getElementById("profileHint");
const profileError = document.getElementById("profileError");
const displayNameSetup = document.getElementById("displayNameSetup");
const displayNameInput = document.getElementById("displayNameInput");
const saveDisplayNameBtn = document.getElementById("saveDisplayNameBtn");
const profileView = document.getElementById("profileView");
const displayNameLabel = document.getElementById("displayNameLabel");
const emailLabel = document.getElementById("emailLabel");
const gmPill = document.getElementById("gmPill");
const gmUsersLink = document.getElementById("gmUsersLink");

const charactersCard = document.getElementById("charactersCard");
const charactersSub = document.getElementById("charactersSub");
const charactersStatus = document.getElementById("charactersStatus");
const charactersList = document.getElementById("charactersList");
const charactersError = document.getElementById("charactersError");
const createCharacterBtn = document.getElementById("createCharacterBtn");

let currentUser = null;
let claims = { gm: false };
let viewingUid = null;
let viewingUserDoc = null;
let unsubscribeCharacters = null;
const portraitUrlCache = new Map();
let classNameByKey = new Map();
let originNameByKey = new Map();

function qsParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function setText(el, txt) {
  if (el) el.textContent = txt;
}

function show(el) {
  if (el) el.style.display = "";
}

function hide(el) {
  if (el) el.style.display = "none";
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureOwnUserDoc(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  const base = {
    uid: user.uid,
    email: user.email || "",
    photoURL: user.photoURL || "",
    lastLoginAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(userRef, {
      ...base,
      displayName: "",
      createdAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(userRef, base, { merge: true });
}

async function loadViewingUserDoc() {
  const ref = doc(db, "users", viewingUid);
  const snap = await getDoc(ref);
  viewingUserDoc = snap.exists() ? (snap.data() || {}) : null;
}

function renderProfile() {
  if (!currentUser) return;

  show(profileCard);
  show(profileView);
  hide(displayNameSetup);
  showError(profileError, "");

  const isViewingSelf = viewingUid === currentUser.uid;
  const viewingName = viewingUserDoc?.displayName || "";
  const email = isViewingSelf ? (currentUser.email || "") : (viewingUserDoc?.email || "");

  if (claims.gm) {
    show(gmPill);
    if (isViewingSelf) show(gmUsersLink);
    else hide(gmUsersLink);
  } else {
    hide(gmPill);
    hide(gmUsersLink);
  }

  if (isViewingSelf && !viewingName) {
    // Username prompt
    hide(profileView);
    show(displayNameSetup);
    if (createCharacterBtn) {
      createCharacterBtn.disabled = true;
      createCharacterBtn.style.opacity = "0.6";
      createCharacterBtn.style.cursor = "not-allowed";
    }
    setText(profileHint, "Before you begin, choose the name other players will see in campaigns.");
    if (displayNameInput) displayNameInput.value = "";
    return;
  }

  if (createCharacterBtn) {
    createCharacterBtn.disabled = false;
    createCharacterBtn.style.opacity = "1";
    createCharacterBtn.style.cursor = "pointer";
  }

  setText(profileHint, isViewingSelf ? "" : "GM View: You are browsing another user's account.");
  setText(displayNameLabel, viewingName || (isViewingSelf ? "(No display name yet)" : "(Unknown)"));
  setText(emailLabel, email);
}

async function saveDisplayName() {
  if (!currentUser) return;
  const raw = (displayNameInput?.value || "").trim();
  const cleaned = raw.replace(/\s+/g, " ");
  if (cleaned.length < 2) {
    showError(profileError, "Display name must be at least 2 characters.");
    return;
  }
  if (cleaned.length > 32) {
    showError(profileError, "Display name must be 32 characters or less.");
    return;
  }

  const ref = doc(db, "users", currentUser.uid);
  await setDoc(ref, { displayName: cleaned, updatedAt: serverTimestamp() }, { merge: true });
  await loadViewingUserDoc();
  renderProfile();
}

function clearCharacterList() {
  if (charactersList) charactersList.innerHTML = "";
}

function buildCharacterUrl(page, { charId, ownerUid, isViewingSelf }) {
  const url = new URL(page, window.location.href);
  url.searchParams.set("charId", charId);

  // Only set uid param when GM viewing another user (or if the character doc owner differs)
  if (!isViewingSelf && claims.gm) {
    url.searchParams.set("uid", viewingUid);
  } else if (claims.gm && ownerUid && ownerUid !== currentUser.uid) {
    url.searchParams.set("uid", ownerUid);
  }

  return url.toString();
}

function humanizeKey(key) {
  return String(key || "")
    .trim()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadCharacterMetadataLookups() {
  try {
    const data = await loadGameXData({ cache: "no-store" });
    classNameByKey = new Map(
      (Array.isArray(data?.classes) ? data.classes : [])
        .map((cls) => [String(cls?.classKey || ""), String(cls?.name || cls?.classKey || "")])
        .filter(([key]) => key)
    );
    originNameByKey = new Map(
      (Array.isArray(data?.origins) ? data.origins : [])
        .map((origin) => [String(origin?.originKey || ""), String(origin?.name || origin?.originKey || "")])
        .filter(([key]) => key)
    );
  } catch (e) {
    console.warn("Could not load class/origin names for character list:", e);
    classNameByKey = new Map();
    originNameByKey = new Map();
  }
}

function buildCharacterMetaParts(builder = {}) {
  const parts = [];

  const level = Number.parseInt(String(builder?.level ?? ""), 10);
  if (Number.isFinite(level) && level > 0) parts.push(`Level ${level}`);

  const classKey = String(builder?.classKey || "").trim();
  if (classKey) parts.push(classNameByKey.get(classKey) || humanizeKey(classKey));

  const originKey = String(builder?.originKey || "").trim();
  if (originKey) parts.push(originNameByKey.get(originKey) || humanizeKey(originKey));

  return parts;
}

async function resolvePortraitUrl(path) {
  const cleanPath = sanitizeStoragePath(path || "");
  if (!cleanPath) return "";
  if (portraitUrlCache.has(cleanPath)) return portraitUrlCache.get(cleanPath);

  try {
    const url = await getDownloadURL(storageRef(storage, cleanPath));
    portraitUrlCache.set(cleanPath, url);
    return url;
  } catch (e) {
    console.warn("Could not load character portrait thumbnail:", e);
    portraitUrlCache.set(cleanPath, "");
    return "";
  }
}

async function applyPortraitThumbnail(img, placeholder, path) {
  const url = await resolvePortraitUrl(path);
  if (!img || !placeholder) return;
  if (!url) {
    img.hidden = true;
    placeholder.hidden = false;
    return;
  }
  img.src = url;
  img.hidden = false;
  placeholder.hidden = true;
}

async function deleteCharacter({ charId, name, portraitPath }) {
  if (!currentUser || !viewingUid || !charId) return;

  const displayName = String(name || "").trim() || "(Unnamed character)";
  const required = String(name || "").trim() || "DELETE";
  const typed = window.prompt(
    `Delete ${displayName}?\n\nThis cannot be undone. Type ${required} to confirm.`
  );
  if (typed !== required) return;

  const characterRef = doc(db, "users", viewingUid, "characters", charId);
  await deleteDoc(characterRef);

  const cleanPortraitPath = sanitizeStoragePath(portraitPath || "");
  if (cleanPortraitPath) {
    try {
      await deleteObject(storageRef(storage, cleanPortraitPath));
      portraitUrlCache.delete(cleanPortraitPath);
    } catch (e) {
      console.warn("Character deleted, but portrait cleanup failed:", e);
    }
  }
}

function renderCharacters(docs) {
  clearCharacterList();
  hide(charactersError);
  if (!docs.length) {
    setText(charactersStatus, "No characters yet.");
    return;
  }

  hide(charactersStatus);

  const isViewingSelf = viewingUid === currentUser.uid;
  docs.forEach((d) => {
    const data = d.data() || {};
    const builder = data?.builder || {};
    const name = builder?.name || "(Unnamed character)";
    const rawName = builder?.name || "";
    const portraitPath = sanitizeStoragePath(builder?.portraitPath || "");
    const metaParts = buildCharacterMetaParts(builder);
    const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleString() : "";
    const owner = data.ownerUid || viewingUid;

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="character-row">
        <div class="character-thumb" aria-hidden="true">
          <img alt="" hidden />
          <span>${escapeHtml((rawName || "?").trim().charAt(0).toUpperCase() || "?")}</span>
        </div>
        <div class="character-meta">
          <div class="name">${escapeHtml(name)}</div>
          ${metaParts.length ? `<div class="character-facts">${metaParts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")}</div>` : ""}
          <div class="sub">Last updated: ${escapeHtml(updatedAt || "(unknown)")}</div>
        </div>
        <div class="right"></div>
      </div>
    `;

    const right = li.querySelector(".right");
    const thumbImg = li.querySelector(".character-thumb img");
    const thumbFallback = li.querySelector(".character-thumb span");
    applyPortraitThumbnail(thumbImg, thumbFallback, portraitPath);

    const editLink = document.createElement("a");
    editLink.className = "btn";
    editLink.textContent = "Edit";
    editLink.href = buildCharacterUrl("/builder/builder-profile.html", {
      charId: d.id,
      ownerUid: owner,
      isViewingSelf,
    });
    right.appendChild(editLink);

    const viewLink = document.createElement("a");
    viewLink.className = "btn secondary";
    viewLink.textContent = "View";
    viewLink.href = buildCharacterUrl("/character-sheet.html", {
      charId: d.id,
      ownerUid: owner,
      isViewingSelf,
    });
    right.appendChild(viewLink);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.disabled = true;
      try {
        await deleteCharacter({ charId: d.id, name: rawName, portraitPath });
      } catch (e) {
        console.error(e);
        showError(charactersError, "Could not delete character.");
      } finally {
        deleteBtn.disabled = false;
      }
    });
    right.appendChild(deleteBtn);

    charactersList.appendChild(li);
  });
}

async function startCharactersListener() {
  if (unsubscribeCharacters) {
    unsubscribeCharacters();
    unsubscribeCharacters = null;
  }

  setText(charactersStatus, "Loading…");
  show(charactersStatus);
  clearCharacterList();

  const col = collection(db, "users", viewingUid, "characters");
  const q = query(col, orderBy("updatedAt", "desc"));

  unsubscribeCharacters = onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs || [];
      renderCharacters(docs);
      const isViewingSelf = viewingUid === currentUser.uid;
      setText(
        charactersSub,
        isViewingSelf
          ? "Select a character to continue editing, or create a new one."
          : "GM View: Select a character to open the sheet."
      );
    },
    (err) => {
      console.error(err);
      showError(charactersError, "Could not load characters (permission denied or network error).");
      setText(charactersStatus, "");
    }
  );
}

async function createCharacter() {
  if (!currentUser) return;
  const isViewingSelf = viewingUid === currentUser.uid;
  const canCreate = isViewingSelf || claims.gm;
  if (!canCreate) return;

  const col = collection(db, "users", viewingUid, "characters");
  const docData = createDefaultCharacterDoc({ ownerUid: viewingUid });
  docData.builder.name = "";
  docData.builder.portraitPath = "";
  docData.createdAt = serverTimestamp();
  docData.updatedAt = serverTimestamp();

  const docRef = await addDoc(col, docData);

  const url = new URL("/builder/builder-profile.html", window.location.href);
  url.searchParams.set("charId", docRef.id);
  if (!isViewingSelf && claims.gm) url.searchParams.set("uid", viewingUid);
  window.location.href = url.toString();
}

await initAuthRedirectHandling();

if (saveDisplayNameBtn) {
  saveDisplayNameBtn.addEventListener("click", () => {
    saveDisplayName().catch((e) => {
      console.error(e);
      showError(profileError, "Could not save display name.");
    });
  });
}

if (createCharacterBtn) {
  createCharacterBtn.addEventListener("click", () => {
    createCharacter().catch((e) => {
      console.error(e);
      showError(charactersError, "Could not create character.");
    });
  });
}

onAuth(async (user) => {
  currentUser = user;

  if (!user) {
    hide(profileCard);
    hide(charactersCard);
    window.location.href = "/login.html";
    return;
  }

  show(profileCard);
  show(charactersCard);

  // Force refresh once so newly-set GM claims show up immediately.
  claims = await getClaims(user, { forceRefresh: true });

  const requestedUid = qsParam("uid");
  if (requestedUid && claims.gm) {
    viewingUid = requestedUid;
  } else {
    viewingUid = user.uid;
  }

  // If a non-GM tries to pass uid=, ignore it.
  if (requestedUid && !claims.gm) {
    window.location.href = "/characters.html";
    return;
  }

  appNav = ensureAppTopNav({
    mount: topbarEl,
    active: window.location.hash === "#profileCard" ? "profile" : "characters",
    requestedUid,
    isGM: !!claims.gm,
    onSignOut: async () => signOutNow(),
  });
  show(appNav.signOut);

  // Only ensure/update profile doc for the signed-in user.
  await ensureOwnUserDoc(user);

  // Load the viewing user document (self, or GM-selected user).
  await loadViewingUserDoc();
  await loadCharacterMetadataLookups();
  renderProfile();

  await startCharactersListener();
});
