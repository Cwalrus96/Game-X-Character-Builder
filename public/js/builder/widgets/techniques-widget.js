import {
  computeTechniqueSlots,
  labelForAttrKey,
} from "../../core/character-rules.js?v=wpe1";
import { getChoiceCountState } from "../../core/choice-capacity.js";
import { SetTechniqueSelection } from "../../core/character-commands.js?v=wpe1";
import { sanitizeNamedSkillList, sanitizeText } from "../../core/data-sanitization.js";
import {
  createCharacterGrantCollection,
  getGameXTechniques,
  resolveTechniqueRef,
} from "../../core/game-data.js?v=wpe1";
import { computeGrantedSkillsState, computeKnownCombatSkillsAndGrants, getCombatSkillRanks } from "../../core/skill-rules.js";
import { canonicalSkillName } from "../../core/skill-identity.js";
import { getTechniqueSelectionState, isGameDataRecordSelectable } from "../../core/selection-rules.js";
import { createPrerequisiteContext, meetsPrerequisites } from "../../core/prerequisites.js";
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

function countForGrant(grant) {
  const count = Number.parseInt(String(grant?.count ?? 1), 10);
  return Number.isFinite(count) ? Math.max(0, count) : 1;
}

function getSourceOwnedTechniqueAnswerCounts(builder = {}, gameData = {}) {
  const choices = (builder?.grantChoices && typeof builder.grantChoices === "object" && !Array.isArray(builder.grantChoices))
    ? builder.grantChoices
    : {};
  const counts = new Map();

  for (const choice of Object.values(choices)) {
    if (choice?.type !== "technique") continue;
    const technique = getGameXTechniques(gameData).find((entry) => techniqueKey(entry) === choice?.techniqueKey);
    const skill = canonicalSkillName(sanitizeText(choice?.skillKey || technique?.skill, { maxLen: 96, collapse: true })).toLowerCase();
    if (!choice?.techniqueKey || !skill) continue;
    counts.set(skill, (counts.get(skill) || 0) + 1);
  }

  return counts;
}

function getSourceOwnedTechniqueDetails(builder = {}) {
  const choices = (builder?.grantChoices && typeof builder.grantChoices === "object" && !Array.isArray(builder.grantChoices))
    ? builder.grantChoices
    : {};
  const details = new Map();

  for (const choice of Object.values(choices)) {
    if (choice?.type !== "technique") continue;
    const technique = sanitizeText(choice?.techniqueKey, { maxLen: 128, collapse: true });
    if (!technique) continue;
    const sourceLabel = sanitizeText(choice?.sourceLabel, { maxLen: 200, collapse: true });
    details.set(technique, {
      kind: "sourceOwned",
      label: sourceLabel ? `Chosen from ${sourceLabel}` : "Chosen from feature",
    });
  }

  return details;
}

function getGrantedTechniqueDetails(gameData, builder = {}) {
  const details = new Map();
  const collection = createCharacterGrantCollection(gameData, builder);
  for (const grant of collection.techniqueGrants || []) {
    const technique = sanitizeText(grant?.key, { maxLen: 128, collapse: true });
    if (!technique) continue;
    const sourceLabel = sanitizeText(grant?.source?.name || grant?.source?.featureName || grant?.source?.featKey, {
      maxLen: 200,
      collapse: true,
    });
    details.set(technique, {
      kind: "granted",
      label: sourceLabel ? `Granted by ${sourceLabel}` : "Granted",
    });
  }
  return details;
}

function getRemainingTechniqueChoiceGrants(grants, sourceOwnedAnswerCounts = new Map()) {
  const answeredBySkill = new Map(sourceOwnedAnswerCounts || []);
  const out = [];

  for (const grant of Array.isArray(grants) ? grants : []) {
    const skill = canonicalSkillName(sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true })).toLowerCase();
    const total = countForGrant(grant);
    if (!skill || total <= 0) continue;

    const answered = Math.max(0, answeredBySkill.get(skill) || 0);
    const consumed = Math.min(total, answered);
    const remaining = total - consumed;
    answeredBySkill.set(skill, answered - consumed);
    if (remaining > 0) out.push({ ...grant, count: remaining });
  }

  return out;
}

export class TechniquesWidget extends BuilderWidget {
  constructor(page, {
    slotHintEl = null,
    slotPillsEl = null,
    searchEl = null,
    filterKnownSkillsEl = null,
    knownSkillsHelpEl = null,
    missingListEl = null,
    techniqueGroupsEl = null,
    getGameData = null,
    getBuilder = null,
    getTechniqueIndexes = null,
    getSelectedTechniques = null,
    setSelectedTechniques = null,
    setStatus = null,
    clearError = null,
    scope = "page",
  } = {}) {
    super(page, { id: "techniques", scope });
    this.slotHintEl = slotHintEl;
    this.slotPillsEl = slotPillsEl;
    this.searchEl = searchEl;
    this.filterKnownSkillsEl = filterKnownSkillsEl;
    this.knownSkillsHelpEl = knownSkillsHelpEl;
    this.missingListEl = missingListEl;
    this.techniqueGroupsEl = techniqueGroupsEl;
    this.getGameData = typeof getGameData === "function" ? getGameData : () => null;
    this.getBuilder = typeof getBuilder === "function" ? getBuilder : () => ({});
    this.getTechniqueIndexes = typeof getTechniqueIndexes === "function" ? getTechniqueIndexes : () => null;
    this.getSelectedTechniques = typeof getSelectedTechniques === "function" ? getSelectedTechniques : () => new Set();
    this.setSelectedTechniques = typeof setSelectedTechniques === "function" ? setSelectedTechniques : () => {};
    this.setStatus = typeof setStatus === "function" ? setStatus : null;
    this.clearError = typeof clearError === "function" ? clearError : null;
    this.filterText = "";
    this.filterKnownSkills = this.filterKnownSkillsEl ? !!this.filterKnownSkillsEl.checked : true;
    this.collapsedGroups = new Map();
    this.wireControls();
  }

  wireControls() {
    this.searchEl?.addEventListener("input", () => {
      this.filterText = String(this.searchEl?.value || "").trim();
      this.renderTechniqueGroups();
    });
    this.filterKnownSkillsEl?.addEventListener("change", () => {
      this.filterKnownSkills = !!this.filterKnownSkillsEl.checked;
      this.render();
    });
  }

  selectedTechniques() {
    return this.getSelectedTechniques() || new Set();
  }

  getSavePatch() {
    const context = this.getTechniqueContext();
    const selected = this.getNormalSelectedTechniques(this.selectedTechniques(), context);
    return {
      "builder.selectedTechniques": this.buildSortedSelectedArray(selected),
    };
  }

  applyReconciledState(builder = {}) {
    if (Array.isArray(builder.selectedTechniques)) {
      this.setSelectedTechniques(new Set(builder.selectedTechniques));
    }
  }

  getTechniqueContext(builder = this.getBuilder(), gameData = this.getGameData()) {
    const b = builder && typeof builder === "object" ? builder : {};
    const { primaryAttrKey, slots } = computeTechniqueSlots(b.primaryAttribute, b.attributes);
    const knownAndGrants = computeKnownCombatSkillsAndGrants(gameData, b);
    const sourceOwnedTechniqueDetails = getSourceOwnedTechniqueDetails(b);
    const grantedTechniqueDetails = getGrantedTechniqueDetails(gameData, b);
    return {
      builder: b,
      primaryAttrKey,
      slots,
      knownCombatSkills: knownAndGrants.knownCombatSkills || new Set(),
      grantedTechniqueNames: new Set(grantedTechniqueDetails.keys()),
      grantedTechniqueDetails,
      sourceOwnedTechniqueNames: new Set(sourceOwnedTechniqueDetails.keys()),
      sourceOwnedTechniqueDetails,
      techniqueChoiceGrants: getRemainingTechniqueChoiceGrants(
        Array.isArray(knownAndGrants.techniqueChoiceGrants) ? knownAndGrants.techniqueChoiceGrants : [],
        getSourceOwnedTechniqueAnswerCounts(b, gameData),
      ),
      grantedSkillState: computeGrantedSkillsState(gameData, b),
    };
  }

  resolveRef(ref, gameData = this.getGameData()) {
    const res = resolveTechniqueRef(ref, this.getTechniqueIndexes() || {
      byKey: new Map(getGameXTechniques(gameData).map((technique) => [techniqueKey(technique), technique])),
      byName: new Map(getGameXTechniques(gameData).map((technique) => [techniqueName(technique), technique])),
      byNorm: new Map(),
    });
    return res?.ok ? res.technique : null;
  }

  passesTechniquePrerequisites(technique, context, gameData = this.getGameData()) {
    return meetsPrerequisites(technique?.prerequisites, {
      gameData,
      builder: context.builder,
      grantedSkillState: context.grantedSkillState,
      deferUnresolvedChoices: true,
    });
  }

  getTechniqueChoiceGrantCount(context) {
    return context.techniqueChoiceGrants.reduce((total, grant) => {
      const count = Number.parseInt(String(grant?.count ?? 1), 10);
      return total + (Number.isFinite(count) ? Math.max(0, count) : 1);
    }, 0);
  }

  getTechniqueSkillRank(technique, context) {
    if (technique.expressionSyntaxVersion === 3) return this.getTechniqueAccess(technique, context).skillRank;
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

  getTechniqueAccess(technique, context, gameData = this.getGameData()) {
    return getTechniqueSelectionState(technique, {
      ...createPrerequisiteContext({ gameData, builder: context.builder, grantedSkillState: context.grantedSkillState }),
      knownCombatSkills: context.knownCombatSkills,
      skillRanks: getCombatSkillRanks(gameData, context.builder),
      allowGrantedOnly: this.isFreeTechniqueName(techniqueKey(technique), context),
    });
  }

  grantMatchesTechniqueChoice(grant, technique, context) {
    const grantSkill = canonicalSkillName(sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true })).toLowerCase();
    if (!grantSkill) return false;
    const skill = techniqueSkill(technique).toLowerCase();
    if (grantSkill !== skill) return false;
    return this.getTechniqueSkillRank(technique, context) >= techniqueRank(technique);
  }

  countExtraTechniqueAssignments(refs, context, gameData = this.getGameData()) {
    const selected = Array.from(refs || [])
      .map((ref) => this.resolveRef(ref, gameData))
      .filter(Boolean);
    const remainingBySkill = new Map();

    for (const grant of context.techniqueChoiceGrants) {
      const skill = canonicalSkillName(sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true })).toLowerCase();
      if (!skill) continue;
      const count = Number.parseInt(String(grant?.count ?? 1), 10);
      remainingBySkill.set(skill, (remainingBySkill.get(skill) || 0) + (Number.isFinite(count) ? Math.max(0, count) : 1));
    }

    let assigned = 0;
    for (const technique of selected) {
      const skill = techniqueSkill(technique).toLowerCase();
      const remaining = remainingBySkill.get(skill) || 0;
      if (remaining <= 0) continue;
      if (!context.techniqueChoiceGrants.some((grant) => this.grantMatchesTechniqueChoice(grant, technique, context))) continue;
      remainingBySkill.set(skill, remaining - 1);
      assigned += 1;
    }

    return assigned;
  }

  selectedTechniquesFitSlots(refs, context, gameData = this.getGameData()) {
    const selected = this.getNormalSelectedTechniques(refs instanceof Set ? refs : new Set(refs || []), context);
    const total = selected.size;
    if (total <= context.slots) return true;
    const extraNeeded = total - Math.max(0, context.slots);
    return this.countExtraTechniqueAssignments(selected, context, gameData) >= extraNeeded;
  }

  canAddTechnique(key, context) {
    if (this.selectedTechniques().has(key)) return true;
    const next = this.getNormalSelectedTechniques(this.selectedTechniques(), context);
    next.add(key);
    return this.selectedTechniquesFitSlots(next, context);
  }

  isFreeTechniqueName(key, context) {
    return !!key && (
      context.grantedTechniqueNames?.has(key)
      || context.sourceOwnedTechniqueNames?.has(key)
    );
  }

  getNormalSelectedTechniques(selected = this.selectedTechniques(), context = this.getTechniqueContext()) {
    const out = new Set();
    for (const ref of selected || []) {
      if (this.isFreeTechniqueName(ref, context)) continue;
      out.add(ref);
    }
    return out;
  }

  getSelectedCounts(selected = this.selectedTechniques(), gameData = this.getGameData(), context = null) {
    const countable = context ? this.getNormalSelectedTechniques(selected, context) : selected;
    let resolvedCount = 0;
    let missing = 0;
    for (const ref of countable) {
      const technique = this.resolveRef(ref, gameData);
      if (technique) resolvedCount += 1;
      else missing += 1;
    }
    return { total: countable.size, resolvedCount, missing };
  }

  buildSortedSelectedArray(selected = this.selectedTechniques(), gameData = this.getGameData()) {
    const arr = Array.from(selected).map((ref) => {
      const technique = this.resolveRef(ref, gameData);
      return {
        ref,
        rank: technique ? techniqueRank(technique) : 9999,
        name: technique ? techniqueName(technique) : ref,
      };
    });
    arr.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return String(a.name).localeCompare(String(b.name));
    });
    return arr.map((entry) => entry.ref);
  }

  getSaveIssues() {
    const context = this.getTechniqueContext(this.getBuilder());
    const builder = {
      ...this.getBuilder(),
      selectedTechniques: this.buildSortedSelectedArray(this.getNormalSelectedTechniques(this.selectedTechniques(), context)),
    };
    const selected = this.getNormalSelectedTechniques(this.selectedTechniques(), context);
    const { total, missing } = this.getSelectedCounts(selected);
    const warnings = [];
    const errors = [];

    if (!context.primaryAttrKey) warnings.push("Primary Attribute not set (go back to Class step). Technique slots will be 0.");
    if (!this.selectedTechniquesFitSlots(selected, context)) {
      errors.push(`You selected ${total} techniques, but those choices do not fit your available technique picks.`);
    }
    if (missing) warnings.push(`${missing} selected technique reference(s) no longer exist in the JSON.`);
    return { errors, warnings };
  }

  getKnownCombatSkillRows(context, gameData = this.getGameData()) {
    const techniqueSkillNames = new Set(
      getGameXTechniques(gameData)
        .map((technique) => techniqueSkill(technique))
        .filter(Boolean)
    );
    return Array.from(context.knownCombatSkills)
      .sort((a, b) => a.localeCompare(b))
      .map((skill) => ({ skill, rank: this.getTechniqueSkillRank({ skill }, context) }))
      .filter(({ skill }) => techniqueSkillNames.has(skill));
  }

  renderSlotSummary(context) {
    if (this.slotHintEl) {
      const label = context.primaryAttrKey ? (labelForAttrKey(context.primaryAttrKey) || context.primaryAttrKey) : "n/a";
      this.slotHintEl.textContent = context.primaryAttrKey
        ? `Slots = ${label} (${context.slots})`
        : "Primary Attribute not set.";
    }

    if (!this.slotPillsEl) return;
    this.slotPillsEl.innerHTML = "";

    const normalSelected = this.getNormalSelectedTechniques(this.selectedTechniques(), context);
    const { total } = this.getSelectedCounts(normalSelected);
    const extraSlots = this.getTechniqueChoiceGrantCount(context);
    const maxTotal = context.slots + extraSlots;
    const countState = getChoiceCountState({
      selectedCount: total,
      expectedCount: maxTotal,
      noun: "technique",
    });

    const pillSlots = document.createElement("span");
    pillSlots.className = "pill";
    pillSlots.textContent = `Slots: ${context.slots}`;
    this.slotPillsEl.append(pillSlots);

    if (extraSlots > 0) {
      const pillExtra = document.createElement("span");
      pillExtra.className = "pill";
      pillExtra.textContent = `Granted picks: ${extraSlots}`;
      this.slotPillsEl.append(pillExtra);
    }

    const pillSelected = document.createElement("span");
    pillSelected.className = "pill";
    pillSelected.textContent = `Selected: ${countState.selectedCount} / ${countState.expectedCount}`;
    if (!this.selectedTechniquesFitSlots(normalSelected, context)) pillSelected.classList.add("danger");
    else if (countState.expectedCount > 0 && countState.isComplete) pillSelected.classList.add("ok");
    this.slotPillsEl.append(pillSelected);
  }

  renderKnownSkills(context, gameData = this.getGameData()) {
    if (!this.knownSkillsHelpEl) return;
    const rows = this.getKnownCombatSkillRows(context, gameData);
    if (!rows.length) {
      this.knownSkillsHelpEl.textContent = "No combat skills detected (derived from class + feature/feat grants).";
      return;
    }

    const label = document.createElement("div");
    label.className = "muted";
    label.style.marginBottom = "6px";
    label.textContent = "Combat skills used for technique availability:";

    const pills = document.createElement("div");
    pills.className = "pillRow";
    for (const { skill, rank } of rows) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = `${skill} - Rank ${rank}`;
      pills.append(pill);
    }

    this.knownSkillsHelpEl.innerHTML = "";
    this.knownSkillsHelpEl.append(label, pills);
  }

  renderMissingRefs() {
    if (!this.missingListEl) return;
    this.missingListEl.innerHTML = "";
    this.missingListEl.style.display = "none";
  }

  passesSearch(technique) {
    if (!this.filterText) return true;
    const query = this.filterText.toLowerCase();
    const name = String(technique?.techniqueName || "").toLowerCase();
    const skill = String(technique?.skill || "").toLowerCase();
    const tags = Array.isArray(technique?.tags) ? technique.tags.join(" ").toLowerCase() : "";
    return name.includes(query) || skill.includes(query) || tags.includes(query);
  }

  passesKnownSkillFilter(technique, context, gameData = this.getGameData()) {
    const key = techniqueKey(technique);
    if (key && context.grantedTechniqueNames.has(key)) return true;
    if (key && context.sourceOwnedTechniqueNames?.has(key)) return true;
    if (!this.passesTechniquePrerequisites(technique, context, gameData)) return false;
    if (technique.expressionSyntaxVersion === 3) return this.getTechniqueAccess(technique, context, gameData).eligible;
    if (!this.filterKnownSkills) return true;
    const skill = techniqueSkill(technique);
    if (!skill) return false;
    if (context.techniqueChoiceGrants.some((grant) => this.grantMatchesTechniqueChoice(grant, technique, context))) return true;
    if (!context.knownCombatSkills.has(skill)) return false;
    return this.getTechniqueSkillRank(technique, context) >= techniqueRank(technique);
  }

  renderTechniqueGroups(context = this.getTechniqueContext(), gameData = this.getGameData()) {
    if (!this.techniqueGroupsEl) return;
    const visible = getGameXTechniques(gameData)
      .filter((technique) => !!techniqueName(technique))
      .filter((technique) => isGameDataRecordSelectable(technique, {
        allowGrantedOnly: this.isFreeTechniqueName(techniqueKey(technique), context),
      }))
      .filter((technique) => this.passesSearch(technique))
      .filter((technique) => this.passesKnownSkillFilter(technique, context, gameData));

    const byRank = new Map();
    for (const technique of visible) {
      const rank = techniqueRank(technique);
      const items = byRank.get(rank) || [];
      items.push(technique);
      byRank.set(rank, items);
    }

    const ranks = Array.from(byRank.keys()).sort((a, b) => a - b);
    this.techniqueGroupsEl.innerHTML = "";

    if (!ranks.length) {
      const message = document.createElement("div");
      message.className = "muted";
      message.textContent = this.filterKnownSkills
        ? "No techniques match your combat skills + filters. Try unchecking the skill filter."
        : "No techniques match your current filters.";
      this.techniqueGroupsEl.append(message);
      return;
    }

    for (const rank of ranks) {
      this.renderRankGroup(rank, (byRank.get(rank) || []).slice().sort((a, b) => {
        return techniqueName(a).localeCompare(techniqueName(b));
      }), context);
    }
  }

  renderRankGroup(rank, items, context) {
    const rankKey = `rank:${rank}`;
    const rankDetails = document.createElement("details");
    rankDetails.open = this.collapsedGroups.has(rankKey) ? !this.collapsedGroups.get(rankKey) : rank !== 0;
    rankDetails.style.marginTop = "14px";

    const rankSummary = document.createElement("summary");
    rankSummary.textContent = rank === 0 ? `Rank 0 Basics - ${items.length}` : `Rank ${rank} - ${items.length}`;
    rankSummary.style.cursor = "pointer";
    rankSummary.style.fontWeight = "700";
    rankSummary.style.marginBottom = "8px";
    rankDetails.append(rankSummary);
    rankDetails.addEventListener("toggle", () => {
      this.collapsedGroups.set(rankKey, !rankDetails.open);
    });

    const bySkill = new Map();
    for (const technique of items) {
      const skill = techniqueSkill(technique) || "Other";
      const skillItems = bySkill.get(skill) || [];
      skillItems.push(technique);
      bySkill.set(skill, skillItems);
    }

    const skills = Array.from(bySkill.keys()).sort((a, b) => a.localeCompare(b));
    for (const skill of skills) {
      rankDetails.append(this.renderSkillGroup(rank, skill, bySkill.get(skill) || [], context));
    }

    this.techniqueGroupsEl.append(rankDetails);
  }

  renderSkillGroup(rank, skill, items, context) {
    const skillKey = `rank:${rank}:skill:${skill}`;
    const details = document.createElement("details");
    details.open = this.collapsedGroups.has(skillKey) ? !this.collapsedGroups.get(skillKey) : true;
    details.style.margin = "8px 0 0 12px";

    const summary = document.createElement("summary");
    summary.textContent = `${skill} - ${items.length}`;
    summary.style.cursor = "pointer";
    summary.style.fontWeight = "600";
    details.append(summary);
    details.addEventListener("toggle", () => {
      this.collapsedGroups.set(skillKey, !details.open);
    });

    const listEl = document.createElement("div");
    listEl.className = "optionList";
    listEl.style.marginTop = "8px";

    for (const technique of items) {
      const row = rank === 0
        ? this.renderReadOnlyTechniqueRow(technique, context)
        : this.renderSelectableTechniqueRow(technique, context);
      if (row) listEl.append(row);
    }

    details.append(listEl);
    return details;
  }

  renderReadOnlyTechniqueRow(technique, context) {
    const row = document.createElement("div");
    row.className = "optionRow";
    row.innerHTML = renderTechniqueProfileHtml(technique, {
      gameData: this.getGameData(),
      rankValue: this.getTechniqueSkillRank(technique, context),
      heading: techniqueName(technique) || "Technique",
      headingTag: "div",
      headingClass: "optionTitle",
      showRank: true,
    });
    return row;
  }

  renderSelectableTechniqueRow(technique, context) {
    const name = techniqueName(technique);
    const key = techniqueKey(technique);
    if (!name || !key) return null;

    const row = document.createElement("div");
    row.className = "optionRow";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const isGranted = context.grantedTechniqueNames.has(key);
    const isSourceOwned = context.sourceOwnedTechniqueNames?.has(key);
    const freeDetail = context.sourceOwnedTechniqueDetails?.get(key) || context.grantedTechniqueDetails?.get(key) || null;
    const skillRank = this.getTechniqueSkillRank(technique, context);
    checkbox.checked = isGranted || isSourceOwned || this.selectedTechniques().has(key);
    const atCap = !this.canAddTechnique(key, context);
    const normalSelected = this.getNormalSelectedTechniques(this.selectedTechniques(), context);
    const countState = getChoiceCountState({
      selectedCount: normalSelected.size,
      expectedCount: context.slots + this.getTechniqueChoiceGrantCount(context),
      noun: "technique",
    });
    if (isGranted || isSourceOwned) checkbox.disabled = true;
    else if (skillRank < techniqueRank(technique)) checkbox.disabled = true;
    else if (countState.expectedCount <= 0) checkbox.disabled = true;
    else if (atCap && !checkbox.checked) checkbox.disabled = true;

    checkbox.addEventListener("change", async () => {
      this.clearError?.();
      const previousChecked = !checkbox.checked;
      const selected = new Set(this.selectedTechniques());
      if (checkbox.checked) {
        if (!this.canAddTechnique(key, context)) {
          checkbox.checked = false;
          this.setStatus?.("No technique slots remaining.");
          return;
        }
        selected.add(key);
      } else {
        selected.delete(key);
      }
      const result = await this.page?.requestCharacterCommand?.(
        this,
        SetTechniqueSelection(this.buildSortedSelectedArray(this.getNormalSelectedTechniques(selected, context))),
        {
        applyWidgetChange: (proposal) => {
          const accepted = proposal?.reconciled?.builder?.selectedTechniques;
          this.setSelectedTechniques(new Set(Array.isArray(accepted) ? accepted : selected));
          this.render();
        },
        },
      );
      if (result && !result.ok) {
        checkbox.checked = previousChecked;
        return;
      }
      if (!this.page?.requestCharacterCommand) {
        this.setSelectedTechniques(selected);
        this.render();
      }
    });

    const body = document.createElement("div");
    body.style.flex = "1";
    body.innerHTML = renderTechniqueProfileHtml(technique, {
      gameData: this.getGameData(),
      rankValue: skillRank,
      heading: name,
      headingTag: "div",
      headingClass: "optionTitle",
      showRank: true,
    });
    if (freeDetail) {
      const badge = document.createElement("span");
      badge.className = `techniqueSourcePill ${freeDetail.kind === "sourceOwned" ? "sourceOwned" : "granted"}`;
      badge.textContent = freeDetail.label;
      const titleEl = body.querySelector(".optionTitle");
      if (titleEl) titleEl.append(" ", badge);
      else body.prepend(badge);
    }

    row.append(checkbox, body);
    return row;
  }

  render() {
    const context = this.getTechniqueContext();
    this.renderSlotSummary(context);
    this.renderKnownSkills(context);
    this.renderMissingRefs();
    this.renderTechniqueGroups(context);
  }
}
