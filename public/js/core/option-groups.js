import { buildOptionKey } from "./data-sanitization.js";

export function getEntryRequiredLevel(entry) {
  const raw = entry?.level ?? entry?.minLevel ?? 0;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}

export function isOptionGroup(entry) {
  return String(entry?.type || "") === "optionGroup";
}

export function collectOptionGroups(entries, out = []) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isOptionGroup(entry)) out.push(entry);
    collectOptionGroups(entry?.options, out);
  }
  return out;
}

export function collectOptionKeysForGroup(group) {
  return (Array.isArray(group?.options) ? group.options : []).map((option) => buildOptionKey(group, option));
}

export function collectSelectedEntries(entries, selectedKeys, out = []) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!Array.isArray(entry?.options)) continue;
    for (const option of entry.options) {
      const key = buildOptionKey(entry, option);
      if (!selectedKeys.has(key)) continue;
      out.push(option);
      collectSelectedEntries([option], selectedKeys, out);
    }
  }
  return out;
}

export function deleteSelectedDescendants(entry, selectedKeys) {
  if (!Array.isArray(entry?.options)) return;
  for (const option of entry.options) {
    selectedKeys.delete(buildOptionKey(entry, option));
    deleteSelectedDescendants(option, selectedKeys);
  }
}

export function selectedCountForGroup(group, selectedKeys) {
  return collectOptionKeysForGroup(group).filter((key) => selectedKeys.has(key)).length;
}

export function isGroupComplete(group, selectedKeys) {
  const chooseCount = Number(group?.chooseCount || 0);
  if (!chooseCount) return true;
  return selectedCountForGroup(group, selectedKeys) === chooseCount;
}
