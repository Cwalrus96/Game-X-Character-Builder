import { SetOrigin, SetOriginKeystone } from "../../core/character-commands.js?v=wpe4";
import { sanitizeText, escapeHtml } from "../../core/data-sanitization.js";
import { getOriginSelectionState } from "../../core/origin-rules.js";

function statusLabel(status) {
  if (status === "playable") return "Playable";
  if (status === "draft") return "Draft";
  if (status === "incomplete") return "Incomplete";
  return "Unknown";
}

function renderList(title, items) {
  if (!items?.length) return "";
  return `<section class="builderItem"><div class="builderItemTitle">${escapeHtml(title)}</div><ul class="help" style="margin-top:8px; padding-left:18px;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

export class OriginWidget {
  constructor(page, { gameData, elements, onRejected = null } = {}) {
    this.id = "origin";
    this.scope = "origin";
    this.page = page;
    this.gameData = gameData;
    this.elements = elements;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.character = page.getCharacter();
    this.busy = false;
    this.onOriginChange = () => this.#setOrigin();
    this.onKeystoneChange = () => this.#setKeystone();
    elements.originSelect.addEventListener("change", this.onOriginChange);
    elements.originKeystone.addEventListener("change", this.onKeystoneChange);
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState(character) {
    this.character = character;
    this.render();
  }

  async #submit(command) {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this, command);
      if (!result.ok) this.onRejected?.(result);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  #setOrigin() {
    return this.#submit(SetOrigin(this.elements.originSelect.value));
  }

  #setKeystone() {
    const value = sanitizeText(this.elements.originKeystone.value, { maxLen: 400, collapse: true });
    return this.#submit(SetOriginKeystone(value));
  }

  render() {
    const state = getOriginSelectionState(this.gameData, this.character.builder);
    const { originSelect, originKeystone, originSummary, originDetails, originStatusHint } = this.elements;
    originSelect.innerHTML = '<option value="">Select an origin…</option>';
    for (const origin of state.options) {
      const option = document.createElement("option");
      option.value = origin.key;
      option.textContent = `${origin.name} — ${statusLabel(origin.status)}`;
      option.disabled = !origin.selectable;
      originSelect.appendChild(option);
    }
    originSelect.value = state.originKey;
    originSelect.disabled = this.busy;
    originKeystone.value = this.character.builder.originKeystone;
    originKeystone.disabled = this.busy;

    const selected = state.selected;
    if (!selected) {
      originSummary.textContent = "Select an origin to see its details.";
      originSummary.className = "builderItem muted";
      originDetails.innerHTML = "";
      originStatusHint.textContent = "";
      return;
    }
    originSummary.className = "builderItem";
    originSummary.innerHTML = `<div class="builderItemTitle">${escapeHtml(selected.name)}</div><div class="builderItemMeta">${escapeHtml(statusLabel(selected.status))}</div><div class="builderItemBody">${escapeHtml(selected.summary || selected.description)}</div>`;
    originStatusHint.textContent = statusLabel(selected.status);
    const features = selected.features.length
      ? `<section class="builderItem"><div class="builderItemTitle">Features</div><div class="optionList" style="margin-top:8px;">${selected.features.map((feature) => `<div class="optionRow"><div><div class="optionTitle">${escapeHtml(feature.name)}</div><div class="optionDesc">${escapeHtml(feature.description)}</div></div></div>`).join("")}</div></section>`
      : "";
    originDetails.innerHTML = `${selected.description ? `<section class="builderItem"><div class="builderItemTitle">Description</div><div class="builderItemBody">${escapeHtml(selected.description)}</div></section>` : ""}${features}${renderList("Roleplay Questions", selected.questions)}${renderList("Higher Level Upgrades", selected.futureUpgrades)}${selected.examples.length ? `<section class="builderItem"><div class="builderItemTitle">Examples</div><div class="builderItemBody">${escapeHtml(selected.examples.join(", "))}</div></section>` : ""}`;
  }

  destroy({ unregister = true } = {}) {
    this.elements.originSelect.removeEventListener("change", this.onOriginChange);
    this.elements.originKeystone.removeEventListener("change", this.onKeystoneChange);
    if (unregister) this.page.unregisterWidget(this);
  }
}

