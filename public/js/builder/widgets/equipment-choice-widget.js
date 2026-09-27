import { CatalogueWidget } from "./catalogue-widget.js?v=choices5";
import { renderSelectedWeaponHtml } from "./selected-choice-display.js";
import { getEnhancementSelectionSpecs, renderEnhancementDetailHtml } from "../../core/weapon-utils.js";

/** Equipment and grant editors compose the same item pickers, with injected Rules options. */
export class EquipmentChoiceWidget extends CatalogueWidget {
  renderWeaponChoice({ id, options, weapon, weaponBases, rank = null, enhancements = [], ...config }) {
    const retained = weaponBases.find(entry => entry.weaponKey === weapon?.weaponKey && !options.some(option => option.weaponKey === entry.weaponKey));
    const visible = (retained ? [...options, retained] : [...options]).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return this.renderChoice({ id, label: "Weapon", placeholder: "Choose a weapon…", emptyLabel: "No weapon selected", value: weapon?.weaponKey,
      ...config,
      options: visible.map(definition => ({ key: definition.weaponKey, name: definition.name, disabled: definition === retained,
        contentHtml: renderSelectedWeaponHtml({ choiceId: `${id}:preview:${definition.weaponKey}`, weaponBases, label: "Weapon details",
          weapon: definition.weaponKey === weapon?.weaponKey ? weapon : { weaponKey: definition.weaponKey, rank: rank ?? Number(definition.minRank || 0), enhancements } }),
      })),
    });
  }
  renderEnhancementChoice({ id, options, enhancement, definition, rank, onDetailChange, ...config }) {
    const retained = definition && !options.some(option => option.enhancementKey === definition.enhancementKey) ? definition : null;
    const visible = (retained ? [...options, retained] : [...options]).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return this.renderChoice({ id, label: "Enhancement", placeholder: "Choose an enhancement…", emptyLabel: "No enhancement selected", value: enhancement?.enhancementKey,
      ...config,
      options: visible.map(entry => ({ key: entry.enhancementKey, name: entry.name, disabled: entry === retained,
        contentHtml: renderEnhancementDetailHtml(entry, entry.enhancementKey === enhancement?.enhancementKey ? enhancement : { enhancementKey: entry.enhancementKey, rank: rank ?? Number(entry.minRank || 0) }, { collapsible: false }),
      })),
      followUpHtml: definition && onDetailChange ? getEnhancementSelectionSpecs(enhancement.enhancementKey).map(spec => this.renderDetailField({
          id: `${id}:${spec.key}`, label: spec.label, value: enhancement.selections?.[spec.key] || "", disabled: config.disabled,
          maxLength: 96, placeholder: spec.placeholder,
          ...(spec.type === "select" ? { options: [{ value: "", label: `Choose ${spec.label}…` }, ...spec.options.map(value => ({ value, label: value }))] } : {}),
          onChange: value => {
            const selections = { ...(enhancement.selections || {}) };
            if (value) selections[spec.key] = value; else delete selections[spec.key];
            return onDetailChange(selections);
          },
        })).join("") : "",
    });
  }
}
