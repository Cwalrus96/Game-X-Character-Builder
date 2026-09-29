import { BuilderWidget } from "./builder-widget.js?v=choices4";
import { escapeHtml } from "../../core/data-sanitization.js";

/** Shared interaction lifecycle. The injected action owns intent, never this class. */
export class InteractiveWidget extends BuilderWidget {
  constructor(page, options = {}) {
    super(page, options);
    this.busy = false;
    this.error = "";
    this.destroyed = false;
  }
  get disabled() { return this.busy || !this.enabled; }
  errorHtml() { return this.error ? `<p class="error" role="alert">${escapeHtml(this.error)}</p>` : ""; }

  async submitChange(action, { focus = null, onAccepted = null, onRejected = null, message = "This change could not be applied." } = {}) {
    if (this.disabled || this.destroyed) return { ok: false, reason: "busy" };
    this.busy = true;
    this.error = "";
    this.render();
    let result;
    try {
      // Paint the busy state and finish the input event before graph work and
      // catalogue refreshes. Large builds must not trap the native control event.
      if (typeof requestAnimationFrame === "function") await new Promise(resolve => requestAnimationFrame(resolve));
      if (this.destroyed) return { ok: false, reason: "cancelled" };
      result = await action();
      if (result?.ok === false && result.reason !== "cancelled") this.error = result.errors?.join(" ") || message;
    } catch (error) {
      this.error = error.message || message;
      result = { ok: false, errors: [this.error], error };
    } finally {
      this.busy = false;
      if (!this.destroyed) this.render();
    }
    if (result?.ok === false) onRejected?.(result);
    else onAccepted?.();
    // Proposal refreshes may replace this widget, even after rejection.
    const current = this.page?.widgets?.get?.(this.id) || this;
    if (current !== this && this.error && !current.destroyed) {
      current.error = this.error;
      current.render();
    }
    focus?.(current);
    return result;
  }
  applyReconciledState() { if (!this.destroyed) this.render(); }
  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }
  destroy(options) { this.destroyed = true; super.destroy(options); }
}
