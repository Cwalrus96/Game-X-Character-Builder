import { SetOrigin, SetOriginKeystone } from "../../core/character-commands.js?v=wpe4";
import { escapeHtml } from "../../core/data-sanitization.js";
import { getOriginSelectionState } from "../../core/origin-rules.js";
import { appendRuleDetails } from "./rule-details.js";
import { KeystoneWidget } from "./text-choice-widget.js";

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
  constructor(page, { gameData, elements, onRejected = null, renderTraitGrants = null } = {}) {
    this.id = "origin";
    this.scope = "origin";
    this.page = page;
    this.gameData = gameData;
    this.elements = elements;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.renderTraitGrants = typeof renderTraitGrants === "function" ? renderTraitGrants : null;
    this.childScope = "origin-traits";
    this.character = page.getCharacter();
    this.busy = false;
    this.onOriginChange = () => this.#setOrigin();
    elements.originSelect.addEventListener("change", this.onOriginChange);
    this.keystoneWidget = new KeystoneWidget(page, {
      id: "origin-keystone", label: "Origin Keystone", mount: elements.originKeystone, register: false,
      help: "Your character gets one Origin Keystone at character creation.",
      getValue: () => page.getCharacter().builder.originKeystone,
      onChange: value => page.requestCharacterCommand(this, SetOriginKeystone(value)), onRejected,
    });
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState(character) {
    this.character = character;
    this.render();
  }

  async #submit(command, focusControl = null) {
    if (this.busy) return;
    const activeControl = focusControl || document.activeElement;
    const restoreFocus = activeControl === this.elements.originSelect;
    this.busy = true;
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this, command);
      if (!result.ok) this.onRejected?.(result);
    } finally {
      this.busy = false;
      this.render();
      if (restoreFocus) activeControl.focus();
    }
  }

  #setOrigin() {
    return this.#submit(SetOrigin(this.elements.originSelect.value), this.elements.originSelect);
  }

  render() {
    this.page.clearWidgets?.({ scope: this.childScope });
    const state = getOriginSelectionState(this.gameData, this.character.builder);
    const { originSelect, originSummary, originDetails, originStatusHint } = this.elements;
    originSelect.innerHTML = '<option value="">Select an origin…</option>';
    for (const origin of state.options) {
      if (!origin.selectable && origin.key !== state.originKey) continue;
      const option = document.createElement("option");
      option.value = origin.key;
      option.textContent = origin.name;
      option.disabled = !origin.selectable;
      originSelect.appendChild(option);
    }
    originSelect.value = state.originKey;
    originSelect.disabled = this.busy;
    this.keystoneWidget.enabled = !this.busy;
    this.keystoneWidget.render();

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
      ? `<section class="builderItem"><div class="builderItemTitle">Features</div><div class="optionList" style="margin-top:8px;">${selected.features.map((feature, index) => `<div class="optionRow"><div><div class="optionTitle">${escapeHtml(feature.name)}</div><div class="optionDesc">${escapeHtml(feature.description)}</div><div data-origin-traits="${index}"></div></div></div>`).join("")}</div></section>`
      : "";
    originDetails.innerHTML = `${selected.description ? `<section class="builderItem"><div class="builderItemTitle">Description</div><div class="builderItemBody">${escapeHtml(selected.description)}</div></section>` : ""}${features}${renderList("Roleplay Questions", selected.questions)}${renderList("Higher Level Upgrades", selected.futureUpgrades)}${selected.examples.length ? `<section class="builderItem"><div class="builderItemTitle">Examples</div><div class="builderItemBody">${escapeHtml(selected.examples.join(", "))}</div></section>` : ""}`;
    const origin = (this.gameData.origins || []).find((entry) => entry.originKey === state.originKey);
    appendRuleDetails(originSummary, origin, { page: this.page, gameData: this.gameData, identity: `origin:${state.originKey}` });
    const directTraits = this.renderTraitGrants?.(origin, this.childScope);
    if (directTraits) originSummary.append(directTraits);
    (origin?.features || []).forEach((feature, index) => {
      const mount = originDetails.querySelector(`[data-origin-traits="${index}"]`);
      if (mount) appendRuleDetails(mount, feature, { page: this.page, gameData: this.gameData, identity: `origin:${state.originKey}:${feature.featureKey}` });
      const traits = mount && this.renderTraitGrants?.(feature, this.childScope);
      if (traits) mount.append(traits);
    });
  }

  destroy({ unregister = true } = {}) {
    this.page.clearWidgets?.({ scope: this.childScope });
    this.elements.originSelect.removeEventListener("change", this.onOriginChange);
    this.keystoneWidget.destroy();
    if (unregister) this.page.unregisterWidget(this);
  }
}
