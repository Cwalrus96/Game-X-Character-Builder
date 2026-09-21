import { SetTraitChoice, RemoveTraitChoice } from "../../core/character-commands.js";
import { projectCharacterTraits } from "../../core/trait-rules.js";
import { escapeHtml } from "../../core/data-sanitization.js";
import { renderTraitProjectionHtml } from "../../core/trait-display.js";

/** A portable session client. Eligibility and ownership come entirely from Rules. */
export class TraitWidget {
  constructor(page, {
    id = "traits", scope = "traits", gameData, mount, documentRef = globalThis.document,
    project = projectCharacterTraits, onRejected = null,
  } = {}) {
    if (!mount || typeof project !== "function") throw new TypeError("TraitWidget requires a mount and Trait projection.");
    this.id = id;
    this.scope = scope;
    this.page = page;
    this.gameData = gameData;
    this.element = mount;
    this.documentRef = documentRef;
    this.project = project;
    this.onRejected = typeof onRejected === "function" ? onRejected : null;
    this.character = page.getCharacter();
    this.busy = false;
    this.enabled = true;
    this.error = "";
    this.onChange = (event) => this.#change(event);
    mount.addEventListener("change", this.onChange);
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState(character) {
    this.character = character;
    this.render();
  }

  async #submit(command) {
    if (this.busy || !this.enabled) return;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this, command);
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
  }

  #change(event) {
    if (this.busy || !this.enabled) return;
    const target = event.target;
    if (target?.dataset?.traitChoice !== undefined) {
      const choice = this.projection.choices?.[Number(target.dataset.traitChoice)];
      if (!choice) return;
      this.focusControl = `[data-trait-choice="${Number(target.dataset.traitChoice)}"]`;
      if (!target.value) return choice.traitKey ? this.#submit(RemoveTraitChoice(choice.choiceId)) : this.render();
      const option = choice.options?.find((option) => option.traitKey === target.value);
      if (option?.eligible !== true) return this.render();
      return this.#submit(SetTraitChoice({ choiceId: choice.choiceId, sourceId: choice.sourceId, recipientId: choice.recipientId, traitKey: option.traitKey }));
    }
  }

  render() {
    this.projection = this.project(this.character, this.gameData);
    const disabled = this.busy || !this.enabled;
    const choices = (this.projection.choices || []).map((choice, index) => {
      const controlId = `${this.id}-choice-${index}`;
      const options = (choice.options || []).map((option) => `<option value="${escapeHtml(option.traitKey)}"${option.traitKey === choice.traitKey ? " selected" : ""}${option.eligible === true ? "" : " disabled"}>${escapeHtml(option.name || option.traitKey)}${Number.isInteger(option.rank) ? ` — Rank ${option.rank}` : ""}${option.reason ? ` — ${escapeHtml(option.reason)}` : ""}</option>`).join("");
      return `<div class="builderItem"><label class="label" for="${escapeHtml(controlId)}">${escapeHtml(choice.label || "Choose a Trait")}</label><select class="input" id="${escapeHtml(controlId)}" data-trait-choice="${index}"${disabled ? " disabled" : ""}><option value="">Choose a Trait…</option>${options}</select></div>`;
    }).join("");
    this.element.setAttribute("aria-busy", String(this.busy));
    this.element.innerHTML = `<h3 class="h3">Traits</h3>${this.error ? `<p role="alert" class="error">${escapeHtml(this.error)}</p>` : ""}${choices}${renderTraitProjectionHtml(this.projection, { gameData: this.gameData })}`;
    if (!disabled && this.focusControl) {
      this.element.querySelector?.(this.focusControl)?.focus?.();
      this.focusControl = null;
    }
  }

  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }

  destroy({ unregister = true } = {}) {
    this.element.removeEventListener("change", this.onChange);
    this.element.innerHTML = "";
    if (unregister) this.page.unregisterWidget(this);
  }
}
