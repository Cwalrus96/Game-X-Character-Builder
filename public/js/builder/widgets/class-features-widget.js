import { buildGroupId, sanitizeText } from "../../core/data-sanitization.js";
import { collectOptionGroups } from "../../core/option-groups.js";
import { sortClassFeaturesByLevel } from "../../core/class-feature-display.js";
import { BuilderWidget } from "./builder-widget.js";

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

export class ClassFeaturesWidget extends BuilderWidget {
  constructor(page, {
    containerEl,
    hintEl = null,
    prereqNoticeEl = null,
    getClassKey = null,
    getLevel = null,
    getSelectedFeatureOptionKeys = null,
    setSelectedFeatureOptionKeys = null,
    getAvailableFeatures = null,
    showUnavailable = null,
    checkEntryPrerequisites = null,
    renderOptionGroup = null,
    renderGrantWidgets = null,
    scope = "page",
  } = {}) {
    super(page, { id: "class-features", scope });
    this.containerEl = containerEl || null;
    this.hintEl = hintEl || null;
    this.prereqNoticeEl = prereqNoticeEl || null;
    this.getClassKey = typeof getClassKey === "function" ? getClassKey : () => "";
    this.getLevel = typeof getLevel === "function" ? getLevel : () => 1;
    this.getSelectedFeatureOptionKeys = typeof getSelectedFeatureOptionKeys === "function"
      ? getSelectedFeatureOptionKeys
      : () => new Set();
    this.setSelectedFeatureOptionKeys = typeof setSelectedFeatureOptionKeys === "function"
      ? setSelectedFeatureOptionKeys
      : () => {};
    this.getAvailableFeatures = typeof getAvailableFeatures === "function" ? getAvailableFeatures : () => [];
    this.showUnavailable = typeof showUnavailable === "function" ? showUnavailable : () => true;
    this.checkEntryPrerequisites = typeof checkEntryPrerequisites === "function"
      ? checkEntryPrerequisites
      : () => ({ ok: true, failureReasons: [] });
    this.renderOptionGroup = typeof renderOptionGroup === "function" ? renderOptionGroup : null;
    this.renderGrantWidgets = typeof renderGrantWidgets === "function" ? renderGrantWidgets : null;
  }

  selectedFeatureOptionKeys() {
    return this.getSelectedFeatureOptionKeys() || new Set();
  }

  getSavePatch() {
    return {
      "builder.selectedClassFeatureOptions": Array.from(this.selectedFeatureOptionKeys()),
    };
  }

  render() {
    if (!this.containerEl) return null;
    this.page?.clearWidgets?.({ scope: "feature" });
    this.containerEl.replaceChildren();

    let hiddenUnavailableCount = 0;
    let unavailableCount = 0;
    const classKey = this.getClassKey();
    const level = this.getLevel();
    const selectedFeatureOptionKeys = this.selectedFeatureOptionKeys();

    if (!classKey) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "Choose a class to view features.";
      this.containerEl.append(message);
      if (this.hintEl) this.hintEl.textContent = "";
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    const visible = sortClassFeaturesByLevel(this.getAvailableFeatures({ builder: { classKey, level } }));
    if (this.hintEl) this.hintEl.textContent = `Showing features up to level ${level}.`;

    if (!visible.length) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "No features available.";
      this.containerEl.append(message);
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    for (const feature of visible) {
      const type = String(feature?.type || "");

      if (type === "feature") {
        const card = document.createElement("div");
        card.className = "builderItem";
        const title = document.createElement("div");
        title.className = "builderItemTitle";
        title.textContent = sanitizeText(feature.name || "Feature", { maxLen: 200 });
        const meta = document.createElement("div");
        meta.className = "muted builderItemMeta";
        meta.textContent = `Level ${Number(feature.level || 1)}`;
        const body = document.createElement("div");
        body.className = "builderItemBody";
        body.textContent = sanitizeText(feature.description || "", { maxLen: 2000 });
        card.append(title, meta, body);
        const grantWidgets = this.renderGrantWidgets?.(feature, { scope: "feature" });
        if (grantWidgets) card.append(grantWidgets);
        this.containerEl.append(card);
        continue;
      }

      if (type === "optionGroup") {
        const groupId = buildGroupId(feature);
        const optionGroup = this.renderOptionGroup?.(feature, selectedFeatureOptionKeys, () => this.render(), 0, {
          context: "feature",
          trackUnavailable: ({ hidden }) => {
            if (hidden) hiddenUnavailableCount += 1;
            else unavailableCount += 1;
          },
          isActive: (dependencyContext = {}) => {
            const builder = dependencyContext.reconciledBuilder || dependencyContext.proposedBuilder || dependencyContext.builder || {};
            const visibleGroups = collectOptionGroups(this.getAvailableFeatures({
              gameData: dependencyContext.gameData,
              builder,
            }));
            return visibleGroups.some((group) => buildGroupId(group) === groupId);
          },
        });
        if (optionGroup) this.containerEl.append(optionGroup);
      }
    }

    setPrerequisiteNotice(this.prereqNoticeEl, unavailableCount, hiddenUnavailableCount);
    this.setSelectedFeatureOptionKeys(selectedFeatureOptionKeys);
    return this.containerEl;
  }
}
