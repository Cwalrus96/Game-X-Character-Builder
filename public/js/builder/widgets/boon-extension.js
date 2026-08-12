import { normalizeBoonGrant } from "../../core/boon-rules.js";
import { BoonWidget } from "./boon-widget.js";

export function registerBoonWidgetExtension(registry, { documentRef = globalThis.document } = {}) {
  const previousChoiceHandler = registry.get("choice");
  registry.remove("choice");
  registry.register("choice", (context) => {
    if (!normalizeBoonGrant(context.grant)) return previousChoiceHandler?.(context) || null;
    return new BoonWidget(context.page, { grant: context.grant, scope: context.scope, documentRef });
  });
  return registry;
}
