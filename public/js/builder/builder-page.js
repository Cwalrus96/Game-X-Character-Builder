import { previewBuilderChange } from "../core/builder-dependencies.js";

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
  constructor({
    stepId = "",
    getSaveContext = null,
    getGameData = null,
    getBuilder = null,
    confirmDependencyPreview = null,
    applyReconciledBuilder = null,
    filterImmediateWarnings = null,
  } = {}) {
    this.stepId = stepId;
    this.getSaveContext = typeof getSaveContext === "function" ? getSaveContext : () => ({});
    this.getGameData = typeof getGameData === "function" ? getGameData : () => null;
    this.getBuilder = typeof getBuilder === "function" ? getBuilder : () => ({});
    this.confirmDependencyPreview = typeof confirmDependencyPreview === "function" ? confirmDependencyPreview : null;
    this.applyReconciledBuilder = typeof applyReconciledBuilder === "function" ? applyReconciledBuilder : null;
    this.filterImmediateWarnings = typeof filterImmediateWarnings === "function" ? filterImmediateWarnings : null;
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

  getDependencyParticipants({ includeDynamic = true } = {}) {
    return Array.from(this.widgets.values())
      .filter((widget) => widget.enabled !== false)
      .filter((widget) => includeDynamic || widget.scope !== "dynamic");
  }

  previewChoiceChange(patch = {}, extraContext = {}) {
    const gameData = extraContext.gameData || this.getGameData();
    const builder = extraContext.builder || this.getBuilder();
    const participants = extraContext.participants || this.getDependencyParticipants();
    return previewBuilderChange(gameData, builder, patch, { participants });
  }

  async requestChoiceChange(widget, patch = {}, {
    applyWidgetChange = null,
    applyReconciledState = true,
    immediate = true,
    context = {},
  } = {}) {
    const basePatch = this.getWidgetSavePatch({
      ...context,
      pendingWidget: widget,
      pendingPatch: patch,
    });
    const proposedPatch = mergePatch(basePatch, patch);
    const preview = this.previewChoiceChange(proposedPatch, context);
    const warnings = this.filterImmediateWarnings
      ? this.filterImmediateWarnings(preview, { widget, patch: proposedPatch })
      : (Array.isArray(preview.warnings) ? preview.warnings : []);
    const errors = Array.isArray(preview.errors) ? preview.errors : [];

    if (immediate && (warnings.length || errors.length)) {
      const ok = await this.confirmDependencyPreview?.({
        preview,
        warnings,
        errors,
        widget,
        patch: proposedPatch,
      });
      if (!ok) return { ok: false, preview };
    }

    if (applyReconciledState) {
      this.applyReconciledBuilder?.(preview.reconciledBuilder, preview);
      for (const participant of this.getDependencyParticipants()) {
        participant.applyReconciledState?.(preview.reconciledBuilder, { preview, page: this });
      }
    }
    if (typeof applyWidgetChange === "function") applyWidgetChange(preview);
    return { ok: true, preview };
  }

  setWidgetsEnabled(enabled, { scope = "" } = {}) {
    for (const widget of this.widgets.values()) {
      if (scope && widget.scope !== scope) continue;
      if (enabled) widget.enable?.();
      else widget.disable?.();
    }
  }
}
