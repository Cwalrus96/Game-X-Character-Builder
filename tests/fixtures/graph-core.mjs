import { createDefaultCharacter } from "../../public/js/core/character-codec.js";

export const GRAPH_GAME_DATA = Object.freeze({
  schemaVersion: 2,
  classes: Object.freeze([
    Object.freeze({
      classKey: "guardian", name: "Guardian", status: "playable", selectable: true,
      primaryAttributeA: "Willpower", primaryAttributeB: "Heart",
    }),
    Object.freeze({
      classKey: "ninja", name: "Ninja", status: "playable", selectable: true,
      primaryAttributeA: "Agility", primaryAttributeB: "Intellect",
    }),
  ]),
  classSkills: Object.freeze([
    Object.freeze({ classKey: "guardian", role: "utility-option", skillKey: "nature", skillName: "Nature" }),
    Object.freeze({ classKey: "ninja", role: "utility-option", skillKey: "athletics", skillName: "Athletics" }),
  ]),
  classFeatures: Object.freeze({
    guardian: Object.freeze([
      Object.freeze({
        type: "feature",
        classKey: "guardian",
        level: 1,
        featureKey: "soulbound-armament",
        name: "Soulbound Armament",
        prerequisites: Object.freeze([{ type: "class", key: "guardian", level: 1 }]),
        grants: Object.freeze([
          Object.freeze({
            type: "weapon",
            choiceId: "guardian-armament",
            rank: 1,
          }),
          Object.freeze({
            type: "resource",
            resourceKey: "resolve",
            name: "Resolve",
            count: Object.freeze({ kind: "constant", value: 2 }),
          }),
        ]),
      }),
    ]),
    ninja: Object.freeze([
      Object.freeze({
        type: "feature",
        classKey: "ninja",
        level: 1,
        featureKey: "shadow-training",
        name: "Shadow Training",
        prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 1 }]),
        grants: Object.freeze([{ type: "technique", key: "stalk-prey" }]),
      }),
      Object.freeze({
        type: "feature",
        classKey: "ninja",
        level: 2,
        featureKey: "ninja-feat",
        name: "Ninja Feat",
        prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 2 }]),
        grants: Object.freeze([{
          type: "feat",
          filterType: "class",
          category: "ninja",
          level: 2,
          count: 1,
        }]),
      }),
      Object.freeze({
        type: "optionGroup",
        classKey: "ninja",
        level: 1,
        featureKey: "shadow-discipline",
        name: "Shadow Discipline",
        chooseCount: 1,
        grants: Object.freeze([]),
        prerequisites: Object.freeze([]),
        options: Object.freeze([
          Object.freeze({
            type: "option",
            classKey: "ninja",
            level: 1,
            featureKey: "moon-path",
            name: "Moon Path",
            prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 1 }]),
            grants: Object.freeze([{
              type: "technique-choice",
              tag: "moon",
              choiceId: "moon-technique",
              count: 1,
            }]),
          }),
          Object.freeze({
            type: "option",
            classKey: "ninja",
            level: 1,
            featureKey: "master-path",
            name: "Master Path",
            prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 3 }]),
            grants: Object.freeze([]),
          }),
        ]),
      }),
    ]),
  }),
  origins: Object.freeze([]),
  feats: Object.freeze([
    Object.freeze({
      type: "feature",
      featKey: "shadow-adept",
      name: "Shadow Adept",
      category: "ninja",
      featType: "class",
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 2 }]),
      grants: Object.freeze([{ type: "technique", key: "smoke-bomb" }]),
    }),
    Object.freeze({
      type: "optionGroup",
      featKey: "moon-initiate",
      name: "Moon Initiate",
      category: "ninja",
      featType: "class",
      chooseCount: 1,
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 2 }]),
      grants: Object.freeze([]),
      options: Object.freeze([
        Object.freeze({
          type: "option",
          featKey: "moon-initiate-shroud",
          name: "Moon Shroud Path",
          prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 2 }]),
          grants: Object.freeze([{ type: "technique", key: "moon-shroud" }]),
        }),
        Object.freeze({
          type: "option",
          featKey: "moon-initiate-prison",
          name: "Moon Prison Path",
          prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 3 }]),
          grants: Object.freeze([]),
        }),
      ]),
    }),
  ]),
  techniques: Object.freeze([
    Object.freeze({
      techniqueKey: "forbidden-form",
      techniqueName: "Forbidden Form",
      selectionMode: "draft",
      selectable: false,
      skillKeys: Object.freeze(["martial-arts"]),
      tagKeys: Object.freeze(["shadow"]),
      prerequisites: Object.freeze([]),
    }),
    Object.freeze({
      techniqueKey: "moon-prison",
      techniqueName: "Moon Prison",
      selectionMode: "selectable",
      selectable: true,
      skillKeys: Object.freeze(["martial-arts"]),
      tagKeys: Object.freeze(["moon"]),
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 3 }]),
    }),
    Object.freeze({
      techniqueKey: "moon-shroud",
      techniqueName: "Moon Shroud",
      selectionMode: "granted-only",
      selectable: false,
      skillKeys: Object.freeze(["martial-arts"]),
      tagKeys: Object.freeze(["moon"]),
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 1 }]),
    }),
    Object.freeze({
      techniqueKey: "shadow-step",
      techniqueName: "Shadow Step",
      selectionMode: "selectable",
      selectable: true,
      skillKeys: Object.freeze(["martial-arts"]),
      tagKeys: Object.freeze(["shadow"]),
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 1 }]),
    }),
    Object.freeze({
      techniqueKey: "smoke-bomb",
      techniqueName: "Smoke Bomb",
      selectionMode: "selectable",
      selectable: true,
      skillKeys: Object.freeze(["martial-arts"]),
      tagKeys: Object.freeze(["shadow"]),
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 1 }]),
    }),
    Object.freeze({
      techniqueKey: "stalk-prey",
      techniqueName: "Stalk Prey",
      selectionMode: "selectable",
      selectable: true,
      skillKeys: Object.freeze(["martial-arts"]),
      tagKeys: Object.freeze(["shadow"]),
      prerequisites: Object.freeze([{ type: "class", key: "ninja", level: 1 }]),
    }),
  ]),
  classSkills: Object.freeze([]),
  weaponBases: Object.freeze([
    Object.freeze({ weaponKey: "longsword", name: "Longsword", status: "playable", selectable: true }),
  ]),
  weaponEnhancements: Object.freeze([]),
});

export function makeGraphCharacter({
  classKey = "ninja",
  level = 2,
  agility = 2,
  selectedTechniques = [],
  selectedClassFeatureOptions = [],
  selectedFeats = [],
  selectedFeatOptions = [],
  grantChoices = {},
} = {}) {
  const character = createDefaultCharacter({ ownerUid: "graph_user" });
  character.builder.classKey = classKey;
  character.builder.level = level;
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.agility = agility;
  character.builder.selectedTechniques = [...selectedTechniques];
  character.builder.selectedClassFeatureOptions = [...selectedClassFeatureOptions];
  character.builder.selectedFeats = [...selectedFeats];
  character.builder.selectedFeatOptions = [...selectedFeatOptions];
  character.builder.grantChoices = structuredClone(grantChoices);
  return character;
}

export function makeTechniqueGrantAnswer({
  choiceId = "moon-technique",
  sourceId = "class-option:ninja:moon-path",
  techniqueKey = "moon-shroud",
} = {}) {
  return {
    choiceId,
    type: "technique",
    sourceId,
    sourceLabel: "Moon Path",
    value: "",
    techniqueKey,
    skillKey: "",
    weaponKey: "",
    rank: 0,
    customName: "",
    enhancements: [],
    tags: [],
  };
}

export function makeWeaponGrantAnswer({
  choiceId = "guardian-armament",
  sourceId = "class-feature:guardian:soulbound-armament",
  weaponKey = "longsword",
} = {}) {
  return {
    choiceId,
    type: "weapon",
    sourceId,
    sourceLabel: "Soulbound Armament",
    value: "",
    techniqueKey: "",
    skillKey: "",
    weaponKey,
    rank: 1,
    customName: "Oathblade",
    enhancements: [],
    tags: [],
  };
}
