import { getChoiceCountState } from "../../core/choice-capacity.js";
import { escapeHtml, sanitizeNamedSkillList, sanitizeText } from "../../core/data-sanitization.js";
import {
  getGameXTechniques,
} from "../../core/game-data.js";
import { computeGrantedSkillsState, getCombatSkillRanks } from "../../core/skill-rules.js";
import { canonicalSkillName, canonicalStoredSkillKey } from "../../core/skill-identity.js";
import { getTechniqueSelectionState, isGameDataRecordSelectable } from "../../core/selection-rules.js";
import { meetsPrerequisites } from "../../core/prerequisites.js";
import { renderTechniqueProfileHtml } from "../../core/technique-utils.js";
import { BuilderWidget } from "./builder-widget.js";

function techniqueName(technique) {
  return sanitizeText(technique?.techniqueName || "", { maxLen: 200, collapse: true });
}

function techniqueKey(technique) {
  return sanitizeText(technique?.techniqueKey || "", { maxLen: 128, collapse: true });
}

function techniqueRank(technique) {
  const rank = Number.parseInt(String(technique?.rank ?? 0), 10);
  return Number.isFinite(rank) ? rank : 0;
}

function techniqueSkill(technique) {
  return canonicalSkillName(sanitizeText(technique?.skill, { maxLen: 96, collapse: true }));
}

function normalizeSkill(value) {
  return canonicalSkillName(sanitizeText(value, { maxLen: 96, collapse: true })).toLowerCase();
}

function compareTechniqueOptions(a, b) {
  const aRank = techniqueRank(a);
  const bRank = techniqueRank(b);
  if (aRank !== bRank) return aRank - bRank;
  return techniqueName(a).localeCompare(techniqueName(b));
}

export function getTechniqueChoiceSelectionKey(choice) {
  return sanitizeText(choice?.techniqueKey || "", { maxLen: 128, collapse: true });
}

export function buildTechniqueChoicePatch(technique, {
  sourceId = "",
  sourceLabel = "",
} = {}) {
  const selectedKey = techniqueKey(technique);
  const skillKey = sanitizeText(
    Array.isArray(technique?.skillKeys) ? technique.skillKeys[0] : technique?.skillKey,
    { maxLen: 128, collapse: true },
  );
  return {
    type: "technique",
    sourceId: selectedKey ? sanitizeText(sourceId, { maxLen: 260, collapse: true }) : "",
    sourceLabel: selectedKey ? sanitizeText(sourceLabel, { maxLen: 200, collapse: true }) : "",
    value: "",
    techniqueKey: selectedKey,
    skillKey: selectedKey ? canonicalStoredSkillKey(skillKey) : "",
    weaponKey: "",
    rank: 0,
    customName: "",
    enhancements: [],
    tags: [],
  };
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
    if (technique.expressionSyntaxVersion === 3) {
      const skill = canonicalSkillName(this.grant?.skill || this.grant?.name || this.grant?.key);
      return getTechniqueSelectionState(technique, {
        knownCombatSkills: new Set([skill]), skillRanks: getCombatSkillRanks(this.gameData, context.builder), allowGrantedOnly: true,
      }).skillRank;
    }
    const skillName = techniqueSkill(technique);
    if (!skillName) return techniqueRank(technique);

    let rank = 0;
    const grantedCombat = Array.isArray(context.grantedSkillState?.grantedCombatSkills)
      ? context.grantedSkillState.grantedCombatSkills
      : [];
    for (const row of grantedCombat) {
      const skill = canonicalSkillName(sanitizeText(row?.skill, { maxLen: 96, collapse: true }));
      if (skill !== skillName) continue;
      const value = Number.parseInt(String(row?.rank || "0"), 10);
      if (Number.isFinite(value)) rank = Math.max(rank, value);
    }

    const repeatables = context.builder?.sheet?.repeatables;
    const extraCombatSkills = sanitizeNamedSkillList(repeatables?.combatSkillsExtra, { maxItems: 50 });
    for (const row of extraCombatSkills) {
      const skill = canonicalSkillName(sanitizeText(row?.skill, { maxLen: 96, collapse: true }));
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
      .filter((technique) => isGameDataRecordSelectable(technique, { allowGrantedOnly: true }))
      .filter((technique) => technique.expressionSyntaxVersion === 3
        ? technique.selectionRoutes?.some((route) => route.type === "skill" && normalizeSkill(route.name) === grantSkill)
        : normalizeSkill(techniqueSkill(technique)) === grantSkill)
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
    const selectedTechniqueKey = getTechniqueChoiceSelectionKey(this.choice);
    const skillLabel = sanitizeText(this.grant?.skill || this.grant?.name || "Technique", {
      maxLen: 96,
      collapse: true,
    });
    const count = Number.parseInt(String(this.grant?.count ?? 1), 10);
    const countState = getChoiceCountState({
      selectedCount: selectedTechniqueKey ? 1 : 0,
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
        const key = techniqueKey(technique);
        const rank = techniqueRank(technique);
        const selected = selectedTechniqueKey === key ? " selected" : "";
        return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(name)} (Rank ${rank})</option>`;
      })
      .join("");
    select.disabled = !this.choiceId || !options.length;
    select.addEventListener("change", () => {
      const selected = options.find((technique) => techniqueKey(technique) === select.value) || null;
      this.onChange?.(buildTechniqueChoicePatch(selected, {
        sourceId: this.sourceId,
        sourceLabel: this.sourceLabel,
      }));
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

    if (selectedTechniqueKey) {
      const technique = options.find((item) => techniqueKey(item) === selectedTechniqueKey);
      if (technique) {
        const detail = document.createElement("div");
        detail.className = "help";
        detail.innerHTML = renderTechniqueProfileHtml(technique, {
          gameData: this.gameData,
          rankValue: this.getTechniqueSkillRank(technique, context),
          heading: techniqueName(technique),
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
