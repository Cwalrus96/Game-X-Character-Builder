import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { SetPrimaryAttribute } from "../../core/character-commands.js?v=wpe1";
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
    this.selectEl.innerHTML = `<option value="">- Choose -</option>` + (Array.isArray(options) ? options : [])
      .map((key) => {
        const value = sanitizeText(key, { maxLen: 32, collapse: true });
        const label = sanitizeText(this.getOptionLabel(key), { maxLen: 120, collapse: true });
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    this.selectEl.value = selectedValue;
    if (!this.changeHandlerBound) {
      this.selectEl.addEventListener("change", async () => {
        const previousValue = sanitizeText(this.getValue(), { maxLen: 32, collapse: true });
        const nextValue = this.value();
        const result = await this.page?.requestCharacterCommand?.(this, SetPrimaryAttribute(nextValue), {
          applyWidgetChange: (proposal) => {
            const acceptedValue = proposal?.reconciled?.builder?.primaryAttribute ?? nextValue;
            this.setValue(acceptedValue);
            if (this.selectEl) this.selectEl.value = acceptedValue;
          },
        });
        if (result && !result.ok && this.selectEl) this.selectEl.value = previousValue;
        if (!this.page?.requestCharacterCommand) this.setValue(nextValue);
      });
      this.changeHandlerBound = true;
    }
    return this.selectEl;
  }
}
