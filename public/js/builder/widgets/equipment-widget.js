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
import {
  MAX_WEAPON_SLOTS,
  computeEnhancementCapacity,
  computeTotalWeaponSlots,
  countPurchasedEnhancements,
  getEffectiveTags,
  getEnhancementDef,
  getEnhancementSelectionSpecs,
  getWeaponDef,
  getWeaponSkillRankCap,
  getWeaponSkillRanks,
  isEnhancementCompatible,
  renderEnhancementDetailHtml,
  renderTagChipsHtml,
  summarizeWeaponProfilesHtml,
} from "../../core/weapon-utils.js";

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

export class EquipmentWidget {
  constructor(page, {
    id: widgetId = "equipment",
    scope = "equipment",
    gameData,
    elements,
    onRejected = null,
  } = {}) {
    this.id = widgetId;
    this.scope = scope;
    this.page = page;
    this.gameData = gameData;
    this.elements = elements;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.showOutOfRank = false;
    this.character = page.getCharacter();
    this.onClick = (event) => this.#handleClick(event);
    this.onChange = (event) => this.#handleChange(event);
    elements.addWeaponBtn.addEventListener("click", this.onClick);
    elements.weaponList.addEventListener("click", this.onClick);
    elements.weaponList.addEventListener("change", this.onChange);
    elements.showOutOfRank.addEventListener("change", this.onChange);
    page.registerWidget(this);
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
    const result = await this.page.requestCharacterCommand(this, command);
    if (!result.ok) this.onRejected?.(result);
    return result;
  }

  #visibleWeapons() {
    return this.weaponBases.filter((weapon) => isGameDataRecordSelectable(weapon) && (
      this.showOutOfRank
      || Number(weapon?.minRank || 0) <= getWeaponSkillRankCap(weapon, this.skillRanks)
    ));
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

  #renderSelectionFields(weapon, enhancement, disabled) {
    return getEnhancementSelectionSpecs(enhancement.enhancementKey).map((spec) => {
      const value = enhancement.selections?.[spec.key] || "";
      const attrs = `data-enhancement-selection data-weapon-id="${escapeHtml(weapon.id)}" data-enhancement-id="${escapeHtml(enhancement.id)}" data-selection-key="${escapeHtml(spec.key)}"${disabled ? " disabled" : ""}`;
      if (spec.type === "select") {
        return `<label class="label">${escapeHtml(spec.label)}<select class="input" ${attrs}>${option("", `Select ${spec.label}...`, !value)}${spec.options.map((entry) => option(entry, entry, entry === value)).join("")}</select></label>`;
      }
      return `<label class="label">${escapeHtml(spec.label)}<input class="input" value="${escapeHtml(value)}" placeholder="${escapeHtml(spec.placeholder || "")}" ${attrs}></label>`;
    }).join("");
  }

  #renderEnhancement(weapon, enhancement) {
    const sourceOwned = isSourceOwnedWeapon(weapon);
    const definition = getEnhancementDef(this.weaponEnhancements, enhancement.enhancementKey);
    const visible = this.#visibleEnhancements(weapon);
    if (definition && !visible.some((entry) => entry.enhancementKey === definition.enhancementKey)) visible.push(definition);
    const minimum = Number(definition?.minRank || 0);
    return `<div class="optionRow equipmentEnhancementRow">
      <div class="equipmentGrid equipmentGrid--enhancement">
        <label class="label">Enhancement<select class="input" data-enhancement-key data-weapon-id="${escapeHtml(weapon.id)}" data-enhancement-id="${escapeHtml(enhancement.id)}"${sourceOwned ? " disabled" : ""}>${visible.sort((a, b) => String(a.name).localeCompare(String(b.name))).map((entry) => option(entry.enhancementKey, `${entry.name} (Rank ${Number(entry.minRank || 0)}+)`, entry.enhancementKey === enhancement.enhancementKey)).join("")}</select></label>
        <label class="label">Rank<select class="input" data-enhancement-rank data-weapon-id="${escapeHtml(weapon.id)}" data-enhancement-id="${escapeHtml(enhancement.id)}"${sourceOwned ? " disabled" : ""}>${rankOptions(minimum, Number(weapon.rank || 0), Number(enhancement.rank || minimum))}</select></label>
      </div>
      <div class="equipmentGrid equipmentGrid--enhancementSelections">${this.#renderSelectionFields(weapon, enhancement, sourceOwned)}</div>
      ${renderEnhancementDetailHtml(definition, enhancement, { collapsible: false })}
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
    const tags = getEffectiveTags(weapon, this.weaponBases);
    const enhancements = weapon.enhancements.map((entry) => this.#renderEnhancement(weapon, entry)).join("");
    return `<article class="optionRow equipmentWeaponRow">
      <div class="cardHeaderRow"><h3>${escapeHtml(weapon.customName || definition?.name || weapon.weaponKey)}</h3>${sourceOwned ? '<span class="pill">Source-owned</span>' : ""}</div>
      ${sourceOwned ? '<p class="help">Change this weapon through the class, feat, or other choice that granted it.</p>' : ""}
      <div class="equipmentGrid">
        <label class="label">Weapon Base<select class="input" data-weapon-key data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>${bases.sort((a, b) => String(a.name).localeCompare(String(b.name))).map((entry) => option(entry.weaponKey, entry.name, entry.weaponKey === weapon.weaponKey)).join("")}</select></label>
        <label class="label">Rank<select class="input" data-weapon-rank data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>${rankOptions(minimum, Math.max(minimum, cap), weapon.rank)}</select></label>
        <label class="label">Custom Name<input class="input" value="${escapeHtml(weapon.customName)}" data-weapon-name data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}></label>
      </div>
      ${renderTagChipsHtml(tags)}
      ${summarizeWeaponProfilesHtml(definition, weapon.rank)}
      <div class="cardHeaderRow"><h4>Enhancements</h4><button class="btn" type="button" data-add-enhancement data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>Add Enhancement</button></div>
      <div class="optionList">${enhancements || '<div class="emptyState emptyState--nested">No enhancements.</div>'}</div>
      <button class="btn secondary" type="button" data-remove-weapon data-weapon-id="${escapeHtml(weapon.id)}"${sourceOwned ? " disabled" : ""}>Remove Weapon</button>
    </article>`;
  }

  render() {
    const { elements } = this;
    const slots = computeTotalWeaponSlots(this.weapons, this.weaponBases);
    const enhancements = countPurchasedEnhancements(this.weapons);
    const capacity = computeEnhancementCapacity(this.weapons, this.grantedEnhancementSlots);
    elements.weaponCountValue.textContent = String(this.weapons.length);
    elements.enhancementCountValue.textContent = `${enhancements} / ${capacity}`;
    elements.slotUsageValue.textContent = `${slots} / ${MAX_WEAPON_SLOTS}`;
    elements.slotUsagePill.classList.toggle("danger", slots > MAX_WEAPON_SLOTS);
    elements.meleeSkillRankValue.textContent = String(this.skillRanks["Melee Weapons"] || 0);
    elements.rangedWeaponsSkillRankValue.textContent = String(this.skillRanks["Ranged Weapons"] || 0);
    elements.equipmentStatusHint.textContent = this.weapons.length ? "Ready." : "No weapons selected.";
    const visible = this.#visibleWeapons().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    elements.weaponBaseSelect.innerHTML = option("", "Select a weapon...")
      + visible.map((weapon) => option(weapon.weaponKey, `${weapon.name} (Rank ${Number(weapon.minRank || 0)}+)`)).join("");
    elements.weaponList.innerHTML = this.weapons.length
      ? this.weapons.map((weapon) => this.#renderWeapon(weapon)).join("")
      : '<div class="emptyState">No weapons selected.</div>';
  }

  async #handleClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    if (target === this.elements.addWeaponBtn) {
      const weaponKey = this.elements.weaponBaseSelect.value;
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
    const target = event.target;
    if (target === this.elements.showOutOfRank) {
      this.showOutOfRank = target.checked;
      this.render();
      return;
    }
    const weaponId = target.dataset.weaponId;
    if (!weaponId) return;
    if (target.hasAttribute("data-weapon-key")) {
      const definition = getWeaponDef(this.weaponBases, target.value);
      const current = this.weapons.find((entry) => entry.id === weaponId);
      const minimum = Number(definition?.minRank || 0);
      const cap = getWeaponSkillRankCap(definition, this.skillRanks);
      const maximum = Math.max(minimum, cap);
      const rank = Math.max(minimum, Math.min(maximum, Number(current?.rank || minimum)));
      await this.#request(UpdateWeapon(weaponId, { weaponKey: target.value, rank }));
    }
    else if (target.hasAttribute("data-weapon-rank")) await this.#request(UpdateWeapon(weaponId, { rank: Number(target.value) }));
    else if (target.hasAttribute("data-weapon-name")) await this.#request(UpdateWeapon(weaponId, { customName: sanitizeText(target.value, { maxLen: 120, collapse: true }) }));
    else if (target.hasAttribute("data-enhancement-key")) {
      const definition = getEnhancementDef(this.weaponEnhancements, target.value);
      await this.#request(UpdateWeaponEnhancement(weaponId, target.dataset.enhancementId, {
        enhancementKey: target.value, rank: Number(definition?.minRank || 0), selections: {},
      }));
    } else if (target.hasAttribute("data-enhancement-rank")) {
      await this.#request(UpdateWeaponEnhancement(weaponId, target.dataset.enhancementId, { rank: Number(target.value) }));
    } else if (target.hasAttribute("data-enhancement-selection")) {
      const weapon = this.weapons.find((entry) => entry.id === weaponId);
      const enhancement = weapon?.enhancements.find((entry) => entry.id === target.dataset.enhancementId);
      const selections = { ...(enhancement?.selections || {}) };
      const value = sanitizeText(target.value, { maxLen: 96, collapse: true });
      if (value) selections[target.dataset.selectionKey] = value;
      else delete selections[target.dataset.selectionKey];
      await this.#request(UpdateWeaponEnhancement(weaponId, target.dataset.enhancementId, { selections }));
    }
  }

  destroy({ unregister = true } = {}) {
    this.elements.addWeaponBtn.removeEventListener("click", this.onClick);
    this.elements.weaponList.removeEventListener("click", this.onClick);
    this.elements.weaponList.removeEventListener("change", this.onChange);
    this.elements.showOutOfRank.removeEventListener("change", this.onChange);
    if (unregister) this.page.unregisterWidget(this);
  }
}
