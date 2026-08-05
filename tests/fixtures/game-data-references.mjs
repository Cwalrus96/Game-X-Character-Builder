import { VALID_SCHEMA_V4_RECORDS } from "./game-data-schema-v4.mjs";

const valid = VALID_SCHEMA_V4_RECORDS;

export const INVALID_REFERENCE_RECORDS = Object.freeze({
  ...valid,
  Classes: Object.freeze([
    valid.Classes[0],
    { ...valid.Classes[0], classKey: "samurai", name: "Samurai" },
    { ...valid.Classes[0], name: "Duplicate Ninja", status: "draft" },
  ]),
  ClassSkills: Object.freeze([
    valid.ClassSkills[0],
    { ...valid.ClassSkills[0] },
    {
      classKey: "missing-class", skillKey: "Broken Skill", skillName: "Broken Skill", role: "mystery",
      progression: "rapid", displayOrder: 2,
    },
  ]),
  ClassFeatures: Object.freeze([
    valid.ClassFeatures[0],
    {
      classKey: "samurai", level: 1, rowType: "OPTION_GROUP", featureKey: "remote-group", name: "Remote Group",
      description: "A group in another owner scope.", chooseCount: 1,
    },
    {
      classKey: "ninja", level: 1, rowType: "OPTION", featureKey: "wrong-scope-option", name: "Wrong Scope",
      parentKey: "remote-group", description: "Points outside its owner scope.",
    },
    {
      classKey: "ninja", level: 1, rowType: "OPTION_GROUP", featureKey: "missing-count", name: "Missing Count",
      description: "Has no explicit choose count.",
    },
    {
      classKey: "ninja", level: 1, rowType: "OPTION", featureKey: "orphan-option", name: "Orphan",
      parentKey: "not-a-group", description: "Has no parent.",
    },
    { ...valid.ClassFeatures[0], name: "Duplicate Shadow Training" },
    {
      classKey: "ninja", level: 2, rowType: "FEATURE", featureKey: "broken-references", name: "Broken References",
      description: "Contains valid syntax with unresolved references.",
      grants: [
        "technique | techniqueKey=missing-technique",
        "technique | name=Stalk Prey",
        "feat | featKey=missing-feat",
        "weapon | weaponKey=missing_weapon | choiceId=weapon-choice",
        "weapon-enhancement | enhancementKey=missing_enhancement | choiceRef=weapon-choice",
        "option | groupKey=missing-choice",
        "familiar | count=1",
      ].join("\n"),
      prerequisites: [
        "class | classKey=missing-class",
        "feat | featKey=missing-feat",
        "choice | choiceRef=missing-choice",
        "weapon | weaponKey=missing_weapon",
      ].join("\n"),
    },
  ]),
  Techniques: Object.freeze([
    valid.Techniques[0],
    { ...valid.Techniques[0], techniqueName: "Duplicate Stalk Prey" },
    {
      ...valid.Techniques[0],
      techniqueKey: "unready-technique",
      techniqueName: "Unready Technique",
      skillKeys: "",
      selectionMode: "selectable",
      energyCostKind: "unassigned",
      energyCost: "",
      strainCost: -1,
    },
    {
      ...valid.Techniques[0],
      techniqueKey: "bad-selection",
      techniqueName: "Bad Selection",
      selectionMode: "manual",
      energyCostKind: "fixed",
      energyCost: -1,
    },
  ]),
  Feats: Object.freeze([
    valid.Feats[0],
    {
      category: "Class", rowType: "OPTION", featKey: "off-category-option", name: "Off Category",
      parentKey: "trained-senses", description: "Uses a parent in another category.",
    },
    { ...valid.Feats[0], name: "Duplicate Trained Senses" },
  ]),
  Origins: Object.freeze([
    valid.Origins[0],
    { ...valid.Origins[0], name: "Duplicate Wanderer", status: "draft" },
    { ...valid.Origins[0], originKey: "broken-origin", name: "Broken Origin", status: "unknown" },
  ]),
  OriginFeatures: Object.freeze([
    valid.OriginFeatures[0],
    { ...valid.OriginFeatures[0], originKey: "missing-origin", featureKey: "lost-feature", name: "Lost Feature" },
  ]),
  WeaponBases: Object.freeze([
    valid.WeaponBases[0],
    { ...valid.WeaponBases[0], name: "Duplicate Long Blade" },
  ]),
  WeaponProfiles: Object.freeze([
    valid.WeaponProfiles[0],
    { ...valid.WeaponProfiles[0] },
    { ...valid.WeaponProfiles[0], weaponKey: "missing_weapon", profileName: "Missing Weapon" },
  ]),
  WeaponEnhancements: Object.freeze([
    valid.WeaponEnhancements[0],
    { ...valid.WeaponEnhancements[0], name: "Duplicate Serrated" },
    { ...valid.WeaponEnhancements[0], enhancementKey: "manual_only", name: "Manual Only", selectionMode: "manual" },
  ]),
});
