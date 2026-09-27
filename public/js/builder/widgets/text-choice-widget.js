import { InteractiveWidget } from "./interactive-widget.js";
import { KeystoneField } from "./choice-field.js";

export class TextChoiceWidget extends InteractiveWidget {
  constructor(page, { field, mount, getValue, onChange, onAccepted, onRejected, documentRef = globalThis.document, ...options }) {
    super(page, options);
    Object.assign(this, { field, getValue, onChange, onAccepted, onRejected, documentRef });
    this.element = mount || documentRef.createElement("div");
    this.element.className = "textChoiceWidget";
    this.changeHandler = event => this.change(event);
    this.element.addEventListener("change", this.changeHandler);
    this.render();
  }
  change(event) {
    if (this.disabled || event.target?.id !== this.field.id) return;
    const value = this.field.normalize(event.target.value);
    if (value === this.getValue()) { this.render(); return; }
    return this.submitChange(() => this.onChange(value), {
      onAccepted: this.onAccepted, onRejected: this.onRejected,
      focus: current => (this.documentRef?.getElementById?.(this.field.id) || (!current.destroyed && current.element?.querySelector?.("textarea, input")))?.focus?.(),
    });
  }
  render() {
    this.element.setAttribute?.("aria-busy", String(this.busy));
    this.element.innerHTML = this.field.render({ value: this.getValue(), disabled: this.disabled, error: this.error });
    return this.element;
  }
  destroy(options) {
    this.element.removeEventListener("change", this.changeHandler);
    super.destroy(options);
  }
}

/** Every Keystone uses this widget; only the injected binding differs. */
export class KeystoneWidget extends TextChoiceWidget {
  constructor(page, { id, label, help = "", ...options }) {
    super(page, { ...options, id, field: new KeystoneField({ id: `${id}:text`, label, help }) });
  }
}
