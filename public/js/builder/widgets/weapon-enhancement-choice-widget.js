import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { buildGeneratedWeaponsFromGrantChoices } from "../../core/grants.js";
import {
  getEnhancementDef,
  isEnhancementCompatible,
} from "../../core/weapon-utils.js";
import { BuilderWidget } from "./builder-widget.js";

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

function getOptionalEnhancement(choice) {
  const enhancements = Array.isArray(choice?.enhancements) ? choice.enhancements : [];
  return enhancements.find((enhancement) => !enhancement?.granted) || null;
}

export class WeaponEnhancementChoiceWidget extends BuilderWidget {
  constructor(page, {
    grant,
    choice,
    forcedEnhancements = [],
    weaponBases,
    weaponEnhancements,
    prerequisiteContext = {},
    getGrantChoices = null,
    getExistingWeapons = null,
    onChange,
    scope = "dynamic",
  } = {}) {
    const choiceId = sanitizeText(grant?.choiceRef || choice?.choiceId, { maxLen: 96, collapse: true });
    super(page, { id: `weapon-enhancement-choice:${choiceId}:${sanitizeText(grant?.enhancement || "optional", { maxLen: 96, collapse: true })}`, scope });
    this.grant = grant || {};
    this.choice = choice || null;
    this.choiceId = choiceId;
    this.forcedEnhancements = Array.isArray(forcedEnhancements) ? forcedEnhancements : [];
    this.weaponBases = Array.isArray(weaponBases) ? weaponBases : [];
    this.weaponEnhancements = Array.isArray(weaponEnhancements) ? weaponEnhancements : [];
    this.prerequisiteContext = prerequisiteContext || {};
    this.getGrantChoices = typeof getGrantChoices === "function" ? getGrantChoices : null;
    this.getExistingWeapons = typeof getExistingWeapons === "function" ? getExistingWeapons : null;
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.element = this.render();
  }

  getSavePatch({ currentDoc = {}, currentPatch = {}, grantChoices = null } = {}) {
    const choices = this.getGrantChoices?.() || grantChoices || {};
    const existingWeapons = currentPatch["builder.weapons"] || this.getExistingWeapons?.() || currentDoc?.builder?.weapons || [];
    return {
      "builder.grantChoices": choices,
      "builder.weapons": buildGeneratedWeaponsFromGrantChoices(choices, existingWeapons),
    };
  }

  render() {
    const selectedWeaponKey = sanitizeText(this.choice?.weaponKey, { maxLen: 64, collapse: true });
    const selectedEnhancement = getOptionalEnhancement(this.choice);
    const forcedKeys = new Set(this.forcedEnhancements.map((enhancement) => enhancement.enhancementKey));
    const weapon = selectedWeaponKey
      ? {
          weaponKey: selectedWeaponKey,
          rank: Number(this.choice?.rank || this.grant?.rank || 1),
          enhancements: Array.isArray(this.choice?.enhancements) ? this.choice.enhancements : this.forcedEnhancements,
        }
      : null;
    const maxRank = Number.parseInt(String(this.grant?.rank ?? weapon?.rank ?? 1), 10) || 1;
    const options = weapon
      ? this.weaponEnhancements
          .filter((enhancement) => Number(enhancement?.minRank || 0) <= maxRank)
          .filter((enhancement) => !forcedKeys.has(enhancement.enhancementKey))
          .filter((enhancement) => isEnhancementCompatible(enhancement, weapon, this.weaponBases, this.prerequisiteContext))
          .slice()
          .sort(compareByName)
      : [];

    const field = document.createElement("div");
    field.className = "grantChoiceWidget";

    const label = document.createElement("label");
    label.className = "label";
    label.textContent = "Choose Weapon Enhancement";

    const select = document.createElement("select");
    select.className = "input";
    select.disabled = !selectedWeaponKey;
    select.innerHTML = `<option value="">${selectedWeaponKey ? "Choose an enhancement..." : "Choose a weapon first..."}</option>` + options
      .map((enhancement) => `<option value="${escapeHtml(enhancement.enhancementKey)}"${selectedEnhancement?.enhancementKey === enhancement.enhancementKey ? " selected" : ""}>${escapeHtml(enhancement.name)} (Rank ${Number(enhancement.minRank || 0)}+)</option>`)
      .join("");
    select.addEventListener("change", () => this.onChange?.(sanitizeText(select.value, { maxLen: 96, collapse: true })));

    field.append(label, select);

    if (selectedEnhancement?.enhancementKey) {
      const enhancementDef = getEnhancementDef(this.weaponEnhancements, selectedEnhancement.enhancementKey);
      const help = document.createElement("div");
      help.className = "help";
      help.textContent = enhancementDef?.description || enhancementDef?.name || selectedEnhancement.enhancementKey;
      field.append(help);
    }

    return field;
  }
}
