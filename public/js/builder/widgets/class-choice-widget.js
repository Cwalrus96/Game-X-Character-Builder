import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { BuilderWidget } from "./builder-widget.js";

function compareClassNames(a, b) {
  return String(a?.name || a?.classKey || "").localeCompare(String(b?.name || b?.classKey || ""));
}

export class ClassChoiceWidget extends BuilderWidget {
  constructor(page, {
    selectEl,
    classes = [],
    getValue = null,
    setValue = null,
    getClassInfo = null,
    onChange = null,
    scope = "page",
  } = {}) {
    super(page, { id: "class-choice", scope });
    this.selectEl = selectEl || null;
    this.classes = Array.isArray(classes) ? classes.slice().sort(compareClassNames) : [];
    this.getValue = typeof getValue === "function" ? getValue : () => "";
    this.setValue = typeof setValue === "function" ? setValue : () => {};
    this.getClassInfo = typeof getClassInfo === "function" ? getClassInfo : () => ({ ok: true });
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.element = this.selectEl;
    this.render();
  }

  value() {
    return sanitizeText(this.selectEl?.value || this.getValue(), { maxLen: 64, collapse: true });
  }

  getSavePatch() {
    return {
      "builder.classKey": this.value(),
    };
  }

  render() {
    if (!this.selectEl) return null;
    const selectedValue = sanitizeText(this.getValue(), { maxLen: 64, collapse: true });
    this.selectEl.innerHTML = `<option value="">- Choose -</option>` + this.classes
      .map((classEntry) => {
        const classKey = sanitizeText(classEntry?.classKey, { maxLen: 64, collapse: true });
        const info = this.getClassInfo(classEntry);
        const label = `${sanitizeText(classEntry?.name || classKey, { maxLen: 200, collapse: true })}${info?.ok ? "" : " (Coming Soon)"}`;
        return `<option value="${escapeHtml(classKey)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    if (selectedValue) this.selectEl.value = selectedValue;
    this.selectEl.addEventListener("change", () => {
      this.setValue(this.value());
      this.onChange?.(this.value());
    });
    return this.selectEl;
  }
}
