import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { db, storage } from "./firebase.js";
import { onAuth, getClaims } from "./auth-ui.js";

import {
  CHARACTER_SCHEMA_VERSION,
  ATTR_KEYS,
  labelForAttrKey,
  loadGameXClasses,
  computeSpeed,
  computePhysicalDefense,
  computeMentalDefense,
  computeSpiritDefense,
  computeMaxHP,
  sanitizeCharName,
  clampLevel,
  normalizeAttributes,
  coerceAttrKey,
  getAttributeEffectiveCap,
  toInt,
  sanitizeStoragePath,
  sanitizeText,
  getPortraitStoragePath,
} from "./character-schema.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

(() => {
  'use strict';

  // This page expects to be opened from the character list.
  const urlParams = new URLSearchParams(window.location.search);
  const charIdParam = urlParams.get('charId');
  const requestedUidParam = urlParams.get('uid');

  if (!charIdParam) {
    window.location.replace('characters.html');
    return;
  }

  let editingUid = null;           // resolved after auth (may be GM-selected)
  const editingCharId = charIdParam;
  let isGMUser = false;

// ---------- Firebase (Auth + Firestore) ----------
  const cloudStatusEl = document.getElementById('cloudStatus');

  let currentUser = null;
  let cloudDocRef = null;          // users/<uid>/characters/<charId>
  let cloudReady = false;
  let cloudSaveTimer = null;
  const CLOUD_SAVE_DEBOUNCE_MS = 1200;

  function setCloudStatus(msg, isError=false) {
    if (!cloudStatusEl) return;
    cloudStatusEl.textContent = msg;
    cloudStatusEl.style.opacity = isError ? '1' : '0.9';
  }

  function cloudEnabled() {
    return !!(currentUser && cloudDocRef && cloudReady);
  }

  // ---- Class list (from JSON) ----
  // The editor stores classSelect as the canonical classKey (kebab-case).
  // We populate the dropdown from /data/game-x/classes.json to avoid duplicating class data in HTML/JS.
  let classOptionsPromise = null;

  async function ensureClassSelectOptions() {
    if (classOptionsPromise) return classOptionsPromise;
    classOptionsPromise = (async () => {
      if (!classSelect) return;

      try {
        const list = await loadGameXClasses();
        if (!Array.isArray(list)) return;

        const pending = sanitizeText(classSelect.dataset.pendingValue || classSelect.value || '', { maxLen: 64 });

        // Rebuild options
        classSelect.innerHTML = '';
        const naOpt = document.createElement('option');
        naOpt.value = '';
        naOpt.textContent = 'N/A / Other';
        classSelect.appendChild(naOpt);

        for (const it of list) {
          const key = sanitizeText(it?.classKey, { maxLen: 64 });
          const name = String(it?.name || '').trim();
          if (!key || !name) continue;
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = name;
          classSelect.appendChild(opt);
        }

        if (pending) {
          classSelect.value = pending;
          // If the key isn't in the list, keep it visible so we don't silently drop data.
          if (classSelect.value !== pending) {
            const opt = document.createElement('option');
            opt.value = pending;
            opt.textContent = pending;
            classSelect.appendChild(opt);
            classSelect.value = pending;
          }
        }

        delete classSelect.dataset.pendingValue;
      } catch (e) {
        console.warn('Failed to populate class list:', e);
      }
    })();

    return classOptionsPromise;
  }

  const CANONICAL_FIELD_NAMES = new Set([
    'charName',
    'classSelect',
    'primaryAttribute',
    'level',
    // attributes
    ...ATTR_KEYS,
  ]);

  // Derived values (computed for display; not stored in sheet fields)
  const DERIVED_FIELD_NAMES = new Set([
    'hpmax',
    'speed',
    'physdef',
    'mentdef',
    'spiritdef',
  ]);

  function buildCanonicalFromForm(fields) {
    const name = sanitizeCharName(fields?.charName || '');
    const level = clampLevel(fields?.level ?? 1);
    const primaryAttribute = coerceAttrKey(fields?.primaryAttribute);
    const classKey = sanitizeText(fields?.classSelect, { maxLen: 64 });

    // Store EFFECTIVE (final) attribute values in builder.attributes
    const attrs = normalizeAttributes(fields || {});
    for (const k of ATTR_KEYS) {
      const cap = getAttributeEffectiveCap(level, k, primaryAttribute);
      const min = primaryAttribute && k === primaryAttribute ? 1 : 0;
      attrs[k] = toInt(attrs[k], { min, max: cap });
    }

    return { name, level, primaryAttribute, classKey, attributes: attrs };
  }

  function pickSheetOnlyFields(allFields) {
    const out = {};
    const src = (allFields && typeof allFields === 'object') ? allFields : {};
    for (const [k, v] of Object.entries(src)) {
      if (CANONICAL_FIELD_NAMES.has(k)) continue;
      if (DERIVED_FIELD_NAMES.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  // ---- Derived display (from character-schema.js) ----

  let derivedSeq = 0;

  function setNumberFieldByName(name, n) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    const val = Number.isFinite(n) ? String(Math.round(n)) : '';
    if (el.value !== val) el.value = val;
  }

  async function updateDerivedDisplay(fieldsOverride = null) {
    const seq = ++derivedSeq;

    const allFields = fieldsOverride || collectFields();
    const canon = buildCanonicalFromForm(allFields);

    try {
      const speed = computeSpeed(canon.attributes);
const physdef = computePhysicalDefense({ attributes: canon.attributes, trainingRank: allFields.rank_physdef });
const mentdef = computeMentalDefense({ attributes: canon.attributes, trainingRank: allFields.rank_mentdef });
const spiritdef = computeSpiritDefense({ attributes: canon.attributes, trainingRank: allFields.rank_spiritdef });

setNumberFieldByName('speed', speed);
setNumberFieldByName('physdef', physdef);
setNumberFieldByName('mentdef', mentdef);
setNumberFieldByName('spiritdef', spiritdef);

const hpmax = await computeMaxHP({ level: canon.level, classKey: canon.classKey, attributes: canon.attributes });

if (seq !== derivedSeq) return; // stale

setNumberFieldByName('hpmax', hpmax);
} catch (e) {
      // Best-effort UI update; don't break the sheet.
      if (seq !== derivedSeq) return;
      console.warn('Derived field update failed:', e);
    }
  }

  async function resolvePortraitUrl(path) {
    const p = sanitizeStoragePath(path);
    if (!p) return '';
    try {
      const r = storageRef(storage, p);
      return await getDownloadURL(r);
    } catch (e) {
      console.warn('getDownloadURL failed:', e);
      return '';
    }
  }

  async function loadCloudOrInit() {
    if (!cloudDocRef) return;
    setCloudStatus('Cloud: Loading…');

    try {
      const snap = await getDoc(cloudDocRef);
      if (snap.exists()) {
        const raw = snap.data() || {};

        // Canonical read path (no legacy backfill):
        const b = (raw?.builder && typeof raw.builder === 'object') ? raw.builder : {};
        const name = sanitizeCharName(b?.name || '');
        const portraitPath = sanitizeStoragePath(b?.portraitPath || '');
        const level = clampLevel(b?.level ?? 1);
        const primaryAttribute = coerceAttrKey(b?.primaryAttribute);
        const classKey = sanitizeText(b?.classKey, { maxLen: 64 });

        const attrs = normalizeAttributes(b?.attributes || {});
        for (const k of ATTR_KEYS) {
          const cap = getAttributeEffectiveCap(level, k, primaryAttribute);
          const min = primaryAttribute && k === primaryAttribute ? 1 : 0;
          attrs[k] = toInt(attrs[k], { min, max: cap });
        }

        const sheetFields = (b?.sheet?.fields && typeof b.sheet.fields === 'object') ? b.sheet.fields : {};
        const sheetOnlyFields = pickSheetOnlyFields(sheetFields);
        const repeatables = (b?.sheet?.repeatables && typeof b.sheet.repeatables === 'object') ? b.sheet.repeatables : {};

        // Build a local/editor state (no duplicated canonical fields inside sheet fields).
        const state = {
          version: 3,
          savedAt: Date.now(),
          canonical: {
            name,
            level,
            primaryAttribute,
            classKey,
            attributes: attrs,
          },
          portrait: {
            path: portraitPath,
            previewDataUrl: '',
          },
          fields: sheetOnlyFields,
          repeatables,
        };

        applyState(state);
        if (portraitApi && portraitPath) {
          const url = await resolvePortraitUrl(portraitPath);
          portraitApi.set({ path: portraitPath, previewUrl: url });
        }

        setStatus('Loaded from cloud');
        cloudReady = true;
        setCloudStatus('Cloud: Ready');
        return;
      }

      // No cloud doc yet → initialize from current sheet (local/default state)
      const allFields = collectFields();
      const canon = buildCanonicalFromForm(allFields);
      const state = collectState();

      const baseline = {
        schemaVersion: CHARACTER_SCHEMA_VERSION,
        ownerUid: editingUid,
        builder: {
          name: sanitizeCharName(canon?.name || 'Character'),
          portraitPath: sanitizeStoragePath(state?.portrait?.path || ''),
          level: clampLevel(canon?.level ?? 1),
          attributes: normalizeAttributes(canon?.attributes || {}),
          classKey: sanitizeText(canon?.classKey || '', { maxLen: 64 }),
          primaryAttribute: coerceAttrKey(canon?.primaryAttribute),
          // Editor-owned sheet data lives under builder.sheet.*
          sheet: {
            fields: pickSheetOnlyFields(allFields),
            repeatables: state?.repeatables || {},
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(cloudDocRef, baseline, { merge: true });

      cloudReady = true;
      setCloudStatus('Cloud: Ready');
      setStatus('Cloud initialized');
    } catch (e) {
      console.error('loadCloudOrInit error:', e);
      cloudReady = false;
      setCloudStatus('Cloud: Error', true);
    }
  }

  async function saveCloudNow() {
    if (!cloudEnabled()) return;

    try {

      const allFields = collectFields();
      const canon = buildCanonicalFromForm(allFields);
      const state = collectState();

      // Portrait upload (Cloud Storage).
      let portraitPath = sanitizeStoragePath(state?.portrait?.path || '');
      const pendingDelete = portraitApi?.consumePendingDelete ? portraitApi.consumePendingDelete() : '';
      const pending = portraitApi?.consumePendingUpload ? portraitApi.consumePendingUpload() : null;
      if (pending && pending.blob) {
        // Use a stable path so edits overwrite instead of creating junk.
        const storagePath = getPortraitStoragePath({ uid: editingUid, charId: editingCharId });
        if (!storagePath) throw new Error('Invalid portrait storage path');

        // If there was an older portrait at a different path, delete it to avoid junk.
        if (pendingDelete && pendingDelete !== storagePath) {
          try {
            await deleteObject(storageRef(storage, pendingDelete));
          } catch (e) {
            // ignore (missing object, perms, etc.)
          }
        }

        await uploadBytes(storageRef(storage, storagePath), pending.blob, { contentType: 'image/jpeg' });
        portraitPath = storagePath;
        if (portraitApi?.set) {
          const url = await resolvePortraitUrl(storagePath);
          portraitApi.set({ path: storagePath, previewUrl: url });
        }
      } else if (pendingDelete) {
        // Portrait cleared: delete the old object (best effort).
        try {
          await deleteObject(storageRef(storage, pendingDelete));
        } catch (e) {
          // ignore
        }
      }

      const cloudDoc = {
        schemaVersion: CHARACTER_SCHEMA_VERSION,
        ownerUid: editingUid,
        builder: {
          name: sanitizeCharName(canon?.name || 'Character'),
          portraitPath: portraitPath,
          level: clampLevel(canon?.level ?? 1),
          attributes: normalizeAttributes(canon?.attributes || {}),
          classKey: sanitizeText(canon?.classKey || '', { maxLen: 64 }),
          primaryAttribute: coerceAttrKey(canon?.primaryAttribute),
          sheet: {
            fields: pickSheetOnlyFields(allFields),
            repeatables: state?.repeatables || {},
          },
        },
        updatedAt: serverTimestamp(),
      };

      await setDoc(cloudDocRef, cloudDoc, { merge: true });

      setCloudStatus('Cloud: Saved');
    } catch (e) {
      console.error('saveCloudNow error:', e);
      setCloudStatus('Cloud: Save failed', true);
    }
  }

  async function initAuth() {
    onAuth(async (user) => {
      currentUser = user;
      cloudDocRef = null;
      cloudReady = false;

      if (!user) {
        setCloudStatus('Cloud: Off');
        // Require auth for editing (D&D Beyond-style flow)
        const next = encodeURIComponent(window.location.href);
        window.location.href = `login.html?next=${next}`;
        return;
      }

      // Read custom claims (GM) and resolve which user's character doc we are editing.
      try {
        const claims = await getClaims(user, { forceRefresh: true });
        isGMUser = !!claims.gm;
      } catch (e) {
        isGMUser = false;
      }

      editingUid = (isGMUser && requestedUidParam) ? requestedUidParam : user.uid;
      cloudDocRef = doc(db, 'users', editingUid, 'characters', editingCharId);

      // Make the "Characters" link return to the correct list view.
      const back = document.getElementById('backToCharactersLink');
      if (back) {
        back.href = (isGMUser && requestedUidParam) ? `characters.html?uid=${encodeURIComponent(requestedUidParam)}` : 'characters.html';
      }

      // Update local storage key now that we know the effective uid.
      STORAGE_KEY = `gameX_characterSheet_v3_${editingUid}_${editingCharId}`;

      // Load local state for this user/character (if any).
      loadSaved();

      await loadCloudOrInit();
    });
  }

  // Storage key is per-character (and per effective user when known)
  let STORAGE_KEY = `gameX_characterSheet_v3_${editingCharId}`;
  const SAVE_DEBOUNCE_MS = 400;

  const sheetEl = document.getElementById('sheet');
  const classSelect = document.getElementById('classSelect');
  const saveStatusEl = document.getElementById('saveStatus');
  const clearBtn = document.getElementById('clearSheetBtn');

  // Placeholder; initialized after scheduleSave is defined
  let portraitApi = { get: () => '', set: () => {} };

  function setTheme(classKey) {
    const key = sanitizeText(classKey, { maxLen: 64 });
    document.body.setAttribute('data-theme', key || 'na');
  }

  function setStatus(text, isError = false) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = text;
    saveStatusEl.classList.toggle('error', !!isError);
  }

  function canUseStorage(store) {
    try {
      const k = '__gx_store_test__';
      store.setItem(k, '1');
      store.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Prefer localStorage; fall back to sessionStorage (often works even when localStorage is blocked for file:).
  const browserStorage = (typeof localStorage !== 'undefined' && canUseStorage(localStorage)) ? localStorage
                : (typeof sessionStorage !== 'undefined' && canUseStorage(sessionStorage)) ? sessionStorage
                : null;

  const storageType = (!browserStorage) ? 'none' : (browserStorage === localStorage ? 'local' : 'session');

  let storageOk = !!browserStorage;
  let saveTimer = null;

  // ---------- Portrait module ----------

  function initPortrait(scheduleSave) {
    const box = document.querySelector('.portrait-box');
    const imgEl = document.getElementById('portraitPreview');
    const placeholderEl = document.getElementById('portraitPlaceholder');
    const clearBtn = document.getElementById('portraitClear');
    const input = document.getElementById('portraitUpload');

    let portraitPath = '';
    let previewUrl = '';
    let previewDataUrl = '';

    /** @type {{blob: Blob}|null} */
    let pendingUpload = null;
    /** @type {string} */
    let pendingDeletePath = '';

    function render() {
      const src = previewUrl || previewDataUrl || '';
      if (imgEl) {
        imgEl.src = src;
        imgEl.style.display = src ? 'block' : 'none';
      }
      if (placeholderEl) placeholderEl.style.display = src ? 'none' : 'block';
      if (clearBtn) clearBtn.style.display = src ? 'flex' : 'none';
    }

    function set(next = {}) {
      if (next && typeof next === 'object') {
        if (typeof next.path === 'string') portraitPath = sanitizeStoragePath(next.path);
        if (typeof next.previewUrl === 'string') previewUrl = String(next.previewUrl || '');
        if (typeof next.previewDataUrl === 'string') previewDataUrl = String(next.previewDataUrl || '');
        // If we receive a cloud URL, prefer it over local preview data.
        if (previewUrl) previewDataUrl = '';
      }
      render();
    }

    function getState() {
      return {
        path: portraitPath,
        previewUrl,
        previewDataUrl,
      };
    }

    function consumePendingUpload() {
      const p = pendingUpload;
      pendingUpload = null;
      return p;
    }

    function consumePendingDelete() {
      const p = pendingDeletePath;
      pendingDeletePath = '';
      return sanitizeStoragePath(p);
    }

    function clear(opts = {}) {
      // Mark existing storage object for deletion on next cloud save.
      if (portraitPath) pendingDeletePath = portraitPath;
      portraitPath = '';
      previewUrl = '';
      previewDataUrl = '';
      pendingUpload = null;
      if (input) input.value = '';
      render();
      if (!opts || !opts.silent) scheduleSave();
    }

    async function fileToDataUrl(file) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
    }

    async function canvasToJpegBlob(canvas, quality = 0.85) {
      return await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async function handleFile(file) {
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        if (input) input.value = '';
        return;
      }

      // Downscale + center-crop to 512x512 (small + predictable).
      const dataUrl = await fileToDataUrl(file);

      const img = new Image();
      img.onload = async () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          previewDataUrl = dataUrl;
          pendingUpload = { blob: file };
          previewUrl = '';
          render();
          scheduleSave();
          return;
        }

        // White background (so transparent PNGs do not print oddly)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

        let outPreview = dataUrl;
        try {
          outPreview = canvas.toDataURL('image/jpeg', 0.85);
        } catch (e) {
          // keep dataUrl
        }

        const blob = (await canvasToJpegBlob(canvas, 0.85)) || file;

        previewDataUrl = outPreview;
        previewUrl = '';
        pendingUpload = { blob };
        render();
        scheduleSave();
      };
      img.onerror = () => {
        // fallback
        previewDataUrl = dataUrl;
        previewUrl = '';
        pendingUpload = { blob: file };
        render();
        scheduleSave();
      };
      img.src = dataUrl;
    }

    if (box && input) {
      box.addEventListener('click', (e) => {
        // Ignore clicks on the clear button
        if (e && e.target && (e.target === clearBtn)) return;
        input.click();
      });
      box.addEventListener('keydown', (e) => {
        if (!e) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
    }

    if (input) {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        handleFile(file);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        clear();
      });
    }

    render();

    return {
      set,
      getState,
      clear,
      consumePendingUpload,
      consumePendingDelete,
    };
  }

  // ---------- Form persistence ----------
  function collectFields() {
    const fields = {};
    const elements = document.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((el) => {
      if (el.type === 'file') return;
      const key = el.name;
      if (!key) return;
      if (el.type === 'checkbox') {
        fields[key] = !!el.checked;
      } else {
        fields[key] = el.value ?? '';
      }
    });
    return fields;
  }

  function applyFields(fields) {
    if (!fields || typeof fields !== 'object') return;
    const elements = document.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((el) => {
      if (el.type === 'file') return;
      const key = el.name;
      if (!key) return;
      if (!(key in fields)) return;

      const val = fields[key];
      if (el.type === 'checkbox') {
        el.checked = !!val;
      } else {
        el.value = (val ?? '');
      }
    });
  }

  function collectState() {
    const allFields = collectFields();
    const canon = buildCanonicalFromForm(allFields);
    const sheetOnly = pickSheetOnlyFields(allFields);
    const rep = collectRepeatables();
    const portraitState = portraitApi?.getState ? portraitApi.getState() : { path: '', previewDataUrl: '' };

    return {
      version: 3,
      savedAt: new Date().toISOString(),
      canonical: {
        name: canon.name,
        level: canon.level,
        primaryAttribute: canon.primaryAttribute,
        classKey: canon.classKey,
        attributes: canon.attributes,
      },
      // local-only preview data is allowed here; NOT written to Firestore
      portrait: {
        path: sanitizeStoragePath(portraitState?.path || ''),
        previewDataUrl: String(portraitState?.previewDataUrl || ''),
      },
      fields: sheetOnly,
      repeatables: rep,
    };
  }

  function applyState(state) {
    if (!state || typeof state !== 'object') return;

    // We only accept v3 state (no legacy support).
    if (state.version !== 3) return;

    const canon = (state.canonical && typeof state.canonical === 'object') ? state.canonical : {};
    const level = clampLevel(canon?.level ?? 1);
    const primaryAttribute = coerceAttrKey(canon?.primaryAttribute);
    const classKey = sanitizeText(canon?.classKey, { maxLen: 64 });

    const attrs = normalizeAttributes(canon?.attributes || {});
    for (const k of ATTR_KEYS) {
      const cap = getAttributeEffectiveCap(level, k, primaryAttribute);
      const min = primaryAttribute && k === primaryAttribute ? 1 : 0;
      attrs[k] = toInt(attrs[k], { min, max: cap });
    }

    const mergedFields = {
      ...(state.fields && typeof state.fields === 'object' ? state.fields : {}),
      charName: sanitizeCharName(canon?.name || ''),
      classSelect: classKey,
      primaryAttribute: primaryAttribute,
      level: level,
    };

    for (const k of ATTR_KEYS) mergedFields[k] = attrs[k];

    // Ensure selects have options before applying field values.
    populatePrimaryAttributeSelect();

    // Apply fields first so classSelect is set from the stored canonical.
    applyFields(mergedFields);

    // Apply repeatables next.
    applyRepeatables(state.repeatables);

    // Theme must ALWAYS match the class dropdown value (derived; not saved).
    setTheme(classKey);
    if (classSelect) {
      // Ensure the dropdown eventually reflects the stored canonical value.
      classSelect.dataset.pendingValue = classKey || '';
      ensureClassSelectOptions();
    }

    // Portrait local preview restore (optional).
    if (portraitApi?.set && state.portrait && typeof state.portrait === 'object') {
      portraitApi.set({
        path: sanitizeStoragePath(state.portrait.path || ''),
        previewDataUrl: String(state.portrait.previewDataUrl || ''),
        previewUrl: '',
      });
    }

    // Derived fields are computed for display and not stored.
    updateDerivedDisplay(mergedFields);
  }


  function saveNow() {
    if (!storageOk) {
      setStatus('Storage unavailable', true);
      return;
    }

    try {
      const state = collectState();
      browserStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStatus(storageType === 'session' ? 'Saved (session)' : 'Saved');
    } catch (e) {
      storageOk = false;
      setStatus('Storage unavailable', true);
    }
  }

  
function scheduleSave() {
    const canLocal = storageOk;
    const canCloud = cloudEnabled();

    if (!canLocal && !canCloud) {
      setStatus('Storage unavailable', true);
      return;
    }

    setStatus('Saving…');

    // Local save debounce (if available)
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (storageOk) {
        try {
          const state = collectState();
          browserStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          setStatus(storageType === 'session' ? 'Saved (session)' : 'Saved');
        } catch (e) {
          storageOk = false;
          setStatus('Storage unavailable', true);
        }
      }
    }, SAVE_DEBOUNCE_MS);

    // Cloud save debounce (separate, slower to reduce write volume)
    if (canCloud) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(saveCloudNow, CLOUD_SAVE_DEBOUNCE_MS);
    }
  }

  function loadSaved() {
    if (!storageOk) {
      setStatus('Storage unavailable', true);
      return false;
    }

    try {
      const raw = browserStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state || state.version !== 3) return false;
      applyState(state);
      setStatus(storageType === 'session' ? 'Loaded (session)' : 'Loaded');
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSheet() {
    const ok = confirm('Clear all fields on this sheet? (This cannot be undone.)');
    if (!ok) return;

    const elements = document.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((el) => {
      if (el.type === 'file') {
        el.value = '';
        return;
      }
      if (el.type === 'checkbox') {
        el.checked = false;
        return;
      }
      if (el.tagName === 'SELECT') {
        // Most selects should clear to blank; rank dropdowns default to 0.
        if (el.querySelector('option[value="0"]')) {
          el.value = '0';
        } else {
          el.value = '';
        }
        return;
      }
      el.value = '';
    });

    setTheme('');
    if (classSelect) classSelect.value = '';

    if (portraitApi?.clear) portraitApi.clear({ silent: true });
    resetRepeatablesToDefaults();

    try {
      browserStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }

    setStatus('Cleared');
  }

  // ---------- Repeatable list utility (for Pass 2+) ----------
  const repeatableLists = {}; 
  
  // Normalize saved values for repeatable row fields so inputs never display "undefined" or "[object Object]".
  function normalizeRowValue(v) {
    if (v === null || typeof v === 'undefined') return '';
    if (typeof v === 'object') return '';
    return String(v);
  }
  
  // This is a lightweight helper around <template> cloning.
  function createRepeatableList({ container, templateId, addButton, onAdd }) {
    const tmpl = document.getElementById(templateId);
    if (!container || !tmpl) throw new Error('Repeatable list requires a container and a <template>.');

    function add(initialData) {
      const node = document.importNode(tmpl.content, true);
      const root = node.firstElementChild;
      if (!root) throw new Error('Template must have an element as its first child.');
      container.appendChild(node);
      if (typeof onAdd === 'function') onAdd(root, initialData);
      return root;
    }

    if (addButton) {
      addButton.addEventListener('click', () => add());
    }

    return { add };
  }


  // ---------- Repeatable lists (Pass 2) ----------
  function initRepeatableList({ key, containerId, templateId, addBtnId, fields, minRows }) {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);

    if (!container) return null;
    const tmpl = document.getElementById(templateId);
    if (!tmpl) {
      // Missing template should not disable the whole sheet.
      return null;
    }

    const list = createRepeatableList({
      container,
      templateId,
      addButton: null,
      onAdd: (root, initialData) => {
        const data = initialData || {};
        (fields || []).forEach((f) => {
          const el = root.querySelector(`[data-field="${f}"]`);
          if (!el) return;

          if (el.type === 'number') {
            el.value = (data[f] === 0 || data[f]) ? String(data[f]) : '';
          } else {
            el.value = normalizeRowValue(data[f]);
          }
        });

        const removeBtn = root.querySelector('[data-action="remove"]');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            root.remove();
            scheduleSave();
          });
        }
      }
    });

    function addRow(data) {
      return list.add(data);
    }

    function clear() {
      container.innerHTML = '';
    }

    function ensureMin() {
      const need = Number(minRows || 0);
      while (container.querySelectorAll('[data-repeatable-item]').length < need) {
        addRow();
      }
    }

    function read() {
      const items = [];
      const rows = container.querySelectorAll('[data-repeatable-item]');
      rows.forEach((row) => {
        const obj = {};
        let any = false;

        (fields || []).forEach((f) => {
          const el = row.querySelector(`[data-field="${f}"]`);
          if (!el) return;

          if (el.type === 'number') {
            const raw = String(el.value || '').trim();
            obj[f] = raw === '' ? '' : Number(raw);
          } else {
            obj[f] = String(el.value || '');
          }

          if (String(obj[f] || '').trim() !== '') any = true;
        });

        if (any) items.push(obj);
      });

      return items;
    }

    function load(items) {
      clear();
      (items || []).forEach((it) => addRow(it));
      ensureMin();
    }

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addRow();
        scheduleSave();
      });
    }

    const api = { key, container, addRow, clear, ensureMin, read, load };
    repeatableLists[key] = api;
    return api;
  }

  
  function populatePrimaryAttributeSelect() {
    const sel = document.getElementById('primaryAttribute');
    if (!sel) return;

    const current = coerceAttrKey(sel.value) || '';

    sel.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '';
    sel.appendChild(blank);

    for (const k of ATTR_KEYS) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = labelForAttrKey(k);
      sel.appendChild(opt);
    }

    if (current) sel.value = current;
  }

// ---------- Tooltips (short hover/focus explanations) ----------
  function applyTooltipText() {
    const setTipForNamedField = (name, text) => {
      const field = document.querySelector(`[name="${name}"]`);
      if (field) field.dataset.tip = text;

      // If the field is inside a label with a visible <span>, also tag that <span> so hovering the label works.
      const label = field ? field.closest('label') : null;
      const span = label ? label.querySelector('span') : null;
      if (span) span.dataset.tip = text;
    };

    const setTipById = (id, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.dataset.tip = text;
      // Make section headers focusable so keyboard users can discover tips too.
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    };

    // Section-level guidance
    setTipById('resources_title', 'Track your core resources (HP, Spirit, etc.). Speed is measured in squares.');
    setTipById('attributes_title', 'Enter your 6 attributes. Defenses on this sheet are derived from Defense Training + your best attribute in that category.');
    setTipById('skills_title', 'Set your training ranks (0–6). Defense Training is tracked here; the total defense values appear in Attributes & Defenses.');
    setTipById('keystones_title', 'Keystones are your core narrative hooks (Origin/Bond/Background). They can trigger bonuses, complications, or story beats.');
    setTipById('notes_title', 'Freeform notes for reminders, NPC names, plot threads, or rules clarifications.');

    // Field-level tips (Attributes)
    setTipForNamedField('strength', 'Strength increases HP Max: +Strength × (Level + 2). It can also be your base for Physical Defense (best of Strength/Agility).');
    setTipForNamedField('agility', 'Agility increases Speed: Speed = 4 + Agility (in squares). It can also be your base for Physical Defense (best of Strength/Agility).');
    setTipForNamedField('intellect', 'Intellect can be your base for Mental Defense (best of Intellect/Willpower).');
    setTipForNamedField('willpower', 'Willpower can be your base for Mental Defense (best of Intellect/Willpower).');
    setTipForNamedField('attunement', 'Attunement sets your starting Power Die value and can be your base for Spiritual Defense (best of Attunement/Heart).');
    setTipForNamedField('heart', 'Heart can be your base for Spiritual Defense (best of Attunement/Heart).');

    // Derived resources
    setTipForNamedField('hpmax', 'Enter your maximum HP.');
    setTipForNamedField('speed', 'Enter your Speed in squares.');

    // Defense training (Skills section)
    setTipForNamedField('rank_physdef', 'Physical Defense Training. Total Physical Defense = Training + max(Strength, Agility).');
    setTipForNamedField('rank_mentdef', 'Mental Defense Training. Total Mental Defense = Training + max(Intellect, Willpower).');
    setTipForNamedField('rank_spiritdef', 'Spiritual Defense Training. Total Spiritual Defense = Training + max(Attunement, Heart).');

    // Total defenses (Attributes section)
    setTipForNamedField('physdef', 'Total Physical Defense = Training + max(Strength, Agility).');
    setTipForNamedField('mentdef', 'Total Mental Defense = Training + max(Intellect, Willpower).');
    setTipForNamedField('spiritdef', 'Total Spiritual Defense = Training + max(Attunement, Heart).');

    // Table headers in Resources (make hover obvious)
    const resourceHeaders = document.querySelectorAll('#resources th');
    if (resourceHeaders && resourceHeaders.length >= 3) {
      resourceHeaders[0].dataset.tip = 'HP: Max is your total; Current is what you have left.';
      resourceHeaders[1].dataset.tip = 'Strain: track current strain; check Overstrained when you exceed your limit.';
      resourceHeaders[2].dataset.tip = 'Speed is in squares.';
    }
  }

  function initTooltips() {
    const tip = document.getElementById('gxTooltip');
    if (!tip) return;

    let activeEl = null;
    let hideTimer = null;

    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const hide = () => {
      clearHideTimer();
      if (activeEl) activeEl.removeAttribute('aria-describedby');
      activeEl = null;
      tip.dataset.show = '0';
      tip.setAttribute('aria-hidden', 'true');
    };

    const position = (x, y) => {
      const pad = 10;
      const dx = 12;
      const dy = 12;

      tip.style.left = `${x + dx}px`;
      tip.style.top = `${y + dy}px`;
      const r = tip.getBoundingClientRect();

      let left = x + dx;
      let top = y + dy;

      if (r.right > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - r.width - pad);
      if (r.bottom > window.innerHeight - pad) top = Math.max(pad, y - r.height - dy);

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };

    const show = (el, x, y) => {
      const text = (el && el.dataset) ? String(el.dataset.tip || '') : '';
      if (!text) return;

      if (activeEl && activeEl !== el) activeEl.removeAttribute('aria-describedby');
      activeEl = el;
      activeEl.setAttribute('aria-describedby', 'gxTooltip');

      tip.textContent = text;
      tip.dataset.show = '1';
      tip.setAttribute('aria-hidden', 'false');
      position(x, y);
    };

    // Mouse/pen hover
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) return;
      show(el, e.clientX, e.clientY);
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (!activeEl || e.pointerType === 'touch') return;
      position(e.clientX, e.clientY);
    }, true);

    document.addEventListener('pointerout', (e) => {
      if (!activeEl || e.pointerType === 'touch') return;
      const to = e.relatedTarget;
      if (to && activeEl.contains && activeEl.contains(to)) return;
      hide();
    }, true);

    // Keyboard focus
    document.addEventListener('focusin', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      show(el, rect.left + rect.width / 2, rect.bottom);
    }, true);

    document.addEventListener('focusout', () => hide(), true);

    // Touch: tap to show, auto-hide
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) return;

      // Toggle when tapping the same element
      if (activeEl === el) {
        hide();
        return;
      }

      const rect = el.getBoundingClientRect();
      show(el, rect.left + rect.width / 2, rect.bottom);
      clearHideTimer();
      hideTimer = setTimeout(hide, 3500);
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    }, true);
  }

  function collectRepeatables() {
    const out = {};
    Object.keys(repeatableLists).forEach((k) => {
      out[k] = repeatableLists[k].read();
    });
    return out;
  }

  function migrateKeystoneSingles(items) {
    const arr = Array.isArray(items) ? items : [];
    return arr.map((it) => {
      if (!it || typeof it !== 'object') return { text: '' };
      if ('text' in it) return { text: String(it.text || '') };
      const name = String(it.name || '').trim();
      const notes = String(it.notes || '').trim();
      const text = (name && notes) ? `${name}: ${notes}` : (name || notes || '');
      return { text };
    });
  }

  function applyRepeatables(repeatables) {
    const rep = (repeatables && typeof repeatables === 'object') ? { ...repeatables } : {};

    // Migration: older Pass 2 keystone rows used {name, notes}; single-field keystones now use {text}.
    if (rep.originKeystones) rep.originKeystones = migrateKeystoneSingles(rep.originKeystones);
    if (rep.backgroundKeystones) rep.backgroundKeystones = migrateKeystoneSingles(rep.backgroundKeystones);

    Object.keys(repeatableLists).forEach((k) => {
      repeatableLists[k].load(rep[k]);
    });
  }

  function resetRepeatablesToDefaults() {
    // Keystones: 1 blank each
    if (repeatableLists.originKeystones) repeatableLists.originKeystones.load([]);
    if (repeatableLists.bondKeystones) repeatableLists.bondKeystones.load([]);
    if (repeatableLists.backgroundKeystones) repeatableLists.backgroundKeystones.load([]);

    // Skills: 2 blank combat/class entries, 5 setting entries
    if (repeatableLists.combatSkillsExtra) repeatableLists.combatSkillsExtra.load([]);
    if (repeatableLists.settingSkills) repeatableLists.settingSkills.load([]);

    // Techniques: none by default
    if (repeatableLists.techniques) repeatableLists.techniques.load([]);

    // Abilities: 3 blank cards
    if (repeatableLists.abilities) repeatableLists.abilities.load([]);
  }

  // ---------- Wire up events ----------
  portraitApi = initPortrait(scheduleSave);

  // Initialize Pass 2 repeatable sections
  initRepeatableList({ key: 'originKeystones', containerId: 'originKeystoneBody', templateId: 'keystoneSingleRowTemplate', addBtnId: 'addOriginKeystoneBtn', fields: ['text'], minRows: 1 });
  initRepeatableList({ key: 'bondKeystones', containerId: 'bondKeystoneBody', templateId: 'bondKeystoneRowTemplate', addBtnId: 'addBondKeystoneBtn', fields: ['name','rank','notes'], minRows: 1 });
  initRepeatableList({ key: 'backgroundKeystones', containerId: 'backgroundKeystoneBody', templateId: 'keystoneSingleRowTemplate', addBtnId: 'addBackgroundKeystoneBtn', fields: ['text'], minRows: 1 });

  initRepeatableList({ key: 'combatSkillsExtra', containerId: 'combatSkillGrid', templateId: 'skillChipTemplate', addBtnId: 'addCombatSkillBtn', fields: ['skill','rank'], minRows: 2 });
  initRepeatableList({ key: 'settingSkills', containerId: 'settingSkillGrid', templateId: 'skillChipTemplate', addBtnId: 'addSettingSkillBtn', fields: ['skill','rank'], minRows: 5 });

    initRepeatableList({ key: 'techniques', containerId: 'techniqueCards', templateId: 'techniqueCardTemplate', addBtnId: 'addTechniqueBtn', fields: ['name','actions','energy','text'], minRows: 0 });

initRepeatableList({ key: 'abilities', containerId: 'abilityCards', templateId: 'abilityCardTemplate', addBtnId: 'addAbilityBtn', fields: ['name','text'], minRows: 3 });


  
  // Initialize Pass 3 repeatable sections
  initRepeatableList({ key: 'conditions', containerId: 'conditionsList', templateId: 'conditionRowTemplate', addBtnId: 'addConditionBtn', fields: ['name','n','notes'], minRows: 1 });
  initRepeatableList({ key: 'weapons', containerId: 'weaponsList', templateId: 'weaponRowTemplate', addBtnId: 'addWeaponBtn', fields: ['name','skill','notes'], minRows: 1 });
if (classSelect) {
    classSelect.addEventListener('change', (e) => {
      setTheme(e.target.value);
      updateDerivedDisplay();
      scheduleSave();
    });
  }

  if (sheetEl) {
    sheetEl.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') return;
      updateDerivedDisplay();
      scheduleSave();
    }, true);

    sheetEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') return;
      updateDerivedDisplay();
      scheduleSave();
    }, true);
  }

  if (clearBtn) clearBtn.addEventListener('click', clearSheet);

  // Expose a tiny debug API (optional)
  window.GameXSheet = {
    collectState,
    applyState,
    createRepeatableList
  };

  // Initialize tooltip text + behavior
  applyTooltipText();
  initTooltips();

  // Populate dropdown options (no class data duplicated in HTML)
  populatePrimaryAttributeSelect();
  ensureClassSelectOptions();

  // Initialize Firebase Auth (cloud sync)
  initAuth();


  // Load saved state on open
  const loaded = loadSaved();
  if (!loaded) {
    resetRepeatablesToDefaults();
  }

  // If storage is unavailable (common for some file: setups), make that obvious.
  if (!storageOk) {
    setStatus('Storage unavailable', true);
  }
})();
