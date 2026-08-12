import {
  AddBond,
  RemoveBond,
  SetBackgroundKeystones,
  UpdateBond,
} from "../../core/character-commands.js?v=wpe5";
import { getBondAllocationState } from "../../core/bond-rules.js?v=wpe5";
import { sanitizeText } from "../../core/data-sanitization.js";

function bondId() {
  if (globalThis.crypto?.randomUUID) return `bond:user:${globalThis.crypto.randomUUID()}`;
  const bytes = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(bytes);
  return `bond:user:${Date.now().toString(36)}:${Array.from(bytes).join("-")}`;
}

function rankOptions(selected, maximum) {
  const options = [];
  for (let rank = 1; rank <= 6; rank += 1) {
    options.push(`<option value="${rank}"${String(rank) === String(selected) ? " selected" : ""}${rank > maximum && String(rank) !== String(selected) ? " disabled" : ""}>${rank}</option>`);
  }
  return options.join("");
}

export class BondsKeystonesWidget {
  constructor(page, { elements, idFactory = bondId, onRejected = null } = {}) {
    this.id = "bonds-keystones";
    this.scope = "bonds-keystones";
    this.page = page;
    this.elements = elements;
    this.idFactory = idFactory;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.character = page.getCharacter();
    this.busy = false;
    this.onAdd = () => this.#submit(AddBond({ bondId: this.idFactory(), name: "", rank: "1", keystone: "" }));
    elements.addBondBtn.addEventListener("click", this.onAdd);
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
    this.#setDisabled(true);
    try {
      const result = await this.page.requestCharacterCommand(this, command);
      if (!result.ok) this.onRejected?.(result);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  #setDisabled(disabled) {
    for (const input of this.elements.bondList.querySelectorAll("input, select, button")) input.disabled = disabled;
    this.elements.addBondBtn.disabled = disabled;
    this.elements.backgroundKeystone1.disabled = disabled;
    this.elements.backgroundKeystone2.disabled = disabled;
  }

  #updateBond(bondIdValue, field, value) {
    const maxLen = field === "name" ? 96 : field === "keystone" ? 400 : 8;
    const normalized = sanitizeText(value, { maxLen, collapse: true });
    return this.#submit(UpdateBond(bondIdValue, { [field]: normalized }));
  }

  #setBackground() {
    const keystones = [this.elements.backgroundKeystone1.value, this.elements.backgroundKeystone2.value]
      .map((value) => sanitizeText(value, { maxLen: 400, collapse: true }))
      .filter(Boolean);
    return this.#submit(SetBackgroundKeystones(keystones));
  }

  #renderBonds(allocation) {
    const { bondList, bondRowTemplate } = this.elements;
    bondList.innerHTML = "";
    if (!allocation.bonds.length) {
      const empty = document.createElement("div");
      empty.className = "builderItem muted";
      empty.textContent = `No bonds added yet. You may add up to your Heart score (${allocation.userBondCapacity}).`;
      bondList.append(empty);
      return;
    }
    for (const record of allocation.bonds) {
      const fragment = document.importNode(bondRowTemplate.content, true);
      const row = fragment.querySelector("[data-bond-row]");
      const name = fragment.querySelector('[data-field="name"]');
      const rank = fragment.querySelector('[data-field="rank"]');
      const keystone = fragment.querySelector('[data-field="keystone"]');
      const remove = fragment.querySelector('[data-action="remove"]');
      row.dataset.bondId = record.bondId;
      name.value = record.name;
      rank.innerHTML = rankOptions(record.rank, record.maximumRank);
      rank.disabled = this.busy || record.sourceOwned;
      rank.title = record.sourceOwned ? "This rank is supplied by the granting feature." : "";
      keystone.value = record.keystone;
      remove.disabled = this.busy || record.sourceOwned;
      remove.textContent = record.sourceOwned ? "Granted" : "Remove";
      name.addEventListener("change", () => this.#updateBond(record.bondId, "name", name.value));
      rank.addEventListener("change", () => this.#updateBond(record.bondId, "rank", rank.value));
      keystone.addEventListener("change", () => this.#updateBond(record.bondId, "keystone", keystone.value));
      if (!record.sourceOwned) remove.addEventListener("click", () => this.#submit(RemoveBond(record.bondId)));
      bondList.append(fragment);
    }
  }

  render() {
    const allocation = getBondAllocationState(this.character.builder);
    this.elements.levelValue.textContent = String(allocation.level);
    this.elements.heartValue.textContent = String(allocation.heart);
    this.elements.bondRankCapValue.textContent = String(allocation.rankCap);
    this.elements.bondCountValue.textContent = `${allocation.userBondCount} / ${allocation.userBondCapacity}${allocation.sourceBondCount ? ` + ${allocation.sourceBondCount} granted` : ""}`;
    this.elements.bondStatusHint.textContent = `Up to ${allocation.userBondCapacity} Heart-based bond${allocation.userBondCapacity === 1 ? "" : "s"}`;
    this.elements.bondRulesHelp.textContent = `You may create up to ${allocation.userBondCapacity} bond${allocation.userBondCapacity === 1 ? "" : "s"} from Heart. Feature-granted bonds are additional. User-created bond ranks use the level ${allocation.level} cap of ${allocation.rankCap}.`;
    this.elements.bondCountHelp.textContent = "Bonds granted by an active feature keep their source-defined rank and cannot be removed here; change the granting source instead.";
    this.elements.addBondBtn.disabled = this.busy || allocation.userBondRemaining <= 0;
    this.#renderBonds(allocation);
    const background = [...this.character.builder.backgroundKeystones, "", ""];
    this.elements.backgroundKeystone1.value = background[0];
    this.elements.backgroundKeystone2.value = background[1];
    this.elements.backgroundKeystone1.disabled = this.busy;
    this.elements.backgroundKeystone2.disabled = this.busy;
    this.elements.backgroundKeystone1.onchange = () => this.#setBackground();
    this.elements.backgroundKeystone2.onchange = () => this.#setBackground();
  }

  destroy({ unregister = true } = {}) {
    this.elements.addBondBtn.removeEventListener("click", this.onAdd);
    this.elements.backgroundKeystone1.onchange = null;
    this.elements.backgroundKeystone2.onchange = null;
    if (unregister) this.page.unregisterWidget(this);
  }
}
