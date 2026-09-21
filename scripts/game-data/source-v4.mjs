import {
  parseGrantExpressions,
  parsePrerequisiteExpressions,
} from "../../public/js/core/game-data-expressions.js";

export const SOURCE_TAB_HEADERS = Object.freeze({
  Metadata: Object.freeze(["key", "value"]),
  Schema: Object.freeze(["tab", "field", "type", "required", "valuesOrFormat", "default", "description"]),
  Enums: Object.freeze(["domain", "value", "meaning"]),
  Classes: Object.freeze([
    "classKey", "name", "pitch", "examples", "hpProgression", "primaryAttributeA", "primaryAttributeB",
    "combatTechniqueSkill", "combatSkills", "utilitySkillOptions", "levelUp", "notes", "status",
  ]),
  ClassSkills: Object.freeze([
    "classKey", "skillKey", "skillName", "role", "progression", "whenPrimaryAttribute", "choiceGroup", "displayOrder",
  ]),
  ClassFeatures: Object.freeze([
    "classKey", "level", "rowType", "featureKey", "name", "parentKey", "description", "chooseCount", "grants",
    "grantNotes", "prerequisites", "notes", "grantText",
  ]),
  Techniques: Object.freeze([
    "techniqueName", "description", "skill", "rank", "tags", "prerequisites", "actionType", "actions", "trigger",
    "energyCost", "strainCost", "sustained", "rollRequired", "attribute", "defense", "range", "targets", "damage",
    "onSuccess", "onCriticalSuccess", "onFailure", "onCriticalFailure", "bondEffect", "notes", "damageByRank",
    "pumpDamageByRank", "rankNotes", "sourceNote", "techniqueKey", "selectionMode", "energyCostKind", "energyCostOptions",
    "prerequisiteText", "skillKeys", "tagKeys",
  ]),
  Feats: Object.freeze([
    "category", "rowType", "featKey", "name", "parentKey", "prerequisites", "description", "grants", "grantNotes",
    "featType", "chooseCount", "notes", "grantText",
  ]),
  Origins: Object.freeze([
    "originKey", "name", "status", "summary", "description", "originKeystone", "questions", "futureUpgradesText",
    "examplesText", "notes",
  ]),
  OriginFeatures: Object.freeze([
    "originKey", "level", "rowType", "featureKey", "name", "description", "grants", "grantNotes", "parentKey",
    "chooseCount", "prerequisites", "notes", "grantText",
  ]),
  WeaponBases: Object.freeze([
    "weaponKey", "name", "description", "minRank", "tags", "notes", "sourceNote", "tagKeys",
  ]),
  WeaponProfiles: Object.freeze([
    "weaponKey", "profileType", "profileName", "description", "rank", "tags", "actionType", "actions", "trigger",
    "energyCost", "strainCost", "sustained", "rollRequired", "attribute", "skill", "defense", "range", "targets",
    "damage", "damageTier", "onSuccess", "onCriticalSuccess", "onFailure", "onCriticalFailure", "bondEffect", "notes",
    "damageByRank", "pumpDamageByRank", "rankNotes", "prerequisites", "sourceNote",
  ]),
  WeaponEnhancements: Object.freeze([
    "enhancementKey", "name", "description", "minRank", "prerequisites", "notes", "sourceNote", "selectionMode",
  ]),
});

const MODEL_TABS = Object.freeze({
  Classes: "classes",
  ClassSkills: "classSkills",
  ClassFeatures: "classFeatures",
  Techniques: "techniques",
  Feats: "feats",
  Origins: "origins",
  OriginFeatures: "originFeatures",
  WeaponBases: "weaponBases",
  WeaponProfiles: "weaponProfiles",
  WeaponEnhancements: "weaponEnhancements",
});

function clean(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function nullable(value) {
  const valueText = clean(value);
  return valueText || null;
}

function excelColumn(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function diagnostic(code, message, {
  sheet = null,
  row = null,
  column = null,
  headers = null,
  severity = "error",
} = {}) {
  const columnIndex = column && Array.isArray(headers) ? headers.indexOf(column) : -1;
  return Object.freeze({
    severity,
    code,
    message,
    sheet,
    row,
    column,
    cell: row && columnIndex >= 0 ? `${excelColumn(columnIndex)}${row}` : null,
  });
}

function rowObject(sheet, rawRow) {
  return Object.fromEntries(sheet.headers.map((header, index) => [header, rawRow.values[index] ?? null]));
}

function splitList(value, separator = /[;,]/) {
  const source = clean(value);
  return source ? source.split(separator).map((item) => item.trim()).filter(Boolean) : [];
}

function textBlockList(value) {
  const source = clean(value).replace(/\r\n?/g, "\n");
  if (!source) return [];
  return source.split(/\n|;/).map((item) => item.replace(/^\s*(?:[-*•▪◦‣]+|\d+[.)])\s*/, "").trim()).filter(Boolean);
}

function sourceOf(sheet, rawRow) {
  return Object.freeze({ sheet: sheet.name, row: rawRow.rowNumber });
}

function contextOf(sheet, rawRow) {
  return Object.freeze({ sheet: sheet.name, row: rawRow.rowNumber, headers: sheet.headers });
}

function requiredText(row, field, context, diagnostics) {
  const value = nullable(row[field]);
  if (!value) diagnostics.push(diagnostic("required-cell", `Required field "${field}" is blank.`, { ...context, column: field }));
  return value;
}

function integer(row, field, context, diagnostics, { required = false, min = null } = {}) {
  const raw = clean(row[field]);
  if (!raw) {
    if (required) diagnostics.push(diagnostic("required-cell", `Required integer field "${field}" is blank.`, { ...context, column: field }));
    return null;
  }
  const value = typeof row[field] === "number" ? row[field] : Number(raw);
  if (!Number.isInteger(value) || (min !== null && value < min)) {
    diagnostics.push(diagnostic("invalid-integer", `Field "${field}" must be an integer${min === null ? "" : ` of at least ${min}`}.`, { ...context, column: field }));
    return null;
  }
  return value;
}

function numberValue(row, field, context, diagnostics) {
  const raw = clean(row[field]);
  if (!raw) return null;
  const value = typeof row[field] === "number" ? row[field] : Number(raw);
  if (!Number.isFinite(value)) {
    diagnostics.push(diagnostic("invalid-number", `Field "${field}" must be numeric.`, { ...context, column: field }));
    return null;
  }
  return value;
}

function booleanValue(row, field, context, diagnostics) {
  const raw = clean(row[field]).toLowerCase();
  if (!raw) return null;
  if (["y", "yes", "true", "1"].includes(raw)) return true;
  if (["n", "no", "false", "0"].includes(raw)) return false;
  diagnostics.push(diagnostic("invalid-boolean", `Field "${field}" must be Y/N or true/false.`, { ...context, column: field }));
  return null;
}

function rankMap(row, field, context, diagnostics) {
  const raw = clean(row[field]);
  if (!raw) return null;
  const result = {};
  for (const part of raw.split(";").map((item) => item.trim()).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator <= 0 || !part.slice(separator + 1).trim()) {
      diagnostics.push(diagnostic("invalid-rank-map", `Field "${field}" entries must use rank=value syntax.`, { ...context, column: field }));
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (Object.hasOwn(result, key)) {
      diagnostics.push(diagnostic("duplicate-rank", `Field "${field}" repeats rank "${key}".`, { ...context, column: field }));
      continue;
    }
    result[key] = part.slice(separator + 1).trim();
  }
  return Object.keys(result).length ? Object.freeze(result) : null;
}

function costOptions(row, context, diagnostics) {
  const raw = clean(row.energyCostOptions);
  if (!raw) return [];
  const options = [];
  for (const part of raw.split(";").map((item) => item.trim()).filter(Boolean)) {
    const separator = part.indexOf("=");
    if (separator <= 0 || !part.slice(separator + 1).trim()) {
      diagnostics.push(diagnostic("invalid-cost-option", "Energy-cost options must use mode=value syntax.", { ...context, column: "energyCostOptions" }));
      continue;
    }
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    const numeric = Number(rawValue);
    options.push(Object.freeze({ key, value: Number.isFinite(numeric) ? numeric : rawValue }));
  }
  return Object.freeze(options);
}

function expressions(kind, row, field, context, diagnostics) {
  const raw = clean(row[field]);
  if (!raw) return Object.freeze([]);
  const expressionContext = Object.freeze({ sheet: context.sheet, row: context.row, column: field });
  const result = kind === "grant"
    ? parseGrantExpressions(raw, { context: expressionContext })
    : parsePrerequisiteExpressions(raw, { context: expressionContext });
  for (const item of result.diagnostics) {
    diagnostics.push(diagnostic(`expression-${item.code}`, item.message, {
      ...context,
      column: field,
      severity: item.severity,
    }));
  }
  return Object.freeze(result.values);
}

function nestedKind(row, context, diagnostics) {
  const raw = requiredText(row, "rowType", context, diagnostics);
  const kinds = { FEATURE: "feature", OPTION_GROUP: "optionGroup", OPTION: "option" };
  const kind = raw ? kinds[raw.toUpperCase()] : null;
  if (raw && !kind) diagnostics.push(diagnostic("invalid-row-type", `Unknown nested row type "${raw}".`, { ...context, column: "rowType" }));
  return kind;
}

function commonAction(row, context, diagnostics, { includeCostKind = false } = {}) {
  const energyKind = includeCostKind ? nullable(row.energyCostKind)?.toLowerCase() || null : (clean(row.energyCost) ? "fixed" : null);
  return Object.freeze({
    actionType: nullable(row.actionType),
    actions: numberValue(row, "actions", context, diagnostics),
    trigger: nullable(row.trigger),
    energyCost: Object.freeze({
      kind: energyKind,
      value: numberValue(row, "energyCost", context, diagnostics),
      options: includeCostKind ? costOptions(row, context, diagnostics) : Object.freeze([]),
    }),
    strainCost: numberValue(row, "strainCost", context, diagnostics),
    sustained: booleanValue(row, "sustained", context, diagnostics),
    rollRequired: booleanValue(row, "rollRequired", context, diagnostics),
    attribute: nullable(row.attribute),
    skill: nullable(row.skill),
    defense: nullable(row.defense),
    range: nullable(row.range),
    targets: nullable(row.targets),
    damage: nullable(row.damage),
    onSuccess: nullable(row.onSuccess),
    onCriticalSuccess: nullable(row.onCriticalSuccess),
    onFailure: nullable(row.onFailure),
    onCriticalFailure: nullable(row.onCriticalFailure),
    bondEffect: nullable(row.bondEffect),
  });
}

function adaptMetadata(sheet, diagnostics) {
  const entries = {};
  for (const rawRow of sheet.rows) {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const key = requiredText(row, "key", context, diagnostics);
    if (!key) continue;
    if (Object.hasOwn(entries, key)) diagnostics.push(diagnostic("duplicate-metadata-key", `Metadata key "${key}" is duplicated.`, { ...context, column: "key" }));
    entries[key] = row.value ?? null;
  }
  return Object.freeze(entries);
}

function adaptSchema(sheet, diagnostics) {
  return Object.freeze(sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const requirement = requiredText(row, "required", context, diagnostics)?.toLowerCase() || null;
    if (requirement && !["yes", "no", "conditional"].includes(requirement)) {
      diagnostics.push(diagnostic("invalid-schema-requirement", `Unknown schema requirement "${requirement}".`, { ...context, column: "required" }));
    }
    return Object.freeze({
      tab: requiredText(row, "tab", context, diagnostics),
      field: requiredText(row, "field", context, diagnostics),
      type: requiredText(row, "type", context, diagnostics),
      requirement,
      required: requirement === "yes",
      valuesOrFormat: nullable(row.valuesOrFormat),
      default: row.default ?? null,
      description: nullable(row.description),
      source: sourceOf(sheet, rawRow),
    });
  }));
}

function adaptEnums(sheet, diagnostics) {
  const values = {};
  for (const rawRow of sheet.rows) {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const domain = requiredText(row, "domain", context, diagnostics);
    const value = requiredText(row, "value", context, diagnostics);
    if (!domain || !value) continue;
    values[domain] ||= [];
    values[domain].push(Object.freeze({ value, meaning: nullable(row.meaning), source: sourceOf(sheet, rawRow) }));
  }
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, items]) => [key, Object.freeze(items)])));
}

function adaptClasses(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const status = requiredText(row, "status", context, diagnostics)?.toLowerCase() || null;
    return Object.freeze({
      classKey: requiredText(row, "classKey", context, diagnostics),
      name: requiredText(row, "name", context, diagnostics),
      pitch: nullable(row.pitch),
      examples: textBlockList(row.examples),
      hpProgression: nullable(row.hpProgression)?.toLowerCase() || null,
      primaryAttributes: Object.freeze([nullable(row.primaryAttributeA), nullable(row.primaryAttributeB)].filter(Boolean)),
      compatibilitySkills: Object.freeze({
        combatTechniqueSkill: nullable(row.combatTechniqueSkill),
        combatSkills: Object.freeze(splitList(row.combatSkills)),
        utilitySkillOptions: Object.freeze(splitList(row.utilitySkillOptions)),
      }),
      status,
      selectable: status === "playable",
      notes: nullable(row.notes),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptClassSkills(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    return Object.freeze({
      classKey: requiredText(row, "classKey", context, diagnostics),
      skillKey: requiredText(row, "skillKey", context, diagnostics),
      skillName: requiredText(row, "skillName", context, diagnostics),
      role: requiredText(row, "role", context, diagnostics)?.toLowerCase() || null,
      progression: nullable(row.progression)?.toLowerCase() || null,
      whenPrimaryAttribute: nullable(row.whenPrimaryAttribute),
      choiceGroup: nullable(row.choiceGroup),
      displayOrder: integer(row, "displayOrder", context, diagnostics, { min: 0 }),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptFeatureRows(sheet, diagnostics, ownerField) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const grantsRaw = clean(row.grants);
    const prerequisitesRaw = clean(row.prerequisites);
    return Object.freeze({
      [ownerField]: requiredText(row, ownerField, context, diagnostics),
      level: integer(row, "level", context, diagnostics, { required: true, min: 1 }),
      kind: nestedKind(row, context, diagnostics),
      featureKey: requiredText(row, "featureKey", context, diagnostics),
      name: requiredText(row, "name", context, diagnostics),
      parentKey: nullable(row.parentKey),
      description: nullable(row.description),
      chooseCount: integer(row, "chooseCount", context, diagnostics, { min: 1 }),
      grants: expressions("grant", row, "grants", context, diagnostics),
      grantsRaw: grantsRaw || null,
      grantText: nullable(row.grantText) || nullable(row.grantNotes),
      prerequisites: expressions("prerequisite", row, "prerequisites", context, diagnostics),
      prerequisitesRaw: prerequisitesRaw || null,
      notes: nullable(row.notes),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptTechniques(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const selectionMode = requiredText(row, "selectionMode", context, diagnostics)?.toLowerCase() || null;
    return Object.freeze({
      techniqueKey: requiredText(row, "techniqueKey", context, diagnostics),
      name: requiredText(row, "techniqueName", context, diagnostics),
      description: nullable(row.description),
      skillKeys: Object.freeze(splitList(row.skillKeys, /,/)),
      legacySkill: nullable(row.skill),
      rank: integer(row, "rank", context, diagnostics, { required: true, min: 0 }),
      tags: Object.freeze(splitList(row.tags)),
      tagKeys: Object.freeze(splitList(row.tagKeys, /,/)),
      prerequisites: expressions("prerequisite", row, "prerequisites", context, diagnostics),
      prerequisitesRaw: nullable(row.prerequisites),
      prerequisiteText: nullable(row.prerequisiteText),
      action: commonAction(row, context, diagnostics, { includeCostKind: true }),
      damageByRank: rankMap(row, "damageByRank", context, diagnostics),
      pumpDamageByRank: rankMap(row, "pumpDamageByRank", context, diagnostics),
      rankNotes: nullable(row.rankNotes),
      selectionMode,
      selectable: selectionMode === "selectable",
      notes: nullable(row.notes),
      sourceNote: nullable(row.sourceNote),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptFeats(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    return Object.freeze({
      category: requiredText(row, "category", context, diagnostics),
      kind: nestedKind(row, context, diagnostics),
      featKey: requiredText(row, "featKey", context, diagnostics),
      name: requiredText(row, "name", context, diagnostics),
      parentKey: nullable(row.parentKey),
      prerequisites: expressions("prerequisite", row, "prerequisites", context, diagnostics),
      prerequisitesRaw: nullable(row.prerequisites),
      description: nullable(row.description),
      grants: expressions("grant", row, "grants", context, diagnostics),
      grantsRaw: nullable(row.grants),
      grantText: nullable(row.grantText) || nullable(row.grantNotes),
      featType: nullable(row.featType),
      chooseCount: integer(row, "chooseCount", context, diagnostics, { min: 1 }),
      notes: nullable(row.notes),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptOrigins(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const status = requiredText(row, "status", context, diagnostics)?.toLowerCase() || null;
    return Object.freeze({
      originKey: requiredText(row, "originKey", context, diagnostics),
      name: requiredText(row, "name", context, diagnostics),
      status,
      selectable: status === "playable",
      summary: nullable(row.summary),
      description: nullable(row.description),
      originKeystone: nullable(row.originKeystone),
      questions: Object.freeze(textBlockList(row.questions)),
      futureUpgrades: Object.freeze(textBlockList(row.futureUpgradesText)),
      examples: Object.freeze(textBlockList(row.examplesText)),
      notes: nullable(row.notes),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptWeaponBases(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    return Object.freeze({
      weaponKey: requiredText(row, "weaponKey", context, diagnostics),
      name: requiredText(row, "name", context, diagnostics),
      description: nullable(row.description),
      minRank: integer(row, "minRank", context, diagnostics, { required: true, min: 0 }),
      tags: Object.freeze(splitList(row.tags)),
      tagKeys: Object.freeze(splitList(row.tagKeys, /,/)),
      notes: nullable(row.notes),
      sourceNote: nullable(row.sourceNote),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptWeaponProfiles(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    return Object.freeze({
      weaponKey: requiredText(row, "weaponKey", context, diagnostics),
      profileType: requiredText(row, "profileType", context, diagnostics),
      profileName: requiredText(row, "profileName", context, diagnostics),
      description: nullable(row.description),
      rank: integer(row, "rank", context, diagnostics, { required: true, min: 0 }),
      tags: Object.freeze(splitList(row.tags)),
      action: commonAction(row, context, diagnostics),
      damageTier: nullable(row.damageTier),
      damageByRank: rankMap(row, "damageByRank", context, diagnostics),
      pumpDamageByRank: rankMap(row, "pumpDamageByRank", context, diagnostics),
      rankNotes: nullable(row.rankNotes),
      prerequisites: expressions("prerequisite", row, "prerequisites", context, diagnostics),
      prerequisitesRaw: nullable(row.prerequisites),
      notes: nullable(row.notes),
      sourceNote: nullable(row.sourceNote),
      source: sourceOf(sheet, rawRow),
    });
  });
}

function adaptWeaponEnhancements(sheet, diagnostics) {
  return sheet.rows.map((rawRow) => {
    const row = rowObject(sheet, rawRow);
    const context = contextOf(sheet, rawRow);
    const selectionMode = requiredText(row, "selectionMode", context, diagnostics)?.toLowerCase() || null;
    return Object.freeze({
      enhancementKey: requiredText(row, "enhancementKey", context, diagnostics),
      name: requiredText(row, "name", context, diagnostics),
      description: nullable(row.description),
      minRank: integer(row, "minRank", context, diagnostics, { required: true, min: 0 }),
      prerequisites: expressions("prerequisite", row, "prerequisites", context, diagnostics),
      prerequisitesRaw: nullable(row.prerequisites),
      selectionMode,
      selectable: selectionMode === "selectable",
      notes: nullable(row.notes),
      sourceNote: nullable(row.sourceNote),
      source: sourceOf(sheet, rawRow),
    });
  });
}

const ADAPTERS = Object.freeze({
  Classes: adaptClasses,
  ClassSkills: adaptClassSkills,
  ClassFeatures: (sheet, diagnostics) => adaptFeatureRows(sheet, diagnostics, "classKey"),
  Techniques: adaptTechniques,
  Feats: adaptFeats,
  Origins: adaptOrigins,
  OriginFeatures: (sheet, diagnostics) => adaptFeatureRows(sheet, diagnostics, "originKey"),
  WeaponBases: adaptWeaponBases,
  WeaponProfiles: adaptWeaponProfiles,
  WeaponEnhancements: adaptWeaponEnhancements,
});

function validateHeaders(workbook, diagnostics) {
  const valid = new Set();
  for (const [name, expected] of Object.entries(SOURCE_TAB_HEADERS)) {
    const sheet = workbook?.sheets?.[name];
    if (!sheet) {
      diagnostics.push(diagnostic("missing-sheet", `Required schema-v4 sheet "${name}" is missing.`, { sheet: name }));
      continue;
    }
    const actual = Array.isArray(sheet.headers) ? sheet.headers.map(clean) : [];
    const same = actual.length === expected.length && expected.every((header, index) => actual[index] === header);
    if (!same) {
      diagnostics.push(diagnostic(
        "header-mismatch",
        `Expected headers [${expected.join(", ")}], received [${actual.join(", ")}].`,
        { sheet: name, row: 1 },
      ));
      continue;
    }
    valid.add(name);
  }
  return valid;
}

function validateSchemaDeclarations(model, validTabs, diagnostics) {
  if (!validTabs.has("Schema")) return;
  const expected = Object.entries(SOURCE_TAB_HEADERS)
    .filter(([tab]) => !["Metadata", "Schema", "Enums"].includes(tab))
    .flatMap(([tab, headers]) => headers.map((field) => `${tab}\u0000${field}`));
  const expectedSet = new Set(expected);
  const actual = model.schema.map((entry) => `${entry.tab}\u0000${entry.field}`);
  const declarations = new Set();
  for (let index = 0; index < actual.length; index += 1) {
    const key = actual[index];
    const entry = model.schema[index];
    if (declarations.has(key)) {
      diagnostics.push(diagnostic("duplicate-schema-declaration", `Schema repeats ${entry.tab}.${entry.field}.`, entry.source));
    }
    declarations.add(key);
    if (!expectedSet.has(key)) {
      diagnostics.push(diagnostic("unknown-schema-declaration", `Schema declares unknown field ${entry.tab}.${entry.field}.`, entry.source));
    }
  }
  for (const [tab, headers] of Object.entries(SOURCE_TAB_HEADERS)) {
    if (["Metadata", "Schema", "Enums"].includes(tab)) continue;
    for (const field of headers) {
      if (!declarations.has(`${tab}\u0000${field}`)) {
        diagnostics.push(diagnostic("missing-schema-declaration", `Schema does not declare ${tab}.${field}.`, { sheet: "Schema" }));
      }
    }
  }
  if (actual.length === expected.length
      && actual.every((key) => expectedSet.has(key))
      && expected.some((key, index) => actual[index] !== key)) {
    diagnostics.push(diagnostic("schema-order-mismatch", "Schema declarations must follow tab and header order.", { sheet: "Schema" }));
  }
}

/**
 * Converts a domain-neutral workbook into the canonical schema-v4 source model.
 * Invalid rows remain represented; diagnostics identify any meaning that could
 * not be structurally adapted.
 */
export function adaptGameDataWorkbook(workbook) {
  const diagnostics = [];
  const validTabs = validateHeaders(workbook, diagnostics);
  const emptySheet = (name) => ({ name, headers: SOURCE_TAB_HEADERS[name], rows: [] });
  const sheet = (name) => validTabs.has(name) ? workbook.sheets[name] : emptySheet(name);

  const model = {
    metadata: adaptMetadata(sheet("Metadata"), diagnostics),
    schema: adaptSchema(sheet("Schema"), diagnostics),
    enums: adaptEnums(sheet("Enums"), diagnostics),
  };
  for (const [tab, modelKey] of Object.entries(MODEL_TABS)) {
    model[modelKey] = Object.freeze(ADAPTERS[tab](sheet(tab), diagnostics));
  }
  validateSchemaDeclarations(model, validTabs, diagnostics);

  return Object.freeze({
    ok: diagnostics.every((item) => item.severity !== "error"),
    model: Object.freeze(model),
    diagnostics: Object.freeze(diagnostics),
  });
}

// Shared structural helpers; v5 supplies its own domain and expression semantics.
export {
  clean, nullable, diagnostic, rowObject, splitList, textBlockList, sourceOf, contextOf,
  requiredText, booleanValue, nestedKind, adaptMetadata, adaptSchema, adaptEnums,
  adaptClasses, adaptOrigins,
};
