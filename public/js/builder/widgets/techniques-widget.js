import {
  computeTechniqueSlots,
  labelForAttrKey,
} from "../../core/character-rules.js";
import { removeSelection, selectedSet } from "../../core/choice-reconciliation.js";
import { sanitizeNamedSkillList, sanitizeText } from "../../core/data-sanitization.js";
import {
  computeGrantedSkillsState,
  computeKnownCombatSkillsAndGrants,
  getGameXTechniques,
  resolveTechniqueRef,
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
    return {
      "builder.selectedTechniques": this.buildSortedSelectedArray(this.selectedTechniques()),
    };
  }

  getDependencyNodes(context = {}) {
    const gameData = context.gameData || this.getGameData();
    return getGameXTechniques(gameData)
      .map((technique) => {
        const name = techniqueName(technique);
        if (!name) return null;
        return {
          id: `technique:${name}`,
          kind: "choice",
          storagePath: "builder.selectedTechniques",
          label: name,
          prerequisites: technique?.prerequisites || [],
          grants: technique?.grants || [],
        };
      })
      .filter(Boolean);
  }

  getTechniqueContext(builder = this.getBuilder(), gameData = this.getGameData()) {
    const b = builder && typeof builder === "object" ? builder : {};
    const { primaryAttrKey, slots } = computeTechniqueSlots(b.primaryAttribute, b.attributes);
    const knownAndGrants = computeKnownCombatSkillsAndGrants(gameData, b);
    return {
      builder: b,
      primaryAttrKey,
      slots,
      knownCombatSkills: knownAndGrants.knownCombatSkills || new Set(),
      grantedTechniqueNames: knownAndGrants.grantedTechniqueNames || new Set(),
      techniqueChoiceGrants: Array.isArray(knownAndGrants.techniqueChoiceGrants) ? knownAndGrants.techniqueChoiceGrants : [],
      grantedSkillState: computeGrantedSkillsState(gameData, b),
    };
  }

  resolveRef(ref, gameData = this.getGameData()) {
    const res = resolveTechniqueRef(ref, this.getTechniqueIndexes() || {
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

  grantMatchesTechniqueChoice(grant, technique, context) {
    const grantSkill = sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true }).toLowerCase();
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
      const skill = sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true }).toLowerCase();
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
    const selected = refs instanceof Set ? refs : new Set(refs || []);
    const total = selected.size;
    if (total <= context.slots) return true;
    const extraNeeded = total - Math.max(0, context.slots);
    return this.countExtraTechniqueAssignments(selected, context, gameData) >= extraNeeded;
  }

  canAddTechnique(name, context) {
    if (this.selectedTechniques().has(name)) return true;
    const next = new Set(this.selectedTechniques());
    next.add(name);
    return this.selectedTechniquesFitSlots(next, context);
  }

  getSelectedCounts(selected = this.selectedTechniques(), gameData = this.getGameData()) {
    let resolvedCount = 0;
    let missing = 0;
    for (const ref of selected) {
      const technique = this.resolveRef(ref, gameData);
      if (technique) resolvedCount += 1;
      else missing += 1;
    }
    return { total: selected.size, resolvedCount, missing };
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

  reconcileSelectedTechniques({
    selectedTechniques,
    builder,
    gameData,
  } = {}) {
    const changes = [];
    const selected = selectedTechniques instanceof Set
      ? new Set(selectedTechniques)
      : selectedSet(selectedTechniques, { maxItems: 500, maxLen: 200 });
    const context = this.getTechniqueContext(builder, gameData);

    for (const ref of Array.from(selected)) {
      const technique = this.resolveRef(ref, gameData);
      if (!technique) {
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "This technique no longer exists in the JSON.",
        });
        continue;
      }
      if (context.grantedTechniqueNames.has(ref)) {
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "This technique is now granted automatically.",
        });
        continue;
      }
      const skill = techniqueSkill(technique);
      if (skill && !context.knownCombatSkills.has(skill)) {
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "This technique's combat skill is no longer known for the current class/features.",
        });
        continue;
      }
      if (this.getTechniqueSkillRank(technique, context) < techniqueRank(technique)) {
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "This technique's required combat skill rank is no longer met.",
        });
        continue;
      }
      if (!this.passesTechniquePrerequisites(technique, context, gameData)) {
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "Prerequisites are no longer met.",
        });
      }
    }

    if (context.slots <= 0) {
      for (const ref of Array.from(selected)) {
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "There are currently 0 technique slots.",
        });
      }
      return { selectedTechniques: selected, changes };
    }

    if (!this.selectedTechniquesFitSlots(selected, context, gameData)) {
      const keep = new Set();
      for (const ref of this.buildSortedSelectedArray(selected, gameData)) {
        const next = new Set(keep);
        next.add(ref);
        if (this.selectedTechniquesFitSlots(next, context, gameData)) keep.add(ref);
      }
      for (const ref of Array.from(selected)) {
        if (keep.has(ref)) continue;
        removeSelection(selected, ref, changes, {
          storagePath: "builder.selectedTechniques",
          nodeId: `choice:technique:${ref}`,
          label: ref,
          reason: "Selected techniques exceed available technique picks.",
        });
      }
    }

    return { selectedTechniques: selected, changes };
  }

  reconcileDependencyState(context = {}) {
    const gameData = context.gameData || this.getGameData();
    const builder = context.proposedBuilder || context.builder || {};
    const result = this.reconcileSelectedTechniques({
      selectedTechniques: builder.selectedTechniques,
      builder,
      gameData,
    });
    return {
      patch: {
        "builder.selectedTechniques": this.buildSortedSelectedArray(result.selectedTechniques, gameData),
      },
      changes: result.changes,
    };
  }

  validateDependencyState(context = {}) {
    const gameData = context.gameData || this.getGameData();
    const builder = context.reconciledBuilder || context.proposedBuilder || context.builder || this.getBuilder();
    const techniqueContext = this.getTechniqueContext(builder, gameData);
    const selected = selectedSet(builder.selectedTechniques, { maxItems: 500, maxLen: 200 });
    const extraSlots = this.getTechniqueChoiceGrantCount(techniqueContext);
    const maxTotal = techniqueContext.slots + extraSlots;
    if (!techniqueContext.primaryAttrKey) {
      return [{
        type: "incomplete",
        severity: "warning",
        nodeId: this.id,
        storagePath: "builder.selectedTechniques",
        label: "Techniques",
        reason: "Primary Attribute is not set, so technique slots are 0.",
        previousValue: selected.size,
        nextValue: 0,
      }];
    }
    if (maxTotal <= 0 || selected.size >= maxTotal) return [];
    return [{
      type: "incomplete",
      severity: "warning",
      nodeId: this.id,
      storagePath: "builder.selectedTechniques",
      label: "Techniques",
      reason: `You have ${maxTotal} technique pick${maxTotal === 1 ? "" : "s"}, but only selected ${selected.size}.`,
      previousValue: selected.size,
      nextValue: maxTotal,
    }];
  }

  getSaveIssues() {
    const builder = {
      ...this.getBuilder(),
      selectedTechniques: this.buildSortedSelectedArray(this.selectedTechniques()),
    };
    const context = this.getTechniqueContext(builder);
    const selected = this.selectedTechniques();
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

    const { total } = this.getSelectedCounts();
    const extraSlots = this.getTechniqueChoiceGrantCount(context);
    const maxTotal = context.slots + extraSlots;

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
    pillSelected.textContent = `Selected: ${total} / ${maxTotal}`;
    if (!this.selectedTechniquesFitSlots(this.selectedTechniques(), context)) pillSelected.classList.add("danger");
    else if (maxTotal > 0 && total === maxTotal) pillSelected.classList.add("ok");
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
    const name = techniqueName(technique);
    if (name && context.grantedTechniqueNames.has(name)) return true;
    if (!this.passesTechniquePrerequisites(technique, context, gameData)) return false;
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
    if (rank === 0) {
      const details = document.createElement("details");
      details.open = false;
      const summary = document.createElement("summary");
      summary.textContent = `Rank 0 Basics - ${items.length}`;
      summary.style.cursor = "pointer";
      summary.style.fontWeight = "700";
      summary.style.marginBottom = "8px";
      const listEl = document.createElement("div");
      listEl.className = "optionList";
      for (const technique of items) {
        const row = document.createElement("div");
        row.className = "optionRow";
        row.innerHTML = renderTechniqueProfileHtml(technique, {
          rankValue: this.getTechniqueSkillRank(technique, context),
          heading: techniqueName(technique) || "Technique",
          headingTag: "div",
          headingClass: "optionTitle",
          showRank: true,
        });
        listEl.append(row);
      }
      details.append(summary, listEl);
      this.techniqueGroupsEl.append(details);
      return;
    }

    const header = document.createElement("h3");
    header.className = "h3";
    header.textContent = `Rank ${rank}`;
    header.style.marginTop = "14px";

    const listEl = document.createElement("div");
    listEl.className = "optionList";

    for (const technique of items) {
      const name = techniqueName(technique);
      if (!name) continue;
      const row = document.createElement("div");
      row.className = "optionRow";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const isGranted = context.grantedTechniqueNames.has(name);
      const skillRank = this.getTechniqueSkillRank(technique, context);
      checkbox.checked = isGranted || this.selectedTechniques().has(name);
      const atCap = !this.canAddTechnique(name, context);
      if (isGranted) checkbox.disabled = true;
      else if (skillRank < techniqueRank(technique)) checkbox.disabled = true;
      else if (context.slots + this.getTechniqueChoiceGrantCount(context) <= 0) checkbox.disabled = true;
      else if (atCap && !checkbox.checked) checkbox.disabled = true;

      checkbox.addEventListener("change", () => {
        this.clearError?.();
        const selected = new Set(this.selectedTechniques());
        if (checkbox.checked) {
          if (!this.canAddTechnique(name, context)) {
            checkbox.checked = false;
            this.setStatus?.("No technique slots remaining.");
            return;
          }
          selected.add(name);
        } else {
          selected.delete(name);
        }
        this.setSelectedTechniques(selected);
        this.render();
      });

      const body = document.createElement("div");
      body.style.flex = "1";
      body.innerHTML = renderTechniqueProfileHtml(technique, {
        rankValue: skillRank,
        heading: name,
        headingTag: "div",
        headingClass: "optionTitle",
        showRank: true,
      });

      row.append(checkbox, body);
      listEl.append(row);
    }

    this.techniqueGroupsEl.append(header, listEl);
  }

  render() {
    const context = this.getTechniqueContext();
    this.renderSlotSummary(context);
    this.renderKnownSkills(context);
    this.renderMissingRefs();
    this.renderTechniqueGroups(context);
  }
}
