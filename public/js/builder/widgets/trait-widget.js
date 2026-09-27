import { SetTraitChoice, RemoveTraitChoice } from "../../core/character-commands.js";
import { projectCharacterTraits, traitSourceIdentity } from "../../core/trait-rules.js";
import { getTraitSourceDisplay, renderTraitCardHtml, renderTraitProjectionHtml } from "../../core/trait-display.js?v=wpe3";
import { renderRuleDetailsHtml, bindRuleDetails } from "./rule-details.js";
import { CatalogueWidget } from "./catalogue-widget.js?v=choices5";

export class TraitWidget extends CatalogueWidget {
  constructor(page, { id = "traits", scope = "traits", gameData, mount, project = projectCharacterTraits,
    onRejected = null, sourceId = "", onAccepted = null, expandedChoices,
  } = {}) {
    if (!mount || typeof project !== "function") throw new TypeError("TraitWidget requires a mount and Trait projection.");
    super(page, { id, scope, element: mount, expandedChoices });
    Object.assign(this, { gameData, project, sourceId, onRejected });
    this.onChoiceAccepted = onAccepted;
    this.render();
  }
  getProjection() {
    const projection = this.project(this.page.getCharacter(), this.gameData);
    return this.sourceId ? getTraitSourceDisplay(projection, this.sourceId) : projection;
  }
  choose(choiceId, key) {
    const choice = this.getProjection().choices.find(choice => choice.choiceId === choiceId);
    if (!choice || (key && !choice.options.some(option => option.traitKey === key && option.eligible))) return { ok: false, errors: ["This Trait is no longer available."] };
    return this.page.requestCharacterCommand(this, key ? SetTraitChoice({ choiceId, sourceId: choice.sourceId, recipientId: choice.recipientId, traitKey: key }) : RemoveTraitChoice(choiceId));
  }
  render() {
    this.beginChoices();
    this.projection = this.getProjection();
    const choices = (this.projection.choices || []).map(choice => {
      const card = option => {
        const definition = (this.gameData.traits || []).find(trait => trait.traitKey === option.traitKey) || option;
        const acquired = (this.projection.traits || []).find(trait => trait.choiceId === choice.choiceId && trait.traitKey === option.traitKey);
        return renderTraitCardHtml({ ...definition, ...acquired, rank: choice.rank ?? option.rank, sourceLabel: "", sourceDescription: "" }, { gameData: this.gameData, status: acquired ? "Acquired" : "Available" });
      };
      const references = (option, view) => renderRuleDetailsHtml((this.gameData.traits || []).find(trait => trait.traitKey === option?.traitKey), {
        gameData: this.gameData, page: this.page, identity: `${choice.choiceId}:${view}:${option?.traitKey}`,
      });
      const options = (choice.options || []).filter(option => option.eligible);
      return this.renderChoice({ id: choice.choiceId, label: choice.label || "Choose a Trait", value: choice.traitKey,
        placeholder: "Choose a Trait…", emptyLabel: "No Trait selected",
        options: options.map(option => ({ key: option.traitKey, name: option.name || option.traitKey, contentHtml: card(option), referencesHtml: references(option, "candidate") })),
        help: options.length ? "" : "No eligible Traits are currently available for this choice.",
        onChange: key => this.choose(choice.choiceId, key),
      });
    }).join("");
    const summary = { ...this.projection, traits: (this.projection.traits || []).filter(trait => !trait.choiceId), tags: [] };
    this.element.innerHTML = `<h3 class="h3">Traits</h3>${this.errorHtml()}${choices}${renderTraitProjectionHtml(summary, { gameData: this.gameData, ...(this.sourceId || choices ? { emptyMessage: "" } : {}) })}`;
    bindRuleDetails(this.element, this.page);
    return this.element;
  }
}

export function createTraitGrantWidget(page, { entry, scope, gameData, onAccepted, expandedChoices, documentRef = globalThis.document } = {}) {
  if (!entry?.grants?.some(grant => grant.type === "trait")) return null;
  const sourceId = traitSourceIdentity(entry);
  if (!sourceId || !getTraitSourceDisplay(projectCharacterTraits(page.getCharacter(), gameData), sourceId).providers.length) return null;
  const mount = documentRef.createElement("section");
  mount.className = "traitWidget";
  mount.setAttribute("aria-label", `Traits granted by ${entry.name || "this feature"}`);
  return new TraitWidget(page, { id: `traits:${sourceId}`, sourceId, scope, gameData, mount, onAccepted, expandedChoices });
}
export function registerTraitWidgetExtension(registry, { documentRef = globalThis.document } = {}) {
  registry.register("trait", ({ page, entry, index, scope, gameData, onChange, expandedChoices }) => {
    if (index !== entry.grants.findIndex(grant => grant.type === "trait")) return null;
    return createTraitGrantWidget(page, { entry, scope, gameData, documentRef, onAccepted: onChange, expandedChoices });
  });
  return registry;
}
