import { SOURCE_TAB_HEADERS } from "../../scripts/game-data/source-adapters.mjs";

function rawSheet(name, records) {
  const headers = SOURCE_TAB_HEADERS[name];
  return Object.freeze({
    name,
    headers,
    rows: Object.freeze(records.map((record, index) => Object.freeze({
      rowNumber: index + 2,
      values: Object.freeze(headers.map((header) => record[header] ?? null)),
    }))),
  });
}

const schemaRecords = Object.entries(SOURCE_TAB_HEADERS)
  .filter(([tab]) => !["Metadata", "Schema", "Enums"].includes(tab))
  .flatMap(([tab, headers]) => headers.map((field) => ({
    tab,
    field,
    type: field.endsWith("Key") ? "key" : "text",
    required: field.endsWith("Key") ? "yes" : "no",
    valuesOrFormat: "",
    default: "",
    description: `${tab}.${field}`,
  })));

export const VALID_SCHEMA_V4_RECORDS = Object.freeze({
  Metadata: Object.freeze([
    { key: "sourceSchemaVersion", value: 4 },
    { key: "grantSyntaxVersion", value: 2 },
    { key: "prerequisiteSyntaxVersion", value: 2 },
    { key: "canonicalWorkbookId", value: "fixture-workbook" },
  ]),
  Schema: Object.freeze(schemaRecords),
  Enums: Object.freeze([
    { domain: "status", value: "playable", meaning: "Eligible for selection." },
    { domain: "selectionMode", value: "selectable", meaning: "Eligible for selection." },
    { domain: "selectionMode", value: "granted-only", meaning: "Only available from grants." },
    { domain: "selectionMode", value: "draft", meaning: "Exported for review but unavailable for selection or grants." },
  ]),
  Classes: Object.freeze([{
    classKey: "ninja", name: "Ninja", pitch: "A precise shadow warrior.", examples: "Shinobi; infiltrator",
    hpProgression: "Medium", primaryAttributeA: "Agility", primaryAttributeB: "Mind",
    combatTechniqueSkill: "Martial Arts", combatSkills: "Martial Arts:Fast;Targeting:Medium",
    utilitySkillOptions: "Stealth;Acrobatics", notes: "Fixture", status: "playable",
  }]),
  ClassSkills: Object.freeze([{
    classKey: "ninja", skillKey: "martial-arts", skillName: "Martial Arts", role: "combat-technique",
    progression: "fast", whenPrimaryAttribute: "Agility", choiceGroup: "", displayOrder: 1,
  }]),
  ClassFeatures: Object.freeze([{
    classKey: "ninja", level: 1, rowType: "FEATURE", featureKey: "shadow-training", name: "Shadow Training",
    description: "Learn a stalking technique.", grants: "technique | techniqueKey=stalk-prey",
    prerequisites: "class | classKey=ninja | level=1", notes: "", grantText: "Learn Stalk Prey.",
  }]),
  Techniques: Object.freeze([{
    techniqueName: "Stalk Prey", description: "Track a nearby target.", skill: "Martial Arts", rank: 1,
    tags: "Focus;Utility", prerequisites: "class | classKey=ninja | level=1", actionType: "Action", actions: 1,
    energyCost: 2, strainCost: 0, sustained: "N", rollRequired: "Y", attribute: "Agility", defense: "Evasion",
    range: "Near", targets: "One target", damage: "1 + Hits", onSuccess: "Mark the target.",
    damageByRank: "0=1 + Hits;1=2 + Hits", pumpDamageByRank: "1=+1", rankNotes: "Ranks improve damage.",
    sourceNote: "Fixture", techniqueKey: "stalk-prey", selectionMode: "selectable", energyCostKind: "fixed",
    prerequisiteText: "Ninja level 1", skillKeys: "martial-arts", tagKeys: "focus,utility",
  }]),
  Feats: Object.freeze([{
    category: "General", rowType: "OPTION_GROUP", featKey: "trained-senses", name: "Trained Senses",
    prerequisites: "class | classKey=ninja", description: "Choose one trained sense.",
    grants: "option | groupKey=trained-senses | count=1", featType: "general", chooseCount: 1,
    grantText: "Choose a sense.",
  }]),
  Origins: Object.freeze([{
    originKey: "wanderer", name: "Wanderer", status: "playable", summary: "Always moving.",
    description: "You learned by travelling.", originKeystone: "Restless", questions: "- Where are you from?\n- Why did you leave?",
    futureUpgradesText: "Find a new road;Make a new friend", examplesText: "Pilgrim;Scout",
  }]),
  OriginFeatures: Object.freeze([{
    originKey: "wanderer", level: 1, rowType: "FEATURE", featureKey: "well-travelled", name: "Well Travelled",
    description: "Gain a utility skill.", grants: "skill | skillKey=survival | progression=medium",
    grantText: "Gain Survival.",
  }]),
  WeaponBases: Object.freeze([{
    weaponKey: "long_blade", name: "Long Blade", description: "A balanced sword.", minRank: 0,
    tags: "Melee;Sharp", tagKeys: "melee,sharp,reach=1", sourceNote: "Fixture",
  }]),
  WeaponProfiles: Object.freeze([{
    weaponKey: "long_blade", profileType: "basic", profileName: "Slash", description: "A sweeping cut.", rank: 0,
    tags: "Melee;Sharp", actionType: "Action", actions: 1, energyCost: 0, strainCost: 0, sustained: "N",
    rollRequired: "Y", attribute: "Strength", skill: "Melee Weapons", defense: "Guard", range: "Reach 1",
    targets: "One target", damage: "2 + Hits", damageTier: "standard", onSuccess: "Deal damage.",
    damageByRank: "0=2 + Hits;1=3 + Hits", pumpDamageByRank: "1=+1", prerequisites: "weapon | tag=melee | minReach=1",
  }]),
  WeaponEnhancements: Object.freeze([{
    enhancementKey: "serrated", name: "Serrated", description: "Improves a sharp weapon.", minRank: 1,
    prerequisites: "weapon | tagAll=melee,sharp", sourceNote: "Fixture", selectionMode: "selectable",
  }]),
});

export function buildSchemaV4Workbook({ records = VALID_SCHEMA_V4_RECORDS, headers = {}, omit = [] } = {}) {
  const omitted = new Set(omit);
  const sheets = {};
  for (const name of Object.keys(SOURCE_TAB_HEADERS)) {
    if (omitted.has(name)) continue;
    const built = rawSheet(name, records[name] || []);
    sheets[name] = headers[name] ? Object.freeze({ ...built, headers: Object.freeze(headers[name]) }) : built;
  }
  return Object.freeze({ sheetNames: Object.freeze(Object.keys(sheets)), sheets: Object.freeze(sheets) });
}
