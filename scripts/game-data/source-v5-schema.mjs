// Source headers are a named contract, not positional runtime fields.
export const SOURCE_V5_TAB_HEADERS = Object.freeze(Object.fromEntries(Object.entries({
  README: ["section", "details"],
  Classes: ["classKey", "name", "pitch", "examples", "hpProgression", "primaryAttributeA", "primaryAttributeB", "combatTechniqueSkill", "combatSkills", "utilitySkillOptions", "notes", "status"],
  ClassFeatures: ["classKey", "level", "rowType", "featureKey", "name", "parentKey", "description", "chooseCount", "grants", "prerequisites", "notes", "traitKeys"],
  Techniques: ["techniqueName", "techniqueKey", "description", "selection", "rank", "tags", "prerequisites", "actionType", "actions", "trigger", "energyCost", "strainCost", "sustained", "rollRequired", "attribute", "defense", "range", "targets", "damage", "onSuccess", "onCriticalSuccess", "onFailure", "onCriticalFailure", "bondEffect", "pumpingByRank", "rankNotes", "status", "energyCostKind", "energyCostOptions", "associatedSkill", "basicAttack"],
  Feats: ["featKey", "category", "rowType", "featType", "name", "archetypeKey", "archetypeName", "parentKey", "prerequisites", "description", "grants", "chooseCount", "notes"],
  Origins: ["originKey", "name", "status", "summary", "description", "originKeystone", "questions", "futureUpgradesText", "examplesText", "notes"],
  OriginFeatures: ["originKey", "level", "rowType", "featureKey", "name", "description", "grants", "parentKey", "chooseCount", "prerequisites", "notes", "traitKeys"],
  WeaponBases: ["weaponKey", "name", "description", "minRank", "tags", "notes", "techniqueKeys", "traitsText"],
  WeaponEnhancements: ["enhancementKey", "name", "description", "minRank", "prerequisites", "notes", "sourceNote", "selectionMode"],
  Metadata: ["key", "value"],
  Schema: ["tab", "field", "type", "required", "valuesOrFormat", "default", "description"],
  Enums: ["domain", "value", "meaning"],
  Traits: ["traitKey", "name", "rank", "prerequisites", "tags", "description", "rankNotes", "techniqueKeys", "grants"],
}).map(([tab, headers]) => [tab, Object.freeze(headers)])));

export const SOURCE_V5_MODEL_TABS = Object.freeze({
  Classes: "classes", ClassFeatures: "classFeatures", Techniques: "techniques", Feats: "feats",
  Origins: "origins", OriginFeatures: "originFeatures", WeaponBases: "weaponBases",
  WeaponEnhancements: "weaponEnhancements", Traits: "traits",
});

const enumFields = new Set(["status", "rowType", "energyCostKind", "selectionMode"]);
const integerFields = new Set(["level", "chooseCount", "rank", "minRank", "actions"]);
const expressionFields = new Set(["grants", "prerequisites", "energyCostOptions", "basicAttack"]);
const requiredFields = new Set(["classKey", "featureKey", "featKey", "originKey", "weaponKey", "enhancementKey", "traitKey", "techniqueKey", "category", "name", "techniqueName", "rowType", "status", "energyCostKind", "selectionMode"]);
const conditionalFields = new Set(["parentKey", "chooseCount", "archetypeKey", "archetypeName", "selection", "energyCost", "energyCostOptions"]);

// These declarations describe syntax/obligation, never defaults to apply to data.
export const SOURCE_V5_FIELD_CONTRACTS = Object.freeze(Object.fromEntries(
  Object.keys(SOURCE_V5_MODEL_TABS).flatMap((tab) => SOURCE_V5_TAB_HEADERS[tab].map((field) => [
    `${tab}.${field}`, Object.freeze({
      type: enumFields.has(field) ? "enum" : integerFields.has(field) ? "integer"
        : expressionFields.has(field) ? "dsl" : field === "energyCost" ? "number"
          : field.endsWith("Keys") ? "key list" : field.endsWith("Key") || field === "category" ? "key" : "text",
      requirement: conditionalFields.has(field) ? "conditional" : requiredFields.has(field) ? "yes" : "no",
    }),
  ])),
));

export const SOURCE_V5_ENUM_VALUES = Object.freeze(Object.fromEntries(Object.entries({
  status: ["playable", "draft", "incomplete"],
  rowType: ["FEATURE", "OPTION_GROUP", "OPTION"],
  featType: ["class", "archetype", "general"],
  selectionMode: ["selectable", "granted-only", "draft"],
  energyCostKind: ["fixed", "variable", "conditional", "unassigned", "unspecified"],
  booleanYN: ["Y", "N"],
  grantType: ["technique", "skill", "feat", "resource", "familiar", "weapon", "weapon-enhancement", "option", "choice", "bond", "specialization", "vehicle", "gadget", "rank", "choice-rebind", "tag", "feature", "trait"],
  prerequisiteType: ["class", "familiar", "feat", "choice", "weapon", "weapon-set", "trait", "technique", "tag", "text", "archetype", "attribute", "option", "skill"],
  expression: ["OR", "newline"],
  energyCostOptions: ["mode=value"],
  selection: ["skill names", "granted", "tag=Name", "weaponTag=Name"],
  actionType: ["ActionOrFreeReaction"],
}).map(([domain, values]) => [domain, Object.freeze(values)])));
