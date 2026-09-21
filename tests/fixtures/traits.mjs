import { createDefaultCharacter } from "../../public/js/core/character-codec.js";

export function traitData() {
  const ready = { expressionSyntaxVersion: 3, runtimeSupport: { status: "supported", reasons: [] } };
  const trait = (traitKey, extra = {}) => ({ ...ready, traitKey, name: traitKey, description: `${traitKey} benefit`, rank: 1, tags: ["Body"], grants: [], prerequisites: [], techniqueKeys: [], ...extra });
  const feature = (featureKey, grants, extra = {}) => ({ ...ready, originKey: "test-origin", featureKey, name: featureKey, description: "Provider benefit", level: 1, type: "feature", grants, prerequisites: [], ...extra });
  return {
    schemaVersion: 3, sourceSchemaVersion: 5, expressionSyntaxVersion: 3, classes: [], classFeatures: {}, classSkills: [], feats: [], weaponBases: [], weaponEnhancements: [],
    origins: [{ ...ready, originKey: "test-origin", name: "Test Origin", status: "playable", selectable: true, description: "Origin", features: [
      feature("adaptation", [{ type: "trait", tag: "Body", choiceId: "body", rank: 2 }]),
    ] }],
    traits: [
      trait("wings", { grants: [{ type: "tag", tag: "Wings", minRank: 1 }, { type: "tag", tag: "Flight", minRank: 2 }], techniqueKeys: ["flight", "draft-flight", "advanced-flight"] }),
      trait("liquid", { grants: [{ type: "tag", tag: "Liquid", minRank: 1 }] }),
      trait("storage", { prerequisites: [{ type: "trait", key: "liquid" }] }),
      trait("advanced", { rank: 3 }),
      trait("unfinished", { description: "", rank: null }),
    ],
    techniques: [
      { ...ready, techniqueKey: "flight", techniqueName: "Flight", status: "playable", rank: 1, selectionRoutes: [{ type: "granted" }], prerequisites: [] },
      { ...ready, techniqueKey: "draft-flight", techniqueName: "Draft Flight", status: "draft", rank: 1, selectionRoutes: [{ type: "granted" }], prerequisites: [] },
      { ...ready, techniqueKey: "advanced-flight", techniqueName: "Advanced Flight", status: "playable", rank: 3, selectionRoutes: [{ type: "granted" }], prerequisites: [] },
      { ...ready, techniqueKey: "aerial-dodge", techniqueName: "Aerial Dodge", status: "playable", rank: 2, selectionRoutes: [{ type: "tag", name: "Flight" }], prerequisites: [{ type: "trait", key: "wings", minRank: 2 }] },
    ],
  };
}

export function traitCharacter({ traitKey = "wings" } = {}) {
  const character = createDefaultCharacter({ ownerUid: "trait_test_user" });
  character.builder.originKey = "test-origin";
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.agility = 2;
  const choiceId = "origin-feature:test-origin:adaptation:body:1";
  character.builder.traitChoices[choiceId] = { choiceId, sourceId: "origin-feature:test-origin:adaptation", recipientId: "character", traitKey };
  return character;
}
