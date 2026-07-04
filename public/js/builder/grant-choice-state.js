import { sanitizeText } from "../core/data-sanitization.js";

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return String(value ?? "").trim() !== "";
}

export class GrantChoiceState {
  constructor({
    getChoices,
    setChoices,
    onChange,
  } = {}) {
    this.getChoices = typeof getChoices === "function" ? getChoices : () => ({});
    this.setChoices = typeof setChoices === "function" ? setChoices : () => {};
    this.onChange = typeof onChange === "function" ? onChange : null;
  }

  getChoice(choiceId) {
    const id = sanitizeText(choiceId, { maxLen: 96, collapse: true });
    return id ? (this.getChoices()[id] || null) : null;
  }

  updateChoice(choiceId, patch = {}) {
    const id = sanitizeText(choiceId, { maxLen: 96, collapse: true });
    if (!id) return;

    const choices = { ...this.getChoices() };
    const previous = choices[id] || {};
    const next = { ...previous, ...patch, choiceId: id, type: patch.type || previous.type || "" };

    const hasStoredValue = Object.entries(next)
      .some(([key, value]) => key !== "choiceId" && key !== "type" && hasMeaningfulValue(value));
    if (!hasStoredValue) delete choices[id];
    else choices[id] = next;

    this.setChoices(choices);
    this.onChange?.({ choiceId: id, choice: choices[id] || null });
  }
}
