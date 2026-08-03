import { getChoiceCountState } from "../../core/choice-capacity.js";
import { formatPrerequisites } from "../../core/prerequisites.js";
import {
  deleteSelectedDescendants,
  isOptionGroup,
} from "../../core/option-groups.js";
import { BuilderWidget } from "./builder-widget.js";

export class FeatWidget extends BuilderWidget {
  constructor(page, {
    feat,
    selectedFeatNames,
    selectedFeatOptionKeys,
    maxSlots = 0,
    showUnavailable = true,
    checkEntryPrerequisites,
    renderOptionGroup,
    trackUnavailable,
    setStatus,
    onChange,
    scope = "feat",
  } = {}) {
    const name = String(feat?.name || "").trim();
    super(page, { id: `feat:${name}`, scope });
    this.feat = feat || {};
    this.name = name;
    this.selectedFeatNames = selectedFeatNames || new Set();
    this.selectedFeatOptionKeys = selectedFeatOptionKeys || new Set();
    this.maxSlots = Number(maxSlots || 0);
    this.showUnavailable = !!showUnavailable;
    this.checkEntryPrerequisites = typeof checkEntryPrerequisites === "function"
      ? checkEntryPrerequisites
      : () => ({ ok: true, failureReasons: [] });
    this.renderOptionGroup = typeof renderOptionGroup === "function" ? renderOptionGroup : null;
    this.trackUnavailable = typeof trackUnavailable === "function" ? trackUnavailable : null;
    this.setStatus = typeof setStatus === "function" ? setStatus : null;
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.element = this.render();
  }

  render() {
    if (!this.name) return null;

    const checked = this.selectedFeatNames.has(this.name);
    const countState = getChoiceCountState({
      selectedCount: this.selectedFeatNames.size,
      expectedCount: this.maxSlots,
      noun: "feat",
    });
    const limitReached = countState.isAtCapacity;
    const prereqCheck = this.checkEntryPrerequisites(this.feat);
    const prereqText = formatPrerequisites(this.feat?.prerequisites);
    const isUnavailable = !prereqCheck.ok;
    if (isUnavailable) this.trackUnavailable?.({ hidden: false });
    if (isUnavailable && !this.showUnavailable && !checked) {
      this.trackUnavailable?.({ hidden: true });
      return null;
    }

    const fragment = document.createDocumentFragment();
    const row = document.createElement("label");
    row.className = "optionRow";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.featChoice = "true";
    cb.checked = checked;
    cb.dataset.prereqOk = prereqCheck.ok ? "true" : "false";
    cb.disabled = !checked && (limitReached || isUnavailable);

    if (isUnavailable) {
      row.classList.add("isUnavailable");
      row.title = prereqCheck.failureReasons[0] || "Prerequisites not met.";
      cb.title = row.title;
    }

    cb.addEventListener("change", async () => {
      const previousChecked = !cb.checked;
      const nextFeatNames = new Set(this.selectedFeatNames);
      const nextFeatOptionKeys = new Set(this.selectedFeatOptionKeys);
      if (cb.checked) {
        const currentPrereqCheck = this.checkEntryPrerequisites(this.feat);
        if (!currentPrereqCheck.ok) {
          cb.checked = false;
          this.setStatus?.(currentPrereqCheck.failureReasons[0] || "Prerequisites not met.");
          return;
        }
        if (this.selectedFeatNames.size >= this.maxSlots) {
          cb.checked = false;
          return;
        }
        nextFeatNames.add(this.name);
      } else {
        nextFeatNames.delete(this.name);
        deleteSelectedDescendants(this.feat, nextFeatOptionKeys);
      }
      const result = await this.page?.requestChoiceChange?.(this, {
        "builder.selectedFeats": Array.from(nextFeatNames),
        "builder.selectedFeatOptions": Array.from(nextFeatOptionKeys),
      }, {
        applyWidgetChange: (preview) => {
          const reconciled = preview?.reconciledBuilder || {};
          const selectedFeats = Array.isArray(reconciled.selectedFeats)
            ? reconciled.selectedFeats
            : Array.from(nextFeatNames);
          const selectedFeatOptions = Array.isArray(reconciled.selectedFeatOptions)
            ? reconciled.selectedFeatOptions
            : Array.from(nextFeatOptionKeys);
          this.selectedFeatNames.clear();
          for (const name of selectedFeats) this.selectedFeatNames.add(name);
          this.selectedFeatOptionKeys.clear();
          for (const key of selectedFeatOptions) this.selectedFeatOptionKeys.add(key);
          this.onChange?.();
        },
      });
      if (result && !result.ok) {
        cb.checked = previousChecked;
        return;
      }
      if (!result) {
        this.selectedFeatNames.clear();
        for (const name of nextFeatNames) this.selectedFeatNames.add(name);
        this.selectedFeatOptionKeys.clear();
        for (const key of nextFeatOptionKeys) this.selectedFeatOptionKeys.add(key);
        this.onChange?.();
      }
    });

    const title = document.createElement("div");
    title.className = "optionTitle";
    title.textContent = this.name;

    const desc = document.createElement("div");
    desc.className = "muted optionDesc";
    desc.textContent = String(this.feat?.description || "");

    const textWrap = document.createElement("div");
    textWrap.append(title, desc);

    if (prereqText) {
      const prereqEl = document.createElement("div");
      prereqEl.className = "muted optionDesc";
      prereqEl.textContent = `Prerequisite: ${prereqText}`;
      textWrap.append(prereqEl);
    }
    if (isUnavailable) {
      const failureEl = document.createElement("div");
      failureEl.className = "muted optionDesc";
      failureEl.textContent = prereqCheck.failureReasons[0] || "Prerequisites not met.";
      textWrap.append(failureEl);
    }

    row.append(cb, textWrap);
    fragment.append(row);

    if (checked && isOptionGroup(this.feat)) {
      const childGroup = this.renderOptionGroup?.(this.feat);
      if (childGroup) fragment.append(childGroup);
    }

    return fragment;
  }
}
