// public/builder-common.js
import { auth, db } from "../core/firebase.js";
import { onAuth, signOutNow, initAuthRedirectHandling, getClaims } from "../core/auth-ui.js";

import {
  doc,
  getDoc,
} from "/vendor/firebase/firebase-firestore.js";

import { normalizeCharacterDoc } from "../core/database-reader.js";
import { ensureAppTopNav } from "../core/app-nav.js";
import {
  createDialogLifecycle,
  restoreDialogFocus,
} from "../core/dialog-lifecycle.js";
import {
  createNavigationGuard,
  installNavigationGuard,
} from "../core/navigation-guard.js";
import {
  saveCharacterPatch as _saveCharacterPatch,
  markStepVisited as _markStepVisited,
} from "../core/database-writer.js";

/**
 * Small shared utilities for Builder pages:
 * - auth bootstrap (including GM editing)
 * - load character doc
 * - write partial updates
 * - confirm modal helper
 * - visited step tracking
 */

/**
 * Ensure common builder shell controls exist and use consistent labels/classes.
 * Existing pages can keep their markup; this helper normalizes it and gives
 * future pages a single place to get the shared chrome.
 */
export function ensureBuilderShellUi() {
  let topbar = document.querySelector(".topbar");
  if (!topbar) {
    topbar = document.createElement("div");
    topbar.className = "topbar";
    document.body.prepend(topbar);
  }

  const { signOut, charactersLink } = ensureAppTopNav({
    mount: topbar,
    active: "builder",
  });
  charactersLink.id = "builderCharactersLink";
  let gmHint = document.getElementById("gmHint");
  if (!gmHint) {
    gmHint = document.createElement("span");
    gmHint.id = "gmHint";
    gmHint.className = "muted app-gm-hint";
    gmHint.style.display = "none";
    topbar.after(gmHint);
  }

  return { topbar, charactersLink, gmHint, signOut };
}

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
  return `/login.html?next=${next}`;
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
 * @param {{ charId: string, requestedUid?: string|null, claims?: any }} ctx
 */
export function openCharacterSheet(ctx) {
  const url = new URL("/character-sheet.html", window.location.href);
  url.searchParams.set("charId", ctx.charId);
  if (ctx.claims?.gm && ctx.requestedUid) url.searchParams.set("uid", ctx.requestedUid);
  window.location.href = url.toString();
}

let activeBuilderNavigationGuard = null;
let activeBuilderNavigationGuardBinding = null;

export function installBuilderNavigationGuard({ flush } = {}) {
  if (typeof flush !== "function") return null;

  activeBuilderNavigationGuardBinding?.dispose?.();
  activeBuilderNavigationGuard = createNavigationGuard({
    flush,
    navigate: (href) => window.location.assign(href),
  });
  activeBuilderNavigationGuardBinding = installNavigationGuard({
    guard: activeBuilderNavigationGuard,
    dirtyRoot: document.querySelector("[data-builder-step]"),
    trackDirty: true,
  });
  activeBuilderNavigationGuard.markClean();
  return activeBuilderNavigationGuard;
}

export async function flushBuilderNavigationGuard() {
  if (!activeBuilderNavigationGuard) return true;
  return await activeBuilderNavigationGuard.flush();
}

export function markBuilderNavigationClean() {
  activeBuilderNavigationGuard?.markClean();
}

/**
 * @param {HTMLElement|null} el
 * @param {string} msg
 */
export function setStatus(el, msg) {
  if (!el) return;
  const value = String(msg || "").trim();
  el.textContent = value;
  el.style.display = value && value !== "Ready." ? "" : "none";
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
  const { signOutBtn, gmHintEl, statusEl, errorEl } = ui;

  setStatus(statusEl, "Loading…");
  clearError(errorEl);

  const { charId, requestedUid } = getBuilderUrlParams();
  if (!charId) {
    window.location.replace("/characters.html");
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

  let claims = { gm: false };
  try {
    // Only force refresh if GM editing is requested, otherwise normal read is faster.
    claims = await getClaims(user, { forceRefresh: !!requestedUid });
  } catch (e) {
    console.warn("Could not read claims:", e);
  }

  const nav = ensureAppTopNav({
    mount: document.querySelector(".topbar"),
    active: "builder",
    requestedUid,
    isGM: !!claims.gm,
  });
  if (nav.charactersLink) nav.charactersLink.id = "builderCharactersLink";
  const activeSignOutBtn = nav.signOut || signOutBtn;
  if (activeSignOutBtn) {
    activeSignOutBtn.style.display = "inline-flex";
    activeSignOutBtn.onclick = async () => {
      const canLeave = await flushBuilderNavigationGuard();
      if (!canLeave) return;
      await signOutNow();
      window.location.href = "/login.html";
    };
  }

  let editingUid = user.uid;
  if (requestedUid) {
    if (!claims.gm) {
      window.location.href = "/characters.html";
      throw new Error("GM uid requested but user is not GM");
    }
    editingUid = requestedUid;
    if (gmHintEl) {
      gmHintEl.style.display = "inline-flex";
      gmHintEl.textContent = "GM View";
    }
  } else {
    if (gmHintEl) gmHintEl.style.display = "none";
  }

  const charactersLink = document.getElementById("builderCharactersLink");
  if (charactersLink) {
    charactersLink.href = (requestedUid && claims.gm)
      ? `/characters.html?uid=${encodeURIComponent(requestedUid)}`
      : "/characters.html";
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
  return await _saveCharacterPatch(charRef, patch);
}

let confirmDialogElements = null;
let confirmDialogLifecycle = null;

/**
 * Ensure the one shared Builder confirmation dialog exists.
 * All control lookup is scoped to the dialog root.
 *
 * @returns {{
 *   dialog: HTMLDialogElement,
 *   titleEl: HTMLElement,
 *   msgEl: HTMLElement,
 *   okBtn: HTMLButtonElement,
 *   cancelBtn: HTMLButtonElement,
 * }}
 */
export function ensureConfirmModal() {
  if (confirmDialogElements?.dialog?.isConnected) return confirmDialogElements;

  document.getElementById("builderConfirmDialog")?.remove();
  document.getElementById("confirmOverlay")?.remove();
  document.getElementById("confirmModal")?.remove();

  const dialog = document.createElement("dialog");
  dialog.id = "builderConfirmDialog";
  dialog.className = "modalDialog";
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "builderConfirmDialogTitle");
  dialog.setAttribute("aria-describedby", "builderConfirmDialogMessage");

  const card = document.createElement("div");
  card.className = "modalCard";

  const titleEl = document.createElement("h3");
  titleEl.id = "builderConfirmDialogTitle";
  titleEl.dataset.dialogTitle = "true";
  titleEl.textContent = "Continue?";

  const msgEl = document.createElement("div");
  msgEl.id = "builderConfirmDialogMessage";
  msgEl.className = "muted";
  msgEl.dataset.dialogMessage = "true";

  const actions = document.createElement("div");
  actions.className = "modalActions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.dialogCancel = "true";

  const okBtn = document.createElement("button");
  okBtn.className = "btn";
  okBtn.type = "button";
  okBtn.textContent = "OK";
  okBtn.dataset.dialogAccept = "true";

  cancelBtn.addEventListener("click", () => {
    confirmDialogLifecycle?.settle(false, { reason: "cancel" });
  });
  okBtn.addEventListener("click", () => {
    confirmDialogLifecycle?.settle(true, { reason: "accept" });
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    confirmDialogLifecycle?.settle(false, { reason: "escape" });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      confirmDialogLifecycle?.settle(false, { reason: "backdrop" });
    }
  });

  actions.append(cancelBtn, okBtn);
  card.append(titleEl, msgEl, actions);
  dialog.append(card);
  document.body.append(dialog);

  confirmDialogElements = { dialog, titleEl, msgEl, okBtn, cancelBtn };
  return confirmDialogElements;
}

function renderConfirmDialogMessage(msgEl, { message = "", messages = [] } = {}) {
  msgEl.replaceChildren();

  const text = String(message || "").trim();
  if (text) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    msgEl.append(paragraph);
  }

  const items = Array.isArray(messages)
    ? messages.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (items.length) {
    const list = document.createElement("ul");
    for (const item of items) {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.append(listItem);
    }
    msgEl.append(list);
  }

  msgEl.hidden = !text && !items.length;
}

function getConfirmDialogLifecycle() {
  if (confirmDialogLifecycle) return confirmDialogLifecycle;

  confirmDialogLifecycle = createDialogLifecycle({
    onOpen: (context) => {
      const { dialog, titleEl, msgEl, okBtn, cancelBtn } = ensureConfirmModal();
      const options = context?.options || {};
      titleEl.textContent = options.title || "Continue?";
      renderConfirmDialogMessage(msgEl, options);
      okBtn.textContent = options.okText || "OK";
      cancelBtn.textContent = options.cancelText || "Cancel";

      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      queueMicrotask(() => cancelBtn.focus());
    },
    onClose: (context, { reason } = {}) => {
      const { dialog } = ensureConfirmModal();
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");

      restoreDialogFocus(context?.opener, { reason });
    },
  });
  return confirmDialogLifecycle;
}

/**
 * Show the shared confirmation dialog and resolve true/false.
 * A newer request cancels any active request before it opens.
 *
 * @param {{
 *   title?: string,
 *   message?: string,
 *   messages?: string[],
 *   okText?: string,
 *   cancelText?: string,
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmModal(opts = {}) {
  const opener = document.activeElement && document.activeElement !== document.body
    ? document.activeElement
    : null;
  return getConfirmDialogLifecycle().request({
    opener,
    options: opts,
  });
}

/**
 * Standard "warnings" prompt used by Builder pages.
 * - Missing/unfinished data should warn but allow saving.
 * - Caller chooses OK text (e.g., "Save and Continue" when navigating).
 *
 * @param {{
 *   title: string,
 *   warnings: string[],
 *   okText?: string,
 *   cancelText?: string,
 * }} args
 * @returns {Promise<boolean>}
 */
export async function confirmSaveWarnings(args) {
  const title = args.title || "Save anyway?";
  const warnings = Array.isArray(args.warnings) ? args.warnings.filter(Boolean) : [];
  if (!warnings.length) return true;

  return await confirmModal({
    title,
    messages: warnings.map((warning) => String(warning)),
    okText: args.okText || "Save and Continue",
    cancelText: args.cancelText || "Cancel",
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
  return await _markStepVisited(charRef, stepId);
}
