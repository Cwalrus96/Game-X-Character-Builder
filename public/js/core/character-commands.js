import {
  ATTR_KEYS,
  CORE_SKILL_FIELDS,
  clampLevel,
  normalizeSkillRank,
} from "./character-rules.js?v=wpe1";
import { sanitizeText } from "./data-sanitization.js";
import {
  assertCanonicalCharacter,
  BUILDER_STEP_IDS,
  isCanonicalStableKey,
  isCanonicalStableId,
} from "./character-codec.js?v=wpe1";

export const CHARACTER_COMMAND_TYPES = Object.freeze({
  SET_CLASS: "SetClass",
  SET_LEVEL: "SetLevel",
  SET_PRIMARY_ATTRIBUTE: "SetPrimaryAttribute",
  SET_ATTRIBUTE_VALUE: "SetAttributeValue",
  SET_ORIGIN: "SetOrigin",
  SET_ORIGIN_KEYSTONE: "SetOriginKeystone",
  SET_CLASS_UTILITY_SKILLS: "SetClassUtilitySkills",
  SET_SKILL_RANK: "SetSkillRank",
  SET_COMBAT_SKILLS: "SetCombatSkills",
  SET_SETTING_SKILLS: "SetSettingSkills",
  ADD_BOND: "AddBond",
  REMOVE_BOND: "RemoveBond",
  UPDATE_BOND: "UpdateBond",
  SET_BACKGROUND_KEYSTONES: "SetBackgroundKeystones",
  SET_CLASS_FEATURE_OPTIONS: "SetClassFeatureOptions",
  SET_FEAT_SELECTION: "SetFeatSelection",
  SET_FEAT_OPTIONS: "SetFeatOptions",
  SET_GRANT_CHOICES: "SetGrantChoices",
  SET_TRAIT_CHOICE: "SetTraitChoice",
  REMOVE_TRAIT_CHOICE: "RemoveTraitChoice",
  SET_TRAIT_ACTIVATION: "SetTraitActivation",
  REMOVE_TRAIT_ACTIVATION: "RemoveTraitActivation",
  SET_TECHNIQUE_SELECTION: "SetTechniqueSelection",
  ADD_WEAPON: "AddWeapon",
  REMOVE_WEAPON: "RemoveWeapon",
  UPDATE_WEAPON: "UpdateWeapon",
  ADD_WEAPON_ENHANCEMENT: "AddWeaponEnhancement",
  REMOVE_WEAPON_ENHANCEMENT: "RemoveWeaponEnhancement",
  UPDATE_WEAPON_ENHANCEMENT: "UpdateWeaponEnhancement",
  VISIT_BUILDER_STEP: "VisitBuilderStep",
});

function diagnostic(code, path, message) {
  return Object.freeze({ code, path, message });
}

export class CharacterCommandError extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.name = "CharacterCommandError";
    this.code = code;
    this.diagnostics = Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })));
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isPlainObject(value)) return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) output[key] = cloneValue(child);
  return output;
}

function freezeValue(value) {
  if (Array.isArray(value)) value.forEach(freezeValue);
  else if (isPlainObject(value)) Object.values(value).forEach(freezeValue);
  return value && typeof value === "object" ? Object.freeze(value) : value;
}

function requireExactKeys(command, expectedKeys) {
  if (!isPlainObject(command)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "Character command must be a plain object.",
      [diagnostic("invalid-type", "command", "Expected a plain object.")],
    );
  }
  const expected = new Set(expectedKeys);
  const diagnostics = [];
  for (const key of Object.keys(command).sort()) {
    if (!expected.has(key)) {
      diagnostics.push(diagnostic("unknown-field", `command.${key}`, "Field is not part of this command."));
    }
  }
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(command, key)) {
      diagnostics.push(diagnostic("missing-field", `command.${key}`, "Required command field is missing."));
    }
  }
  if (diagnostics.length) {
    throw new CharacterCommandError("invalid-character-command", "Character command shape is invalid.", diagnostics);
  }
}

function validateSetClass(command) {
  requireExactKeys(command, ["type", "classKey"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_CLASS) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetClass command type is invalid.",
      [diagnostic("invalid-value", "command.type", "Expected SetClass.")],
    );
  }
  if (!isCanonicalStableKey(command.classKey)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetClass requires a canonical stable class key or an empty value.",
      [diagnostic("invalid-stable-key", "command.classKey", "Class key is not canonical.")],
    );
  }
  return Object.freeze({ type: command.type, classKey: command.classKey });
}

function validateStableKeys(value, { commandName, fieldName, noun }) {
  if (!Array.isArray(value)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires an array of stable ${noun} keys.`,
      [diagnostic("invalid-type", `command.${fieldName}`, "Expected an array.")],
    );
  }
  const diagnostics = [];
  const seen = new Set();
  value.forEach((key, index) => {
    if (!isCanonicalStableKey(key, { allowEmpty: false })) {
      diagnostics.push(diagnostic(
        "invalid-stable-key",
        `command.${fieldName}[${index}]`,
        `${noun[0].toUpperCase()}${noun.slice(1)} selection entries must be non-empty canonical stable keys.`,
      ));
      return;
    }
    if (seen.has(key)) {
      diagnostics.push(diagnostic(
        "duplicate-identity",
        `command.${fieldName}[${index}]`,
        `${noun[0].toUpperCase()}${noun.slice(1)} key "${key}" is selected more than once.`,
      ));
    }
    seen.add(key);
  });
  if (diagnostics.length) {
    throw new CharacterCommandError("invalid-character-command", `${commandName} command is invalid.`, diagnostics);
  }
  return Object.freeze([...value]);
}

function validateSetLevel(command) {
  requireExactKeys(command, ["type", "level"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_LEVEL || !Number.isInteger(command.level)
    || clampLevel(command.level) !== command.level) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetLevel requires an integer level from 1 through 12.",
      [diagnostic("invalid-value", "command.level", "Expected an integer from 1 through 12.")],
    );
  }
  return Object.freeze({ type: command.type, level: command.level });
}

function validateSetPrimaryAttribute(command) {
  requireExactKeys(command, ["type", "attributeKey"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_PRIMARY_ATTRIBUTE
    || (command.attributeKey !== "" && !ATTR_KEYS.includes(command.attributeKey))) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetPrimaryAttribute requires a recognized attribute key or an empty value.",
      [diagnostic("invalid-value", "command.attributeKey", "Primary attribute key is not recognized.")],
    );
  }
  return Object.freeze({ type: command.type, attributeKey: command.attributeKey });
}

function validateSetAttributeValue(command) {
  requireExactKeys(command, ["type", "attributeKey", "value"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_ATTRIBUTE_VALUE
    || !ATTR_KEYS.includes(command.attributeKey)
    || !Number.isInteger(command.value)
    || command.value < 0
    || command.value > 10) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetAttributeValue requires a recognized attribute key and an integer value from 0 through 10.",
      [diagnostic("invalid-value", "command", "Attribute key or value is invalid.")],
    );
  }
  return Object.freeze({ type: command.type, attributeKey: command.attributeKey, value: command.value });
}

function validateSetOrigin(command) {
  requireExactKeys(command, ["type", "originKey"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_ORIGIN || !isCanonicalStableKey(command.originKey)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetOrigin requires a canonical stable origin key or an empty value.",
      [diagnostic("invalid-stable-key", "command.originKey", "Origin key is not canonical.")],
    );
  }
  return Object.freeze({ type: command.type, originKey: command.originKey });
}

function validateSetOriginKeystone(command) {
  requireExactKeys(command, ["type", "originKeystone"]);
  const normalized = sanitizeText(command.originKeystone, { maxLen: 400, collapse: true });
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_ORIGIN_KEYSTONE
    || typeof command.originKeystone !== "string" || normalized !== command.originKeystone) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetOriginKeystone requires canonical text no longer than 400 characters.",
      [diagnostic("invalid-value", "command.originKeystone", "Origin Keystone text is not canonical.")],
    );
  }
  return Object.freeze({ type: command.type, originKeystone: normalized });
}

function canonicalBondRecord(value, path = "command.bond") {
  if (!isPlainObject(value)) {
    throw new CharacterCommandError("invalid-character-command", "Bond must be a plain object.", [diagnostic("invalid-type", path, "Expected a bond record.")]);
  }
  requireExactKeys(value, ["bondId", "name", "rank", "keystone"]);
  const bondId = sanitizeText(value.bondId, { maxLen: 260, collapse: true });
  const name = sanitizeText(value.name, { maxLen: 96, collapse: true });
  const rank = sanitizeText(value.rank, { maxLen: 8, collapse: true });
  const keystone = sanitizeText(value.keystone, { maxLen: 400, collapse: true });
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.:/-]{0,259})$/.test(bondId)
    || bondId.startsWith("grant-bond:")
    || !/^[1-6]$/.test(rank)
    || name !== value.name
    || rank !== value.rank
    || keystone !== value.keystone) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "AddBond requires a canonical user-owned bond with a stable ID and rank from 1 through 6.",
      [diagnostic("invalid-bond", path, "Bond identity, text, or rank is invalid.")],
    );
  }
  return freezeValue({ bondId, name, rank, keystone });
}

function validateAddBond(command) {
  requireExactKeys(command, ["type", "bond"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.ADD_BOND) {
    throw new CharacterCommandError("invalid-character-command", "AddBond command type is invalid.");
  }
  return Object.freeze({ type: command.type, bond: canonicalBondRecord(command.bond) });
}

function validateBondTarget(command, type, commandName) {
  requireExactKeys(command, ["type", "bondId"]);
  const bondId = sanitizeText(command.bondId, { maxLen: 260, collapse: true });
  if (command.type !== type || bondId !== command.bondId || !bondId || bondId.startsWith("grant-bond:")) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires a user-owned stable bond ID.`,
      [diagnostic("invalid-bond-target", "command.bondId", "Active source-owned bonds cannot be removed directly.")],
    );
  }
  return Object.freeze({ type: command.type, bondId });
}

function validateUpdateBond(command) {
  requireExactKeys(command, ["type", "bondId", "patch"]);
  const bondId = sanitizeText(command.bondId, { maxLen: 260, collapse: true });
  if (command.type !== CHARACTER_COMMAND_TYPES.UPDATE_BOND || bondId !== command.bondId || !bondId || !isPlainObject(command.patch)) {
    throw new CharacterCommandError("invalid-character-command", "UpdateBond requires a stable bond ID and patch object.");
  }
  const allowed = new Set(["name", "rank", "keystone"]);
  const patch = {};
  for (const key of Object.keys(command.patch).sort()) {
    if (!allowed.has(key)) {
      throw new CharacterCommandError("invalid-character-command", "UpdateBond patch contains an ownership or unknown field.", [diagnostic("unknown-field", `command.patch.${key}`, "Field cannot be changed by UpdateBond.")]);
    }
    const maxLen = key === "name" ? 96 : key === "keystone" ? 400 : 8;
    const value = sanitizeText(command.patch[key], { maxLen, collapse: true });
    if (typeof command.patch[key] !== "string" || value !== command.patch[key] || (key === "rank" && !/^[1-6]$/.test(value))) {
      throw new CharacterCommandError("invalid-character-command", "UpdateBond patch text or rank is not canonical.", [diagnostic("invalid-value", `command.patch.${key}`, "Bond field is invalid.")]);
    }
    patch[key] = value;
  }
  if (bondId.startsWith("grant-bond:") && Object.prototype.hasOwnProperty.call(patch, "rank")) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "A source-owned Bond rank must be changed through its granting source.",
      [diagnostic("source-owned-field", "command.patch.rank", "Source-owned Bond rank is not directly editable.")],
    );
  }
  if (!Object.keys(patch).length) throw new CharacterCommandError("invalid-character-command", "UpdateBond requires at least one changed field.");
  return freezeValue({ type: command.type, bondId, patch });
}

function validateSetBackgroundKeystones(command) {
  requireExactKeys(command, ["type", "keystones"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_BACKGROUND_KEYSTONES || !Array.isArray(command.keystones) || command.keystones.length > 2) {
    throw new CharacterCommandError("invalid-character-command", "SetBackgroundKeystones requires at most two Keystone strings.");
  }
  const keystones = command.keystones.map((value, index) => {
    const normalized = sanitizeText(value, { maxLen: 400, collapse: true });
    if (typeof value !== "string" || !normalized || normalized !== value) {
      throw new CharacterCommandError("invalid-character-command", "Background Keystone text must be non-empty and canonical.", [diagnostic("invalid-value", `command.keystones[${index}]`, "Keystone text is invalid.")]);
    }
    return normalized;
  });
  return Object.freeze({ type: command.type, keystones: Object.freeze(keystones) });
}

function validateSetSkillRank(command) {
  requireExactKeys(command, ["type", "fieldKey", "rank"]);
  const allowedFields = new Set(CORE_SKILL_FIELDS.map(({ key }) => key));
  const normalized = normalizeSkillRank(command.rank, { allowBlank: true });
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_SKILL_RANK
    || !allowedFields.has(command.fieldKey)
    || typeof command.rank !== "string"
    || normalized !== command.rank) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetSkillRank requires an editable core-skill field and a canonical rank.",
      [diagnostic("invalid-value", "command", "Skill field or rank is invalid.")],
    );
  }
  return Object.freeze({ type: command.type, fieldKey: command.fieldKey, rank: normalized });
}

function validateSkillRowsCommand(command, { type, fieldName, commandName }) {
  requireExactKeys(command, ["type", fieldName]);
  if (command.type !== type || !Array.isArray(command[fieldName])) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires an array of skill rows.`,
      [diagnostic("invalid-type", `command.${fieldName}`, "Expected an array.")],
    );
  }
  return freezeValue({ type: command.type, [fieldName]: cloneValue(command[fieldName]) });
}

function validateKeyArrayCommand(command, { type, fieldName, commandName, noun }) {
  requireExactKeys(command, ["type", fieldName]);
  if (command.type !== type) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} command type is invalid.`,
      [diagnostic("invalid-value", "command.type", `Expected ${commandName}.`)],
    );
  }
  return Object.freeze({
    type: command.type,
    [fieldName]: validateStableKeys(command[fieldName], { commandName, fieldName, noun }),
  });
}

function validateSetTechniqueSelection(command) {
  requireExactKeys(command, ["type", "techniqueKeys"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetTechniqueSelection command type is invalid.",
      [diagnostic("invalid-value", "command.type", "Expected SetTechniqueSelection.")],
    );
  }
  return Object.freeze({
    type: command.type,
    techniqueKeys: validateStableKeys(command.techniqueKeys, {
      commandName: "SetTechniqueSelection",
      fieldName: "techniqueKeys",
      noun: "technique",
    }),
  });
}

function validateTraitCommand(command, { activation = false, remove = false } = {}) {
  const idField = activation ? "activationId" : "choiceId";
  const type = activation
    ? (remove ? CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_ACTIVATION : CHARACTER_COMMAND_TYPES.SET_TRAIT_ACTIVATION)
    : (remove ? CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_CHOICE : CHARACTER_COMMAND_TYPES.SET_TRAIT_CHOICE);
  const keys = remove ? ["type", idField]
    : activation ? ["type", idField, "sourceId", "active"]
      : ["type", idField, "sourceId", "recipientId", "traitKey"];
  requireExactKeys(command, keys);
  const diagnostics = [];
  if (command.type !== type) diagnostics.push(diagnostic("invalid-value", "command.type", `Expected ${type}.`));
  for (const key of remove ? [idField] : activation ? [idField, "sourceId"] : [idField, "sourceId", "recipientId"]) {
    if (!isCanonicalStableId(command[key], { allowEmpty: false })) diagnostics.push(diagnostic("invalid-stable-id", `command.${key}`, "Expected a non-empty canonical stable ID."));
  }
  if (!remove && activation && typeof command.active !== "boolean") diagnostics.push(diagnostic("invalid-type", "command.active", "Expected a boolean."));
  if (!remove && !activation && !isCanonicalStableKey(command.traitKey, { allowEmpty: false })) diagnostics.push(diagnostic("invalid-stable-key", "command.traitKey", "Expected a non-empty canonical Trait key."));
  if (diagnostics.length) throw new CharacterCommandError("invalid-character-command", `${type} command is invalid.`, diagnostics);
  return Object.freeze({ ...command });
}

function applyTraitCommand(builder, command, { activation = false, remove = false } = {}) {
  const map = activation ? builder.traitActivations : builder.traitChoices;
  const idField = activation ? "activationId" : "choiceId";
  const id = command[idField];
  const existing = Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
  if (remove) {
    if (!existing) throw new CharacterCommandError("stale-character-command", "The Trait record no longer exists.");
    delete map[id];
    return;
  }
  if (existing && (existing.sourceId !== command.sourceId || (!activation && existing.recipientId !== command.recipientId))) {
    throw new CharacterCommandError("stale-character-command", "A Trait identity cannot be reassigned to another source or recipient.");
  }
  const { type, ...record } = command;
  map[id] = record;
}

function validateSetGrantChoices(command) {
  requireExactKeys(command, ["type", "grantChoices"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_GRANT_CHOICES || !isPlainObject(command.grantChoices)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetGrantChoices requires a plain grant-choice map.",
      [diagnostic("invalid-type", "command.grantChoices", "Expected a plain object.")],
    );
  }
  // Whole answer records are validated once by CharacterCodec after the command
  // is applied; the command boundary validates only this intent envelope.
  return freezeValue({ type: command.type, grantChoices: cloneValue(command.grantChoices) });
}

function validateEquipmentRecordCommand(command, { type, recordField, commandName, targeted = false }) {
  requireExactKeys(command, targeted ? ["type", "weaponId", recordField] : ["type", recordField]);
  if (command.type !== type || !isPlainObject(command[recordField])) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires a plain ${recordField} record.`,
      [diagnostic("invalid-type", `command.${recordField}`, "Expected a plain object.")],
    );
  }
  if (targeted && (typeof command.weaponId !== "string" || !command.weaponId.trim())) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires a non-empty stable weapon ID.`,
      [diagnostic("invalid-value", "command.weaponId", "Weapon ID must be a non-empty string.")],
    );
  }
  // CharacterCodec remains the one structural validator for complete weapon and
  // enhancement records after the intent is applied to a cloned character.
  return freezeValue({
    type: command.type,
    ...(targeted ? { weaponId: command.weaponId } : {}),
    [recordField]: cloneValue(command[recordField]),
  });
}

function validateEquipmentTargetCommand(command, { type, commandName, enhancement = false }) {
  const keys = enhancement ? ["type", "weaponId", "enhancementId"] : ["type", "weaponId"];
  requireExactKeys(command, keys);
  const identifiers = enhancement ? [command.weaponId, command.enhancementId] : [command.weaponId];
  if (command.type !== type || identifiers.some((value) => typeof value !== "string" || !value.trim())) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires non-empty stable target IDs.`,
      [diagnostic("invalid-value", "command", "Equipment target IDs must be non-empty strings.")],
    );
  }
  return Object.freeze({
    type: command.type,
    weaponId: command.weaponId,
    ...(enhancement ? { enhancementId: command.enhancementId } : {}),
  });
}

function validateEquipmentUpdateCommand(command, { type, commandName, enhancement = false }) {
  const keys = enhancement ? ["type", "weaponId", "enhancementId", "patch"] : ["type", "weaponId", "patch"];
  requireExactKeys(command, keys);
  const identifiers = enhancement ? [command.weaponId, command.enhancementId] : [command.weaponId];
  const allowed = new Set(enhancement
    ? ["enhancementKey", "rank", "selections"]
    : ["weaponKey", "rank", "customName"]);
  const patchKeys = isPlainObject(command.patch) ? Object.keys(command.patch) : [];
  if (command.type !== type || identifiers.some((value) => typeof value !== "string" || !value.trim())
    || !isPlainObject(command.patch) || patchKeys.length === 0 || patchKeys.some((key) => !allowed.has(key))) {
    throw new CharacterCommandError(
      "invalid-character-command",
      `${commandName} requires a non-empty patch containing only editable equipment fields.`,
      [diagnostic("invalid-value", "command.patch", "The equipment update patch is invalid.")],
    );
  }
  return freezeValue({
    type: command.type,
    weaponId: command.weaponId,
    ...(enhancement ? { enhancementId: command.enhancementId } : {}),
    patch: cloneValue(command.patch),
  });
}

function validateVisitBuilderStep(command) {
  requireExactKeys(command, ["type", "stepId"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.VISIT_BUILDER_STEP || !BUILDER_STEP_IDS.includes(command.stepId)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "VisitBuilderStep requires a recognized builder step ID.",
      [diagnostic("invalid-value", "command.stepId", "Builder step ID is not recognized.")],
    );
  }
  return Object.freeze({ type: command.type, stepId: command.stepId });
}

export function SetClass(classKey) {
  return validateSetClass({ type: CHARACTER_COMMAND_TYPES.SET_CLASS, classKey });
}

export function SetLevel(level) {
  return validateSetLevel({ type: CHARACTER_COMMAND_TYPES.SET_LEVEL, level });
}

export function SetPrimaryAttribute(attributeKey) {
  return validateSetPrimaryAttribute({
    type: CHARACTER_COMMAND_TYPES.SET_PRIMARY_ATTRIBUTE,
    attributeKey,
  });
}

export function SetAttributeValue(attributeKey, value) {
  return validateSetAttributeValue({ type: CHARACTER_COMMAND_TYPES.SET_ATTRIBUTE_VALUE, attributeKey, value });
}

export function SetOrigin(originKey) {
  return validateSetOrigin({ type: CHARACTER_COMMAND_TYPES.SET_ORIGIN, originKey });
}

export function SetOriginKeystone(originKeystone) {
  return validateSetOriginKeystone({ type: CHARACTER_COMMAND_TYPES.SET_ORIGIN_KEYSTONE, originKeystone });
}

export function AddBond(bond) {
  return validateAddBond({ type: CHARACTER_COMMAND_TYPES.ADD_BOND, bond });
}

export function RemoveBond(bondId) {
  return validateBondTarget({ type: CHARACTER_COMMAND_TYPES.REMOVE_BOND, bondId }, CHARACTER_COMMAND_TYPES.REMOVE_BOND, "RemoveBond");
}

export function UpdateBond(bondId, patch) {
  return validateUpdateBond({ type: CHARACTER_COMMAND_TYPES.UPDATE_BOND, bondId, patch });
}

export function SetBackgroundKeystones(keystones) {
  return validateSetBackgroundKeystones({ type: CHARACTER_COMMAND_TYPES.SET_BACKGROUND_KEYSTONES, keystones });
}

export function SetClassUtilitySkills(skillKeys) {
  return validateKeyArrayCommand({
    type: CHARACTER_COMMAND_TYPES.SET_CLASS_UTILITY_SKILLS,
    skillKeys,
  }, {
    type: CHARACTER_COMMAND_TYPES.SET_CLASS_UTILITY_SKILLS,
    fieldName: "skillKeys",
    commandName: "SetClassUtilitySkills",
    noun: "skill",
  });
}

export function SetSkillRank(fieldKey, rank) {
  return validateSetSkillRank({ type: CHARACTER_COMMAND_TYPES.SET_SKILL_RANK, fieldKey, rank });
}

export function SetCombatSkills(skills) {
  return validateSkillRowsCommand({ type: CHARACTER_COMMAND_TYPES.SET_COMBAT_SKILLS, skills }, {
    type: CHARACTER_COMMAND_TYPES.SET_COMBAT_SKILLS, fieldName: "skills", commandName: "SetCombatSkills",
  });
}

export function SetSettingSkills(skills) {
  return validateSkillRowsCommand({ type: CHARACTER_COMMAND_TYPES.SET_SETTING_SKILLS, skills }, {
    type: CHARACTER_COMMAND_TYPES.SET_SETTING_SKILLS, fieldName: "skills", commandName: "SetSettingSkills",
  });
}

export function SetClassFeatureOptions(optionKeys) {
  return validateKeyArrayCommand({
    type: CHARACTER_COMMAND_TYPES.SET_CLASS_FEATURE_OPTIONS,
    optionKeys,
  }, {
    type: CHARACTER_COMMAND_TYPES.SET_CLASS_FEATURE_OPTIONS,
    fieldName: "optionKeys",
    commandName: "SetClassFeatureOptions",
    noun: "class option",
  });
}

export function SetFeatSelection(featKeys) {
  return validateKeyArrayCommand({
    type: CHARACTER_COMMAND_TYPES.SET_FEAT_SELECTION,
    featKeys,
  }, {
    type: CHARACTER_COMMAND_TYPES.SET_FEAT_SELECTION,
    fieldName: "featKeys",
    commandName: "SetFeatSelection",
    noun: "feat",
  });
}

export function SetFeatOptions(optionKeys) {
  return validateKeyArrayCommand({
    type: CHARACTER_COMMAND_TYPES.SET_FEAT_OPTIONS,
    optionKeys,
  }, {
    type: CHARACTER_COMMAND_TYPES.SET_FEAT_OPTIONS,
    fieldName: "optionKeys",
    commandName: "SetFeatOptions",
    noun: "feat option",
  });
}

export function SetGrantChoices(grantChoices) {
  return validateSetGrantChoices({ type: CHARACTER_COMMAND_TYPES.SET_GRANT_CHOICES, grantChoices });
}

export function SetTraitChoice(choice) {
  requireExactKeys(choice, ["choiceId", "sourceId", "recipientId", "traitKey"]);
  return validateTraitCommand({ type: CHARACTER_COMMAND_TYPES.SET_TRAIT_CHOICE, ...choice });
}

export function RemoveTraitChoice(choiceId) {
  return validateTraitCommand({ type: CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_CHOICE, choiceId }, { remove: true });
}

export function SetTraitActivation(activation) {
  requireExactKeys(activation, ["activationId", "sourceId", "active"]);
  return validateTraitCommand({ type: CHARACTER_COMMAND_TYPES.SET_TRAIT_ACTIVATION, ...activation }, { activation: true });
}

export function RemoveTraitActivation(activationId) {
  return validateTraitCommand({ type: CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_ACTIVATION, activationId }, { activation: true, remove: true });
}

export function SetTechniqueSelection(techniqueKeys) {
  return validateSetTechniqueSelection({
    type: CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION,
    techniqueKeys,
  });
}

export function AddWeapon(weapon) {
  return validateEquipmentRecordCommand({ type: CHARACTER_COMMAND_TYPES.ADD_WEAPON, weapon }, {
    type: CHARACTER_COMMAND_TYPES.ADD_WEAPON, recordField: "weapon", commandName: "AddWeapon",
  });
}

export function RemoveWeapon(weaponId) {
  return validateEquipmentTargetCommand({ type: CHARACTER_COMMAND_TYPES.REMOVE_WEAPON, weaponId }, {
    type: CHARACTER_COMMAND_TYPES.REMOVE_WEAPON, commandName: "RemoveWeapon",
  });
}

export function UpdateWeapon(weaponId, patch) {
  return validateEquipmentUpdateCommand({ type: CHARACTER_COMMAND_TYPES.UPDATE_WEAPON, weaponId, patch }, {
    type: CHARACTER_COMMAND_TYPES.UPDATE_WEAPON, commandName: "UpdateWeapon",
  });
}

export function AddWeaponEnhancement(weaponId, enhancement) {
  return validateEquipmentRecordCommand({ type: CHARACTER_COMMAND_TYPES.ADD_WEAPON_ENHANCEMENT, weaponId, enhancement }, {
    type: CHARACTER_COMMAND_TYPES.ADD_WEAPON_ENHANCEMENT,
    recordField: "enhancement",
    commandName: "AddWeaponEnhancement",
    targeted: true,
  });
}

export function RemoveWeaponEnhancement(weaponId, enhancementId) {
  return validateEquipmentTargetCommand({ type: CHARACTER_COMMAND_TYPES.REMOVE_WEAPON_ENHANCEMENT, weaponId, enhancementId }, {
    type: CHARACTER_COMMAND_TYPES.REMOVE_WEAPON_ENHANCEMENT, commandName: "RemoveWeaponEnhancement", enhancement: true,
  });
}

export function UpdateWeaponEnhancement(weaponId, enhancementId, patch) {
  return validateEquipmentUpdateCommand({
    type: CHARACTER_COMMAND_TYPES.UPDATE_WEAPON_ENHANCEMENT, weaponId, enhancementId, patch,
  }, {
    type: CHARACTER_COMMAND_TYPES.UPDATE_WEAPON_ENHANCEMENT,
    commandName: "UpdateWeaponEnhancement",
    enhancement: true,
  });
}

export function VisitBuilderStep(stepId) {
  return validateVisitBuilderStep({ type: CHARACTER_COMMAND_TYPES.VISIT_BUILDER_STEP, stepId });
}

export function decodeCharacterCommand(command) {
  if (!isPlainObject(command)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "Character command must be a plain object.",
      [diagnostic("invalid-type", "command", "Expected a plain object.")],
    );
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_CLASS) return validateSetClass(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_LEVEL) return validateSetLevel(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_PRIMARY_ATTRIBUTE) return validateSetPrimaryAttribute(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_ATTRIBUTE_VALUE) return validateSetAttributeValue(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_ORIGIN) return validateSetOrigin(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_ORIGIN_KEYSTONE) return validateSetOriginKeystone(command);
  if (command.type === CHARACTER_COMMAND_TYPES.ADD_BOND) return validateAddBond(command);
  if (command.type === CHARACTER_COMMAND_TYPES.REMOVE_BOND) return validateBondTarget(command, CHARACTER_COMMAND_TYPES.REMOVE_BOND, "RemoveBond");
  if (command.type === CHARACTER_COMMAND_TYPES.UPDATE_BOND) return validateUpdateBond(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_BACKGROUND_KEYSTONES) return validateSetBackgroundKeystones(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_CLASS_UTILITY_SKILLS) {
    return validateKeyArrayCommand(command, {
      type: CHARACTER_COMMAND_TYPES.SET_CLASS_UTILITY_SKILLS,
      fieldName: "skillKeys",
      commandName: "SetClassUtilitySkills",
      noun: "skill",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_SKILL_RANK) return validateSetSkillRank(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_COMBAT_SKILLS) {
    return validateSkillRowsCommand(command, {
      type: CHARACTER_COMMAND_TYPES.SET_COMBAT_SKILLS, fieldName: "skills", commandName: "SetCombatSkills",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_SETTING_SKILLS) {
    return validateSkillRowsCommand(command, {
      type: CHARACTER_COMMAND_TYPES.SET_SETTING_SKILLS, fieldName: "skills", commandName: "SetSettingSkills",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_CLASS_FEATURE_OPTIONS) {
    return validateKeyArrayCommand(command, {
      type: CHARACTER_COMMAND_TYPES.SET_CLASS_FEATURE_OPTIONS,
      fieldName: "optionKeys",
      commandName: "SetClassFeatureOptions",
      noun: "class option",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_FEAT_SELECTION) {
    return validateKeyArrayCommand(command, {
      type: CHARACTER_COMMAND_TYPES.SET_FEAT_SELECTION,
      fieldName: "featKeys",
      commandName: "SetFeatSelection",
      noun: "feat",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_FEAT_OPTIONS) {
    return validateKeyArrayCommand(command, {
      type: CHARACTER_COMMAND_TYPES.SET_FEAT_OPTIONS,
      fieldName: "optionKeys",
      commandName: "SetFeatOptions",
      noun: "feat option",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_GRANT_CHOICES) return validateSetGrantChoices(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_TRAIT_CHOICE) return validateTraitCommand(command);
  if (command.type === CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_CHOICE) return validateTraitCommand(command, { remove: true });
  if (command.type === CHARACTER_COMMAND_TYPES.SET_TRAIT_ACTIVATION) return validateTraitCommand(command, { activation: true });
  if (command.type === CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_ACTIVATION) return validateTraitCommand(command, { activation: true, remove: true });
  if (command.type === CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION) {
    return validateSetTechniqueSelection(command);
  }
  if (command.type === CHARACTER_COMMAND_TYPES.ADD_WEAPON) {
    return validateEquipmentRecordCommand(command, {
      type: CHARACTER_COMMAND_TYPES.ADD_WEAPON, recordField: "weapon", commandName: "AddWeapon",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.REMOVE_WEAPON) {
    return validateEquipmentTargetCommand(command, {
      type: CHARACTER_COMMAND_TYPES.REMOVE_WEAPON, commandName: "RemoveWeapon",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.UPDATE_WEAPON) {
    return validateEquipmentUpdateCommand(command, {
      type: CHARACTER_COMMAND_TYPES.UPDATE_WEAPON, commandName: "UpdateWeapon",
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.ADD_WEAPON_ENHANCEMENT) {
    return validateEquipmentRecordCommand(command, {
      type: CHARACTER_COMMAND_TYPES.ADD_WEAPON_ENHANCEMENT,
      recordField: "enhancement",
      commandName: "AddWeaponEnhancement",
      targeted: true,
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.REMOVE_WEAPON_ENHANCEMENT) {
    return validateEquipmentTargetCommand(command, {
      type: CHARACTER_COMMAND_TYPES.REMOVE_WEAPON_ENHANCEMENT,
      commandName: "RemoveWeaponEnhancement",
      enhancement: true,
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.UPDATE_WEAPON_ENHANCEMENT) {
    return validateEquipmentUpdateCommand(command, {
      type: CHARACTER_COMMAND_TYPES.UPDATE_WEAPON_ENHANCEMENT,
      commandName: "UpdateWeaponEnhancement",
      enhancement: true,
    });
  }
  if (command.type === CHARACTER_COMMAND_TYPES.VISIT_BUILDER_STEP) return validateVisitBuilderStep(command);
  throw new CharacterCommandError(
    "unknown-character-command",
    `Unknown character command type "${String(command.type || "")}".`,
    [diagnostic("unknown-command", "command.type", "Command type is not registered.")],
  );
}

export function applyCharacterCommand(character, command) {
  const current = assertCanonicalCharacter(character);
  const decoded = decodeCharacterCommand(command);
  if (decoded.type === CHARACTER_COMMAND_TYPES.SET_CLASS) {
    current.builder.classKey = decoded.classKey;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_LEVEL) {
    current.builder.level = decoded.level;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_PRIMARY_ATTRIBUTE) {
    current.builder.primaryAttribute = decoded.attributeKey;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_ATTRIBUTE_VALUE) {
    current.builder.attributes[decoded.attributeKey] = decoded.value;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_ORIGIN) {
    current.builder.originKey = decoded.originKey;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_ORIGIN_KEYSTONE) {
    current.builder.originKeystone = decoded.originKeystone;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.ADD_BOND) {
    if (current.builder.bonds.some((bond) => bond.bondId === decoded.bond.bondId)) {
      throw new CharacterCommandError("stale-character-command", "A bond with this identity already exists.");
    }
    current.builder.bonds.push(cloneValue(decoded.bond));
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.REMOVE_BOND) {
    current.builder.bonds.splice(bondIndex(current.builder.bonds, decoded.bondId), 1);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.UPDATE_BOND) {
    Object.assign(current.builder.bonds[bondIndex(current.builder.bonds, decoded.bondId)], cloneValue(decoded.patch));
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_BACKGROUND_KEYSTONES) {
    current.builder.backgroundKeystones = [...decoded.keystones];
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_CLASS_UTILITY_SKILLS) {
    current.builder.selectedClassUtilitySkills = [...decoded.skillKeys];
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_SKILL_RANK) {
    current.builder.sheet.fields[decoded.fieldKey] = decoded.rank;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_COMBAT_SKILLS) {
    current.builder.sheet.repeatables.combatSkillsExtra = cloneValue(decoded.skills);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_SETTING_SKILLS) {
    current.builder.sheet.repeatables.settingSkills = cloneValue(decoded.skills);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_CLASS_FEATURE_OPTIONS) {
    current.builder.selectedClassFeatureOptions = [...decoded.optionKeys];
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_FEAT_SELECTION) {
    current.builder.selectedFeats = [...decoded.featKeys];
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_FEAT_OPTIONS) {
    current.builder.selectedFeatOptions = [...decoded.optionKeys];
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_GRANT_CHOICES) {
    current.builder.grantChoices = cloneValue(decoded.grantChoices);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_TRAIT_CHOICE) {
    applyTraitCommand(current.builder, decoded);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_CHOICE) {
    applyTraitCommand(current.builder, decoded, { remove: true });
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_TRAIT_ACTIVATION) {
    applyTraitCommand(current.builder, decoded, { activation: true });
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.REMOVE_TRAIT_ACTIVATION) {
    applyTraitCommand(current.builder, decoded, { activation: true, remove: true });
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION) {
    current.builder.selectedTechniques = [...decoded.techniqueKeys];
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.ADD_WEAPON) {
    current.builder.weapons.push(cloneValue(decoded.weapon));
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.REMOVE_WEAPON) {
    const index = equipmentIndex(current.builder.weapons, decoded.weaponId, "weapon");
    current.builder.weapons.splice(index, 1);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.UPDATE_WEAPON) {
    const index = equipmentIndex(current.builder.weapons, decoded.weaponId, "weapon");
    Object.assign(current.builder.weapons[index], cloneValue(decoded.patch));
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.ADD_WEAPON_ENHANCEMENT) {
    const index = equipmentIndex(current.builder.weapons, decoded.weaponId, "weapon");
    current.builder.weapons[index].enhancements.push(cloneValue(decoded.enhancement));
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.REMOVE_WEAPON_ENHANCEMENT) {
    const weaponIndex = equipmentIndex(current.builder.weapons, decoded.weaponId, "weapon");
    const enhancements = current.builder.weapons[weaponIndex].enhancements;
    enhancements.splice(equipmentIndex(enhancements, decoded.enhancementId, "enhancement"), 1);
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.UPDATE_WEAPON_ENHANCEMENT) {
    const weaponIndex = equipmentIndex(current.builder.weapons, decoded.weaponId, "weapon");
    const enhancements = current.builder.weapons[weaponIndex].enhancements;
    Object.assign(enhancements[equipmentIndex(enhancements, decoded.enhancementId, "enhancement")], cloneValue(decoded.patch));
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.VISIT_BUILDER_STEP) {
    if (!current.builder.visitedSteps.includes(decoded.stepId)) current.builder.visitedSteps.push(decoded.stepId);
  }
  return assertCanonicalCharacter(current);
}

function equipmentIndex(records, id, noun) {
  const index = records.findIndex((record) => record.id === id);
  if (index >= 0) return index;
  throw new CharacterCommandError(
    "stale-character-command",
    `The targeted ${noun} no longer exists.`,
    [diagnostic("missing-command-target", `command.${noun}Id`, `The ${noun} target is stale or invalid.`)],
  );
}

function bondIndex(records, bondId) {
  const index = records.findIndex((record) => record.bondId === bondId);
  if (index >= 0) return index;
  throw new CharacterCommandError(
    "stale-character-command",
    "The targeted bond no longer exists.",
    [diagnostic("missing-command-target", "command.bondId", "The bond target is stale or invalid.")],
  );
}

export const CharacterCommands = Object.freeze({
  types: CHARACTER_COMMAND_TYPES,
  setClass: SetClass,
  setLevel: SetLevel,
  setPrimaryAttribute: SetPrimaryAttribute,
  setAttributeValue: SetAttributeValue,
  setOrigin: SetOrigin,
  setOriginKeystone: SetOriginKeystone,
  addBond: AddBond,
  removeBond: RemoveBond,
  updateBond: UpdateBond,
  setBackgroundKeystones: SetBackgroundKeystones,
  setClassUtilitySkills: SetClassUtilitySkills,
  setSkillRank: SetSkillRank,
  setCombatSkills: SetCombatSkills,
  setSettingSkills: SetSettingSkills,
  setClassFeatureOptions: SetClassFeatureOptions,
  setFeatSelection: SetFeatSelection,
  setFeatOptions: SetFeatOptions,
  setGrantChoices: SetGrantChoices,
  setTraitChoice: SetTraitChoice,
  removeTraitChoice: RemoveTraitChoice,
  setTraitActivation: SetTraitActivation,
  removeTraitActivation: RemoveTraitActivation,
  setTechniqueSelection: SetTechniqueSelection,
  addWeapon: AddWeapon,
  removeWeapon: RemoveWeapon,
  updateWeapon: UpdateWeapon,
  addWeaponEnhancement: AddWeaponEnhancement,
  removeWeaponEnhancement: RemoveWeaponEnhancement,
  updateWeaponEnhancement: UpdateWeaponEnhancement,
  visitBuilderStep: VisitBuilderStep,
  decode: decodeCharacterCommand,
  apply: applyCharacterCommand,
});
