import {
  computeTechniqueSlots,
  labelForAttrKey,
} from "../../core/character-rules.js?v=wpe1";
import { getChoiceCountState } from "../../core/choice-capacity.js";
import { SetTechniqueSelection } from "../../core/character-commands.js?v=wpe1";
import { escapeHtml, sanitizeNamedSkillList, sanitizeText } from "../../core/data-sanitization.js";
import {
  getGameXTechniques,
  resolveTechniqueRef,
} from "../../core/game-data.js?v=wpe1";
import { computeGrantedSkillsState, computeKnownCombatSkillsAndGrants, getCombatSkillRanks } from "../../core/skill-rules.js";
import { canonicalSkillKey, canonicalSkillName } from "../../core/skill-identity.js";
import { isGameDataRecordSelectable } from "../../core/selection-rules.js";
import { getTechniqueSelectionState, getTechniquePerformance, createTechniqueContext, getTechniqueSkillNames, getTechniqueCatalogueSkills } from "../../core/technique-rules.js?v=skill-groups1";
import { meetsPrerequisites } from "../../core/prerequisites.js";
import { projectTechniqueOwnership, getTechniqueOwnershipDetail } from "../../core/technique-ownership.js";
import { TechniqueCatalogueWidget } from "./technique-catalogue-widget.js?v=choices5";

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

export class TechniquesWidget extends TechniqueCatalogueWidget {
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
    super(page, { id: "techniques", scope, element: techniqueGroupsEl });
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
    builder = builder.builder || builder;
    if (Array.isArray(builder.selectedTechniques)) {
      this.setSelectedTechniques(new Set(builder.selectedTechniques));
    }
    this.render();
  }

  getTechniqueContext(builder = this.getBuilder(), gameData = this.getGameData()) {
    const b = builder && typeof builder === "object" ? builder : {};
    const { primaryAttrKey, slots } = computeTechniqueSlots(b.primaryAttribute, b.attributes);
    const knownAndGrants = computeKnownCombatSkillsAndGrants(gameData, b);
    const ownership = projectTechniqueOwnership({ gameData, builder: b });
    const grantedTechniqueDetails = new Map(), traitTechniqueDetails = new Map();
    for (const item of ownership.techniques) {
      const detail = getTechniqueOwnershipDetail(item);
      if (detail.free) grantedTechniqueDetails.set(item.techniqueKey, { kind: "granted", label: detail.label });
      if (detail.provider) traitTechniqueDetails.set(item.techniqueKey, detail.provider);
    }
    return {
      builder: b,
      rulesContext: createTechniqueContext({ gameData, builder: b, techniqueOwnership: ownership }),
      primaryAttrKey,
      slots,
      knownCombatSkills: knownAndGrants.knownCombatSkills || new Set(),
      grantedTechniqueNames: new Set(grantedTechniqueDetails.keys()),
      grantedTechniqueDetails,
      traitTechniqueDetails,
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

  getTechniqueSkillRank(technique, context) {
    const traitDetail = context.traitTechniqueDetails?.get(techniqueKey(technique));
    if (traitDetail) return traitDetail.rank;
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

  getTechniqueAccessContext(technique, context, gameData = this.getGameData()) {
    return {
      ...(context.rulesContext || createTechniqueContext({ gameData, builder: context.builder, grantedSkillState: context.grantedSkillState })),
      knownCombatSkills: context.knownCombatSkills,
      skillRanks: getCombatSkillRanks(gameData, context.builder),
      allowGrantedOnly: this.isFreeTechniqueName(techniqueKey(technique), context),
    };
  }

  getTechniqueAccess(technique, context, gameData = this.getGameData()) {
    return getTechniqueSelectionState(technique, this.getTechniqueAccessContext(technique, context, gameData));
  }

  selectedTechniquesFitSlots(refs, context) {
    return this.getNormalSelectedTechniques(refs instanceof Set ? refs : new Set(refs || []), context).size <= context.slots;
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
        .flatMap(getTechniqueSkillNames)
        .map(canonicalSkillKey)
    );
    return Array.from(context.knownCombatSkills)
      .sort((a, b) => a.localeCompare(b))
      .map((skill) => ({ skill, rank: this.getTechniqueSkillRank({ skill }, context) }))
      .filter(({ skill }) => techniqueSkillNames.has(canonicalSkillKey(skill)));
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
    const countState = getChoiceCountState({
      selectedCount: total,
      expectedCount: context.slots,
      noun: "technique",
    });

    const pillSlots = document.createElement("span");
    pillSlots.className = "pill";
    pillSlots.textContent = `Slots: ${context.slots}`;
    this.slotPillsEl.append(pillSlots);

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
    const skill = getTechniqueSkillNames(technique).join(" ").toLowerCase();
    const tags = Array.isArray(technique?.tags) ? technique.tags.join(" ").toLowerCase() : "";
    return name.includes(query) || skill.includes(query) || tags.includes(query);
  }

  passesKnownSkillFilter(technique, context, gameData = this.getGameData()) {
    const key = techniqueKey(technique);
    if (key && context.grantedTechniqueNames.has(key)) return true;
    if (!this.passesTechniquePrerequisites(technique, context, gameData)) return false;
    if (technique.expressionSyntaxVersion === 3) return this.getTechniqueAccess(technique, context, gameData).eligible;
    if (!this.filterKnownSkills) return true;
    const skill = techniqueSkill(technique);
    if (!skill) return false;
    if (!context.knownCombatSkills.has(skill)) return false;
    return this.getTechniqueSkillRank(technique, context) >= techniqueRank(technique);
  }

  renderTechniqueGroups(context = this.getTechniqueContext(), gameData = this.getGameData()) {
    if (!this.techniqueGroupsEl) return;
    this.beginChoices();
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
    this.techniqueGroupsEl.innerHTML = this.errorHtml();

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
      const groups = getTechniqueCatalogueSkills(technique, this.getTechniqueAccessContext(technique, context));
      for (const skill of groups.length ? groups : ["Other"]) {
        const skillItems = bySkill.get(skill) || [];
        skillItems.push(technique);
        bySkill.set(skill, skillItems);
      }
    }

    const skills = Array.from(bySkill.keys()).sort((a, b) => a.localeCompare(b));
    for (const skill of skills) {
      rankDetails.append(this.renderSkillGroup(rank, skill, bySkill.get(skill) || [], context));
    }

    this.techniqueGroupsEl.append(rankDetails);
  }

  renderSkillGroup(rank, skill, items, context) {
    const skillKey = `rank:${rank}:skill:${skill}`;
    const values = [];
    const normalSelected = this.getNormalSelectedTechniques(this.selectedTechniques(), context);
    const countState = getChoiceCountState({
      selectedCount: normalSelected.size,
      expectedCount: context.slots,
      noun: "technique",
    });
    const options = items.map(technique => {
      const key = techniqueKey(technique);
      const freeDetail = context.grantedTechniqueDetails?.get(key);
      const automatic = rank === 0 || context.grantedTechniqueNames.has(key);
      const selected = automatic || this.selectedTechniques().has(key);
      if (selected) values.push(key);
      return { technique, disabled: automatic || this.getTechniqueSkillRank(technique, context) < techniqueRank(technique) || countState.expectedCount <= 0 || (!this.canAddTechnique(key, context) && !selected),
        sourceHtml: freeDetail ? `<span class="techniqueSourcePill">${escapeHtml(freeDetail.label)}</span>` : "",
      };
    });
    const group = document.createElement("div");
    group.innerHTML = this.renderTechniqueChoice({ id: skillKey, label: `${skill} Techniques`, options, values, multiple: true, gameData: this.getGameData(),
      profileOptions: technique => ({ performance: getTechniquePerformance(technique, context.rulesContext, context.traitTechniqueDetails?.get(techniqueKey(technique))), rankValue: this.getTechniqueSkillRank(technique, context) }),
      onChange: (key, checked) => {
        this.clearError?.();
        const currentContext = this.getTechniqueContext();
        const selected = new Set(this.selectedTechniques());
        if (checked) selected.add(key); else selected.delete(key);
        return this.page.requestCharacterCommand(this, SetTechniqueSelection(this.buildSortedSelectedArray(this.getNormalSelectedTechniques(selected, currentContext))));
      },
    });
    return group;
  }

  render() {
    const context = this.getTechniqueContext();
    this.renderSlotSummary(context);
    this.renderKnownSkills(context);
    this.renderMissingRefs();
    this.renderTechniqueGroups(context);
  }
}
