import { clampLevel } from "../../core/character-rules.js";
import { SetLevel } from "../../core/character-commands.js?v=wpe1";
import { BuilderWidget } from "./builder-widget.js";

export class LevelChoiceWidget extends BuilderWidget {
  constructor(page, {
    selectEl,
    getValue = null,
    setValue = null,
    onChange = null,
    scope = "page",
  } = {}) {
    super(page, { id: "level-choice", scope });
    this.selectEl = selectEl || null;
    this.getValue = typeof getValue === "function" ? getValue : () => 1;
    this.setValue = typeof setValue === "function" ? setValue : () => {};
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.element = this.selectEl;
    this.render();
  }

  value() {
    return clampLevel(this.selectEl?.value || this.getValue());
  }

  getSavePatch() {
    return {
      "builder.level": this.value(),
    };
  }

  render() {
    if (!this.selectEl) return null;
    const selectedValue = String(clampLevel(this.getValue()));
    this.selectEl.innerHTML = Array.from({ length: 12 }, (_, index) => index + 1)
      .map((level) => `<option value="${level}">${level}</option>`)
      .join("");
    this.selectEl.value = selectedValue;
    this.selectEl.addEventListener("change", async () => {
      const previousValue = clampLevel(this.getValue());
      const nextValue = this.value();
      if (nextValue === previousValue) return;

      const result = await this.page?.requestCharacterCommand?.(this, SetLevel(nextValue), {
        applyWidgetChange: (proposal) => {
          const acceptedValue = proposal?.reconciled?.builder?.level ?? nextValue;
          this.setValue(acceptedValue);
          this.onChange?.(acceptedValue, proposal);
        },
      });

      if (!result?.ok) this.selectEl.value = String(previousValue);
    });
    return this.selectEl;
  }
}
