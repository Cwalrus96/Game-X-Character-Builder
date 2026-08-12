import { registerBoonWidgetExtension } from "./boon-extension.js";
import { GrantWidgetRegistry } from "./grant-widget-registry.js";

const WIDGET_EXTENSIONS = Object.freeze([registerBoonWidgetExtension]);

export function createDefaultGrantWidgetRegistry() {
  const registry = new GrantWidgetRegistry();
  for (const register of WIDGET_EXTENSIONS) register(registry);
  return registry;
}
