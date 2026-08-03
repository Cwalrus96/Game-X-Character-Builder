import {
  buildBuilderWithPatch,
  previewBuilderChange,
  summarizeDependencyRemovals,
} from "../core/builder-dependencies.js";

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

function clonePlainObject(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlainObject(item));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = clonePlainObject(child);
  return out;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => String(message || "").trim())
    .filter(Boolean);
}

export class BuilderPage {
  constructor({
    stepId = "",
    getSaveContext = null,
    getGameData = null,
    getBuilder = null,
    onWorkingBuilderChange = null,
    confirmDependencyPreview = null,
    applyReconciledBuilder = null,
    filterImmediateWarnings = null,
  } = {}) {
    this.stepId = stepId;
    this.getSaveContext = typeof getSaveContext === "function" ? getSaveContext : () => ({});
    this.getGameData = typeof getGameData === "function" ? getGameData : () => null;
    this.getBuilder = typeof getBuilder === "function" ? getBuilder : () => ({});
    this.onWorkingBuilderChange = typeof onWorkingBuilderChange === "function" ? onWorkingBuilderChange : null;
    this.confirmDependencyPreview = typeof confirmDependencyPreview === "function" ? confirmDependencyPreview : null;
    this.applyReconciledBuilder = typeof applyReconciledBuilder === "function" ? applyReconciledBuilder : null;
    this.filterImmediateWarnings = typeof filterImmediateWarnings === "function" ? filterImmediateWarnings : null;
    this.widgets = new Map();
    this.workingBuilder = null;
  }

  hydrateBuilder(builder = {}) {
    this.workingBuilder = clonePlainObject(isPlainObject(builder) ? builder : {});
    return this.workingBuilder;
  }

  getWorkingBuilder() {
    if (!this.workingBuilder) this.hydrateBuilder(this.getBuilder());
    return this.workingBuilder;
  }

  setWorkingBuilder(builder = {}, { notify = true } = {}) {
    this.workingBuilder = clonePlainObject(isPlainObject(builder) ? builder : {});
    if (notify) this.onWorkingBuilderChange?.(this.workingBuilder);
    return this.workingBuilder;
  }

  applyPatchToWorkingBuilder(patch = {}, { notify = true } = {}) {
    return this.setWorkingBuilder(buildBuilderWithPatch(this.getWorkingBuilder(), patch), { notify });
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

  getActiveWidgets({ includeDynamic = true } = {}) {
    return Array.from(this.widgets.values())
      .filter((widget) => widget.enabled !== false)
      .filter((widget) => includeDynamic || widget.scope !== "dynamic");
  }

  previewChoiceChange(patch = {}, extraContext = {}) {
    const gameData = extraContext.gameData || this.getGameData();
    const builder = extraContext.builder || this.getWorkingBuilder();
    return previewBuilderChange(gameData, builder, patch);
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
    const confirmationWarnings = normalizeMessages(
      this.filterImmediateWarnings
        ? this.filterImmediateWarnings(preview, { widget, patch: proposedPatch })
        : summarizeDependencyRemovals(preview.changes),
    );
    const errors = normalizeMessages(preview.errors);

    // Validation errors are never confirmable. Reject before invoking a
    // confirmation callback so a permissive page handler cannot apply them.
    if (errors.length || preview.ok === false) {
      return {
        ok: false,
        reason: "validation-error",
        preview,
        confirmationWarnings,
        errors,
      };
    }

    if (confirmationWarnings.length) {
      // A destructive reconciliation must fail closed when the page cannot
      // present a confirmation prompt. The unused immediate=false path also
      // blocks rather than applying a warned change silently.
      if (!immediate || !this.confirmDependencyPreview) {
        return {
          ok: false,
          reason: "confirmation-required",
          preview,
          confirmationWarnings,
          errors,
        };
      }

      const ok = await this.confirmDependencyPreview({
        preview,
        warnings: confirmationWarnings,
        errors,
        widget,
        patch: proposedPatch,
      });
      if (!ok) {
        return {
          ok: false,
          reason: "cancelled",
          preview,
          confirmationWarnings,
          errors,
        };
      }
    }

    if (applyReconciledState) {
      this.setWorkingBuilder(preview.reconciledBuilder);
      this.applyReconciledBuilder?.(preview.reconciledBuilder, preview);
      for (const widget of this.getActiveWidgets()) {
        widget.applyReconciledState?.(preview.reconciledBuilder, { preview, page: this });
      }
    }
    if (typeof applyWidgetChange === "function") applyWidgetChange(preview);
    return {
      ok: true,
      preview,
      confirmationWarnings,
      errors,
    };
  }

  setWidgetsEnabled(enabled, { scope = "" } = {}) {
    for (const widget of this.widgets.values()) {
      if (scope && widget.scope !== scope) continue;
      if (enabled) widget.enable?.();
      else widget.disable?.();
    }
  }
}
