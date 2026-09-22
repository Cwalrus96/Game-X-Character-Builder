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
    showUnavailable = () => true, renderFeatOptions = null,
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
    this.showUnavailable = showUnavailable;
    this.renderFeatOptions = renderFeatOptions;
    this.renderFeatGrants = renderFeatGrants;
    this.onChange = onChange;
    this.element = mount || document.createElement("div");
    this.element.className = "featChoiceWidget";
    this.busy = false;
    this.enabled = true;
    this.error = "";
    this.changeHandler = (event) => this.change(event);
    this.element.addEventListener("change", this.changeHandler);
    page.registerWidget(this);
    this.render();
  }

  applyReconciledState() { this.render(); }

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
    replacement?.element?.querySelector(`[data-feat-slot="${index}"]`)?.focus();
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
      const options = choice.options.filter((option) => this.showUnavailable() || option.eligible || option.featKey === choice.featKey);
      return `<div class="builderItem"><label class="label" for="${escapeHtml(controlId)}">${label}${this.choices.length > 1 ? ` (${index + 1})` : ""}</label>
        <select class="input" id="${escapeHtml(controlId)}" data-feat-widget="${escapeHtml(this.id)}" data-feat-slot="${index}"${disabled ? " disabled" : ""}>
          <option value="">${choice.featKey ? "Remove selected feat" : `${label}…`}</option>
          ${options.map((option) => `<option value="${escapeHtml(option.featKey)}"${option.featKey === choice.featKey ? " selected" : ""}${option.eligible ? "" : " disabled"}>${escapeHtml(option.feat.name)}${option.reason ? ` — ${escapeHtml(option.reason)}` : ""}</option>`).join("")}
        </select>
        ${choice.maxLevel ? `<p class="help">Level ${choice.maxLevel} or lower.</p>` : ""}
        ${!choice.options.some((option) => option.eligible) ? '<p class="muted">No eligible feats are currently available for this feature.</p>' : ""}
        <div data-feat-detail="${index}"></div></div>`;
    }).join("")}`;
    this.choices.forEach((choice, index) => {
      const feat = choice.options.find((option) => option.featKey === choice.featKey)?.feat;
      const detail = this.element.querySelector(`[data-feat-detail="${index}"]`);
      if (!feat || !detail) return;
      const prerequisites = formatPrerequisites(feat.prerequisites);
      detail.innerHTML = `<p class="optionDesc">${escapeHtml(feat.description || "")}</p>${prerequisites ? `<p class="muted">Prerequisite: ${escapeHtml(prerequisites)}</p>` : ""}`;
      const options = isOptionGroup(feat) ? this.renderFeatOptions?.(feat, this.childScope) : null;
      if (options) detail.append(options);
      const grants = this.renderFeatGrants?.(feat, this.childScope);
      if (grants) detail.append(grants);
    });
    if (!disabled && this.focusIndex !== undefined) {
      this.element.querySelector(`[data-feat-slot="${this.focusIndex}"]`)?.focus();
      this.focusIndex = undefined;
    }
    return this.element;
  }

  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }
  destroy({ unregister = true } = {}) {
    this.page.clearWidgets?.({ scope: this.childScope });
    this.element.removeEventListener("change", this.changeHandler);
    this.element.remove?.();
    if (unregister) this.page.unregisterWidget(this);
  }
}

export function registerFeatWidgetExtension(registry) {
  registry.register("feat", (context) => new FeatChoiceWidget(context.page, context));
  return registry;
}
