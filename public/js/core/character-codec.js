import {
  ATTR_KEYS,
  CORE_SKILL_FIELDS,
  DEFENSE_SKILL_FIELDS,
  getAttributeEffectiveCap,
} from "./character-rules.js";
import { sanitizeStoragePath, sanitizeText } from "./data-sanitization.js";

export const CHARACTER_SCHEMA_VERSION = 5;

const BUILDER_STEP_IDS = Object.freeze([
  "basics",
  "class",
  "attributes",
  "origin",
  "skills",
  "equipment",
  "techniques",
  "bonds-keystones",
]);

const FIXED_SKILL_FIELD_KEYS = Object.freeze([
  ...DEFENSE_SKILL_FIELDS,
  ...CORE_SKILL_FIELDS,
].map(({ key }) => key));

const SHEET_FIELD_KEYS = Object.freeze([
  ...FIXED_SKILL_FIELD_KEYS,
  "hpcur",
  "strain",
  "overstrained",
  "notes",
]);

const SHEET_REPEATABLE_KEYS = Object.freeze([
  "combatSkillsExtra",
  "settingSkills",
  "abilities",
  "conditions",
]);

const ROOT_KEYS = Object.freeze(["schemaVersion", "ownerUid", "builder"]);
const BUILDER_KEYS = Object.freeze([
  "name",
  "portraitPath",
  "level",
  "classKey",
  "primaryAttribute",
  "attributes",
  "originKey",
  "originKeystone",
  "selectedClassFeatureOptions",
  "selectedClassUtilitySkills",
  "selectedFeats",
  "selectedFeatOptions",
  "autoAbilityNames",
  "grantedCoreSkillSnapshot",
  "grantedSkillSnapshot",
  "bonds",
  "backgroundKeystones",
  "weapons",
  "grantChoices",
  "resources",
  "visitedSteps",
  "selectedTechniques",
  "sheet",
]);

const STABLE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,127})$/;
const STABLE_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.:/-]{0,259})$/;
const SKILL_RANK_PATTERN = /^(?:[0-6])?$/;
const POSITIVE_RANK_PATTERN = /^(?:[1-6])?$/;
const OPTIONAL_INTEGER_PATTERN = /^(?:0|[1-9][0-9]{0,5})?$/;

export function isCanonicalStableKey(value, { allowEmpty = true } = {}) {
  if (typeof value !== "string") return false;
  const normalized = sanitizeText(value, { maxLen: 128, collapse: true });
  if (normalized !== value) return false;
  if (value === "") return allowEmpty;
  return STABLE_KEY_PATTERN.test(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function addDiagnostic(diagnostics, code, path, message) {
  diagnostics.push(Object.freeze({ code, path, message }));
}

function validatePlainObject(value, path, diagnostics) {
  if (isPlainObject(value)) return true;
  addDiagnostic(diagnostics, "invalid-type", path, `Expected a plain object; received ${valueKind(value)}.`);
  return false;
}

function validateExactKeys(value, path, allowedKeys, diagnostics) {
  if (!validatePlainObject(value, path, diagnostics)) return false;

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) {
      addDiagnostic(diagnostics, "unknown-field", `${path}.${key}`, "Field is not part of character schema v5.");
    }
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      addDiagnostic(diagnostics, "missing-field", `${path}.${key}`, "Required canonical field is missing.");
    }
  }
  return true;
}

function validateCanonicalText(value, path, diagnostics, {
  maxLen,
  collapse = true,
  allowEmpty = true,
} = {}) {
  if (typeof value !== "string") {
    addDiagnostic(diagnostics, "invalid-type", path, `Expected a string; received ${valueKind(value)}.`);
    return false;
  }
  const normalized = sanitizeText(value, { maxLen, collapse });
  if (normalized !== value) {
    addDiagnostic(diagnostics, "noncanonical-value", path, "String contains disallowed control, spacing, or length content.");
    return false;
  }
  if (!allowEmpty && value === "") {
    addDiagnostic(diagnostics, "invalid-value", path, "Value must not be empty.");
    return false;
  }
  return true;
}

function validateStableKey(value, path, diagnostics, { allowEmpty = true } = {}) {
  if (!validateCanonicalText(value, path, diagnostics, { maxLen: 128, allowEmpty })) return false;
  if (!isCanonicalStableKey(value, { allowEmpty })) {
    addDiagnostic(diagnostics, "invalid-stable-key", path, "Expected a lowercase stable key using letters, digits, underscores, or hyphens.");
    return false;
  }
  return true;
}

function validateStableId(value, path, diagnostics, { allowEmpty = true } = {}) {
  if (!validateCanonicalText(value, path, diagnostics, { maxLen: 260, allowEmpty })) return false;
  if (value === "" && allowEmpty) return true;
  if (!STABLE_ID_PATTERN.test(value)) {
    addDiagnostic(diagnostics, "invalid-stable-id", path, "Expected a stable ID without whitespace.");
    return false;
  }
  return true;
}

function validateInteger(value, path, diagnostics, { min, max } = {}) {
  if (!Number.isInteger(value)) {
    addDiagnostic(diagnostics, "invalid-type", path, `Expected an integer; received ${valueKind(value)}.`);
    return false;
  }
  if (value < min || value > max) {
    addDiagnostic(diagnostics, "out-of-range", path, `Expected an integer from ${min} through ${max}.`);
    return false;
  }
  return true;
}

function validateBoolean(value, path, diagnostics) {
  if (typeof value === "boolean") return true;
  addDiagnostic(diagnostics, "invalid-type", path, `Expected a boolean; received ${valueKind(value)}.`);
  return false;
}

function validatePatternString(value, path, diagnostics, pattern, message) {
  if (typeof value !== "string") {
    addDiagnostic(diagnostics, "invalid-type", path, `Expected a string; received ${valueKind(value)}.`);
    return false;
  }
  if (!pattern.test(value)) {
    addDiagnostic(diagnostics, "invalid-value", path, message);
    return false;
  }
  return true;
}

function validateArray(value, path, diagnostics, { maxItems, validateItem, uniqueBy } = {}) {
  if (!Array.isArray(value)) {
    addDiagnostic(diagnostics, "invalid-type", path, `Expected an array; received ${valueKind(value)}.`);
    return false;
  }
  if (value.length > maxItems) {
    addDiagnostic(diagnostics, "too-many-items", path, `Expected at most ${maxItems} items.`);
  }
  const seen = new Set();
  value.forEach((item, index) => {
    validateItem(item, `${path}[${index}]`, diagnostics);
    if (!uniqueBy) return;
    const identity = uniqueBy(item);
    if (!identity) return;
    if (seen.has(identity)) {
      addDiagnostic(diagnostics, "duplicate-identity", `${path}[${index}]`, `Duplicate identity "${identity}".`);
    }
    seen.add(identity);
  });
  return true;
}

function validateStableKeyArray(value, path, diagnostics, { maxItems }) {
  return validateArray(value, path, diagnostics, {
    maxItems,
    validateItem: (item, itemPath, out) => validateStableKey(item, itemPath, out, { allowEmpty: false }),
    uniqueBy: (item) => typeof item === "string" ? item : "",
  });
}

function validateCanonicalTextArray(value, path, diagnostics, { maxItems, maxLen }) {
  return validateArray(value, path, diagnostics, {
    maxItems,
    validateItem: (item, itemPath, out) => validateCanonicalText(item, itemPath, out, { maxLen, allowEmpty: false }),
    uniqueBy: (item) => typeof item === "string" ? item : "",
  });
}

function validateAttributes(value, builder, path, diagnostics) {
  if (!validateExactKeys(value, path, ATTR_KEYS, diagnostics)) return;
  const level = Number.isInteger(builder.level) ? builder.level : 1;
  const primary = typeof builder.primaryAttribute === "string" ? builder.primaryAttribute : "";
  for (const key of ATTR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const minimum = primary === key ? 1 : 0;
    validateInteger(value[key], `${path}.${key}`, diagnostics, {
      min: minimum,
      max: getAttributeEffectiveCap(level, key, primary),
    });
  }
}

function validateBond(value, path, diagnostics) {
  const keys = ["bondId", "name", "rank", "keystone"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateStableId(value.bondId, `${path}.bondId`, diagnostics, { allowEmpty: false });
  validateCanonicalText(value.name, `${path}.name`, diagnostics, { maxLen: 96 });
  validatePatternString(value.rank, `${path}.rank`, diagnostics, POSITIVE_RANK_PATTERN, "Expected blank or a rank from 1 through 6.");
  validateCanonicalText(value.keystone, `${path}.keystone`, diagnostics, { maxLen: 400 });
  if (value.name === "" && value.rank === "" && value.keystone === "") {
    addDiagnostic(diagnostics, "empty-record", path, "A stored bond must contain a name, rank, or keystone.");
  }
}

function validateEnhancementSelections(value, path, diagnostics) {
  if (!validatePlainObject(value, path, diagnostics)) return;
  for (const key of Object.keys(value).sort()) {
    validateStableKey(key, `${path}.${key}`, diagnostics, { allowEmpty: false });
    validateCanonicalText(value[key], `${path}.${key}`, diagnostics, { maxLen: 96, allowEmpty: false });
  }
}

function validateWeaponEnhancement(value, path, diagnostics) {
  const keys = ["id", "enhancementKey", "rank", "selections", "granted"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateStableId(value.id, `${path}.id`, diagnostics, { allowEmpty: false });
  validateStableKey(value.enhancementKey, `${path}.enhancementKey`, diagnostics, { allowEmpty: false });
  validateInteger(value.rank, `${path}.rank`, diagnostics, { min: 0, max: 8 });
  validateEnhancementSelections(value.selections, `${path}.selections`, diagnostics);
  validateBoolean(value.granted, `${path}.granted`, diagnostics);
}

function validateWeapon(value, path, diagnostics) {
  const keys = ["id", "choiceId", "sourceChoiceId", "generated", "weaponKey", "rank", "customName", "enhancements"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateStableId(value.id, `${path}.id`, diagnostics, { allowEmpty: false });
  validateStableId(value.choiceId, `${path}.choiceId`, diagnostics);
  validateStableId(value.sourceChoiceId, `${path}.sourceChoiceId`, diagnostics);
  validateBoolean(value.generated, `${path}.generated`, diagnostics);
  validateStableKey(value.weaponKey, `${path}.weaponKey`, diagnostics, { allowEmpty: false });
  validateInteger(value.rank, `${path}.rank`, diagnostics, { min: 0, max: 8 });
  validateCanonicalText(value.customName, `${path}.customName`, diagnostics, { maxLen: 120 });
  validateArray(value.enhancements, `${path}.enhancements`, diagnostics, {
    maxItems: 20,
    validateItem: validateWeaponEnhancement,
    uniqueBy: (item) => isPlainObject(item) ? item.id : "",
  });
  if (value.generated && value.sourceChoiceId === "") {
    addDiagnostic(diagnostics, "missing-source-owner", `${path}.sourceChoiceId`, "A generated weapon must identify its source-owned choice.");
  }
}

function validateGrantChoice(value, path, diagnostics, mapChoiceId) {
  const keys = [
    "choiceId", "type", "sourceId", "sourceLabel", "value", "techniqueKey", "skillKey",
    "weaponKey", "rank", "customName", "enhancements", "tags",
  ];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateStableId(value.choiceId, `${path}.choiceId`, diagnostics, { allowEmpty: false });
  if (typeof value.choiceId === "string" && value.choiceId !== mapChoiceId) {
    addDiagnostic(diagnostics, "identity-mismatch", `${path}.choiceId`, "Choice record ID must match its map key.");
  }
  validateStableKey(value.type, `${path}.type`, diagnostics, { allowEmpty: false });
  validateStableId(value.sourceId, `${path}.sourceId`, diagnostics, { allowEmpty: false });
  validateCanonicalText(value.sourceLabel, `${path}.sourceLabel`, diagnostics, { maxLen: 200 });
  validateStableKey(value.value, `${path}.value`, diagnostics);
  validateStableKey(value.techniqueKey, `${path}.techniqueKey`, diagnostics);
  validateStableKey(value.skillKey, `${path}.skillKey`, diagnostics);
  validateStableKey(value.weaponKey, `${path}.weaponKey`, diagnostics);
  validateInteger(value.rank, `${path}.rank`, diagnostics, { min: 0, max: 8 });
  validateCanonicalText(value.customName, `${path}.customName`, diagnostics, { maxLen: 120 });
  validateArray(value.enhancements, `${path}.enhancements`, diagnostics, {
    maxItems: 20,
    validateItem: validateWeaponEnhancement,
    uniqueBy: (item) => isPlainObject(item) ? item.id : "",
  });
  validateStableKeyArray(value.tags, `${path}.tags`, diagnostics, { maxItems: 50 });
  if (!value.value && !value.techniqueKey && !value.skillKey && !value.weaponKey && value.enhancements?.length === 0) {
    addDiagnostic(diagnostics, "empty-answer", path, "A stored grant choice must contain an answer.");
  }
}

function validateGrantChoices(value, path, diagnostics) {
  if (!validatePlainObject(value, path, diagnostics)) return;
  const choiceIds = Object.keys(value).sort();
  if (choiceIds.length > 100) addDiagnostic(diagnostics, "too-many-items", path, "Expected at most 100 grant choices.");
  for (const choiceId of choiceIds) {
    validateStableId(choiceId, `${path}.${choiceId}`, diagnostics, { allowEmpty: false });
    validateGrantChoice(value[choiceId], `${path}.${choiceId}`, diagnostics, choiceId);
  }
}

function validateResource(value, path, diagnostics, mapResourceKey) {
  const keys = ["resourceKey", "name", "capacity", "current"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateStableKey(value.resourceKey, `${path}.resourceKey`, diagnostics, { allowEmpty: false });
  if (typeof value.resourceKey === "string" && value.resourceKey !== mapResourceKey) {
    addDiagnostic(diagnostics, "identity-mismatch", `${path}.resourceKey`, "Resource record key must match its map key.");
  }
  validateCanonicalText(value.name, `${path}.name`, diagnostics, { maxLen: 120, allowEmpty: false });
  const capacityOk = validateInteger(value.capacity, `${path}.capacity`, diagnostics, { min: 0, max: 9999 });
  const currentOk = validateInteger(value.current, `${path}.current`, diagnostics, { min: 0, max: 9999 });
  if (capacityOk && currentOk && value.current > value.capacity) {
    addDiagnostic(diagnostics, "out-of-range", `${path}.current`, "Current resource amount must not exceed capacity.");
  }
}

function validateResources(value, path, diagnostics) {
  if (!validatePlainObject(value, path, diagnostics)) return;
  const resourceKeys = Object.keys(value).sort();
  if (resourceKeys.length > 100) addDiagnostic(diagnostics, "too-many-items", path, "Expected at most 100 resources.");
  for (const resourceKey of resourceKeys) {
    validateStableKey(resourceKey, `${path}.${resourceKey}`, diagnostics, { allowEmpty: false });
    validateResource(value[resourceKey], `${path}.${resourceKey}`, diagnostics, resourceKey);
  }
}

function validateNamedSkill(value, path, diagnostics) {
  const keys = ["skill", "rank"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateCanonicalText(value.skill, `${path}.skill`, diagnostics, { maxLen: 96, allowEmpty: false });
  validatePatternString(value.rank, `${path}.rank`, diagnostics, SKILL_RANK_PATTERN, "Expected blank or a rank from 0 through 6.");
}

function validateAbility(value, path, diagnostics) {
  const keys = ["abilityId", "sourceId", "name", "text"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateStableId(value.abilityId, `${path}.abilityId`, diagnostics, { allowEmpty: false });
  validateStableId(value.sourceId, `${path}.sourceId`, diagnostics);
  validateCanonicalText(value.name, `${path}.name`, diagnostics, { maxLen: 120 });
  validateCanonicalText(value.text, `${path}.text`, diagnostics, { maxLen: 4000, collapse: false });
  if (value.name === "" && value.text === "") addDiagnostic(diagnostics, "empty-record", path, "A stored ability must contain a name or text.");
}

function validateCondition(value, path, diagnostics) {
  const keys = ["name", "n", "notes"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateCanonicalText(value.name, `${path}.name`, diagnostics, { maxLen: 120 });
  validatePatternString(value.n, `${path}.n`, diagnostics, OPTIONAL_INTEGER_PATTERN, "Expected blank or a nonnegative integer.");
  validateCanonicalText(value.notes, `${path}.notes`, diagnostics, { maxLen: 1000, collapse: false });
  if (value.name === "" && value.n === "" && value.notes === "") addDiagnostic(diagnostics, "empty-record", path, "An empty condition row must not be stored.");
}

function validateSheetFields(value, path, diagnostics) {
  if (!validateExactKeys(value, path, SHEET_FIELD_KEYS, diagnostics)) return;
  for (const key of FIXED_SKILL_FIELD_KEYS) {
    validatePatternString(value[key], `${path}.${key}`, diagnostics, SKILL_RANK_PATTERN, "Expected blank or a rank from 0 through 6.");
  }
  validatePatternString(value.hpcur, `${path}.hpcur`, diagnostics, OPTIONAL_INTEGER_PATTERN, "Expected blank or a nonnegative integer.");
  validatePatternString(value.strain, `${path}.strain`, diagnostics, OPTIONAL_INTEGER_PATTERN, "Expected blank or a nonnegative integer.");
  validateBoolean(value.overstrained, `${path}.overstrained`, diagnostics);
  validateCanonicalText(value.notes, `${path}.notes`, diagnostics, { maxLen: 20000, collapse: false });
}

function validateSheetRepeatables(value, path, diagnostics) {
  if (!validateExactKeys(value, path, SHEET_REPEATABLE_KEYS, diagnostics)) return;
  validateArray(value.combatSkillsExtra, `${path}.combatSkillsExtra`, diagnostics, {
    maxItems: 50,
    validateItem: validateNamedSkill,
    uniqueBy: (item) => isPlainObject(item) && typeof item.skill === "string"
      ? item.skill.toLowerCase()
      : "",
  });
  validateArray(value.settingSkills, `${path}.settingSkills`, diagnostics, {
    maxItems: 50,
    validateItem: validateNamedSkill,
    uniqueBy: (item) => isPlainObject(item) && typeof item.skill === "string"
      ? item.skill.toLowerCase()
      : "",
  });
  validateArray(value.abilities, `${path}.abilities`, diagnostics, {
    maxItems: 200,
    validateItem: validateAbility,
    uniqueBy: (item) => isPlainObject(item) ? item.abilityId : "",
  });
  validateArray(value.conditions, `${path}.conditions`, diagnostics, {
    maxItems: 100,
    validateItem: validateCondition,
  });
}

function validateSheet(value, path, diagnostics) {
  const keys = ["fields", "repeatables"];
  if (!validateExactKeys(value, path, keys, diagnostics)) return;
  validateSheetFields(value.fields, `${path}.fields`, diagnostics);
  validateSheetRepeatables(value.repeatables, `${path}.repeatables`, diagnostics);
}

function validateBuilder(value, path, diagnostics) {
  if (!validateExactKeys(value, path, BUILDER_KEYS, diagnostics)) return;
  validateCanonicalText(value.name, `${path}.name`, diagnostics, { maxLen: 64 });
  if (typeof value.portraitPath !== "string") {
    addDiagnostic(diagnostics, "invalid-type", `${path}.portraitPath`, `Expected a string; received ${valueKind(value.portraitPath)}.`);
  } else if (sanitizeStoragePath(value.portraitPath) !== value.portraitPath) {
    addDiagnostic(diagnostics, "noncanonical-value", `${path}.portraitPath`, "Portrait path is not a canonical storage path.");
  }
  validateInteger(value.level, `${path}.level`, diagnostics, { min: 1, max: 12 });
  validateStableKey(value.classKey, `${path}.classKey`, diagnostics);
  validateStableKey(value.primaryAttribute, `${path}.primaryAttribute`, diagnostics);
  if (typeof value.primaryAttribute === "string" && value.primaryAttribute !== "" && !ATTR_KEYS.includes(value.primaryAttribute)) {
    addDiagnostic(diagnostics, "invalid-enum", `${path}.primaryAttribute`, "Primary attribute is not a recognized attribute key.");
  }
  validateAttributes(value.attributes, value, `${path}.attributes`, diagnostics);
  validateStableKey(value.originKey, `${path}.originKey`, diagnostics);
  validateCanonicalText(value.originKeystone, `${path}.originKeystone`, diagnostics, { maxLen: 400 });
  validateStableKeyArray(value.selectedClassFeatureOptions, `${path}.selectedClassFeatureOptions`, diagnostics, { maxItems: 500 });
  validateStableKeyArray(value.selectedClassUtilitySkills, `${path}.selectedClassUtilitySkills`, diagnostics, { maxItems: 50 });
  validateStableKeyArray(value.selectedFeats, `${path}.selectedFeats`, diagnostics, { maxItems: 200 });
  validateStableKeyArray(value.selectedFeatOptions, `${path}.selectedFeatOptions`, diagnostics, { maxItems: 500 });
  validateCanonicalTextArray(value.autoAbilityNames, `${path}.autoAbilityNames`, diagnostics, { maxItems: 500, maxLen: 200 });
  validateStableKeyArray(value.grantedCoreSkillSnapshot, `${path}.grantedCoreSkillSnapshot`, diagnostics, { maxItems: 50 });
  validateStableKeyArray(value.grantedSkillSnapshot, `${path}.grantedSkillSnapshot`, diagnostics, { maxItems: 200 });
  validateArray(value.bonds, `${path}.bonds`, diagnostics, {
    maxItems: 50,
    validateItem: validateBond,
    uniqueBy: (item) => isPlainObject(item) ? item.bondId : "",
  });
  validateCanonicalTextArray(value.backgroundKeystones, `${path}.backgroundKeystones`, diagnostics, { maxItems: 2, maxLen: 400 });
  validateArray(value.weapons, `${path}.weapons`, diagnostics, {
    maxItems: 20,
    validateItem: validateWeapon,
    uniqueBy: (item) => isPlainObject(item) ? item.id : "",
  });
  validateGrantChoices(value.grantChoices, `${path}.grantChoices`, diagnostics);
  validateResources(value.resources, `${path}.resources`, diagnostics);
  validateArray(value.visitedSteps, `${path}.visitedSteps`, diagnostics, {
    maxItems: BUILDER_STEP_IDS.length,
    validateItem: (item, itemPath, out) => {
      if (!validateCanonicalText(item, itemPath, out, { maxLen: 64, allowEmpty: false })) return;
      if (!BUILDER_STEP_IDS.includes(item)) addDiagnostic(out, "invalid-enum", itemPath, "Builder step ID is not recognized.");
    },
    uniqueBy: (item) => typeof item === "string" ? item : "",
  });
  validateStableKeyArray(value.selectedTechniques, `${path}.selectedTechniques`, diagnostics, { maxItems: 500 });
  validateSheet(value.sheet, `${path}.sheet`, diagnostics);
}

function cloneCanonical(value) {
  if (Array.isArray(value)) return value.map(cloneCanonical);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = cloneCanonical(nested);
    return out;
  }
  return value;
}

function makeDefaultSheetFields() {
  const fields = {};
  for (const key of FIXED_SKILL_FIELD_KEYS) fields[key] = "";
  fields.hpcur = "";
  fields.strain = "";
  fields.overstrained = false;
  fields.notes = "";
  return fields;
}

export function createDefaultCharacter({ ownerUid } = {}) {
  const diagnostics = [];
  validateCanonicalText(ownerUid, "ownerUid", diagnostics, { maxLen: 128, allowEmpty: false });
  if (diagnostics.length) throw new CharacterCodecError("Cannot create a character without a canonical owner UID.", diagnostics);

  const attributes = {};
  for (const key of ATTR_KEYS) attributes[key] = 0;

  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    ownerUid,
    builder: {
      name: "",
      portraitPath: "",
      level: 1,
      classKey: "",
      primaryAttribute: "",
      attributes,
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
      resources: {},
      visitedSteps: [],
      selectedTechniques: [],
      sheet: {
        fields: makeDefaultSheetFields(),
        repeatables: {
          combatSkillsExtra: [],
          settingSkills: [],
          abilities: [],
          conditions: [],
        },
      },
    },
  };
}

export function validateCharacter(value) {
  const diagnostics = [];
  if (!validateExactKeys(value, "character", ROOT_KEYS, diagnostics)) {
    return Object.freeze({ ok: false, diagnostics: Object.freeze(diagnostics) });
  }

  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion !== CHARACTER_SCHEMA_VERSION) {
    addDiagnostic(
      diagnostics,
      "unsupported-schema-version",
      "character.schemaVersion",
      `CharacterCodec accepts only schema version ${CHARACTER_SCHEMA_VERSION}; older documents must be migrated first.`,
    );
  }
  validateCanonicalText(value.ownerUid, "character.ownerUid", diagnostics, { maxLen: 128, allowEmpty: false });
  validateBuilder(value.builder, "character.builder", diagnostics);
  return Object.freeze({ ok: diagnostics.length === 0, diagnostics: Object.freeze(diagnostics) });
}

export function decodeCharacter(value) {
  const validation = validateCharacter(value);
  return Object.freeze({
    ok: validation.ok,
    value: validation.ok ? cloneCanonical(value) : null,
    diagnostics: validation.diagnostics,
  });
}

export function encodeCharacter(value) {
  return decodeCharacter(value);
}

export class CharacterCodecError extends Error {
  constructor(message, diagnostics = []) {
    super(message);
    this.name = "CharacterCodecError";
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

export function assertCanonicalCharacter(value) {
  const result = decodeCharacter(value);
  if (!result.ok) throw new CharacterCodecError("Character does not satisfy schema v5.", result.diagnostics);
  return result.value;
}

export const CharacterCodec = Object.freeze({
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  createDefault: createDefaultCharacter,
  validate: validateCharacter,
  decode: decodeCharacter,
  encode: encodeCharacter,
  assert: assertCanonicalCharacter,
});

export const CHARACTER_CODEC_FIELDS = Object.freeze({
  builder: BUILDER_KEYS,
  fixedSkillFields: FIXED_SKILL_FIELD_KEYS,
  sheetFields: SHEET_FIELD_KEYS,
  sheetRepeatables: SHEET_REPEATABLE_KEYS,
});
