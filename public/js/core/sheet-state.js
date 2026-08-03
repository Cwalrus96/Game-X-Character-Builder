import { sanitizeText, toInt } from "./data-sanitization.js";

const TEMPORARY_FIELD_KEYS = Object.freeze([
  "hpcur",
  "strain",
  "overstrained",
  "notes",
]);

const TEMPORARY_REPEATABLE_KEYS = Object.freeze([
  "conditions",
]);

const TEMPORARY_FIELD_KEY_SET = new Set(TEMPORARY_FIELD_KEYS);
const TEMPORARY_REPEATABLE_KEY_SET = new Set(TEMPORARY_REPEATABLE_KEYS);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeOptionalNonNegativeInteger(value, { max = 999999 } = {}) {
  const raw = sanitizeText(value, { maxLen: 16, collapse: true });
  if (!raw) return "";
  return String(toInt(raw, { min: 0, max }));
}

function sanitizeConditions(value) {
  const rows = Array.isArray(value) ? value : [];
  const out = [];

  for (const rawRow of rows) {
    const row = isPlainObject(rawRow) ? rawRow : {};
    const condition = {
      name: sanitizeText(row.name, { maxLen: 120, collapse: true }),
      n: sanitizeOptionalNonNegativeInteger(row.n, { max: 9999 }),
      notes: sanitizeText(row.notes, { maxLen: 1000, collapse: false }),
    };
    if (!condition.name && !condition.n && !condition.notes) continue;
    out.push(condition);
    if (out.length >= 100) break;
  }

  return out;
}

export function isTemporarySheetFieldName(value) {
  return TEMPORARY_FIELD_KEY_SET.has(String(value || ""));
}

export function isTemporarySheetRepeatableKey(value) {
  return TEMPORARY_REPEATABLE_KEY_SET.has(String(value || ""));
}

export function pickTemporarySheetFields(value) {
  const source = isPlainObject(value) ? value : {};
  const out = {};

  for (const key of TEMPORARY_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (key === "hpcur" || key === "strain") {
      out[key] = sanitizeOptionalNonNegativeInteger(source[key]);
    } else if (key === "overstrained") {
      out[key] = !!source[key];
    } else if (key === "notes") {
      out[key] = sanitizeText(source[key], { maxLen: 20000, collapse: false });
    }
  }

  return out;
}

export function pickTemporarySheetRepeatables(value) {
  const source = isPlainObject(value) ? value : {};
  const out = {};

  if (Object.prototype.hasOwnProperty.call(source, "conditions")) {
    out.conditions = sanitizeConditions(source.conditions);
  }

  return out;
}

export function isSheetOwnedUpdatePath(value) {
  const path = String(value || "");
  if (path.startsWith("builder.sheet.fields.")) {
    return isTemporarySheetFieldName(path.slice("builder.sheet.fields.".length));
  }
  if (path.startsWith("builder.sheet.repeatables.")) {
    return isTemporarySheetRepeatableKey(path.slice("builder.sheet.repeatables.".length));
  }
  return false;
}

export function buildTemporarySheetUpdatePatch({
  allFields = {},
  repeatables = {},
} = {}) {
  const fields = pickTemporarySheetFields(allFields);
  const temporaryRepeatables = pickTemporarySheetRepeatables(repeatables);
  const patch = {};

  for (const [key, value] of Object.entries(fields)) {
    patch["builder.sheet.fields." + key] = value;
  }
  for (const [key, value] of Object.entries(temporaryRepeatables)) {
    patch["builder.sheet.repeatables." + key] = value;
  }

  return patch;
}
