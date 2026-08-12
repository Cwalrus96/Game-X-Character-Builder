import { registerBoonGraphExtension } from "./boon-extension.js";

const GRAPH_EXTENSIONS = Object.freeze([registerBoonGraphExtension]);

export function registerDefaultGraphExtensions(registry) {
  for (const register of GRAPH_EXTENSIONS) register(registry);
  return registry;
}
