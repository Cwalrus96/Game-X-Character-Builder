import {
  AddWeapon,
  AddWeaponEnhancement,
  RemoveWeapon,
  RemoveWeaponEnhancement,
  UpdateWeapon,
  UpdateWeaponEnhancement,
} from "../../core/character-commands.js?v=wpe2";
import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import {
  createCharacterGrantCollection,
} from "../../core/game-data.js";
import { computeGrantedSkillsState } from "../../core/skill-rules.js";
import { isGameDataRecordSelectable } from "../../core/selection-rules.js";
import { isSourceOwnedWeapon } from "../../core/grants.js";
import { projectCharacterTraits } from "../../core/trait-projection.js";
import { renderGrantedWeaponHtml } from "../../core/weapon-grant-display.js?v=natural-weapons2";
import {
  MAX_WEAPON_SLOTS,
  computeEnhancementCapacity,
  computeTotalWeaponSlots,
  countPurchasedEnhancements,
  getEnhancementDef,
  getWeaponDef,
  getWeaponSkillRankCap,
  getWeaponSkillRanks,
  getSelectableWeaponBases,
  isEnhancementCompatible,
} from "../../core/weapon-utils.js";
import { EquipmentChoiceWidget } from "./equipment-choice-widget.js?v=choices5";

function id(prefix) {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${token}`;
}

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function rankOptions(minimum, maximum, selected) {
  const values = [];
  for (let rank = minimum; rank <= Math.max(minimum, maximum); rank += 1) {
    values.push(option(String(rank), `Rank ${rank}`, rank === selected));
  }
  return values.join("");
}

export class EquipmentWidget extends EquipmentChoiceWidget {
  constructor(page, {
    id: widgetId = "equipment",
    scope = "equipment",
    gameData,
    elements,
    onRejected = null,
  } = {}) {
    super(page, { id: widgetId, scope, element: elements.weaponList });
    this.gameData = gameData;
    this.elements = elements;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.showOutOfRank = false;
    this.draftWeaponKey = "";
    this.character = page.getCharacter();
    this.onClick = (event) => this.#handleClick(event);
    this.onChange = (event) => this.#handleChange(event);
    elements.addWeaponBtn.addEventListener("click", this.onClick);
    elements.weaponList.addEventListener("click", this.onClick);
    elements.weaponList.addEventListener("change", this.onChange);
    elements.showOutOfRank.addEventListener("change", this.onChange);
    this.addChoiceRoot(elements.weaponBaseSelect);
    this.render();
  }

  get weaponBases() {
    return Array.isArray(this.gameData?.weaponBases) ? this.gameData.weaponBases : [];
  }

  get weaponEnhancements() {
    return Array.isArray(this.gameData?.weaponEnhancements) ? this.gameData.weaponEnhancements : [];
  }

  get weapons() {
    return this.character?.builder?.weapons || [];
  }

  get grantedSkillState() {
    return computeGrantedSkillsState(this.gameData, this.character.builder);
  }

  get skillRanks() {
    return getWeaponSkillRanks(this.character.builder, this.grantedSkillState);
  }

  get grantedEnhancementSlots() {
    const collection = createCharacterGrantCollection(this.gameData, this.character.builder);
    return (collection.weaponEnhancementGrants || []).reduce((total, grant) => {
      const count = Number.parseInt(String(grant?.count ?? 1), 10);
      return total + (Number.isFinite(count) ? Math.max(0, count) : 1);
    }, 0);
  }

  applyReconciledState(character) {
    this.character = character;
    this.render();
  }

  async #request(command) {
    const activeId = globalThis.document?.activeElement?.id;
    return this.submitChange(() => this.page.requestCharacterCommand(this, command), {
      onRejected: this.onRejected, focus: () => { if (activeId) globalThis.document?.getElementById(activeId)?.focus(); },
    });
  }

  #visibleWeapons() {
    return getSelectableWeaponBases(this.weaponBases, { skillRanks: this.skillRanks, showOutOfRank: this.showOutOfRank });
  }

  #visibleEnhancements(weapon) {
    return this.weaponEnhancements.filter((enhancement) => (
      isGameDataRecordSelectable(enhancement)
      && (this.showOutOfRank || Number(enhancement?.minRank || 0) <= Number(weapon.rank || 0))
      && isEnhancementCompatible(enhancement, weapon, this.weaponBases, {
        gameData: this.gameData,
        builder: this.character.builder,
        grantedSkillState: this.grantedSkillState,
      })
    ));
  }

  #renderEnhancement(weapon, enhancement) {
    const sourceOwned = isSourceOwnedWeapon(weapon);
    const definition = getEnhancementDef(this.weaponEnhancements, enhancement.enhancementKey);
    const visible = this.#visibleEnhancements(weapon);
    if (definition && !visible.some((entry) => entry.enhancementKey === definition.enhancementKey)) visible.push(definition);
    const minimum = Number(definition?.minRank || 0);
    return `<div class="optionRow equipmentEnhancementRow">
      ${this.renderEnhancementChoice({ id: `${weapon.id}:${enhancement.id}`, options: visible, enhancement, definition, allowEmpty: false, disabled: sourceOwned,
        onChange: key => this.page.requestCharacterCommand(this, UpdateWeaponEnhancement(weapon.id, enhancement.id, { enhancementKey: key, rank: Number(getEnhancementDef(this.weaponEnhancements, key)?.minRank || 0), selections: {} })),
        onDetailChange: selections => this.page.requestCharacterCommand(this, UpdateWeaponEnhancement(weapon.id, enhancement.id, { selections })),
      })}
      <div class="equipmentGrid equipmentGrid--enhancement">
        <label class="label">Rank<select class="input" data-enhancement-rank data-weapon-id="${escapeHtml(weapon.id)}" data-enhancement-id="${escapeHtml(enhancement.id)}"${sourceOwned ? " disabled" : ""}>${rankOptions(minimum, Number(weapon.rank || 0), Number(enhancement.rank || minimum))}</select></label>
      </div>
      <button class="btn secondary" type="button" data-remove-enhancement data-weapon-id="${escapeHtml(weapon.id)}" data-enhancement-id="${escapeHtml(enhancement.id)}"${sourceOwned ? " disabled" : ""}>Remove</button>
    </div>`;
  }

  #renderWeapon(weapon) {
    const definition = getWeaponDef(this.weaponBases, weapon.weaponKey);
    const sourceOwned = isSourceOwnedWeapon(weapon);
    const cap = getWeaponSkillRankCap(definition, this.skillRanks);
    const minimum = Number(definition?.minRank || 0);
    const bases = this.#visibleWeapons();
    if (definition && !bases.some((entry) => entry.weaponKey === definition.weaponKey)) bases.push(definition);
    const enhancements = weapon.enhancements.map((entry) => this.#renderEnhancement(weapon, entry)).join("");
    return `<article class="optionRow equipmentWeaponRow">
      <div class="cardHeaderRow"><h3>${escapeHtml(weapon.customName || definition?.name || weapon.weaponKey)}</h3>${sourceOwned ? '<span class="pill">Source-owned</span>' : ""}</div>
      ${sourceOwned ? '<p class="help">Change this weapon through the class, feat, or other choice that granted it.</p>' : ""}
      ${this.renderWeaponChoice({ id: `${weapon.id}:base`, options: bases, weapon, weaponBases: this.weaponBases, rank: weapon.rank, allowEmpty: false, disabled: sourceOwned,
        onChange: key => this.#changeWeaponBase(weapon.id, key),
      })}
      <div class="equipmentGrid">
        <label class="label">Rank<select class="input" data-weapon-rank data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>${rankOptions(minimum, Math.max(minimum, cap), weapon.rank)}</select></label>
        <label class="label">Custom Name<input class="input" value="${escapeHtml(weapon.customName)}" data-weapon-name data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}></label>
      </div>
      <div class="cardHeaderRow"><h4>Enhancements</h4><button class="btn" type="button" data-add-enhancement data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>Add Enhancement</button></div>
      <div class="optionList">${enhancements || '<div class="emptyState emptyState--nested">No enhancements.</div>'}</div>
      <button class="btn secondary" type="button" data-remove-weapon data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>Remove Weapon</button>
    </article>`;
  }

  render() {
    this.beginChoices();
    const { elements } = this;
    const derived = projectCharacterTraits(this.character, this.gameData).weapons;
    const slots = computeTotalWeaponSlots(this.weapons, this.weaponBases);
    const enhancements = countPurchasedEnhancements(this.weapons);
    const capacity = computeEnhancementCapacity(this.weapons, this.grantedEnhancementSlots);
    elements.weaponCountValue.textContent = String(this.weapons.length + derived.length);
    elements.enhancementCountValue.textContent = `${enhancements} / ${capacity}`;
    elements.slotUsageValue.textContent = `${slots} / ${MAX_WEAPON_SLOTS}`;
    elements.slotUsagePill.classList.toggle("danger", slots > MAX_WEAPON_SLOTS);
    elements.meleeSkillRankValue.textContent = String(this.skillRanks["Melee Weapons"] || 0);
    elements.rangedWeaponsSkillRankValue.textContent = String(this.skillRanks["Ranged Weapons"] || 0);
    elements.equipmentStatusHint.textContent = this.weapons.length || derived.length ? "Ready." : "No weapons selected.";
    const visible = this.#visibleWeapons().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const draft = getWeaponDef(this.weaponBases, this.draftWeaponKey);
    elements.weaponBaseSelect.innerHTML = this.renderWeaponChoice({ id: "equipment-new-weapon", options: visible, weaponBases: this.weaponBases,
      weapon: draft ? { weaponKey: draft.weaponKey, rank: Number(draft.minRank || 0), enhancements: [] } : null,
      onChange: key => { this.draftWeaponKey = key; return { ok: true }; },
    });
    elements.addWeaponBtn.disabled = this.disabled || !draft;
    elements.showOutOfRank.disabled = this.disabled;
    elements.weaponList.innerHTML = this.errorHtml() + (this.weapons.length
      ? this.weapons.map((weapon) => this.#renderWeapon(weapon)).join("")
      : derived.length ? "" : '<div class="emptyState">No weapons selected.</div>');
    if (derived.length) elements.weaponList.innerHTML += `<h2>Granted weapons</h2>${derived.map(weapon => renderGrantedWeaponHtml(weapon, { gameData: this.gameData, builder: this.character.builder })).join("")}`;
    if (this.disabled) for (const control of elements.weaponList.querySelectorAll("input, select, button, textarea")) control.disabled = true;
  }

  #changeWeaponBase(weaponId, key) {
    const definition = getWeaponDef(this.weaponBases, key);
    const current = this.weapons.find(entry => entry.id === weaponId);
    const minimum = Number(definition?.minRank || 0);
    const maximum = Math.max(minimum, getWeaponSkillRankCap(definition, this.skillRanks));
    const rank = Math.max(minimum, Math.min(maximum, Number(current?.rank || minimum)));
    return this.page.requestCharacterCommand(this, UpdateWeapon(weaponId, { weaponKey: key, rank }));
  }

  async #handleClick(event) {
    if (this.disabled) return;
    const target = event.target.closest("button");
    if (!target) return;
    if (target === this.elements.addWeaponBtn) {
      const weaponKey = this.draftWeaponKey;
      const definition = getWeaponDef(this.weaponBases, weaponKey);
      if (!definition) return;
      await this.#request(AddWeapon({
        id: id("weapon"), choiceId: "", sourceChoiceId: "", generated: false,
        weaponKey, rank: Number(definition.minRank || 0), customName: "", enhancements: [],
      }));
      return;
    }
    const weaponId = target.dataset.weaponId;
    if (target.hasAttribute("data-remove-weapon")) await this.#request(RemoveWeapon(weaponId));
    if (target.hasAttribute("data-add-enhancement")) {
      const weapon = this.weapons.find((entry) => entry.id === weaponId);
      const definition = this.#visibleEnhancements(weapon)[0];
      if (weapon && definition) await this.#request(AddWeaponEnhancement(weaponId, {
        id: id("enhancement"), enhancementKey: definition.enhancementKey,
        rank: Number(definition.minRank || 0), selections: {}, granted: false,
      }));
    }
    if (target.hasAttribute("data-remove-enhancement")) {
      await this.#request(RemoveWeaponEnhancement(weaponId, target.dataset.enhancementId));
    }
  }

  async #handleChange(event) {
    if (this.disabled) return;
    const target = event.target;
    if (target === this.elements.showOutOfRank) {
      this.showOutOfRank = target.checked;
      this.render();
      return;
    }
    const weaponId = target.dataset.weaponId;
    if (!weaponId) return;
    if (target.hasAttribute("data-weapon-rank")) await this.#request(UpdateWeapon(weaponId, { rank: Number(target.value) }));
    else if (target.hasAttribute("data-weapon-name")) await this.#request(UpdateWeapon(weaponId, { customName: sanitizeText(target.value, { maxLen: 120, collapse: true }) }));
    else if (target.hasAttribute("data-enhancement-rank")) {
      await this.#request(UpdateWeaponEnhancement(weaponId, target.dataset.enhancementId, { rank: Number(target.value) }));
    }
  }

  destroy({ unregister = true } = {}) {
    this.elements.addWeaponBtn.removeEventListener("click", this.onClick);
    this.elements.weaponList.removeEventListener("click", this.onClick);
    this.elements.weaponList.removeEventListener("change", this.onChange);
    this.elements.showOutOfRank.removeEventListener("change", this.onChange);
    super.destroy({ unregister });
  }
}
