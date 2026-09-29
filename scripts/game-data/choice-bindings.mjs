import { createHash } from "node:crypto";

const collections = ["classFeatures", "feats", "originFeatures", "techniques", "weaponProfiles", "weaponEnhancements", "traits"];
const keyOf = row => row.featureKey || row.featKey || row.traitKey || row.techniqueKey || row.enhancementKey || row.weaponKey;
const ownerOf = row => row.classKey ? `class:${row.classKey}` : row.originKey ? `origin:${row.originKey}`
  : row.featKey ? `class:${row.category}` : sourceOf(row);
const sourceOf = row => row.classKey ? `${row.kind === "option" ? "class-option" : "class-feature"}:${row.classKey}:${row.featureKey}`
  : row.originKey ? `origin-feature:${row.originKey}:${row.featureKey}`
    : row.featKey ? `${row.kind === "option" ? "feat-option" : "feat-selection"}:${row.featKey}`
      : row.traitKey ? `trait:${row.traitKey}` : row.techniqueKey ? `technique:${row.techniqueKey}`
        : row.enhancementKey ? `enhancement:${row.enhancementKey}`
          : `weapon-profile:${row.weaponKey}:${row.profileType}:${row.profileName}:${row.rank}`;

// Leave space for multi-pick suffixes and the generated weapon's `grant_` prefix
// within its existing 64-character ID limit. Hash the full identity, never a truncation.
function qualifiedId(sourceId, key) {
  const raw = `${sourceId}:${key}`;
  return raw.length <= 56 ? raw : `choice:${createHash("sha256").update(raw).digest("hex").slice(0, 40)}`;
}

/** Source rows own local choice keys. Labels, physical rows and catalogue order never identify them. */
export function createChoiceBindings(model) {
  const rows = collections.flatMap(name => model[name] || []);
  const definitions = [];
  const add = (key, record, kind, grant = null) => {
    if (!key) return;
    const sourceId = sourceOf(record);
    definitions.push({ key, record, kind, grant, sourceId, ownerId: ownerOf(record), id: qualifiedId(sourceId, key) });
  };
  for (const row of rows) {
    if (row.kind === "optionGroup") add(keyOf(row), row, "optionGroup");
    for (const grant of row.grants || []) add(grant.choiceId, row, "grant", grant);
  }
  const local = (key, row) => definitions.filter(item => item.key === key && item.sourceId === sourceOf(row));
  const parents = row => rows.filter(candidate => keyOf(candidate) === row.parentKey && ownerOf(candidate) === ownerOf(row));
  const resolve = (key, row) => {
    if (!key) return [];
    // Qualified references are explicit. A bare reference checks its source, ancestors,
    // owning class/origin, then the historical globally-unambiguous compatibility path.
    const qualified = definitions.filter(item => item.id === key || `${item.sourceId}:${item.key}` === key);
    if (qualified.length) return qualified;
    let current = row;
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      const matches = local(key, current);
      if (matches.length) return matches;
      const ancestors = current.parentKey ? parents(current) : [];
      current = ancestors.length === 1 ? ancestors[0] : null;
    }
    const owned = definitions.filter(item => item.key === key && item.ownerId === ownerOf(row));
    if (owned.length) return owned;
    return definitions.filter(item => item.key === key);
  };
  return { definitions, local, resolve };
}

// These answers share builder.grantChoices. Traits, Bonds and Keystones already
// compose their IDs from source/slot in their own Rules; preserve those saved bindings.
function needsQualifiedAnswer(definition) {
  const grant = definition.grant;
  return grant && ["weapon", "technique", "technique-choice"].includes(grant.type);
}

/** Compile references once so every widget, rule and graph consumes the same exact binding. */
export function bindModelChoices(model) {
  const bindings = createChoiceBindings(model);
  const aliases = [];
  const unique = (key, row) => {
    const matches = bindings.resolve(key, row);
    if (matches.length !== 1) throw new Error(`Choice reference "${key}" is not uniquely bound.`);
    return matches[0];
  };
  const rewrite = (expression, row) => {
    const result = { ...expression };
    if (expression.type === "any") result.alternatives = expression.alternatives.map(item => rewrite(item, row));
    if (expression.choiceId) {
      const definition = bindings.local(expression.choiceId, row);
      if (definition.length !== 1) throw new Error(`Choice "${expression.choiceId}" has duplicate definitions in one source.`);
      if (needsQualifiedAnswer(definition[0])) result.choiceId = definition[0].id;
    }
    if (expression.choiceRef) {
      const target = unique(expression.choiceRef, row);
      result.choiceRef = needsQualifiedAnswer(target) ? target.id : target.key;
    }
    if (expression.groupKey) result.groupKey = unique(expression.groupKey, row).key;
    if (expression.recipientRef && expression.type !== "trait" && expression.recipientRef !== "character") {
      result.recipientRef = unique(expression.recipientRef, row).key;
    }
    return result;
  };
  for (const definition of bindings.definitions.filter(needsQualifiedAnswer)) {
    const count = Math.max(1, Math.min(50, Number(definition.grant.count) || 1));
    for (let slot = 1; slot <= count; slot++) {
      const suffix = count > 1 ? `:${slot}` : "";
      aliases.push({ from: `${definition.key}${suffix}`, to: `${definition.id}${suffix}`, sourceId: definition.sourceId });
    }
  }
  const bound = Object.fromEntries(Object.entries(model).map(([name, rows]) => [name,
    collections.includes(name) ? rows.map(row => ({ ...row,
      ...(row.grants ? { grants: row.grants.map(item => rewrite(item, row)) } : {}),
      ...(row.prerequisites ? { prerequisites: row.prerequisites.map(item => rewrite(item, row)) } : {}),
    })) : rows,
  ]));
  return { model: bound, aliases: aliases.sort((a, b) => a.to.localeCompare(b.to)) };
}
