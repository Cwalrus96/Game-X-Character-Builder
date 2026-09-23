import { SetGrantChoices } from "../../core/character-commands.js";
import { buildKeystoneAnswer, getKeystoneChoices, KEYSTONE_TEXT_LIMIT } from "../../core/keystone-rules.js";
import { isGameDataGrantExecutable } from "../../core/selection-rules.js";
import { escapeHtml, sanitizeText } from "../../core/data-sanitization.js";
import { renderSelectedChoiceHtml } from "./selected-choice-display.js";

export class KeystoneChoiceWidget {
  constructor(page, { choice, scope = "dynamic", onAccepted, documentRef = globalThis.document } = {}) {
    this.page = page;
    this.choice = choice;
    this.id = `keystone-choice:${choice.choiceId}`;
    this.scope = scope;
    this.enabled = true;
    this.busy = false;
    this.error = "";
    this.onAccepted = onAccepted;
    this.element = documentRef.createElement("section");
    this.element.className = "builderItem keystoneWidget";
    this.onChange = (event) => this.change(event);
    this.element.addEventListener("change", this.onChange);
    page.registerWidget(this);
    this.render();
  }

  async change(event) {
    if (this.busy || !this.enabled || event.target?.dataset?.keystoneChoice !== this.choice.choiceId) return;
    const value = sanitizeText(event.target.value, { maxLen: KEYSTONE_TEXT_LIMIT, collapse: true });
    const choices = { ...this.page.getCharacter().builder.grantChoices };
    if ((choices[this.choice.choiceId]?.value || "") === value) return;
    if (value) choices[this.choice.choiceId] = buildKeystoneAnswer(this.choice, value);
    else delete choices[this.choice.choiceId];
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this, SetGrantChoices(choices));
      if (!result.ok && result.reason !== "cancelled") this.error = result.errors?.join(" ") || "Could not update this Keystone.";
      if (result.ok) this.onAccepted?.();
    } catch (error) {
      this.error = error.message || "Could not update this Keystone.";
    } finally {
      this.busy = false;
      this.render();
      const current = this.page.widgets?.get(this.id) || this;
      current.element?.querySelector("textarea")?.focus();
    }
  }

  render() {
    const value = this.page.getCharacter().builder.grantChoices[this.choice.choiceId]?.value || "";
    const disabled = this.busy || !this.enabled;
    const controlId = `${this.id}:text`;
    this.element.setAttribute("aria-busy", String(this.busy));
    this.element.innerHTML = `<label class="label" for="${escapeHtml(controlId)}">${escapeHtml(this.choice.label)}</label>
      <textarea class="input" id="${escapeHtml(controlId)}" data-keystone-choice="${escapeHtml(this.choice.choiceId)}" maxlength="${KEYSTONE_TEXT_LIMIT}" rows="3" placeholder="Describe your Keystone…"${disabled ? " disabled" : ""}>${escapeHtml(value)}</textarea>
      ${this.error ? `<p class="error" role="alert">${escapeHtml(this.error)}</p>` : ""}
      ${renderSelectedChoiceHtml({ choiceId: this.choice.choiceId, selectedKey: value ? this.choice.choiceId : "", label: "Your Keystone", contentHtml: `<div class="optionDesc">${escapeHtml(value)}</div>` })}`;
    return this.element;
  }

  applyReconciledState() { this.render(); }
  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }
  destroy({ unregister = true } = {}) {
    this.element.removeEventListener("change", this.onChange);
    this.element.remove?.();
    if (unregister) this.page.unregisterWidget(this);
  }
}

export function createKeystoneGrantWidgets(page, { entry, sourceId, scope, onAccepted, documentRef } = {}) {
  return (entry?.grants || []).flatMap((grant, index) => {
    if (!isGameDataGrantExecutable(grant, { source: entry })) return [];
    return getKeystoneChoices(grant, { sourceId, index, sourceLabel: entry.name || "Keystone" })
      .map((choice) => new KeystoneChoiceWidget(page, { choice, scope, onAccepted, documentRef }));
  });
}

export function registerKeystoneWidgetExtension(registry, { documentRef = globalThis.document } = {}) {
  const previous = registry.get("choice");
  registry.remove("choice");
  registry.register("choice", (context) => {
    const { page, grant, entry, sourceId, index, scope, onChange } = context;
    const choices = getKeystoneChoices(grant, { sourceId, index, sourceLabel: entry.name || "Keystone" });
    if (!choices.length) return previous?.(context) || null;
    if (!isGameDataGrantExecutable(grant, { source: entry })) return [];
    return choices.map((choice) => new KeystoneChoiceWidget(page, { choice, scope, onAccepted: onChange, documentRef }));
  });
  return registry;
}
