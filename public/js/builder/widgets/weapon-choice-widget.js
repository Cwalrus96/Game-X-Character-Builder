import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { buildGeneratedWeaponsFromGrantChoices } from "../../core/grants.js";
import {
  getEffectiveTags,
  getEnhancementDef,
  getWeaponDef,
  renderTagChipsHtml,
} from "../../core/weapon-utils.js";
import { BuilderWidget } from "./builder-widget.js";

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

export class WeaponChoiceWidget extends BuilderWidget {
  constructor(page, {
    grant,
    choice,
    weaponBases,
    weaponEnhancements,
    forcedEnhancements = [],
    getGrantChoices = null,
    getExistingWeapons = null,
    onChange,
    scope = "dynamic",
  } = {}) {
    const choiceId = sanitizeText(grant?.choiceId || choice?.choiceId, { maxLen: 96, collapse: true });
    super(page, { id: `weapon-choice:${choiceId}`, scope });
    this.grant = grant || {};
    this.choice = choice || null;
    this.choiceId = choiceId;
    this.weaponBases = Array.isArray(weaponBases) ? weaponBases : [];
    this.weaponEnhancements = Array.isArray(weaponEnhancements) ? weaponEnhancements : [];
    this.forcedEnhancements = Array.isArray(forcedEnhancements) ? forcedEnhancements : [];
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
    const rank = Number.parseInt(String(this.grant?.rank ?? 1), 10) || 1;
    const selectedWeaponKey = sanitizeText(this.choice?.weaponKey, { maxLen: 64, collapse: true });

    const field = document.createElement("div");
    field.className = "grantChoiceWidget";

    const label = document.createElement("label");
    label.className = "label";
    label.textContent = "Choose Weapon";

    const select = document.createElement("select");
    select.id = `${this.id}:weapon`;
    label.htmlFor = select.id;
    select.className = "input";
    select.innerHTML = `<option value="">Choose a weapon...</option>` + this.weaponBases
      .filter((weapon) => Number(weapon?.minRank || 0) <= rank)
      .slice()
      .sort(compareByName)
      .map((weapon) => `<option value="${escapeHtml(weapon.weaponKey)}"${selectedWeaponKey === weapon.weaponKey ? " selected" : ""}>${escapeHtml(weapon.name)} (Rank ${Number(weapon.minRank || 0)}+)</option>`)
      .join("");
    select.addEventListener("change", () => {
      this.onChange?.({
        type: "weapon",
        weaponKey: sanitizeText(select.value, { maxLen: 64, collapse: true }),
        rank,
      });
    });

    field.append(label, select);

    if (this.forcedEnhancements.length) {
      const forcedText = this.forcedEnhancements
        .map((enhancement) => getEnhancementDef(this.weaponEnhancements, enhancement.enhancementKey)?.name || enhancement.enhancementKey)
        .filter(Boolean)
        .join(", ");
      const help = document.createElement("div");
      help.className = "help";
      help.textContent = `Granted enhancement: ${forcedText}`;
      field.append(help);
    }

    if (selectedWeaponKey) {
      const weaponDef = getWeaponDef(this.weaponBases, selectedWeaponKey);
      const weapon = {
        weaponKey: selectedWeaponKey,
        rank: Number(this.choice?.rank || rank),
        enhancements: Array.isArray(this.choice?.enhancements) ? this.choice.enhancements : this.forcedEnhancements,
      };
      const tags = getEffectiveTags(weapon, this.weaponBases);
      const meta = document.createElement("div");
      meta.className = "help";
      meta.innerHTML = `${escapeHtml(weaponDef?.name || selectedWeaponKey)} tags: ${renderTagChipsHtml(tags, "tagChip")}`;
      field.append(meta);
    }

    return field;
  }
}
