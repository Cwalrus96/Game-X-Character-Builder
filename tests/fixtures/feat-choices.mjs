import { GRAPH_GAME_DATA, makeGraphCharacter } from "./graph-core.mjs";

export function makeFeatChoicesFixture() {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  const feature = (featureKey, filterType, category, level = 2) => ({
    type: "feature", classKey: "ninja", featureKey, name: featureKey, level,
    grants: [{ type: "feat", filterType, category, level, count: 1 }], prerequisites: [],
  });
  const classFeature = feature("class-feat-2", "class", "ninja");
  const archetypeFeature = feature("archetype-feat-2", "archetype", ["ninja", "multiclass"]);
  const laterFeature = feature("class-feat-4", "class", "ninja", 4);
  gameData.classFeatures.ninja = [laterFeature, archetypeFeature, classFeature];
  const feat = (key, featType = "class", category = "ninja", level = 2) => ({
    type: "feature", featKey: key, name: key, featType, category,
    description: `${key} description`, grants: [],
    prerequisites: [{ type: "class", key: "ninja", level }],
  });
  gameData.feats = [
    feat("class-a"), feat("class-b"), feat("class-high", "class", "ninja", 4),
    feat("other-class", "class", "guardian"), feat("archetype-a", "archetype"),
    feat("archetype-b", "archetype"), feat("multiclass", "archetype", "multiclass"),
    feat("other-archetype", "archetype", "guardian"), feat("general", "general"),
    { ...feat("needs-skill"), prerequisites: [{ type: "skill", name: "Athletics", rank: 3 }] },
    { ...feat("unfinished"), expressionSyntaxVersion: 3, runtimeSupport: { status: "deferred", reasons: ["incomplete-content"] } },
  ];
  const character = makeGraphCharacter();
  character.builder.classKey = "ninja";
  character.builder.level = 2;
  character.builder.selectedFeats = [];
  character.builder.selectedClassFeatureOptions = [];
  return { gameData, character, classFeature, archetypeFeature, laterFeature };
}
