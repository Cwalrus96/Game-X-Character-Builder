function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergePatchValue(previous, next) {
  if (isPlainObject(previous) && isPlainObject(next)) {
    return { ...previous, ...next };
  }
  return next;
}

function mergePatch(target, source) {
  const out = { ...(target || {}) };
  for (const [key, value] of Object.entries(source || {})) {
    out[key] = mergePatchValue(out[key], value);
  }
  return out;
}

export class BuilderPage {
  constructor({ stepId = "", getSaveContext = null } = {}) {
    this.stepId = stepId;
    this.getSaveContext = typeof getSaveContext === "function" ? getSaveContext : () => ({});
    this.widgets = new Map();
  }

  registerWidget(widget) {
    if (!widget?.id) return;
    const existing = this.widgets.get(widget.id);
    if (existing && existing !== widget) existing.destroy?.({ unregister: false });
    this.widgets.set(widget.id, widget);
  }

  unregisterWidget(widgetOrId) {
    const id = typeof widgetOrId === "string" ? widgetOrId : widgetOrId?.id;
    if (id) this.widgets.delete(id);
  }

  clearWidgets({ scope = "" } = {}) {
    for (const widget of Array.from(this.widgets.values())) {
      if (scope && widget.scope !== scope) continue;
      widget.destroy?.({ unregister: false });
      this.widgets.delete(widget.id);
    }
  }

  getWidgetSavePatch(extraContext = {}) {
    let patch = {};
    const baseContext = { ...this.getSaveContext(), ...extraContext };
    for (const widget of this.widgets.values()) {
      if (widget.enabled === false) continue;
      const widgetPatch = widget.getSavePatch?.({ ...baseContext, currentPatch: patch }) || {};
      patch = mergePatch(patch, widgetPatch);
    }
    return patch;
  }

  validateWidgets(extraContext = {}) {
    const baseContext = { ...this.getSaveContext(), ...extraContext };
    return Array.from(this.widgets.values()).flatMap((widget) => widget.validate?.(baseContext) || []);
  }

  setWidgetsEnabled(enabled, { scope = "" } = {}) {
    for (const widget of this.widgets.values()) {
      if (scope && widget.scope !== scope) continue;
      if (enabled) widget.enable?.();
      else widget.disable?.();
    }
  }
}
