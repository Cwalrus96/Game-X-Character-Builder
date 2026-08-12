import { CharacterSession } from "../core/character-session.js?v=wpe1";
import { createCharacterSessionGraphReconciler } from "../core/graph-reconciler.js?v=wpe13";

function messageForImpact(impact) {
  if (impact?.message) return impact.message;
  const label = impact?.label || impact?.nodeId || impact?.path || "Character choice";
  if (impact?.type === "remove") return `${label} will be removed.`;
  if (impact?.type === "incomplete") return `${label} is incomplete.`;
  return `${label} will change.`;
}

export function summarizeCharacterImpacts(impacts = [], { category = "" } = {}) {
  return (Array.isArray(impacts) ? impacts : [])
    .filter((impact) => !category || impact.category === category)
    .map(messageForImpact)
    .filter(Boolean);
}

export class CharacterSessionPage {
  constructor({
    character,
    revision = 0,
    metadata = {},
    gameData,
    confirmImpacts = null,
    onCommandRejected = null,
    onStateChange = null,
  } = {}) {
    this.confirmImpacts = typeof confirmImpacts === "function" ? confirmImpacts : null;
    this.onCommandRejected = typeof onCommandRejected === "function" ? onCommandRejected : null;
    this.onStateChange = typeof onStateChange === "function" ? onStateChange : null;
    this.widgets = new Map();
    this.session = new CharacterSession({
      character,
      revision,
      metadata,
      reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }),
    });
  }

  getState() {
    return this.session.getState();
  }

  getCharacter() {
    return this.getState().working;
  }

  registerWidget(widget) {
    if (!widget?.id) return;
    const previous = this.widgets.get(widget.id);
    if (previous && previous !== widget) previous.destroy?.({ unregister: false });
    this.widgets.set(widget.id, widget);
  }

  unregisterWidget(widgetOrId) {
    const id = typeof widgetOrId === "string" ? widgetOrId : widgetOrId?.id;
    if (id) this.widgets.delete(id);
  }

  clearWidgets({ scope = "" } = {}) {
    for (const widget of Array.from(this.widgets.values())) {
      if (scope && widget.scope !== scope) continue;
      widget.destroy?.({ unregister: false });
      this.widgets.delete(widget.id);
    }
  }

  notify(proposal = null) {
    const state = this.getState();
    this.onStateChange?.(state, proposal);
    for (const widget of this.widgets.values()) {
      widget.applyReconciledState?.(state.working, { state, proposal, page: this });
    }
    return state;
  }

  async requestCharacterCommand(widget, command, { applyWidgetChange = null } = {}) {
    let proposal;
    try {
      proposal = this.session.propose(command);
    } catch (error) {
      const result = { ok: false, reason: "session-error", proposal: null, errors: [error.message], error };
      this.onCommandRejected?.(result, widget);
      return result;
    }
    const errors = summarizeCharacterImpacts(proposal.impacts, { category: "error" });
    if (!proposal.ok) {
      this.session.cancelProposal(proposal.proposalId);
      const result = { ok: false, reason: "validation-error", proposal, errors };
      this.onCommandRejected?.(result, widget);
      return result;
    }

    if (proposal.requiresConfirmation) {
      if (!this.confirmImpacts) {
        this.session.cancelProposal(proposal.proposalId);
        return { ok: false, reason: "confirmation-required", proposal, errors: [] };
      }
      const accepted = await this.confirmImpacts({
        proposal,
        widget,
        impacts: proposal.impacts,
        messages: summarizeCharacterImpacts(proposal.impacts, { category: "confirmation-required" }),
      });
      if (!accepted) {
        this.session.cancelProposal(proposal.proposalId);
        return { ok: false, reason: "cancelled", proposal, errors: [] };
      }
    }

    this.session.acceptProposal(proposal.proposalId, { confirm: proposal.requiresConfirmation });
    const state = this.notify(proposal);
    applyWidgetChange?.(proposal, state);
    return { ok: true, proposal, state, errors: [] };
  }

  async save(saveCharacter) {
    if (typeof saveCharacter !== "function") throw new TypeError("saveCharacter must be a function.");
    let snapshot;
    try {
      snapshot = this.session.createSaveSnapshot();
    } catch (error) {
      return { ok: false, snapshot: null, error, state: this.getState() };
    }
    try {
      const result = await saveCharacter(snapshot);
      const state = this.session.acknowledgeSave(snapshot.saveId, {
        revision: result.revision,
        metadata: result.metadata || {},
      });
      this.notify();
      return { ok: true, snapshot, result, state };
    } catch (error) {
      this.session.rejectSave(snapshot.saveId);
      return { ok: false, snapshot, error, state: this.getState() };
    }
  }
}
