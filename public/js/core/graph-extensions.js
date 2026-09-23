import { registerBoonGraphExtension } from "./boon-extension.js";
import { registerKeystoneGraphExtension } from "./keystone-graph.js";

const GRAPH_EXTENSIONS = Object.freeze([registerBoonGraphExtension, registerKeystoneGraphExtension]);

export function registerDefaultGraphExtensions(registry) {
  for (const register of GRAPH_EXTENSIONS) register(registry);
  return registry;
}
