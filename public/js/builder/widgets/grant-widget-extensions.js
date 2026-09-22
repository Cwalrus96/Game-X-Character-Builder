import { registerBoonWidgetExtension } from "./boon-extension.js";
import { GrantWidgetRegistry } from "./grant-widget-registry.js";
import { registerFeatWidgetExtension } from "./feat-choice-widget.js";

const WIDGET_EXTENSIONS = Object.freeze([registerBoonWidgetExtension, registerFeatWidgetExtension]);

export function createDefaultGrantWidgetRegistry() {
  const registry = new GrantWidgetRegistry();
  for (const register of WIDGET_EXTENSIONS) register(registry);
  return registry;
}
