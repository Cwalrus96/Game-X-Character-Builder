import { SOURCE_V5_TAB_HEADERS, SOURCE_V5_FIELD_CONTRACTS, SOURCE_V5_ENUM_VALUES } from "../../scripts/game-data/source-v5-schema.mjs";

export const VALID_SCHEMA_V5_RECORDS = Object.freeze({
  README: [{ section: "Authority", details: "Native source fixture." }],
  Metadata: [
    { key: "sourceSchemaVersion", value: 5 }, { key: "grantSyntaxVersion", value: 3 },
    { key: "prerequisiteSyntaxVersion", value: 3 }, { key: "canonicalWorkbookId", value: "fixture-workbook" },
  ],
  Schema: Object.entries(SOURCE_V5_TAB_HEADERS).filter(([tab]) => !["README", "Metadata", "Schema", "Enums"].includes(tab))
    .flatMap(([tab, headers]) => headers.map((field) => {
      const contract = SOURCE_V5_FIELD_CONTRACTS[`${tab}.${field}`];
      return { tab, field, type: contract.type, required: contract.requirement,
        valuesOrFormat: contract.type === "enum" ? "see Enums" : "", description: `${tab}.${field}` };
    })),
  Enums: Object.entries(SOURCE_V5_ENUM_VALUES).flatMap(([domain, values]) => values.map((value) => ({ domain, value, meaning: `Fixture ${domain}: ${value}.` }))),
  Classes: [{
    classKey: "weapon-master", name: "Weapon Master", hpProgression: "High",
    primaryAttributeA: "Strength", primaryAttributeB: "Agility", status: "playable",
    combatTechniqueSkill: "Melee Weapons, Ranged Weapons",
    combatSkills: "Melee Weapons:Fast (Strength Primary), Medium (Agility Primary); Mental Defense:Medium; Physical Defense:Fast; Spiritual Defense:Slow; Ranged Weapons:Medium (Strength Primary), Fast (Agility Primary)",
    utilitySkillOptions: "Athletics; Society",
  }, { classKey: "unfinished", name: "Unfinished", status: "incomplete" }],
  ClassFeatures: [{
    classKey: "weapon-master", level: 1, rowType: "FEATURE", featureKey: "canonical-rule", name: "Conditional Rule",
    description: "An explicitly deferred conditional rule.", traitKeys: "wings",
  }, {
    classKey: "weapon-master", level: 2, rowType: "FEATURE", featureKey: "repeat-rule", name: "Repeat Rule",
    grants: "feature | featureKey=canonical-rule",
  }],
  Techniques: [{
    techniqueKey: "shared-strike", techniqueName: "Shared Strike", description: "Attack using the chosen skill.",
    selection: "Melee Weapons OR Targeting", status: "playable", rank: 1, tags: "Focus; Reach 2",
    prerequisites: "weapon | tag=Melee | wielded=true OR skill | name=Martial Arts | minRank=1",
    actionType: "Action", actions: 1, energyCost: 2, energyCostKind: "fixed", strainCost: 1,
    sustained: "N", rollRequired: "N", basicAttack: "weapon | attribute=Primary | defense=Physical",
    damage: "4 + Hits; +3 damage per rank above 1.", onCriticalFailure: "Lose your footing.",
    pumpingByRank: "1=+1 damage per Energy;3=+2 ward per Energy;4=+2 ward per Energy",
    rankNotes: "Rank 3+: A separate benefit.",
  }, {
    techniqueKey: "wing-blast", techniqueName: "Wing Blast", selection: "granted", status: "playable",
    rank: 1, actionType: "Action", actions: 1, energyCost: 0, energyCostKind: "fixed",
    rollRequired: "Y", attribute: "Primary", defense: "Physical", associatedSkill: "Targeting",
    damage: "4 + Hits", prerequisites: "tag | tag=Wings",
  }, {
    techniqueKey: "unfinished-strike", techniqueName: "Unfinished Strike", selection: "tag=Wings",
    status: "incomplete", energyCostKind: "unassigned",
  }],
  Feats: [{
    featKey: "path-entry", category: "weapon-master", rowType: "FEATURE", featType: "archetype",
    name: "Path Entry", archetypeKey: "weapon-path", archetypeName: "Weapon Path",
    description: "Begin the path.", grants: "choice | type=keystone | count=1",
  }],
  Origins: [{ originKey: "bonded-relic", name: "Bonded Relic", status: "playable", description: "You carry an Artifact." }],
  OriginFeatures: [{
    originKey: "bonded-relic", level: 1, rowType: "FEATURE", featureKey: "artifact", name: "Artifact",
    grants: "bond | choiceId=artifact | rank=2 | count=1",
  }, {
    originKey: "bonded-relic", level: 1, rowType: "FEATURE", featureKey: "archive", name: "Archive",
    grants: "skill | choiceId=archive-skills | count=3 | rank=1 | recipientRef=artifact", traitKeys: "wings",
  }],
  WeaponBases: [{
    weaponKey: "long_blade", name: "Long Blade", minRank: 0, tags: "Melee; Reach 2",
    techniqueKeys: "shared-strike", traitsText: "Retain a special weapon trait.", notes: "Editorial.",
  }],
  WeaponEnhancements: [{
    enhancementKey: "serrated", name: "Serrated", minRank: 1, selectionMode: "selectable",
    prerequisites: "weapon | tag=Melee", description: "Sharp edge.", sourceNote: "Fixture",
  }],
  Traits: [{
    traitKey: "wings", name: "Wings", rank: 1, tags: "Anatomy, Natural Weapon",
    description: "Glide; higher ranks permit flight.", rankNotes: "Rank 2+: Flight.",
    techniqueKeys: "wing-blast", grants: "tag | tag=Wings | minRank=1\ntag | tag=Flight | minRank=2",
  }],
});

export function buildSchemaV5Workbook({ records = VALID_SCHEMA_V5_RECORDS, headers = {}, omit = [] } = {}) {
  const sheets = {};
  for (const [name, defaults] of Object.entries(SOURCE_V5_TAB_HEADERS)) {
    if (omit.includes(name)) continue;
    const fields = headers[name] || defaults;
    sheets[name] = Object.freeze({
      name, headers: Object.freeze([...fields]),
      rows: Object.freeze((records[name] || []).map((record, index) => Object.freeze({
        rowNumber: index + 2, values: Object.freeze(fields.map((field) => record[field] ?? null)),
      }))),
    });
  }
  return Object.freeze({ sheetNames: Object.freeze(Object.keys(sheets)), sheets: Object.freeze(sheets) });
}
