import { escapeHtml } from "../core/data-sanitization.js";
import { isGameDataRecordExecutable } from "../core/selection-rules.js";
import { canonicalSkillKey } from "../core/skill-identity.js";
import { createRollDialog } from "../builder/widgets/roll-widget.js?v=dice3d1";

/** Sheet coordinator only: roll controls never participate in character saves. */
export function createSheetRolls({ root = document, createDialog = createRollDialog } = {}) {
  const requests = new Map();
  let character = null, ready = false, sequence = 0;
  const dialog = createDialog();

  function setReady(value) {
    ready = Boolean(value);
    root.querySelectorAll("[data-sheet-roll], [data-roll-attribute], [data-roll-skill]").forEach(button => { button.disabled = !ready; });
    if (!ready) dialog.close?.();
  }
  function open(request, opener) {
    if (ready && character) dialog.open({ ...character, ...request }, opener);
  }
  root.addEventListener("click", event => {
    const button = event.target.closest?.("[data-sheet-roll], [data-roll-attribute], [data-roll-skill]");
    if (!button) return;
    if (button.dataset.rollAttribute) open({ attributeKey: button.dataset.rollAttribute }, button);
    else if (button.dataset.rollSkill) open({ skillKey: button.dataset.rollSkill }, button);
    else {
      const request = requests.get(button.dataset.sheetRoll);
      if (request) open({ ...request, quick: button.dataset.rollMode === "quick", modifiers: button.dataset.rollMode === "modifiers" }, button);
    }
  });

  return {
    setReady,
    setCharacter(value) { character = value; requests.clear(); },
    skillControl(name, label, value) {
      return `<button type="button" class="skill-chip skill-chip-static sheet-skill-roll" data-roll-skill="${escapeHtml(canonicalSkillKey(name))}" ${ready ? "" : "disabled"} aria-label="Roll ${escapeHtml(label)}"><span class="skill-chip-label">${escapeHtml(label)}</span><span class="skill-chip-value">${escapeHtml(value) || "&mdash;"}</span></button>`;
    },
    buttonFor(technique, context = {}) {
      if (!isGameDataRecordExecutable(technique) || technique.rollRequired === false && !technique.basicAttack?.length) return "";
      const id = String(++sequence);
      requests.set(id, { technique, ...context });
      const name = escapeHtml(technique.techniqueName || technique.profileName || "technique");
      return `<div class="sheet-technique-rolls"><button type="button" class="sheet-roll-button sheet-quick-roll" data-sheet-roll="${id}" data-roll-mode="quick" ${ready ? "" : "disabled"} aria-label="Quick Roll ${name}">Quick Roll</button><button type="button" class="sheet-roll-button" data-sheet-roll="${id}" data-roll-mode="modifiers" ${ready ? "" : "disabled"} aria-label="Roll with Modifiers ${name}">Roll with Modifiers</button></div>`;
    },
  };
}
