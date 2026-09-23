import { getKeystoneChoices, getKeystoneAnswerState, isKeystoneGrant } from "./keystone-rules.js";

export function registerKeystoneGraphExtension(registry) {
  const previous = registry.getGrant("choice");
  registry.removeGrant("choice");
  registry.registerGrant("choice", (context) => {
    if (!isKeystoneGrant(context.grant)) return previous?.(context);
    const { sourceOwnerId, sourceName, grantIndex, grant, grantNodeId, path } = context;
    for (const choice of getKeystoneChoices(grant, { sourceId: sourceOwnerId, index: grantIndex, sourceLabel: sourceName })) {
      const { choiceId } = choice;
      const choiceNodeId = `grant-choice:${choiceId}`;
      if (context.activeChoices.has(choiceId)) {
        context.addDiagnostic({ code: "duplicate-choice-identity", path, nodeId: choiceNodeId, message: `Duplicate Keystone choice "${choiceId}".` });
        continue;
      }
      const answered = Boolean(context.character.builder.grantChoices[choiceId]);
      context.addTypedNode("grant-choice", {
        id: choiceNodeId, key: choiceId, label: choice.label, state: answered ? "selected" : "incomplete",
        sourceOwnerId, storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choiceId },
        metadata: { choiceId, answered, answerType: "keystone", sourceNodeId: sourceOwnerId, grantNodeId },
      }, path);
      context.graph.addEdge({ kind: "grants", from: grantNodeId, to: choiceNodeId }, { path });
      context.activeChoices.set(choiceId, { ...choice, choiceNodeId, sourceOwnerId, grant, answerType: "keystone" });
    }
  });
  return registry;
}

export function compileKeystoneAnswer(context, answer, choice, graph) {
  const state = getKeystoneAnswerState(answer, choice);
  const nodeId = `grant-answer:${choice.choiceId}`;
  const path = `character.builder.grantChoices.${choice.choiceId}`;
  context.addTypedNode("grant-answer", {
    id: nodeId, key: choice.choiceId, label: choice.label, state: state.valid ? "selected" : "invalid",
    sourceOwnerId: choice.sourceOwnerId,
    storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choice.choiceId },
    metadata: { choiceId: choice.choiceId, answerType: "keystone", ...state, orphaned: false },
  }, path);
  graph.addEdge({ kind: "owns", from: choice.sourceOwnerId, to: nodeId }, { path });
  graph.addEdge({ kind: "satisfies", from: nodeId, to: choice.choiceNodeId }, { path });
}
