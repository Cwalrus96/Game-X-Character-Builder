import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  setStatus,
  showError,
  clearError,
  markStepVisited,
  confirmModal,
} from "./builder-common.js";
import { renderBuilderNav } from "./builder-nav.js";

import {
  clampLevel,
  ATTR_KEYS,
  ATTR_LABELS,
  attrKeyFromLabel,
  buildClassUpdatePatch,
  buildFeatId,
} from "./character-schema.js";

// ---- Page identity ----
const CURRENT_STEP_ID =
  document.querySelector("[data-builder-step]")?.getAttribute("data-builder-step") || "class";

// ---- Common shell UI ----
const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// ---- Nav mount ----
const navMount = document.getElementById("builderNav");

// ---- UI ----
const classSearch = document.getElementById("classSearch");
const classListEl = document.getElementById("classList");
const classDetailsEl = document.getElementById("classDetails");
const classDisabledBanner = document.getElementById("classDisabledBanner");
const primaryAttrChoicesEl = document.getElementById("primaryAttrChoices");

const classFeaturesEl = document.getElementById("classFeatures");
const classFeatsEl = document.getElementById("classFeats");
const classTechniquesEl = document.getElementById("classTechniques");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

// ---- State ----
let ctx = null;
let charRef = null;
let currentDoc = null;

let gameData = null;

let selectedClassKey = "";
let selectedPrimaryAttr = ""; // attr key
let classFeatureChoices = {}; // { [groupId]: string[] }
let selectedFeatIds = []; // string[]

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function optionGroupId(g) {
  return `cfg:${g.classKey}:${g.level}:${slug(g.name)}`;
}

function isClassSelectable(cls, classFeaturesByKey) {
  // Minimal required fields to consider the class "selectable" right now.
  // (Shown but disabled if any are missing.)
  if (!cls) return false;
  if (!cls.classKey || !cls.name) return false;
  if (!cls.hpProgression) return false;
  if (!cls.primaryAttributeA || !cls.primaryAttributeB) return false;
  if (!cls.combatTechniqueSkill) return false;

  // Must have at least some class feature data (otherwise the step can't be completed).
  const f = classFeaturesByKey?.[cls.classKey];
  if (!Array.isArray(f) || !f.length) return false;

  return true;
}

async function loadGameData() {
  const res = await fetch("data/game-x/game-x-data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load game data.");
  return await res.json();
}

function getLevel() {
  const lvl = clampLevel(currentDoc?.builder?.level || 1);
  return lvl;
}

function getClassByKey(key) {
  return (gameData?.classes || []).find((c) => c.classKey === key) || null;
}

function getClassFeaturesForClass(classKey) {
  const f = gameData?.classFeatures?.[classKey];
  return Array.isArray(f) ? f : [];
}

function getFeatsForClass(classKey, level) {
  const all = Array.isArray(gameData?.feats) ? gameData.feats : [];
  return all
    .filter((f) => String(f.featType || "").toUpperCase() === "CLASS")
    .filter((f) => String(f.classKey || "") === String(classKey || ""))
    .filter((f) => Number(f.minLevel || 0) <= level)
    .sort((a, b) => Number(a.minLevel || 0) - Number(b.minLevel || 0) || String(a.name).localeCompare(String(b.name)));
}

function getTechniquesForClass(cls) {
  const all = Array.isArray(gameData?.techniques) ? gameData.techniques : [];
  if (!cls) return [];

  const key = String(cls.classKey || "");
  const skill = String(cls.combatTechniqueSkill || "");

  const out = all.filter((t) => {
    const src = String(t.sourceNote || "").toLowerCase();
    const tSkill = String(t.skill || "");
    return (src && src.includes(key)) || (skill && tSkill === skill);
  });

  // Avoid duplicates by techniqueName
  const seen = new Set();
  return out.filter((t) => {
    const name = String(t.techniqueName || "");
    if (!name) return false;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function renderClassList() {
  if (!classListEl) return;
  const q = String(classSearch?.value || "").toLowerCase().trim();

  const classFeaturesByKey = gameData?.classFeatures || {};
  const list = (gameData?.classes || [])
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .filter((c) => {
      if (!q) return true;
      const hay = `${c.name || ""} ${c.classKey || ""} ${c.pitch || ""} ${c.examples || ""}`.toLowerCase();
      return hay.includes(q);
    });

  classListEl.innerHTML = "";
  list.forEach((cls) => {
    const selectable = isClassSelectable(cls, classFeaturesByKey);
    const isSelected = cls.classKey === selectedClassKey;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "classCard" + (isSelected ? " selected" : "") + (!selectable ? " disabled" : "");
    btn.disabled = false; // clickable to view details even if disabled
    btn.setAttribute("data-class-key", cls.classKey);

    const title = document.createElement("div");
    title.className = "classCardTitle";
    title.textContent = cls.name || cls.classKey;

    const sub = document.createElement("div");
    sub.className = "classCardSub";
    sub.textContent = selectable ? (cls.pitch || "") : "Unavailable (missing data)";

    btn.append(title, sub);

    btn.addEventListener("click", () => {
      selectClass(cls.classKey);
    });

    classListEl.append(btn);
  });
}

function renderClassDetails(cls) {
  if (!classDetailsEl) return;
  if (!cls) {
    classDetailsEl.className = "classDetails muted";
    classDetailsEl.textContent = "Select a class to see details.";
    return;
  }

  const parts = [];
  parts.push(`<div class="classDetailsTitle">${cls.name || cls.classKey}</div>`);
  if (cls.pitch) parts.push(`<div class="muted" style="margin-top:6px;">${escapeHtml(cls.pitch)}</div>`);
  if (cls.examples) parts.push(`<div class="muted" style="margin-top:6px;"><strong>Examples:</strong> ${escapeHtml(cls.examples)}</div>`);
  parts.push(`<div style="margin-top:10px;" class="muted"><strong>HP:</strong> ${escapeHtml(cls.hpProgression || "—")}</div>`);
  parts.push(`<div class="muted"><strong>Combat Technique Skill:</strong> ${escapeHtml(cls.combatTechniqueSkill || "—")}</div>`);
  classDetailsEl.className = "classDetails";
  classDetailsEl.innerHTML = parts.join("");
}

function renderPrimaryAttrChoices(cls) {
  if (!primaryAttrChoicesEl) return;
  primaryAttrChoicesEl.innerHTML = "";

  if (!cls) return;

  const selectable = isClassSelectable(cls, gameData?.classFeatures || {});
  const a = attrKeyFromLabel(cls.primaryAttributeA);
  const b = attrKeyFromLabel(cls.primaryAttributeB);

  const options = [a, b].filter(Boolean);

  options.forEach((k) => {
    const label = document.createElement("label");
    label.className = "choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "primaryAttr";
    input.value = k;
    input.checked = selectedPrimaryAttr === k;
    input.disabled = !selectable;

    input.addEventListener("change", () => {
      selectedPrimaryAttr = k;
      clearError(errorEl);
    });

    const span = document.createElement("span");
    span.textContent = ATTR_LABELS[k] || k;

    label.append(input, span);
    primaryAttrChoicesEl.append(label);
  });

  // If the saved primary attribute doesn't match A/B, show a hint.
  if (!options.includes(selectedPrimaryAttr)) {
    selectedPrimaryAttr = "";
  }
}

function renderClassFeatures(cls) {
  if (!classFeaturesEl) return;
  classFeaturesEl.innerHTML = "";

  if (!cls) {
    classFeaturesEl.className = "muted";
    classFeaturesEl.textContent = "Select a class to see features.";
    return;
  }

  classFeaturesEl.className = "";

  const level = getLevel();
  const all = getClassFeaturesForClass(cls.classKey)
    .filter((f) => Number(f.level || 0) <= level);

  if (!all.length) {
    classFeaturesEl.className = "muted";
    classFeaturesEl.textContent = "No class features are available for this class yet.";
    return;
  }

  const byLevel = new Map();
  for (const f of all) {
    const lvl = Number(f.level || 0);
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(f);
  }

  [...byLevel.keys()].sort((a, b) => a - b).forEach((lvl) => {
    const h = document.createElement("div");
    h.className = "featureLevelHeader";
    h.textContent = `Level ${lvl}`;
    classFeaturesEl.append(h);

    const list = document.createElement("div");
    list.className = "featureList";

    const items = byLevel.get(lvl) || [];
    items.forEach((f) => {
      const card = document.createElement("div");
      card.className = "featureCard";

      const name = document.createElement("div");
      name.className = "featureName";
      name.textContent = f.name || "(unnamed)";

      card.append(name);

      if (f.description) {
        const desc = document.createElement("div");
        desc.className = "muted";
        desc.style.marginTop = "6px";
        desc.textContent = f.description;
        card.append(desc);
      }

      if (String(f.type) === "optionGroup") {
        const gid = optionGroupId(f);
        const chooseCount = Number(f.chooseCount || 1);

        const chooseLine = document.createElement("div");
        chooseLine.className = "muted";
        chooseLine.style.marginTop = "8px";
        chooseLine.innerHTML = `<strong>Choose ${chooseCount}</strong>`;
        card.append(chooseLine);

        const options = Array.isArray(f.options) ? f.options : [];
        const current = Array.isArray(classFeatureChoices[gid]) ? classFeatureChoices[gid] : [];

        const optWrap = document.createElement("div");
        optWrap.className = "optionGrid";

        options.forEach((opt) => {
          const optName = String(opt?.name || "");
          const label = document.createElement("label");
          label.className = "choice";

          const input = document.createElement("input");
          input.type = chooseCount === 1 ? "radio" : "checkbox";
          input.name = gid;
          input.value = optName;
          input.checked = current.includes(optName);
          input.disabled = !isClassSelectable(cls, gameData?.classFeatures || {});

          input.addEventListener("change", () => {
            const next = new Set(Array.isArray(classFeatureChoices[gid]) ? classFeatureChoices[gid] : []);
            if (chooseCount === 1) {
              next.clear();
              if (input.checked) next.add(optName);
            } else {
              if (input.checked) next.add(optName);
              else next.delete(optName);
            }

            // Enforce chooseCount (for checkbox groups)
            if (chooseCount > 1 && next.size > chooseCount) {
              // revert
              input.checked = false;
              return;
            }

            classFeatureChoices[gid] = [...next];
            clearError(errorEl);
          });

          const span = document.createElement("span");
          span.textContent = optName;

          label.append(input, span);
          optWrap.append(label);

          if (opt.description) {
            const small = document.createElement("div");
            small.className = "muted";
            small.style.margin = "2px 0 10px 24px";
            small.textContent = opt.description;
            optWrap.append(small);
          }
        });

        card.append(optWrap);
      }

      list.append(card);
    });

    classFeaturesEl.append(list);
  });
}

function renderFeats(cls) {
  if (!classFeatsEl) return;
  classFeatsEl.innerHTML = "";

  if (!cls) {
    classFeatsEl.className = "muted";
    classFeatsEl.textContent = "Select a class to see feats.";
    return;
  }

  classFeatsEl.className = "";

  const level = getLevel();
  const feats = getFeatsForClass(cls.classKey, level);

  if (!feats.length) {
    classFeatsEl.className = "muted";
    classFeatsEl.textContent = "No feats available at your current level.";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "featureList";

  feats.forEach((f) => {
    const id = buildFeatId(f);
    const card = document.createElement("div");
    card.className = "featureCard";

    const top = document.createElement("div");
    top.className = "featureName";
    top.textContent = `${f.name || "(unnamed)"} (min level ${f.minLevel || "?"})`;

    card.append(top);

    if (f.description) {
      const desc = document.createElement("div");
      desc.className = "muted";
      desc.style.marginTop = "6px";
      desc.textContent = f.description;
      card.append(desc);
    }

    const label = document.createElement("label");
    label.className = "choice";
    label.style.marginTop = "10px";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selectedFeatIds.includes(id);
    input.disabled = !isClassSelectable(cls, gameData?.classFeatures || {});

    input.addEventListener("change", () => {
      const set = new Set(selectedFeatIds);
      if (input.checked) set.add(id);
      else set.delete(id);
      selectedFeatIds = [...set];
      clearError(errorEl);
    });

    const span = document.createElement("span");
    span.textContent = "Choose this feat";

    label.append(input, span);
    card.append(label);

    wrap.append(card);
  });

  classFeatsEl.append(wrap);

  const note = document.createElement("div");
  note.className = "muted";
  note.style.marginTop = "10px";
  note.textContent = "Note: feat slot counts are not enforced yet; this step stores your selections for future validation.";
  classFeatsEl.append(note);
}

function renderTechniques(cls) {
  if (!classTechniquesEl) return;
  classTechniquesEl.innerHTML = "";

  if (!cls) {
    classTechniquesEl.className = "muted";
    classTechniquesEl.textContent = "Select a class to see techniques.";
    return;
  }

  classTechniquesEl.className = "";

  const techniques = getTechniquesForClass(cls);
  if (!techniques.length) {
    classTechniquesEl.className = "muted";
    classTechniquesEl.textContent = "No techniques were matched for this class yet.";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "featureList";

  techniques.forEach((t) => {
    const card = document.createElement("div");
    card.className = "featureCard";

    const name = document.createElement("div");
    name.className = "featureName";
    name.textContent = t.techniqueName || "(unnamed)";

    card.append(name);

    const meta = [];
    if (t.actionType) meta.push(String(t.actionType));
    if (t.actions != null) meta.push(`${t.actions} action${Number(t.actions) === 1 ? "" : "s"}`);
    if (t.rank != null) meta.push(`Rank ${t.rank}`);
    if (t.skill) meta.push(String(t.skill));

    if (meta.length) {
      const m = document.createElement("div");
      m.className = "muted";
      m.style.marginTop = "6px";
      m.textContent = meta.join(" • ");
      card.append(m);
    }

    if (t.onSuccess || t.description) {
      const d = document.createElement("div");
      d.className = "muted";
      d.style.marginTop = "6px";
      d.textContent = t.description || t.onSuccess || "";
      card.append(d);
    }

    wrap.append(card);
  });

  classTechniquesEl.append(wrap);

  const note = document.createElement("div");
  note.className = "muted";
  note.style.marginTop = "10px";
  note.textContent = "Techniques will likely get their own step later; this list is informational for now.";
  classTechniquesEl.append(note);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectClass(classKey) {
  selectedClassKey = String(classKey || "");
  const cls = getClassByKey(selectedClassKey);

  // Reset primary attr if it doesn't match the class's options
  const a = attrKeyFromLabel(cls?.primaryAttributeA);
  const b = attrKeyFromLabel(cls?.primaryAttributeB);
  if (selectedPrimaryAttr && selectedPrimaryAttr !== a && selectedPrimaryAttr !== b) {
    selectedPrimaryAttr = "";
  }

  // Prune feature choices to this class only
  const keep = {};
  const features = getClassFeaturesForClass(selectedClassKey);
  for (const f of features) {
    if (String(f.type) !== "optionGroup") continue;
    const gid = optionGroupId(f);
    if (classFeatureChoices[gid]) keep[gid] = classFeatureChoices[gid];
  }
  classFeatureChoices = keep;

  // Prune feats
  const validFeats = new Set(getFeatsForClass(selectedClassKey, getLevel()).map(buildFeatId));
  selectedFeatIds = selectedFeatIds.filter((id) => validFeats.has(id));

  // Banner
  const selectable = isClassSelectable(cls, gameData?.classFeatures || {});
  if (classDisabledBanner) classDisabledBanner.style.display = selectable ? "none" : "block";

  renderClassList();
  renderClassDetails(cls);
  renderPrimaryAttrChoices(cls);
  renderClassFeatures(cls);
  renderFeats(cls);
  renderTechniques(cls);
}

function validateForNext() {
  const cls = getClassByKey(selectedClassKey);
  if (!cls) return ["Choose a class."];
  const selectable = isClassSelectable(cls, gameData?.classFeatures || {});
  if (!selectable) return ["This class is not selectable yet (missing required data)."];
  const a = attrKeyFromLabel(cls.primaryAttributeA);
  const b = attrKeyFromLabel(cls.primaryAttributeB);
  if (!selectedPrimaryAttr || (selectedPrimaryAttr !== a && selectedPrimaryAttr !== b)) {
    return ["Choose a Primary Attribute."];
  }

  const level = getLevel();
  const requiredGroups = getClassFeaturesForClass(cls.classKey)
    .filter((f) => String(f.type) === "optionGroup")
    .filter((f) => Number(f.level || 0) <= level);

  const problems = [];
  for (const g of requiredGroups) {
    const gid = optionGroupId(g);
    const chooseCount = Number(g.chooseCount || 1);
    const picked = Array.isArray(classFeatureChoices[gid]) ? classFeatureChoices[gid] : [];
    if (picked.length !== chooseCount) {
      problems.push(`Complete “${g.name}” (choose ${chooseCount}).`);
    }
  }
  return problems;
}

async function saveBuilder({ openSheetAfter = false, requireComplete = false } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const problems = validateForNext();
  if (problems.length && requireComplete) {
    showError(errorEl, problems.join(" "));
    setStatus(statusEl, "Not saved.");
    return false;
  }

  if (problems.length && !requireComplete) {
    const ok = await confirmModal({
      title: "Save anyway?",
      messageHtml: `<p class="muted">Some required selections are missing:</p><ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul>`,
      okText: "Save anyway",
      cancelText: "Cancel",
    });
    if (!ok) {
      setStatus(statusEl, "Not saved.");
      return false;
    }
  }

  try {
    const patch = buildClassUpdatePatch({
      classKey: selectedClassKey,
      primaryAttribute: selectedPrimaryAttr,
      classFeatureChoices,
      selectedFeatIds,
    });

    await saveCharacterPatch(charRef, patch);

    // Update local cache
    currentDoc = currentDoc || {};
    currentDoc.builder = {
      ...(currentDoc.builder || {}),
      classKey: selectedClassKey,
      primaryAttribute: selectedPrimaryAttr,
      classFeatureChoices: { ...(classFeatureChoices || {}) },
      selectedFeatIds: [...(selectedFeatIds || [])],
    };

    setStatus(statusEl, "Saved.");

    if (openSheetAfter) {
      const url = new URL("editor.html", window.location.href);
      url.searchParams.set("charId", ctx.charId);
      if (ctx.claims?.gm && ctx.requestedUid) url.searchParams.set("uid", ctx.requestedUid);
      window.location.href = url.toString();
    }

    return true;
  } catch (e) {
    console.error(e);
    showError(errorEl, "Could not save.");
    setStatus(statusEl, "Error.");
    return false;
  }
}

// ---- Init ----
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

    gameData = await loadGameData();

    // Load saved selections
    selectedClassKey = String(currentDoc?.builder?.classKey || "");
    selectedPrimaryAttr = String(currentDoc?.builder?.primaryAttribute || "");
    classFeatureChoices = (currentDoc?.builder?.classFeatureChoices && typeof currentDoc.builder.classFeatureChoices === "object")
      ? JSON.parse(JSON.stringify(currentDoc.builder.classFeatureChoices))
      : {};
    selectedFeatIds = Array.isArray(currentDoc?.builder?.selectedFeatIds) ? [...currentDoc.builder.selectedFeatIds] : [];

    if (classSearch) classSearch.addEventListener("input", renderClassList);

    // Render nav: Next auto-saves and requires completion
    renderBuilderNav({
      mountEl: navMount,
      currentStepId: CURRENT_STEP_ID,
      characterDoc: currentDoc,
      ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
      onBeforeNext: async () => await saveBuilder({ openSheetAfter: false, requireComplete: true }),
    });

    renderClassList();
    selectClass(selectedClassKey);

    saveBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: false, requireComplete: false }));
    saveAndOpenBtn.addEventListener("click", () => saveBuilder({ openSheetAfter: true, requireComplete: false }));

    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading class chooser.");
    setStatus(statusEl, "Error.");
  }
}

main();
