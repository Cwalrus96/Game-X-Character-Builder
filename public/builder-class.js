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
  confirmSaveWarnings,
} from "./builder-common.js";

import { renderBuilderNav } from "./builder-nav.js";

import { loadGameXData } from "./game-data.js";

import { ATTR_KEYS, clampLevel, coerceAttrKey, labelForAttrKey } from "./character-rules.js";
import { sanitizeText, buildGroupId, buildOptionKey } from "./data-sanitization.js";
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

function getSaveIssues() {
  clearError(errorEl);

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  const prevClassKey = String(currentDoc?.builder?.classKey || "");
  const classChanged = !!selectedClassKey && !!prevClassKey && prevClassKey !== selectedClassKey;

  const prevLevelRaw = Number(currentDoc?.builder?.level || 1);
  const prevLevel = clampLevel(prevLevelRaw);
  const nextLevel = clampLevel(selectedLevel);
  const levelDecreased = nextLevel < prevLevel;

  const cls = getClassByKey(selectedClassKey);
  if (!cls) {
    warnings.push("Choose a class.");
  } else {
    const selectable = classSelectableInfo(cls);
    if (!selectable.ok) {
      warnings.push("This class is marked Coming Soon (data may be incomplete).");
    }

    const allowedPrimary = getAllowedPrimaryAttributes(cls);
    if (!selectedPrimary || !allowedPrimary.includes(/** @type {any} */ (selectedPrimary))) {
      warnings.push("Choose a Primary Attribute.");
    }

    // Option groups: warn if incomplete.
    const visible = computeVisibleClassFeatures(selectedClassKey, selectedLevel);
    const groups = visible.filter((f) => String(f?.type) === "optionGroup");
    for (const g of groups) {
      const chooseCount = Number(g?.chooseCount || 0);
      if (!chooseCount) continue;
      const opts = Array.isArray(g?.options) ? g.options : [];
      const keys = opts.map((o) => buildOptionKey(g, o));
      const picked = keys.filter((k) => selectedFeatureOptionKeys.has(k)).length;
      if (picked !== chooseCount) {
        warnings.push(`Finish selecting options for: ${g.name} (choose ${chooseCount}).`);
      }
    }
  }

  // Cascading invalidation: lowering level can prune selections.
  // (We warn and then auto-prune on save to keep the sheet consistent.)
  if (levelDecreased && selectedClassKey) {
    // Feats: minLevel + slot cap.
    const storedFeats = Array.isArray(currentDoc?.builder?.selectedFeats)
      ? currentDoc.builder.selectedFeats.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    if (storedFeats.length) {
      const allowedVisible = computeVisibleFeats(selectedClassKey, nextLevel);
      const allowedByName = new Set(allowedVisible.map((f) => String(f?.name || "").trim()).filter(Boolean));
      let kept = storedFeats.filter((n) => allowedByName.has(n));
      const nextSlots = getFeatSlots(nextLevel);
      if (kept.length > nextSlots) kept = kept.slice(0, nextSlots);
      const droppedCount = Math.max(0, storedFeats.length - kept.length);
      if (droppedCount) {
        warnings.push(
          `Lowering level to ${nextLevel} will remove ${droppedCount} feat${droppedCount === 1 ? "" : "s"} that no longer fit your level/slot limits.`
        );
      }
    }

    // Feature options: options for features above the new level will be cleared.
    const storedOpts = Array.isArray(currentDoc?.builder?.selectedClassFeatureOptions)
      ? currentDoc.builder.selectedClassFeatureOptions.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (storedOpts.length) {
      const visible = computeVisibleClassFeatures(selectedClassKey, nextLevel);
      const allowedOptKeys = new Set();
      visible
        .filter((f) => String(f?.type) === "optionGroup")
        .forEach((g) => {
          const opts = Array.isArray(g?.options) ? g.options : [];
          for (const o of opts) allowedOptKeys.add(buildOptionKey(g, o));
        });

      const kept = storedOpts.filter((k) => allowedOptKeys.has(k));
      const droppedCount = Math.max(0, storedOpts.length - kept.length);
      if (droppedCount) {
        warnings.push(
          `Lowering level to ${nextLevel} will clear ${droppedCount} class option selection${droppedCount === 1 ? "" : "s"} from higher-level features.`
        );
      }
    }
  }

  // Cascading invalidation: class changes make prior technique picks invalid.
  // Warn and (on save) clear them so the Techniques step starts from a clean slate.
  if (classChanged) {
    const storedTechniques = Array.isArray(currentDoc?.builder?.selectedTechniques)
      ? currentDoc.builder.selectedTechniques
      : [];
    if (storedTechniques.length) {
      warnings.push(
        `Changing class will clear ${storedTechniques.length} selected technique${
          storedTechniques.length === 1 ? "" : "s"
        }.`
      );
    }
  }

  // Feats: cannot exceed slots (this is invalid, not just missing data).
  const maxSlots = getFeatSlots(selectedLevel);
  if (selectedFeatNames.size > maxSlots) {
    errors.push(`Too many feats selected (${selectedFeatNames.size}/${maxSlots}).`);
  }
  if (selectedFeatNames.size < maxSlots) {
    warnings.push(`You can select ${maxSlots} feats, but only selected ${selectedFeatNames.size}.`);
  }

  return { errors, warnings };
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
  lines.push(`<div><strong>${sanitizeText(cls.name || cls.classKey || "Class", { maxLen: 200 })}</strong></div>`);
  if (cls.pitch) lines.push(`<div class="muted" style="margin-top:6px">${sanitizeText(cls.pitch, { maxLen: 1200 })}</div>`);
  if (cls.examples) lines.push(`<div class="muted" style="margin-top:6px"><span class="muted">Examples:</span> ${sanitizeText(cls.examples, { maxLen: 500 })}</div>`);
  if (cls.notes) lines.push(`<div class="muted" style="margin-top:6px"><span class="muted">Notes:</span> ${sanitizeText(cls.notes, { maxLen: 800 })}</div>`);


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
        <div class="builderItemTitle">${sanitizeText(f.name || "Feature", { maxLen: 200 })}</div>
        <div class="muted builderItemMeta">Level ${Number(f.level || 1)}</div>
        <div class="builderItemBody">${sanitizeText(f.description || "", { maxLen: 2000 })}</div>
      `;
      featuresEl.append(card);
      continue;
    }

    if (type === "optionGroup") {
      const chooseCount = Number(f?.chooseCount || 0);
      const opts = Array.isArray(f?.options) ? f.options : [];
      const gid = buildGroupId(f);
      // Expanded by default.
      const isCollapsed = collapsedGroups.get(gid) ?? false;

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
        <span>${sanitizeText(f.name || "Options", { maxLen: 200 })}</span>
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
  // Even if a class is "Coming Soon", allow saving (warn on save instead of blocking).
  const dim = !!cls && !selectable.ok;
  if (primaryEl) primaryEl.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
  if (saveAndOpenBtn) saveAndOpenBtn.disabled = false;
  if (featuresEl) featuresEl.style.opacity = dim ? "0.6" : "1";
  if (featsEl) featsEl.style.opacity = dim ? "0.6" : "1";

  renderPrimaryOptions();
  renderClassDetails();
  pruneSelectionsForLevel();
  renderFeatures();
  renderFeats();
}

async function saveClassStep({ openSheetAfter = false, intent = "save" } = {}) {
  clearError(errorEl);
  setStatus(statusEl, "Saving…");

  const { errors, warnings } = getSaveIssues();
  if (errors.length) {
    showError(errorEl, errors.join(" "));
    setStatus(statusEl, "Not saved.");
    return false;
  }

  if (warnings.length) {
    const ok = await confirmSaveWarnings({
      title: "Some information is incomplete",
      warnings,
      okText: intent === "navigate" ? "Save and Continue" : "Save",
      cancelText: "Cancel",
    });
    if (!ok) {
      setStatus(statusEl, "Not saved.");
      return false;
    }
  }

  try {
    const prevClassKey = String(currentDoc?.builder?.classKey || "");
    const classChanged = !!selectedClassKey && !!prevClassKey && prevClassKey !== selectedClassKey;

    // Always enforce pruning at save time (manual saves and navigation saves).
    pruneSelectionsForLevel();

    const autoAbilities = buildAutoAbilities();
    const autoNames = autoAbilities.map((a) => a.name);
    const oldAutoNames = currentDoc?.builder?.autoAbilityNames || [];
    const existingAbilities = currentDoc?.builder?.sheet?.repeatables?.abilities || [];
    const mergedAbilities = mergeAbilities(existingAbilities, oldAutoNames, autoAbilities);

    const patch = {
      "builder.level": clampLevel(selectedLevel),
      "builder.classKey": sanitizeText(selectedClassKey, { maxLen: 64 }),
      "builder.primaryAttribute": sanitizeText(selectedPrimary, { maxLen: 32 }),
      "builder.selectedClassFeatureOptions": Array.from(selectedFeatureOptionKeys),
      "builder.selectedFeats": Array.from(selectedFeatNames),
      ...(classChanged ? { "builder.selectedTechniques": [] } : {}),
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
      ...(classChanged ? { selectedTechniques: [] } : {}),
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
      const url = new URL("character-sheet.html", window.location.href);
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
    onBeforeNavigate: async () => {
      // Auto-save before navigation (warn, but allow).
      return await saveClassStep({ openSheetAfter: false, intent: "navigate" });
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

    gameData = await loadGameXData();

    // Populate dropdown
    const classes = Array.isArray(gameData?.classes) ? gameData.classes.slice() : [];
    classes.sort((a, b) => String(a?.name || a?.classKey || "").localeCompare(String(b?.name || b?.classKey || "")));

    classSelectEl.innerHTML = `<option value="">— Choose —</option>` +
      classes
        .map((c) => {
          const info = classSelectableInfo(c);
          const label = `${sanitizeText(c.name || c.classKey, { maxLen: 200 })}${info.ok ? "" : " (Coming Soon)"}`;
          return `<option value="${sanitizeText(c.classKey, { maxLen: 64 })}">${label}</option>`;
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

    saveBtn.addEventListener("click", () => saveClassStep({ openSheetAfter: false, intent: "save" }));
    saveAndOpenBtn.addEventListener("click", () => saveClassStep({ openSheetAfter: true, intent: "save" }));

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
