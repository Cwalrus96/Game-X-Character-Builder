import { SetFeatSelection } from "../../core/character-commands.js";
import { getFeatGrantChoices } from "../../core/feat-rules.js";
import { escapeHtml } from "../../core/data-sanitization.js";
import { isOptionGroup } from "../../core/option-groups.js";
import { renderRuleDetailsHtml, bindRuleDetails } from "./rule-details.js";
import { CatalogueWidget } from "./catalogue-widget.js?v=choices5";

export class FeatChoiceWidget extends CatalogueWidget {
  constructor(page, { entry, index = 0, sourceId, scope = "feature", gameData,
    getBuilder = () => page.getCharacter().builder, expandedChoices, renderFeatOptions = null,
    renderFeatGrants = null, onChange = null, mount = null,
  } = {}) {
    super(page, { id: `feat-choice:${sourceId}:${index}`, scope, element: mount || document.createElement("div"), expandedChoices });
    Object.assign(this, { entry, index, gameData, getBuilder, renderFeatOptions, renderFeatGrants });
    this.childScope = `${this.id}:children`;
    this.element.className = "featChoiceWidget";
    this.onChoiceAccepted = onChange;
    this.render();
  }
  choose(index, key) {
    const choice = getFeatGrantChoices(this.gameData, this.getBuilder(), { entry: this.entry, grantIndex: this.index })[index];
    const option = choice?.options.find(option => option.featKey === key && option.eligible);
    if (!choice || (key && !option)) return { ok: false, errors: ["This feat is no longer available."] };
    return this.page.requestCharacterCommand(this, SetFeatSelection(option ? option.nextFeatKeys : choice.clearedFeatKeys));
  }
  render() {
    this.page.clearWidgets?.({ scope: this.childScope });
    this.beginChoices();
    this.choices = getFeatGrantChoices(this.gameData, this.getBuilder(), { entry: this.entry, grantIndex: this.index });
    this.element.innerHTML = this.errorHtml() + this.choices.map((choice, index) => {
      const type = Array.isArray(choice.filterType) ? "" : choice.filterType;
      const label = type === "class" ? "Choose a class feat" : type === "archetype" ? "Choose an archetype feat" : type === "general" ? "Choose a general feat" : "Choose a feat";
      const id = `${this.id}:${index}`;
      const options = choice.options.filter(option => option.eligible);
      const selected = choice.options.find(option => option.featKey === choice.featKey)?.feat;
      const card = feat => `<div class="optionTitle">${escapeHtml(feat.name)}</div><div class="optionDesc">${escapeHtml(feat.description || "")}</div>`;
      const references = (feat, view) => renderRuleDetailsHtml(feat, { gameData: this.gameData, page: this.page, identity: `${id}:${view}:${feat.featKey}` });
      return this.renderChoice({ id, label: label + (this.choices.length > 1 ? ` (${index + 1})` : ""), value: choice.featKey,
        placeholder: `${label}…`, emptyLabel: "No feat selected",
        options: options.map(option => ({ key: option.featKey, name: option.feat.name, contentHtml: card(option.feat), referencesHtml: references(option.feat, "candidate") })),
        followUpHtml: selected ? `<div data-feat-detail="${index}"></div>` : "",
        help: options.length ? "" : "No eligible feats are currently available for this feature.",
        onChange: key => this.choose(index, key),
      });
    }).join("");
    bindRuleDetails(this.element, this.page);
    this.choices.forEach((choice, index) => {
      const feat = choice.options.find(option => option.featKey === choice.featKey)?.feat;
      const detail = this.element.querySelector(`[data-feat-detail="${index}"]`);
      if (!feat || !detail) return;
      const options = isOptionGroup(feat) ? this.renderFeatOptions?.(feat, this.childScope) : null;
      if (options) detail.append(options);
      const grants = this.renderFeatGrants?.(feat, this.childScope);
      if (grants) detail.append(grants);
    });
    return this.element;
  }
  destroy(options) { this.page.clearWidgets?.({ scope: this.childScope }); super.destroy(options); }
}
export function registerFeatWidgetExtension(registry) {
  registry.register("feat", context => new FeatChoiceWidget(context.page, context));
  return registry;
}
