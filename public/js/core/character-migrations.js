import {
  CHARACTER_SCHEMA_VERSION,
  CHARACTER_CODEC_FIELDS,
  createDefaultCharacter,
  validateCharacter,
} from "./character-codec.js";
import {
  ATTR_KEYS,
  CORE_SKILL_FIELDS,
  DEFENSE_SKILL_FIELDS,
  getAttributeEffectiveCap,
} from "./character-rules.js";
import {
  normalizeEnumToken,
  sanitizeStoragePath,
  sanitizeText,
} from "./data-sanitization.js";

export const LEGACY_UNVERSIONED_CHARACTER_SCHEMA = 0;
export const RESERVED_CHARACTER_SCHEMA_VERSION = 2;
export const SUPPORTED_CHARACTER_SCHEMA_VERSIONS = Object.freeze([0, 1, 3, 4, 5]);

const STABLE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,127})$/;
const BUILDER_STEP_IDS = new Set([
  "basics",
  "class",
  "attributes",
  "origin",
  "skills",
  "equipment",
  "techniques",
  "bonds-keystones",
]);
const REFERENCE_KINDS = Object.freeze([
  "classes",
  "origins",
  "skills",
  "feats",
  "classFeatureOptions",
  "featOptions",
  "techniques",
]);
const LEGACY_SHEET_FIELD_KEYS = new Set([
  "charName",
  "playerName",
  "classSelect",
  "primaryAttribute",
  "level",
  "background",
  "hpmax",
  "speed",
  "physdef",
  "mentdef",
  "spiritdef",
  ...ATTR_KEYS,
]);
const LEGACY_REPEATABLE_KEYS = new Set([
  "originKeystones",
  "bondKeystones",
  "backgroundKeystones",
  "techniques",
  "weapons",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = cloneValue(nested);
    return out;
  }
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function addDiagnostic(context, code, path, message, details = {}) {
  context.diagnostics.push(Object.freeze({
    code,
    path,
    message,
    fromVersion: context.fromVersion,
    toVersion: context.toVersion,
    ...details,
  }));
  if (["missing-reference-index", "unresolved-reference", "ambiguous-reference", "unresolved-legacy-field"].includes(code)) {
    addReport(context, "unresolved", path, message, details);
  }
}

function addReport(context, kind, path, message, details = {}) {
  context.report.push(Object.freeze({ kind, path, message, ...details }));
}

function reportDefault(context, path, value) {
  addReport(context, "defaulted", path, "Missing historical field received its documented canonical default.", {
    value: cloneValue(value),
  });
}

function textValue(value, path, context, { maxLen, collapse = true, allowEmpty = true } = {}) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    addDiagnostic(context, "invalid-legacy-type", path, "Expected historical text to be a string.");
    return "";
  }
  const normalized = sanitizeText(value, { maxLen, collapse });
  if (!allowEmpty && normalized === "") {
    addDiagnostic(context, "invalid-legacy-value", path, "Historical text must not be empty.");
  }
  if (normalized !== value) addReport(context, "normalized", path, "Historical text was normalized.");
  return normalized;
}

function stableTokenValue(value, path, context, { maxLen = 128, allowEmpty = true } = {}) {
  const raw = textValue(value, path, context, { maxLen, allowEmpty });
  if (!raw) return "";
  const normalized = normalizeEnumToken(raw, { maxLen });
  if (!normalized) {
    addDiagnostic(context, "invalid-legacy-value", path, `Historical value "${raw}" cannot become a stable key.`);
    return "";
  }
  if (normalized !== raw) {
    addReport(context, "normalized", path, `Historical value "${raw}" became stable key "${normalized}".`, {
      from: raw,
      to: normalized,
    });
  }
  return normalized;
}

function integerValue(value, path, context, { min, max, fallback = min } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = typeof value === "string" ? value.trim() : "";
  const parsed = typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : typeof value === "string" && /^[+-]?\d+$/.test(text)
      ? Number(text)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    addDiagnostic(context, "invalid-legacy-type", path, "Expected a historical integer value.");
    return fallback;
  }
  const normalized = Math.max(min, Math.min(max, parsed));
  if (normalized !== value) addReport(context, "normalized", path, "Historical integer was converted or clamped.");
  return normalized;
}

function booleanValue(value, path, context) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") {
    addReport(context, "normalized", path, "Historical boolean was converted to true.");
    return true;
  }
  if (value === 0 || value === "0" || value === "false") {
    addReport(context, "normalized", path, "Historical boolean was converted to false.");
    return false;
  }
  addDiagnostic(context, "invalid-legacy-type", path, "Expected a historical boolean value.");
  return false;
}

function arrayValue(value, path, context) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    addDiagnostic(context, "invalid-legacy-type", path, "Expected a historical array value.");
    return [];
  }
  return value;
}

function objectValue(value, path, context) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    addDiagnostic(context, "invalid-legacy-type", path, "Expected a historical object value.");
    return {};
  }
  return value;
}

function diagnoseUnknownKeys(value, allowedKeys, path, context) {
  if (!isPlainObject(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) {
      addDiagnostic(context, "unknown-legacy-field", `${path}.${key}`, "Unknown historical field cannot be discarded safely.");
    }
  }
}

function reportMissingKeys(value, defaults, path, context) {
  if (!isPlainObject(value)) return;
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!hasOwn(value, key)) reportDefault(context, `${path}.${key}`, defaultValue);
  }
}

function boundedArray(value, path, context, maxItems) {
  const source = arrayValue(value, path, context);
  if (source.length > maxItems) {
    addDiagnostic(context, "too-many-legacy-items", path, `Historical array exceeds ${maxItems} items.`);
  }
  return source.slice(0, maxItems);
}

function hasMeaningfulLegacyValue(value) {
  if (value === undefined || value === null || value === "" || value === false) return false;
  if (Array.isArray(value)) return value.some(hasMeaningfulLegacyValue);
  if (isPlainObject(value)) return Object.values(value).some(hasMeaningfulLegacyValue);
  return true;
}

function canonicalStringArray(value, path, context, { maxItems, maxLen }) {
  const out = [];
  const seen = new Set();
  for (const [index, raw] of arrayValue(value, path, context).slice(0, maxItems).entries()) {
    const item = textValue(raw, `${path}[${index}]`, context, { maxLen, allowEmpty: false });
    if (!item) continue;
    if (seen.has(item)) {
      addDiagnostic(context, "duplicate-legacy-value", `${path}[${index}]`, `Duplicate historical value "${item}".`);
      continue;
    }
    seen.add(item);
    out.push(item);
  }
  if (Array.isArray(value) && value.length > maxItems) {
    addDiagnostic(context, "too-many-legacy-items", path, `Historical array exceeds ${maxItems} items.`);
  }
  return out;
}

function referenceAlias(value) {
  return sanitizeText(value, { maxLen: 260, collapse: true }).toLowerCase();
}

function referenceEntries(references, kind, value) {
  const table = references?.[kind];
  if (!table || typeof table !== "object") return null;
  const entry = table[referenceAlias(value)];
  if (Array.isArray(entry)) return entry;
  if (typeof entry === "string" && entry) return [entry];
  return [];
}

function resolveReference(value, kind, path, context, { allowEmpty = true } = {}) {
  const raw = textValue(value, path, context, { maxLen: 260, allowEmpty });
  if (!raw) return "";
  const matches = referenceEntries(context.references, kind, raw);
  if (matches === null) {
    addDiagnostic(
      context,
      "missing-reference-index",
      path,
      `Cannot prove historical ${kind} reference "${raw}" without a migration reference index.`,
      { referenceKind: kind, legacyValue: raw },
    );
    return "";
  }
  const unique = [...new Set(matches)].sort();
  if (unique.length === 0) {
    addDiagnostic(
      context,
      "unresolved-reference",
      path,
      `Historical ${kind} reference "${raw}" has no stable-key mapping.`,
      { referenceKind: kind, legacyValue: raw },
    );
    return "";
  }
  if (unique.length > 1) {
    addDiagnostic(
      context,
      "ambiguous-reference",
      path,
      `Historical ${kind} reference "${raw}" maps to more than one stable key.`,
      { referenceKind: kind, legacyValue: raw, candidates: Object.freeze(unique) },
    );
    return "";
  }
  const resolved = unique[0];
  if (!STABLE_KEY_PATTERN.test(resolved)) {
    addDiagnostic(context, "invalid-reference-index", path, `Migration reference index returned invalid stable key "${resolved}".`);
    return "";
  }
  if (resolved !== raw) {
    addReport(context, "renamed", path, `Historical reference "${raw}" became stable key "${resolved}".`, {
      referenceKind: kind,
      from: raw,
      to: resolved,
    });
  } else {
    addReport(context, "preserved", path, `Stable ${kind} reference "${resolved}" was preserved.`);
  }
  return resolved;
}

function resolveReferenceArray(value, kind, path, context, { maxItems }) {
  const out = [];
  const seen = new Set();
  const source = arrayValue(value, path, context);
  if (source.length > maxItems) addDiagnostic(context, "too-many-legacy-items", path, `Historical array exceeds ${maxItems} items.`);
  for (const [index, raw] of source.slice(0, maxItems).entries()) {
    const resolved = resolveReference(raw, kind, `${path}[${index}]`, context, { allowEmpty: false });
    if (!resolved) continue;
    if (seen.has(resolved)) {
      addDiagnostic(context, "stable-id-collision", `${path}[${index}]`, `Multiple historical values resolve to "${resolved}".`);
      continue;
    }
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function generatedLegacyId(kind, value, index) {
  return `legacy-${kind}:${stableHash(JSON.stringify(value))}:${index + 1}`;
}

function normalizeAttributes(value, level, primaryAttribute, path, context, { addPrimaryBonus = false } = {}) {
  const source = objectValue(value, path, context);
  const out = {};
  for (const key of ATTR_KEYS) {
    const raw = hasOwn(source, key) ? source[key] : 0;
    let normalized = integerValue(raw, `${path}.${key}`, context, { min: 0, max: 99, fallback: 0 });
    if (addPrimaryBonus && key === primaryAttribute) {
      normalized += 1;
      addReport(context, "normalized", `${path}.${key}`, "Schema v1 stored base attributes; the primary-attribute bonus was restored.");
    }
    const minimum = key === primaryAttribute ? 1 : 0;
    const cap = getAttributeEffectiveCap(level, key, primaryAttribute);
    out[key] = Math.max(minimum, Math.min(cap, normalized));
    if (out[key] !== normalized) {
      addReport(context, "normalized", `${path}.${key}`, "Historical attribute was clamped to the canonical level and primary-attribute limits.", {
        from: normalized,
        to: out[key],
      });
    }
    if (!hasOwn(source, key)) reportDefault(context, `${path}.${key}`, out[key]);
  }
  for (const key of Object.keys(source)) {
    if (!ATTR_KEYS.includes(key)) addDiagnostic(context, "unknown-legacy-field", `${path}.${key}`, "Unknown historical attribute field cannot be migrated safely.");
  }
  return out;
}

function legacySheetEnvelope(value, path, context) {
  const source = objectValue(value, path, context);
  if (isPlainObject(source.fields) || isPlainObject(source.repeatables)) {
    return {
      fields: objectValue(source.fields, `${path}.fields`, context),
      repeatables: objectValue(source.repeatables, `${path}.repeatables`, context),
      portrait: typeof source.portrait === "string" ? source.portrait : "",
    };
  }
  return {
    fields: source,
    repeatables: {},
    portrait: "",
  };
}

function migrateLegacyTo1(input, context) {
  context.fromVersion = 0;
  context.toVersion = 1;
  const sheet = legacySheetEnvelope(input.sheet, "character.sheet", context);
  diagnoseUnknownKeys(
    input,
    ["ownerUid", "name", "portraitUrl", "portraitPath", "sheet", "createdAt", "updatedAt"],
    "character",
    context,
  );
  const fields = sheet.fields;
  const output = {
    schemaVersion: 1,
    ownerUid: input.ownerUid,
    name: input.name ?? fields.charName ?? "",
    portraitUrl: input.portraitUrl ?? sheet.portrait ?? "",
    portraitPath: input.portraitPath ?? "",
    builder: {
      level: fields.level ?? 1,
      attributes: Object.fromEntries(ATTR_KEYS.map((key) => [key, fields[key] ?? 0])),
      classKey: fields.classSelect ?? "",
      primaryAttribute: fields.primaryAttribute ?? "",
      classFeatureChoices: {},
      selectedFeatIds: [],
      visitedSteps: [],
    },
    sheet: cloneValue(input.sheet),
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
  addReport(context, "renamed", "character.schemaVersion", "Recognized exact pre-version character envelope and assigned historical schema version 1.");
  addReport(context, "renamed", "character.name", "Recovered the character name from the unversioned sheet when necessary.");
  return output;
}

function flattenLegacyClassChoices(value, path, context) {
  const source = objectValue(value, path, context);
  const out = [];
  for (const groupId of Object.keys(source).sort()) {
    const cleanGroup = textValue(groupId, `${path}.${groupId}`, context, { maxLen: 180, allowEmpty: false });
    for (const [index, rawOption] of arrayValue(source[groupId], `${path}.${groupId}`, context).entries()) {
      const option = textValue(rawOption, `${path}.${groupId}[${index}]`, context, { maxLen: 128, allowEmpty: false });
      if (cleanGroup && option) out.push(`${cleanGroup}::${option}`);
    }
  }
  return out;
}

function legacyKeystoneText(value, path, context) {
  if (typeof value === "string") return textValue(value, path, context, { maxLen: 400 });
  const row = objectValue(value, path, context);
  if (typeof row.text === "string") return textValue(row.text, `${path}.text`, context, { maxLen: 400 });
  const name = textValue(row.name, `${path}.name`, context, { maxLen: 120 });
  const notes = textValue(row.notes, `${path}.notes`, context, { maxLen: 400 });
  return name && notes ? `${name}: ${notes}` : name || notes;
}

function migrate1To3(input, context) {
  context.fromVersion = 1;
  context.toVersion = 3;
  const builder = objectValue(input.builder, "character.builder", context);
  const sheet = legacySheetEnvelope(input.sheet, "character.sheet", context);
  const fields = sheet.fields;
  const repeatables = sheet.repeatables;
  diagnoseUnknownKeys(
    input,
    ["schemaVersion", "ownerUid", "name", "portraitUrl", "portraitPath", "builder", "sheet", "createdAt", "updatedAt"],
    "character",
    context,
  );
  diagnoseUnknownKeys(
    builder,
    [
      "level", "attributes", "classKey", "primaryAttribute", "classFeatureChoices", "selectedFeatIds",
      "visitedSteps", "originKey", "originKeystone", "selectedClassUtilitySkills", "selectedFeatOptions",
      "autoAbilityNames", "grantedCoreSkillSnapshot", "grantedSkillSnapshot", "bonds",
      "backgroundKeystones", "lastVisitedAt", "selectedTechniques",
    ],
    "character.builder",
    context,
  );
  if (textValue(input.portraitUrl ?? sheet.portrait, "character.portraitUrl", context, { maxLen: 200000, collapse: false })
      && !input.portraitPath) {
    addDiagnostic(
      context,
      "unresolved-legacy-field",
      "character.portraitUrl",
      "Legacy portrait content has no canonical Storage path and cannot be discarded automatically.",
    );
  }
  const level = integerValue(builder.level ?? fields.level, "character.builder.level", context, { min: 1, max: 12, fallback: 1 });
  const primaryAttribute = textValue(builder.primaryAttribute ?? fields.primaryAttribute, "character.builder.primaryAttribute", context, { maxLen: 32 }).toLowerCase();
  const originKeystones = arrayValue(repeatables.originKeystones, "character.sheet.repeatables.originKeystones", context);
  const backgroundKeystones = arrayValue(repeatables.backgroundKeystones, "character.sheet.repeatables.backgroundKeystones", context)
    .map((row, index) => legacyKeystoneText(row, `character.sheet.repeatables.backgroundKeystones[${index}]`, context))
    .filter(Boolean)
    .slice(0, 2);
  const bonds = arrayValue(repeatables.bondKeystones, "character.sheet.repeatables.bondKeystones", context)
    .map((row, index) => {
      const source = objectValue(row, `character.sheet.repeatables.bondKeystones[${index}]`, context);
      return {
        name: textValue(source.name, `character.sheet.repeatables.bondKeystones[${index}].name`, context, { maxLen: 96 }),
        rank: source.rank ?? "",
        keystone: textValue(source.keystone ?? source.notes, `character.sheet.repeatables.bondKeystones[${index}].notes`, context, { maxLen: 400 }),
      };
    })
    .filter((row) => row.name || row.rank !== "" || row.keystone);

  const output = {
    schemaVersion: 3,
    ownerUid: input.ownerUid,
    builder: {
      name: input.name ?? fields.charName ?? "",
      portraitPath: input.portraitPath ?? "",
      level,
      classKey: builder.classKey ?? fields.classSelect ?? "",
      primaryAttribute,
      attributes: normalizeAttributes(builder.attributes ?? fields, level, primaryAttribute, "character.builder.attributes", context, {
        addPrimaryBonus: primaryAttribute !== "",
      }),
      originKey: builder.originKey ?? fields.background ?? "",
      originKeystone: builder.originKeystone ?? (originKeystones[0] ? legacyKeystoneText(originKeystones[0], "character.sheet.repeatables.originKeystones[0]", context) : ""),
      selectedClassFeatureOptions: flattenLegacyClassChoices(builder.classFeatureChoices, "character.builder.classFeatureChoices", context),
      selectedClassUtilitySkills: builder.selectedClassUtilitySkills ?? [],
      selectedFeats: builder.selectedFeatIds ?? [],
      selectedFeatOptions: builder.selectedFeatOptions ?? [],
      autoAbilityNames: builder.autoAbilityNames ?? [],
      grantedCoreSkillSnapshot: builder.grantedCoreSkillSnapshot ?? [],
      grantedSkillSnapshot: builder.grantedSkillSnapshot ?? [],
      bonds: builder.bonds ?? bonds,
      backgroundKeystones: builder.backgroundKeystones ?? backgroundKeystones,
      visitedSteps: builder.visitedSteps ?? [],
      lastVisitedAt: builder.lastVisitedAt ?? null,
      selectedTechniques: builder.selectedTechniques ?? [],
      sheet: {
        fields: cloneValue(fields),
        repeatables: cloneValue(repeatables),
      },
    },
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
  addReport(context, "renamed", "character.builder.name", "Moved the schema-v1 root name into builder state.", { fromPath: "character.name" });
  addReport(context, "renamed", "character.builder.sheet", "Moved the schema-v1 root sheet into builder state.", { fromPath: "character.sheet" });
  return output;
}

function migrate3To4(input, context) {
  context.fromVersion = 3;
  context.toVersion = 4;
  const output = cloneValue(input);
  output.schemaVersion = 4;
  output.builder = objectValue(output.builder, "character.builder", context);
  for (const [key, value] of Object.entries({
    selectedFeatOptions: [],
    weapons: [],
    grantChoices: {},
    resources: {},
  })) {
    if (!hasOwn(output.builder, key)) {
      output.builder[key] = cloneValue(value);
      reportDefault(context, `character.builder.${key}`, value);
    }
  }
  addReport(context, "renamed", "character.schemaVersion", "Advanced the observed schema-v3 shape to schema version 4.");
  return output;
}

function normalizeRank(value, path, context, { positive = false } = {}) {
  if (value === undefined || value === null || value === "") return "";
  const min = positive ? 1 : 0;
  const rank = integerValue(value, path, context, { min, max: 6, fallback: min });
  return String(rank);
}

function normalizeNamedSkills(value, path, context, maxItems) {
  const out = [];
  const seen = new Set();
  for (const [index, raw] of boundedArray(value, path, context, maxItems).entries()) {
    const rowPath = `${path}[${index}]`;
    const row = objectValue(raw, rowPath, context);
    diagnoseUnknownKeys(row, ["skill", "rank"], rowPath, context);
    reportMissingKeys(row, { skill: "", rank: "" }, rowPath, context);
    const skill = textValue(row.skill, `${rowPath}.skill`, context, { maxLen: 96, allowEmpty: false });
    const rank = normalizeRank(row.rank, `${rowPath}.rank`, context);
    if (!skill) continue;
    const identity = skill.toLowerCase();
    if (seen.has(identity)) {
      addDiagnostic(context, "stable-id-collision", rowPath, `Duplicate named skill "${skill}".`);
      continue;
    }
    seen.add(identity);
    out.push({ skill, rank });
  }
  return out;
}

function normalizeAbilities(value, path, context) {
  const out = [];
  const ids = new Set();
  for (const [index, raw] of boundedArray(value, path, context, 200).entries()) {
    const rowPath = `${path}[${index}]`;
    const row = objectValue(raw, rowPath, context);
    diagnoseUnknownKeys(row, ["abilityId", "sourceId", "name", "text"], rowPath, context);
    reportMissingKeys(row, { sourceId: "", name: "", text: "" }, rowPath, context);
    const name = textValue(row.name, `${rowPath}.name`, context, { maxLen: 120 });
    const text = textValue(row.text, `${rowPath}.text`, context, { maxLen: 4000, collapse: false });
    if (!name && !text) continue;
    const abilityId = textValue(row.abilityId, `${rowPath}.abilityId`, context, { maxLen: 260 })
      || generatedLegacyId("ability", { name, text }, index);
    if (!row.abilityId) addReport(context, "defaulted", `${rowPath}.abilityId`, `Assigned stable legacy ability ID "${abilityId}".`);
    if (ids.has(abilityId)) {
      addDiagnostic(context, "stable-id-collision", `${rowPath}.abilityId`, `Duplicate ability ID "${abilityId}".`);
      continue;
    }
    ids.add(abilityId);
    out.push({
      abilityId,
      sourceId: textValue(row.sourceId, `${rowPath}.sourceId`, context, { maxLen: 260 }),
      name,
      text,
    });
  }
  return out;
}

function normalizeConditions(value, path, context) {
  const out = [];
  for (const [index, raw] of boundedArray(value, path, context, 100).entries()) {
    const rowPath = `${path}[${index}]`;
    const row = objectValue(raw, rowPath, context);
    diagnoseUnknownKeys(row, ["name", "n", "notes"], rowPath, context);
    reportMissingKeys(row, { name: "", n: "", notes: "" }, rowPath, context);
    const name = textValue(row.name, `${rowPath}.name`, context, { maxLen: 120 });
    const notes = textValue(row.notes, `${rowPath}.notes`, context, { maxLen: 1000, collapse: false });
    const n = row.n === undefined || row.n === null || row.n === ""
      ? ""
      : String(integerValue(row.n, `${rowPath}.n`, context, { min: 0, max: 999999, fallback: 0 }));
    if (!name && !notes && n === "") continue;
    out.push({ name, n, notes });
  }
  return out;
}

function normalizeSheet(value, path, context) {
  const source = legacySheetEnvelope(value, path, context);
  const defaultCharacter = createDefaultCharacter({ ownerUid: "migration-placeholder" });
  const fields = defaultCharacter.builder.sheet.fields;
  for (const key of CHARACTER_CODEC_FIELDS.sheetFields) {
    if (!hasOwn(source.fields, key)) {
      reportDefault(context, `${path}.fields.${key}`, fields[key]);
      continue;
    }
    if (key === "overstrained") fields[key] = booleanValue(source.fields[key], `${path}.fields.${key}`, context);
    else if (key === "notes") fields[key] = textValue(source.fields[key], `${path}.fields.${key}`, context, { maxLen: 20000, collapse: false });
    else if (key === "hpcur" || key === "strain") {
      fields[key] = source.fields[key] === "" ? "" : String(integerValue(source.fields[key], `${path}.fields.${key}`, context, { min: 0, max: 999999, fallback: 0 }));
    } else fields[key] = normalizeRank(source.fields[key], `${path}.fields.${key}`, context);
  }

  for (const key of Object.keys(source.fields).sort()) {
    if (CHARACTER_CODEC_FIELDS.sheetFields.includes(key)) continue;
    const fieldPath = `${path}.fields.${key}`;
    if (LEGACY_SHEET_FIELD_KEYS.has(key)) {
      if (key === "playerName" && textValue(source.fields[key], fieldPath, context, { maxLen: 120 })) {
        addDiagnostic(context, "unresolved-legacy-field", fieldPath, "Player name has no canonical v5 storage binding and cannot be discarded automatically.");
      } else {
        addReport(context, "removed", fieldPath, "Removed a known legacy mirror or derived sheet field; canonical builder/rules state owns this value.");
      }
      continue;
    }
    addDiagnostic(context, "unknown-legacy-field", fieldPath, "Unknown historical sheet field cannot be discarded safely.");
  }

  const repeatables = source.repeatables;
  for (const key of CHARACTER_CODEC_FIELDS.sheetRepeatables) {
    if (!hasOwn(repeatables, key)) reportDefault(context, `${path}.repeatables.${key}`, []);
  }
  const outputRepeatables = {
    combatSkillsExtra: normalizeNamedSkills(repeatables.combatSkillsExtra, `${path}.repeatables.combatSkillsExtra`, context, 50),
    settingSkills: normalizeNamedSkills(repeatables.settingSkills, `${path}.repeatables.settingSkills`, context, 50),
    abilities: normalizeAbilities(repeatables.abilities, `${path}.repeatables.abilities`, context),
    conditions: normalizeConditions(repeatables.conditions, `${path}.repeatables.conditions`, context),
  };
  for (const key of Object.keys(repeatables).sort()) {
    if (CHARACTER_CODEC_FIELDS.sheetRepeatables.includes(key)) continue;
    const valueAtKey = repeatables[key];
    const repeatablePath = `${path}.repeatables.${key}`;
    if (LEGACY_REPEATABLE_KEYS.has(key) && !hasMeaningfulLegacyValue(valueAtKey)) {
      addReport(context, "removed", repeatablePath, "Removed an empty legacy repeatable collection.");
      continue;
    }
    if (["originKeystones", "bondKeystones", "backgroundKeystones"].includes(key)) {
      addReport(context, "renamed", repeatablePath, "Legacy keystone rows were moved into canonical builder state.");
      continue;
    }
    addDiagnostic(context, "unresolved-legacy-field", repeatablePath, "Populated legacy repeatable has no lossless v5 storage binding.");
  }
  return { fields, repeatables: outputRepeatables };
}

function normalizeBonds(value, path, context) {
  const out = [];
  const ids = new Set();
  for (const [index, raw] of boundedArray(value, path, context, 50).entries()) {
    const rowPath = `${path}[${index}]`;
    const row = objectValue(raw, rowPath, context);
    diagnoseUnknownKeys(row, ["bondId", "name", "rank", "keystone", "notes"], rowPath, context);
    reportMissingKeys(row, { name: "", rank: "", keystone: "" }, rowPath, context);
    const name = textValue(row.name, `${rowPath}.name`, context, { maxLen: 96 });
    const rank = normalizeRank(row.rank, `${rowPath}.rank`, context, { positive: true });
    const keystone = textValue(row.keystone ?? row.notes, `${rowPath}.keystone`, context, { maxLen: 400 });
    if (!name && !rank && !keystone) continue;
    const bondId = textValue(row.bondId, `${rowPath}.bondId`, context, { maxLen: 260 })
      || generatedLegacyId("bond", { name, rank, keystone }, index);
    if (!row.bondId) addReport(context, "defaulted", `${rowPath}.bondId`, `Assigned stable legacy bond ID "${bondId}".`);
    if (ids.has(bondId)) {
      addDiagnostic(context, "stable-id-collision", `${rowPath}.bondId`, `Duplicate bond ID "${bondId}".`);
      continue;
    }
    ids.add(bondId);
    out.push({ bondId, name, rank, keystone });
  }
  return out;
}

function normalizeEnhancements(value, path, context) {
  const out = [];
  const ids = new Set();
  for (const [index, raw] of boundedArray(value, path, context, 20).entries()) {
    const rowPath = `${path}[${index}]`;
    const row = objectValue(raw, rowPath, context);
    diagnoseUnknownKeys(row, ["id", "enhancementKey", "rank", "selections", "granted"], rowPath, context);
    reportMissingKeys(row, { enhancementKey: "", rank: 0, selections: {}, granted: false }, rowPath, context);
    const enhancementKey = stableTokenValue(row.enhancementKey, `${rowPath}.enhancementKey`, context);
    if (!enhancementKey) {
      addDiagnostic(context, "unresolved-reference", `${rowPath}.enhancementKey`, "Weapon enhancement lacks a stable enhancement key.");
      continue;
    }
    const id = textValue(row.id, `${rowPath}.id`, context, { maxLen: 260 })
      || generatedLegacyId("enhancement", { enhancementKey, rank: row.rank }, index);
    if (!row.id) addReport(context, "defaulted", `${rowPath}.id`, `Assigned stable legacy enhancement ID "${id}".`);
    if (ids.has(id)) {
      addDiagnostic(context, "stable-id-collision", `${rowPath}.id`, `Duplicate enhancement ID "${id}".`);
      continue;
    }
    ids.add(id);
    const selections = {};
    for (const [selectionKey, rawSelection] of Object.entries(objectValue(row.selections, `${rowPath}.selections`, context)).sort(([a], [b]) => a.localeCompare(b))) {
      const key = stableTokenValue(selectionKey, `${rowPath}.selections.${selectionKey}`, context);
      const selection = textValue(rawSelection, `${rowPath}.selections.${selectionKey}`, context, { maxLen: 96, allowEmpty: false });
      if (key && selection) selections[key] = selection;
    }
    out.push({
      id,
      enhancementKey,
      rank: integerValue(row.rank, `${rowPath}.rank`, context, { min: 0, max: 8, fallback: 0 }),
      selections,
      granted: booleanValue(row.granted, `${rowPath}.granted`, context),
    });
  }
  return out;
}

function normalizeWeapons(value, path, context) {
  const out = [];
  const ids = new Set();
  for (const [index, raw] of boundedArray(value, path, context, 20).entries()) {
    const rowPath = `${path}[${index}]`;
    const row = objectValue(raw, rowPath, context);
    diagnoseUnknownKeys(
      row,
      ["id", "choiceId", "sourceChoiceId", "generated", "weaponKey", "rank", "customName", "enhancements"],
      rowPath,
      context,
    );
    reportMissingKeys(
      row,
      { choiceId: "", sourceChoiceId: "", generated: false, weaponKey: "", rank: 0, customName: "", enhancements: [] },
      rowPath,
      context,
    );
    const weaponKey = stableTokenValue(row.weaponKey, `${rowPath}.weaponKey`, context);
    if (!weaponKey) {
      addDiagnostic(context, "unresolved-reference", `${rowPath}.weaponKey`, "Structured weapon lacks a stable weapon key.");
      continue;
    }
    const customName = textValue(row.customName, `${rowPath}.customName`, context, { maxLen: 120 });
    const id = textValue(row.id, `${rowPath}.id`, context, { maxLen: 260 })
      || generatedLegacyId("weapon", { weaponKey, customName, rank: row.rank }, index);
    if (!row.id) addReport(context, "defaulted", `${rowPath}.id`, `Assigned stable legacy weapon ID "${id}".`);
    if (ids.has(id)) {
      addDiagnostic(context, "stable-id-collision", `${rowPath}.id`, `Duplicate weapon ID "${id}".`);
      continue;
    }
    ids.add(id);
    const choiceId = textValue(row.choiceId, `${rowPath}.choiceId`, context, { maxLen: 260 });
    const sourceChoiceId = textValue(row.sourceChoiceId, `${rowPath}.sourceChoiceId`, context, { maxLen: 260 });
    const generated = booleanValue(row.generated, `${rowPath}.generated`, context);
    if (generated && !sourceChoiceId) addDiagnostic(context, "missing-source-owner", `${rowPath}.sourceChoiceId`, "Generated weapon has no source-owned choice ID.");
    out.push({
      id,
      choiceId,
      sourceChoiceId,
      generated,
      weaponKey,
      rank: integerValue(row.rank, `${rowPath}.rank`, context, { min: 0, max: 8, fallback: 0 }),
      customName,
      enhancements: normalizeEnhancements(row.enhancements, `${rowPath}.enhancements`, context),
    });
  }
  return out;
}

function normalizeGrantChoices(value, path, context) {
  const source = objectValue(value, path, context);
  if (Object.keys(source).length > 100) {
    addDiagnostic(context, "too-many-legacy-items", path, "Historical grant-choice map exceeds 100 items.");
  }
  const out = {};
  for (const rawChoiceId of Object.keys(source).sort().slice(0, 100)) {
    const rowPath = `${path}.${rawChoiceId}`;
    const row = objectValue(source[rawChoiceId], rowPath, context);
    diagnoseUnknownKeys(
      row,
      [
        "choiceId", "type", "sourceId", "sourceLabel", "value", "techniqueKey", "techniqueName",
        "skillKey", "skill", "weaponKey", "rank", "customName", "enhancements", "tags",
      ],
      rowPath,
      context,
    );
    reportMissingKeys(
      row,
      {
        choiceId: rawChoiceId, type: "", sourceId: "", sourceLabel: "", value: "", techniqueKey: "",
        skillKey: "", weaponKey: "", rank: 0, customName: "", enhancements: [], tags: [],
      },
      rowPath,
      context,
    );
    const choiceId = textValue(row.choiceId ?? rawChoiceId, `${rowPath}.choiceId`, context, { maxLen: 260, allowEmpty: false });
    if (!choiceId) continue;
    if (choiceId !== rawChoiceId) addDiagnostic(context, "stable-id-collision", `${rowPath}.choiceId`, "Grant choice ID does not match its map key.");
    const type = stableTokenValue(row.type, `${rowPath}.type`, context, { allowEmpty: false });
    const legacyTechnique = row.techniqueKey ?? row.techniqueName ?? (type === "technique" ? row.value : "");
    const legacySkill = row.skillKey ?? row.skill;
    const techniqueKey = legacyTechnique
      ? resolveReference(legacyTechnique, "techniques", `${rowPath}.techniqueKey`, context, { allowEmpty: false })
      : "";
    const skillKey = legacySkill
      ? resolveReference(legacySkill, "skills", `${rowPath}.skillKey`, context, { allowEmpty: false })
      : "";
    const weaponKey = stableTokenValue(row.weaponKey, `${rowPath}.weaponKey`, context);
    const valueKey = row.value && row.value !== row.techniqueName
      ? stableTokenValue(row.value, `${rowPath}.value`, context)
      : "";
    out[choiceId] = {
      choiceId,
      type,
      sourceId: textValue(row.sourceId, `${rowPath}.sourceId`, context, { maxLen: 260, allowEmpty: false }),
      sourceLabel: textValue(row.sourceLabel, `${rowPath}.sourceLabel`, context, { maxLen: 200 }),
      value: valueKey,
      techniqueKey,
      skillKey,
      weaponKey,
      rank: integerValue(row.rank, `${rowPath}.rank`, context, { min: 0, max: 8, fallback: 0 }),
      customName: textValue(row.customName, `${rowPath}.customName`, context, { maxLen: 120 }),
      enhancements: normalizeEnhancements(row.enhancements, `${rowPath}.enhancements`, context),
      tags: canonicalStringArray(row.tags, `${rowPath}.tags`, context, { maxItems: 50, maxLen: 128 })
        .map((tag, index) => {
          return stableTokenValue(tag, `${rowPath}.tags[${index}]`, context);
        })
        .filter(Boolean),
    };
  }
  return out;
}

function normalizeResources(value, path, context) {
  const source = objectValue(value, path, context);
  if (Object.keys(source).length > 100) {
    addDiagnostic(context, "too-many-legacy-items", path, "Historical resource map exceeds 100 items.");
  }
  const out = {};
  for (const rawResourceKey of Object.keys(source).sort().slice(0, 100)) {
    const rowPath = `${path}.${rawResourceKey}`;
    const row = objectValue(source[rawResourceKey], rowPath, context);
    diagnoseUnknownKeys(row, ["resourceKey", "name", "capacity", "current"], rowPath, context);
    reportMissingKeys(row, { resourceKey: rawResourceKey, name: rawResourceKey, capacity: 0, current: row.capacity ?? 0 }, rowPath, context);
    const resourceKey = stableTokenValue(row.resourceKey ?? rawResourceKey, `${rowPath}.resourceKey`, context, { allowEmpty: false });
    if (!resourceKey) {
      addDiagnostic(context, "invalid-legacy-value", `${rowPath}.resourceKey`, "Resource key cannot become a canonical stable key.");
      continue;
    }
    if (resourceKey !== rawResourceKey) addDiagnostic(context, "stable-id-collision", `${rowPath}.resourceKey`, "Resource key does not match its map key.");
    const capacity = integerValue(row.capacity, `${rowPath}.capacity`, context, { min: 0, max: 9999, fallback: 0 });
    const current = integerValue(row.current, `${rowPath}.current`, context, { min: 0, max: 9999, fallback: capacity });
    if (current > capacity) addDiagnostic(context, "invalid-legacy-value", `${rowPath}.current`, "Current resource amount exceeds capacity.");
    out[resourceKey] = {
      resourceKey,
      name: textValue(row.name ?? resourceKey, `${rowPath}.name`, context, { maxLen: 120, allowEmpty: false }),
      capacity,
      current,
    };
  }
  return out;
}

function migrate4To5(input, context) {
  context.fromVersion = 4;
  context.toVersion = 5;
  const source = objectValue(input.builder, "character.builder", context);
  const ownerUid = textValue(input.ownerUid, "character.ownerUid", context, { maxLen: 128, allowEmpty: false });
  const output = createDefaultCharacter({ ownerUid: ownerUid || "migration-invalid-owner" });
  output.ownerUid = ownerUid;
  const builder = output.builder;
  for (const key of CHARACTER_CODEC_FIELDS.builder) {
    if (!hasOwn(source, key)) reportDefault(context, `character.builder.${key}`, cloneValue(builder[key]));
  }
  builder.name = textValue(source.name, "character.builder.name", context, { maxLen: 64 });
  const portraitPath = textValue(source.portraitPath, "character.builder.portraitPath", context, { maxLen: 256 });
  builder.portraitPath = sanitizeStoragePath(portraitPath);
  if (portraitPath && !builder.portraitPath) addDiagnostic(context, "invalid-legacy-value", "character.builder.portraitPath", "Historical portrait path is not a canonical Storage path.");
  builder.level = integerValue(source.level, "character.builder.level", context, { min: 1, max: 12, fallback: 1 });
  builder.classKey = source.classKey
    ? resolveReference(source.classKey, "classes", "character.builder.classKey", context, { allowEmpty: false })
    : "";
  builder.primaryAttribute = textValue(source.primaryAttribute, "character.builder.primaryAttribute", context, { maxLen: 32 }).toLowerCase();
  builder.attributes = normalizeAttributes(source.attributes, builder.level, builder.primaryAttribute, "character.builder.attributes", context);
  builder.originKey = source.originKey
    ? resolveReference(source.originKey, "origins", "character.builder.originKey", context, { allowEmpty: false })
    : "";
  builder.originKeystone = textValue(source.originKeystone, "character.builder.originKeystone", context, { maxLen: 400 });
  builder.selectedClassFeatureOptions = resolveReferenceArray(source.selectedClassFeatureOptions, "classFeatureOptions", "character.builder.selectedClassFeatureOptions", context, { maxItems: 500 });
  builder.selectedClassUtilitySkills = resolveReferenceArray(source.selectedClassUtilitySkills, "skills", "character.builder.selectedClassUtilitySkills", context, { maxItems: 50 });
  builder.selectedFeats = resolveReferenceArray(source.selectedFeats, "feats", "character.builder.selectedFeats", context, { maxItems: 200 });
  builder.selectedFeatOptions = resolveReferenceArray(source.selectedFeatOptions, "featOptions", "character.builder.selectedFeatOptions", context, { maxItems: 500 });
  builder.autoAbilityNames = canonicalStringArray(source.autoAbilityNames, "character.builder.autoAbilityNames", context, { maxItems: 500, maxLen: 200 });
  builder.grantedCoreSkillSnapshot = resolveReferenceArray(source.grantedCoreSkillSnapshot, "skills", "character.builder.grantedCoreSkillSnapshot", context, { maxItems: 50 });
  builder.grantedSkillSnapshot = resolveReferenceArray(source.grantedSkillSnapshot, "skills", "character.builder.grantedSkillSnapshot", context, { maxItems: 200 });
  builder.bonds = normalizeBonds(source.bonds, "character.builder.bonds", context);
  builder.backgroundKeystones = canonicalStringArray(source.backgroundKeystones, "character.builder.backgroundKeystones", context, { maxItems: 2, maxLen: 400 });
  builder.weapons = normalizeWeapons(source.weapons, "character.builder.weapons", context);
  builder.grantChoices = normalizeGrantChoices(source.grantChoices, "character.builder.grantChoices", context);
  builder.resources = normalizeResources(source.resources, "character.builder.resources", context);
  builder.visitedSteps = canonicalStringArray(source.visitedSteps, "character.builder.visitedSteps", context, { maxItems: BUILDER_STEP_IDS.size, maxLen: 64 });
  builder.selectedTechniques = resolveReferenceArray(source.selectedTechniques, "techniques", "character.builder.selectedTechniques", context, { maxItems: 500 });
  builder.sheet = normalizeSheet(source.sheet, "character.builder.sheet", context);

  for (const step of builder.visitedSteps) {
    if (!BUILDER_STEP_IDS.has(step)) addDiagnostic(context, "unknown-legacy-enum", "character.builder.visitedSteps", `Unknown builder step "${step}".`);
  }
  const allowedBuilderKeys = new Set([...CHARACTER_CODEC_FIELDS.builder, "lastVisitedAt"]);
  for (const key of Object.keys(source).sort()) {
    if (!allowedBuilderKeys.has(key)) addDiagnostic(context, "unknown-legacy-field", `character.builder.${key}`, "Unknown historical builder field cannot be discarded safely.");
  }
  const allowedRootKeys = new Set(["schemaVersion", "ownerUid", "builder", "createdAt", "updatedAt", "lastVisitedAt"]);
  for (const key of Object.keys(input).sort()) {
    if (!allowedRootKeys.has(key)) addDiagnostic(context, "unknown-legacy-field", `character.${key}`, "Unknown historical root field cannot be discarded safely.");
  }
  addReport(context, "renamed", "character.schemaVersion", "Converted the complete historical character shape to canonical schema version 5.");
  return output;
}

export const CHARACTER_MIGRATION_STEPS = Object.freeze([
  Object.freeze({ fromVersion: 0, toVersion: 1, migrate: migrateLegacyTo1 }),
  Object.freeze({ fromVersion: 1, toVersion: 3, migrate: migrate1To3 }),
  Object.freeze({ fromVersion: 3, toVersion: 4, migrate: migrate3To4 }),
  Object.freeze({ fromVersion: 4, toVersion: 5, migrate: migrate4To5 }),
]);

function classifyVersion(value, context) {
  if (!isPlainObject(value)) {
    addDiagnostic(context, "invalid-character-document", "character", "Character document must be a plain object.");
    return null;
  }
  if (!hasOwn(value, "schemaVersion")) {
    if (!hasOwn(value, "builder") && isPlainObject(value.sheet) && typeof value.ownerUid === "string") {
      return LEGACY_UNVERSIONED_CHARACTER_SCHEMA;
    }
    addDiagnostic(context, "missing-schema-version", "character.schemaVersion", "Unversioned document does not match the exact recognized legacy envelope.");
    return null;
  }
  if (!Number.isInteger(value.schemaVersion)) {
    addDiagnostic(context, "invalid-schema-version", "character.schemaVersion", "Character schema version must be an integer.");
    return null;
  }
  if (value.schemaVersion === RESERVED_CHARACTER_SCHEMA_VERSION) {
    addDiagnostic(context, "reserved-schema-version", "character.schemaVersion", "Schema version 2 was never emitted by repository code and cannot be inferred safely.");
    return null;
  }
  if (!SUPPORTED_CHARACTER_SCHEMA_VERSIONS.includes(value.schemaVersion)) {
    addDiagnostic(context, "unsupported-schema-version", "character.schemaVersion", `Unsupported character schema version ${value.schemaVersion}.`);
    return null;
  }
  return value.schemaVersion;
}

function extractMetadata(value) {
  const builder = isPlainObject(value?.builder) ? value.builder : {};
  return {
    createdAt: hasOwn(value || {}, "createdAt") ? cloneValue(value.createdAt) : null,
    updatedAt: hasOwn(value || {}, "updatedAt") ? cloneValue(value.updatedAt) : null,
    lastVisitedAt: hasOwn(value || {}, "lastVisitedAt")
      ? cloneValue(value.lastVisitedAt)
      : hasOwn(builder, "lastVisitedAt") ? cloneValue(builder.lastVisitedAt) : null,
  };
}

function stripV5Metadata(value, metadata, context) {
  const output = cloneValue(value);
  for (const key of ["createdAt", "updatedAt", "lastVisitedAt"]) {
    if (!hasOwn(output, key)) continue;
    delete output[key];
    addReport(context, "preserved", `metadata.${key}`, `Separated repository metadata ${key} from canonical character state.`);
  }
  if (isPlainObject(output.builder) && hasOwn(output.builder, "lastVisitedAt")) {
    delete output.builder.lastVisitedAt;
    addReport(context, "preserved", "metadata.lastVisitedAt", "Separated legacy builder visit timestamp from canonical character state.");
  }
  return output;
}

function resultSummary(report) {
  const summary = {};
  for (const item of report) summary[item.kind] = (summary[item.kind] || 0) + 1;
  return Object.freeze(summary);
}

export function migrateCharacterDocument(value, { references = null } = {}) {
  const diagnostics = [];
  const report = [];
  const context = {
    diagnostics,
    report,
    references,
    fromVersion: null,
    toVersion: CHARACTER_SCHEMA_VERSION,
  };
  const metadata = extractMetadata(value);
  const classifiedVersion = classifyVersion(value, context);
  if (classifiedVersion === null) {
    return Object.freeze({
      ok: false,
      value: null,
      metadata: Object.freeze(metadata),
      fromVersion: null,
      toVersion: CHARACTER_SCHEMA_VERSION,
      appliedVersions: Object.freeze([]),
      diagnostics: Object.freeze(diagnostics),
      report: Object.freeze(report),
      summary: resultSummary(report),
    });
  }

  let current = cloneValue(value);
  let version = classifiedVersion;
  const appliedVersions = [];
  if (version === CHARACTER_SCHEMA_VERSION) {
    current = stripV5Metadata(current, metadata, context);
  } else {
    while (version !== CHARACTER_SCHEMA_VERSION) {
      const step = CHARACTER_MIGRATION_STEPS.find((candidate) => candidate.fromVersion === version);
      if (!step) {
        addDiagnostic(context, "missing-migration-step", "character.schemaVersion", `No migration step begins at schema version ${version}.`);
        break;
      }
      current = step.migrate(current, context);
      appliedVersions.push(Object.freeze({ fromVersion: step.fromVersion, toVersion: step.toVersion }));
      version = step.toVersion;
    }
  }

  if (version === CHARACTER_SCHEMA_VERSION) {
    const codecResult = validateCharacter(current);
    for (const diagnostic of codecResult.diagnostics) {
      diagnostics.push(Object.freeze({ ...diagnostic, fromVersion: classifiedVersion, toVersion: CHARACTER_SCHEMA_VERSION }));
    }
  }
  const ok = diagnostics.length === 0 && version === CHARACTER_SCHEMA_VERSION;
  return Object.freeze({
    ok,
    value: ok ? cloneValue(current) : null,
    metadata: Object.freeze(metadata),
    fromVersion: classifiedVersion,
    toVersion: CHARACTER_SCHEMA_VERSION,
    appliedVersions: Object.freeze(appliedVersions),
    diagnostics: Object.freeze(diagnostics),
    report: Object.freeze(report),
    summary: resultSummary(report),
  });
}

function addReference(work, kind, alias, stableKey) {
  const normalizedAlias = referenceAlias(alias);
  const normalizedKey = sanitizeText(stableKey, { maxLen: 128, collapse: true });
  if (!normalizedAlias || !STABLE_KEY_PATTERN.test(normalizedKey)) return;
  const table = work[kind];
  const values = table.get(normalizedAlias) || new Set();
  values.add(normalizedKey);
  table.set(normalizedAlias, values);
}

function legacySlug(value) {
  return sanitizeText(value, { maxLen: 160, collapse: true })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function walkFeatureOptions(entries, ownerKey, work) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    const entryKey = entry?.featureKey;
    if (entryKey) addReference(work, "classFeatureOptions", entryKey, entryKey);
    const options = Array.isArray(entry?.options) ? entry.options : [];
    if (options.length) {
      const level = Number.parseInt(String(entry?.level ?? entry?.minLevel ?? 0), 10) || 0;
      const currentGroup = `${ownerKey}|L${level}|${entry?.name || ""}`;
      const v1Group = `cfg:${ownerKey}:${level}:${legacySlug(entry?.name)}`;
      for (const option of options) {
        const stableKey = option?.featureKey;
        addReference(work, "classFeatureOptions", stableKey, stableKey);
        addReference(work, "classFeatureOptions", `${currentGroup}::${option?.name || ""}`, stableKey);
        addReference(work, "classFeatureOptions", `${v1Group}::${option?.name || ""}`, stableKey);
      }
    }
    walkFeatureOptions(options, ownerKey, work);
  }
}

function walkFeats(entries, work, parent = null) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    const stableKey = entry?.featKey;
    addReference(work, parent ? "featOptions" : "feats", stableKey, stableKey);
    addReference(work, parent ? "featOptions" : "feats", entry?.name, stableKey);
    if (!parent) {
      addReference(work, "feats", `feat:${entry?.classKey || ""}:${Number(entry?.minLevel || 0)}:${entry?.name || ""}`, stableKey);
    } else {
      const level = Number.parseInt(String(parent?.level ?? parent?.minLevel ?? 0), 10) || 0;
      addReference(work, "featOptions", `${parent?.classKey || ""}|L${level}|${parent?.name || ""}::${entry?.name || ""}`, stableKey);
    }
    walkFeats(entry?.options, work, entry);
  }
}

function collectGrantSkillReferences(entry, work) {
  for (const grant of Array.isArray(entry?.grants) ? entry.grants : []) {
    const skillKey = grant?.skillKey || grant?.key;
    if (grant?.type === "skill" && skillKey) {
      addReference(work, "skills", skillKey, skillKey);
      addReference(work, "skills", grant?.name, skillKey);
    }
  }
  for (const option of Array.isArray(entry?.options) ? entry.options : []) collectGrantSkillReferences(option, work);
}

export function createCharacterMigrationReferences(gameData = {}) {
  const work = Object.fromEntries(REFERENCE_KINDS.map((kind) => [kind, new Map()]));
  for (const skill of [...CORE_SKILL_FIELDS, ...DEFENSE_SKILL_FIELDS]) {
    const key = String(skill.key || "").replace(/^rank_/, "");
    addReference(work, "skills", key, key);
    addReference(work, "skills", skill.label, key);
  }
  for (const cls of Array.isArray(gameData.classes) ? gameData.classes : []) {
    addReference(work, "classes", cls?.classKey, cls?.classKey);
    addReference(work, "classes", cls?.name, cls?.classKey);
    addReference(work, "classes", String(cls?.classKey || "").replace(/-/g, ""), cls?.classKey);
  }
  for (const origin of Array.isArray(gameData.origins) ? gameData.origins : []) {
    addReference(work, "origins", origin?.originKey, origin?.originKey);
    addReference(work, "origins", origin?.name, origin?.originKey);
    collectGrantSkillReferences(origin, work);
    for (const feature of Array.isArray(origin?.features) ? origin.features : []) collectGrantSkillReferences(feature, work);
  }
  for (const skill of Array.isArray(gameData.classSkills) ? gameData.classSkills : []) {
    addReference(work, "skills", skill?.skillKey, skill?.skillKey);
    addReference(work, "skills", skill?.skillName ?? skill?.name, skill?.skillKey);
  }
  const classFeatures = isPlainObject(gameData.classFeatures) ? gameData.classFeatures : {};
  for (const [classKey, entries] of Object.entries(classFeatures)) {
    walkFeatureOptions(entries, classKey, work);
    for (const entry of Array.isArray(entries) ? entries : []) collectGrantSkillReferences(entry, work);
  }
  walkFeats(gameData.feats, work);
  for (const feat of Array.isArray(gameData.feats) ? gameData.feats : []) collectGrantSkillReferences(feat, work);
  for (const technique of Array.isArray(gameData.techniques) ? gameData.techniques : []) {
    const key = technique?.techniqueKey;
    addReference(work, "techniques", key, key);
    addReference(work, "techniques", technique?.techniqueName ?? technique?.name, key);
  }
  const output = {};
  for (const kind of REFERENCE_KINDS) {
    output[kind] = Object.freeze(Object.fromEntries(
      [...work[kind].entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([alias, values]) => [alias, Object.freeze([...values].sort())]),
    ));
  }
  return Object.freeze(output);
}

export const CharacterMigrations = Object.freeze({
  currentVersion: CHARACTER_SCHEMA_VERSION,
  supportedVersions: SUPPORTED_CHARACTER_SCHEMA_VERSIONS,
  steps: CHARACTER_MIGRATION_STEPS,
  migrate: migrateCharacterDocument,
  createReferences: createCharacterMigrationReferences,
});
