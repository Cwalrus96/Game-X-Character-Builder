import { buildGeneratedWeaponsFromGrantChoices } from "../../core/grants.js";
import { BuilderWidget } from "./builder-widget.js";

export class GrantChoicesWidget extends BuilderWidget {
  constructor(page, {
    getGrantChoices = null,
    getExistingWeapons = null,
  } = {}) {
    super(page, { id: "grant-choices", scope: "page" });
    this.getGrantChoices = typeof getGrantChoices === "function" ? getGrantChoices : null;
    this.getExistingWeapons = typeof getExistingWeapons === "function" ? getExistingWeapons : null;
  }

  getSavePatch({ currentDoc = {}, currentPatch = {}, grantChoices = null } = {}) {
    const choices = this.getGrantChoices?.() || grantChoices || {};
    const existingWeapons = currentPatch["builder.weapons"] || this.getExistingWeapons?.() || currentDoc?.builder?.weapons || [];
    return {
      "builder.grantChoices": choices,
      "builder.weapons": buildGeneratedWeaponsFromGrantChoices(choices, existingWeapons),
    };
  }
}
