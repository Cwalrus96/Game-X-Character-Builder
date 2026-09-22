import { ATTR_KEYS, CORE_SKILL_FIELDS, DEFENSE_SKILL_FIELDS, normalizeAttributes } from "./character-rules.js";
import { sanitizeText, sanitizeStringArray } from "./data-sanitization.js";
import { canonicalSkillName } from "./skill-identity.js";
import { RUNTIME_PREREQUISITE_TYPES } from "./game-data-contract.js";
import {
  formatExpressionDiagnostic,
  normalizeExpressionObject,
  parsePrerequisiteExpressions,
} from "./game-data-expressions.js";

export const VALID_PREREQUISITE_TYPES = new Set(RUNTIME_PREREQUISITE_TYPES);

export function normalizePrerequisite(prereq, options = {}) {
  if (!prereq || typeof prereq !== "object") return null;
  const result = normalizeExpressionObject("prerequisite", prereq, { context: "runtime prerequisite", ...options });
  if (!result.ok) throw new Error(formatExpressionDiagnostic(result.diagnostics[0]));
  return result.value;
}

export function normalizePrerequisites(value, options = {}) {
  if (Array.isArray(value)) return value.map((item) => normalizePrerequisite(item, options)).filter(Boolean);
  return getEntryPrerequisites({ prerequisites: value, expressionSyntaxVersion: options.syntaxVersion });
}

export function getEntryPrerequisites(entry) {
  const options = { syntaxVersion: entry?.expressionSyntaxVersion ?? 2 };
  if (Array.isArray(entry?.prerequisites)) return entry.prerequisites.map((item) => normalizePrerequisite(item, options)).filter(Boolean);

  const text = sanitizeText(entry?.prerequisites || entry?.prereqs || "", { maxLen: 1000, collapse: false });
  if (!text) return [];
  const result = parsePrerequisiteExpressions(text, { context: "runtime prerequisite", ...options });
  if (!result.ok) throw new Error(formatExpressionDiagnostic(result.diagnostics[0]));
  return result.values;
}

function joinValue(value, joiner = " or ") {
  if (Array.isArray(value)) return value.join(joiner);
  return String(value || "");
}

export function formatPrerequisite(prereq) {
  const p = normalizePrerequisite(prereq, { syntaxVersion: 3 });
  if (!p) return "";
  if (p.type === "text") return p.text || "";
  if (p.type === "any") return p.alternatives.map(formatPrerequisite).join(" OR ");
  if (p.type === "trait" || p.type === "technique") return `${p.type === "trait" ? "Trait" : "Technique"}: ${joinValue(p.key)}${p.minRank != null ? ` rank ${p.minRank}+` : ""}`;
  if (p.type === "archetype") return `Archetype: ${joinValue(p.key)} (${p.numFeats ?? 1}+ feats)`;
  if (p.type === "option") return `Know ${p.count} options from ${p.groupKey}`;
  if (p.type === "class") return `Class: ${joinValue(p.name || p.key)}${p.level ? ` level ${p.level}` : ""}`;
  if (p.type === "feat") return `Feat: ${joinValue(p.name || p.key)}`;
  if (p.type === "origin") return `Origin: ${joinValue(p.name || p.key)}`;
  if (p.type === "attribute") return `Attribute: ${joinValue(p.name || p.key)}${p.minValue !== undefined ? ` ${p.minValue}+` : ""}`;
  if (p.type === "skill") return `Skill: ${joinValue(p.name || p.key)}${(p.rank ?? p.minRank) !== undefined ? ` rank ${p.rank ?? p.minRank}+` : ""}`;
  if (p.type === "tag") return `Tag: ${joinValue(p.name || p.key || p.tag)}${p.minValue !== undefined ? ` ${p.minValue}+` : ""}`;
  if (p.type === "choice") {
    const checks = [];
    if (p.tag) checks.push(`tag ${joinValue(p.tag)}`);
    if (p.enhancement) checks.push(`enhancement ${joinValue(p.enhancement)}`);
    if (p.rank !== undefined) checks.push(`rank ${p.rank}+`);
    if (p.minRank !== undefined) checks.push(`rank ${p.minRank}+`);
    return `Choice ${p.choiceRef}: ${checks.join(", ") || "selected"}`;
  }
  if (p.type === "familiar") return `Familiar${p.minCount !== undefined ? ` count ${p.minCount}+` : ""}${p.minRank !== undefined ? ` rank ${p.minRank}+` : ""}`;
  if (p.type === "weapon" || p.type === "weapon-set") {
    const count = p.type === "weapon-set" && p.count !== undefined ? ` (${p.count}+)` : "";
    return `${p.type === "weapon-set" ? "Weapon set" : "Weapon"}${count}: ${joinValue(p.tag || p.tagAll || p.tagAny || p.name || p.key)}${p.separateHands ? ", one in each hand" : ""}`;
  }
  if (p.type === "resource") return `Resource: ${joinValue(p.resourceKey)}${p.minCount !== undefined ? ` ${p.minCount}+` : ""}`;
  return "";
}

export function formatPrerequisites(value) {
  const prereqs = normalizePrerequisites(value, { syntaxVersion: 3 });
  return prereqs.map(formatPrerequisite).filter(Boolean).join("; ");
}

function normalizeRef(value) {
  return sanitizeText(value, { maxLen: 200, collapse: true }).toLowerCase();
}

function normalizeKey(value) {
  return normalizeRef(value).replace(/[_\s]+/g, "-");
}

function valuesFor(value) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => sanitizeText(item, { maxLen: 200, collapse: true }))
    .filter(Boolean);
}

function matchesAnyValue(actualValues, expectedValue) {
  const actual = valuesFor(actualValues);
  const expected = valuesFor(expectedValue);
  if (!expected.length) return true;
  if (!actual.length) return false;

  const actualRefs = new Set(actual.map(normalizeRef));
  const actualKeys = new Set(actual.map(normalizeKey));
  return expected.some((value) => actualRefs.has(normalizeRef(value)) || actualKeys.has(normalizeKey(value)));
}

function toRank(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function getRequiredNumber(prereq, keys) {
  for (const key of keys) {
    const n = Number.parseInt(String(prereq?.[key] ?? ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const SKILL_FIELD_BY_NAME = new Map();
for (const { key, label } of [...CORE_SKILL_FIELDS, ...DEFENSE_SKILL_FIELDS]) {
  const variants = [
    key,
    label,
    String(label || "").replace(/\s+Training$/i, ""),
  ];
  for (const variant of variants) {
    const ref = normalizeRef(variant);
    if (ref) SKILL_FIELD_BY_NAME.set(ref, key);
  }
}

function addSkillRank(target, name, rank) {
  const skillName = canonicalSkillName(sanitizeText(name, { maxLen: 120, collapse: true }));
  if (!skillName) return;
  const nextRank = toRank(rank);
  const refs = new Set([normalizeRef(skillName), normalizeKey(skillName)]);
  const fieldKey = SKILL_FIELD_BY_NAME.get(normalizeRef(skillName));
  if (fieldKey) refs.add(normalizeRef(fieldKey));

  for (const ref of refs) {
    const previous = target.get(ref);
    target.set(ref, Math.max(toRank(previous), nextRank));
  }
}

function collectSkillRanks({ builder, skillRanks, grantedSkillState } = {}) {
  const out = new Map();

  if (skillRanks instanceof Map) {
    for (const [name, rank] of skillRanks.entries()) addSkillRank(out, name, rank);
  } else if (skillRanks && typeof skillRanks === "object") {
    for (const [name, rank] of Object.entries(skillRanks)) addSkillRank(out, name, rank);
  }

  const sheet = (builder?.sheet && typeof builder.sheet === "object") ? builder.sheet : {};
  const fields = (sheet.fields && typeof sheet.fields === "object") ? sheet.fields : {};
  for (const [fieldKey, rank] of Object.entries(fields)) {
    const field = [...CORE_SKILL_FIELDS, ...DEFENSE_SKILL_FIELDS].find((item) => item.key === fieldKey);
    addSkillRank(out, field?.label || fieldKey, rank);
  }

  const repeatables = (sheet.repeatables && typeof sheet.repeatables === "object") ? sheet.repeatables : {};
  for (const listName of ["combatSkillsExtra", "settingSkills"]) {
    for (const row of Array.isArray(repeatables[listName]) ? repeatables[listName] : []) {
      addSkillRank(out, row?.skill, row?.rank);
    }
  }

  for (const row of Array.isArray(grantedSkillState?.grantedCombatSkills) ? grantedSkillState.grantedCombatSkills : []) {
    addSkillRank(out, row?.skill, row?.rank);
  }
  const grantedSkillNames = grantedSkillState?.grantedSkillNames instanceof Set
    ? Array.from(grantedSkillState.grantedSkillNames)
    : grantedSkillState?.grantedSkillNames;
  for (const name of sanitizeStringArray(grantedSkillNames, { maxItems: 500, maxLen: 120 })) {
    addSkillRank(out, name, 0);
  }

  return out;
}

function weaponBaseTags(gameData, weaponKey) {
  const key = sanitizeText(weaponKey || "", { maxLen: 64, collapse: true });
  const bases = Array.isArray(gameData?.weaponBases) ? gameData.weaponBases : [];
  const found = bases.find((weapon) => String(weapon?.weaponKey || "") === key);
  return valuesFor(found?.tags);
}

function collectChoices({ builder, choices, choiceValues, gameData } = {}) {
  const out = new Map();
  const add = (id, choice) => {
    const choiceId = sanitizeText(id || choice?.choiceId || choice?.id || "", { maxLen: 96, collapse: true });
    if (choiceId) out.set(choiceId, choice);
  };

  for (const source of [choices, choiceValues, builder?.grantChoices, builder?.choices]) {
    if (source instanceof Map) {
      for (const [id, choice] of source.entries()) add(id, choice);
    } else if (Array.isArray(source)) {
      for (const choice of source) add("", choice);
    } else if (source && typeof source === "object") {
      for (const [id, choice] of Object.entries(source)) add(id, choice);
    }
  }

  for (const weapon of Array.isArray(builder?.weapons) ? builder.weapons : []) {
    const tags = valuesFor(weapon?.effectiveTags || weapon?.tags);
    add(weapon?.choiceId || weapon?.sourceChoiceId, {
      ...weapon,
      tags: tags.length ? tags : weaponBaseTags(gameData, weapon?.weaponKey),
    });
  }

  return out;
}

function collectResources(builder, resources) {
  const out = new Map();
  const add = (key, resource) => {
    const resourceKey = sanitizeText(key || resource?.resourceKey || resource?.key || "", { maxLen: 96, collapse: true });
    if (!resourceKey) return;
    const amount = toRank(resource?.capacity ?? resource?.count ?? resource?.current ?? resource);
    out.set(normalizeKey(resourceKey), Math.max(out.get(normalizeKey(resourceKey)) || 0, amount));
  };
  for (const source of [resources, builder?.resources]) {
    if (source instanceof Map) {
      for (const [key, resource] of source.entries()) add(key, resource);
    } else if (Array.isArray(source)) {
      for (const resource of source) add("", resource);
    } else if (source && typeof source === "object") {
      for (const [key, resource] of Object.entries(source)) add(key, resource);
    }
  }
  return out;
}

function collectWeapons(builder, gameData) {
  return (Array.isArray(builder?.weapons) ? builder.weapons : []).map((weapon) => ({
    ...weapon,
    tags: valuesFor(weapon?.effectiveTags || weapon?.tags).length
      ? valuesFor(weapon?.effectiveTags || weapon?.tags)
      : weaponBaseTags(gameData, weapon?.weaponKey),
  }));
}

function classNamesForContext(data, classKey) {
  const found = (Array.isArray(data?.classes) ? data.classes : []).find((entry) => String(entry?.classKey || "") === classKey);
  return [classKey, found?.name].filter(Boolean);
}

function originNamesForContext(data, originKey) {
  const found = (Array.isArray(data?.origins) ? data.origins : []).find((entry) => String(entry?.originKey || "") === originKey);
  return [originKey, found?.name].filter(Boolean);
}

function selectedFeatNamesForContext(data, selectedFeats) {
  const out = new Set();
  const selected = new Set(valuesFor(selectedFeats));
  const feats = Array.isArray(data?.feats) ? data.feats : [];

  for (const value of selected) {
    out.add(value);
    const found = feats.find((feat) => feat?.name === value || feat?.featKey === value);
    if (found?.name) out.add(found.name);
    if (found?.featKey) out.add(found.featKey);
  }

  return Array.from(out);
}

function collectKnownOptions(builder, gameData, explicit) {
  const out = explicit instanceof Map ? new Map(explicit) : new Map(Object.entries(explicit || {}));
  const selected = new Set([...valuesFor(builder.selectedClassFeatureOptions), ...valuesFor(builder.selectedFeatOptions)]);
  const classRows = Array.isArray(gameData.classFeatures) ? gameData.classFeatures.filter((row) => row.classKey === builder.classKey) : gameData.classFeatures?.[builder.classKey] || [];
  function visit(rows) {
    for (const row of rows) {
      const key = row.featureKey || row.featKey;
      const options = row.options || [];
      if (key && options.length && !out.has(key)) out.set(key, options.map((option) => option.featureKey || option.featKey).filter((optionKey) => selected.has(optionKey)));
      visit(options);
    }
  }
  visit([...classRows, ...(gameData.feats || [])]);
  return out;
}

export function createPrerequisiteContext(input = {}) {
  const source = (input && typeof input === "object") ? input : {};
  const builder = (source.builder && typeof source.builder === "object") ? source.builder : source;
  const gameData = (source.gameData && typeof source.gameData === "object") ? source.gameData : {};
  const level = toRank(builder.level ?? 1) || 1;
  const classKey = sanitizeText(builder.classKey || "", { maxLen: 64, collapse: true });
  const originKey = sanitizeText(builder.originKey || "", { maxLen: 64, collapse: true });

  return {
    builder,
    gameData,
    syntaxVersion: Number(source.syntaxVersion ?? source.expressionSyntaxVersion ?? gameData.expressionSyntaxVersion ?? 2),
    level,
    classKey,
    originKey,
    classNames: classNamesForContext(gameData, classKey),
    originNames: originNamesForContext(gameData, originKey),
    selectedFeats: selectedFeatNamesForContext(gameData, builder.selectedFeats),
    selectedTechniqueKeys: valuesFor(source.selectedTechniqueKeys || builder.selectedTechniques || builder.selectedTechniqueKeys || (Array.isArray(builder.techniques) ? builder.techniques : []).map((row) => typeof row === "string" ? row : row.techniqueKey || row.key)),
    selectedTraits: source.selectedTraits || builder.traits || [],
    knownOptions: collectKnownOptions(builder, gameData, source.knownOptions),
    attributes: normalizeAttributes(builder.attributes || {}),
    skillRanks: collectSkillRanks({
      builder,
      skillRanks: source.skillRanks,
      grantedSkillState: source.grantedSkillState,
    }),
    tags: valuesFor(source.tags),
    tagRanks: source.tagRanks || {},
    choices: collectChoices({
      builder,
      choices: source.choices,
      choiceValues: source.choiceValues,
      gameData,
    }),
    resources: collectResources(builder, source.resources),
    weapons: collectWeapons(builder, gameData),
    resolveChoice: typeof source.resolveChoice === "function" ? source.resolveChoice : null,
    deferUnresolvedChoices: !!source.deferUnresolvedChoices,
  };
}

function getChoice(ctx, choiceRef) {
  const ref = sanitizeText(choiceRef || "", { maxLen: 96, collapse: true });
  if (!ref) return null;
  if (ctx.resolveChoice) {
    const resolved = ctx.resolveChoice(ref, ctx);
    if (resolved) return resolved;
  }
  return ctx.choices.get(ref) || null;
}

function tagValue(tag, tagName) {
  const cleanTagName = sanitizeText(tagName, { maxLen: 96, collapse: true });
  if (!cleanTagName) return null;
  const pattern = new RegExp(`^${cleanTagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\+?(\\d+)$`, "i");
  const match = String(tag || "").trim().match(pattern);
  return match ? Number.parseInt(match[1], 10) : null;
}

function tagMatchesName(tag, tagName) {
  const actual = normalizeRef(tag);
  const expected = normalizeRef(tagName);
  if (!actual || !expected) return false;
  return actual === expected || actual.startsWith(`${expected} `) || actual.startsWith(`${expected}+`);
}

function matchesTag(tags, expectedTag, minValue = null) {
  const tagNames = valuesFor(expectedTag);
  if (!tagNames.length) return true;

  return tagNames.some((tagName) => {
    if (minValue === null) return valuesFor(tags).some((tag) => tagMatchesName(tag, tagName));
    return valuesFor(tags).some((tag) => {
      const value = tagValue(tag, tagName);
      return Number.isFinite(value) && value >= minValue;
    });
  });
}

function weaponReach(weapon) {
  const direct = Number(weapon?.reach);
  if (Number.isFinite(direct)) return direct;
  for (const tag of valuesFor(weapon?.tags)) {
    const match = String(tag).trim().match(/^reach(?:\s*[=+]\s*|\s+)(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return 0;
}

function choiceTags(choice) {
  return valuesFor(choice?.effectiveTags || choice?.tags || choice?.weapon?.effectiveTags || choice?.weapon?.tags || choice?.value?.tags);
}

function choiceEnhancements(choice) {
  const raw = choice?.enhancements || choice?.weapon?.enhancements || choice?.value?.enhancements;
  return (Array.isArray(raw) ? raw : [])
    .map((enhancement) => typeof enhancement === "string" ? enhancement : enhancement?.enhancementKey || enhancement?.key || enhancement?.name)
    .filter(Boolean);
}

function choiceRank(choice) {
  return toRank(choice?.rank ?? choice?.weapon?.rank ?? choice?.value?.rank);
}

export function evaluatePrerequisite(prerequisite, context = {}) {
  const ctx = context?.skillRanks instanceof Map && context?.choices instanceof Map
    ? context
    : createPrerequisiteContext(context);
  const prereq = normalizePrerequisite(prerequisite, { syntaxVersion: ctx.syntaxVersion });
  const label = formatPrerequisite(prereq);

  if (!prereq) return { ok: true, manual: true, prerequisite: null, label: "", reason: "" };
  if (prereq.type === "text") {
    if (ctx.syntaxVersion >= 3) return { ok: false, manual: false, deferred: true, prerequisite: prereq, label, reason: `Prerequisite requires an implemented rule: ${label}` };
    return { ok: true, manual: true, prerequisite: prereq, label, reason: `Manual prerequisite: ${label}` };
  }
  if (prereq.type === "any") {
    const alternatives = prereq.alternatives.map((item) => evaluatePrerequisite(item, ctx));
    return { ok: alternatives.some((item) => item.ok && !item.manual), prerequisite: prereq, label, alternatives, reason: `Requires one of: ${label}` };
  }
  if (prereq.type === "technique") return { ok: valuesFor(prereq.key).some((key) => ctx.selectedTechniqueKeys.includes(key)), prerequisite: prereq, label, reason: `Requires ${label}.` };
  if (prereq.type === "trait") {
    const selected = Array.isArray(ctx.selectedTraits) ? ctx.selectedTraits : Object.entries(ctx.selectedTraits).map(([traitKey, value]) => typeof value === "object" ? { ...value, traitKey } : { traitKey, rank: value });
    const ok = selected.some((trait) => valuesFor(prereq.key).includes(typeof trait === "string" ? trait : trait.traitKey || trait.key) && (prereq.minRank == null || toRank(trait.rank) >= prereq.minRank));
    return { ok, prerequisite: prereq, label, reason: `Requires ${label}.` };
  }
  if (prereq.type === "archetype") {
    const selected = new Set(valuesFor(ctx.builder.selectedFeats));
    const ok = valuesFor(prereq.key).some((key) => new Set((ctx.gameData.feats || []).filter((feat) => feat.archetypeKey === key && selected.has(feat.featKey)).map((feat) => feat.featKey)).size >= (prereq.numFeats ?? 1));
    return { ok, prerequisite: prereq, label, reason: `Requires ${label}.` };
  }
  if (prereq.type === "option") {
    const value = ctx.knownOptions instanceof Map ? ctx.knownOptions.get(prereq.groupKey) : ctx.knownOptions[prereq.groupKey];
    const known = Array.isArray(value) ? value : value?.selectedKeys || value?.options || [];
    const count = new Set(known.map((item) => typeof item === "string" ? item : item.key || item.featureKey || item.featKey).filter(Boolean)).size;
    return { ok: count >= prereq.count, prerequisite: prereq, label, reason: `Requires ${label}.` };
  }
  if (prereq.type === "class") {
    const classMatches = matchesAnyValue(ctx.classNames, prereq.name || prereq.key);
    const requiredLevel = getRequiredNumber(prereq, ["level"]);
    const levelMatches = requiredLevel === null || ctx.level >= requiredLevel;
    return {
      ok: classMatches && levelMatches,
      prerequisite: prereq,
      label,
      reason: classMatches ? `Requires class level ${requiredLevel}.` : `Requires class ${joinValue(prereq.name || prereq.key)}.`,
    };
  }
  if (prereq.type === "feat") {
    const ok = matchesAnyValue(ctx.selectedFeats, prereq.name || prereq.key);
    return { ok, prerequisite: prereq, label, reason: `Requires feat ${joinValue(prereq.name || prereq.key)}.` };
  }
  if (prereq.type === "origin") {
    const ok = matchesAnyValue(ctx.originNames, prereq.name || prereq.key);
    return { ok, prerequisite: prereq, label, reason: `Requires origin ${joinValue(prereq.name || prereq.key)}.` };
  }
  if (prereq.type === "attribute") {
    const attrKey = ATTR_KEYS.find((key) => matchesAnyValue([key], prereq.name || prereq.key));
    const actual = attrKey ? toRank(ctx.attributes[attrKey]) : 0;
    const required = getRequiredNumber(prereq, ["minValue", "value"]) ?? 0;
    const exact = prereq.value !== undefined && prereq.minValue === undefined;
    const ok = attrKey && (exact ? actual === required : actual >= required);
    return { ok: !!ok, prerequisite: prereq, label, reason: `Requires ${joinValue(prereq.name || prereq.key)} ${exact ? "" : "at least "}${required}.` };
  }
  if (prereq.type === "skill") {
    const required = getRequiredNumber(prereq, ["rank", "minRank"]) ?? 0;
    const names = valuesFor(prereq.name || prereq.key);
    const ok = names.some((name) => toRank(ctx.skillRanks.get(normalizeRef(canonicalSkillName(name))) ?? ctx.skillRanks.get(normalizeKey(canonicalSkillName(name)))) >= required);
    return { ok, prerequisite: prereq, label, reason: `Requires ${joinValue(prereq.name || prereq.key)} rank ${required}.` };
  }
  if (prereq.type === "tag") {
    const required = getRequiredNumber(prereq, ["minValue"]);
    const ok = matchesTag(ctx.tags, prereq.name || prereq.key || prereq.tag, required);
    return { ok, prerequisite: prereq, label, reason: `Requires tag ${joinValue(prereq.name || prereq.key || prereq.tag)}.` };
  }
  if (prereq.type === "choice") {
    const choice = getChoice(ctx, prereq.choiceRef);
    if (!choice) {
      if (ctx.deferUnresolvedChoices && ctx.syntaxVersion < 3) {
        return { ok: true, manual: true, prerequisite: prereq, label, reason: `Pending choice: ${prereq.choiceRef}.` };
      }
      return { ok: false, prerequisite: prereq, label, reason: `Choose ${prereq.choiceRef} first.` };
    }

    const requiredTag = prereq.tag;
    const requiredEnhancement = prereq.enhancement;
    const requiredRank = getRequiredNumber(prereq, ["rank", "minRank"]);
    const tagOk = requiredTag ? matchesTag(choiceTags(choice), requiredTag, getRequiredNumber(prereq, ["minValue"])) : true;
    const enhancementOk = requiredEnhancement ? matchesAnyValue(choiceEnhancements(choice), requiredEnhancement) : true;
    const rankOk = requiredRank === null || choiceRank(choice) >= requiredRank;
    return {
      ok: tagOk && enhancementOk && rankOk,
      prerequisite: prereq,
      label,
      reason: `Requires ${formatPrerequisite(prereq)}.`,
    };
  }

  if (prereq.type === "resource") {
    const available = ctx.resources.get(normalizeKey(prereq.resourceKey)) || 0;
    const required = getRequiredNumber(prereq, ["minCount"]) ?? 1;
    const ok = available >= required;
    return { ok, prerequisite: prereq, label, reason: `Requires ${prereq.resourceKey} capacity ${required}.` };
  }
  if (prereq.type === "weapon" || prereq.type === "weapon-set") {
    const matches = ctx.weapons.filter((weapon) => {
      const identityOk = matchesAnyValue(
        [weapon?.weaponKey, weapon?.name, weapon?.customName],
        prereq.key || prereq.name,
      );
      const tagOk = prereq.tag ? matchesTag(weapon?.tags, prereq.tag) : true;
      const tagAllOk = prereq.tagAll ? valuesFor(prereq.tagAll).every((tag) => matchesTag(weapon?.tags, tag)) : true;
      const tagAnyOk = prereq.tagAny ? matchesTag(weapon?.tags, prereq.tagAny) : true;
      const tagNotOk = prereq.tagNot ? !matchesTag(weapon?.tags, prereq.tagNot) : true;
      const requiredReach = getRequiredNumber(prereq, ["minReach"]);
      const reachOk = requiredReach === null || weaponReach(weapon) >= requiredReach;
      const requiredRank = getRequiredNumber(prereq, ["rank", "minRank"]);
      const rankOk = requiredRank === null || toRank(weapon?.rank) >= requiredRank;
      // Wielding and available hands are player-tracked use conditions. Static
      // eligibility depends only on the matching equipment the character owns.
      return identityOk && tagOk && tagAllOk && tagAnyOk && tagNotOk && reachOk && rankOk;
    });
    const required = prereq.type === "weapon-set" ? (getRequiredNumber(prereq, ["count"]) ?? 2) : 1;
    const distinctWeapons = new Set(matches.map((weapon) => weapon.id || weapon));
    const ok = distinctWeapons.size >= required;
    return { ok, prerequisite: prereq, label, reason: `Requires ${required} matching weapon${required === 1 ? "" : "s"}.` };
  }

  return ctx.syntaxVersion >= 3
    ? { ok: false, manual: false, deferred: true, prerequisite: prereq, label, reason: `Unsupported prerequisite: ${label}` }
    : { ok: true, manual: true, prerequisite: prereq, label, reason: "" };
}

export function checkPrerequisites(prerequisites, context = {}) {
  const ctx = createPrerequisiteContext(context);
  const results = normalizePrerequisites(prerequisites, { syntaxVersion: ctx.syntaxVersion }).map((prereq) => evaluatePrerequisite(prereq, ctx));
  const failed = results.filter((result) => !result.ok);
  const manual = results.filter((result) => result.manual);
  return {
    ok: failed.length === 0,
    results,
    failed,
    manual,
    failureReasons: failed.map((result) => result.reason || result.label).filter(Boolean),
  };
}

export function meetsPrerequisites(prerequisites, context = {}) {
  return checkPrerequisites(prerequisites, context).ok;
}
