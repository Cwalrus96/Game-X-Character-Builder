import { getChoiceCountState } from "../../core/choice-capacity.js";
import { buildGroupId, buildOptionKey, sanitizeText } from "../../core/data-sanitization.js";
import { formatPrerequisites } from "../../core/prerequisites.js";
import {
  deleteSelectedDescendants,
  isOptionGroup,
  selectedCountForGroup,
} from "../../core/option-groups.js";
import { BuilderWidget } from "./builder-widget.js";

export class OptionGroupWidget extends BuilderWidget {
  constructor(page, {
    id = "",
    group,
    selectedKeys,
    storagePath = "",
    getSelectedKeys = null,
    onChange,
    depth = 0,
    context = "feature",
    collapsedGroups,
    showUnavailable = true,
    checkEntryPrerequisites,
    trackUnavailable,
    createGrantWidgets,
    setStatus,
    isActive = null,
    scope = context,
  } = {}) {
    super(page, { id: id || `option-group:${context}:${buildGroupId(group)}`, scope });
    this.group = group || {};
    this.selectedKeys = selectedKeys || new Set();
    this.storagePath = storagePath || "";
    this.getSelectedKeys = typeof getSelectedKeys === "function" ? getSelectedKeys : null;
    this.onChange = typeof onChange === "function" ? onChange : null;
    this.depth = depth;
    this.context = context;
    this.collapsedGroups = collapsedGroups || new Map();
    this.showUnavailable = !!showUnavailable;
    this.checkEntryPrerequisites = typeof checkEntryPrerequisites === "function"
      ? checkEntryPrerequisites
      : () => ({ ok: true, failureReasons: [] });
    this.trackUnavailable = typeof trackUnavailable === "function" ? trackUnavailable : null;
    this.createGrantWidgets = typeof createGrantWidgets === "function" ? createGrantWidgets : null;
    this.setStatus = typeof setStatus === "function" ? setStatus : null;
    this.isActive = typeof isActive === "function" ? isActive : null;
    this.element = this.render();
  }

  getSavePatch() {
    if (!this.storagePath) return {};
    const selectedKeys = this.getSelectedKeys?.() || this.selectedKeys || new Set();
    return {
      [this.storagePath]: Array.from(selectedKeys),
    };
  }

  getSelectedKeysForContext(context = {}) {
    if (!this.storagePath?.startsWith("builder.")) return this.selectedKeys;
    const builder = context.reconciledBuilder || context.proposedBuilder || context.builder || null;
    if (!builder || typeof builder !== "object") return this.selectedKeys;
    const parts = this.storagePath.slice("builder.".length).split(".").filter(Boolean);
    let cursor = builder;
    for (const part of parts) {
      if (!cursor || typeof cursor !== "object") return this.selectedKeys;
      cursor = cursor[part];
    }
    return Array.isArray(cursor) ? new Set(cursor) : this.selectedKeys;
  }

  replaceSelectedKeys(nextKeys) {
    this.selectedKeys.clear();
    for (const key of nextKeys || []) this.selectedKeys.add(key);
  }

  renderChildGroup(option) {
    return new OptionGroupWidget(this.page, {
      group: option,
      selectedKeys: this.selectedKeys,
      storagePath: this.storagePath,
      onChange: this.onChange,
      depth: this.depth + 1,
      context: this.context,
      collapsedGroups: this.collapsedGroups,
      showUnavailable: this.showUnavailable,
      checkEntryPrerequisites: this.checkEntryPrerequisites,
      trackUnavailable: this.trackUnavailable,
      createGrantWidgets: this.createGrantWidgets,
      setStatus: this.setStatus,
      isActive: (context = {}) => this.getSelectedKeysForContext(context).has(buildOptionKey(this.group, option)),
      scope: this.scope,
    }).element;
  }

  render() {
    if (this.storagePath && !this.group?.options) return null;

    const group = this.group;
    const chooseCount = Number(group?.chooseCount || 0);
    const opts = Array.isArray(group?.options) ? group.options : [];
    const gid = buildGroupId(group);
    const isCollapsed = this.collapsedGroups.get(gid) ?? false;

    const container = document.createElement("div");
    container.className = "optionGroup";
    if (this.depth > 0) container.style.marginLeft = "18px";

    const headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.className = "optionGroupHeader";
    headerBtn.setAttribute("aria-expanded", String(!isCollapsed));

    const countState = getChoiceCountState({
      selectedCount: selectedCountForGroup(group, this.selectedKeys),
      expectedCount: chooseCount,
    });
    const groupName = document.createElement("span");
    groupName.textContent = sanitizeText(group.name || "Options", { maxLen: 200 });
    const choiceCount = document.createElement("span");
    choiceCount.className = "muted";
    choiceCount.textContent = `choose ${chooseCount} - ${countState.selectedCount}/${countState.expectedCount}`;
    headerBtn.append(groupName, choiceCount);

    const body = document.createElement("div");
    body.className = "optionGroupBody";
    body.style.display = isCollapsed ? "none" : "block";

    headerBtn.addEventListener("click", () => {
      const nowCollapsed = !(body.style.display === "none");
      body.style.display = nowCollapsed ? "none" : "block";
      this.collapsedGroups.set(gid, nowCollapsed);
      headerBtn.setAttribute("aria-expanded", String(!nowCollapsed));
    });

    if (group.description) {
      const desc = document.createElement("div");
      desc.className = "muted";
      desc.style.margin = "6px 0 10px 0";
      desc.textContent = String(group.description);
      body.append(desc);
    }

    const list = document.createElement("div");
    list.className = "optionList";

    const limitReached = chooseCount > 1 && countState.isAtCapacity;

    for (const option of opts) {
      const key = buildOptionKey(group, option);
      const checked = this.selectedKeys.has(key);
      const prereqCheck = this.checkEntryPrerequisites(option);
      const prereqText = formatPrerequisites(option?.prerequisites);
      const isUnavailable = !prereqCheck.ok;
      if (isUnavailable) this.trackUnavailable?.({ context: this.context, hidden: false });
      if (isUnavailable && !this.showUnavailable && !checked) {
        this.trackUnavailable?.({ context: this.context, hidden: true });
        continue;
      }

      const row = document.createElement("label");
      row.className = "optionRow";
      if (isUnavailable) {
        row.classList.add("isUnavailable");
        row.title = prereqCheck.failureReasons[0] || "Prerequisites not met.";
      }

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.key = key;
      cb.checked = checked;
      cb.disabled = !checked && (limitReached || isUnavailable);
      cb.title = isUnavailable ? (prereqCheck.failureReasons[0] || "Prerequisites not met.") : "";

      cb.addEventListener("change", async () => {
        const previousChecked = !cb.checked;
        const nextKeys = new Set(this.selectedKeys);
        if (cb.checked) {
          const currentPrereqCheck = this.checkEntryPrerequisites(option);
          if (!currentPrereqCheck.ok) {
            cb.checked = false;
            this.setStatus?.(currentPrereqCheck.failureReasons[0] || "Prerequisites not met.");
            return;
          }
          if (chooseCount === 1) {
            for (const sibling of opts) {
              nextKeys.delete(buildOptionKey(group, sibling));
              deleteSelectedDescendants(sibling, nextKeys);
            }
          } else if (chooseCount > 1 && getChoiceCountState({
            selectedCount: selectedCountForGroup(group, nextKeys),
            expectedCount: chooseCount,
          }).isAtCapacity) {
            cb.checked = false;
            return;
          }
          nextKeys.add(key);
        } else {
          nextKeys.delete(key);
          deleteSelectedDescendants(option, nextKeys);
        }
        const patch = this.storagePath ? { [this.storagePath]: Array.from(nextKeys) } : {};
        const result = await this.page?.requestChoiceChange?.(this, patch, {
          applyWidgetChange: () => {
            this.onChange?.();
          },
        });
        if (result && !result.ok) {
          cb.checked = previousChecked;
          return;
        }
        if (!result) {
          this.replaceSelectedKeys(nextKeys);
          this.onChange?.();
        }
      });

      const title = document.createElement("div");
      title.className = "optionTitle";
      title.textContent = String(option.name || "Option");

      const desc = document.createElement("div");
      desc.className = "muted optionDesc";
      desc.textContent = String(option.description || "");

      const textWrap = document.createElement("div");
      textWrap.append(title, desc);

      const grantWidgets = checked
        ? this.createGrantWidgets?.(option, {
            scope: this.context,
            group,
            option,
            optionKey: key,
            storagePath: this.storagePath,
            sourceId: this.storagePath ? `choice:${this.storagePath}:${key}` : "",
          })
        : null;
      if (grantWidgets) textWrap.append(grantWidgets);
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
      list.append(row);

      if (checked && isOptionGroup(option)) {
        list.append(this.renderChildGroup(option));
      }
    }

    body.append(list);
    container.append(headerBtn, body);
    return container;
  }
}
