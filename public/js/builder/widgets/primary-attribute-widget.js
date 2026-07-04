import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { BuilderWidget } from "./builder-widget.js";

export class PrimaryAttributeWidget extends BuilderWidget {
  constructor(page, {
    selectEl,
    getOptions = null,
    getOptionLabel = null,
    getValue = null,
    setValue = null,
    scope = "page",
  } = {}) {
    super(page, { id: "primary-attribute-choice", scope });
    this.selectEl = selectEl || null;
    this.getOptions = typeof getOptions === "function" ? getOptions : () => [];
    this.getOptionLabel = typeof getOptionLabel === "function" ? getOptionLabel : (key) => key;
    this.getValue = typeof getValue === "function" ? getValue : () => "";
    this.setValue = typeof setValue === "function" ? setValue : () => {};
    this.changeHandlerBound = false;
    this.element = this.selectEl;
    this.render();
  }

  value() {
    return sanitizeText(this.selectEl?.value || this.getValue(), { maxLen: 32, collapse: true });
  }

  getSavePatch() {
    return {
      "builder.primaryAttribute": this.value(),
    };
  }

  render() {
    if (!this.selectEl) return null;
    const options = this.getOptions();
    const selectedValue = sanitizeText(this.getValue(), { maxLen: 32, collapse: true });
    this.selectEl.innerHTML = (Array.isArray(options) ? options : [])
      .map((key) => {
        const value = sanitizeText(key, { maxLen: 32, collapse: true });
        const label = sanitizeText(this.getOptionLabel(key), { maxLen: 120, collapse: true });
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    this.selectEl.value = selectedValue;
    if (!this.selectEl.value && this.selectEl.options.length) {
      this.selectEl.selectedIndex = 0;
      this.setValue(this.value());
    }
    if (!this.changeHandlerBound) {
      this.selectEl.addEventListener("change", () => {
        this.setValue(this.value());
      });
      this.changeHandlerBound = true;
    }
    return this.selectEl;
  }
}
