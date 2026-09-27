import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { KEYSTONE_TEXT_LIMIT } from "../../core/keystone-rules.js";

/** Small fields compose into widgets without acquiring session ownership. */
export class ChoiceField {
  constructor({ id, label, help = "", data = {} }) { Object.assign(this, { id, label, help, data }); }
  dataAttributes() { return Object.entries(this.data).map(([key, value]) => ` data-${key}="${escapeHtml(value)}"`).join(""); }
  render({ disabled = false, error = "", ...state } = {}) {
    return `<div class="choiceField"><label class="label" for="${escapeHtml(this.id)}">${escapeHtml(this.label)}</label>${this.control({ ...state, disabled, error })}${this.help ? `<p class="help" id="${escapeHtml(this.id)}:help">${escapeHtml(this.help)}</p>` : ""}${error ? `<p class="error" role="alert" id="${escapeHtml(this.id)}:error">${escapeHtml(error)}</p>` : ""}</div>`;
  }
  accessibility(error) {
    const ids = [this.help && `${this.id}:help`, error && `${this.id}:error`].filter(Boolean);
    return `${ids.length ? ` aria-describedby="${escapeHtml(ids.join(" "))}"` : ""}${error ? ' aria-invalid="true"' : ""}`;
  }
}
export class TextChoiceField extends ChoiceField {
  constructor({ maxLength, placeholder = "", multiline = false, ...options }) { super(options); Object.assign(this, { maxLength, placeholder, multiline }); }
  normalize(value) { return sanitizeText(value, { maxLen: this.maxLength, collapse: true }); }
  control({ value = "", disabled, error }) {
    const attrs = `class="input" id="${escapeHtml(this.id)}" maxlength="${this.maxLength}" placeholder="${escapeHtml(this.placeholder)}"${this.dataAttributes()}${this.accessibility(error)}${disabled ? " disabled" : ""}`;
    return this.multiline ? `<textarea ${attrs} rows="3">${escapeHtml(value)}</textarea>` : `<input ${attrs} type="text" value="${escapeHtml(value)}">`;
  }
}
export class SelectChoiceField extends ChoiceField {
  constructor({ options = [], ...config }) { super(config); this.options = options; }
  normalize(value) {
    if (!this.options.some(option => option.value === value && !option.disabled)) throw new TypeError("Choose an available option.");
    return value;
  }
  control({ value = "", disabled, error }) {
    return `<select class="input" id="${escapeHtml(this.id)}"${this.dataAttributes()}${this.accessibility(error)}${disabled ? " disabled" : ""}>${this.options.map(option => `<option value="${escapeHtml(option.value)}"${option.value === value ? " selected" : ""}${option.disabled ? " disabled" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  }
}
export class KeystoneField extends TextChoiceField {
  constructor(options) { super({ ...options, maxLength: KEYSTONE_TEXT_LIMIT, multiline: true, placeholder: "Describe your Keystone…" }); }
}
