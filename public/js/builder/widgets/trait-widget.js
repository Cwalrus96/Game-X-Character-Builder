import { SetTraitChoice, RemoveTraitChoice } from "../../core/character-commands.js";
import { projectCharacterTraits, traitSourceIdentity } from "../../core/trait-rules.js";
import { escapeHtml } from "../../core/data-sanitization.js";
import { getTraitSourceDisplay, renderTraitCardHtml, renderTraitProjectionHtml } from "../../core/trait-display.js?v=wpe3";
import { renderSelectedChoiceHtml } from "./selected-choice-display.js";
import { renderRuleDetailsHtml, bindRuleDetails } from "./rule-details.js";

/** A portable session client. Eligibility and ownership come entirely from Rules. */
export class TraitWidget {
  constructor(page, {
    id = "traits", scope = "traits", gameData, mount, documentRef = globalThis.document,
    project = projectCharacterTraits, onRejected = null, sourceId = "", onAccepted = null, expandedChoices = new Set(),
  } = {}) {
    if (!mount || typeof project !== "function") throw new TypeError("TraitWidget requires a mount and Trait projection.");
    this.id = id;
    this.scope = scope;
    this.page = page;
    this.gameData = gameData;
    this.element = mount;
    this.documentRef = documentRef;
    this.project = project;
    this.sourceId = sourceId;
    this.expandedChoices = expandedChoices;
    this.onAccepted = typeof onAccepted === "function" ? onAccepted : null;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.character = page.getCharacter();
    this.busy = false;
    this.enabled = true;
    this.error = "";
    this.onChange = (event) => this.#change(event);
    this.onClick = (event) => this.#toggleExpanded(event);
    mount.addEventListener("change", this.onChange);
    mount.addEventListener("click", this.onClick);
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState(character) {
    this.character = character;
    this.render();
  }

  focusChoice(selector) {
    (this.element.querySelector?.(`${selector}:checked`) || this.element.querySelector?.(selector))?.focus?.();
  }

  #toggleExpanded(event) {
    const target = event.target;
    if (this.busy || !this.enabled || target?.dataset?.traitExpand === undefined) return;
    if (target.dataset.traitWidget !== this.id) return;
    const index = Number(target.dataset.traitExpand);
    const choice = this.projection.choices?.[index];
    if (!choice) return;
    if (this.expandedChoices.has(choice.choiceId)) this.expandedChoices.delete(choice.choiceId);
    else this.expandedChoices.add(choice.choiceId);
    this.render();
    this.element.querySelector?.(`[data-trait-expand="${index}"]`)?.focus?.();
  }

  async #submit(command) {
    if (this.busy || !this.enabled) return;
    const focusControl = this.focusControl;
    let accepted = false;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this, command);
      accepted = result.ok;
      if (!result.ok) {
        if (result.reason !== "cancelled") this.error = result.errors?.join(" ") || "That Trait change could not be applied.";
        this.onRejected?.(result);
      }
      this.character = this.page.getCharacter();
    } catch (error) {
      this.error = error.message || "That Trait change could not be applied.";
      this.onRejected?.({ ok: false, errors: [this.error], error });
    } finally {
      this.busy = false;
      this.render();
    }
    if (accepted) this.onAccepted?.();
    const replacement = this.page.widgets?.get(this.id);
    if (replacement && replacement !== this && focusControl) {
      replacement.focusChoice(focusControl);
    }
  }

  #change(event) {
    if (this.busy || !this.enabled) return;
    const target = event.target;
    if (target?.dataset?.traitWidget && target.dataset.traitWidget !== this.id) return;
    if (target?.dataset?.traitChoice !== undefined) {
      this.character = this.page.getCharacter();
      this.projection = this.getProjection();
      const choice = this.projection.choices?.[Number(target.dataset.traitChoice)];
      if (!choice || target.value === choice.traitKey) return;
      this.focusControl = `[data-trait-choice="${Number(target.dataset.traitChoice)}"]`;
      if (!target.value) return choice.traitKey ? this.#submit(RemoveTraitChoice(choice.choiceId)) : this.render();
      const option = choice.options?.find((option) => option.traitKey === target.value);
      if (option?.eligible !== true) return this.render();
      return this.#submit(SetTraitChoice({ choiceId: choice.choiceId, sourceId: choice.sourceId, recipientId: choice.recipientId, traitKey: option.traitKey }));
    }
  }

  getProjection() {
    const projection = this.project(this.character, this.gameData);
    return this.sourceId ? getTraitSourceDisplay(projection, this.sourceId) : projection;
  }

  render() {
    this.projection = this.getProjection();
    const disabled = this.busy || !this.enabled;
    const choices = (this.projection.choices || []).map((choice, index) => {
      const controlId = `${this.id}-choice-${index}`;
      const options = (choice.options || []).filter((option) => option.eligible === true);
      const expanded = this.expandedChoices.has(choice.choiceId);
      const inputAttributes = `data-trait-widget="${escapeHtml(this.id)}" data-trait-choice="${index}"${disabled ? " disabled" : ""}`;
      const radio = (key, name) => `<input type="radio" name="${escapeHtml(controlId)}" value="${escapeHtml(key)}" aria-label="${escapeHtml(name)}"${key === choice.traitKey ? " checked" : ""} ${inputAttributes}>`;
      const renderCard = (option) => {
        const definition = (this.gameData.traits || []).find((trait) => trait.traitKey === option.traitKey) || option;
        const acquired = (this.projection.traits || []).find((trait) => trait.choiceId === choice.choiceId && trait.traitKey === option.traitKey);
        const card = { ...definition, ...acquired, rank: choice.rank ?? option.rank, sourceLabel: "", sourceDescription: "" };
        return renderTraitCardHtml(card, { gameData: this.gameData, status: acquired ? "Acquired" : "Available" });
      };
      const references = (option, view) => renderRuleDetailsHtml((this.gameData.traits || []).find((trait) => trait.traitKey === option?.traitKey), {
        gameData: this.gameData, page: this.page, identity: `${choice.choiceId}:${view}:${option?.traitKey}`,
      });
      const selected = (choice.options || []).find((option) => option.traitKey === choice.traitKey);
      const selectedDetail = renderSelectedChoiceHtml({
        choiceId: choice.choiceId, selectedKey: choice.traitKey, label: "Selected Trait",
        contentHtml: selected ? renderCard(selected) + references(selected, "selected") : "",
      });
      const selector = expanded
        ? `<fieldset class="traitOptions optionList" id="${escapeHtml(controlId)}" aria-labelledby="${escapeHtml(controlId)}-label">
            <label class="optionRow">${radio("", "No Trait selected")}<span>No Trait selected</span></label>
            ${options.map((option) => {
              return `<div class="traitDescriptionOption"><label class="optionRow">${radio(option.traitKey, option.name || option.traitKey)}<div>${renderCard(option)}</div></label>${references(option, "candidate")}</div>`;
            }).join("")}
          </fieldset>`
        : `<select class="input" id="${escapeHtml(controlId)}" aria-labelledby="${escapeHtml(controlId)}-label" ${inputAttributes}>
            <option value="">${choice.traitKey ? "Remove selected Trait" : "Choose a Trait…"}</option>
            ${options.map((option) => `<option value="${escapeHtml(option.traitKey)}"${option.traitKey === choice.traitKey ? " selected" : ""}>${escapeHtml(option.name || option.traitKey)}</option>`).join("")}
          </select>`;
      return `<div class="builderItem"><div class="traitChoiceHeader">
          <span class="label" id="${escapeHtml(controlId)}-label">${escapeHtml(choice.label || "Choose a Trait")}</span>
          <button type="button" class="btn secondary" data-trait-expand="${index}" data-trait-widget="${escapeHtml(this.id)}" aria-expanded="${expanded}" aria-controls="${escapeHtml(controlId)}"${disabled ? " disabled" : ""}>${expanded ? "Collapse" : "Expand"}</button>
        </div>${selector}${selectedDetail}${!options.length ? '<p class="help">No eligible Traits are currently available for this choice.</p>' : ""}</div>`;
    }).join("");
    this.element.setAttribute("aria-busy", String(this.busy));
    // Each choice owns its selected description above; only automatic grants belong here.
    const summary = { ...this.projection, traits: (this.projection.traits || []).filter((trait) => !trait.choiceId), tags: [] };
    this.element.innerHTML = `<h3 class="h3">Traits</h3>${this.error ? `<p role="alert" class="error">${escapeHtml(this.error)}</p>` : ""}${choices}${renderTraitProjectionHtml(summary, { gameData: this.gameData, ...(this.sourceId || choices ? { emptyMessage: "" } : {}) })}`;
    bindRuleDetails(this.element, this.page);
    if (!disabled && this.focusControl) {
      this.focusChoice(this.focusControl);
      this.focusControl = null;
    }
  }

  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }

  destroy({ unregister = true } = {}) {
    this.element.removeEventListener("change", this.onChange);
    this.element.removeEventListener("click", this.onClick);
    this.element.innerHTML = "";
    if (unregister) this.page.unregisterWidget(this);
  }
}

export function createTraitGrantWidget(page, { entry, scope, gameData, onAccepted, expandedChoices, documentRef = globalThis.document } = {}) {
  if (!entry?.grants?.some((grant) => grant.type === "trait")) return null;
  const sourceId = traitSourceIdentity(entry);
  if (!sourceId || !getTraitSourceDisplay(projectCharacterTraits(page.getCharacter(), gameData), sourceId).providers.length) return null;
  const mount = documentRef.createElement("section");
  mount.className = "traitWidget";
  mount.setAttribute("aria-label", `Traits granted by ${entry.name || "this feature"}`);
  return new TraitWidget(page, { id: `traits:${sourceId}`, sourceId, scope, gameData, mount, onAccepted, expandedChoices });
}

export function registerTraitWidgetExtension(registry, { documentRef = globalThis.document } = {}) {
  registry.register("trait", ({ page, entry, index, scope, gameData, onChange, expandedChoices }) => {
    // A feature's Trait grants share one widget, with separate source-owned choices.
    if (index !== entry.grants.findIndex((grant) => grant.type === "trait")) return null;
    return createTraitGrantWidget(page, { entry, scope, gameData, documentRef, onAccepted: onChange, expandedChoices });
  });
  return registry;
}
