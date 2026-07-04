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

  getDependencyNodes() {
    if (!this.name) return [];
    return [{
      id: this.id,
      kind: "choice",
      storagePath: "builder.selectedFeats",
      label: this.name,
      prerequisites: this.feat?.prerequisites || [],
      grants: this.feat?.grants || [],
    }];
  }

  render() {
    if (!this.name) return null;

    const checked = this.selectedFeatNames.has(this.name);
    const limitReached = this.maxSlots > 0 && this.selectedFeatNames.size >= this.maxSlots;
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

    cb.addEventListener("change", () => {
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
        this.selectedFeatNames.add(this.name);
      } else {
        this.selectedFeatNames.delete(this.name);
        deleteSelectedDescendants(this.feat, this.selectedFeatOptionKeys);
      }
      this.onChange?.();
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
