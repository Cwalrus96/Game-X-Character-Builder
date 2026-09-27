import { escapeHtml } from "../../core/data-sanitization.js";

// Browsing state is page-local UI state, never character or save state.
const expandedByPage = new WeakMap();
export function choiceExpansionFor(page) {
  if (!page) return new Set();
  if (!expandedByPage.has(page)) expandedByPage.set(page, new Set());
  return expandedByPage.get(page);
}

/** Composed presentation, independent of the source of a choice or its Rules. */
export class ChoiceCatalogue {
  constructor({ id, owner, label, options = [], expandedChoices = new Set(), followUpHtml = "", help = "", onChange, emptyLabel = "No selection", placeholder = "Choose…" } = {}) {
    Object.assign(this, { id, owner, label, options, expandedChoices, followUpHtml, help, onChange, emptyLabel, placeholder });
  }
  get expanded() { return this.expandedChoices.has(this.id); }
  get domId() { return encodeURIComponent(this.id); }
  toggle() { if (this.expanded) this.expandedChoices.delete(this.id); else this.expandedChoices.add(this.id); }
  attributes() { return `data-choice-owner="${escapeHtml(this.owner)}" data-choice-id="${escapeHtml(this.id)}"`; }
  row(option, { disabled = false, detailed = this.expanded } = {}) {
    // Keep references outside the label: inspecting rules must never select an answer.
    return `<div class="choiceOption"><label class="optionRow">${this.input(option, disabled)}<div class="choiceOptionBody">${detailed && option.contentHtml ? option.contentHtml : `<span class="optionTitle">${escapeHtml(option.name)}</span>`}</div></label>${detailed ? option.referencesHtml || "" : ""}</div>`;
  }
  render({ disabled = false, browseDisabled = false } = {}) {
    return `<div class="builderChoice" data-catalogue="${escapeHtml(this.id)}"><div class="choiceHeader">
      <span class="label" id="${escapeHtml(this.domId)}:label">${escapeHtml(this.label)}</span>
      <button type="button" class="btn secondary choiceCatalogueToggle" data-choice-owner="${escapeHtml(this.owner)}" data-choice-toggle="${escapeHtml(this.id)}" aria-label="${this.expanded ? "Collapse" : "Expand"} ${escapeHtml(this.label)}" aria-expanded="${this.expanded}" aria-controls="${escapeHtml(this.domId)}:control"${browseDisabled ? " disabled" : ""}>${this.expanded ? "Collapse" : "Expand"}</button>
      </div>${this.selector(disabled)}${this.followUpHtml}${this.help ? `<p class="help">${escapeHtml(this.help)}</p>` : ""}</div>`;
  }
  input(option, disabled) {
    return `<input type="${this.inputType}" name="${escapeHtml(this.id)}" value="${escapeHtml(option.key)}" aria-label="${escapeHtml(option.name)}"${this.isSelected(option.key) ? " checked" : ""} ${this.attributes()}${disabled || option.disabled ? " disabled" : ""}>`;
  }
  list(disabled, options = this.options) {
    return `<fieldset class="optionList choiceCatalogue" id="${escapeHtml(this.domId)}:control" aria-labelledby="${escapeHtml(this.domId)}:label"${disabled ? " disabled" : ""}>${options.map(option => this.row(option, { disabled })).join("")}</fieldset>`;
  }
}

export class SingleChoiceCatalogue extends ChoiceCatalogue {
  constructor(options) { super(options); this.value = options.value || ""; this.allowEmpty = options.allowEmpty !== false; this.inputType = "radio"; }
  isSelected(key) { return key === this.value; }
  selector(disabled) {
    const options = this.allowEmpty ? [{ key: "", name: this.emptyLabel }, ...this.options] : this.options;
    if (this.expanded) return this.list(disabled, options);
    return `<select class="input" id="${escapeHtml(this.domId)}:control" aria-labelledby="${escapeHtml(this.domId)}:label" ${this.attributes()}${disabled ? " disabled" : ""}>${options.map(option => `<option value="${escapeHtml(option.key)}"${this.isSelected(option.key) ? " selected" : ""}${option.disabled ? " disabled" : ""}>${escapeHtml(option.key ? option.name : this.value ? this.emptyLabel : this.placeholder)}</option>`).join("")}</select>`;
  }
  change(key) {
    const option = this.options.find(option => option.key === key);
    if (key === this.value || (key ? !option || option.disabled : !this.allowEmpty)) return;
    return this.onChange?.(key);
  }
}

export class MultipleChoiceCatalogue extends ChoiceCatalogue {
  constructor(options) { super(options); this.values = new Set(options.values || []); this.inputType = "checkbox"; }
  isSelected(key) { return this.values.has(key); }
  selector(disabled) { return this.list(disabled); }
  change(key, checked) {
    const option = this.options.find(option => option.key === key);
    if (!option || option.disabled || this.isSelected(key) === checked) return;
    return this.onChange?.(key, checked);
  }
}
