import { getChoiceCountState } from "../../core/choice-capacity.js";
import { sanitizeText } from "../../core/data-sanitization.js";
import { getFeatSelectionState } from "../../core/feat-rules.js?v=wpe10";
import { BuilderWidget } from "./builder-widget.js";
import { FeatWidget } from "./feat-widget.js?v=wpe1";

export class FeatsWidget extends BuilderWidget {
  constructor(page, {
    containerEl,
    hintEl = null,
    getClassKey = null,
    getLevel = null,
    getSelectedFeatNames = null,
    setSelectedFeatNames = null,
    getSelectedFeatOptionKeys = null,
    setSelectedFeatOptionKeys = null,
    getGameData = null,
    getBuilder = null,
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
    this.getClassKey = typeof getClassKey === "function" ? getClassKey : () => "";
    this.getLevel = typeof getLevel === "function" ? getLevel : () => 1;
    this.getSelectedFeatNames = typeof getSelectedFeatNames === "function" ? getSelectedFeatNames : () => new Set();
    this.setSelectedFeatNames = typeof setSelectedFeatNames === "function" ? setSelectedFeatNames : () => {};
    this.getSelectedFeatOptionKeys = typeof getSelectedFeatOptionKeys === "function" ? getSelectedFeatOptionKeys : () => new Set();
    this.setSelectedFeatOptionKeys = typeof setSelectedFeatOptionKeys === "function" ? setSelectedFeatOptionKeys : () => {};
    this.getGameData = typeof getGameData === "function" ? getGameData : () => ({});
    this.getBuilder = typeof getBuilder === "function" ? getBuilder : () => ({});
    this.showUnavailable = typeof showUnavailable === "function" ? showUnavailable : () => false;
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

    const classKey = this.getClassKey();
    const level = this.getLevel();
    const selectedFeatNames = this.selectedFeatNames();
    const selectedFeatOptionKeys = this.selectedFeatOptionKeys();

    if (!classKey) {
      this.containerEl.innerHTML = `<p class="muted">Choose a class to view feats.</p>`;
      if (this.hintEl) this.hintEl.textContent = "";

      return this.containerEl;
    }

    const featState = getFeatSelectionState(this.getGameData(), {
      ...this.getBuilder(),
      classKey,
      level,
      selectedFeats: Array.from(selectedFeatNames),
    });
    const maxSlots = featState.capacity;
    const visible = featState.availableFeats;
    const countState = getChoiceCountState({
      selectedCount: selectedFeatNames.size,
      expectedCount: maxSlots,
      noun: "feat",
    });
    if (this.hintEl) this.hintEl.textContent = `Explicit feat choices: ${countState.selectedCount}/${countState.expectedCount}`;

    if (maxSlots <= 0) {
      this.containerEl.innerHTML = `<p class="muted">No active feature currently grants a feat choice.</p>`;

      return this.containerEl;
    }

    if (!visible.length) {
      this.containerEl.innerHTML = `<p class="muted">No published feats match the active explicit feat grants.</p>`;

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

    return this.containerEl;
  }
}
