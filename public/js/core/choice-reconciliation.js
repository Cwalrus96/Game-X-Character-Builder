import { buildOptionKey, sanitizeStringArray, sanitizeText } from "./data-sanitization.js";
import {
  collectOptionGroups,
  deleteSelectedDescendants,
} from "./option-groups.js";
import { checkPrerequisites } from "./prerequisites.js";

export function optionKeysForEntries(entries) {
  const out = new Set();
  for (const group of collectOptionGroups(entries)) {
    for (const option of Array.isArray(group?.options) ? group.options : []) {
      out.add(buildOptionKey(group, option));
    }
  }
  return out;
}

export function indexOptionLabels(entries) {
  const out = new Map();
  for (const group of collectOptionGroups(entries)) {
    for (const option of Array.isArray(group?.options) ? group.options : []) {
      const key = buildOptionKey(group, option);
      out.set(key, sanitizeText(option?.name || key, { maxLen: 200, collapse: true }));
    }
  }
  return out;
}

export function selectedSet(values, { maxItems = 1000, maxLen = 200 } = {}) {
  return new Set(sanitizeStringArray(values, { maxItems, maxLen }));
}

export function removeSelection(selected, value, changes, change) {
  if (!selected?.has?.(value)) return false;
  selected.delete(value);
  changes.push({
    type: "remove",
    severity: "warning",
    ...change,
    previousValue: value,
    nextValue: "",
  });
  return true;
}

export function reconcileSelectedOptionKeys({
  entries = [],
  previousEntries = [],
  selectedKeys,
  changes = [],
  storagePath = "",
  nodePrefix = "choice:option",
  unavailableReason = "This option is no longer available.",
  prerequisiteContext = {},
  getPrerequisiteContext = null,
  prerequisiteReason = "Prerequisites are no longer met.",
} = {}) {
  const selected = selectedKeys instanceof Set ? selectedKeys : selectedSet(selectedKeys);
  const labels = indexOptionLabels([].concat(entries || [], previousEntries || []));
  const allowed = optionKeysForEntries(entries);

  for (const key of Array.from(selected)) {
    if (allowed.has(key)) continue;
    removeSelection(selected, key, changes, {
      storagePath,
      nodeId: `${nodePrefix}:${key}`,
      label: labels.get(key) || key,
      reason: unavailableReason,
    });
  }

  for (const group of collectOptionGroups(entries)) {
    for (const option of Array.isArray(group?.options) ? group.options : []) {
      const key = buildOptionKey(group, option);
      if (!selected.has(key)) continue;
      const context = typeof getPrerequisiteContext === "function"
        ? getPrerequisiteContext(selected)
        : prerequisiteContext;
      const check = checkPrerequisites(option?.prerequisites, context);
      if (check.ok) continue;
      removeSelection(selected, key, changes, {
        storagePath,
        nodeId: `${nodePrefix}:${key}`,
        label: labels.get(key) || sanitizeText(option?.name || key, { maxLen: 200, collapse: true }),
        reason: check.failureReasons.join(" ") || prerequisiteReason,
      });
      deleteSelectedDescendants(option, selected);
    }
  }

  return { selectedKeys: selected, changes };
}
