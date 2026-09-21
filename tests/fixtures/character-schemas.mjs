import { createDefaultCharacter } from "../../public/js/core/character-codec.js";

export const MIGRATION_GAME_DATA = Object.freeze({
  classes: Object.freeze([
    { classKey: "ninja", name: "Ninja" },
    { classKey: "magical-guardian", name: "Magical Guardian" },
    { classKey: "weapon-master", name: "Weapon Master" },
  ]),
  origins: Object.freeze([{ originKey: "wanderer", name: "Wanderer", features: [] }]),
  classSkills: Object.freeze([
    { skillKey: "stealth", skillName: "Stealth" },
    { skillKey: "martial-arts", skillName: "Martial Arts" },
    { skillKey: "spellcasting", skillName: "Spellcasting" },
  ]),
  classFeatures: Object.freeze({
    "weapon-master": Object.freeze([{
      type: "feature",
      classKey: "weapon-master",
      level: 1,
      featureKey: "soulbound-weapon",
      name: "Soulbound Weapon",
      grants: Object.freeze([{ type: "weapon", choiceId: "soulbound-weapon", rank: 1 }]),
    }]),
    ninja: Object.freeze([{
      type: "optionGroup",
      classKey: "ninja",
      level: 1,
      featureKey: "shadow-training",
      name: "Shadow Training",
      grants: [],
      options: Object.freeze([{
        type: "option",
        classKey: "ninja",
        level: 1,
        featureKey: "shadow-step",
        name: "Shadow Step",
        grants: [],
      }]),
    }]),
    "magical-guardian": Object.freeze([{
      type: "optionGroup",
      classKey: "magical-guardian",
      level: 1,
      featureKey: "guardian-accessory",
      name: "Guardian Accessory",
      grants: [],
      options: Object.freeze([{
        type: "option",
        classKey: "magical-guardian",
        level: 1,
        featureKey: "dazzling-wand",
        name: "Dazzling Wand",
        grants: Object.freeze([{
          type: "technique-choice",
          skill: "Spellcasting",
          count: 1,
        }]),
      }]),
    }]),
  }),
  feats: Object.freeze([{
    type: "optionGroup",
    classKey: "ninja",
    minLevel: 2,
    featKey: "trained-senses",
    name: "Trained Senses",
    grants: [],
    options: Object.freeze([{
      type: "option",
      classKey: "ninja",
      minLevel: 2,
      featKey: "keen-sight",
      name: "Keen Sight",
      grants: [],
    }]),
  }]),
  techniques: Object.freeze([
    {
      techniqueKey: "stalk-prey",
      techniqueName: "Stalk Prey",
    },
    {
      techniqueKey: "prismatic-burst",
      techniqueName: "Prismatic Burst",
    },
  ]),
});

function legacySheet() {
  return {
    fields: {
      charName: "Kiko",
      playerName: "",
      classSelect: "Ninja",
      primaryAttribute: "agility",
      level: "2",
      background: "Wanderer",
      strength: "0",
      agility: "1",
      intellect: "0",
      willpower: "0",
      attunement: "0",
      heart: "0",
      hpmax: "20",
      hpcur: "14",
      strain: "1",
      overstrained: false,
      speed: "5",
      physdef: "10",
      mentdef: "10",
      spiritdef: "10",
      rank_stealth: "2",
      notes: "Keeps careful notes.",
    },
    repeatables: {
      originKeystones: [{ text: "Never abandon a trail." }],
      bondKeystones: [{ name: "Old mentor", rank: "2", notes: "Always answer their call." }],
      backgroundKeystones: [{ text: "The road remembers." }],
      combatSkillsExtra: [{ skill: "Martial Arts", rank: "1" }],
      settingSkills: [{ skill: "City Lore", rank: "2" }],
      abilities: [{ name: "Shadow Step", text: "Move between nearby shadows." }],
      conditions: [{ name: "Hidden", n: "1", notes: "Until revealed." }],
      techniques: [{ name: "", actions: "", energy: "", text: "" }],
      weapons: [{ name: "", skill: "", notes: "" }],
    },
  };
}

export function makeUnversionedCharacter() {
  return {
    ownerUid: "user_123",
    name: "Kiko",
    sheet: legacySheet(),
    createdAt: "created-at",
    updatedAt: "updated-at",
  };
}

export function makeV1Character() {
  return {
    schemaVersion: 1,
    ownerUid: "user_123",
    name: "Kiko",
    portraitUrl: "",
    portraitPath: "",
    builder: {
      level: 2,
      attributes: {
        strength: 0,
        agility: 1,
        intellect: 0,
        willpower: 0,
        attunement: 0,
        heart: 0,
      },
      classKey: "Ninja",
      primaryAttribute: "agility",
      classFeatureChoices: {
        "cfg:ninja:1:shadow-training": ["Shadow Step"],
      },
      selectedFeatIds: ["feat:ninja:2:Trained Senses"],
      visitedSteps: ["basics", "class"],
    },
    sheet: legacySheet(),
    createdAt: "created-at",
    updatedAt: "updated-at",
  };
}

export function makeV3Character() {
  const v1 = makeV1Character();
  return {
    schemaVersion: 3,
    ownerUid: v1.ownerUid,
    builder: {
      name: "Kiko",
      portraitPath: "",
      level: 2,
      classKey: "Ninja",
      primaryAttribute: "agility",
      attributes: { ...v1.builder.attributes, agility: 2 },
      originKey: "Wanderer",
      originKeystone: "Never abandon a trail.",
      selectedClassFeatureOptions: ["ninja|L1|Shadow Training::Shadow Step"],
      selectedClassUtilitySkills: ["Stealth"],
      selectedFeats: ["Trained Senses"],
      autoAbilityNames: ["Shadow Step"],
      grantedCoreSkillSnapshot: ["Stealth"],
      grantedSkillSnapshot: ["Martial Arts"],
      bonds: [{ name: "Old mentor", rank: "2", keystone: "Always answer their call." }],
      backgroundKeystones: ["The road remembers."],
      visitedSteps: ["basics", "class"],
      lastVisitedAt: "visited-at",
      selectedTechniques: ["Stalk Prey"],
      sheet: legacySheet(),
    },
    createdAt: "created-at",
    updatedAt: "updated-at",
  };
}

export function makeV4Character() {
  const v3 = makeV3Character();
  return {
    ...v3,
    schemaVersion: 4,
    builder: {
      ...v3.builder,
      selectedFeatOptions: ["ninja|L2|Trained Senses::Keen Sight"],
      weapons: [{
        id: "weapon:moon-knife",
        weaponKey: "short-blade",
        rank: 1,
        customName: "Moon Knife",
        enhancements: [{
          id: "enhancement:keen",
          enhancementKey: "keen",
          rank: 1,
          selections: { damage_type: "slashing" },
        }],
      }],
      grantChoices: {
        "choice:technique": {
          choiceId: "choice:technique",
          type: "technique",
          sourceId: "feature:shadow-training",
          sourceLabel: "Shadow Training",
          techniqueName: "Stalk Prey",
        },
      },
      resources: {
        charms: { name: "Charms", capacity: 3, current: 2 },
      },
    },
  };
}

export function makeV5Character() {
  const character = makeV6Character();
  character.schemaVersion = 5;
  delete character.builder.traitChoices;
  delete character.builder.traitActivations;
  return character;
}

export function makeV6Character() {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.name = "Kiko";
  return character;
}

// Synthetic reproduction of the merged v4 shape observed during the save audit.
// No account IDs, character names, or player-authored prose are copied from it.
export function makeObservedLegacyV4Character() {
  const value = makeV4Character();
  Object.assign(value.builder, {
    classKey: "weapon-master",
    classFeatureChoices: {},
    selectedClassFeatureOptions: [],
    selectedFeatIds: ["feat:weapon-master:2:Obsolete Training"],
    selectedFeats: [],
    selectedFeatOptions: [],
    grantedCoreSkillSnapshot: ["rank_athletics", "rank_medicine"],
    updatedAt: "older-builder-update",
    grantChoices: {
      "soulbound-weapon": {
        choiceId: "soulbound-weapon",
        type: "weapon",
        weaponKey: "short-blade",
        rank: 1,
        customName: "Practice weapon",
        enhancements: [{ id: "enhancement:bound", enhancementKey: "soulbound", rank: 1, selections: {}, granted: true }],
        tags: ["One-Handed"],
      },
    },
    weapons: [{
      id: "weapon:owned-practice",
      choiceId: "soulbound-weapon",
      sourceChoiceId: "soulbound-weapon",
      generated: true,
      weaponKey: "short-blade",
      rank: 1,
      customName: "Practice weapon",
      enhancements: [],
    }],
  });
  return value;
}
