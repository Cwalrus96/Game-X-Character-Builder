// Shared pure availability policy for normalized and reviewed-legacy records.
export function isGameDataRecordSelectable(record, { allowGrantedOnly = false } = {}) {
  const mode = String(record?.selectionMode || "").trim().toLowerCase();
  if (mode === "draft") return false;
  if (mode === "granted-only") return Boolean(allowGrantedOnly);
  if (mode === "selectable") return true;
  if (mode) return false;
  return record?.selectable !== false;
}

