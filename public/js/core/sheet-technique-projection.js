import { getGameXTechniques } from "./game-data.js";
import { createTechniqueContext, getTechniquePerformance, getTechniqueSelectionState } from "./technique-rules.js";
import { getTechniqueOwnershipDetail, projectTechniqueOwnership } from "./technique-ownership.js";

/** Presentation of the same acquired Techniques used by prerequisites and the builder. */
export function projectSheetTechniques({ character, gameData }) {
  const builder = character?.builder || {};
  const ownership = projectTechniqueOwnership({ gameData, builder });
  const context = createTechniqueContext({ gameData, builder, techniqueOwnership: ownership });
  const items = new Map(ownership.techniques.map(item => {
    const detail = getTechniqueOwnershipDetail(item);
    return [item.techniqueKey, { tech: item.technique, source: detail.label, provider: detail.provider,
      performance: getTechniquePerformance(item.technique, context, detail.provider) }];
  }));
  for (const tech of getGameXTechniques(gameData)) {
    if (!tech.techniqueName || Number(tech.rank) !== 0 || items.has(tech.techniqueKey)) continue;
    const access = getTechniqueSelectionState(tech, context);
    if (access.eligible && access.prerequisitesMet !== false) items.set(tech.techniqueKey, {
      tech, source: "Basic", provider: null, performance: getTechniquePerformance(tech, context),
    });
  }
  return [...items.values()].sort((a, b) => (Number(a.tech.rank) || 0) - (Number(b.tech.rank) || 0)
    || a.tech.techniqueName.localeCompare(b.tech.techniqueName));
}
