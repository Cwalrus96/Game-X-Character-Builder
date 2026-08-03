import { CORE_SKILL_FIELDS, DEFENSE_SKILL_FIELDS } from "./character-rules.js";
import { buildCharacterDependencyGraph } from "./character-dependency-graph.js";
import { sanitizeNamedSkillList, sanitizeSkillFields, sanitizeStringArray, sanitizeText } from "./data-sanitization.js";
import { computeGrantedSkillsState, getGameXClasses } from "./game-data.js";

const DEFENSE_FIELD_KEYS = new Set(DEFENSE_SKILL_FIELDS.map(({ key }) => key));
const CORE_FIELD_BY_LABEL = new Map(CORE_SKILL_FIELDS.map(({ key, label }) => [label, key]));

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clonePlainObject(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlainObject(item));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = clonePlainObject(child);
  return out;
}

function setPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return;

  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = clonePlainObject(value);
}

function getPath(source, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cursor = source;
  for (const part of parts) {
    if (!isPlainObject(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = cursor?.[part];
  }
  return cursor;
}

export function buildBuilderWithPatch(builder = {}, patch = {}) {
  const out = clonePlainObject(isPlainObject(builder) ? builder : {});
  for (const [path, value] of Object.entries(patch || {})) {
    if (!path.startsWith("builder.")) continue;
    setPath(out, path.slice("builder.".length), value);
  }
  return out;
}

export function buildDependencyGraph(gameData, builder = {}) {
  return buildCharacterDependencyGraph(gameData, builder);
}

export function summarizeDependencyChanges(changes) {
  const warnings = [];
  const removalsByPath = new Map();
  const incomplete = [];

  for (const change of Array.isArray(changes) ? changes : []) {
    if (change.type === "remove") {
      if (!removalsByPath.has(change.storagePath)) removalsByPath.set(change.storagePath, []);
      removalsByPath.get(change.storagePath).push(change);
    }
    if (change.type === "incomplete") incomplete.push(change);
  }

  const removalLabels = {
    "builder.selectedFeats": "feat",
    "builder.selectedClassFeatureOptions": "class option selection",
    "builder.selectedFeatOptions": "feat option selection",
    "builder.selectedTechniques": "selected technique",
    "builder.grantChoices": "source-owned choice",
    "builder.weapons": "source-owned weapon",
  };

  for (const [path, items] of removalsByPath.entries()) {
    if (path === "builder.grantChoices") {
      for (const item of items) {
        const label = item.label || "A granted choice";
        warnings.push(item.reason || `This change will remove ${label}.`);
      }
      continue;
    }
    const label = removalLabels[path] || "selection";
    warnings.push(`This change will remove ${items.length} ${label}${items.length === 1 ? "" : "s"}.`);
  }

  for (const change of incomplete) {
    warnings.push(`${change.label}: ${change.reason}`);
  }

  for (const change of Array.isArray(changes) ? changes : []) {
    if (change.severity === "error") continue;
    if (change.type === "remove" || change.type === "incomplete") continue;
    const message = change.reason || change.label;
    if (message) warnings.push(message);
  }

  return warnings;
}

export function summarizeDependencyRemovals(changes) {
  return summarizeDependencyChanges((Array.isArray(changes) ? changes : [])
    .filter((change) => change?.type === "remove"));
}

function makePatchForReconciledFields(proposedBuilder, reconciledBuilder) {
  const patch = {};
  const paths = [
    "selectedClassFeatureOptions",
    "selectedFeats",
    "selectedFeatOptions",
    "selectedTechniques",
    "grantChoices",
    "weapons",
  ];

  for (const path of paths) {
    const previousValue = JSON.stringify(getPath(proposedBuilder, path) ?? null);
    const nextValue = JSON.stringify(getPath(reconciledBuilder, path) ?? null);
    if (previousValue !== nextValue) {
      patch[`builder.${path}`] = clonePlainObject(getPath(reconciledBuilder, path));
    }
  }

  return patch;
}

export function analyzeBuilderChange(gameData, previousBuilder = {}, proposedPatch = {}, { mode = "preview" } = {}) {
  const previous = clonePlainObject(isPlainObject(previousBuilder) ? previousBuilder : {});
  const proposedBuilder = buildBuilderWithPatch(previous, proposedPatch);
  const graph = buildDependencyGraph(gameData, proposedBuilder);
  const reconciledBuilder = graph.builder;
  const changes = Array.isArray(graph.changes) ? graph.changes : [];
  const reconciliationPatch = makePatchForReconciledFields(proposedBuilder, reconciledBuilder);
  const dependencyPatch = buildDependencyRefreshPatch(gameData, reconciledBuilder, { previousBuilder: previous });
  const patch = {
    ...(mode === "commit" ? proposedPatch : {}),
    ...reconciliationPatch,
    ...dependencyPatch,
  };
  const warnings = summarizeDependencyChanges(changes);
  const errors = changes
    .filter((change) => change.severity === "error")
    .map((change) => change.reason || change.label)
    .filter(Boolean);

  return {
    previousBuilder: previous,
    proposedBuilder,
    reconciledBuilder,
    graph,
    patch,
    changes,
    warnings,
    errors,
    ok: errors.length === 0,
  };
}

export function previewBuilderChange(gameData, previousBuilder = {}, proposedPatch = {}, options = {}) {
  return analyzeBuilderChange(gameData, previousBuilder, proposedPatch, { ...options, mode: "preview" });
}

export function reconcileBuilderChange(gameData, previousBuilder = {}, proposedPatch = {}, options = {}) {
  return analyzeBuilderChange(gameData, previousBuilder, proposedPatch, { ...options, mode: "commit" });
}

export function validateBuilderState(gameData, builder = {}) {
  return analyzeBuilderChange(gameData, builder, {}, { mode: "preview" });
}

function normalizeSkillName(value) {
  return sanitizeText(value, { maxLen: 96, collapse: true });
}

function getClassUtilityOptions(gameData, builder) {
  const classKey = sanitizeText(builder?.classKey || "", { maxLen: 64, collapse: true });
  if (!classKey) return new Set();

  const cls = getGameXClasses(gameData).find((entry) => String(entry?.classKey || "") === classKey);
  return new Set(
    sanitizeStringArray(cls?.utilitySkillOptions, { maxItems: 100, maxLen: 96 })
      .map((name) => normalizeSkillName(name))
      .filter(Boolean),
  );
}

function sanitizeSelectedClassUtilitySkills(gameData, builder) {
  const allowed = getClassUtilityOptions(gameData, builder);
  const out = [];
  const seen = new Set();

  for (const rawName of sanitizeStringArray(builder?.selectedClassUtilitySkills, { maxItems: 50, maxLen: 96 })) {
    const name = normalizeSkillName(rawName);
    const dedupeKey = name.toLowerCase();
    if (!name || !allowed.has(name) || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(name);
  }

  return out;
}

function classUtilityCoreFieldKeys(selectedClassUtilitySkills) {
  const out = new Set();
  for (const skillName of sanitizeStringArray(selectedClassUtilitySkills, { maxItems: 50, maxLen: 96 })) {
    const fieldKey = CORE_FIELD_BY_LABEL.get(normalizeSkillName(skillName));
    if (fieldKey) out.add(fieldKey);
  }
  return out;
}

function getSheetFields(builder) {
  return sanitizeSkillFields(builder?.sheet?.fields);
}

function getRepeatables(builder) {
  const repeatables = isPlainObject(builder?.sheet?.repeatables) ? builder.sheet.repeatables : {};
  return {
    ...repeatables,
    combatSkillsExtra: sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 }),
    settingSkills: sanitizeNamedSkillList(repeatables.settingSkills, { maxItems: 50 }),
  };
}

function prunePreviouslyGrantedRows(rows, grantedBefore, grantedNow) {
  const before = new Set(Array.from(grantedBefore || []).map((name) => normalizeSkillName(name).toLowerCase()).filter(Boolean));
  const now = new Set(Array.from(grantedNow || []).map((name) => normalizeSkillName(name).toLowerCase()).filter(Boolean));
  return sanitizeNamedSkillList(rows, { maxItems: 50 })
    .filter((row) => {
      const key = normalizeSkillName(row?.skill).toLowerCase();
      return !key || !before.has(key) || now.has(key);
    });
}

export function buildDependencyRefreshPatch(gameData, builder = {}, { previousBuilder = {} } = {}) {
  const b = isPlainObject(builder) ? builder : {};
  const previous = isPlainObject(previousBuilder) ? previousBuilder : {};
  const grantedSkillState = computeGrantedSkillsState(gameData, b);
  const previousGrantedSkillState = computeGrantedSkillsState(gameData, previous);

  const fields = getSheetFields(b);
  const previousFixedRanks = previousGrantedSkillState?.fixedRanks || {};
  const fixedRanks = grantedSkillState?.fixedRanks || {};

  for (const fieldKey of DEFENSE_FIELD_KEYS) {
    const nextRank = sanitizeText(fixedRanks[fieldKey], { maxLen: 8, collapse: true });
    const wasGranted = sanitizeText(previousFixedRanks[fieldKey], { maxLen: 8, collapse: true }) !== "";
    if (nextRank !== "") fields[fieldKey] = nextRank;
    else if (wasGranted) fields[fieldKey] = "";
  }

  const selectedClassUtilitySkills = sanitizeSelectedClassUtilitySkills(gameData, b);
  const previousUtilityCoreFields = classUtilityCoreFieldKeys(previous.selectedClassUtilitySkills);
  const nextUtilityCoreFields = classUtilityCoreFieldKeys(selectedClassUtilitySkills);
  for (const fieldKey of previousUtilityCoreFields) {
    if (!nextUtilityCoreFields.has(fieldKey)) fields[fieldKey] = "";
  }
  for (const fieldKey of nextUtilityCoreFields) fields[fieldKey] = "";

  const repeatables = getRepeatables(b);
  const grantedSkillNames = grantedSkillState?.grantedSkillNames instanceof Set
    ? grantedSkillState.grantedSkillNames
    : new Set();
  const previousGrantedSkillNames = previousGrantedSkillState?.grantedSkillNames instanceof Set
    ? previousGrantedSkillState.grantedSkillNames
    : new Set();
  repeatables.combatSkillsExtra = prunePreviouslyGrantedRows(
    repeatables.combatSkillsExtra,
    previousGrantedSkillNames,
    grantedSkillNames,
  );

  return {
    "builder.sheet.fields": fields,
    "builder.sheet.repeatables": repeatables,
    "builder.selectedClassUtilitySkills": selectedClassUtilitySkills,
    "builder.grantedCoreSkillSnapshot": Array.from(nextUtilityCoreFields),
    "builder.grantedSkillSnapshot": Array.from(grantedSkillNames),
  };
}
