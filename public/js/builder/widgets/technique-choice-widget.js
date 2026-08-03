import { getChoiceCountState } from "../../core/choice-capacity.js";
import { escapeHtml, sanitizeNamedSkillList, sanitizeText } from "../../core/data-sanitization.js";
import {
  computeGrantedSkillsState,
  getGameXTechniques,
} from "../../core/game-data.js";
import { meetsPrerequisites } from "../../core/prerequisites.js";
import { renderTechniqueProfileHtml } from "../../core/technique-utils.js";
import { BuilderWidget } from "./builder-widget.js";

function techniqueName(technique) {
  return sanitizeText(technique?.techniqueName || "", { maxLen: 200, collapse: true });
}

function techniqueRank(technique) {
  const rank = Number.parseInt(String(technique?.rank ?? 0), 10);
  return Number.isFinite(rank) ? rank : 0;
}

function techniqueSkill(technique) {
  return sanitizeText(technique?.skill, { maxLen: 96, collapse: true });
}

function normalizeSkill(value) {
  return sanitizeText(value, { maxLen: 96, collapse: true }).toLowerCase();
}

function compareTechniqueOptions(a, b) {
  const aRank = techniqueRank(a);
  const bRank = techniqueRank(b);
  if (aRank !== bRank) return aRank - bRank;
  return techniqueName(a).localeCompare(techniqueName(b));
}

export class TechniqueChoiceWidget extends BuilderWidget {
  constructor(page, {
    grant,
    choice,
    choiceId = "",
    gameData = null,
    getBuilder = null,
    getGrantChoices = null,
    sourceId = "",
    sourceLabel = "",
    onChange = null,
    scope = "dynamic",
  } = {}) {
    super(page, { id: `technique-choice:${choiceId}`, scope });
    this.grant = grant || {};
    this.choice = choice || null;
    this.choiceId = sanitizeText(choiceId, { maxLen: 96, collapse: true });
    this.gameData = gameData || {};
    this.getBuilder = typeof getBuilder === "function" ? getBuilder : () => ({});
    this.getGrantChoices = typeof getGrantChoices === "function" ? getGrantChoices : null;
    this.sourceId = sanitizeText(sourceId, { maxLen: 260, collapse: true });
    this.sourceLabel = sanitizeText(sourceLabel, { maxLen: 200, collapse: true });
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.element = this.render();
  }

  getSavePatch({ grantChoices = null } = {}) {
    return {
      "builder.grantChoices": this.getGrantChoices?.() || grantChoices || {},
    };
  }

  getContext() {
    const builder = this.getBuilder() || {};
    return {
      builder,
      grantedSkillState: computeGrantedSkillsState(this.gameData, builder),
    };
  }

  getTechniqueSkillRank(technique, context) {
    const skillName = techniqueSkill(technique);
    if (!skillName) return techniqueRank(technique);

    let rank = 0;
    const grantedCombat = Array.isArray(context.grantedSkillState?.grantedCombatSkills)
      ? context.grantedSkillState.grantedCombatSkills
      : [];
    for (const row of grantedCombat) {
      const skill = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
      if (skill !== skillName) continue;
      const value = Number.parseInt(String(row?.rank || "0"), 10);
      if (Number.isFinite(value)) rank = Math.max(rank, value);
    }

    const repeatables = context.builder?.sheet?.repeatables;
    const extraCombatSkills = sanitizeNamedSkillList(repeatables?.combatSkillsExtra, { maxItems: 50 });
    for (const row of extraCombatSkills) {
      const skill = sanitizeText(row?.skill, { maxLen: 96, collapse: true });
      if (skill !== skillName) continue;
      const value = Number.parseInt(String(row?.rank || "0"), 10);
      if (Number.isFinite(value)) rank = Math.max(rank, value);
    }

    return rank;
  }

  getAvailableTechniques(context = this.getContext()) {
    const grantSkill = normalizeSkill(this.grant?.skill || this.grant?.name || this.grant?.key);
    if (!grantSkill) return [];

    return getGameXTechniques(this.gameData)
      .filter((technique) => techniqueName(technique))
      .filter((technique) => normalizeSkill(techniqueSkill(technique)) === grantSkill)
      .filter((technique) => this.getTechniqueSkillRank(technique, context) >= techniqueRank(technique))
      .filter((technique) => meetsPrerequisites(technique?.prerequisites, {
        gameData: this.gameData,
        builder: context.builder,
        grantedSkillState: context.grantedSkillState,
        deferUnresolvedChoices: true,
      }))
      .slice()
      .sort(compareTechniqueOptions);
  }

  render() {
    const context = this.getContext();
    const options = this.getAvailableTechniques(context);
    const selectedTechnique = sanitizeText(this.choice?.techniqueName || this.choice?.value, {
      maxLen: 200,
      collapse: true,
    });
    const skillLabel = sanitizeText(this.grant?.skill || this.grant?.name || "Technique", {
      maxLen: 96,
      collapse: true,
    });
    const count = Number.parseInt(String(this.grant?.count ?? 1), 10);
    const countState = getChoiceCountState({
      selectedCount: selectedTechnique ? 1 : 0,
      expectedCount: Number.isFinite(count) ? Math.max(1, count) : 1,
      noun: "technique",
    });

    const field = document.createElement("div");
    field.className = "grantChoiceWidget";

    const label = document.createElement("label");
    label.className = "label";
    label.textContent = `Choose ${skillLabel} Technique`;

    const select = document.createElement("select");
    select.className = "input";
    select.innerHTML = `<option value="">Choose a technique...</option>` + options
      .map((technique) => {
        const name = techniqueName(technique);
        const rank = techniqueRank(technique);
        const selected = selectedTechnique === name ? " selected" : "";
        return `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)} (Rank ${rank})</option>`;
      })
      .join("");
    select.disabled = !this.choiceId || !options.length;
    select.addEventListener("change", () => {
      const technique = sanitizeText(select.value, { maxLen: 200, collapse: true });
      this.onChange?.(technique
        ? {
            type: "technique",
            techniqueName: technique,
            value: technique,
            skill: skillLabel,
            sourceId: this.sourceId,
            sourceLabel: this.sourceLabel,
          }
        : {
            type: "technique",
            techniqueName: "",
            value: "",
            skill: "",
            sourceId: "",
            sourceLabel: "",
          });
    });

    field.append(label, select);

    if (!options.length) {
      const help = document.createElement("div");
      help.className = "help";
      help.textContent = `No available ${skillLabel} techniques meet current prerequisites.`;
      field.append(help);
      return field;
    }

    const help = document.createElement("div");
    help.className = "help";
    help.textContent = `Selected: ${countState.selectedCount}/${countState.expectedCount}`;
    field.append(help);

    if (selectedTechnique) {
      const technique = options.find((item) => techniqueName(item) === selectedTechnique);
      if (technique) {
        const detail = document.createElement("div");
        detail.className = "help";
        detail.innerHTML = renderTechniqueProfileHtml(technique, {
          rankValue: this.getTechniqueSkillRank(technique, context),
          heading: selectedTechnique,
          headingTag: "div",
          headingClass: "optionTitle",
          showRank: true,
        });
        field.append(detail);
      }
    }

    return field;
  }
}
