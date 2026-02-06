// public/builder-class.js
// Class selection step: class, level, primary attribute, class feature options, and feats.

import {
  initBuilderAuth,
  loadCharacterDoc,
  saveCharacterPatch,
  markStepVisited,
  setStatus,
  showError,
  clearError,
} from "./builder-common.js";

import { renderBuilderNav } from "./builder-nav.js";

import {
  ATTR_KEYS,
  clampLevel,
  coerceAttrKey,
  labelForAttrKey,
  sanitizeText,
} from "./character-schema.js";

const CURRENT_STEP_ID = "class";

/** @type {any} */
let ctx;
/** @type {any} */
let charRef;
/** @type {any} */
let currentDoc;

/** @type {any} */
let gameData;

// In-memory state
let selectedClassKey = "";
let selectedPrimary = "";
let selectedLevel = 1;
/** @type {Set<string>} */
let selectedFeatureOptionKeys = new Set();
/** @type {Set<string>} */
let selectedFeatNames = new Set();

/** optionKey -> option object */
/** @type {Map<string, any>} */
const optionByKey = new Map();

/** groupId -> collapsed? */
/** @type {Map<string, boolean>} */
const collapsedGroups = new Map();

// ---- DOM ----
const whoamiEl = document.getElementById("whoami");
const signOutBtn = document.getElementById("signOutBtn");
const gmHintEl = document.getElementById("gmHint");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const navTopEl = document.getElementById("builderNavTop");
const navBottomEl = document.getElementById("builderNavBottom");

const classSelectEl = document.getElementById("classSelect");
const levelEl = document.getElementById("level");
const primaryEl = document.getElementById("primaryAttribute");
const classDetailsEl = document.getElementById("classDetails");

const featuresEl = document.getElementById("features");
const featsEl = document.getElementById("feats");
const featureHintEl = document.getElementById("featureHint");
const featHintEl = document.getElementById("featHint");

const incompleteBannerEl = document.getElementById("classIncompleteBanner");
const incompleteReasonEl = document.getElementById("classIncompleteReason");

const saveBtn = document.getElementById("saveBtn");
const saveAndOpenBtn = document.getElementById("saveAndOpenBtn");

// ---- Helpers ----

function safeStr(v, maxLen = 200) {
  return sanitizeText(v, { maxLen });
}


function buildGroupId(group) {
  const cls = safeStr(group?.classKey || "", 64);
  const lvl = Number.isFinite(group?.level) ? group.level : 0;
  const name = safeStr(group?.name || "", 96);
  return `${cls}|L${lvl}|${name}`;
}

function buildOptionKey(group, option) {
  const gid = buildGroupId(group);
  const optName = safeStr(option?.name || "", 120);
  return `${gid}::${optName}`;
}

function getClassByKey(classKey) {
  const arr = Array.isArray(gameData?.classes) ? gameData.classes : [];
  return arr.find((c) => String(c.classKey) === String(classKey)) || null;
}

function classSelectableInfo(classObj) {
  if (!classObj) return { ok: false, reason: "Missing class data." };

  const missing = [];
  const req = ["primaryAttributeA", "primaryAttributeB", "hpProgression", "combatTechniqueSkill"];
  for (const k of req) {
    if (!classObj[k]) missing.push(k);
  }

  const cf = gameData?.classFeatures?.[classObj.classKey];
  if (!Array.isArray(cf) || !cf.length) missing.push("classFeatures");

  if (!missing.length) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `Missing: ${missing.join(", ")}.`,
  };
}

function getAllowedPrimaryAttributes(classObj) {
  const a = coerceAttrKey(classObj?.primaryAttributeA);
  const b = coerceAttrKey(classObj?.primaryAttributeB);
  const allowed = [a, b].filter(Boolean);
  // Keep stable ordering and only allow real attributes.
  return allowed.filter((k) => ATTR_KEYS.includes(/** @type {any} */ (k)));
}

function getFeatSlots(level) {
  // Rule (temporary): 1 slot at every even level.
  const L = clampLevel(level);
  return Math.floor(L / 2);
}

function computeVisibleClassFeatures(classKey, level) {
  const all = Array.isArray(gameData?.classFeatures?.[classKey]) ? gameData.classFeatures[classKey] : [];
  const L = clampLevel(level);
  return all.filter((f) => Number(f?.level || 0) <= L);
}

function computeVisibleFeats(classKey, level) {
  const all = Array.isArray(gameData?.feats) ? gameData.feats : [];
  const L = clampLevel(level);
  return all
    .filter((f) => String(f?.classKey || "") === String(classKey))
    .filter((f) => Number(f?.minLevel || 0) <= L);
}

function pruneSelectionsForLevel() {
  // Prune feats (minLevel + slot cap)
  if (selectedClassKey) {
    const visibleFeats = computeVisibleFeats(selectedClassKey, selectedLevel);
    const allowed = new Set(visibleFeats.map((f) => String(f?.name || "").trim()).filter(Boolean));
    selectedFeatNames = new Set(Array.from(selectedFeatNames).filter((n) => allowed.has(n)));

    const maxSlots = getFeatSlots(selectedLevel);
    if (selectedFeatNames.size > maxSlots) {
      selectedFeatNames = new Set(Array.from(selectedFeatNames).slice(0, maxSlots));
    }

    // Prune feature option keys that are not present at/below level
    optionByKey.clear();
    const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
    const allowedOptKeys = new Set();
    visible
      .filter((f) => String(f?.type) === "optionGroup")
      .forEach((g) => {
        const opts = Array.isArray(g?.options) ? g.options : [];
        for (const o of opts) {
          const k = buildOptionKey(g, o);
          allowedOptKeys.add(k);
          optionByKey.set(k, o);
        }
      });

    selectedFeatureOptionKeys = new Set(Array.from(selectedFeatureOptionKeys).filter((k) => allowedOptKeys.has(k)));
  }
}

function validateBeforeSave() {
  clearError(errorEl);

  const cls = getClassByKey(selectedClassKey);
  if (!cls) return { ok: false, msg: "Choose a class." };

  const selectable = classSelectableInfo(cls);
  if (!selectable.ok) return { ok: false, msg: "This class is not selectable yet." };

  const allowedPrimary = getAllowedPrimaryAttributes(cls);
  if (!selectedPrimary || !allowedPrimary.includes(/** @type {any} */ (selectedPrimary))) {
    return { ok: false, msg: "Choose a Primary Attribute." };
  }

  // Enforce option groups: must pick exactly chooseCount if the group is visible.
  const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
  const groups = visible.filter((f) => String(f?.type) === "optionGroup");

  for (const g of groups) {
    const chooseCount = Number(g?.chooseCount || 0);
    if (!chooseCount) continue;
    const opts = Array.isArray(g?.options) ? g.options : [];
    const keys = opts.map((o) => buildOptionKey(g, o));
    const picked = keys.filter((k) => selectedFeatureOptionKeys.has(k)).length;
    if (picked !== chooseCount) {
      return { ok: false, msg: `Finish selecting options for: ${g.name} (choose ${chooseCount}).` };
    }
  }

  // Feats: cannot exceed slots.
  const maxSlots = getFeatSlots(selectedLevel);
  if (selectedFeatNames.size > maxSlots) {
    return { ok: false, msg: `Too many feats selected (${selectedFeatNames.size}/${maxSlots}).` };
  }

  return { ok: true, msg: "" };
}

function buildAutoAbilities() {
  /** @type {{name: string, text: string}[]} */
  const out = [];

  if (!selectedClassKey) return out;

  const L = clampLevel(selectedLevel);
  const visible = computeVisibleClassFeatures(selectedClassKey, L);

  // Fixed features
  for (const f of visible) {
    if (String(f?.type) !== "feature") continue;
    const n = String(f?.name || "").trim();
    if (!n) continue;
    out.push({
      name: `Class Feature — ${n}`,
      text: String(f?.description || "").trim(),
    });
  }

  // Selected options from option groups
  for (const g of visible) {
    if (String(g?.type) !== "optionGroup") continue;
    const opts = Array.isArray(g?.options) ? g.options : [];
    for (const o of opts) {
      const k = buildOptionKey(g, o);
      if (!selectedFeatureOptionKeys.has(k)) continue;
      const n = String(o?.name || "").trim();
      if (!n) continue;
      out.push({
        name: `Class Feature — ${n}`,
        text: String(o?.description || "").trim(),
      });
    }
  }

  // Selected feats
  const visibleFeats = computeVisibleFeats(selectedClassKey, L);
  const featByName = new Map(visibleFeats.map((f) => [String(f?.name || "").trim(), f]));

  for (const name of Array.from(selectedFeatNames)) {
    const feat = featByName.get(name);
    if (!feat) continue;
    out.push({
      name: `Feat — ${name}`,
      text: String(feat?.description || "").trim(),
    });
  }

  return out;
}

function mergeAbilities(existingAbilities, oldAutoNames, newAutoAbilities) {
  const oldSet = new Set(Array.isArray(oldAutoNames) ? oldAutoNames : []);
  const kept = (Array.isArray(existingAbilities) ? existingAbilities : [])
    .filter((it) => it && typeof it === "object")
    .filter((it) => {
      const n = String(it.name || "").trim();
      return !oldSet.has(n);
    })
    .map((it) => ({ name: String(it.name || ""), text: String(it.text || "") }));

  const merged = kept.concat(newAutoAbilities);
  return merged;
}

async function loadGameData() {
  if (gameData) return gameData;
  const res = await fetch("data/game-x/game-x-data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load game data.");
  gameData = await res.json();
  return gameData;
}

function renderPrimaryOptions() {
  if (!primaryEl) return;
  const cls = getClassByKey(selectedClassKey);
  const allowed = getAllowedPrimaryAttributes(cls);

  primaryEl.innerHTML = allowed
    .map((k) => `<option value="${k}">${labelForAttrKey(k) || (k[0].toUpperCase() + k.slice(1))}</option>`)
    .join("");
  if (selectedPrimary && allowed.includes(/** @type {any} */ (selectedPrimary))) {
    primaryEl.value = selectedPrimary;
  } else {
    selectedPrimary = allowed[0] || "";
    primaryEl.value = selectedPrimary;
  }
}

function renderClassDetails() {
  if (!classDetailsEl) return;
  const cls = getClassByKey(selectedClassKey);
  if (!cls) {
    classDetailsEl.textContent = "Select a class to view details.";
    return;
  }

  const lines = [];
  lines.push(`<div><strong>${safeStr(cls.name || cls.classKey || "Class")}</strong></div>`);
  if (cls.pitch) lines.push(`<div class="muted" style="margin-top:6px">${safeStr(cls.pitch, 1200)}</div>`);
  if (cls.examples) lines.push(`<div class="muted" style="margin-top:6px"><span class="muted">Examples:</span> ${safeStr(cls.examples, 500)}</div>`);
  if (cls.notes) lines.push(`<div class="muted" style="margin-top:6px"><span class="muted">Notes:</span> ${safeStr(cls.notes, 800)}</div>`);


  const allowed = getAllowedPrimaryAttributes(cls);
  if (allowed.length) {
    const labels = allowed.map((k) => labelForAttrKey(k) || k);
    lines.push(`<div style="margin-top:10px"><span class="muted">Primary Attributes:</span> ${labels.join(" / ")}</div>`);
  }

  classDetailsEl.innerHTML = lines.join("");
}

function setIncompleteBanner(isIncomplete, reasonText) {
  if (!incompleteBannerEl || !incompleteReasonEl) return;
  if (!isIncomplete) {
    incompleteBannerEl.style.display = "none";
    incompleteReasonEl.textContent = "";
    return;
  }
  incompleteBannerEl.style.display = "block";
  incompleteReasonEl.textContent = reasonText ? ` ${reasonText}` : "";
}

function renderFeatures() {
  if (!featuresEl) return;
  featuresEl.innerHTML = "";
  optionByKey.clear();

  if (!selectedClassKey) {
    featuresEl.innerHTML = `<p class="muted">Choose a class to view features.</p>`;
    return;
  }

  const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);

  if (featureHintEl) featureHintEl.textContent = `Showing features up to level ${clampLevel(selectedLevel)}.`;

  if (!visible.length) {
    featuresEl.innerHTML = `<p class="muted">No features available.</p>`;
    return;
  }

  for (const f of visible) {
    const type = String(f?.type || "");

    if (type === "feature") {
      const card = document.createElement("div");
      card.className = "builderItem";
      card.innerHTML = `
        <div class="builderItemTitle">${safeStr(f.name || "Feature")}</div>
        <div class="muted builderItemMeta">Level ${Number(f.level || 1)}</div>
        <div class="builderItemBody">${safeStr(f.description || "", 2000)}</div>
      `;
      featuresEl.append(card);
      continue;
    }

    if (type === "optionGroup") {
      const chooseCount = Number(f?.chooseCount || 0);
      const opts = Array.isArray(f?.options) ? f.options : [];
      const gid = buildGroupId(f);
      const isCollapsed = collapsedGroups.get(gid) ?? true;

      // Map options for pruning and later ability generation
      for (const o of opts) {
        const ok = buildOptionKey(f, o);
        optionByKey.set(ok, o);
      }

      const container = document.createElement("div");
      container.className = "optionGroup";

      const headerBtn = document.createElement("button");
      headerBtn.type = "button";
      headerBtn.className = "optionGroupHeader";
      headerBtn.setAttribute("aria-expanded", String(!isCollapsed));

      const selectedCount = opts
        .map((o) => buildOptionKey(f, o))
        .filter((k) => selectedFeatureOptionKeys.has(k)).length;

      headerBtn.innerHTML = `
        <span>${safeStr(f.name || "Options")}</span>
        <span class="muted">choose ${chooseCount} • ${selectedCount}/${chooseCount}</span>
      `;

      const body = document.createElement("div");
      body.className = "optionGroupBody";
      body.style.display = isCollapsed ? "none" : "block";

      headerBtn.addEventListener("click", () => {
        const nowCollapsed = !(body.style.display === "none");
        body.style.display = nowCollapsed ? "none" : "block";
        collapsedGroups.set(gid, nowCollapsed);
        headerBtn.setAttribute("aria-expanded", String(!nowCollapsed));
      });

      if (f.description) {
        const desc = document.createElement("div");
        desc.className = "muted";
        desc.style.margin = "6px 0 10px 0";
        desc.textContent = String(f.description);
        body.append(desc);
      }

      const list = document.createElement("div");
      list.className = "optionList";

      const updateOptionDisables = () => {
        const keys = opts.map((o) => buildOptionKey(f, o));
        const picked = keys.filter((k) => selectedFeatureOptionKeys.has(k)).length;
        const limitReached = chooseCount > 0 && picked >= chooseCount;
        const boxes = list.querySelectorAll("input[type=checkbox]");
        boxes.forEach((box) => {
          const k = String(box.dataset.key || "");
          if (!k) return;
          if (box.checked) {
            box.disabled = false;
          } else {
            box.disabled = limitReached;
          }
        });
      };

      for (const o of opts) {
        const k = buildOptionKey(f, o);
        const row = document.createElement("label");
        row.className = "optionRow";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.key = k;
        cb.checked = selectedFeatureOptionKeys.has(k);

        cb.addEventListener("change", () => {
          if (cb.checked) {
            // Enforce max
            const keys = opts.map((x) => buildOptionKey(f, x));
            const picked = keys.filter((kk) => selectedFeatureOptionKeys.has(kk)).length;
            if (chooseCount > 0 && picked >= chooseCount) {
              cb.checked = false;
              return;
            }
            selectedFeatureOptionKeys.add(k);
          } else {
            selectedFeatureOptionKeys.delete(k);
          }
          // re-render header counts without losing collapse state
          renderFeatures();
        });

        const title = document.createElement("div");
        title.className = "optionTitle";
        title.textContent = String(o.name || "Option");

        const desc = document.createElement("div");
        desc.className = "muted optionDesc";
        desc.textContent = String(o.description || "");

        const textWrap = document.createElement("div");
        textWrap.append(title, desc);

        row.append(cb, textWrap);
        list.append(row);
      }

      body.append(list);
      container.append(headerBtn, body);
      featuresEl.append(container);

      // After mounting, enforce disables
      updateOptionDisables();
    }
  }
}

function renderFeats() {
  if (!featsEl) return;
  featsEl.innerHTML = "";

  if (!selectedClassKey) {
    featsEl.innerHTML = `<p class="muted">Choose a class to view feats.</p>`;
    if (featHintEl) featHintEl.textContent = "";
    return;
  }

  const maxSlots = getFeatSlots(selectedLevel);
  const visible = computeVisibleFeats(selectedClassKey, selectedLevel);
  const used = selectedFeatNames.size;

  if (featHintEl) featHintEl.textContent = `Slots: ${used}/${maxSlots}`;

  if (maxSlots <= 0) {
    featsEl.innerHTML = `<p class="muted">No feat slots at level ${clampLevel(selectedLevel)}. (First slot at level 2.)</p>`;
    return;
  }

  if (!visible.length) {
    featsEl.innerHTML = `<p class="muted">No feats available for this class at your level.</p>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "optionList";

  const updateDisables = () => {
    const limitReached = selectedFeatNames.size >= maxSlots;
    const boxes = list.querySelectorAll("input[type=checkbox]");
    boxes.forEach((box) => {
      if (box.checked) box.disabled = false;
      else box.disabled = limitReached;
    });
  };

  for (const feat of visible) {
    const name = String(feat?.name || "").trim();
    if (!name) continue;
    const row = document.createElement("label");
    row.className = "optionRow";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedFeatNames.has(name);

    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (selectedFeatNames.size >= maxSlots) {
          cb.checked = false;
          return;
        }
        selectedFeatNames.add(name);
      } else {
        selectedFeatNames.delete(name);
      }
      renderFeats();
    });

    const title = document.createElement("div");
    title.className = "optionTitle";
    title.textContent = name;

    const desc = document.createElement("div");
    desc.className = "muted optionDesc";
    desc.textContent = String(feat?.description || "");

    const textWrap = document.createElement("div");
    textWrap.append(title, desc);

    row.append(cb, textWrap);
    list.append(row);
  }

  featsEl.append(list);
  updateDisables();
}

function updateUiForSelection() {
  const cls = getClassByKey(selectedClassKey);
  const selectable = classSelectableInfo(cls);

  setIncompleteBanner(!!cls && !selectable.ok, selectable.reason);

  // Disable controls if incomplete
  const disable = !!cls && !selectable.ok;
  if (primaryEl) primaryEl.disabled = disable;
  if (saveBtn) saveBtn.disabled = disable;
  if (saveAndOpenBtn) saveAndOpenBtn.disabled = disable;
  if (featuresEl) featuresEl.style.opacity = disable ? "0.6" : "1";
  if (featsEl) featsEl.style.opacity = disable ? "0.6" : "1";

  renderPrimaryOptions();
  renderClassDetails();
  pruneSelectionsForLevel();
  renderFeatures();
  renderFeats();
}

async function saveClassStep({ openSheetAfter = false } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const v = validateBeforeSave();
  if (!v.ok) {
    showError(errorEl, v.msg);
    setStatus(statusEl, "Not saved.");
    return false;
  }

  try {
    const autoAbilities = buildAutoAbilities();
    const autoNames = autoAbilities.map((a) => a.name);
    const oldAutoNames = currentDoc?.builder?.autoAbilityNames || [];
    const existingAbilities = currentDoc?.builder?.sheet?.repeatables?.abilities || [];
    const mergedAbilities = mergeAbilities(existingAbilities, oldAutoNames, autoAbilities);

    const patch = {
      "builder.level": clampLevel(selectedLevel),
      "builder.classKey": safeStr(selectedClassKey, 64),
      "builder.primaryAttribute": safeStr(selectedPrimary, 32),
      "builder.selectedClassFeatureOptions": Array.from(selectedFeatureOptionKeys),
      "builder.selectedFeats": Array.from(selectedFeatNames),
      "builder.autoAbilityNames": autoNames,
      "builder.sheet.repeatables.abilities": mergedAbilities,
    };

    await saveCharacterPatch(charRef, patch);
    await markStepVisited(charRef, CURRENT_STEP_ID);

    // Update local cache
    const prevBuilder = currentDoc.builder || {};
    const prevSheet = (prevBuilder.sheet && typeof prevBuilder.sheet === "object") ? prevBuilder.sheet : {};
    const prevRepeatables =
      (prevSheet.repeatables && typeof prevSheet.repeatables === "object") ? prevSheet.repeatables : {};

    currentDoc.builder = {
      ...prevBuilder,
      level: clampLevel(selectedLevel),
      classKey: selectedClassKey,
      primaryAttribute: selectedPrimary,
      selectedClassFeatureOptions: Array.from(selectedFeatureOptionKeys),
      selectedFeats: Array.from(selectedFeatNames),
      autoAbilityNames: autoNames,
      sheet: {
        ...prevSheet,
        repeatables: {
          ...prevRepeatables,
          abilities: mergedAbilities,
        },
      },
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

function renderNav() {
  // Render nav on both top and bottom.
  const navArgs = {
    currentStepId: CURRENT_STEP_ID,
    characterDoc: currentDoc,
    ctx: { charId: ctx.charId, requestedUid: ctx.requestedUid },
    onBeforeNext: async () => {
      // Auto-save before navigation.
      return await saveClassStep({ openSheetAfter: false });
    },
  };

  renderBuilderNav({ ...navArgs, mountEl: navTopEl });
  renderBuilderNav({ ...navArgs, mountEl: navBottomEl });
}

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

    await loadGameData();

    // Populate dropdown
    const classes = Array.isArray(gameData?.classes) ? gameData.classes.slice() : [];
    classes.sort((a, b) => String(a?.name || a?.classKey || "").localeCompare(String(b?.name || b?.classKey || "")));

    classSelectEl.innerHTML = `<option value="">— Choose —</option>` +
      classes
        .map((c) => {
          const info = classSelectableInfo(c);
          const label = `${safeStr(c.name || c.classKey)}${info.ok ? "" : " (Coming Soon)"}`;
          return `<option value="${safeStr(c.classKey, 64)}">${label}</option>`;
        })
        .join("");

    // Hydrate state from doc
    selectedLevel = clampLevel(currentDoc?.builder?.level || 1);
    if (levelEl) levelEl.value = String(selectedLevel);

    selectedClassKey = String(currentDoc?.builder?.classKey || "");
    selectedPrimary = String(currentDoc?.builder?.primaryAttribute || "");
    selectedFeatureOptionKeys = new Set(Array.isArray(currentDoc?.builder?.selectedClassFeatureOptions) ? currentDoc.builder.selectedClassFeatureOptions : []);
    selectedFeatNames = new Set(Array.isArray(currentDoc?.builder?.selectedFeats) ? currentDoc.builder.selectedFeats : []);

    if (selectedClassKey) classSelectEl.value = selectedClassKey;

    // Wire events
    classSelectEl.addEventListener("change", () => {
      selectedClassKey = String(classSelectEl.value || "");
      // Reset selections when switching classes (but keep level)
      selectedPrimary = "";
      selectedFeatureOptionKeys = new Set();
      selectedFeatNames = new Set();
      updateUiForSelection();
      renderNav();
    });

    levelEl.addEventListener("change", () => {
      selectedLevel = clampLevel(levelEl.value);
      pruneSelectionsForLevel();
      updateUiForSelection();
      renderNav();
    });

    primaryEl.addEventListener("change", () => {
      selectedPrimary = String(primaryEl.value || "");
    });

    saveBtn.addEventListener("click", () => saveClassStep({ openSheetAfter: false }));
    saveAndOpenBtn.addEventListener("click", () => saveClassStep({ openSheetAfter: true }));

    updateUiForSelection();
    renderNav();
    setStatus(statusEl, "Ready.");
  } catch (e) {
    console.error(e);
    showError(errorEl, e?.message || "Error loading class step.");
    setStatus(statusEl, "Error.");
  }
}

main();
