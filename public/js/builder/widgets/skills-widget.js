import {
  SetClassUtilitySkills,
  SetCombatSkills,
  SetSettingSkills,
  SetSkillRank,
} from "../../core/character-commands.js?v=wpe4";
import { SKILL_RANK_OPTIONS } from "../../core/character-rules.js";
import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { getSkillAllocationState } from "../../core/skill-rules.js?v=wpe13";

function rankOptions(selected, maximum, { locked = false, minimum = 0 } = {}) {
  return SKILL_RANK_OPTIONS.map(({ value, label }) => {
    const numeric = value === "" ? 0 : Number(value);
    const belowMinimum = minimum > 0 && (value === "" || numeric < minimum);
    const disabled = !locked && (belowMinimum || (value !== "" && numeric > maximum)) && value !== selected;
    return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function staticSkillRow(record, marker = "") {
  const rank = String(record.rank ?? "");
  return `<label class="skill-chip skill-chip-static" ${marker}><span class="skill-chip-label">${escapeHtml(record.skill || record.name)}</span><select aria-label="${escapeHtml(record.skill || record.name)} rank" class="skill-rank-select" disabled>${rankOptions(rank, 6, { locked: true })}</select></label>`;
}

export class SkillsWidget {
  constructor(page, { gameData, elements, onRejected = null } = {}) {
    this.id = "skills";
    this.scope = "skills";
    this.page = page;
    this.gameData = gameData;
    this.elements = elements;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.character = page.getCharacter();
    this.busy = false;
    this.onAddCombat = () => this.#addDraftRow("combat");
    this.onAddSetting = () => this.#addDraftRow("setting");
    elements.addCombatSkillBtn.addEventListener("click", this.onAddCombat);
    elements.addSettingSkillBtn.addEventListener("click", this.onAddSetting);
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
    const containers = [
      this.elements.classUtilitySkillOptions,
      this.elements.coreSkillGrid,
      this.elements.combatSkillGrid,
      this.elements.settingSkillGrid,
    ];
    for (const container of containers) {
      for (const input of container.querySelectorAll("input, select, button")) input.disabled = disabled;
    }
    this.elements.addCombatSkillBtn.disabled = disabled;
    this.elements.addSettingSkillBtn.disabled = disabled;
  }

  #utilityChanged(event) {
    const current = getSkillAllocationState(this.gameData, this.character.builder).utility.selected;
    const key = event.currentTarget.value;
    const next = event.currentTarget.checked ? [...current, key] : current.filter((value) => value !== key);
    return this.#submit(SetClassUtilitySkills(next));
  }

  #fixedRankChanged(event) {
    const grantedFloor = Number(event.currentTarget.dataset.grantedFloor || 0);
    const selectedRank = event.currentTarget.value;
    const storedRank = grantedFloor > 0 && Number(selectedRank || 0) <= grantedFloor ? "" : selectedRank;
    return this.#submit(SetSkillRank(event.currentTarget.dataset.fieldKey, storedRank));
  }

  #readRows(domain, { excluding = null } = {}) {
    const container = domain === "combat" ? this.elements.combatSkillGrid : this.elements.settingSkillGrid;
    return [...container.querySelectorAll("[data-editable-skill-row]")]
      .filter((row) => row !== excluding)
      .map((row) => {
        const skill = sanitizeText(row.querySelector('[data-field="skill"]')?.value, { maxLen: 96, collapse: true });
        const rank = String(row.querySelector('[data-field="rank"]')?.value || "");
        const grantedFloor = Number(row.dataset.grantedFloor || 0);
        if (grantedFloor > 0 && Number(rank || 0) <= grantedFloor) return null;
        return { skill, rank };
      })
      .filter((row) => row?.skill);
  }

  #commitRows(domain, options = {}) {
    const rows = this.#readRows(domain, options);
    return this.#submit(domain === "combat" ? SetCombatSkills(rows) : SetSettingSkills(rows));
  }

  #bindEditableRow(row, domain) {
    row.querySelector('[data-field="skill"]')?.addEventListener("change", () => this.#commitRows(domain));
    row.querySelector('[data-field="rank"]')?.addEventListener("change", () => this.#commitRows(domain));
    row.querySelector('[data-action="remove"]')?.addEventListener("click", () => this.#commitRows(domain, { excluding: row }));
  }

  #addDraftRow(domain) {
    const allocation = getSkillAllocationState(this.gameData, this.character.builder);
    const container = domain === "combat" ? this.elements.combatSkillGrid : this.elements.settingSkillGrid;
    const node = document.importNode(this.elements.skillChipTemplate.content, true);
    const row = node.firstElementChild;
    row.setAttribute("data-editable-skill-row", "");
    row.querySelector('[data-field="rank"]').innerHTML = rankOptions("", Math.min(allocation.baseRankCap, Math.max(0, allocation.remaining)));
    container.appendChild(node);
    this.#bindEditableRow(row, domain);
    row.querySelector('[data-field="skill"]')?.focus();
  }

  #renderUtility(allocation) {
    const utility = allocation.utility;
    const selected = new Set(utility.selected);
    this.elements.classUtilitySkillsCard.style.display = utility.options.length ? "" : "none";
    this.elements.classUtilitySkillsMeta.textContent = utility.options.length ? `Choose ${utility.expectedCount} of ${utility.options.length}` : "";
    this.elements.classUtilitySkillOptions.innerHTML = utility.options.map((option) => {
      const checked = selected.has(option.key);
      const disabled = this.busy || (!checked && selected.size >= utility.expectedCount);
      return `<label class="optionRow"><input type="checkbox" data-class-utility-skill value="${escapeHtml(option.key)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}/><div><div class="optionTitle">${escapeHtml(option.label)}</div><div class="optionDesc">Granted at Rank 1 and does not cost Skill Points.</div></div></label>`;
    }).join("");
    for (const input of this.elements.classUtilitySkillOptions.querySelectorAll("[data-class-utility-skill]")) input.addEventListener("change", (event) => this.#utilityChanged(event));
  }

  #renderFixed(allocation) {
    this.elements.defenseSkillGrid.innerHTML = allocation.defense.map((record) => staticSkillRow(record)).join("");
    this.elements.coreSkillGrid.innerHTML = allocation.fixed.map((record) => `<label class="skill-chip skill-chip-static"><span class="skill-chip-label">${escapeHtml(record.name)}</span><select aria-label="${escapeHtml(record.name)} rank" class="skill-rank-select" data-field-key="${escapeHtml(record.key)}" data-granted-floor="${record.grantedRank}"${record.editable && !this.busy ? "" : " disabled"}>${rankOptions(record.grantedRank ? String(record.rank) : record.storedRank, record.maximumAssignable, { locked: !record.editable, minimum: record.minimumAssignable })}</select></label>`).join("");
    for (const select of this.elements.coreSkillGrid.querySelectorAll("select[data-field-key]:not([disabled])")) select.addEventListener("change", (event) => this.#fixedRankChanged(event));
  }

  #renderRepeatable(domain, allocation) {
    const container = domain === "combat" ? this.elements.combatSkillGrid : this.elements.settingSkillGrid;
    const granted = domain === "combat" ? allocation.grantedCombatSkills : allocation.grantedSettingSkills;
    const rows = domain === "combat" ? allocation.combat : allocation.setting;
    container.innerHTML = granted.map((record) => staticSkillRow(record, "data-granted-skill")).join("");
    for (const record of rows) {
      const node = document.importNode(this.elements.skillChipTemplate.content, true);
      const row = node.firstElementChild;
      row.setAttribute("data-editable-skill-row", "");
      const name = row.querySelector('[data-field="skill"]');
      const rank = row.querySelector('[data-field="rank"]');
      const remove = row.querySelector('[data-action="remove"]');
      name.value = record.name;
      rank.innerHTML = rankOptions(record.grantedRank ? String(record.rank) : record.storedRank, record.maximumAssignable, { minimum: record.minimumAssignable });
      if (record.grantedRank) {
        row.dataset.grantedFloor = String(record.grantedRank);
        name.disabled = true;
        name.title = "This skill is supplied by the class; only its paid rank increase is editable.";
        remove.disabled = true;
        remove.title = "Change the class utility skill choice to remove this granted rank.";
      }
      container.appendChild(node);
      this.#bindEditableRow(row, domain);
    }
  }

  render() {
    const allocation = getSkillAllocationState(this.gameData, this.character.builder);
    this.elements.skillPointsTotal.textContent = String(allocation.total);
    this.elements.skillPointsSpent.textContent = String(allocation.spent);
    this.elements.skillPointsRemaining.textContent = String(allocation.remaining);
    this.elements.skillRankCap.textContent = String(allocation.baseRankCap);
    this.elements.skillPointsRemainingPill.classList.toggle("danger", allocation.remaining < 0);
    this.elements.skillPointsRemainingPill.classList.toggle("ok", allocation.remaining >= 0);
    this.#renderUtility(allocation);
    this.#renderFixed(allocation);
    this.#renderRepeatable("combat", allocation);
    this.#renderRepeatable("setting", allocation);
    this.elements.addCombatSkillBtn.disabled = this.busy || allocation.remaining <= 0;
    this.elements.addSettingSkillBtn.disabled = this.busy || allocation.remaining <= 0;
  }

  destroy({ unregister = true } = {}) {
    this.elements.addCombatSkillBtn.removeEventListener("click", this.onAddCombat);
    this.elements.addSettingSkillBtn.removeEventListener("click", this.onAddSetting);
    if (unregister) this.page.unregisterWidget(this);
  }
}
