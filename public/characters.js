import { db } from "./firebase.js";
import { onAuth, signOutNow, initAuthRedirectHandling, getClaims } from "./auth-ui.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  addDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const loginLink = document.getElementById("loginLink");

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
    const name = data.name || "(Unnamed character)";
    const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleString() : "";
    const owner = data.ownerUid || viewingUid;

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="row">
        <div>
          <div class="name">${escapeHtml(name)}</div>
          <div class="sub">Last updated: ${escapeHtml(updatedAt || "(unknown)")}</div>
        </div>
        <div class="right"></div>
      </div>
    `;

    const right = li.querySelector(".right");
    const a = document.createElement("a");
    a.className = "btn";
    a.textContent = "Continue";
    const url = new URL("builder.html", window.location.href);
    url.searchParams.set("charId", d.id);
    // Only set uid param when GM viewing another user (or if the character doc owner differs)
    if (!isViewingSelf && claims.gm) {
      url.searchParams.set("uid", viewingUid);
    } else if (claims.gm && owner && owner !== currentUser.uid) {
      url.searchParams.set("uid", owner);
    }
    a.href = url.toString();
    right.appendChild(a);

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
  const docRef = await addDoc(col, {
    ownerUid: viewingUid,
	// Name and portrait are selected in the Builder (step 1).
    name: "",
    portraitPath: "",
    // Make this a map (not null) so Builder can update nested fields safely.
    sheet: { fields: {} },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const url = new URL("builder.html", window.location.href);
  url.searchParams.set("charId", docRef.id);
  if (!isViewingSelf && claims.gm) url.searchParams.set("uid", viewingUid);
  window.location.href = url.toString();
}

await initAuthRedirectHandling();

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    await signOutNow();
  });
}

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
    setText(whoamiEl, "Signed out");
    hide(signOutBtn);
    show(loginLink);
    hide(profileCard);
    hide(charactersCard);
    window.location.href = "login.html";
    return;
  }

  hide(loginLink);
  show(signOutBtn);
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
    window.location.href = "characters.html";
    return;
  }

  setText(whoamiEl, user.email || user.displayName || "Signed in");

  // Only ensure/update profile doc for the signed-in user.
  await ensureOwnUserDoc(user);

  // Load the viewing user document (self, or GM-selected user).
  await loadViewingUserDoc();
  renderProfile();

  await startCharactersListener();
});
