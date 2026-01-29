import { db } from "./firebase.js";
import { onAuth, signOutNow, initAuthRedirectHandling, getClaims } from "./auth-ui.js";

import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const userRowsEl = document.getElementById("userRows");
const signOutBtn = document.getElementById("signOutBtn");

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = msg ? "block" : "none";
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function clearRows() {
  if (userRowsEl) userRowsEl.innerHTML = "";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadUsers() {
  clearRows();
  showError("");
  setStatus("Loading…");

  const snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

  // Sort locally for stability (avoid needing indexes / dealing with missing fields)
  users.sort((a, b) => {
    const an = (a.displayName || a.email || a.uid || "").toLowerCase();
    const bn = (b.displayName || b.email || b.uid || "").toLowerCase();
    return an.localeCompare(bn);
  });

  if (!users.length) {
    setStatus("No users found (users appear here after they log in at least once).");
    return;
  }

  setStatus("");

  users.forEach((u) => {
    const tr = document.createElement("tr");
    const displayName = u.displayName || "";
    const email = u.email || "";
    const uid = u.uid || u.id;

    tr.innerHTML = `
      <td>${esc(displayName)}</td>
      <td>${esc(email)}</td>
      <td class="small">${esc(uid)}</td>
      <td></td>
    `;

    const td = tr.querySelector("td:last-child");
    const a = document.createElement("a");
    a.className = "btn";
    a.textContent = "View Characters";
    a.href = `characters.html?uid=${encodeURIComponent(uid)}`;
    td.appendChild(a);

    userRowsEl.appendChild(tr);
  });
}

await initAuthRedirectHandling();

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    await signOutNow();
  });
}

onAuth(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const claims = await getClaims(user, { forceRefresh: true });
  if (!claims.gm) {
    window.location.href = "characters.html";
    return;
  }

  try {
    await loadUsers();
  } catch (e) {
    console.error(e);
    showError("Could not load users (permission denied or network error)." );
    setStatus("");
  }
});
