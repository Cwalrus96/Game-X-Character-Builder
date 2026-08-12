import { normalizeBoonGrant } from "./boon-rules.js";

export function registerBoonGraphExtension(registry) {
  const previousChoiceHandler = registry.getGrant("choice");
  registry.registerNode("boon", ({ graph, node, path }) => graph.addNode(node, { path }));
  registry.removeGrant("choice");
  registry.registerGrant("choice", (context) => {
    const boon = normalizeBoonGrant(context.grant);
    if (!boon) return previousChoiceHandler?.(context);
    const nodeId = `boon:${context.sourceOwnerId}:${boon.boonKey}`;
    context.addTypedNode("boon", {
      id: nodeId,
      key: boon.boonKey,
      label: boon.name,
      state: "automatic",
      sourceOwnerId: context.sourceOwnerId,
      storageBinding: null,
      metadata: { boonKey: boon.boonKey, description: boon.description, extensionProof: true },
    }, context.path);
    context.graph.addEdge({ kind: "materializes", from: context.grantNodeId, to: nodeId }, { path: context.path });
  });
  return registry;
}
