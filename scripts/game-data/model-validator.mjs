import { getExpressionRuntimeStatus } from "../../public/js/core/game-data-contract.js";
import { SOURCE_TAB_HEADERS } from "./source-adapters.mjs";
import { validateV5Relationships } from "./model-validator-v5.mjs";

export const VALIDATION_SEVERITY_POLICY = Object.freeze({
  error: "Blocks artifact construction because source meaning is missing, ambiguous, inconsistent, or unresolved.",
  warning: "Preserves complete source meaning but identifies an intentional runtime/editorial limitation.",
});

const SHEET_ORDER = Object.freeze([
  "Metadata", "Schema", "Enums", "Classes", "ClassSkills", "ClassFeatures", "Techniques", "Feats",
  "Origins", "OriginFeatures", "WeaponBases", "WeaponProfiles", "WeaponEnhancements",
]);

const STABLE_KEY = /^[a-z][a-z0-9-]*$/;
const LEGACY_WEAPON_KEY = /^[a-z][a-z0-9_-]*$/;
const CLASS_STATUSES = new Set(["playable", "draft", "incomplete"]);
const SELECTION_MODES = new Set(["selectable", "granted-only", "draft"]);
const ENERGY_COST_KINDS = new Set(["fixed", "variable", "conditional", "unassigned", "unspecified"]);
const NESTED_KINDS = new Set(["feature", "optionGroup", "option"]);
const CLASS_SKILL_ROLES = new Set(["combat-technique", "combat-defense", "utility-option"]);
const SKILL_PROGRESSIONS = new Set(["fast", "medium", "slow"]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
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

function sourceCell(source, column) {
  if (source?.columns?.[column]) return `${source.columns[column]}${source.row}`;
  const headers = source?.headers || SOURCE_TAB_HEADERS[source?.sheet];
  const index = headers?.indexOf(column) ?? -1;
  return source?.row && index >= 0 ? `${excelColumn(index)}${source.row}` : null;
}

function compareDiagnostics(left, right) {
  const sheet = (SHEET_ORDER.indexOf(left.sheet) === -1 ? 999 : SHEET_ORDER.indexOf(left.sheet))
    - (SHEET_ORDER.indexOf(right.sheet) === -1 ? 999 : SHEET_ORDER.indexOf(right.sheet));
  if (sheet) return sheet;
  const row = (left.row ?? 0) - (right.row ?? 0);
  if (row) return row;
  const leftHeaders = SOURCE_TAB_HEADERS[left.sheet] || [];
  const rightHeaders = SOURCE_TAB_HEADERS[right.sheet] || [];
  const column = (leftHeaders.indexOf(left.column) === -1 ? 999 : leftHeaders.indexOf(left.column))
    - (rightHeaders.indexOf(right.column) === -1 ? 999 : rightHeaders.indexOf(right.column));
  if (column) return column;
  return left._sequence - right._sequence;
}

function recordLabel(record, fields) {
  return fields.map((field) => record?.[field]).filter(Boolean).join("/") || "(unidentified row)";
}

function stableComposite(parts) {
  return parts.map((part) => String(part ?? "").trim()).join("\u0000");
}

/**
 * Validates relationships and domain invariants in an adapted schema-v4 model.
 * The function performs no file I/O and returns every finding in deterministic
 * workbook order.
 */
export function validateGameDataModel(model, { priorDiagnostics = [] } = {}) {
  const diagnostics = [];
  const v5 = Number(model?.metadata?.sourceSchemaVersion) === 5;
  const runtimeSupportBySource = {};
  const deferredCodes = new Set(["record-unready", "playable-record-incomplete", "draft-record-granted", "runtime-subsystem-stubbed", "manual-prerequisite", "runtime-prerequisite-deferred", "recipient-execution-deferred", "feature-invocation-deferred", "unassigned-selection", "incomplete-technique", "incomplete-content", "unresolved-rank-context"]);
  let sequence = 0;
  const add = (severity, code, message, record = null, column = null, details = null) => {
    const source = record?.source || {};
    if (v5 && deferredCodes.has(code)) severity = "warning";
    const deferred = v5 && deferredCodes.has(code);
    if (deferred) {
      const support = runtimeSupportBySource[`${source.sheet}:${source.row}`] ||= { status: "deferred", reasons: [] };
      support.status = "deferred";
      if (!support.reasons.includes(code)) support.reasons.push(code);
    }
    diagnostics.push({
      severity,
      code,
      message,
      sheet: source.sheet || null,
      row: source.row || null,
      column,
      cell: sourceCell(source, column),
      details,
      ...(v5 ? { deferred } : {}),
      _sequence: sequence++,
    });
  };

  for (const item of priorDiagnostics) {
    diagnostics.push({ ...item, _sequence: sequence++ });
  }

  const collections = {
    classes: model?.classes || [],
    classSkills: model?.classSkills || [],
    classFeatures: model?.classFeatures || [],
    techniques: model?.techniques || [],
    feats: model?.feats || [],
    origins: model?.origins || [],
    originFeatures: model?.originFeatures || [],
    weaponBases: model?.weaponBases || [],
    weaponProfiles: model?.weaponProfiles || [],
    weaponEnhancements: model?.weaponEnhancements || [],
    ...(v5 ? { traits: model?.traits || [] } : {}),
  };

  function identityIndex(rows, {
    field,
    column = field,
    label,
    pattern = STABLE_KEY,
    key = (record) => record[field],
  }) {
    const index = new Map();
    for (const record of rows) {
      const value = key(record);
      const normalized = String(value ?? "").trim();
      if (!normalized) {
        add("error", "blank-stable-id", `${label} requires a stable identity.`, record, column);
        continue;
      }
      if (!normalized.includes("\u0000") && pattern && !pattern.test(normalized)) {
        add(v5 ? "warning" : "error", v5 ? "legacy-stable-id" : "invalid-stable-id", `${label} identity "${normalized}" has an invalid stable-key format.`, record, column);
      }
      if (index.has(normalized)) {
        add("error", "duplicate-stable-id", `${label} identity "${normalized.replaceAll("\u0000", "/")}" is duplicated.`, record, column, {
          firstSource: index.get(normalized).source,
        });
      } else {
        index.set(normalized, record);
      }
    }
    return index;
  }

  const classes = identityIndex(collections.classes, { field: "classKey", label: "Class" });
  const techniques = identityIndex(collections.techniques, { field: "techniqueKey", label: "Technique" });
  const feats = identityIndex(collections.feats, { field: "featKey", label: "Feat" });
  const origins = identityIndex(collections.origins, { field: "originKey", label: "Origin" });
  const weaponBases = identityIndex(collections.weaponBases, {
    field: "weaponKey", label: "Weapon base", pattern: LEGACY_WEAPON_KEY,
  });
  const weaponEnhancements = identityIndex(collections.weaponEnhancements, {
    field: "enhancementKey", label: "Weapon enhancement", pattern: LEGACY_WEAPON_KEY,
  });
  identityIndex(collections.weaponProfiles, {
    field: "weaponKey",
    column: "weaponKey",
    label: "Weapon profile",
    pattern: null,
    key: (record) => stableComposite([record.weaponKey, record.profileType, record.profileName, record.rank]),
  });
  identityIndex(collections.classSkills, {
    field: "skillKey",
    column: "skillKey",
    label: "Class-skill relationship",
    pattern: null,
    key: (record) => stableComposite([
      record.classKey, record.skillKey, record.role, record.whenPrimaryAttribute, record.choiceGroup,
    ]),
  });

  const classFeatures = identityIndex(collections.classFeatures, {
    field: "featureKey",
    column: "featureKey",
    label: "Class feature",
    pattern: null,
    key: (record) => stableComposite([record.classKey, record.featureKey]),
  });
  const originFeatures = identityIndex(collections.originFeatures, {
    field: "featureKey",
    column: "featureKey",
    label: "Origin feature",
    pattern: null,
    key: (record) => stableComposite([record.originKey, record.featureKey]),
  });

  for (const record of [...collections.classFeatures, ...collections.originFeatures]) {
    if (!record.featureKey) {
      add("error", "blank-stable-id", "Feature requires a stable featureKey.", record, "featureKey");
    } else if (!STABLE_KEY.test(record.featureKey)) {
      add(v5 ? "warning" : "error", v5 ? "legacy-stable-id" : "invalid-stable-id", `Feature identity "${record.featureKey}" has an invalid stable-key format.`, record, "featureKey");
    }
  }

  function requireReference(index, values, {
    record,
    column,
    kind,
    allowBlank = false,
  }) {
    for (const value of asArray(values)) {
      const key = String(value ?? "").trim();
      if (!key) {
        if (!allowBlank) add("error", "blank-reference", `${kind} reference is blank.`, record, column);
        continue;
      }
      if (!index.has(key)) add("error", "unresolved-reference", `${kind} reference "${key}" does not resolve.`, record, column, { kind, key });
    }
  }

  function validateStatus(record, kind) {
    if (!CLASS_STATUSES.has(record.status)) {
      add("error", "invalid-status", `${kind} status "${record.status ?? ""}" is not declared.`, record, "status");
    }
    if (record.selectable !== (record.status === "playable")) {
      add("error", "selectability-mismatch", `${kind} selectability must be derived from status.`, record, "status");
    }
  }

  for (const record of collections.classes) {
    validateStatus(record, "Class");
    if (record.status === "playable") {
      if (!record.hpProgression) add("error", "playable-record-incomplete", "Playable class requires HP progression.", record, "hpProgression");
      if (!Array.isArray(record.primaryAttributes) || record.primaryAttributes.length !== 2) {
        add("error", "playable-record-incomplete", "Playable class requires exactly two primary-attribute choices.", record, "primaryAttributeA");
      } else if (new Set(record.primaryAttributes).size !== record.primaryAttributes.length) {
        add("error", "playable-record-incomplete", "Playable class primary-attribute choices must be distinct.", record, "primaryAttributeB");
      }
    }
  }

  for (const record of collections.origins) validateStatus(record, "Origin");

  const skillNames = new Map();
  for (const record of collections.classSkills) {
    requireReference(classes, record.classKey, { record, column: "classKey", kind: "Class" });
    if (!record.skillKey || !STABLE_KEY.test(record.skillKey)) {
      add("error", record.skillKey ? "invalid-stable-id" : "blank-stable-id", "Class-skill row requires a stable skillKey.", record, "skillKey");
    }
    if (!record.skillName) add("error", "missing-display-name", "Class-skill row requires skillName display text.", record, "skillName");
    if (record.skillKey && record.skillName) {
      const existingName = skillNames.get(record.skillKey);
      if (existingName && existingName !== record.skillName) {
        add("error", "skill-name-mismatch", `Skill key "${record.skillKey}" uses both "${existingName}" and "${record.skillName}".`, record, "skillName");
      } else {
        skillNames.set(record.skillKey, record.skillName);
      }
    }
    if (!CLASS_SKILL_ROLES.has(record.role)) {
      add("error", "invalid-class-skill-role", `Class-skill role "${record.role ?? ""}" is invalid.`, record, "role");
    }
    if (record.progression && !SKILL_PROGRESSIONS.has(record.progression)) {
      add("error", "invalid-skill-progression", `Skill progression "${record.progression}" is invalid.`, record, "progression");
    }
    if (record.role !== "utility-option" && !record.progression) {
      add("error", "missing-skill-progression", "Combat class-skill rows require progression.", record, "progression");
    }
    const owningClass = classes.get(record.classKey);
    const primaryAttributes = (owningClass?.primaryAttributes || []).map((value) => String(value).trim().toLowerCase());
    if (record.whenPrimaryAttribute && owningClass && !primaryAttributes.includes(String(record.whenPrimaryAttribute).trim().toLowerCase())) {
      add("error", "invalid-primary-attribute-condition", `Conditional progression attribute "${record.whenPrimaryAttribute}" is not offered by class "${record.classKey}".`, record, "whenPrimaryAttribute");
    }
    if (record.choiceGroup && !STABLE_KEY.test(record.choiceGroup)) {
      add("error", "invalid-choice-id", `Class-skill choiceGroup "${record.choiceGroup}" has an invalid stable-key format.`, record, "choiceGroup");
    }
    if (record.displayOrder !== null && record.displayOrder !== undefined
        && (!Number.isInteger(record.displayOrder) || record.displayOrder < 0)) {
      add("error", "invalid-display-order", "Class-skill displayOrder must be a nonnegative integer.", record, "displayOrder");
    }
  }
  function validateNestedRows(rows, ownerField, ownerIndex, scopedIndex) {
    const allByKey = new Map();
    for (const record of rows) {
      if (record.featureKey) {
        const bucket = allByKey.get(record.featureKey) || [];
        bucket.push(record);
        allByKey.set(record.featureKey, bucket);
      }
      requireReference(ownerIndex, record[ownerField], { record, column: ownerField, kind: ownerField === "classKey" ? "Class" : "Origin" });
      if (!NESTED_KINDS.has(record.kind)) add("error", "invalid-nested-kind", `Nested row kind "${record.kind ?? ""}" is invalid.`, record, "rowType");
      if (record.kind === "optionGroup" && (!Number.isInteger(record.chooseCount) || record.chooseCount < 1)) {
        add("error", "invalid-choose-count", "Option groups require a positive explicit chooseCount.", record, "chooseCount");
      }
      if (record.kind === "option" && !record.parentKey) {
        add("error", "missing-parent", "Option rows require parentKey.", record, "parentKey");
      }
      if (record.kind === "feature" && record.parentKey) {
        add("error", "unexpected-parent", "Feature rows cannot declare parentKey.", record, "parentKey");
      }
    }
    for (const record of rows) {
      if (!record.parentKey) continue;
      const scopedKey = stableComposite([record[ownerField], record.parentKey]);
      const parent = scopedIndex.get(scopedKey);
      if (!parent) {
        const otherScope = allByKey.get(record.parentKey)?.find((candidate) => candidate[ownerField] !== record[ownerField]);
        add("error", otherScope ? "parent-scope-mismatch" : "unresolved-parent", otherScope
          ? `Parent "${record.parentKey}" belongs to a different ${ownerField} scope.`
          : `Parent "${record.parentKey}" does not resolve in this ${ownerField} scope.`, record, "parentKey");
      } else if (parent.kind !== "optionGroup") {
        add("error", "invalid-parent-kind", `Parent "${record.parentKey}" is not an option group.`, record, "parentKey");
      }
    }
  }

  validateNestedRows(collections.classFeatures, "classKey", classes, classFeatures);
  validateNestedRows(collections.originFeatures, "originKey", origins, originFeatures);

  const featByKey = feats;
  for (const record of collections.feats) {
    if (!NESTED_KINDS.has(record.kind)) add("error", "invalid-nested-kind", `Feat row kind "${record.kind ?? ""}" is invalid.`, record, "rowType");
    if (record.kind === "optionGroup" && (!Number.isInteger(record.chooseCount) || record.chooseCount < 1)) {
      add("error", "invalid-choose-count", "Feat option groups require a positive explicit chooseCount.", record, "chooseCount");
    }
    if (record.kind === "option") {
      if (!record.parentKey) {
        add("error", "missing-parent", "Feat option rows require parentKey.", record, "parentKey");
      } else {
        const parent = featByKey.get(record.parentKey);
        if (!parent) add("error", "unresolved-parent", `Feat parent "${record.parentKey}" does not resolve.`, record, "parentKey");
        else if (parent.kind !== "optionGroup") add("error", "invalid-parent-kind", `Feat parent "${record.parentKey}" is not an option group.`, record, "parentKey");
        else if (parent.category !== record.category) add("error", "parent-scope-mismatch", `Feat parent "${record.parentKey}" belongs to category "${parent.category}".`, record, "parentKey");
      }
    } else if (record.parentKey) {
      add("error", "unexpected-parent", "Only feat option rows may declare parentKey.", record, "parentKey");
    }
  }

  for (const record of collections.weaponProfiles) {
    requireReference(weaponBases, record.weaponKey, { record, column: "weaponKey", kind: "Weapon base" });
    if (!record.profileType) add("error", "blank-stable-id", "Weapon profile requires profileType as part of its composite identity.", record, "profileType");
    if (!record.profileName) add("error", "blank-stable-id", "Weapon profile requires profileName as part of its composite identity.", record, "profileName");
    if (!Number.isInteger(record.rank) || record.rank < 0) add("error", "blank-stable-id", "Weapon profile requires a nonnegative rank as part of its composite identity.", record, "rank");
  }

  function validateSelectionMode(record, kind) {
    if (!SELECTION_MODES.has(record.selectionMode)) {
      add("error", "invalid-selection-mode", `${kind} selectionMode "${record.selectionMode ?? ""}" is invalid.`, record, "selectionMode");
    }
    if (record.selectable !== (record.selectionMode === "selectable")) {
      add("error", "selectability-mismatch", `${kind} selectability must be derived from selectionMode.`, record, "selectionMode");
    }
  }

  for (const record of collections.techniques) {
    if (!v5) validateSelectionMode(record, "Technique");
    if (!v5 && !record.skillKeys?.length) add("error", "missing-skill-keys", "Technique requires at least one stable skill key.", record, "skillKeys");
    for (const key of record.skillKeys || []) {
      if (!STABLE_KEY.test(key)) add("error", "invalid-stable-id", `Technique skill key "${key}" is invalid.`, record, "skillKeys");
    }
    for (const key of record.tagKeys || []) {
      if (!/^[a-z][a-z0-9-]*(?:=[^,]+)?$/.test(key)) add("error", "invalid-tag-key", `Technique tag key "${key}" is invalid.`, record, "tagKeys");
    }
    const energy = record.action?.energyCost || {};
    if (v5 && !energy.kind) {
      add("warning", "record-unready", "Energy-cost kind is unassigned; the authored blank is retained.", record, "energyCostKind");
    } else if (!ENERGY_COST_KINDS.has(energy.kind)) {
      add("error", "invalid-energy-cost-kind", `Energy-cost kind "${energy.kind ?? ""}" is invalid.`, record, "energyCostKind");
    } else if (energy.kind === "fixed") {
      if (!Number.isFinite(energy.value) || energy.value < 0) add("error", "invalid-energy-cost", "Fixed energy cost requires a nonnegative numeric value.", record, "energyCost");
      if (energy.options?.length) add("error", "invalid-energy-cost-options", "Fixed energy cost cannot declare alternatives.", record, "energyCostOptions");
    } else if (energy.kind === "conditional") {
      if (!Number.isFinite(energy.value) || energy.value < 0) add("error", "invalid-energy-cost", "Conditional energy cost requires a nonnegative base value.", record, "energyCost");
      if (!energy.options?.length) add("error", "invalid-energy-cost-options", "Conditional energy cost requires named alternatives.", record, "energyCostOptions");
      const optionKeys = new Set();
      for (const option of energy.options || []) {
        if (!STABLE_KEY.test(option.key)) add("error", "invalid-energy-cost-options", `Energy-cost option key "${option.key}" is invalid.`, record, "energyCostOptions");
        if (optionKeys.has(option.key)) add("error", "invalid-energy-cost-options", `Energy-cost option "${option.key}" is duplicated.`, record, "energyCostOptions");
        optionKeys.add(option.key);
        if (!Number.isFinite(option.value) || option.value < 0) add("error", "invalid-energy-cost-options", `Energy-cost option "${option.key}" requires a nonnegative numeric value.`, record, "energyCostOptions");
      }
    } else if (energy.kind === "variable") {
      if (energy.value !== null && energy.value !== undefined) add("error", "invalid-energy-cost", "Variable energy cost must leave the fixed value blank.", record, "energyCost");
      if (energy.options?.length) add("error", "invalid-energy-cost-options", "Variable energy cost cannot declare fixed alternatives.", record, "energyCostOptions");
    } else {
      if (energy.value !== null && energy.value !== undefined) add("error", "invalid-energy-cost", `${energy.kind} energy cost must leave the value blank.`, record, "energyCost");
      if (energy.options?.length) add("error", "invalid-energy-cost-options", `${energy.kind} energy cost cannot declare alternatives.`, record, "energyCostOptions");
    }
    if (energy.kind === "unassigned" || energy.kind === "unspecified") {
      add(
        record.selectionMode === "draft" ? "warning" : "error",
        "record-unready",
        `Technique with ${energy.kind} energy cost is not release-ready.`,
        record,
        "energyCostKind",
      );
    }
    if (Number.isFinite(record.action?.strainCost) && record.action.strainCost < 0) {
      add("error", "invalid-strain-cost", "Strain cost cannot be negative.", record, "strainCost");
    }
  }

  for (const record of collections.weaponEnhancements) validateSelectionMode(record, "Weapon enhancement");

  for (const record of collections.weaponProfiles) {
    const energy = record.action?.energyCost?.value;
    if (energy !== null && energy !== undefined && (!Number.isFinite(energy) || energy < 0)) {
      add("error", "invalid-energy-cost", "Weapon-profile energy cost must be a nonnegative number.", record, "energyCost");
    }
    const strain = record.action?.strainCost;
    if (strain !== null && strain !== undefined && (!Number.isFinite(strain) || strain < 0)) {
      add("error", "invalid-strain-cost", "Weapon-profile strain cost must be a nonnegative number.", record, "strainCost");
    }
  }

  for (const record of collections.weaponBases) {
    for (const key of record.tagKeys || []) {
      if (!/^[a-z][a-z0-9-]*(?:=[^,]+)?$/.test(key)) add("error", "invalid-tag-key", `Weapon tag key "${key}" is invalid.`, record, "tagKeys");
    }
  }

  const choiceDefinitions = new Map();
  const expressionRows = [
    ...collections.classFeatures,
    ...collections.techniques,
    ...collections.feats,
    ...collections.originFeatures,
    ...collections.weaponProfiles,
    ...collections.weaponEnhancements,
    ...(collections.traits || []),
  ];

  function defineChoice(key, record, column, kind) {
    if (!key) return;
    if (!STABLE_KEY.test(key) && !LEGACY_WEAPON_KEY.test(key)) {
      add("error", "invalid-choice-id", `Choice identity "${key}" has an invalid stable-key format.`, record, column);
    }
    if (choiceDefinitions.has(key)) {
      add("error", "duplicate-choice-id", `Choice identity "${key}" is ambiguous.`, record, column, {
        firstSource: choiceDefinitions.get(key).record.source,
      });
    } else {
      choiceDefinitions.set(key, { record, kind });
    }
  }

  for (const record of [...collections.classFeatures, ...collections.feats, ...collections.originFeatures]) {
    if (record.kind === "optionGroup") defineChoice(record.featureKey || record.featKey, record, record.featureKey ? "featureKey" : "featKey", "optionGroup");
  }
  for (const record of expressionRows) {
    for (const grant of record.grants || []) defineChoice(grant.choiceId, record, "grants", "grant");
  }

  function requireChoice(value, record, column) {
    if (value && !choiceDefinitions.has(value)) {
      add("error", "unresolved-choice-reference", `Choice reference "${value}" does not resolve.`, record, column, { key: value });
    }
  }

  function rejectDisplayNameReference(expression, record, column, kind) {
    if (expression.name && !expression.key) {
      add("error", "display-name-reference", `${kind} expression uses display name instead of stable key.`, record, column);
    }
  }

  function validateGrant(grant, record) {
    const column = "grants";
    if (getExpressionRuntimeStatus("grant", grant, { syntaxVersion: v5 ? 3 : 2 }) === "stubbed") {
      add("warning", "runtime-subsystem-stubbed", `${grant.type} grant is preserved but its runtime subsystem is stubbed.`, record, column, { type: grant.type });
    }
    if (grant.choiceRef) requireChoice(grant.choiceRef, record, column);
    if (grant.type === "technique") {
      rejectDisplayNameReference(grant, record, column, "Technique grant");
      if (grant.key) requireReference(techniques, grant.key, { record, column, kind: "Technique" });
      const target = grant.key ? techniques.get(grant.key) : null;
      if (target?.selectionMode === "draft" || (v5 && target && target.status !== "playable")) {
        add("error", "draft-record-granted", `Technique grant references draft technique "${grant.key}".`, record, column, { key: grant.key });
      }
    } else if (grant.type === "feat") {
      rejectDisplayNameReference(grant, record, column, "Feat grant");
      if (grant.key) requireReference(feats, grant.key, { record, column, kind: "Feat" });
      if (grant.classKey) requireReference(classes, grant.classKey, { record, column, kind: "Class" });
    } else if (grant.type === "weapon") {
      rejectDisplayNameReference(grant, record, column, "Weapon grant");
      if (grant.key) requireReference(weaponBases, grant.key, { record, column, kind: "Weapon base" });
      if (grant.enhancement) requireReference(weaponEnhancements, grant.enhancement, { record, column, kind: "Weapon enhancement" });
    } else if (grant.type === "weapon-enhancement" && grant.enhancement) {
      requireReference(weaponEnhancements, grant.enhancement, { record, column, kind: "Weapon enhancement" });
    } else if (grant.type === "option") {
      requireChoice(grant.groupKey || grant.choiceRef, record, column);
    } else if ((grant.type === "skill" || grant.type === "specialization") && grant.key && !STABLE_KEY.test(grant.key)) {
      add("error", "invalid-stable-id", `Skill reference "${grant.key}" has an invalid stable-key format.`, record, column);
    }
  }

  function validatePrerequisite(prerequisite, record) {
    const column = "prerequisites";
    if (v5 && prerequisite.type === "any") {
      (Array.isArray(prerequisite.alternatives) ? prerequisite.alternatives : []).forEach((alternative) => validatePrerequisite(alternative, record));
      return;
    }
    if (prerequisite.type === "class") {
      rejectDisplayNameReference(prerequisite, record, column, "Class prerequisite");
      if (prerequisite.key) requireReference(classes, prerequisite.key, { record, column, kind: "Class" });
    } else if (prerequisite.type === "feat") {
      rejectDisplayNameReference(prerequisite, record, column, "Feat prerequisite");
      if (prerequisite.key) requireReference(feats, prerequisite.key, { record, column, kind: "Feat" });
    } else if (prerequisite.type === "origin") {
      rejectDisplayNameReference(prerequisite, record, column, "Origin prerequisite");
      if (prerequisite.key) requireReference(origins, prerequisite.key, { record, column, kind: "Origin" });
    } else if (prerequisite.type === "weapon") {
      rejectDisplayNameReference(prerequisite, record, column, "Weapon prerequisite");
      if (prerequisite.key) requireReference(weaponBases, prerequisite.key, { record, column, kind: "Weapon base" });
    } else if (prerequisite.type === "choice") {
      requireChoice(prerequisite.choiceRef, record, column);
    }
  }

  for (const record of expressionRows) {
    for (const grant of record.grants || []) validateGrant(grant, record);
    for (const prerequisite of record.prerequisites || []) validatePrerequisite(prerequisite, record);
  }

  let featureInvocations = [];
  if (v5) {
    featureInvocations = validateV5Relationships(model, { add, requireReference, identityIndex, techniques, feats, expressionRows, choiceDefinitions, runtimeSupportBySource });
  }

  const knownEnumValues = {
    status: CLASS_STATUSES,
    selectionMode: SELECTION_MODES,
    energyCostKind: ENERGY_COST_KINDS,
  };
  for (const [domain, entries] of Object.entries(model?.enums || {})) {
    const allowed = knownEnumValues[domain];
    if (!allowed) continue;
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.value)) add("error", "duplicate-enum-value", `Enum ${domain} repeats value "${entry.value}".`, entry, "value");
      seen.add(entry.value);
      if (!allowed.has(entry.value)) add("error", "unsupported-enum-value", `Enum ${domain} value "${entry.value}" is unsupported.`, entry, "value");
    }
  }

  const ordered = diagnostics.sort(compareDiagnostics).map(({ _sequence, ...item }) => Object.freeze(item));
  const counts = Object.freeze({
    errors: ordered.filter((item) => item.severity === "error").length,
    warnings: ordered.filter((item) => item.severity === "warning").length,
  });
  return Object.freeze({
    ok: counts.errors === 0,
    diagnostics: Object.freeze(ordered),
    counts,
    ...(v5 ? { runtimeSupportBySource: Object.freeze(runtimeSupportBySource), featureInvocations: Object.freeze(featureInvocations) } : {}),
  });
}

export function validateAdaptedGameData(adapted) {
  if (!adapted || typeof adapted !== "object" || !adapted.model) {
    throw new TypeError("Adapted game data must include a canonical model.");
  }
  return validateGameDataModel(adapted.model, { priorDiagnostics: adapted.diagnostics || [] });
}
