import { getActiveGrantEntries } from "./game-data.js";
import { isGameDataRecordExecutable, isGameDataGrantExecutable } from "./selection-rules.js";
import { createFeatGrantSlots, allocateFeatsToExplicitSlots } from "./feat-allocation-rules.js";
import { meetsPrerequisites } from "./prerequisite-rules.js";

/** Source identity describes ownership, never a different entity implementation. */
export function grantSourceIdentity(entry, { option = entry?.type === "option" } = {}) {
  if (entry.originKey && entry.featureKey) return `origin-feature:${entry.originKey}:${entry.featureKey}`;
  if (entry.classKey && entry.featureKey) return `${option ? "class-option" : "class-feature"}:${entry.classKey}:${entry.featureKey}`;
  if (entry.featKey) return `${option ? "feat-option" : "feat-selection"}:${entry.featKey}`;
  return entry.originKey ? `origin:${entry.originKey}` : "";
}

/** All supported owners share ancestor readiness, level and prerequisite context. */
export function getCharacterGrantSources(gameData = {}, builder = {}) {
  const ancestry = new Map();
  const remember = (rows, parents = [], option = false) => {
    for (const entry of rows || []) {
      ancestry.set(entry, { parents, option });
      remember(entry.options, [...parents, entry], true);
      remember(entry.features, [...parents, entry]);
    }
  };
  const selectedClass = (gameData.classes || []).find(entry => entry.classKey === builder.classKey);
  const classRows = Array.isArray(gameData.classFeatures)
    ? gameData.classFeatures.filter(entry => entry.classKey === builder.classKey)
    : gameData.classFeatures?.[builder.classKey] || [];
  remember(classRows, selectedClass ? [selectedClass] : []);
  remember(gameData.origins);
  remember(gameData.feats);
  return getActiveGrantEntries(gameData, builder).map(entry => {
    const { parents = [], option = entry.type === "option" } = ancestry.get(entry) || {};
    const chain = [...parents, entry];
    const levelEligible = chain.every(row => Number(row.level || 1) <= Number(builder.level || 1));
    return { entry, featKey: chain.find(row => row.featKey)?.featKey || "", sourceId: grantSourceIdentity(entry, { option }), sourceLabel: entry.name || entry.featureKey || entry.featKey || entry.originKey,
      levelEligible, available: levelEligible && chain.every(isGameDataRecordExecutable),
      prerequisites: chain.flatMap(row => row.prerequisites || []) };
  });
}

export function getSourceFeatSlots(sources) {
  return sources.flatMap(source => (source.entry.grants || []).flatMap((grant, grantIndex) =>
    isGameDataGrantExecutable(grant, { source: source.entry }) ? createFeatGrantSlots(grant, {
      sourceId: source.sourceId, sourceKey: source.entry.featureKey || source.entry.featKey || source.entry.originKey,
      sourceLabel: source.sourceLabel, grantIndex, grantId: `grant:${source.sourceId}:${grantIndex}:feat`,
    }) : []));
}

/** Selected Feats can grant further choices, but cannot authorize themselves. */
export function getActiveCharacterGrantSources(gameData = {}, builder = {}, context = { gameData, builder }) {
  const candidates = getCharacterGrantSources(gameData, builder)
    .filter(source => source.available && meetsPrerequisites(source.prerequisites, context));
  const active = candidates.filter(source => !source.featKey);
  const ids = new Set(active.map(source => source.sourceId));
  for (let pass = 0; pass < candidates.length; pass++) {
    const allocation = allocateFeatsToExplicitSlots({ slots: getSourceFeatSlots(active),
      feats: gameData.feats || [], selectedFeatKeys: builder.selectedFeats || [] });
    const assigned = new Set(allocation.assignments.map(item => item.featKey));
    const next = candidates.filter(source => source.featKey && assigned.has(source.featKey) && !ids.has(source.sourceId));
    if (!next.length) break;
    for (const source of next) { active.push(source); ids.add(source.sourceId); }
  }
  return active;
}
