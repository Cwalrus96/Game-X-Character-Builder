import { CatalogueWidget } from "./catalogue-widget.js?v=choices5";
import { renderTechniqueProfileHtml } from "../../core/technique-utils.js";

/** Single granted slots and the learned catalogue use identical Technique cards. */
export class TechniqueCatalogueWidget extends CatalogueWidget {
  renderTechniqueChoice({ id, options, gameData, profileOptions, value = "", values = [], multiple = false, ...config }) {
    const cards = options.map(option => {
      const technique = option.technique;
      const key = technique.techniqueKey;
      return { ...option, key, name: technique.techniqueName,
        contentHtml: renderTechniqueProfileHtml(technique, { ...profileOptions(technique), gameData, heading: technique.techniqueName, headingTag: "div", headingClass: "optionTitle", showRank: true }) + (option.sourceHtml || ""),
      };
    });
    return this.renderChoice({ id, label: "Technique", placeholder: "Choose a technique…", emptyLabel: "No technique selected", ...config, value, values,
      options: cards,
    }, { multiple });
  }
}
