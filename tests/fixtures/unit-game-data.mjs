// Deliberately small, synthetic rule scenarios. Names are test labels, not a
// snapshot of the Sheet; editing game content must never update these fixtures.
export function makeLegacyChoiceGameData() {
  const classKey = "magical-guardian";
  const feature = (featureKey, name, level, grants) => ({ type: "feature", classKey, featureKey, name, level, grants, prerequisites: [] });
  const feat = (featKey, name, level, grants = []) => ({ type: "feature", featType: "class", category: classKey, featKey, name, grants, prerequisites: [{ type: "class", key: classKey, level }] });
  return {
    schemaVersion: 2,
    classes: [
      { classKey, name: "Magical Guardian", selectable: true, primaryAttributeA: "Attunement", primaryAttributeB: "Heart", combatTechniqueSkill: "Spellcasting", combatSkills: [{ name: "Spellcasting", progression: "fast" }] },
      { classKey: "ninja", name: "Ninja", selectable: true, primaryAttributeA: "Agility", primaryAttributeB: "Intellect", combatTechniqueSkill: "Martial Arts" },
    ],
    classSkills: [{ classKey, role: "combat-technique", skillKey: "spellcasting", skillName: "Spellcasting", progression: "fast" }],
    classFeatures: {
      [classKey]: [
        { ...feature("guardian-accessory", "Guardian Accessory", 1, []), type: "optionGroup", chooseCount: 1, options: [
          { type: "option", classKey, featureKey: "dazzling-wand", name: "Dazzling Wand", level: 1, prerequisites: [], grants: [{ type: "technique-choice", skill: "Spellcasting", count: 1 }] },
          { type: "optionGroup", classKey, featureKey: "shining-weapon", name: "Shining Weapon", level: 1, chooseCount: 1, prerequisites: [], grants: [], options: [
            { type: "option", classKey, featureKey: "shining-weapon-melee", name: "Melee Weapons", level: 1, prerequisites: [], grants: [{ type: "skill", name: "Melee Weapons", rank: 1, progression: "slow" }] },
          ] },
        ] },
        feature("test-feat-2", "First Class Feat", 2, [{ type: "feat", filterType: "class", category: classKey, level: 2, count: 1 }]),
        feature("test-archetype", "First Archetype", 2, [{ type: "feat", filterType: "archetype", category: classKey, count: 1 }]),
        feature("test-feat-4", "Second Class Feat", 4, [{ type: "feat", filterType: "class", category: classKey, level: 4, count: 1 }]),
      ],
      ninja: [],
    },
    feats: [
      feat("animal-transformation", "Animal Transformation", 2),
      feat("instant-transformation", "Instant Transformation", 4),
      feat("celestial-knight-path-initiate", "Celestial Knight Path Initiate", 2),
      feat("dazzling-transformation", "Dazzling Transformation", 2, [{ type: "technique", key: "dazzling-transformation" }]),
    ],
    techniques: [
      ["healing-light", "Healing Light"], ["bolstering-aegis", "Bolstering Aegis"],
      ["prismatic-burst", "Prismatic Burst"], ["guardian-bubble", "Guardian Bubble"],
      ["solar-charm", "Solar Charm"], ["dazzling-transformation", "Dazzling Transformation"],
    ].map(([techniqueKey, techniqueName]) => ({ techniqueKey, techniqueName, skill: "Spellcasting", skillKeys: ["spellcasting"], rank: 1, prerequisites: [], selectionMode: techniqueKey === "dazzling-transformation" ? "granted-only" : "selectable" })),
    origins: [], weaponBases: [], weaponEnhancements: [],
  };
}

export function makeLegacySkillGameData() {
  return {
    schemaVersion: 2,
    classes: [
      { classKey: "weapon-master", name: "Weapon Master", selectable: true, primaryAttributeA: "Strength", primaryAttributeB: "Agility", combatTechniqueSkill: "Melee Weapons", combatSkills: [{ name: "Melee Weapons", progression: "fast" }, { name: "Targeting", progression: "medium" }] },
      { classKey: "henshin-hero", name: "Henshin Hero", selectable: true, primaryAttributeA: "Strength", primaryAttributeB: "Heart", combatTechniqueSkill: "Henshin Arts" },
    ],
    classSkills: [
      { classKey: "weapon-master", role: "combat-technique", skillKey: "melee-weapons", skillName: "Melee Weapons", progression: "fast", whenPrimaryAttribute: "strength" },
      { classKey: "weapon-master", role: "combat-technique", skillKey: "targeting", skillName: "Targeting", progression: "medium", whenPrimaryAttribute: "strength" },
    ],
    classFeatures: {
      "weapon-master": [],
      "henshin-hero": [{
        type: "optionGroup", classKey: "henshin-hero", featureKey: "heroic-combat-training", name: "Heroic Combat Training", level: 1, chooseCount: 1, grants: [], prerequisites: [],
        description: "Choose one of the following combat skills: Targeting, Melee Weapons, or Martial Arts.",
        options: [{
          type: "option", classKey: "henshin-hero", featureKey: "heroic-combat-training-targeting", name: "Targeting", level: 1, prerequisites: [],
          grants: [{ type: "skill", name: "Targeting", progression: "medium" }, { type: "weapon", skill: "Targeting", rank: 1, count: 1 }],
        }],
      }],
    },
    weaponBases: [{ weaponKey: "rifle", name: "Rifle", minRank: 1, profiles: [{ profileType: "basicAttack", skill: "Targeting", attribute: "Agility", defense: "Physical" }] }],
    weaponEnhancements: [{ enhancementKey: "enhanced_targeting", name: "Enhanced Targeting", prerequisites: [] }],
    feats: [], origins: [], techniques: [],
  };
}
