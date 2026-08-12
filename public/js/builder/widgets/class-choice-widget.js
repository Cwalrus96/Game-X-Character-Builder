import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { SetClass } from "../../core/character-commands.js?v=wpe1";
import { BuilderWidget } from "./builder-widget.js";

function compareClassNames(a, b) {
  return String(a?.name || a?.classKey || "").localeCompare(String(b?.name || b?.classKey || ""));
}

export function buildClassChangePatch(nextClassKey) {
  return {
    "builder.classKey": sanitizeText(nextClassKey, { maxLen: 64, collapse: true }),
  };
}

export class ClassChoiceWidget extends BuilderWidget {
  constructor(page, {
    selectEl,
    classes = [],
    getValue = null,
    setValue = null,
    getChangePatch = null,
    getClassInfo = null,
    onChange = null,
    scope = "page",
  } = {}) {
    super(page, { id: "class-choice", scope });
    this.selectEl = selectEl || null;
    this.classes = Array.isArray(classes) ? classes.slice().sort(compareClassNames) : [];
    this.getValue = typeof getValue === "function" ? getValue : () => "";
    this.setValue = typeof setValue === "function" ? setValue : () => {};
    this.getChangePatch = typeof getChangePatch === "function" ? getChangePatch : buildClassChangePatch;
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
    this.selectEl.addEventListener("change", async () => {
      const previousValue = sanitizeText(this.getValue(), { maxLen: 64, collapse: true });
      const nextValue = this.value();
      const result = await this.page?.requestCharacterCommand?.(this, SetClass(nextValue), {
        applyWidgetChange: (proposal) => {
          const acceptedValue = proposal?.reconciled?.builder?.classKey ?? nextValue;
          this.setValue(acceptedValue);
          if (this.selectEl) this.selectEl.value = acceptedValue;
          this.onChange?.(acceptedValue, proposal);
        },
      });
      if (result && !result.ok && this.selectEl) this.selectEl.value = previousValue;
      if (!this.page?.requestCharacterCommand) {
        this.setValue(nextValue);
        this.onChange?.(nextValue);
      }
    });
    return this.selectEl;
  }
}
