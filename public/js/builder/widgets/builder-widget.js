export class BuilderWidget {
  constructor(page, { id = "", scope = "dynamic" } = {}) {
    this.page = page || null;
    this.id = id;
    this.scope = scope;
    this.enabled = true;
    this.element = null;
    this.page?.registerWidget?.(this);
  }

  render() {
    return this.element;
  }

  getSavePatch() {
    return {};
  }

  validate() {
    return [];
  }

  enable() {
    this.enabled = true;
    if (this.element) {
      this.element.querySelectorAll("input, select, textarea, button").forEach((control) => {
        control.disabled = false;
      });
    }
  }

  disable({ clear = false } = {}) {
    this.enabled = false;
    if (this.element) {
      this.element.querySelectorAll("input, select, textarea, button").forEach((control) => {
        if (clear && (control.type === "checkbox" || control.type === "radio")) control.checked = false;
        if (clear && control.tagName === "SELECT") control.value = "";
        control.disabled = true;
      });
    }
  }

  destroy({ unregister = true } = {}) {
    this.element?.remove?.();
    this.element = null;
    if (unregister) this.page?.unregisterWidget?.(this);
  }
}
