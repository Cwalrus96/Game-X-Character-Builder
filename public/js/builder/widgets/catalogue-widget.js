import { InteractiveWidget } from "./interactive-widget.js";
import { SingleChoiceCatalogue, MultipleChoiceCatalogue, choiceExpansionFor } from "./choice-catalogue.js?v=choices5";
import { TextChoiceField, SelectChoiceField } from "./choice-field.js";

/** Shared catalogue interaction, specialized by domains and composed from controls. */
export class CatalogueWidget extends InteractiveWidget {
  constructor(page, { element = null, expandedChoices = choiceExpansionFor(page), ...options } = {}) {
    super(page, options);
    this.element = element;
    this.expandedChoices = expandedChoices;
    this.catalogues = new Map();
    this.detailFields = new Map();
    this.choiceRoots = new Set();
    this.onCatalogueClick = event => this.toggleCatalogue(event);
    this.onCatalogueChange = event => this.changeCatalogue(event);
    if (element) this.addChoiceRoot(element);
  }
  addChoiceRoot(root) {
    if (!root || this.choiceRoots.has(root)) return;
    this.choiceRoots.add(root);
    root.addEventListener("click", this.onCatalogueClick);
    root.addEventListener("change", this.onCatalogueChange);
  }
  beginChoices() { this.catalogues.clear(); this.detailFields.clear(); this.element?.setAttribute?.("aria-busy", String(this.busy)); }
  renderDetailField({ id, value, onChange, disabled = false, ...config }) {
    const Field = config.options ? SelectChoiceField : TextChoiceField;
    const field = new Field({ ...config, id: `${encodeURIComponent(id)}:field`, data: { "choice-owner": this.id, "choice-field": id } });
    this.detailFields.set(id, { field, value, onChange, disabled: this.disabled || disabled });
    return field.render({ value, disabled: this.disabled || disabled });
  }
  renderChoice(options, { multiple = false } = {}) {
    const Catalogue = multiple ? MultipleChoiceCatalogue : SingleChoiceCatalogue;
    const catalogue = new Catalogue({ ...options, owner: this.id, expandedChoices: this.expandedChoices });
    catalogue.disabled = this.disabled || options.disabled;
    this.catalogues.set(catalogue.id, catalogue);
    return catalogue.render({ disabled: catalogue.disabled, browseDisabled: this.disabled });
  }
  toggleCatalogue(event) {
    const target = event.target;
    if (this.disabled || target?.dataset?.choiceOwner !== this.id) return;
    const catalogue = this.catalogues.get(target.dataset.choiceToggle);
    if (!catalogue) return;
    catalogue.toggle();
    this.render();
    this.findChoiceControl(`[data-choice-toggle="${catalogue.id.replaceAll('"', '\\"')}"]`)?.focus?.();
  }
  findChoiceControl(selector) {
    for (const root of this.choiceRoots) { const found = root.querySelector?.(selector); if (found) return found; }
  }
  focusChoice(id) {
    const selector = `[data-choice-id="${String(id).replaceAll('"', '\\"')}"]`;
    (this.findChoiceControl(`${selector}:checked`) || this.findChoiceControl(selector))?.focus?.();
  }
  async changeCatalogue(event) {
    const target = event.target;
    if (this.disabled || target?.dataset?.choiceOwner !== this.id) return;
    const detail = this.detailFields.get(target.dataset.choiceField);
    if (detail) {
      if (detail.disabled || target.value === detail.value) return;
      return this.submitChange(() => detail.onChange(detail.field.normalize(target.value)), {
        focus: current => current.findChoiceControl(`[data-choice-field="${target.dataset.choiceField.replaceAll('"', '\\"')}"]`)?.focus?.(),
        onRejected: result => this.onRejected?.(result),
      });
    }
    const catalogue = this.catalogues.get(target.dataset.choiceId);
    if (!catalogue || catalogue.disabled) return;
    const option = catalogue.options.find(option => option.key === target.value);
    if (option?.disabled || (target.value && !option) || (!target.value && catalogue.allowEmpty === false)) return;
    if (catalogue.inputType === "radio" && catalogue.value === target.value) return;
    if (catalogue.inputType === "checkbox" && catalogue.isSelected(target.value) === target.checked) return;
    return this.submitChange(() => catalogue.change(target.value, target.checked), {
      focus: current => current.focusChoice(catalogue.id),
      onAccepted: () => this.onChoiceAccepted?.(), onRejected: result => this.onRejected?.(result),
    });
  }
  destroy(options) {
    for (const root of this.choiceRoots) {
      root.removeEventListener("click", this.onCatalogueClick);
      root.removeEventListener("change", this.onCatalogueChange);
    }
    this.catalogues.clear(); this.detailFields.clear(); this.choiceRoots.clear();
    super.destroy(options);
  }
}
