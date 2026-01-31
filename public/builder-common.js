// public/builder-common.js
import { auth, db } from "./firebase.js";
import { onAuth, signOutNow, initAuthRedirectHandling, getClaims } from "./auth-ui.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { normalizeCharacterDoc, sanitizeUpdatePatch } from "./character-schema.js";

/**
 * Small shared utilities for Builder pages:
 * - auth bootstrap (including GM editing)
 * - load character doc
 * - write partial updates
 * - confirm modal helper
 * - visited step tracking
 */

/**
 * @returns {{ charId: string|null, requestedUid: string|null }}
 */
export function getBuilderUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    charId: params.get("charId"),
    requestedUid: params.get("uid"),
  };
}

/**
 * @param {string} href
 * @returns {string}
 */
export function makeLoginUrl(href) {
  const next = encodeURIComponent(href);
  return `login.html?next=${next}`;
}

/**
 * @param {string} path
 * @param {{ charId: string, requestedUid?: string|null }} ctx
 * @returns {string}
 */
export function buildBuilderUrl(path, ctx) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("charId", ctx.charId);
  if (ctx.requestedUid) url.searchParams.set("uid", ctx.requestedUid);
  return url.toString();
}

/**
 * @param {HTMLElement|null} el
 * @param {string} msg
 */
export function setStatus(el, msg) {
  if (!el) return;
  el.textContent = msg;
}

/**
 * @param {HTMLElement|null} el
 * @param {string} msg
 */
export function showError(el, msg) {
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
}

/**
 * @param {HTMLElement|null} el
 */
export function clearError(el) {
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
}

/**
 * Initialize auth + resolve which user doc we are editing (supports GM view).
 *
 * @param {{
 *   whoamiEl?: HTMLElement|null,
 *   signOutBtn?: HTMLButtonElement|null,
 *   gmHintEl?: HTMLElement|null,
 *   statusEl?: HTMLElement|null,
 *   errorEl?: HTMLElement|null,
 * }} ui
 * @returns {Promise<{
 *   user: any,
 *   claims: any,
 *   charId: string,
 *   requestedUid: string|null,
 *   editingUid: string,
 * }>}
 */
export async function initBuilderAuth(ui = {}) {
  const { whoamiEl, signOutBtn, gmHintEl, statusEl, errorEl } = ui;

  setStatus(statusEl, "Loading…");
  clearError(errorEl);

  const { charId, requestedUid } = getBuilderUrlParams();
  if (!charId) {
    window.location.replace("characters.html");
    throw new Error("Missing charId");
  }

  // Handle redirect results early so auth state is clean.
  await initAuthRedirectHandling({
    onError: (e) => console.warn("Auth redirect handling error:", e),
  });

  const user = await new Promise((resolve) => {
    const unsub = onAuth((u) => {
      unsub();
      resolve(u);
    });
  });

  if (!user) {
    window.location.href = makeLoginUrl(window.location.href);
    throw new Error("Not signed in");
  }

  if (whoamiEl) {
    const name = user.displayName || "Signed in";
    const email = user.email ? ` (${user.email})` : "";
    whoamiEl.textContent = `${name}${email}`;
  }

  if (signOutBtn) {
    signOutBtn.style.display = "inline-block";
    signOutBtn.onclick = async () => {
      await signOutNow();
      window.location.href = "login.html";
    };
  }

  let claims = { gm: false };
  try {
    // Only force refresh if GM editing is requested, otherwise normal read is faster.
    claims = await getClaims(user, { forceRefresh: !!requestedUid });
  } catch (e) {
    console.warn("Could not read claims:", e);
  }

  let editingUid = user.uid;
  if (requestedUid) {
    if (!claims.gm) {
      window.location.href = "characters.html";
      throw new Error("GM uid requested but user is not GM");
    }
    editingUid = requestedUid;
    if (gmHintEl) {
      gmHintEl.style.display = "inline";
      gmHintEl.textContent = "GM View";
    }
  } else {
    if (gmHintEl) gmHintEl.style.display = "none";
  }

  return { user, claims, charId, requestedUid, editingUid };
}

/**
 * Load character doc (throws if missing).
 * @param {string} editingUid
 * @param {string} charId
 * @returns {Promise<{ charRef: any, characterDoc: any }>}
 */
export async function loadCharacterDoc(editingUid, charId) {
  const charRef = doc(db, "users", editingUid, "characters", charId);
  const snap = await getDoc(charRef);
  if (!snap.exists()) throw new Error("Character not found.");
  // Normalize so all builder pages see a consistent shape.
  return { charRef, characterDoc: normalizeCharacterDoc(snap.data() || {}) };
}

/**
 * Save partial update to character.
 * Adds a server-side timestamp on `updatedAt` for convenience.
 *
 * @param {any} charRef
 * @param {Record<string, any>} patch
 */
export async function saveCharacterPatch(charRef, patch) {
  const cleaned = sanitizeUpdatePatch(patch || {});
  await updateDoc(charRef, { ...cleaned, updatedAt: serverTimestamp() });
}

/**
 * Ensure a reusable confirm modal exists on the page.
 * If the page doesn't provide one, this will create it dynamically.
 *
 * @returns {{
 *   overlay: HTMLElement,
 *   titleEl: HTMLElement,
 *   msgEl: HTMLElement,
 *   okBtn: HTMLButtonElement,
 *   cancelBtn: HTMLButtonElement,
 * }}
 */
export function ensureConfirmModal() {
  let overlay = document.getElementById("confirmModal");
  let titleEl = document.getElementById("confirmTitle");
  let msgEl = document.getElementById("confirmMsg");
  let okBtn = document.getElementById("confirmOkBtn");
  let cancelBtn = document.getElementById("confirmCancelBtn");

  if (overlay && titleEl && msgEl && okBtn && cancelBtn) {
    return { overlay, titleEl, msgEl, okBtn, cancelBtn };
  }

  overlay = document.createElement("div");
  overlay.id = "confirmModal";
  overlay.className = "modalOverlay";
  overlay.style.display = "none";

  const card = document.createElement("div");
  card.className = "modalCard";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  titleEl = document.createElement("h3");
  titleEl.id = "confirmTitle";
  titleEl.textContent = "Continue?";

  msgEl = document.createElement("p");
  msgEl.id = "confirmMsg";
  msgEl.className = "muted";

  const actions = document.createElement("div");
  actions.className = "modalActions";

  cancelBtn = document.createElement("button");
  cancelBtn.id = "confirmCancelBtn";
  cancelBtn.className = "btn secondary";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  okBtn = document.createElement("button");
  okBtn.id = "confirmOkBtn";
  okBtn.className = "btn";
  okBtn.type = "button";
  okBtn.textContent = "OK";

  actions.append(cancelBtn, okBtn);
  card.append(titleEl, msgEl, actions);
  overlay.append(card);
  document.body.append(overlay);

  return { overlay, titleEl, msgEl, okBtn, cancelBtn };
}

/**
 * Show a confirm modal and resolve true/false.
 *
 * @param {{
 *   title: string,
 *   messageHtml: string,
 *   okText?: string,
 *   cancelText?: string,
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmModal(opts) {
  const { overlay, titleEl, msgEl, okBtn, cancelBtn } = ensureConfirmModal();

  titleEl.textContent = opts.title || "Continue?";
  msgEl.innerHTML = opts.messageHtml || "";
  okBtn.textContent = opts.okText || "OK";
  cancelBtn.textContent = opts.cancelText || "Cancel";

  overlay.style.display = "flex";
  okBtn.focus();

  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.style.display = "none";
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      window.removeEventListener("keydown", onKeyDown);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    okBtn.onclick = () => {
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };

    window.addEventListener("keydown", onKeyDown);
  });
}

/**
 * Mark a builder step as visited on the character doc.
 *
 * Stored under: builder.visitedSteps = ["basics", ...]
 *
 * @param {any} charRef
 * @param {string} stepId
 */
export async function markStepVisited(charRef, stepId) {
  try {
    await updateDoc(charRef, {
      "builder.visitedSteps": arrayUnion(stepId),
      "builder.lastVisitedAt": serverTimestamp(),
    });
  } catch (e) {
    // Non-fatal: visited is a convenience, not required for core use.
    console.warn("Could not mark step visited:", e);
  }
}
