import { SetFeatSelection } from "../../core/character-commands.js";
import { getFeatGrantChoices } from "../../core/feat-rules.js";
import { escapeHtml } from "../../core/data-sanitization.js";
import { formatPrerequisites } from "../../core/prerequisites.js";
import { isOptionGroup } from "../../core/option-groups.js";

/** One portable picker for an answer-producing feat grant. */
export class FeatChoiceWidget {
  constructor(page, {
    entry, index = 0, sourceId, scope = "feature", gameData,
    getBuilder = () => page.getCharacter().builder,
    expandedChoices = new Set(), renderFeatOptions = null,
    renderFeatGrants = null, onChange = null, mount = null,
  } = {}) {
    this.id = `feat-choice:${sourceId}:${index}`;
    this.scope = scope;
    this.childScope = `${this.id}:children`;
    this.page = page;
    this.entry = entry;
    this.index = index;
    this.gameData = gameData;
    this.getBuilder = typeof getBuilder === "function" ? getBuilder : () => page.getCharacter().builder;
    this.expandedChoices = expandedChoices;
    this.renderFeatOptions = renderFeatOptions;
    this.renderFeatGrants = renderFeatGrants;
    this.onChange = onChange;
    this.element = mount || document.createElement("div");
    this.element.className = "featChoiceWidget";
    this.busy = false;
    this.enabled = true;
    this.error = "";
    this.changeHandler = (event) => this.change(event);
    this.clickHandler = (event) => this.toggleExpanded(event);
    this.element.addEventListener("change", this.changeHandler);
    this.element.addEventListener("click", this.clickHandler);
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState() { this.render(); }

  toggleExpanded(event) {
    const index = event.target?.dataset?.featExpand;
    if (index === undefined || event.target.dataset.featWidget !== this.id || this.busy || !this.enabled) return;
    if (!this.choices[Number(index)]) return;
    const key = `${this.id}:${index}`;
    if (this.expandedChoices.has(key)) this.expandedChoices.delete(key);
    else this.expandedChoices.add(key);
    this.render();
    this.element.querySelector(`[data-feat-expand="${index}"]`)?.focus();
  }

  focusChoice(index) {
    const selector = `[data-feat-slot="${index}"]`;
    (this.element.querySelector(`${selector}:checked`) || this.element.querySelector(selector))?.focus();
  }

  async change(event) {
    const index = event.target?.dataset?.featSlot;
    if (index === undefined || this.busy || !this.enabled) return;
    // Nested grant widgets handle their own controls.
    if (event.target.dataset.featWidget !== this.id) return;
    this.choices = getFeatGrantChoices(this.gameData, this.getBuilder(), { entry: this.entry, grantIndex: this.index });
    const choice = this.choices[Number(index)];
    if (!choice || event.target.value === choice.featKey) return;
    const option = choice.options.find((item) => item.featKey === event.target.value);
    if (event.target.value && !option?.eligible) return this.render();
    this.focusIndex = Number(index);
    this.busy = true;
    this.error = "";
    let accepted = false;
    this.render();
    try {
      const result = await this.page.requestCharacterCommand(this,
        SetFeatSelection(option ? option.nextFeatKeys : choice.clearedFeatKeys));
      accepted = result.ok;
      if (!result.ok && result.reason !== "cancelled") {
        this.error = result.errors?.join(" ") || "That feat change could not be applied.";
      }
    } catch (error) {
      this.error = error.message || "That feat change could not be applied.";
    } finally {
      this.busy = false;
      this.render();
    }
    // The coordinator refreshes newly granted choices and other feature cards.
    if (accepted) this.onChange?.();
    const replacement = this.page.widgets?.get(this.id);
    replacement?.focusChoice(index);
  }

  render() {
    this.page.clearWidgets?.({ scope: this.childScope });
    this.choices = getFeatGrantChoices(this.gameData, this.getBuilder(), { entry: this.entry, grantIndex: this.index });
    const disabled = this.busy || !this.enabled;
    this.element.setAttribute("aria-busy", String(this.busy));
    this.element.innerHTML = `${this.error ? `<p role="alert" class="error">${escapeHtml(this.error)}</p>` : ""}${this.choices.map((choice, index) => {
      const type = Array.isArray(choice.filterType) ? "" : choice.filterType;
      const label = type === "class" ? "Choose a class feat" : type === "archetype" ? "Choose an archetype feat" : type === "general" ? "Choose a general feat" : "Choose a feat";
      const controlId = `${this.id}:${index}`;
      const expanded = this.expandedChoices.has(controlId);
      const options = choice.options.filter((option) => option.eligible);
      const inputAttributes = `data-feat-widget="${escapeHtml(this.id)}" data-feat-slot="${index}"${disabled ? " disabled" : ""}`;
      const radio = (value, name) => `<input type="radio" name="${escapeHtml(controlId)}" value="${escapeHtml(value)}" aria-label="${escapeHtml(name)}"${value === choice.featKey ? " checked" : ""} ${inputAttributes}>`;
      const selector = expanded
        ? `<fieldset class="featOptions optionList" id="${escapeHtml(controlId)}" aria-labelledby="${escapeHtml(controlId)}-label">
            <label class="optionRow">${radio("", "No feat selected")}<span>No feat selected</span></label>
            ${options.map((option) => {
              const prerequisites = formatPrerequisites(option.feat.prerequisites);
              return `<div class="featDescriptionOption"><label class="optionRow">${radio(option.featKey, option.feat.name)}
                <div><div class="optionTitle">${escapeHtml(option.feat.name)}</div>
                <div class="optionDesc">${escapeHtml(option.feat.description || "")}</div>
                ${prerequisites ? `<p class="muted">Prerequisite: ${escapeHtml(prerequisites)}</p>` : ""}</div></label>
                ${option.featKey === choice.featKey ? `<div data-feat-detail="${index}"></div>` : ""}</div>`;
            }).join("")}
          </fieldset>`
        : `<select class="input" id="${escapeHtml(controlId)}" aria-labelledby="${escapeHtml(controlId)}-label" ${inputAttributes}>
            <option value="">${choice.featKey ? "Remove selected feat" : `${label}…`}</option>
            ${options.map((option) => `<option value="${escapeHtml(option.featKey)}"${option.featKey === choice.featKey ? " selected" : ""}>${escapeHtml(option.feat.name)}</option>`).join("")}
          </select>`;
      return `<div class="builderItem"><div class="featChoiceHeader">
          <span class="label" id="${escapeHtml(controlId)}-label">${label}${this.choices.length > 1 ? ` (${index + 1})` : ""}</span>
          <button type="button" class="btn secondary" data-feat-expand="${index}" data-feat-widget="${escapeHtml(this.id)}" aria-expanded="${expanded}" aria-controls="${escapeHtml(controlId)}"${disabled ? " disabled" : ""}>${expanded ? "Collapse" : "Expand"}</button>
        </div>${selector}
        ${!options.length ? '<p class="muted">No eligible feats are currently available for this feature.</p>' : ""}</div>`;
    }).join("")}`;
    this.choices.forEach((choice, index) => {
      const feat = choice.options.find((option) => option.featKey === choice.featKey)?.feat;
      const detail = this.element.querySelector(`[data-feat-detail="${index}"]`);
      if (!this.expandedChoices.has(`${this.id}:${index}`) || !feat || !detail) return;
      const options = isOptionGroup(feat) ? this.renderFeatOptions?.(feat, this.childScope) : null;
      if (options) detail.append(options);
      const grants = this.renderFeatGrants?.(feat, this.childScope);
      if (grants) detail.append(grants);
    });
    if (!disabled && this.focusIndex !== undefined) {
      this.focusChoice(this.focusIndex);
      this.focusIndex = undefined;
    }
    return this.element;
  }

  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }
  destroy({ unregister = true } = {}) {
    this.page.clearWidgets?.({ scope: this.childScope });
    this.element.removeEventListener("change", this.changeHandler);
    this.element.removeEventListener("click", this.clickHandler);
    this.element.remove?.();
    if (unregister) this.page.unregisterWidget(this);
  }
}

export function registerFeatWidgetExtension(registry) {
  registry.register("feat", (context) => new FeatChoiceWidget(context.page, context));
  return registry;
}
