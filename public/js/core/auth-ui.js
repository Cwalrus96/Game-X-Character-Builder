import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signInWithCustomToken,
  getRedirectResult,
  signOut,
} from "/vendor/firebase/firebase-auth.js";

import { auth, googleProvider, isMobileLike, usingFirebaseEmulators } from "./firebase.js";

const LOCAL_DEV_UID = "local-dev-user";

function base64UrlEncodeJson(value) {
  const json = JSON.stringify(value);
  return btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createLocalDevCustomToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "none",
    typ: "JWT",
  };
  const payload = {
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    iss: "local-dev@example.local",
    sub: "local-dev@example.local",
    uid: LOCAL_DEV_UID,
  };

  return `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}.`;
}

export async function initAuthRedirectHandling({ onError } = {}) {
  if (usingFirebaseEmulators) return;

  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.error("getRedirectResult error:", e);
    if (typeof onError === "function") onError(e);
  }
}

export async function signInInteractive({ onError } = {}) {
  if (usingFirebaseEmulators) {
    await signInWithCustomToken(auth, createLocalDevCustomToken());
    return;
  }

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
  return onAuthStateChanged(auth, (user) => {
    if (usingFirebaseEmulators && user && user.uid !== LOCAL_DEV_UID) {
      signInWithCustomToken(auth, createLocalDevCustomToken()).catch((error) => {
        console.error("Local emulator sign-in repair failed:", error);
        cb(user);
      });
      return;
    }

    cb(user);
  });
}

export async function getClaims(user, { forceRefresh = false } = {}) {
  if (!user) return { gm: false };
  if (usingFirebaseEmulators) return { gm: false, localDev: true };

  if (forceRefresh) {
    // Force token refresh so new custom claims appear immediately.
    await user.getIdToken(true);
  }
  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult?.claims || {};
  return { ...claims, gm: !!claims.gm };
}
