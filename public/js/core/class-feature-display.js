import { getEntryRequiredLevel } from "./option-groups.js";

export function sortClassFeaturesByLevel(features) {
  return [...features].sort((left, right) => getEntryRequiredLevel(left) - getEntryRequiredLevel(right));
}

export function sortClassFeatureAbilitiesByLevel(abilities, gameData) {
  const levelsBySource = new Map();
  for (const [classKey, features] of Object.entries(gameData?.classFeatures || {})) {
    const visit = (entries, parentLevel = 0, sourceType = "class-feature") => {
      for (const entry of Array.isArray(entries) ? entries : []) {
        const level = Math.max(parentLevel, getEntryRequiredLevel(entry));
        if (entry.featureKey) levelsBySource.set(`${sourceType}:${classKey}:${entry.featureKey}`, level);
        visit(entry.options, level, "class-option");
      }
    };
    visit(features);
  }

  const rows = Array.isArray(abilities) ? abilities : [];
  const classAbilities = rows.filter((ability) => levelsBySource.has(ability.sourceId))
    .sort((left, right) => levelsBySource.get(left.sourceId) - levelsBySource.get(right.sourceId));
  let index = 0;
  // Retain other abilities in their existing positions; this is only a display projection.
  return rows.map((ability) => levelsBySource.has(ability.sourceId) ? classAbilities[index++] : ability);
}
