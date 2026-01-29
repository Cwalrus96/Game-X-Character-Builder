import { onAuth } from "./auth-ui.js";
import { initAuthRedirectHandling, signInInteractive } from "./auth-ui.js";

const signInBtn = document.getElementById("signInBtn");
const continueLink = document.getElementById("continueLink");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

function getSafeNextHref() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return null;
  try {
    const url = new URL(next, window.location.origin);
    // Prevent open-redirects: only allow same-origin targets
    if (url.origin !== window.location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

await initAuthRedirectHandling({
  onError: (e) => showError(e?.code || "Sign-in error"),
});

if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    if (statusEl) statusEl.textContent = "Signing in…";
    await signInInteractive({
      onError: (e) => showError(e?.code || "Sign-in error"),
    });
  });
}

onAuth((user) => {
  if (!statusEl) return;
  if (!user) {
    statusEl.textContent = "Signed out";
    if (continueLink) continueLink.style.display = "none";
    return;
  }
  statusEl.textContent = `Signed in as ${user.email || user.displayName || "(unknown)"}`;
  const nextHref = getSafeNextHref();
  if (continueLink) {
    continueLink.href = nextHref || "characters.html";
    continueLink.style.display = "inline-block";
  }
  // Keep this simple: auto-redirect after a moment.
  setTimeout(() => {
    window.location.href = nextHref || "characters.html";
  }, 250);
});
