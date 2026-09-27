import { registerBoonWidgetExtension } from "./boon-extension.js";
import { GrantWidgetRegistry } from "./grant-widget-registry.js";
import { registerFeatWidgetExtension } from "./feat-choice-widget.js?v=choices5";
import { registerTraitWidgetExtension } from "./trait-widget.js?v=choices5";
import { registerKeystoneWidgetExtension } from "./keystone-choice-widget.js?v=choices4";

const WIDGET_EXTENSIONS = Object.freeze([registerBoonWidgetExtension, registerFeatWidgetExtension, registerTraitWidgetExtension, registerKeystoneWidgetExtension]);

export function createDefaultGrantWidgetRegistry() {
  const registry = new GrantWidgetRegistry();
  for (const register of WIDGET_EXTENSIONS) register(registry);
  return registry;
}
