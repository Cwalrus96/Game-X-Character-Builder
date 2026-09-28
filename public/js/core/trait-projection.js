import { projectTechniqueOwnership } from "./technique-ownership.js";
export { traitSourceIdentity } from "./trait-rules.js";

/** UI/graph read model includes Techniques supplied by every acquisition source.
 * The low-level Trait evaluator stays independent for fixed-point evaluation. */
export function projectCharacterTraits(character, gameData = {}) {
  return projectTechniqueOwnership({ builder: character?.builder || character || {}, gameData }).traitProjection;
}
