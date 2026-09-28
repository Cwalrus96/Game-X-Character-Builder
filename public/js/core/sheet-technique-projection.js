import { buildTechniqueIndexes, getGameXTechniques, resolveTechniqueRef } from "./game-data.js";
import { compileCharacterGraph, getUnmetRequirementNodeIds } from "./graph-compiler.js";
import { computeKnownCombatSkillsAndGrants } from "./skill-rules.js";
import { createTechniqueContext, getTechniquePerformance, getTechniqueSelectionState } from "./technique-rules.js";
import { getActiveTraitTechniqueDetails, projectCharacterTraits } from "./trait-rules.js";

/** Read-only sheet projection; the graph owns whether a source-owned answer exists. */
export function projectSheetTechniques({ character, gameData }) {
  const builder = character?.builder || {};
  const techniques = getGameXTechniques(gameData);
  const indexes = buildTechniqueIndexes(techniques);
  const context = createTechniqueContext({ gameData, builder });
  const traitDetails = getActiveTraitTechniqueDetails(projectCharacterTraits({ builder }, gameData));
  const items = new Map();
  const add = (ref, source, { replace = false, provider = null } = {}) => {
    const resolved = resolveTechniqueRef(ref, indexes);
    if (!resolved.ok) return;
    const tech = resolved.technique;
    const key = tech.techniqueKey || tech.techniqueName;
    if (!replace && items.has(key)) return;
    items.set(key, { tech, source, provider, performance: getTechniquePerformance(tech, context, provider) });
  };

  for (const ref of computeKnownCombatSkillsAndGrants(gameData, builder).grantedTechniqueNames) add(ref, "Granted");
  if (Object.values(builder.grantChoices || {}).some(answer => answer?.type === "technique")) {
    const graph = compileCharacterGraph({ character, gameData });
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    for (const node of graph.nodes) {
      if (node.type !== "grant-answer" || node.state !== "selected" || !node.metadata.valid
        || !node.metadata.techniqueKey || getUnmetRequirementNodeIds(graph, node.id).length) continue;
      const choice = nodes.get(`grant-choice:${node.metadata.choiceId}`);
      const sourceLabel = choice?.label || nodes.get(node.sourceOwnerId)?.label;
      add(node.metadata.techniqueKey, sourceLabel ? `Granted by ${sourceLabel}` : "Granted", { replace: true });
    }
  }
  for (const [key, provider] of traitDetails) {
    add(key, `Granted by ${provider.traitName || provider.sourceLabel || "Trait"}`, { replace: true, provider });
  }
  for (const ref of builder.selectedTechniques || []) add(ref, "Selected");
  for (const tech of techniques) {
    if (!tech.techniqueName || Number(tech.rank) !== 0) continue;
    const access = getTechniqueSelectionState(tech, context);
    if (access.eligible && access.prerequisitesMet !== false) add(tech.techniqueKey || tech.techniqueName, "Basic");
  }
  return [...items.values()].sort((a, b) => (Number(a.tech.rank) || 0) - (Number(b.tech.rank) || 0)
    || a.tech.techniqueName.localeCompare(b.tech.techniqueName));
}
