// The evaluator remains independent of Trait projection to avoid recursive reads.
export * from "./prerequisite-rules.js";
import * as rules from "./prerequisite-rules.js";
import { projectTechniqueOwnership } from "./technique-ownership.js";

export function createPrerequisiteContext(input = {}) {
  const base = rules.createPrerequisiteContext(input);
  const ownership = input.techniqueOwnership || projectTechniqueOwnership({ builder: input.builder || input,
    gameData: input.gameData, projectTraits: input.projectTraits !== false });
  const projection = input.traitProjection || ownership.traitProjection;
  const tagRanks = { ...(input.tagRanks || {}) };
  for (const trait of projection.traits.filter((item) => item.active)) {
    for (const tag of trait.tags) tagRanks[tag] = Math.max(tagRanks[tag] || 0, trait.rank);
  }
  return rules.createPrerequisiteContext({
    ...input,
    selectedTraits: input.selectedTraits ?? projection.traits.filter((trait) => !trait.referenceOnly && trait.active),
    selectedTechniqueKeys: input.selectedTechniqueKeys ?? [...new Set([...base.selectedTechniqueKeys, ...ownership.techniques.map(item => item.techniqueKey)])],
    tags: [...(input.tags || []), ...projection.tags],
    tagRanks,
    weapons: input.weapons ?? [...base.weapons, ...(projection.weapons || [])],
  });
}

export function evaluatePrerequisite(prerequisite, input = {}) {
  return rules.evaluatePrerequisite(prerequisite, createPrerequisiteContext(input));
}

export function checkPrerequisites(prerequisites, input = {}) {
  return rules.checkPrerequisites(prerequisites, createPrerequisiteContext(input));
}

export function meetsPrerequisites(prerequisites, input = {}) {
  return checkPrerequisites(prerequisites, input).ok;
}
