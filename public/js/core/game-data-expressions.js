import { getExpressionRegistry } from "./game-data-contract.js";

const TYPE_PATTERN = /^[a-z][a-z-]*$/;
const FIELD_PATTERN = /^[a-z][a-zA-Z]*$/;

const registryFor = getExpressionRegistry;

function diagnostic(kind, code, message, { context = null, line = null, field = null, severity = "error" } = {}) {
  return Object.freeze({ severity, code, kind, message, context, line, field });
}

function splitOr(value) {
  if (Array.isArray(value)) return value;
  const raw = String(value ?? "").trim();
  const values = raw.split(/\s+OR\s+/i).map((part) => part.trim());
  return values.length > 1 ? values : raw;
}

function normalizeCapacityExpression(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.kind === "constant" && Number.isInteger(value.value) && value.value >= 0) {
      return { ok: true, value: { kind: "constant", value: value.value } };
    }
    if (value.kind === "symbol" && /^[a-z][a-z0-9-]*$/.test(value.symbol)) {
      return { ok: true, value: { kind: "symbol", symbol: value.symbol } };
    }
    return { ok: false, reason: "must be a nonnegative integer or a stable symbolic key" };
  }

  const raw = String(value ?? "").trim();
  if (/^(0|[1-9]\d*)$/.test(raw)) {
    return { ok: true, value: { kind: "constant", value: Number(raw) } };
  }
  if (/^primary(?:[ -]?attribute)$/i.test(raw) || raw === "primaryAttribute") {
    return { ok: true, value: { kind: "symbol", symbol: "primary-attribute" } };
  }
  if (/^[a-z][a-z0-9-]*$/.test(raw)) return { ok: true, value: { kind: "symbol", symbol: raw } };
  return { ok: false, reason: "must be a nonnegative integer or a stable symbolic key" };
}

function normalizeScalar(value, spec) {
  if (spec.type === "capacity-expression") return normalizeCapacityExpression(value);

  if (spec.type === "boolean") {
    if (value === true || value === false) return { ok: true, value };
    const raw = String(value ?? "").trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(raw)) return { ok: true, value: true };
    if (["false", "no", "n", "0"].includes(raw)) return { ok: true, value: false };
    return { ok: false, reason: "must be a boolean" };
  }

  if (spec.type === "key-list") {
    const values = (Array.isArray(value) ? value : String(value ?? "").split(","))
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    if (!values.length) return { ok: false, reason: "must contain at least one key" };
    return { ok: true, value: values };
  }

  if (spec.type === "integer") {
    let parsed = null;
    if (typeof value === "number" && Number.isInteger(value)) parsed = value;
    if (typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value.trim())) parsed = Number(value.trim());
    if (!Number.isInteger(parsed)) return { ok: false, reason: "must be an integer" };
    if (Number.isFinite(spec.min) && parsed < spec.min) return { ok: false, reason: `must be at least ${spec.min}` };
    if (Number.isFinite(spec.max) && parsed > spec.max) return { ok: false, reason: `must be at most ${spec.max}` };
    return { ok: true, value: parsed };
  }

  const cleanOne = (item) => String(item ?? "").trim();
  const raw = spec.allowOr ? splitOr(value) : cleanOne(value);
  const normalized = Array.isArray(raw) ? raw.map(cleanOne) : cleanOne(raw);
  if (Array.isArray(normalized) && Number.isInteger(spec.minItems) && normalized.length < spec.minItems) {
    return { ok: false, reason: `must contain at least ${spec.minItems} value` };
  }
  if (Array.isArray(normalized) ? normalized.some((item) => !item) : !normalized) {
    return { ok: false, reason: "must not be blank" };
  }
  if (spec.type === "enum") {
    if (Array.isArray(normalized)) return { ok: false, reason: "does not allow OR values" };
    const lower = normalized.toLowerCase();
    if (!spec.values.includes(lower)) return { ok: false, reason: `must be one of ${spec.values.join(", ")}` };
    return { ok: true, value: lower };
  }
  return { ok: true, value: normalized };
}

function finalizeValue(kind, value) {
  if (kind === "grant" && value.type === "technique" && !value.key && !value.name && (value.skill || value.tag)) {
    return { ...value, type: "technique-choice", count: value.count ?? 1 };
  }
  return value;
}

function validateFields(kind, type, rawFields, { context = null, line = null, syntaxVersion = 2 } = {}) {
  const registry = registryFor(kind, { syntaxVersion });
  const definition = registry[type];
  const diagnostics = [];
  if (!definition) {
    diagnostics.push(diagnostic(kind, "unknown-type", `Unknown ${kind} type "${type}".`, { context, line }));
    return { ok: false, value: null, diagnostics };
  }

  const value = { type };
  for (const [rawKey, rawValue] of rawFields) {
    if (!FIELD_PATTERN.test(rawKey)) {
      diagnostics.push(diagnostic(kind, "invalid-field-name", `Field "${rawKey}" must use lower camelCase.`, { context, line, field: rawKey }));
      continue;
    }
    const key = definition.aliases[rawKey] || rawKey;
    const spec = definition.fields[key];
    if (!spec) {
      diagnostics.push(diagnostic(kind, "unknown-field", `Field "${rawKey}" is not allowed for ${kind} type "${type}".`, { context, line, field: rawKey }));
      continue;
    }
    if (Object.hasOwn(value, key)) {
      diagnostics.push(diagnostic(kind, "duplicate-field", `Field "${rawKey}" duplicates normalized field "${key}".`, { context, line, field: rawKey }));
      continue;
    }
    const scalar = normalizeScalar(rawValue, spec);
    if (!scalar.ok) {
      diagnostics.push(diagnostic(kind, "invalid-scalar", `Field "${rawKey}" ${scalar.reason}.`, { context, line, field: rawKey }));
      continue;
    }
    value[key] = scalar.value;
  }

  for (const [key, defaultValue] of Object.entries(definition.defaults)) {
    if (!Object.hasOwn(value, key)) value[key] = defaultValue;
  }
  for (const key of definition.required) {
    if (!Object.hasOwn(value, key)) {
      diagnostics.push(diagnostic(kind, "missing-field", `${kind} type "${type}" requires field "${key}".`, { context, line, field: key }));
    }
  }
  for (const group of definition.requiredAny) {
    if (!group.some((key) => Object.hasOwn(value, key))) {
      diagnostics.push(diagnostic(kind, "missing-field-group", `${kind} type "${type}" requires one of: ${group.join(", ")}.`, { context, line }));
    }
  }
  for (const group of definition.mutuallyExclusive) {
    if (group.filter((key) => Object.hasOwn(value, key)).length > 1) {
      diagnostics.push(diagnostic(kind, "conflicting-fields", `${kind} type "${type}" permits only one of: ${group.join(", ")}.`, { context, line }));
    }
  }

  const ok = diagnostics.every((item) => item.severity !== "error");
  return { ok, value: ok ? finalizeValue(kind, value) : null, diagnostics };
}

export function normalizeExpressionObject(kind, input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      value: null,
      diagnostics: [diagnostic(kind, "invalid-expression", `${kind} expression must be an object.`, options)],
    };
  }
  const type = String(input.type ?? "").trim();
  if (type === "any" && (kind === "basicAttack" || (kind === "prerequisite" && Number(options.syntaxVersion) >= 3))) {
    if (!Array.isArray(input.alternatives) || input.alternatives.length < 2 || Object.keys(input).some((key) => !["type", "alternatives"].includes(key))) {
      return { ok: false, value: null, diagnostics: [diagnostic(kind, "invalid-alternatives", "A typed OR expression requires at least two alternatives and no other fields.", options)] };
    }
    const results = input.alternatives.map((item) => normalizeExpressionObject(kind, item, options));
    const diagnostics = results.flatMap((item) => item.diagnostics);
    const ok = results.every((item) => item.ok);
    return { ok, value: ok ? { type: "any", alternatives: results.map((item) => item.value) } : null, diagnostics };
  }
  if (!TYPE_PATTERN.test(type)) {
    return {
      ok: false,
      value: null,
      diagnostics: [diagnostic(kind, "invalid-type", `${kind} type "${type}" must use lowercase letters and hyphens.`, options)],
    };
  }
  return validateFields(kind, type, Object.entries(input).filter(([key]) => key !== "type"), options);
}

export function parseExpressionLine(kind, input, options = {}) {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: true, value: null, diagnostics: [] };

  // A value such as `category=dragoon OR multiclass | maxLevel=1` is
  // never a grant disjunction. Prerequisite clauses only start at known types.
  if (kind === "basicAttack" || (kind === "prerequisite" && Number(options.syntaxVersion) >= 3)) {
    const heads = Object.keys(registryFor(kind, options)).join("|");
    const separator = kind === "basicAttack"
      ? new RegExp(`\\s+OR\\s+(?=(?:${heads})(?:\\s*\\||\\s*$))`, "i")
      : new RegExp(`\\s+OR\\s+(?=(?:${heads})\\s*\\|)`, "i");
    const alternatives = raw.split(separator);
    if (alternatives.length > 1) {
      const results = alternatives.map((part) => parseExpressionLine(kind, part, options));
      const diagnostics = results.flatMap((result) => result.diagnostics);
      const ok = results.every((result) => result.ok);
      return { ok, value: ok ? { type: "any", alternatives: results.map((result) => result.value) } : null, diagnostics };
    }
  }

  const parts = raw.split("|").map((part) => part.trim());
  if (kind === "prerequisite" && parts.length === 1) {
    return {
      ok: true,
      value: { type: "text", text: raw },
      diagnostics: [diagnostic(kind, "legacy-text", "Unstructured prerequisite text is preserved as a manual rule.", { ...options, severity: "warning" })],
    };
  }
  const type = parts.shift();
  if (!TYPE_PATTERN.test(type)) {
    return {
      ok: false,
      value: null,
      diagnostics: [diagnostic(kind, "invalid-type", `${kind} type "${type}" must use lowercase letters and hyphens.`, options)],
    };
  }

  const fields = [];
  const syntaxDiagnostics = [];
  // Canonical compact archetype authoring has a positional stable key.
  if (kind === "prerequisite" && Number(options.syntaxVersion) >= 3 && type === "archetype" && parts[0] && !parts[0].includes("=")) fields.push(["key", parts.shift()]);
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      syntaxDiagnostics.push(diagnostic(kind, "invalid-field-syntax", `Field "${part}" must use key=value syntax.`, options));
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value) {
      syntaxDiagnostics.push(diagnostic(kind, "blank-field", `Field "${part}" must include both key and value.`, { ...options, field: key || null }));
      continue;
    }
    fields.push([key, value]);
  }
  const result = validateFields(kind, type, fields, options);
  const diagnostics = [...syntaxDiagnostics, ...result.diagnostics];
  return {
    ok: diagnostics.every((item) => item.severity !== "error"),
    value: diagnostics.some((item) => item.severity === "error") ? null : result.value,
    diagnostics,
  };
}

export function parseExpressionBlock(kind, input, options = {}) {
  const raw = String(input ?? "").replace(/\r\n?/g, "\n");
  if (!raw.trim()) return { ok: true, values: [], diagnostics: [] };
  const values = [];
  const diagnostics = [];
  raw.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const result = parseExpressionLine(kind, line, { ...options, line: index + 1 });
    if (result.value) values.push(result.value);
    diagnostics.push(...result.diagnostics);
  });
  return { ok: diagnostics.every((item) => item.severity !== "error"), values, diagnostics };
}

export const parseGrantExpression = (input, options) => parseExpressionLine("grant", input, options);
export const parseGrantExpressions = (input, options) => parseExpressionBlock("grant", input, options);
export const parsePrerequisiteExpression = (input, options) => parseExpressionLine("prerequisite", input, options);
export const parsePrerequisiteExpressions = (input, options) => parseExpressionBlock("prerequisite", input, options);
export const parseBasicAttackExpression = (input, options) => parseExpressionLine("basicAttack", input, { syntaxVersion: 3, ...options });
export const parseBasicAttackExpressions = (input, options) => parseExpressionBlock("basicAttack", input, { syntaxVersion: 3, ...options });

function serializeScalar(value, spec) {
  if (Array.isArray(value)) return value.join(spec?.type === "key-list" ? "," : " OR ");
  if (value && typeof value === "object") {
    if (value.kind === "constant") return String(value.value);
    if (value.kind === "symbol") return value.symbol;
  }
  return String(value);
}

export function serializeExpression(kind, input, options = {}) {
  const normalized = normalizeExpressionObject(kind, input, options);
  if (!normalized.ok) return { ok: false, value: "", diagnostics: normalized.diagnostics };
  const value = normalized.value;
  if (value.type === "any") return { ok: true, value: value.alternatives.map((item) => serializeExpression(kind, item, options).value).join(" OR "), diagnostics: [] };
  const definition = registryFor(kind, options)[value.type];
  const parts = [value.type];
  for (const key of Object.keys(definition.fields)) {
    if (Object.hasOwn(value, key)) parts.push(`${key}=${serializeScalar(value[key], definition.fields[key])}`);
  }
  return { ok: true, value: parts.join(" | "), diagnostics: [] };
}

export function resolveCapacityExpression(expression, context = {}) {
  const parsed = normalizeCapacityExpression(expression);
  if (!parsed.ok) return null;
  if (parsed.value.kind === "constant") return parsed.value.value;
  const raw = parsed.value.symbol === "primary-attribute"
    ? context.primaryAttribute
    : context.values?.[parsed.value.symbol] ?? context[parsed.value.symbol];
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

export function formatExpressionDiagnostic(item) {
  const context = item?.context;
  const location = typeof context === "string"
    ? context
    : [context?.sheet, context?.cell || (context?.row && context?.column ? `${context.column}${context.row}` : "")].filter(Boolean).join(" ");
  const line = item?.line ? ` line ${item.line}` : "";
  return `${location || item?.kind || "expression"}${line}: ${item?.message || "Invalid expression."}`;
}
