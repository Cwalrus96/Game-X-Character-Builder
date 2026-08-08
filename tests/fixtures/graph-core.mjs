import { createDefaultCharacter } from "../../public/js/core/character-codec.js";

export const GRAPH_GAME_DATA = Object.freeze({
  schemaVersion: 2,
  classes: Object.freeze([
    Object.freeze({ classKey: "guardian", name: "Guardian", status: "playable", selectable: true }),
    Object.freeze({ classKey: "ninja", name: "Ninja", status: "playable", selectable: true }),
  ]),
  classFeatures: Object.freeze({
    guardian: Object.freeze([]),
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
  feats: Object.freeze([]),
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
  weaponBases: Object.freeze([]),
  weaponEnhancements: Object.freeze([]),
});

export function makeGraphCharacter({
  classKey = "ninja",
  level = 2,
  agility = 2,
  selectedTechniques = [],
  selectedClassFeatureOptions = [],
  grantChoices = {},
} = {}) {
  const character = createDefaultCharacter({ ownerUid: "graph_user" });
  character.builder.classKey = classKey;
  character.builder.level = level;
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.agility = agility;
  character.builder.selectedTechniques = [...selectedTechniques];
  character.builder.selectedClassFeatureOptions = [...selectedClassFeatureOptions];
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
