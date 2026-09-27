const INPUT_ERROR = "Enter a whole number, or an adjustment such as +16 or -21.";
const MAX_HP_VALUE = 999999; // Existing sheet storage/input bound, not maximum character HP.

export function parseHpInput(raw, current = "") {
  const text = String(raw ?? "").trim();
  const match = /^([+-]?)(\d+)$/.exec(text);
  if (!match) return { ok: false, error: INPUT_ERROR };

  const amount = Number(match[2]);
  if (!Number.isSafeInteger(amount) || amount > MAX_HP_VALUE) {
    return { ok: false, error: "Use a whole number from 0 to 999999." };
  }

  let value = amount;
  if (match[1]) {
    const base = String(current ?? "").trim();
    if (!/^\d+$/.test(base) || !Number.isSafeInteger(Number(base)) || Number(base) > MAX_HP_VALUE) {
      return { ok: false, error: "Set current HP before using an adjustment." };
    }
    value = Math.max(0, Number(base) + (match[1] === "-" ? -amount : amount));
  }
  if (value > MAX_HP_VALUE) {
    return { ok: false, error: "Current HP cannot exceed 999999." };
  }
  return { ok: true, value: String(value) };
}

// Keep the accepted HP separate from the editing text: another field's autosave
// must never persist an unfinished adjustment or apply a delta a second time.
export function createSheetHpControl({ input, error, onCommit }) {
  let value = input.value;

  function showError(message = "") {
    input.setCustomValidity(message);
    input.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message;
    error.hidden = !message;
  }

  function setValue(next) {
    value = String(next ?? "");
    input.value = value;
    showError();
  }

  function commit() {
    if (input.disabled || input.readOnly || input.value === value) return;
    const result = parseHpInput(input.value, value);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    const changed = result.value !== value;
    setValue(result.value);
    if (changed) onCommit();
  }

  input.addEventListener("input", () => showError());
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setValue(value);
    }
  });

  return {
    getValue: () => value,
    setValue,
    setEnabled: (enabled) => { input.disabled = !enabled; },
  };
}
