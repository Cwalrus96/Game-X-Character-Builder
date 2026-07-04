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

  getDependencyNodes() {
    if (!this.group?.options) return [];
    return [{
      id: this.id,
      kind: "choice",
      storagePath: this.storagePath,
      label: String(this.group?.name || "Option group"),
      prerequisites: this.group?.prerequisites || [],
      grants: this.group?.grants || [],
    }];
  }

  validateDependencyState(context = {}) {
    if (this.isActive && !this.isActive(context)) return [];
    if (!this.group?.options || !this.storagePath) return [];
    const chooseCount = Number(this.group?.chooseCount || 0);
    if (!chooseCount) return [];
    const selectedCount = selectedCountForGroup(this.group, this.getSelectedKeysForContext(context));
    if (selectedCount === chooseCount) return [];
    return [{
      type: "incomplete",
      severity: "warning",
      nodeId: this.id,
      storagePath: this.storagePath,
      label: String(this.group?.name || "Option group"),
      reason: `Expected ${chooseCount} choice${chooseCount === 1 ? "" : "s"}, but ${selectedCount} selected.`,
      previousValue: selectedCount,
      nextValue: chooseCount,
    }];
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

    const selectedCount = selectedCountForGroup(group, this.selectedKeys);
    headerBtn.innerHTML = `
      <span>${sanitizeText(group.name || "Options", { maxLen: 200 })}</span>
      <span class="muted">choose ${chooseCount} - ${selectedCount}/${chooseCount}</span>
    `;

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

    const picked = selectedCountForGroup(group, this.selectedKeys);
    const limitReached = chooseCount > 1 && picked >= chooseCount;

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

      cb.addEventListener("change", () => {
        if (cb.checked) {
          const currentPrereqCheck = this.checkEntryPrerequisites(option);
          if (!currentPrereqCheck.ok) {
            cb.checked = false;
            this.setStatus?.(currentPrereqCheck.failureReasons[0] || "Prerequisites not met.");
            return;
          }
          if (chooseCount === 1) {
            for (const sibling of opts) {
              this.selectedKeys.delete(buildOptionKey(group, sibling));
              deleteSelectedDescendants(sibling, this.selectedKeys);
            }
          } else if (chooseCount > 1 && selectedCountForGroup(group, this.selectedKeys) >= chooseCount) {
            cb.checked = false;
            return;
          }
          this.selectedKeys.add(key);
        } else {
          this.selectedKeys.delete(key);
          deleteSelectedDescendants(option, this.selectedKeys);
        }
        this.onChange?.();
      });

      const title = document.createElement("div");
      title.className = "optionTitle";
      title.textContent = String(option.name || "Option");

      const desc = document.createElement("div");
      desc.className = "muted optionDesc";
      desc.textContent = String(option.description || "");

      const textWrap = document.createElement("div");
      textWrap.append(title, desc);

      const grantWidgets = this.createGrantWidgets?.(option, { scope: this.context });
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
