import * as expressions from "../../public/js/core/game-data-expressions.js";
import {
  clean, nullable, diagnostic, rowObject, splitList, contextOf, requiredText, booleanValue,
  nestedKind, adaptMetadata, adaptSchema, adaptEnums, adaptClasses, adaptOrigins,
} from "./source-v4.mjs";
import { SOURCE_V5_TAB_HEADERS, SOURCE_V5_MODEL_TABS } from "./source-v5-schema.mjs";
import { usesRequiredCells, requiredCellReadiness, sourceV5Contract } from "./required-cell-readiness.mjs";
import {
  canonicalSkillKey, canonicalTagKey, numericValue, selectionRoutes, pumpingMap,
  energyOptions, deriveV5ClassSkills,
} from "./source-v5-values.mjs";

function normalizedExpressions(kind, row, field, context, diagnostics) {
  const raw = nullable(row[field]);
  if (!raw) return Object.freeze([]);
  const parser = kind === "grant" ? expressions.parseGrantExpressions
    : kind === "basicAttack" ? expressions.parseBasicAttackExpressions
      : expressions.parsePrerequisiteExpressions;
  if (!parser) throw new Error("The syntax-v3 expression parser must be installed with the v5 adapter.");
  const result = parser(raw, { syntaxVersion: 3, context: { sheet: context.sheet, row: context.row, column: field } });
  for (const item of result.diagnostics) diagnostics.push(Object.freeze({
    ...diagnostic(`expression-${item.code}`, item.message, { ...context, column: field, severity: item.severity }),
    expressionLine: item.line ?? null, expressionField: item.field ?? null,
  }));
  return Object.freeze(result.values);
}

function sourceRecord(sheet, rawRow) {
  const row = rowObject(sheet, rawRow);
  return {
    row,
    context: contextOf(sheet, rawRow),
    provenance: {
      source: Object.freeze({ sheet: sheet.name, row: rawRow.rowNumber, headers: sheet.headers }),
      sourceValues: Object.freeze(row),
    },
  };
}

function prerequisiteFields(row, context, diagnostics) {
  return {
    prerequisites: normalizedExpressions("prerequisite", row, "prerequisites", context, diagnostics),
    prerequisitesRaw: nullable(row.prerequisites),
  };
}

function grantFields(row, context, diagnostics) {
  return {
    grants: normalizedExpressions("grant", row, "grants", context, diagnostics),
    grantsRaw: nullable(row.grants),
    grantText: null,
  };
}

function actionFields(row, context, diagnostics, requiredCells = false) {
  const action = {};
  for (const field of ["actionType", "trigger", "attribute", "defense", "range", "targets", "damage", "onSuccess",
    "onCriticalSuccess", "onFailure", "onCriticalFailure", "bondEffect"]) action[field] = nullable(row[field]);
  action.actions = numericValue(row, "actions", context, diagnostics, { min: 0 });
  const authoredKind = nullable(row.energyCostKind)?.toLowerCase() || null;
  const options = energyOptions(row.energyCostOptions, context, diagnostics);
  const kind = requiredCells && (!authoredKind || ["unassigned", "unspecified"].includes(authoredKind) || (authoredKind === "conditional" && !options.length))
    ? (options.length ? "conditional" : "fixed") : authoredKind;
  const value = numericValue(row, "energyCost", context, diagnostics, { min: 0 });
  action.energyCost = Object.freeze({ kind, value: requiredCells && !clean(row.energyCost) ? 0 : value, options });
  action.strainCost = numericValue(row, "strainCost", context, diagnostics, { min: 0 });
  action.sustained = booleanValue(row, "sustained", context, diagnostics);
  action.rollRequired = booleanValue(row, "rollRequired", context, diagnostics);
  action.skill = nullable(row.associatedSkill);
  return Object.freeze(action);
}

function adaptTechnique(sheet, rawRow, diagnostics, requiredCells = false) {
  const { row, context, provenance } = sourceRecord(sheet, rawRow);
  const status = requiredCells ? (requiredCellReadiness(sheet.name, row).complete ? "playable" : "incomplete") : nullable(row.status)?.toLowerCase() || null;
  if (!status) diagnostics.push(diagnostic("unresolved-readiness", "Technique readiness is unknown; preserve the record without granting or selecting it.", { ...context, column: "status", severity: "warning" }));
  const routes = selectionRoutes(row.selection, context, diagnostics);
  const normalRoute = routes.some((route) => ["skill", "tag", "weaponTag"].includes(route.type));
  const invalidRoute = routes.some((route) => route.type === "unresolved");
  const selectionMode = status !== "playable" ? "draft" : normalRoute ? "selectable"
    : routes.some((route) => route.type === "granted") ? "granted-only" : null;
  return Object.freeze({
    techniqueKey: requiredText(row, "techniqueKey", context, diagnostics),
    name: requiredText(row, "techniqueName", context, diagnostics),
    description: nullable(row.description),
    selection: nullable(row.selection), selectionRoutes: routes, status,
    selectionMode, selectable: status === "playable" && normalRoute && !invalidRoute,
    skillKeys: Object.freeze(routes.filter((route) => route.type === "skill").map((route) => route.skillKey)),
    legacySkill: routes.filter((route) => route.type === "skill").map((route) => route.name).join(", ") || null,
    associatedSkill: nullable(row.associatedSkill),
    associatedSkillKey: nullable(row.associatedSkill) ? canonicalSkillKey(row.associatedSkill) : null,
    rank: numericValue(row, "rank", context, diagnostics, { integer: true, min: 0 }),
    tags: Object.freeze(splitList(row.tags)), tagKeys: Object.freeze(splitList(row.tags).map(canonicalTagKey)),
    ...prerequisiteFields(row, context, diagnostics),
    prerequisiteText: null,
    action: actionFields(row, context, diagnostics, requiredCells),
    basicAttackRaw: nullable(row.basicAttack),
    basicAttack: normalizedExpressions("basicAttack", row, "basicAttack", context, diagnostics),
    pumpingByRank: pumpingMap(row.pumpingByRank, context, diagnostics),
    pumpingByRankRaw: nullable(row.pumpingByRank),
    rankNotes: nullable(row.rankNotes),
    ...provenance,
  });
}

function adaptFeature(sheet, rawRow, diagnostics, ownerField) {
  const { row, context, provenance } = sourceRecord(sheet, rawRow);
  return Object.freeze({
    [ownerField]: requiredText(row, ownerField, context, diagnostics),
    level: numericValue(row, "level", context, diagnostics, { integer: true, min: 1 }),
    kind: nestedKind(row, context, diagnostics),
    featureKey: requiredText(row, "featureKey", context, diagnostics),
    name: requiredText(row, "name", context, diagnostics),
    parentKey: nullable(row.parentKey), description: nullable(row.description),
    chooseCount: numericValue(row, "chooseCount", context, diagnostics, { integer: true, min: 1 }),
    ...grantFields(row, context, diagnostics), ...prerequisiteFields(row, context, diagnostics),
    traitKeys: Object.freeze(splitList(row.traitKeys, /,/)),
    notes: nullable(row.notes), ...provenance,
  });
}

function adaptFeat(sheet, rawRow, diagnostics) {
  const { row, context, provenance } = sourceRecord(sheet, rawRow);
  return Object.freeze({
    category: requiredText(row, "category", context, diagnostics),
    kind: nestedKind(row, context, diagnostics),
    featKey: requiredText(row, "featKey", context, diagnostics),
    name: requiredText(row, "name", context, diagnostics),
    parentKey: nullable(row.parentKey), description: nullable(row.description),
    archetypeKey: nullable(row.archetypeKey), archetypeName: nullable(row.archetypeName),
    featType: nullable(row.featType),
    chooseCount: numericValue(row, "chooseCount", context, diagnostics, { integer: true, min: 1 }),
    ...grantFields(row, context, diagnostics), ...prerequisiteFields(row, context, diagnostics),
    notes: nullable(row.notes), ...provenance,
  });
}

function adaptTrait(sheet, rawRow, diagnostics) {
  const { row, context, provenance } = sourceRecord(sheet, rawRow);
  return Object.freeze({
    traitKey: requiredText(row, "traitKey", context, diagnostics),
    name: requiredText(row, "name", context, diagnostics),
    rank: numericValue(row, "rank", context, diagnostics, { integer: true, min: 0 }),
    ...prerequisiteFields(row, context, diagnostics),
    tags: Object.freeze(splitList(row.tags)), tagKeys: Object.freeze(splitList(row.tags).map(canonicalTagKey)),
    description: nullable(row.description), rankNotes: nullable(row.rankNotes),
    techniqueKeys: Object.freeze(splitList(row.techniqueKeys, /,/)),
    ...grantFields(row, context, diagnostics), ...provenance,
  });
}

function adaptWeapon(sheet, rawRow, diagnostics, enhancement = false) {
  const { row, context, provenance } = sourceRecord(sheet, rawRow);
  const key = enhancement ? "enhancementKey" : "weaponKey";
  const base = {
    [key]: requiredText(row, key, context, diagnostics),
    name: requiredText(row, "name", context, diagnostics),
    description: nullable(row.description),
    minRank: numericValue(row, "minRank", context, diagnostics, { integer: true, min: 0 }),
    notes: nullable(row.notes), ...provenance,
  };
  if (enhancement) {
    const selectionMode = nullable(row.selectionMode)?.toLowerCase() || null;
    return Object.freeze({
      ...base, selectionMode, selectable: selectionMode === "selectable",
      ...prerequisiteFields(row, context, diagnostics), sourceNote: nullable(row.sourceNote),
    });
  }
  return Object.freeze({
    ...base, tags: Object.freeze(splitList(row.tags)), tagKeys: Object.freeze(splitList(row.tags).map(canonicalTagKey)),
    techniqueKeys: Object.freeze(splitList(row.techniqueKeys, /,/)), traitsText: nullable(row.traitsText),
  });
}

function withProvenance(sheet, records) {
  return Object.freeze(records.map((record, index) => Object.freeze({
    ...record, ...sourceRecord(sheet, sheet.rows[index]).provenance,
  })));
}

function validateHeaders(workbook, diagnostics, headers) {
  for (const [name, expected] of Object.entries(headers)) {
    const sheet = workbook?.sheets?.[name];
    if (!sheet) {
      diagnostics.push(diagnostic("missing-sheet", `Required schema-v5 sheet "${name}" is missing.`, { sheet: name }));
      continue;
    }
    const seen = new Set();
    for (const header of sheet.headers) {
      if (seen.has(header)) diagnostics.push(diagnostic("duplicate-header", `Header "${header}" is duplicated.`, { sheet: name, row: 1, column: header, headers: sheet.headers }));
      seen.add(header);
      if (!expected.includes(header)) diagnostics.push(diagnostic("unknown-header", `Unknown schema-v5 header "${header}".`, { sheet: name, row: 1, column: header, headers: sheet.headers }));
    }
    for (const header of expected) if (!seen.has(header)) diagnostics.push(diagnostic("missing-header", `Required schema-v5 header "${header}" is missing.`, { sheet: name, row: 1, column: header, headers: sheet.headers }));
    for (const rawRow of sheet.rows) if (rawRow.values.slice(sheet.headers.length).some((value) => clean(value))) {
      diagnostics.push(diagnostic("unheaded-cell", "A populated value has no header; the raw source row is retained.", { sheet: name, row: rawRow.rowNumber }));
    }
  }
  for (const name of Object.keys(workbook?.sheets || {})) if (!Object.hasOwn(SOURCE_V5_TAB_HEADERS, name)) {
    diagnostics.push(diagnostic("unknown-sheet", `Unrecognized schema-v5 sheet "${name}"; raw source rows are retained.`, { sheet: name }));
  }
}

function validateSchema(model, diagnostics) {
  const contractSet = sourceV5Contract(model.metadata);
  const schemaHeaders = model.sourceSheets.Schema?.headers || SOURCE_V5_TAB_HEADERS.Schema;
  const enumHeaders = model.sourceSheets.Enums?.headers || SOURCE_V5_TAB_HEADERS.Enums;
  const expected = new Set(Object.keys(SOURCE_V5_MODEL_TABS).flatMap((tab) => contractSet.headers[tab].map((field) => `${tab}.${field}`)));
  const seen = new Set();
  for (const entry of model.schema) {
    const key = `${entry.tab}.${entry.field}`;
    if (seen.has(key)) diagnostics.push(diagnostic("duplicate-schema-declaration", `Schema repeats ${key}.`, entry.source));
    if (!expected.has(key)) diagnostics.push(diagnostic("unknown-schema-declaration", `Schema declares unknown field ${key}.`, entry.source));
    const contract = contractSet.fields[key];
    if (contract && entry.type !== contract.type) diagnostics.push(diagnostic("schema-type-mismatch", `Schema ${key} declares type "${entry.type}"; implemented v5 type is "${contract.type}".`, { ...entry.source, column: "type", headers: schemaHeaders }));
    if (contract && entry.requirement !== contract.requirement) diagnostics.push(diagnostic("schema-requirement-mismatch", `Schema ${key} declares required="${entry.requirement}"; implemented v5 requirement is "${contract.requirement}".`, { ...entry.source, column: "required", headers: schemaHeaders }));
    if (contract?.type === "enum") {
      const allowed = contractSet.enums[entry.field];
      const declared = clean(entry.valuesOrFormat).split("|").map(clean);
      if (clean(entry.valuesOrFormat) !== "see Enums" && (declared.length !== allowed.length || new Set(declared).size !== allowed.length || declared.some((value) => !allowed.includes(value)))) {
        diagnostics.push(diagnostic("schema-enum-mismatch", `Schema ${key} must reference Enums or declare exactly ${allowed.join("|")}.`, { ...entry.source, column: "valuesOrFormat", headers: schemaHeaders }));
      }
      if (clean(entry.default) && !allowed.includes(clean(entry.default))) diagnostics.push(diagnostic("schema-default-mismatch", `Schema ${key} default "${entry.default}" is outside its enum.`, { ...entry.source, column: "default", headers: schemaHeaders }));
    }
    seen.add(key);
  }
  for (const key of expected) if (!seen.has(key)) diagnostics.push(diagnostic("missing-schema-declaration", `Schema does not declare ${key}.`, { sheet: "Schema" }));
  for (const [key, expectedVersion] of [["sourceSchemaVersion", 5], ["grantSyntaxVersion", 3], ["prerequisiteSyntaxVersion", 3]]) {
    if (String(model.metadata[key]) !== String(expectedVersion)) diagnostics.push(diagnostic("unsupported-source-version", `Metadata ${key} must equal ${expectedVersion}.`, { sheet: "Metadata", column: "value" }));
  }
  for (const [domain, entries] of Object.entries(model.enums)) {
    const allowed = contractSet.enums[domain];
    const values = new Set();
    for (const entry of entries) {
      const context = { ...entry.source, headers: enumHeaders };
      if (!allowed?.includes(entry.value)) diagnostics.push(diagnostic("unknown-enum-value", `Unsupported enum ${domain}=${entry.value}.`, { ...context, column: "value" }));
      if (values.has(entry.value)) diagnostics.push(diagnostic("duplicate-enum-value", `Enums repeats ${domain}=${entry.value}.`, { ...context, column: "value" }));
      if (!entry.meaning) diagnostics.push(diagnostic("missing-enum-meaning", `Enum ${domain}=${entry.value} needs its authored meaning.`, { ...context, column: "meaning" }));
      values.add(entry.value);
    }
  }
  for (const [domain, values] of Object.entries(contractSet.enums)) {
    for (const value of values) if (!model.enums[domain]?.some((entry) => entry.value === value)) {
      diagnostics.push(diagnostic("missing-enum-value", `Enums does not declare ${domain}=${value}.`, { sheet: "Enums" }));
    }
  }
}

/** Pure v5 adaptation; every authored row and unknown value remains inspectable. */
export function adaptSchemaV5Workbook(workbook) {
  const diagnostics = [];
  const metadataSheet = workbook?.sheets?.Metadata || { name: "Metadata", headers: SOURCE_V5_TAB_HEADERS.Metadata, rows: [] };
  const metadata = adaptMetadata(metadataSheet, diagnostics);
  if (metadata.readinessPolicy && !usesRequiredCells(metadata)) diagnostics.push(diagnostic("unsupported-readiness-policy", `Unknown readinessPolicy "${metadata.readinessPolicy}".`, { sheet: "Metadata", column: "value" }));
  const requiredCells = usesRequiredCells(metadata);
  validateHeaders(workbook, diagnostics, sourceV5Contract(metadata).headers);
  const sheet = (name) => workbook?.sheets?.[name] || { name, headers: SOURCE_V5_TAB_HEADERS[name], rows: [] };
  const map = (name, adapter) => Object.freeze(sheet(name).rows.map((row) => adapter(sheet(name), row, diagnostics)));
  // Reuse legacy scalar adapters with an internal derived status, retaining the
  // original status-free source and locations for diagnostics and provenance.
  const statusSheet = (name) => requiredCells ? { ...sheet(name), headers: [...sheet(name).headers, "status"],
    rows: sheet(name).rows.map((raw) => ({ ...raw, values: [...raw.values.slice(0, sheet(name).headers.length),
      requiredCellReadiness(name, rowObject(sheet(name), raw)).complete ? "playable" : "incomplete"] })) } : sheet(name);
  const classes = withProvenance(sheet("Classes"), adaptClasses(statusSheet("Classes"), diagnostics));
  const model = {
    metadata,
    schema: adaptSchema(sheet("Schema"), diagnostics),
    enums: adaptEnums(sheet("Enums"), diagnostics),
    classes: Object.freeze(classes.map((record) => Object.freeze({
      ...record,
      authoringSkills: Object.freeze({
        combatTechniqueSkill: nullable(record.sourceValues.combatTechniqueSkill),
        combatSkills: nullable(record.sourceValues.combatSkills),
        utilitySkillOptions: nullable(record.sourceValues.utilitySkillOptions),
      }),
      compatibilitySkills: Object.freeze({
        combatTechniqueSkill: nullable(record.sourceValues.combatTechniqueSkill),
        combatSkills: Object.freeze(splitList(record.sourceValues.combatSkills, /;/)),
        utilitySkillOptions: Object.freeze(splitList(record.sourceValues.utilitySkillOptions)),
      }),
    }))),
    classSkills: deriveV5ClassSkills(classes, diagnostics),
    classFeatures: map("ClassFeatures", (s, r, d) => adaptFeature(s, r, d, "classKey")),
    techniques: map("Techniques", (s, r, d) => adaptTechnique(s, r, d, requiredCells)),
    feats: map("Feats", adaptFeat),
    origins: withProvenance(sheet("Origins"), adaptOrigins(statusSheet("Origins"), diagnostics)),
    originFeatures: map("OriginFeatures", (s, r, d) => adaptFeature(s, r, d, "originKey")),
    weaponBases: map("WeaponBases", adaptWeapon),
    weaponProfiles: Object.freeze([]),
    weaponEnhancements: map("WeaponEnhancements", (s, r, d) => adaptWeapon(s, r, d, true)),
    traits: map("Traits", adaptTrait),
    // Retain contract/documentation rows and malformed/unheaded source values too.
    sourceSheets: Object.freeze(Object.fromEntries(Object.entries(workbook?.sheets || {}).map(([name, s]) => [name, Object.freeze({
      headers: Object.freeze([...s.headers]),
      rows: Object.freeze(s.rows.map((r) => Object.freeze({ rowNumber: r.rowNumber, values: Object.freeze([...r.values]) }))),
    })]))),
  };
  if (requiredCells) for (const collection of Object.values(SOURCE_V5_MODEL_TABS)) {
    model[collection] = Object.freeze(model[collection].map((record) => {
      const readiness = requiredCellReadiness(record.source.sheet, record.sourceValues);
      return Object.freeze({ ...record, readiness, status: readiness.complete ? "playable" : "incomplete",
        ...(readiness.complete ? {} : { selectable: false }) });
    }));
  }
  validateSchema(model, diagnostics);
  return Object.freeze({ ok: diagnostics.every((entry) => entry.severity !== "error"), model: Object.freeze(model), diagnostics: Object.freeze(diagnostics) });
}
