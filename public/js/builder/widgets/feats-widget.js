import { getChoiceCountState } from "../../core/choice-capacity.js";
import { sanitizeText } from "../../core/data-sanitization.js";
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
    const countState = getChoiceCountState({
      selectedCount: selectedFeatNames.size,
      expectedCount: maxSlots,
      noun: "feat",
    });
    if (this.hintEl) this.hintEl.textContent = `Slots: ${countState.selectedCount}/${countState.expectedCount}`;

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
