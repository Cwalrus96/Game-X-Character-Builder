import { sanitizeText } from "../../core/data-sanitization.js";
import { buildGeneratedWeaponsFromGrantChoices } from "../../core/grants.js";
import { getEnhancementDef, getSelectableWeaponBases } from "../../core/weapon-utils.js";
import { EquipmentChoiceWidget } from "./equipment-choice-widget.js?v=choices5";
import { weaponMatchesGrant } from "../../core/weapon-grant-rules.js";

export class WeaponChoiceWidget extends EquipmentChoiceWidget {
  constructor(page, { grant, choice, weaponBases, weaponEnhancements, forcedEnhancements = [], getGrantChoices = null, getExistingWeapons = null, onChange, scope = "dynamic" } = {}) {
    const choiceId = sanitizeText(grant?.choiceId || choice?.choiceId, { maxLen: 96, collapse: true });
    super(page, { id: `weapon-choice:${choiceId}`, scope, element: document.createElement("div") });
    Object.assign(this, { grant, choice, choiceId, weaponBases, weaponEnhancements, forcedEnhancements, getGrantChoices, getExistingWeapons, onChange });
    this.render();
  }
  getSavePatch({ currentDoc = {}, currentPatch = {}, grantChoices = null } = {}) {
    const choices = this.getGrantChoices?.() || grantChoices || {};
    return { "builder.grantChoices": choices, "builder.weapons": buildGeneratedWeaponsFromGrantChoices(choices, currentPatch["builder.weapons"] || this.getExistingWeapons?.() || currentDoc?.builder?.weapons || []) };
  }
  render() {
    this.beginChoices();
    const choice = this.getGrantChoices ? this.getGrantChoices()?.[this.choiceId] : this.choice;
    const rank = Number.parseInt(String(this.grant?.rank ?? 1), 10) || 1;
    const options = getSelectableWeaponBases(this.weaponBases, { maxRank: rank, allowGrantedOnly: true })
      .filter(definition => weaponMatchesGrant(definition, this.grant)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    this.element.innerHTML = this.errorHtml() + this.renderWeaponChoice({ id: this.choiceId, options, weaponBases: this.weaponBases,
      weapon: { ...choice, rank: Number(choice?.rank || rank), enhancements: choice?.enhancements || this.forcedEnhancements }, rank, enhancements: this.forcedEnhancements,
      help: this.forcedEnhancements.length ? `Granted enhancement: ${this.forcedEnhancements.map(entry => getEnhancementDef(this.weaponEnhancements, entry.enhancementKey)?.name || entry.enhancementKey).join(", ")}` : "",
      onChange: weaponKey => this.onChange?.({ type: "weapon", weaponKey, rank }),
    });
    return this.element;
  }
}
