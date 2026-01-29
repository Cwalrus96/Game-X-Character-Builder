import {
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { auth, db, googleProvider, isMobileLike } from "./firebase.js";

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

  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const authUserLabel = document.getElementById('authUserLabel');
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

  function updateAuthUi() {
    const email = currentUser?.email || currentUser?.displayName || '';
    if (authUserLabel) {
      authUserLabel.textContent = currentUser ? `Signed in${email ? ': ' + email : ''}` : 'Signed out';
    }
    if (signInBtn) signInBtn.style.display = currentUser ? 'none' : 'inline-block';
    if (signOutBtn) signOutBtn.style.display = currentUser ? 'inline-block' : 'none';
  }

  function cloudEnabled() {
    return !!(currentUser && cloudDocRef && cloudReady);
  }

  function sanitizeStateForCloud(state) {
    // Firestore doc size limit is finite; don't store huge data: URLs in Firestore.
    const cloned = JSON.parse(JSON.stringify(state || {}));
    if (cloned?.portrait && typeof cloned.portrait === 'string' && cloned.portrait.startsWith('data:image')) {
      cloned.portrait = '';
    }
    return cloned;
  }

  async function loadCloudOrInit() {
    if (!cloudDocRef) return;
    setCloudStatus('Cloud: Loading…');

    try {
      const snap = await getDoc(cloudDocRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        if (data.sheet) {
          applyState(data.sheet);
          setStatus('Loaded from cloud');
        }
        cloudReady = true;
        setCloudStatus('Cloud: Ready');
        return;
      }

      // No cloud doc yet → initialize from current sheet (local/default state)
      const state = collectState();
      const sheetForCloud = sanitizeStateForCloud(state);

      await setDoc(cloudDocRef, {
        ownerUid: editingUid,
        name: (sheetForCloud.fields && sheetForCloud.fields.charName) ? String(sheetForCloud.fields.charName) : 'Character',
        sheet: sheetForCloud,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      cloudReady = true;
      setCloudStatus('Cloud: Ready');
      setStatus('Cloud initialized');
    } catch (e) {
      cloudReady = false;
      setCloudStatus('Cloud: Error', true);
    }
  }

  async function saveCloudNow() {
    if (!cloudEnabled()) return;

    try {
      const state = collectState();
      const sheetForCloud = sanitizeStateForCloud(state);

      await setDoc(cloudDocRef, {
        ownerUid: editingUid,
        name: (sheetForCloud.fields && sheetForCloud.fields.charName) ? String(sheetForCloud.fields.charName) : 'Character',
        sheet: sheetForCloud,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setCloudStatus('Cloud: Saved');
    } catch (e) {
      setCloudStatus('Cloud: Save failed', true);
    }
  }
  
  async function initAuth() {
    // Handle redirect result (no-op if not coming back from a redirect)
    try {
		await getRedirectResult(auth);
	} catch (e) {
	  console.error("getRedirectResult error:", e);
	  setCloudStatus(`Cloud: ${e.code || "auth error"}`, true);
	}

    if (signInBtn) {
      signInBtn.addEventListener('click', async () => {
        setCloudStatus('Cloud: Signing in…');
      
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
          await signInWithRedirect(auth, googleProvider);
        }
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        await signOut(auth);
      });
    }

    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      cloudDocRef = null;
      cloudReady = false;
      updateAuthUi();

      if (!user) {
        setCloudStatus('Cloud: Off');
        // Require auth for editing (D&D Beyond-style flow)
        const next = encodeURIComponent(window.location.href);
        window.location.href = `login.html?next=${next}`;
        return;
      }

      // Read custom claims (GM) and resolve which user's character doc we are editing.
      try {
        // Force refresh so a newly-set GM claim is picked up immediately.
        await user.getIdToken(true);
        const tokenResult = await user.getIdTokenResult();
        isGMUser = !!tokenResult?.claims?.gm;
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
      const finalKey = `gameX_characterSheet_v2_${editingUid}_${editingCharId}`;
      if (storageOk && storage) {
        try {
          const hasFinal = !!storage.getItem(finalKey);
          const provisionalRaw = storage.getItem(STORAGE_KEY);
          if (!hasFinal && provisionalRaw) {
            storage.setItem(finalKey, provisionalRaw);
          }
          STORAGE_KEY = finalKey;
          // Prefer the final key if it exists.
          loadSaved();
        } catch (e) {
          // ignore
        }
      }

      await loadCloudOrInit();
    });
  }

  // Storage key is per-character (and per effective user when known)
  let STORAGE_KEY = `gameX_characterSheet_v2_${editingCharId}`;
  const LEGACY_PORTRAIT_KEY = 'gameX_portrait';
  const SAVE_DEBOUNCE_MS = 400;

  const sheetEl = document.getElementById('sheet');
  const classSelect = document.getElementById('classSelect');
  const saveStatusEl = document.getElementById('saveStatus');

  const exportBtn = document.getElementById('exportJsonBtn');
  const importBtn = document.getElementById('importJsonBtn');
  const clearBtn = document.getElementById('clearSheetBtn');
  const importFile = document.getElementById('importJsonFile');

  // Placeholder; initialized after scheduleSave is defined
  let portraitApi = { get: () => '', set: () => {} };

  function setTheme(theme) {
    const t = (theme === 'technologist') ? 'mechpilot' : (theme || 'na');
    document.body.setAttribute('data-theme', t);
  }

  function getTheme() {
    return document.body.getAttribute('data-theme') || 'na';
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
  const storage = (typeof localStorage !== 'undefined' && canUseStorage(localStorage)) ? localStorage
                : (typeof sessionStorage !== 'undefined' && canUseStorage(sessionStorage)) ? sessionStorage
                : null;

  const storageType = (!storage) ? 'none' : (storage === localStorage ? 'local' : 'session');

  let storageOk = !!storage;
  let saveTimer = null;

  // ---------- Portrait module ----------
  function initPortrait(scheduleSave) {
    const box = document.querySelector('.portrait-box');
    const input = document.getElementById('portraitUpload');
    const preview = document.getElementById('portraitPreview');
    const placeholder = document.getElementById('portraitPlaceholder');
    const clearBtn = document.getElementById('portraitClear');

    let portraitDataUrl = '';

    function render() {
      if (portraitDataUrl) {
        preview.src = portraitDataUrl;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        clearBtn.style.display = 'block';
      } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
        placeholder.style.display = 'block';
        clearBtn.style.display = 'none';
      }
    }

    function set(dataUrl) {
      portraitDataUrl = (typeof dataUrl === 'string') ? dataUrl : '';
      render();
    }

    function get() {
      return portraitDataUrl || '';
    }

    if (box && input) {
      box.addEventListener('click', (e) => {
        if (e.target === clearBtn) return;
        input.click();
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (input) input.value = '';
        set('');
        scheduleSave();
      });
    }

    if (input) {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
          alert('Please choose an image file.');
          input.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;

          // Downscale + center-crop to a 512x512 JPEG for smaller saves/prints.
          const img = new Image();
          img.onload = () => {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            // White background (so transparent PNGs do not print oddly)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);

            const s = Math.min(img.width, img.height);
            const sx = (img.width - s) / 2;
            const sy = (img.height - s) / 2;
            ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

            let out = dataUrl;
            try {
              out = canvas.toDataURL('image/jpeg', 0.85);
            } catch (err) {
              // Keep original data URL if conversion fails
            }

            set(out);
            scheduleSave();
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    }

    // Legacy compatibility (older versions stored portrait separately)
    try {
      const legacy = localStorage.getItem(LEGACY_PORTRAIT_KEY);
      if (legacy) set(legacy);
    } catch (e) {
      // ignore
    }

    render();

    return { set, get };
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
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      theme: getTheme(),
      portrait: portraitApi.get(),
      fields: collectFields(),
      repeatables: collectRepeatables()
    };
  }

  function applyState(state) {
    if (!state || typeof state !== 'object') return;

    const themeRaw = state.theme || 'na';
    const theme = (themeRaw === 'technologist') ? 'mechpilot' : themeRaw;
    setTheme(theme);
    if (classSelect) classSelect.value = theme;

    applyFields(state.fields);

    applyRepeatables(state.repeatables);

    if (typeof state.portrait === 'string') {
      portraitApi.set(state.portrait);
    }
  }

  function saveNow() {
    if (!storageOk) {
      setStatus('Storage unavailable — use Export/Import', true);
      return;
    }

    try {
      const state = collectState();
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStatus(storageType === 'session' ? 'Saved (session)' : 'Saved');
    } catch (e) {
      storageOk = false;
      setStatus('Storage unavailable — use Export/Import', true);
    }
  }

  
function scheduleSave() {
    const canLocal = storageOk;
    const canCloud = cloudEnabled();

    if (!canLocal && !canCloud) {
      setStatus('Storage unavailable — use Export/Import', true);
      return;
    }

    setStatus('Saving…');

    // Local save debounce (if available)
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (storageOk) {
        try {
          const state = collectState();
          storage.setItem(STORAGE_KEY, JSON.stringify(state));
          setStatus(storageType === 'session' ? 'Saved (session)' : 'Saved');
        } catch (e) {
          storageOk = false;
          setStatus('Storage unavailable — use Export/Import', true);
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
      setStatus('Storage unavailable — use Export/Import', true);
      return false;
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      applyState(state);
      setStatus(storageType === 'session' ? 'Loaded (session)' : 'Loaded');
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Export / Import ----------
  function safeFilename(s) {
    const cleaned = String(s || '').trim().replace(/[^a-z0-9 _-]+/gi, '').replace(/\s+/g, ' ');
    return cleaned.trim().replace(/ /g, '_') || 'Character';
  }

  function exportJson() {
    const state = collectState();
    const json = JSON.stringify(state, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const charNameEl = document.querySelector('input[name="charName"]');
    const filename = `GameX_${safeFilename(charNameEl ? charNameEl.value : '')}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Release object URL to avoid memory leaks.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('Exported');
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state = JSON.parse(String(reader.result || ''));
        applyState(state);
        updatePrimaryAttributeOptions();
        recomputeDerived();
        scheduleSave();
        setStatus('Imported');
      } catch (e) {
        alert('Could not import: invalid JSON.');
        setStatus('Import failed', true);
      }
    };
    reader.onerror = () => {
      alert('Could not read file.');
      setStatus('Import failed', true);
    };
    reader.readAsText(file);
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
        // Prefer 'na' for theme/class select; otherwise fall back safely for rank dropdowns.
        if (el.querySelector('option[value="na"]')) {
          el.value = 'na';
        } else if (el.querySelector('option[value="0"]')) {
          el.value = '0';
        } else {
          el.selectedIndex = 0;
        }
        return;
      }
      el.value = '';
    });

    setTheme('na');
    if (classSelect) classSelect.value = 'na';

    portraitApi.set('');
    resetRepeatablesToDefaults();

    try {
      storage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_PORTRAIT_KEY);
    } catch (e) {
      // ignore
    }

    setStatus('Cleared');
  }

  // ---------- Repeatable list utility (for Pass 2+) ----------
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
  const ALL_ATTRIBUTES = [
    { key: 'strength', label: 'Strength' },
    { key: 'agility', label: 'Agility' },
    { key: 'intellect', label: 'Intellect' },
    { key: 'willpower', label: 'Willpower' },
    { key: 'heart', label: 'Heart' },
    { key: 'attunement', label: 'Attunement' }
  ];

  const HP_PROGRESSION = {
    low: { base: 40, per: 8 },
    medium: { base: 50, per: 10 },
    high: { base: 60, per: 12 }
  };

  // NOTE: Only classes with fully-defined progressions are included for skill/defense autofill.
  // Psychic/Elementalist/Mech Pilot are included for HP only (per your guidance).
  const CLASS_CONFIG = {
    ninja: {
      hp: 'medium',
      primary: ['agility', 'intellect'],
      defenses: { rank_mentdef: 'fast', rank_spiritdef: 'medium', rank_physdef: 'slow' },
      skills: { 'Ninjutsu': 'fast' }
    },
    magicalguardian: {
      hp: 'low',
      primary: ['attunement', 'heart'],
      defenses: { rank_mentdef: 'medium', rank_spiritdef: 'fast', rank_physdef: 'slow' },
      skills: { 'Spellcasting': 'fast' }
    },
    monstertamer: {
      hp: 'medium',
      primary: ['willpower', 'heart'],
      defenses: { rank_mentdef: 'fast', rank_spiritdef: 'medium', rank_physdef: 'slow' },
      skills: { 'Monster Taming': 'fast' }
    },
    spiritwarrior: {
      hp: 'high',
      primary: ['strength', 'agility'],
      defenses: { rank_mentdef: 'slow', rank_spiritdef: 'medium', rank_physdef: 'fast' },
      skills: { 'Martial Arts': 'fast' }
    },
    weaponmaster: {
      hp: 'high',
      primary: ['strength', 'agility'],
      defenses: { rank_mentdef: 'medium', rank_spiritdef: 'slow', rank_physdef: 'fast' },
      skills: {
        'Melee Weapons': (primary) => (primary === 'strength' ? 'fast' : 'medium'),
        'Targeting': (primary) => (primary === 'strength' ? 'medium' : 'fast')
      }
    },
    henshinhero: {
      hp: 'high',
      primary: ['strength', 'heart'],
      defenses: { rank_mentdef: 'slow', rank_spiritdef: 'medium', rank_physdef: 'fast' },
      skills: { 'Henshin Arts': 'fast' }
    },
    metamorph: {
      hp: 'high',
      primary: ['strength', 'willpower'],
      defenses: { rank_mentdef: 'medium', rank_spiritdef: 'slow', rank_physdef: 'fast' },
      skills: { 'Metamorphosis': 'fast' }
    },

    // HP-only (for now)
    psychic: { hp: 'low' },       // per your instruction: treat as low (no overrides)
    elementalist: { hp: 'low' },  // per your instruction
    mechpilot: { hp: 'low' },     // per your instruction
    technologist: { hp: 'low' }   // legacy alias
  };

  function getClassConfig(cls) {
    const key = (cls === 'technologist') ? 'mechpilot' : cls;
    return CLASS_CONFIG[key] || CLASS_CONFIG[cls] || null;
  }

  const repeatableLists = {};

  function normalizeRowValue(v) {
    return (v == null) ? '' : String(v);
  }

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

  
  function softSetValue(el, value) {
    if (!el) return;
    const v = (value == null) ? '' : String(value);
    if (el.value === '' || el.dataset.autofilled === '1') {
      el.value = v;
      el.dataset.autofilled = '1';
    }
  }

  function softSetNumberInputByName(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    const v = Number.isFinite(value) ? String(value) : '';
    if (el.value === '' || el.dataset.autofilled === '1') {
      el.value = v;
      el.dataset.autofilled = '1';
    }
  }

  function numFromInputByName(name) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return NaN;
    const n = parseInt(String(el.value || ''), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  function rankForProgression(prog, level) {
    if (!prog || !Number.isFinite(level) || level < 1) return NaN;
    const p = String(prog).toLowerCase();
    const t = {
      fast:   [3, 5, 7, 9, 11],
      medium: [4, 7, 9, 11],
      slow:   [3, 6, 9, 11]
    }[p];
    if (!t) return NaN;

    let rank = (p === 'slow') ? 0 : 1;
    for (const th of t) if (level >= th) rank += 1;
    return Math.max(0, Math.min(6, rank));
  }

  function updatePrimaryAttributeOptions() {
    const sel = document.getElementById('primaryAttribute');
    if (!sel) return;

    const cls = (classSelect && classSelect.value) ? String(classSelect.value) : 'na';
    const cfg = getClassConfig(cls);
    const allowed = (cfg && Array.isArray(cfg.primary) && cfg.primary.length) ? cfg.primary : null;

    const options = allowed
      ? ALL_ATTRIBUTES.filter(a => allowed.includes(a.key))
      : ALL_ATTRIBUTES.slice();

    const current = String(sel.value || '');
    const html = ['<option value=""></option>'].concat(options.map(o => `<option value="${o.key}">${o.label}</option>`)).join('');
    sel.innerHTML = html;

    // Keep current if still valid; otherwise default to the first allowed option (softly).
    if (current && options.some(o => o.key === current)) {
      sel.value = current;
    } else if (options[0]) {
      softSetValue(sel, options[0].key);
    } else {
      softSetValue(sel, '');
    }
  }

  function ensureBaselineSkillsAndDefenses() {
    const cls = (classSelect && classSelect.value) ? String(classSelect.value) : 'na';
    const cfg = getClassConfig(cls);
    if (!cfg) return;

    const lvl = numFromInputByName('level');
    if (!Number.isFinite(lvl) || lvl < 1) return;

    // Defenses (training ranks stored in the Skills section)
    if (cfg.defenses) {
      Object.keys(cfg.defenses).forEach((defName) => {
        const prog = cfg.defenses[defName];
        const r = rankForProgression(prog, lvl);
        if (Number.isFinite(r)) softSetNumberInputByName(defName, r);
      });
    }

    // Class combat skill(s) (stored in the Combat & Class Skills repeatable list)
    const list = repeatableLists.combatSkillsExtra;
    if (!list || !cfg.skills) return;

    const primary = String((document.getElementById('primaryAttribute') || {}).value || '');
    const required = Object.keys(cfg.skills);

    // Build an index of existing rows by normalized skill name
    const rows = Array.from(list.container.querySelectorAll('[data-repeatable-item]'));
    const byName = new Map();
    rows.forEach((row) => {
      const nameEl = row.querySelector('[data-field="skill"]');
      const key = nameEl ? String(nameEl.value || '').trim().toLowerCase() : '';
      if (key) byName.set(key, row);
    });

    required.forEach((skillName) => {
      const key = String(skillName).trim().toLowerCase();
      if (!key) return;

      let row = byName.get(key);
      if (!row) {
        row = list.addRow({ skill: skillName, rank: '' });
        byName.set(key, row);
      }

      const progOrFn = cfg.skills[skillName];
      const prog = (typeof progOrFn === 'function') ? progOrFn(primary) : progOrFn;
      const r = rankForProgression(prog, lvl);

      const rankEl = row.querySelector('[data-field="rank"]');
      if (rankEl && Number.isFinite(r)) softSetValue(rankEl, String(r));
    });
  }


  function forceSetNumberInputByName(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    const v = Number.isFinite(value) ? String(value) : '';
    el.value = v;
    el.dataset.autofilled = '1';
  }

  function recomputeDefenses() {
    // Total Defense = Training Rank + best attribute in that category.
    // If your rules use different base stats, edit the base calculations here.
    const str = numFromInputByName('strength');
    const agi = numFromInputByName('agility');
    const intel = numFromInputByName('intellect');
    const will = numFromInputByName('willpower');
    const att = numFromInputByName('attunement');
    const hrt = numFromInputByName('heart');

    const physTraining = numFromInputByName('rank_physdef');
    const mentTraining = numFromInputByName('rank_mentdef');
    const spiritTraining = numFromInputByName('rank_spiritdef');

    const physBase = Math.max(Number.isFinite(str) ? str : 0, Number.isFinite(agi) ? agi : 0);
    const mentBase = Math.max(Number.isFinite(intel) ? intel : 0, Number.isFinite(will) ? will : 0);
    const spiritBase = Math.max(Number.isFinite(att) ? att : 0, Number.isFinite(hrt) ? hrt : 0);

    const totalPhys = physBase + (Number.isFinite(physTraining) ? physTraining : 0);
    const totalMent = mentBase + (Number.isFinite(mentTraining) ? mentTraining : 0);
    const totalSpirit = spiritBase + (Number.isFinite(spiritTraining) ? spiritTraining : 0);

    forceSetNumberInputByName('physdef', totalPhys);
    forceSetNumberInputByName('mentdef', totalMent);
    forceSetNumberInputByName('spiritdef', totalSpirit);
  }

  function recomputeSpeed() {
    const agi = numFromInputByName('agility');
    if (!Number.isFinite(agi)) return;
    softSetNumberInputByName('speed', 4 + agi);
  }

  function recomputeHPMax() {
    const cls = (classSelect && classSelect.value) ? String(classSelect.value) : 'na';
    const cfg = getClassConfig(cls);
    if (!cfg || !cfg.hp) return;

    const lvl = numFromInputByName('level');
    const str = numFromInputByName('strength');
    if (!Number.isFinite(lvl) || lvl < 1 || !Number.isFinite(str)) return;

    const model = HP_PROGRESSION[cfg.hp];
    if (!model) return;

    // HP = BASE(L1) + (PER_LEVEL * (level-1)) + (Strength * (level + 2))
    const hpMax = Math.round(model.base + (model.per * (lvl - 1)) + (str * (lvl + 2)));
    softSetNumberInputByName('hpmax', hpMax);
  }

  function recomputeDerived() {
    recomputeSpeed();
    recomputeHPMax();
    ensureBaselineSkillsAndDefenses();
    recomputeDefenses();
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
    setTipById('resources_title', 'Track your core resources. HP Max is calculated from Class + Level + Strength; Speed is 4 + Agility (in squares).');
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
    setTipForNamedField('hpmax', 'HP Max = Base (by Class) + Per-Level (by Class) × (Level − 1) + Strength × (Level + 2).');
    setTipForNamedField('speed', 'Speed = 4 + Agility (in squares).');

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
      resourceHeaders[0].dataset.tip = 'HP: Max is calculated; Current is what you have left.';
      resourceHeaders[1].dataset.tip = 'Strain: track current strain; check Overstrained when you exceed your limit.';
      resourceHeaders[2].dataset.tip = 'Speed is in squares and is calculated from Agility.';
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

    // Add class skill row if missing
    updatePrimaryAttributeOptions();
        recomputeDerived();
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

    updatePrimaryAttributeOptions();
        recomputeDerived();
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
      updatePrimaryAttributeOptions();
        recomputeDerived();
      scheduleSave();
    });
  }

  if (sheetEl) {
    sheetEl.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') return;

      // If user types into an autofilled field, stop overwriting it.
      if (t && t.dataset && t.dataset.autofilled === '1') {
        delete t.dataset.autofilled;
      }

      const n = (t && t.name) ? String(t.name) : '';
      if (
        n === 'strength' || n === 'agility' || n === 'intellect' || n === 'willpower' ||
        n === 'attunement' || n === 'heart' || n === 'level' || n === 'primaryAttribute' ||
        n === 'rank_physdef' || n === 'rank_mentdef' || n === 'rank_spiritdef'
      ) {
        recomputeDerived();
      }

      scheduleSave();
    }, true);

    sheetEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') return;

      if (t && t.dataset && t.dataset.autofilled === '1') {
        delete t.dataset.autofilled;
      }

      const n = (t && t.name) ? String(t.name) : '';
      if (
        n === 'strength' || n === 'agility' || n === 'intellect' || n === 'willpower' ||
        n === 'attunement' || n === 'heart' || n === 'level' || n === 'primaryAttribute' ||
        n === 'rank_physdef' || n === 'rank_mentdef' || n === 'rank_spiritdef'
      ) {
        recomputeDerived();
      }

      scheduleSave();
    }, true);
  }

  if (exportBtn) exportBtn.addEventListener('click', exportJson);

  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      importJsonFile(file);
      importFile.value = '';
    });
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

  // Initialize Firebase Auth (cloud sync)
  initAuth();


  // Load saved state on open
  const loaded = loadSaved();
  if (!loaded) {
    resetRepeatablesToDefaults();
  }

  // If storage is unavailable (common for some file: setups), make that obvious.
  if (!storageOk) {
    setStatus('Storage unavailable — use Export/Import', true);
  }
})();
