import { SetAttributeValue } from "../../core/character-commands.js?v=wpe3";
import {
  ATTR_KEYS,
  ATTR_LABELS,
  getAttributeAllocationState,
} from "../../core/character-rules.js?v=wpe3";

export class AttributesWidget {
  constructor(page, {
    id = "attributes",
    scope = "attributes",
    elements,
    rows,
    onRejected = null,
  } = {}) {
    this.id = id;
    this.scope = scope;
    this.page = page;
    this.elements = elements;
    this.rows = rows;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.character = page.getCharacter();
    this.busy = false;
    this.onChange = (event) => this.#handleChange(event);
    for (const { input } of rows) input.addEventListener("change", this.onChange);
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState(character) {
    this.character = character;
    this.render();
  }

  async #handleChange(event) {
    const row = this.rows.find((entry) => entry.input === event.currentTarget);
    if (!row || this.busy) return;
    const value = Number(event.currentTarget.value);
    if (!Number.isInteger(value)) {
      this.render();
      return;
    }
    this.busy = true;
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this, SetAttributeValue(row.key, value));
      if (!result.ok) this.onRejected?.(result);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  render() {
    const builder = this.character.builder;
    const level = builder.level;
    const primary = builder.primaryAttribute;
    const attributes = builder.attributes;
    const allocation = getAttributeAllocationState({ level, primaryAttribute: primary, attributes });
    const { capacity, remaining } = allocation;

    this.elements.levelLabel.textContent = String(level);
    this.elements.primaryLabel.textContent = ATTR_LABELS[primary] || "—";
    this.elements.points.textContent = String(capacity);
    this.elements.remaining.textContent = String(remaining);
    this.elements.remainingPill.classList.toggle("danger", remaining < 0);
    this.elements.remainingPill.classList.toggle("ok", remaining === 0);

    for (const { key, row, input } of this.rows) {
      const isPrimary = key === primary;
      const current = attributes[key];
      const limit = allocation.limits[key];

      row.classList.toggle("primary", isPrimary);
      row.classList.toggle("zero", current === 0);
      input.value = String(current);
      input.min = String(limit.minimum);
      input.max = String(limit.maximumAssignable);
      input.disabled = !primary || this.busy;

      const name = row.querySelector(".attrName");
      name?.querySelector(".primaryTag")?.remove();
      if (isPrimary && name) {
        const tag = document.createElement("sub");
        tag.className = "primaryTag";
        tag.textContent = "(Primary)";
        name.appendChild(tag);
      }
    }

    const primaryCap = primary ? allocation.limits[primary].cap : allocation.finalCap;
    const sampleOther = ATTR_KEYS.find((key) => key !== primary) || ATTR_KEYS[0];
    const otherCap = allocation.limits[sampleOther].cap;
    this.elements.capPrimary.textContent = String(primaryCap);
    this.elements.capOther.textContent = String(otherCap);
    this.elements.capNote.style.display = level <= 2 && primary ? "" : "none";
    this.elements.capNote.textContent = level <= 2 && primary
      ? `At level ${level}, your Primary Attribute can reach the normal cap (${allocation.finalCap}), but other attributes are capped at ${otherCap}.`
      : "";
    this.elements.zeroNote.style.display = ATTR_KEYS.some((key) => attributes[key] === 0) ? "" : "none";
    this.elements.zeroNote.textContent = this.elements.zeroNote.style.display === "none"
      ? ""
      : "Warning: One or more attributes are 0. This may be risky depending on the campaign.";
  }

  destroy({ unregister = true } = {}) {
    for (const { input } of this.rows) input.removeEventListener("change", this.onChange);
    if (unregister) this.page.unregisterWidget(this);
  }
}
