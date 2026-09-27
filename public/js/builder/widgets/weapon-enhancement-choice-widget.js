import { sanitizeText } from "../../core/data-sanitization.js";
import { buildGeneratedWeaponsFromGrantChoices } from "../../core/grants.js";
import { getEnhancementDef, isEnhancementCompatible } from "../../core/weapon-utils.js";
import { EquipmentChoiceWidget } from "./equipment-choice-widget.js?v=choices5";

export class WeaponEnhancementChoiceWidget extends EquipmentChoiceWidget {
  constructor(page, { grant, choice, forcedEnhancements = [], weaponBases, weaponEnhancements, prerequisiteContext = {}, getGrantChoices = null, getExistingWeapons = null, onChange, scope = "dynamic" } = {}) {
    const choiceId = sanitizeText(grant?.choiceRef || choice?.choiceId, { maxLen: 96, collapse: true });
    super(page, { id: `weapon-enhancement-choice:${choiceId}:${sanitizeText(grant?.enhancement || "optional", { maxLen: 96, collapse: true })}`, scope, element: document.createElement("div") });
    Object.assign(this, { grant, choice, choiceId, forcedEnhancements, weaponBases, weaponEnhancements, prerequisiteContext, getGrantChoices, getExistingWeapons, onChange });
    this.render();
  }
  getSavePatch({ currentDoc = {}, currentPatch = {}, grantChoices = null } = {}) {
    const choices = this.getGrantChoices?.() || grantChoices || {};
    return { "builder.grantChoices": choices, "builder.weapons": buildGeneratedWeaponsFromGrantChoices(choices, currentPatch["builder.weapons"] || this.getExistingWeapons?.() || currentDoc?.builder?.weapons || []) };
  }
  render() {
    this.beginChoices();
    const choice = this.getGrantChoices ? this.getGrantChoices()?.[this.choiceId] : this.choice;
    const selectedEnhancement = choice?.enhancements?.find(entry => !entry.granted);
    const forcedKeys = new Set(this.forcedEnhancements.map(entry => entry.enhancementKey));
    const weapon = choice?.weaponKey ? { ...choice, rank: Number(choice.rank || this.grant?.rank || 1), enhancements: choice.enhancements || this.forcedEnhancements } : null;
    const maxRank = Number.parseInt(String(this.grant?.rank ?? weapon?.rank ?? 1), 10) || 1;
    const options = weapon ? (this.weaponEnhancements || []).filter(entry => !forcedKeys.has(entry.enhancementKey) && Number(entry.minRank || 0) <= maxRank && isEnhancementCompatible(entry, weapon, this.weaponBases, this.prerequisiteContext)).sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
    this.element.innerHTML = this.errorHtml() + this.renderEnhancementChoice({ id: this.id, options, enhancement: selectedEnhancement, definition: getEnhancementDef(this.weaponEnhancements, selectedEnhancement?.enhancementKey), rank: maxRank,
      disabled: !weapon, help: weapon ? "" : "Choose a weapon first.", onChange: key => this.onChange?.(key),
      onDetailChange: selections => this.onChange?.(selectedEnhancement.enhancementKey, selections),
    });
    return this.element;
  }
}
