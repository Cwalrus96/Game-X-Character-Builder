const field = (type, options = {}) => Object.freeze({ type, ...options });

const string = (options = {}) => field("string", options);
const reference = (options = {}) => field("string", { allowOr: true, ...options });
const integer = (options = {}) => field("integer", options);

function definition({ fields, required = [], requiredAny = [], aliases = {}, runtimeStatus = "implemented", defaults = {} }) {
  return Object.freeze({
    fields: Object.freeze(fields),
    required: Object.freeze(required),
    requiredAny: Object.freeze(requiredAny.map((group) => Object.freeze(group))),
    aliases: Object.freeze(aliases),
    runtimeStatus,
    defaults: Object.freeze(defaults),
  });
}

const choiceFields = {
  count: integer({ min: 1 }),
  choiceId: string(),
  choiceRef: string(),
  note: string(),
};

/**
 * Grant syntax v2 registry. Field aliases normalize old runtime artifacts and
 * descriptive schema-v4 names to the compact runtime keys used by consumers.
 */
export const GRANT_EXPRESSION_REGISTRY = Object.freeze({
  technique: definition({
    fields: { key: reference(), name: reference(), skill: reference(), tag: reference(), ...choiceFields },
    requiredAny: [["key", "name", "skill", "tag"]],
    aliases: {
      techniqueKey: "key", techniqueName: "name", skillKey: "skill", skillKeys: "skill", tagKey: "tag", tagKeys: "tag",
    },
  }),
  skill: definition({
    fields: {
      key: reference(), name: reference(), skill: reference(), progression: field("enum", { values: ["fast", "medium", "slow", "weapon skill"] }),
      rank: integer({ min: 0 }), minRank: integer({ min: 0 }), ...choiceFields,
    },
    requiredAny: [["key", "name", "skill", "choiceId"]],
    aliases: { skillKey: "key", skillName: "name" },
  }),
  feat: definition({
    fields: {
      key: reference(), name: reference(), filterType: reference(), category: reference(), classKey: reference(), level: integer({ min: 1 }), ...choiceFields,
    },
    requiredAny: [["key", "name", "filterType", "category", "classKey"]],
    aliases: { featKey: "key", featType: "filterType", type: "filterType", maxLevel: "level" },
  }),
  resource: definition({
    fields: { resourceKey: string(), name: string(), count: field("capacity-expression"), recharge: string(), note: string() },
    required: ["resourceKey", "count"],
    aliases: { key: "resourceKey" },
  }),
  familiar: definition({
    fields: { key: reference(), name: reference(), rank: integer({ min: 0 }), rankFormula: string(), sourceRef: string(), ...choiceFields },
    aliases: { familiarKey: "key" },
    defaults: { count: 1 },
    runtimeStatus: "stubbed",
  }),
  weapon: definition({
    fields: {
      key: reference(), name: reference(), skill: reference(), tag: reference(), enhancement: reference(),
      progression: field("enum", { values: ["fast", "medium", "slow", "weapon skill"] }), rank: integer({ min: 1 }), ...choiceFields,
    },
    requiredAny: [["key", "name", "skill", "tag", "enhancement", "choiceId"]],
    aliases: { weaponKey: "key", tagKey: "tag", tagKeys: "tag" },
  }),
  "weapon-enhancement": definition({
    fields: { enhancement: reference(), choiceRef: string(), rank: integer({ min: 1 }), maxRank: integer({ min: 1 }), count: integer({ min: 1 }), note: string() },
    aliases: { enhancementKey: "enhancement" },
  }),
  option: definition({
    fields: { groupKey: string(), choiceRef: string(), count: integer({ min: 1 }), note: string() },
    requiredAny: [["groupKey", "choiceRef"]],
    defaults: { count: 1 },
  }),
  choice: definition({
    fields: { key: reference(), name: reference(), filterType: reference(), ...choiceFields },
    requiredAny: [["key", "name", "filterType", "choiceId"]],
    aliases: { type: "filterType" },
    defaults: { count: 1 },
  }),
  bond: definition({
    fields: { key: reference(), name: reference(), rank: integer({ min: 0 }), ...choiceFields },
    defaults: { count: 1 },
  }),
  specialization: definition({
    fields: { key: reference(), name: reference(), skill: reference(), tag: reference(), bonus: string(), rank: integer({ min: 0 }), ...choiceFields },
    requiredAny: [["key", "name", "skill", "tag", "choiceRef"]],
    aliases: { skillKey: "skill", tagKey: "tag" },
  }),
  vehicle: definition({
    fields: { key: reference(), name: reference(), rank: integer({ min: 0 }), ...choiceFields },
    aliases: { vehicleKey: "key" },
    defaults: { count: 1 },
    runtimeStatus: "stubbed",
  }),
  gadget: definition({
    fields: { key: reference(), name: reference(), skill: reference(), tag: reference(), ...choiceFields, count: field("capacity-expression") },
    requiredAny: [["key", "name", "skill", "tag", "choiceId"]],
    aliases: { gadgetKey: "key", skillKey: "skill", tagKey: "tag", tagKeys: "tag" },
    defaults: { count: { kind: "constant", value: 1 } },
    runtimeStatus: "stubbed",
  }),
  rank: definition({
    fields: {
      choiceRef: string(),
      operation: field("enum", { values: ["set", "increase"] }),
      value: integer({ min: 0 }),
      note: string(),
    },
    required: ["choiceRef", "operation", "value"],
    runtimeStatus: "stubbed",
  }),
  "choice-rebind": definition({
    fields: {
      choiceRef: string(), answerType: string(), rank: integer({ min: 0 }), maxRank: integer({ min: 0 }),
      count: integer({ min: 1 }), note: string(),
    },
    required: ["choiceRef"],
    defaults: { count: 1 },
    runtimeStatus: "stubbed",
  }),

  // Deliberate runtime compatibility forms. Source syntax normalizes filtered
  // technique grants to technique-choice; equipment remains readable until its
  // persisted/runtime migration has a dedicated Work Package.
  "technique-choice": definition({
    fields: { skill: reference(), tag: reference(), ...choiceFields },
    requiredAny: [["skill", "tag"]],
    aliases: { skillKey: "skill", skillKeys: "skill", tagKey: "tag", tagKeys: "tag" },
    defaults: { count: 1 },
    runtimeStatus: "compatibility",
  }),
  equipment: definition({
    fields: { key: reference(), name: reference(), count: integer({ min: 1 }), note: string() },
    requiredAny: [["key", "name"]],
    runtimeStatus: "compatibility",
  }),
});

export const SCHEMA_V4_GRANT_TYPES = Object.freeze([
  "technique", "skill", "feat", "resource", "familiar", "weapon", "weapon-enhancement",
  "option", "choice", "bond", "specialization", "vehicle", "gadget", "rank", "choice-rebind",
]);

const prerequisiteIdentityFields = { key: reference(), name: reference() };

/** Prerequisite syntax v2 registry. Separate parsed lines are AND conditions. */
export const PREREQUISITE_EXPRESSION_REGISTRY = Object.freeze({
  class: definition({
    fields: { ...prerequisiteIdentityFields, level: integer({ min: 1 }) },
    requiredAny: [["key", "name"]],
    aliases: { classKey: "key", minLevel: "level" },
  }),
  feat: definition({
    fields: prerequisiteIdentityFields,
    requiredAny: [["key", "name"]],
    aliases: { featKey: "key" },
  }),
  familiar: definition({
    fields: { ...prerequisiteIdentityFields, minCount: integer({ min: 1 }), minRank: integer({ min: 0 }), rank: integer({ min: 0 }) },
    aliases: { familiarKey: "key" },
    runtimeStatus: "stubbed",
  }),
  choice: definition({
    fields: {
      choiceRef: string(), tag: reference(), enhancement: reference(), rank: integer({ min: 0 }), minRank: integer({ min: 0 }), minValue: integer({ min: 0 }),
    },
    required: ["choiceRef"],
    aliases: { enhancementKey: "enhancement", tagKey: "tag", tagKeys: "tag" },
  }),
  weapon: definition({
    fields: {
      ...prerequisiteIdentityFields, tag: reference(), tagAll: field("key-list"), tagAny: field("key-list"), tagNot: field("key-list"),
      minReach: integer({ min: 0 }), rank: integer({ min: 0 }), minRank: integer({ min: 0 }), wielded: field("boolean"),
    },
    requiredAny: [["key", "name", "tag", "tagAll", "tagAny", "tagNot", "minReach"]],
    aliases: { weaponKey: "key", tagKey: "tag", tagKeys: "tag", reach: "minReach", minValue: "minReach" },
  }),
  "weapon-set": definition({
    fields: {
      tag: reference(), tagAll: field("key-list"), tagAny: field("key-list"), tagNot: field("key-list"), minReach: integer({ min: 0 }),
      count: integer({ min: 1 }), minRank: integer({ min: 0 }), wielded: field("boolean"),
    },
    requiredAny: [["tag", "tagAll", "tagAny", "tagNot", "minReach"]],
    aliases: { tagKey: "tag", tagKeys: "tag", minCount: "count", reach: "minReach", minValue: "minReach" },
  }),
  resource: definition({
    fields: { resourceKey: reference(), minCount: integer({ min: 0 }) },
    required: ["resourceKey"],
    aliases: { key: "resourceKey" },
  }),

  // Existing executable runtime rules retained in the same typed registry.
  origin: definition({ fields: prerequisiteIdentityFields, requiredAny: [["key", "name"]], aliases: { originKey: "key" } }),
  attribute: definition({ fields: { ...prerequisiteIdentityFields, value: integer(), minValue: integer() }, requiredAny: [["key", "name"]] }),
  skill: definition({ fields: { ...prerequisiteIdentityFields, rank: integer({ min: 0 }), minRank: integer({ min: 0 }) }, requiredAny: [["key", "name"]], aliases: { skillKey: "key" } }),
  tag: definition({ fields: { ...prerequisiteIdentityFields, tag: reference(), minValue: integer({ min: 0 }) }, requiredAny: [["key", "name", "tag"]], aliases: { tagKey: "tag", tagKeys: "tag" } }),
  text: definition({ fields: { text: string() }, required: ["text"], runtimeStatus: "manual" }),
});

export const SCHEMA_V4_PREREQUISITE_TYPES = Object.freeze([
  "class", "feat", "familiar", "choice", "weapon", "weapon-set",
]);

export const SUPPORTED_GRANT_TYPES = Object.freeze(Object.keys(GRANT_EXPRESSION_REGISTRY));
export const SUPPORTED_GRANT_FIELDS = Object.freeze(Array.from(new Set(
  Object.values(GRANT_EXPRESSION_REGISTRY).flatMap((entry) => [...Object.keys(entry.fields), ...Object.keys(entry.aliases)]),
)).sort());
export const SUPPORTED_STRUCTURED_PREREQUISITE_TYPES = Object.freeze(
  Object.keys(PREREQUISITE_EXPRESSION_REGISTRY).filter((type) => type !== "text"),
);
export const RUNTIME_PREREQUISITE_TYPES = Object.freeze(Object.keys(PREREQUISITE_EXPRESSION_REGISTRY));
export const SUPPORTED_PREREQUISITE_FIELDS = Object.freeze(Array.from(new Set(
  Object.values(PREREQUISITE_EXPRESSION_REGISTRY).flatMap((entry) => [...Object.keys(entry.fields), ...Object.keys(entry.aliases)]),
)).sort());

// Kept as compatibility exports for callers/tests migrating from the old flat
// allowlists. No schema-v4 expression type or field remains silently unsupported.
export const OBSERVED_UNSUPPORTED_GRANT_TYPES = Object.freeze([]);
export const OBSERVED_UNSUPPORTED_GRANT_FIELDS = Object.freeze([]);
export const OBSERVED_UNSUPPORTED_PREREQUISITE_TYPES = Object.freeze([]);
export const OBSERVED_UNSUPPORTED_PREREQUISITE_FIELDS = Object.freeze([]);

// Syntax v3 extends the authoring contract without changing how frozen v2
// artifacts normalize. Parsing a rule does not imply that it can execute.
const extend = (base, fields, options = {}) => definition({ ...base, fields: { ...base.fields, ...fields }, ...options });
export const GRANT_EXPRESSION_REGISTRY_V3 = Object.freeze({
  ...GRANT_EXPRESSION_REGISTRY,
  skill: extend(GRANT_EXPRESSION_REGISTRY.skill, { recipientRef: string() }),
  tag: definition({ fields: { tag: reference(), minRank: integer({ min: 0 }), note: string() }, required: ["tag"], runtimeStatus: "stubbed" }),
  feature: definition({ fields: { key: string(), note: string() }, aliases: { featureKey: "key" }, required: ["key"], runtimeStatus: "stubbed" }),
});

export const PREREQUISITE_EXPRESSION_REGISTRY_V3 = Object.freeze({
  ...PREREQUISITE_EXPRESSION_REGISTRY,
  trait: definition({ fields: { ...prerequisiteIdentityFields, minRank: integer({ min: 0 }) }, required: ["key"], aliases: { traitKey: "key" } }),
  technique: definition({ fields: prerequisiteIdentityFields, required: ["key"], aliases: { techniqueKey: "key" } }),
  archetype: definition({ fields: { key: reference(), numFeats: integer({ min: 1 }) }, required: ["key"], aliases: { archetypeKey: "key" } }),
  option: definition({ fields: { groupKey: string(), count: integer({ min: 1 }) }, required: ["groupKey", "count"] }),
  "weapon-set": extend(PREREQUISITE_EXPRESSION_REGISTRY["weapon-set"], { separateHands: field("boolean") }),
});

export const BASIC_ATTACK_EXPRESSION_REGISTRY = Object.freeze({
  weapon: definition({ fields: { attribute: string(), defense: string() } }),
  technique: definition({ fields: { key: string(), attribute: string(), defense: string() }, required: ["key"], aliases: { techniqueKey: "key" } }),
});

export function getExpressionRegistry(kind, { syntaxVersion = 2 } = {}) {
  if (kind === "basicAttack") return BASIC_ATTACK_EXPRESSION_REGISTRY;
  if (kind === "grant") return Number(syntaxVersion) >= 3 ? GRANT_EXPRESSION_REGISTRY_V3 : GRANT_EXPRESSION_REGISTRY;
  if (kind === "prerequisite") return Number(syntaxVersion) >= 3 ? PREREQUISITE_EXPRESSION_REGISTRY_V3 : PREREQUISITE_EXPRESSION_REGISTRY;
  throw new TypeError(`Unknown expression kind "${kind}".`);
}

export function getExpressionDefinition(kind, type, options = {}) {
  return getExpressionRegistry(kind, options)[type] || null;
}

export function getExpressionRuntimeStatus(kind, expression, options = {}) {
  if (expression?.type === "any" && Number(options.syntaxVersion) >= 3) {
    const statuses = (expression.alternatives || []).map((item) => getExpressionRuntimeStatus(kind, item, options));
    return statuses.length && statuses.every((status) => status === "implemented" || status === "compatibility") ? "implemented" : "stubbed";
  }
  const filters = Array.isArray(expression?.filterType) ? expression.filterType : [expression?.filterType];
  if (Number(options.syntaxVersion) >= 3 && (expression?.recipientRef || (kind === "grant" && expression?.type === "choice" && filters.some((value) => String(value).toLowerCase() === "keystone")))) return "stubbed";
  return getExpressionDefinition(kind, expression?.type, options)?.runtimeStatus || "unsupported";
}
