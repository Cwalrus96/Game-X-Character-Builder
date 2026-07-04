import { reconcileSelectedOptionKeys, removeSelection, selectedSet } from "../../core/choice-reconciliation.js";
import { sanitizeStringArray, sanitizeText } from "../../core/data-sanitization.js";
import { checkPrerequisites } from "../../core/prerequisites.js";
import { deleteSelectedDescendants } from "../../core/option-groups.js";
import { BuilderWidget } from "./builder-widget.js";
import { FeatWidget } from "./feat-widget.js";

function setPrerequisiteNotice(el, unavailableCount, hiddenCount) {
  if (!el) return;
  if (!unavailableCount) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = hiddenCount
    ? `${hiddenCount} unavailable option${hiddenCount === 1 ? "" : "s"} hidden by prerequisites.`
    : `${unavailableCount} option${unavailableCount === 1 ? " is" : "s are"} unavailable because prerequisites are not met.`;
}

export class FeatsWidget extends BuilderWidget {
  constructor(page, {
    containerEl,
    hintEl = null,
    prereqNoticeEl = null,
    getClassKey = null,
    getLevel = null,
    getSelectedFeatNames = null,
    setSelectedFeatNames = null,
    getSelectedFeatOptionKeys = null,
    setSelectedFeatOptionKeys = null,
    getAvailableFeats = null,
    getFeatSlots = null,
    showUnavailable = null,
    checkEntryPrerequisites = null,
    renderOptionGroup = null,
    setStatus = null,
    onChange = null,
    scope = "page",
  } = {}) {
    super(page, { id: "feats", scope });
    this.containerEl = containerEl || null;
    this.hintEl = hintEl || null;
    this.prereqNoticeEl = prereqNoticeEl || null;
    this.getClassKey = typeof getClassKey === "function" ? getClassKey : () => "";
    this.getLevel = typeof getLevel === "function" ? getLevel : () => 1;
    this.getSelectedFeatNames = typeof getSelectedFeatNames === "function" ? getSelectedFeatNames : () => new Set();
    this.setSelectedFeatNames = typeof setSelectedFeatNames === "function" ? setSelectedFeatNames : () => {};
    this.getSelectedFeatOptionKeys = typeof getSelectedFeatOptionKeys === "function" ? getSelectedFeatOptionKeys : () => new Set();
    this.setSelectedFeatOptionKeys = typeof setSelectedFeatOptionKeys === "function" ? setSelectedFeatOptionKeys : () => {};
    this.getAvailableFeats = typeof getAvailableFeats === "function" ? getAvailableFeats : () => [];
    this.getFeatSlots = typeof getFeatSlots === "function" ? getFeatSlots : () => 0;
    this.showUnavailable = typeof showUnavailable === "function" ? showUnavailable : () => true;
    this.checkEntryPrerequisites = typeof checkEntryPrerequisites === "function"
      ? checkEntryPrerequisites
      : () => ({ ok: true, failureReasons: [] });
    this.renderOptionGroup = typeof renderOptionGroup === "function" ? renderOptionGroup : null;
    this.setStatus = typeof setStatus === "function" ? setStatus : null;
    this.onChange = typeof onChange === "function" ? onChange : null;
  }

  selectedFeatNames() {
    return this.getSelectedFeatNames() || new Set();
  }

  selectedFeatOptionKeys() {
    return this.getSelectedFeatOptionKeys() || new Set();
  }

  getSavePatch() {
    return {
      "builder.selectedFeats": Array.from(this.selectedFeatNames()),
    };
  }

  getDependencyNodes(context = {}) {
    const builder = context.builder || {};
    return this.getAvailableFeats({ gameData: context.gameData, builder })
      .map((feat) => {
        const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
        if (!name) return null;
        return {
          id: `feat:${name}`,
          kind: "choice",
          storagePath: "builder.selectedFeats",
          label: name,
          prerequisites: feat?.prerequisites || [],
          grants: feat?.grants || [],
        };
      })
      .filter(Boolean);
  }

  validateDependencyState(context = {}) {
    const builder = context.reconciledBuilder || context.proposedBuilder || context.builder || {};
    const selected = sanitizeStringArray(builder.selectedFeats, { maxItems: 200, maxLen: 160 });
    const maxSlots = this.getFeatSlots(builder.level);
    if (selected.length >= maxSlots) return [];
    return [{
      type: "incomplete",
      severity: "warning",
      nodeId: this.id,
      storagePath: "builder.selectedFeats",
      label: "Feats",
      reason: `You can select ${maxSlots} feats, but only selected ${selected.length}.`,
      previousValue: selected.length,
      nextValue: maxSlots,
    }];
  }

  reconcileDependencyState(context = {}) {
    const gameData = context.gameData;
    const builder = context.proposedBuilder || context.builder || {};
    const changes = [];
    const b = { ...builder };
    const selectedFeatNames = selectedSet(b.selectedFeats, { maxItems: 200, maxLen: 160 });
    const selectedFeatOptions = selectedSet(b.selectedFeatOptions, { maxItems: 500, maxLen: 200 });
    const visibleFeats = this.getAvailableFeats({ gameData, builder: b });
    const visibleFeatByName = new Map(
      visibleFeats
        .map((feat) => [sanitizeText(feat?.name || "", { maxLen: 160, collapse: true }), feat])
        .filter(([name]) => !!name),
    );
    const prereqContext = { gameData, builder: b, deferUnresolvedChoices: true };

    for (const name of Array.from(selectedFeatNames)) {
      const feat = visibleFeatByName.get(name);
      if (!feat) {
        removeSelection(selectedFeatNames, name, changes, {
          type: "remove",
          severity: "warning",
          storagePath: "builder.selectedFeats",
          nodeId: `choice:feat:${name}`,
          label: name,
          reason: "This feat is no longer available for the current class and level.",
        });
        continue;
      }

      const check = checkPrerequisites(feat?.prerequisites, prereqContext);
      if (!check.ok) {
        removeSelection(selectedFeatNames, name, changes, {
          type: "remove",
          severity: "warning",
          storagePath: "builder.selectedFeats",
          nodeId: `choice:feat:${name}`,
          label: name,
          reason: check.failureReasons.join(" ") || "Prerequisites are no longer met.",
        });
        deleteSelectedDescendants(feat, selectedFeatOptions);
      }
    }

    const maxSlots = this.getFeatSlots(b.level);
    if (selectedFeatNames.size > maxSlots) {
      for (const name of Array.from(selectedFeatNames).slice(maxSlots)) {
        const feat = visibleFeatByName.get(name);
        removeSelection(selectedFeatNames, name, changes, {
          type: "remove",
          severity: "warning",
          storagePath: "builder.selectedFeats",
          nodeId: `choice:feat:${name}`,
          label: name,
          reason: `Only ${maxSlots} feat slot${maxSlots === 1 ? "" : "s"} available at level ${b.level}.`,
        });
        if (feat) deleteSelectedDescendants(feat, selectedFeatOptions);
      }
    }

    const selectedFeatEntries = Array.from(selectedFeatNames)
      .map((name) => visibleFeatByName.get(name))
      .filter(Boolean);
    reconcileSelectedOptionKeys({
      entries: selectedFeatEntries,
      selectedKeys: selectedFeatOptions,
      changes,
      storagePath: "builder.selectedFeatOptions",
      nodePrefix: "choice:featOption",
      unavailableReason: "This option is no longer available from the current selected feats.",
      getPrerequisiteContext: () => ({
        gameData,
        builder: { ...b, selectedFeats: Array.from(selectedFeatNames) },
        deferUnresolvedChoices: true,
      }),
    });

    return {
      patch: {
        "builder.selectedFeats": Array.from(selectedFeatNames),
        "builder.selectedFeatOptions": Array.from(selectedFeatOptions),
      },
      changes,
    };
  }

  render() {
    if (!this.containerEl) return null;
    this.page?.clearWidgets?.({ scope: "feat" });
    this.containerEl.innerHTML = "";

    let hiddenUnavailableCount = 0;
    let unavailableCount = 0;
    const classKey = this.getClassKey();
    const level = this.getLevel();
    const maxSlots = this.getFeatSlots(level);
    const selectedFeatNames = this.selectedFeatNames();
    const selectedFeatOptionKeys = this.selectedFeatOptionKeys();

    if (!classKey) {
      this.containerEl.innerHTML = `<p class="muted">Choose a class to view feats.</p>`;
      if (this.hintEl) this.hintEl.textContent = "";
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    const visible = this.getAvailableFeats({ builder: { classKey, level } });
    if (this.hintEl) this.hintEl.textContent = `Slots: ${selectedFeatNames.size}/${maxSlots}`;

    if (maxSlots <= 0) {
      this.containerEl.innerHTML = `<p class="muted">No feat slots at level ${level}. (First slot at level 2.)</p>`;
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    if (!visible.length) {
      this.containerEl.innerHTML = `<p class="muted">No feats available for this class at your level.</p>`;
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    const list = document.createElement("div");
    list.className = "optionList";

    for (const feat of visible) {
      const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
      if (!name) continue;
      const widget = new FeatWidget(this.page, {
        feat,
        selectedFeatNames,
        selectedFeatOptionKeys,
        maxSlots,
        showUnavailable: this.showUnavailable(),
        checkEntryPrerequisites: this.checkEntryPrerequisites,
        renderOptionGroup: this.renderOptionGroup,
        trackUnavailable: ({ hidden }) => {
          if (hidden) hiddenUnavailableCount += 1;
          else unavailableCount += 1;
        },
        setStatus: this.setStatus,
        onChange: () => {
          this.setSelectedFeatNames(selectedFeatNames);
          this.setSelectedFeatOptionKeys(selectedFeatOptionKeys);
          this.onChange?.();
        },
      });
      if (widget.element) list.append(widget.element);
    }

    this.containerEl.append(list);
    if (!list.children.length) {
      this.containerEl.innerHTML = `<p class="muted">No selectable feats match the current filters.</p>`;
    }
    setPrerequisiteNotice(this.prereqNoticeEl, unavailableCount, hiddenUnavailableCount);
    return this.containerEl;
  }
}
