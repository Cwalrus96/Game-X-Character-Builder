// The evaluator remains independent of Trait projection to avoid recursive reads.
export * from "./prerequisite-rules.js";
import * as rules from "./prerequisite-rules.js";
import { projectCharacterTraits } from "./trait-rules.js";

export function createPrerequisiteContext(input = {}) {
  if (input.projectTraits === false || !input.gameData?.traits?.length) return rules.createPrerequisiteContext(input);
  const projection = input.traitProjection || projectCharacterTraits({ builder: input.builder || input }, input.gameData);
  const tagRanks = { ...(input.tagRanks || {}) };
  for (const trait of projection.traits.filter((item) => item.active)) {
    for (const tag of trait.tags) tagRanks[tag] = Math.max(tagRanks[tag] || 0, trait.rank);
  }
  return rules.createPrerequisiteContext({
    ...input,
    selectedTraits: input.selectedTraits ?? projection.traits.filter((trait) => !trait.referenceOnly && trait.active),
    selectedTechniqueKeys: input.selectedTechniqueKeys ?? [...(input.builder?.selectedTechniques || []), ...projection.techniques.filter((technique) => technique.active).map((technique) => technique.techniqueKey)],
    tags: [...(input.tags || []), ...projection.tags],
    tagRanks,
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
