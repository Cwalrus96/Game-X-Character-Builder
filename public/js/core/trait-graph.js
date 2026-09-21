import { projectCharacterTraits } from "./trait-rules.js";

export const TRAIT_NODE_TYPES = Object.freeze(["trait", "trait-choice"]);

/** Graph materialization uses only the shared Rules projection. */
export function compileTraits(context, character, graph) {
  const projection = context.traitProjection || projectCharacterTraits(character, context.gameData);
  for (const issue of projection.issues) if (!issue.remove) context.addDiagnostic({
    severity: issue.severity, code: issue.code, path: issue.path, message: issue.message,
  });
  for (const choice of projection.choices) {
    const answer = character.builder.traitChoices[choice.choiceId];
    const issue = projection.issues.find((item) => item.choiceId === choice.choiceId && item.remove);
    const id = `trait-choice:${choice.choiceId}`;
    context.addTypedNode("trait-choice", { id, key: choice.choiceId, label: choice.label,
      state: issue ? "invalid" : answer ? "selected" : "incomplete", sourceOwnerId: choice.sourceId,
      storageBinding: { path: "builder.traitChoices", kind: "keyed-record", key: choice.choiceId },
      metadata: { choiceId: choice.choiceId, valid: !issue, reason: issue?.message || "", code: issue?.code || "" } });
    if (graph.hasNode(choice.sourceId)) graph.addEdge({ kind: "offers", from: choice.sourceId, to: id });
    if (!answer) context.addDiagnostic({ severity: "warning", code: "trait-choice-incomplete", path: `builder.traitChoices.${choice.choiceId}`, nodeId: id, message: `${choice.label} still needs a Trait.` });
  }
  for (const issue of projection.issues.filter((item) => item.remove)) {
    const kind = "trait-choice";
    const key = issue.choiceId;
    if (graph.hasNode(`${kind}:${key}`)) continue;
    const record = character.builder.traitChoices[key];
    context.addTypedNode(kind, { id: `${kind}:${key}`, key, label: record.traitKey || key, state: "invalid", sourceOwnerId: record.sourceId,
      storageBinding: { path: "builder.traitChoices", kind: "keyed-record", key },
      metadata: { valid: false, orphaned: true, reason: issue.message, code: issue.code } });
  }
  for (const trait of projection.traits.filter((item) => !item.referenceOnly)) {
    context.addTypedNode("trait", { id: trait.id, key: trait.traitKey, label: trait.name,
      state: trait.active ? "automatic" : "available", sourceOwnerId: trait.sourceId, storageBinding: null,
      metadata: { ...trait } });
    const ownerId = trait.choiceId ? `trait-choice:${trait.choiceId}` : trait.sourceId;
    if (graph.hasNode(ownerId)) graph.addEdge({ kind: "materializes", from: ownerId, to: trait.id });
    context.compileRequirements(trait.id, trait.prerequisites, `gameData.traits.${trait.traitKey}.prerequisites`);
  }
  for (const technique of projection.techniques.filter((item) => item.active)) {
    const definition = context.gameData.techniques.find((item) => item.techniqueKey === technique.techniqueKey);
    const id = `automatic-technique:${technique.traitId}:${technique.techniqueKey}`;
    context.addTypedNode("automatic-technique", { id, key: technique.techniqueKey, label: definition.techniqueName || definition.name || technique.techniqueKey,
      state: "automatic", sourceOwnerId: technique.traitId, storageBinding: null,
      metadata: { techniqueKey: technique.techniqueKey, traitId: technique.traitId, recipientId: technique.recipientId, rank: technique.rank } });
    graph.addEdge({ kind: "grants", from: technique.traitId, to: id });
    context.automaticTechniqueKeys.add(technique.techniqueKey);
  }
  return projection;
}
