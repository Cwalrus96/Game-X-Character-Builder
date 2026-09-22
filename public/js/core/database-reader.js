// public/database-reader.js
//
// Definitive entry point for reading Character documents from Firestore.
// Historical formats are decoded only through CharacterMigrations. The legacy
// normalizer at the bottom remains temporarily for pages that cannot consume canonical
// until the stable-key game-data release is available.

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "../../vendor/firebase/firebase-firestore.js";

import { loadGameXData } from "./game-data.js";
import { createCharacterMigrationReferences } from "./character-migrations.js?v=wpe6";
import {
  CharacterPersistenceError,
  decodeStoredCharacter,
  requireCharacterIdentity,
} from "./character-persistence.js?v=wpe6";

import {
  sanitizeText,
  sanitizeCharName,
  sanitizeStoragePath,
  sanitizeStringArray,
  sanitizeRepeatableAbilities,
  sanitizeBondList,
  sanitizeKeystoneList,
  sanitizeWeaponList,
  sanitizeGrantChoices,
  toInt,
} from "./data-sanitization.js";

import {
  ATTR_KEYS,
  clampLevel,
  coerceAttrKey,
  normalizeAttributes,
  getAttributeEffectiveCap,
} from "./character-rules.js";

import { CHARACTER_SCHEMA_VERSION } from "./database-writer.js";

const DEFAULT_FIRESTORE_API = Object.freeze({
  collection,
  doc,
  getDoc,
  onSnapshot,
});

async function resolveMigrationReferences({ references, gameData } = {}) {
  if (references) return references;
  const source = gameData || await loadGameXData();
  return createCharacterMigrationReferences(source);
}

async function resolveFirestore(firestore) {
  if (firestore) return firestore;
  return (await import("./firebase.js")).db;
}

function decodeSnapshot(snapshot, { ownerUid, references }) {
  if (!snapshot.exists()) {
    throw new CharacterPersistenceError(
      "character-not-found",
      `Character ${snapshot.id || "document"} does not exist.`,
    );
  }
  const decoded = decodeStoredCharacter(snapshot.data(), {
    references,
    expectedOwnerUid: ownerUid,
  });
  if (!decoded.ok) {
    const rebuild = decoded.diagnostics.find((item) => item.code === "character-rebuild-required");
    throw new CharacterPersistenceError(
      rebuild?.code || "character-read-invalid",
      rebuild?.message || `Character ${snapshot.id} could not be decoded as a canonical character.`,
      { diagnostics: decoded.diagnostics },
    );
  }
  return Object.freeze({
    characterId: snapshot.id,
    ownerUid,
    character: decoded.character,
    metadata: decoded.metadata,
    revision: decoded.revision,
    migrated: decoded.migrated,
    migration: decoded.migration,
  });
}

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Read one character as exact canonical state plus separate metadata.
 * This function never writes, including when a historical document migrates.
 */
export async function readCharacter({
  ownerUid,
  characterId,
  references = null,
  gameData = null,
  firestore = null,
  firestoreApi = DEFAULT_FIRESTORE_API,
} = {}) {
  const uid = requireCharacterIdentity(ownerUid, "ownerUid");
  const id = requireCharacterIdentity(characterId, "characterId");
  const resolvedReferences = await resolveMigrationReferences({ references, gameData });
  const resolvedFirestore = await resolveFirestore(firestore);
  const snapshot = await firestoreApi.getDoc(
    firestoreApi.doc(resolvedFirestore, "users", uid, "characters", id),
  );
  return decodeSnapshot(snapshot, { ownerUid: uid, references: resolvedReferences });
}

/**
 * Subscribe to a user's characters. Invalid documents are reported separately
 * instead of being silently coerced into application state.
 */
export async function observeCharacters({
  ownerUid,
  references = null,
  gameData = null,
  onChange,
  onError,
  firestore = null,
  firestoreApi = DEFAULT_FIRESTORE_API,
} = {}) {
  const uid = requireCharacterIdentity(ownerUid, "ownerUid");
  if (typeof onChange !== "function") {
    throw new CharacterPersistenceError("invalid-character-observer", "onChange must be a function.");
  }
  const resolvedReferences = await resolveMigrationReferences({ references, gameData });
  const resolvedFirestore = await resolveFirestore(firestore);
  const charactersCollection = firestoreApi.collection(
    resolvedFirestore,
    "users",
    uid,
    "characters",
  );
  return firestoreApi.onSnapshot(charactersCollection, (querySnapshot) => {
    const characters = [];
    const invalid = [];
    for (const snapshot of querySnapshot.docs) {
      try {
        characters.push(decodeSnapshot(snapshot, { ownerUid: uid, references: resolvedReferences }));
      } catch (error) {
        invalid.push(Object.freeze({
          characterId: snapshot.id,
          error,
        }));
      }
    }
    characters.sort((left, right) => (
      timestampMillis(right.metadata.updatedAt) - timestampMillis(left.metadata.updatedAt)
      || left.characterId.localeCompare(right.characterId)
    ));
    onChange(Object.freeze({
      characters: Object.freeze(characters),
      invalid: Object.freeze(invalid),
    }));
  }, onError);
}

/**
 * Construct a canonical default character doc.
 * Transitional v4 helper. New persistence code must use createCharacter().
 */
export function createDefaultCharacterDoc({ ownerUid } = {}) {
  const uid = sanitizeText(ownerUid, { maxLen: 128, collapse: true });

  const attrs = {};
  for (const k of ATTR_KEYS) attrs[k] = 0;

  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    ownerUid: uid,
    builder: {
      name: "",
      portraitPath: "",

      level: 1,
      classKey: "",
      primaryAttribute: "",
      attributes: attrs,
      originKey: "",
      originKeystone: "",

      selectedClassFeatureOptions: [],
      selectedClassUtilitySkills: [],
      selectedFeats: [],
      selectedFeatOptions: [],
      autoAbilityNames: [],
      grantedCoreSkillSnapshot: [],
      grantedSkillSnapshot: [],
      bonds: [],
      backgroundKeystones: [],
      weapons: [],
      grantChoices: {},

      visitedSteps: [],
      lastVisitedAt: null,

      // Stock techniques are refs stored here.
      selectedTechniques: [],

      sheet: {
        fields: {},
        repeatables: {},
      },
    },
  };
}

/**
 * Transitional v4 normalizer for currently deployed pages. It is not a
 * persistence boundary and must not be used by new code.
 */
export function normalizeCharacterDoc(raw) {
  const src = (raw && typeof raw === "object") ? raw : {};

  const base = createDefaultCharacterDoc({ ownerUid: src.ownerUid || "" });

  const b = (src.builder && typeof src.builder === "object") ? src.builder : {};

  const level = clampLevel(b.level ?? 1);
  const primary = coerceAttrKey(b.primaryAttribute);

  // Effective attrs are stored; clamp them to caps + mins.
  const attrs = normalizeAttributes(b.attributes || {});
  for (const k of ATTR_KEYS) {
    const cap = getAttributeEffectiveCap(level, k, primary);
    const min = primary && k === primary ? 1 : 0;
    attrs[k] = toInt(attrs[k], { min, max: cap });
  }

  const sheetSrc = (b.sheet && typeof b.sheet === "object") ? b.sheet : {};
  const sheetFields = (sheetSrc.fields && typeof sheetSrc.fields === "object") ? { ...sheetSrc.fields } : {};
  const sheetRepeatables = (sheetSrc.repeatables && typeof sheetSrc.repeatables === "object") ? { ...sheetSrc.repeatables } : {};

  // Normalize repeatables we currently care about.
  if (Object.prototype.hasOwnProperty.call(sheetRepeatables, "abilities")) {
    sheetRepeatables.abilities = sanitizeRepeatableAbilities(sheetRepeatables.abilities);
  }

  return {
    createdAt: src.createdAt ?? null,
    updatedAt: src.updatedAt ?? null,

    schemaVersion: toInt(src.schemaVersion ?? base.schemaVersion, { min: 0, max: 9999 }),
    ownerUid: sanitizeText(src.ownerUid || "", { maxLen: 128, collapse: true }),

    builder: {
      name: sanitizeCharName(b.name || ""),
      portraitPath: sanitizeStoragePath(b.portraitPath || ""),

      level,
      classKey: sanitizeText(b.classKey || "", { maxLen: 64, collapse: true }),
      primaryAttribute: primary,
      attributes: attrs,
      originKey: sanitizeText(b.originKey || "", { maxLen: 64, collapse: true }),
      originKeystone: sanitizeText(b.originKeystone || "", { maxLen: 400, collapse: true }),

      selectedClassFeatureOptions: sanitizeStringArray(b.selectedClassFeatureOptions, { maxItems: 500, maxLen: 200 }),
      selectedClassUtilitySkills: sanitizeStringArray(b.selectedClassUtilitySkills, { maxItems: 50, maxLen: 96 }),
      selectedFeats: sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 }),
      selectedFeatOptions: sanitizeStringArray(b.selectedFeatOptions, { maxItems: 500, maxLen: 200 }),
      autoAbilityNames: sanitizeStringArray(b.autoAbilityNames, { maxItems: 500, maxLen: 200 }),
      grantedCoreSkillSnapshot: sanitizeStringArray(b.grantedCoreSkillSnapshot, { maxItems: 50, maxLen: 64 }),
      grantedSkillSnapshot: sanitizeStringArray(b.grantedSkillSnapshot, { maxItems: 200, maxLen: 96 }),
      bonds: sanitizeBondList(b.bonds, { maxItems: 50 }),
      backgroundKeystones: sanitizeKeystoneList(b.backgroundKeystones, { maxItems: 2, maxLen: 400 }),
      weapons: sanitizeWeaponList(b.weapons, { maxItems: 20 }),
      grantChoices: sanitizeGrantChoices(b.grantChoices, { maxItems: 100 }),

      visitedSteps: sanitizeStringArray(b.visitedSteps, { maxItems: 50, maxLen: 64 }),
      lastVisitedAt: b.lastVisitedAt ?? null,

      selectedTechniques: sanitizeStringArray(b.selectedTechniques, { maxItems: 500, maxLen: 200 }),

      sheet: {
        fields: sheetFields,
        repeatables: sheetRepeatables,
      },
    },
  };
}
