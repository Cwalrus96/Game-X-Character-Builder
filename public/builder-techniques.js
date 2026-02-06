// public/builder-techniques.js
// Placeholder step for techniques.

import {
  initBuilderAuth,
  loadCharacterDoc,
  markStepVisited,
  setStatus,
  showError,
} from "./builder-common.js";

import { renderBuilderNav } from "./builder-nav.js";

const CURRENT_STEP_ID = "techniques";

let ctx;
let charRef;
let currentDoc;

const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const navTopEl = document.getElementById("builderNavTop");
const navBottomEl = document.getElementById("builderNavBottom");

async function main() {
  try {
    ctx = await initBuilderAuth({
      whoamiEl,
      signOutBtn,
      gmHintEl,
      statusEl,
      errorEl,
    });

    const loaded = await loadCharacterDoc(ctx.editingUid, ctx.charId);
    charRef = loaded.charRef;
    currentDoc = loaded.characterDoc;

    await markStepVisited(charRef, CURRENT_STEP_ID);

    const navArgs = {
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNext: async () => true,
    };
    renderBuilderNav({ ...navArgs, mountEl: navTopEl });
    renderBuilderNav({ ...navArgs, mountEl: navBottomEl });

    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading techniques step.");
    setStatus(statusEl, "Error.");
  }
}

main();
