import { APPEARANCE_DEFAULTS, APPEARANCE_LABELS, APPEARANCE_OPTIONS, appearanceVariables, appearanceContrastWarning, createAppearanceEditor } from "../../core/sheet-appearance.js";
import { renderDiceResults } from "./components/dice-view.js";
import { restoreDialogFocus } from "../../core/dialog-lifecycle.js";
import { buildDicePool, resolveDicePool } from "../../core/roll-rules.js";

// A deterministic style sample, never a game roll and never added to roll history.
const sampleFaces = [5, 6, 2, 2].values();
export const DICE_STYLE_SAMPLE = resolveDicePool(
  buildDicePool({ attribute: 3, skillRank: 0, modifiers: [.5] }),
  () => sampleFaces.next().value,
);

/** Portable presentation editor. The page owns saving; this widget owns no character model. */
export function createSheetSettings({ button, target = document.body, onChange = () => {} }) {
  const dialog = document.createElement("dialog");
  dialog.id = "sheet-settings";
  dialog.className = "sheet-settings";
  dialog.setAttribute("aria-labelledby", "sheet-settings-title");
  const colors = Object.keys(APPEARANCE_DEFAULTS).filter(key => key.endsWith("Color"));
  const select = key => `<label class="appearance-field" for="appearance-${key}">${APPEARANCE_LABELS[key]}<select id="appearance-${key}" data-setting="${key}">${Object.entries(APPEARANCE_OPTIONS[key]).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>`;
  dialog.innerHTML = `<header class="settings-header"><h2 id="sheet-settings-title">Sheet settings</h2><button type="button" data-settings-close aria-label="Close sheet settings">×</button></header>
    <div class="settings-body"><p class="settings-help">Make this character’s sheet your own. Changes apply immediately and save automatically.</p>
      <fieldset><legend>Fonts &amp; readability</legend>
      <label class="appearance-readability" for="appearance-dyslexiaFriendly"><input type="checkbox" id="appearance-dyslexiaFriendly" data-setting="dyslexiaFriendly" aria-describedby="appearance-readability-help"/><span><strong>Dyslexia-friendly font</strong><small>OpenDyslexic · whole sheet</small></span></label>
      <p id="appearance-readability-help" class="settings-help">Use OpenDyslexic for headings, text and controls. Your heading choice is kept when you switch back.</p>
      ${select("headingFont")}
      <div class="settings-font-preview" aria-label="Font preview"><strong>Starlight Adventures</strong><span>Your story, your character, your style.</span></div>
      ${select("textSize")}</fieldset>
      <fieldset><legend>Appearance</legend>${colors.map(key => `<div class="appearance-color"><label for="appearance-${key}">${APPEARANCE_LABELS[key]}</label><input type="color" data-swatch="${key}" aria-label="${APPEARANCE_LABELS[key]} swatch"/><input type="text" id="appearance-${key}" data-setting="${key}" aria-describedby="appearance-color-help" spellcheck="false" maxlength="7" autocomplete="off"/></div>`).join("")}
      <p id="appearance-color-help" class="settings-help">Use a swatch or a six-digit hex color, such as #111111.</p>
      <p id="appearance-color-error" class="settings-notice" role="status" hidden>Enter a color like #336699. Your last valid color is still applied.</p>
      <p id="appearance-contrast" class="settings-notice" role="status" hidden></p>
      ${select("corners")}</fieldset>
      <fieldset><legend>Dice</legend>${select("diceTheme")}
      <div class="settings-dice-preview" aria-label="Dice style preview"></div><p class="settings-help">Style preview · sample faces</p>
      <label class="appearance-check"><input type="checkbox" data-setting="animateDice"/> Animate dice</label>
      <label class="appearance-check"><input type="checkbox" data-setting="diceEffects"/> Particle effects</label>
      <p class="settings-help">Magical Girl dice burst with stars and hearts. Effects respect your device’s reduced-motion setting.</p>
      <button type="button" data-preview-dice>Preview animation</button></fieldset>
      <button type="button" data-reset-appearance>Reset appearance</button><p class="settings-help">Restores this character’s black-and-white sheet and classic dice.</p>
    </div>`;
  document.body.append(dialog);
  const editor = createAppearanceEditor(values => { render(values); onChange(values); });
  const preview = animate => {
    const p = editor.get();
    dialog.querySelector(".settings-dice-preview").innerHTML = renderDiceResults(DICE_STYLE_SAMPLE, {
      theme: p.diceTheme, effects: p.diceEffects,
      animate: animate && p.animateDice && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    });
  };
  function render(values) {
    for (const [key, value] of Object.entries(appearanceVariables(values))) target.style.setProperty(key, value);
    dialog.querySelector("#appearance-headingFont").disabled = values.dyslexiaFriendly;
    dialog.querySelectorAll("[data-setting], [data-swatch]").forEach(input => {
      const value = values[input.dataset.setting || input.dataset.swatch];
      if (input.type === "checkbox") input.checked = value;
      else if (input !== document.activeElement && input.getAttribute("aria-invalid") !== "true") input.value = value;
    });
    const warning = dialog.querySelector("#appearance-contrast");
    warning.textContent = appearanceContrastWarning(values); warning.hidden = !warning.textContent;
    preview(false);
  }
  function clearErrors() {
    dialog.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute("aria-invalid"));
    dialog.querySelector("#appearance-color-error").hidden = true;
  }
  dialog.addEventListener("input", event => {
    const input = event.target, key = input.dataset.setting || input.dataset.swatch;
    if (!key) return;
    const valid = editor.change(key, input.type === "checkbox" ? input.checked : input.value.trim());
    input.setAttribute("aria-invalid", String(!valid));
    if (input.dataset.swatch) {
      const text = dialog.querySelector(`#appearance-${key}`);
      text.value = editor.get()[key]; text.removeAttribute("aria-invalid");
    }
    dialog.querySelector("#appearance-color-error").hidden = !dialog.querySelector('[aria-invalid="true"]');
  });
  const close = () => { if (dialog.open) dialog.close(); };
  button.setAttribute("aria-controls", dialog.id); button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    if (dialog.open) close();
    else { dialog.show(); button.setAttribute("aria-expanded", "true"); dialog.querySelector("[data-settings-close]").focus({ preventScroll: true }); }
  });
  dialog.querySelector("[data-settings-close]").addEventListener("click", close);
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); close(); } });
  dialog.addEventListener("close", () => { button.setAttribute("aria-expanded", "false"); restoreDialogFocus(button); });
  dialog.querySelector("[data-preview-dice]").addEventListener("click", () => preview(true));
  dialog.querySelector("[data-reset-appearance]").addEventListener("click", () => { clearErrors(); editor.reset(); });
  render(editor.get());
  return {
    load(source) { clearErrors(); const values = editor.load(source); render(values); return values; },
    get: editor.get, patch: editor.patch, acknowledge: editor.acknowledge, change: editor.change,
    setReady(ready) { button.disabled = !ready; if (!ready) close(); },
  };
}
