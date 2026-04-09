import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import { auth, googleProvider, isMobileLike } from "./firebase.js";

export async function initAuthRedirectHandling({ onError } = {}) {
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.error("getRedirectResult error:", e);
    if (typeof onError === "function") onError(e);
  }
}

export async function signInInteractive({ onError } = {}) {
  // Mobile: prefer redirect (popups often blocked/awkward on mobile)
  if (isMobileLike()) {
    await signInWithRedirect(auth, googleProvider);
    return;
  }

  // Desktop: prefer popup; fallback to redirect if popup blocked
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.warn("Popup failed, falling back to redirect:", e);
    if (typeof onError === "function") onError(e);
    await signInWithRedirect(auth, googleProvider);
  }
}

export async function signOutNow() {
  await signOut(auth);
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function getClaims(user, { forceRefresh = false } = {}) {
  if (!user) return { gm: false };
  if (forceRefresh) {
    // Force token refresh so new custom claims appear immediately.
    await user.getIdToken(true);
  }
  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult?.claims || {};
  return { ...claims, gm: !!claims.gm };
}
