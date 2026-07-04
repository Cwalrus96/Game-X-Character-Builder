import { reconcileSelectedOptionKeys, selectedSet } from "../../core/choice-reconciliation.js";
import { buildGroupId, sanitizeText } from "../../core/data-sanitization.js";
import { collectOptionGroups } from "../../core/option-groups.js";
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

  getDependencyNodes(context = {}) {
    const builder = context.builder || {};
    return this.getAvailableFeatures({ gameData: context.gameData, builder })
      .map((entry) => {
        const name = sanitizeText(entry?.name || "", { maxLen: 160, collapse: true });
        if (!name) return null;
        return {
          id: `class-feature:${name}`,
          kind: "choice",
          storagePath: "builder.selectedClassFeatureOptions",
          label: name,
          prerequisites: entry?.prerequisites || [],
          grants: entry?.grants || [],
        };
      })
      .filter(Boolean);
  }

  reconcileDependencyState(context = {}) {
    const gameData = context.gameData;
    const builder = context.proposedBuilder || context.builder || {};
    const changes = [];
    const b = { ...builder };
    const selectedFeatureOptions = selectedSet(b.selectedClassFeatureOptions, { maxItems: 1000, maxLen: 200 });
    const visibleFeatures = this.getAvailableFeatures({ gameData, builder: b });
    const previousFeatures = this.getAvailableFeatures({ gameData, builder: context.previousBuilder || b });
    reconcileSelectedOptionKeys({
      entries: visibleFeatures,
      previousEntries: previousFeatures,
      selectedKeys: selectedFeatureOptions,
      changes,
      storagePath: "builder.selectedClassFeatureOptions",
      nodePrefix: "choice:classFeatureOption",
      unavailableReason: "This option is no longer available for the current class and level.",
      getPrerequisiteContext: (selectedKeys) => ({
        gameData,
        builder: { ...b, selectedClassFeatureOptions: Array.from(selectedKeys) },
        deferUnresolvedChoices: true,
      }),
    });

    return {
      patch: {
        "builder.selectedClassFeatureOptions": Array.from(selectedFeatureOptions),
      },
      changes,
    };
  }

  render() {
    if (!this.containerEl) return null;
    this.page?.clearWidgets?.({ scope: "feature" });
    this.containerEl.innerHTML = "";

    let hiddenUnavailableCount = 0;
    let unavailableCount = 0;
    const classKey = this.getClassKey();
    const level = this.getLevel();
    const selectedFeatureOptionKeys = this.selectedFeatureOptionKeys();

    if (!classKey) {
      this.containerEl.innerHTML = `<p class="muted">Choose a class to view features.</p>`;
      if (this.hintEl) this.hintEl.textContent = "";
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    const visible = this.getAvailableFeatures({ builder: { classKey, level } });
    if (this.hintEl) this.hintEl.textContent = `Showing features up to level ${level}.`;

    if (!visible.length) {
      this.containerEl.innerHTML = `<p class="muted">No features available.</p>`;
      setPrerequisiteNotice(this.prereqNoticeEl, 0, 0);
      return this.containerEl;
    }

    for (const feature of visible) {
      const type = String(feature?.type || "");

      if (type === "feature") {
        const card = document.createElement("div");
        card.className = "builderItem";
        card.innerHTML = `
          <div class="builderItemTitle">${sanitizeText(feature.name || "Feature", { maxLen: 200 })}</div>
          <div class="muted builderItemMeta">Level ${Number(feature.level || 1)}</div>
          <div class="builderItemBody">${sanitizeText(feature.description || "", { maxLen: 2000 })}</div>
        `;
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
