import {
  assertCanonicalCharacter,
  decodeCharacter,
} from "./character-codec.js";
import {
  applyCharacterCommand,
  decodeCharacterCommand,
} from "./character-commands.js";
import {
  canonicalCharacterStatesEqual,
  diffCanonicalCharacterStates,
} from "./character-state-diff.js";

export const CHARACTER_IMPACT_CATEGORIES = Object.freeze({
  ERROR: "error",
  CONFIRMATION_REQUIRED: "confirmation-required",
  INFORMATIONAL: "informational",
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const output = {};
    for (const [key, child] of Object.entries(value)) output[key] = cloneValue(child);
    return output;
  }
  return value;
}

function freezeValue(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeValue);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach(freezeValue);
    return Object.freeze(value);
  }
  return value;
}

function frozenClone(value) {
  return freezeValue(cloneValue(value));
}

function validateRevision(value, path = "revision") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CharacterSessionError(
      "invalid-session-revision",
      `${path} must be a nonnegative safe integer.`,
    );
  }
  return value;
}

export class CharacterSessionError extends Error {
  constructor(code, message, { diagnostics = [], cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CharacterSessionError";
    this.code = code;
    this.diagnostics = Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })));
  }
}

function categoryForImpact(impact) {
  if (impact?.severity === "error" || impact?.category === CHARACTER_IMPACT_CATEGORIES.ERROR) {
    return CHARACTER_IMPACT_CATEGORIES.ERROR;
  }
  if (
    impact?.confirmationRequired === true
    || impact?.category === CHARACTER_IMPACT_CATEGORIES.CONFIRMATION_REQUIRED
    || impact?.type === "remove"
  ) {
    return CHARACTER_IMPACT_CATEGORIES.CONFIRMATION_REQUIRED;
  }
  return CHARACTER_IMPACT_CATEGORIES.INFORMATIONAL;
}

function normalizeImpact(impact) {
  const source = isPlainObject(impact) ? impact : {};
  const category = categoryForImpact(source);
  const type = typeof source.type === "string" && source.type ? source.type : "change";
  const path = typeof source.path === "string"
    ? source.path
    : typeof source.storagePath === "string" ? source.storagePath : "";
  const code = typeof source.code === "string" && source.code
    ? source.code
    : `${type}-${category}`;
  const nodeId = typeof source.nodeId === "string" ? source.nodeId : "";
  const hasBefore = Object.prototype.hasOwnProperty.call(source, "before");
  const hasAfter = Object.prototype.hasOwnProperty.call(source, "after");
  return {
    category,
    type,
    code,
    path,
    nodeId,
    label: typeof source.label === "string" ? source.label : "",
    message: typeof source.message === "string"
      ? source.message
      : typeof source.reason === "string" ? source.reason : "",
    before: cloneValue(hasBefore ? source.before : source.previousValue),
    after: cloneValue(hasAfter ? source.after : source.nextValue),
  };
}

const CATEGORY_ORDER = Object.freeze({
  [CHARACTER_IMPACT_CATEGORIES.ERROR]: 0,
  [CHARACTER_IMPACT_CATEGORIES.CONFIRMATION_REQUIRED]: 1,
  [CHARACTER_IMPACT_CATEGORIES.INFORMATIONAL]: 2,
});

export function normalizeCharacterImpacts(impacts = []) {
  if (!Array.isArray(impacts)) {
    throw new CharacterSessionError("invalid-session-impacts", "Reconciliation impacts must be an array.");
  }
  const normalized = impacts.map(normalizeImpact);
  normalized.sort((left, right) => (
    CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category]
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.nodeId.localeCompare(right.nodeId)
  ));
  return Object.freeze(normalized.map((impact, index) => freezeValue({
    impactId: `impact:${index}:${impact.category}:${impact.type}:${impact.path || impact.nodeId || impact.code}`,
    ...impact,
  })));
}

function validationImpacts(diagnostics) {
  return (Array.isArray(diagnostics) ? diagnostics : []).map((item) => ({
    category: CHARACTER_IMPACT_CATEGORIES.ERROR,
    type: "invalid",
    code: item.code || "invalid-reconciled-character",
    path: item.path || "character",
    message: item.message || "Reconciled character is invalid.",
  }));
}

function proposalView(pending) {
  if (!pending) return null;
  return frozenClone({
    proposalId: pending.proposalId,
    command: pending.command,
    proposed: pending.proposed,
    reconciled: pending.reconciled,
    proposedDiff: pending.proposedDiff,
    reconciledDiff: pending.reconciledDiff,
    impacts: pending.impacts,
    ok: pending.ok,
    requiresConfirmation: pending.requiresConfirmation,
  });
}

function defaultReconcileCharacter({ proposed }) {
  return { character: proposed, impacts: [] };
}

export class CharacterSession {
  #persisted;
  #working;
  #metadata;
  #revision;
  #reconcileCharacter;
  #pending;
  #activeSave;
  #proposalSequence;
  #saveSequence;

  constructor({
    character,
    metadata = {},
    revision = metadata?.revision ?? 0,
    reconcileCharacter = defaultReconcileCharacter,
  } = {}) {
    if (typeof reconcileCharacter !== "function") {
      throw new CharacterSessionError("invalid-session-reconciler", "reconcileCharacter must be a function.");
    }
    if (!isPlainObject(metadata)) {
      throw new CharacterSessionError("invalid-session-metadata", "Character session metadata must be a plain object.");
    }
    this.#persisted = assertCanonicalCharacter(character);
    this.#working = assertCanonicalCharacter(character);
    this.#metadata = frozenClone(metadata);
    this.#revision = validateRevision(revision);
    this.#reconcileCharacter = reconcileCharacter;
    this.#pending = null;
    this.#activeSave = null;
    this.#proposalSequence = 0;
    this.#saveSequence = 0;
  }

  getState() {
    return frozenClone({
      persisted: this.#persisted,
      working: this.#working,
      proposed: this.#pending?.proposed ?? null,
      reconciled: this.#pending?.reconciled ?? null,
      metadata: { ...this.#metadata, revision: this.#revision },
      revision: this.#revision,
      dirty: !canonicalCharacterStatesEqual(this.#persisted, this.#working),
      pendingProposal: proposalView(this.#pending),
      saveInFlight: this.#activeSave ? {
        saveId: this.#activeSave.saveId,
        expectedRevision: this.#activeSave.expectedRevision,
      } : null,
    });
  }

  propose(command) {
    if (this.#pending) {
      throw new CharacterSessionError(
        "proposal-already-pending",
        "Accept or cancel the current character proposal before creating another.",
      );
    }

    const decodedCommand = decodeCharacterCommand(command);
    const proposed = applyCharacterCommand(this.#working, decodedCommand);
    let rawResult;
    try {
      rawResult = this.#reconcileCharacter(frozenClone({
        persisted: this.#persisted,
        working: this.#working,
        proposed,
        command: decodedCommand,
      }));
    } catch (cause) {
      throw new CharacterSessionError(
        "character-reconciliation-failed",
        "Character reconciliation failed before a proposal could be created.",
        { cause },
      );
    }
    if (!isPlainObject(rawResult) || rawResult instanceof Promise) {
      throw new CharacterSessionError(
        "invalid-reconciliation-result",
        "Character reconciliation must synchronously return a plain result object.",
      );
    }

    const decodedReconciled = decodeCharacter(rawResult.character ?? rawResult.reconciled);
    if (rawResult.impacts !== undefined && !Array.isArray(rawResult.impacts)) {
      throw new CharacterSessionError(
        "invalid-session-impacts",
        "Character reconciliation impacts must be an array when provided.",
      );
    }
    const rawImpacts = rawResult.impacts || [];
    const impacts = normalizeCharacterImpacts([
      ...rawImpacts,
      ...validationImpacts(decodedReconciled.diagnostics),
    ]);
    const reconciled = decodedReconciled.ok ? decodedReconciled.value : null;
    const hasErrors = impacts.some((impact) => impact.category === CHARACTER_IMPACT_CATEGORIES.ERROR);
    const requiresConfirmation = impacts.some((impact) => (
      impact.category === CHARACTER_IMPACT_CATEGORIES.CONFIRMATION_REQUIRED
    ));

    this.#pending = {
      proposalId: `proposal:${++this.#proposalSequence}`,
      command: decodedCommand,
      proposed,
      reconciled,
      proposedDiff: diffCanonicalCharacterStates(this.#working, proposed),
      reconciledDiff: reconciled ? diffCanonicalCharacterStates(this.#working, reconciled) : Object.freeze([]),
      impacts,
      ok: !!reconciled && !hasErrors,
      requiresConfirmation,
    };
    return proposalView(this.#pending);
  }

  acceptProposal(proposalId, { confirm = false } = {}) {
    this.#requirePendingProposal(proposalId);
    if (!this.#pending.ok || !this.#pending.reconciled) {
      throw new CharacterSessionError(
        "proposal-has-errors",
        "A character proposal with blocking errors cannot be accepted.",
      );
    }
    if (this.#pending.requiresConfirmation && confirm !== true) {
      throw new CharacterSessionError(
        "proposal-confirmation-required",
        "This character proposal contains impacts that require explicit confirmation.",
      );
    }
    const accepted = assertCanonicalCharacter(this.#pending.reconciled);
    const acceptedProposalId = this.#pending.proposalId;
    this.#working = accepted;
    this.#pending = null;
    return frozenClone({
      accepted: true,
      proposalId: acceptedProposalId,
      state: this.getState(),
    });
  }

  cancelProposal(proposalId) {
    this.#requirePendingProposal(proposalId);
    const cancelledProposalId = this.#pending.proposalId;
    this.#pending = null;
    return frozenClone({
      cancelled: true,
      proposalId: cancelledProposalId,
      state: this.getState(),
    });
  }

  createSaveSnapshot() {
    if (this.#pending) {
      throw new CharacterSessionError(
        "proposal-decision-required",
        "Accept or cancel the pending proposal before starting a save.",
      );
    }
    if (this.#activeSave) {
      throw new CharacterSessionError("save-already-active", "A character save is already in flight.");
    }
    this.#activeSave = {
      saveId: `save:${++this.#saveSequence}`,
      character: assertCanonicalCharacter(this.#working),
      expectedRevision: this.#revision,
    };
    return frozenClone(this.#activeSave);
  }

  acknowledgeSave(saveId, { revision, metadata = {} } = {}) {
    this.#requireActiveSave(saveId);
    const nextRevision = validateRevision(revision, "saved revision");
    if (!isPlainObject(metadata)) {
      throw new CharacterSessionError("invalid-session-metadata", "Saved character metadata must be a plain object.");
    }
    if (nextRevision !== this.#activeSave.expectedRevision + 1) {
      throw new CharacterSessionError(
        "unexpected-saved-revision",
        `Successful save revision must be ${this.#activeSave.expectedRevision + 1}.`,
      );
    }
    const savedCharacter = assertCanonicalCharacter(this.#activeSave.character);
    const workingMatchesSaved = canonicalCharacterStatesEqual(this.#working, savedCharacter);
    this.#persisted = savedCharacter;
    if (workingMatchesSaved) this.#working = assertCanonicalCharacter(savedCharacter);
    this.#revision = nextRevision;
    this.#metadata = frozenClone({
      ...this.#metadata,
      ...metadata,
      revision: nextRevision,
    });
    this.#activeSave = null;
    return this.getState();
  }

  rejectSave(saveId) {
    this.#requireActiveSave(saveId);
    this.#activeSave = null;
    return this.getState();
  }

  #requirePendingProposal(proposalId) {
    if (!this.#pending) {
      throw new CharacterSessionError("no-pending-proposal", "No character proposal is awaiting a decision.");
    }
    if (proposalId !== this.#pending.proposalId) {
      throw new CharacterSessionError(
        "proposal-identity-mismatch",
        "Proposal identity does not match the currently reviewed character proposal.",
      );
    }
  }

  #requireActiveSave(saveId) {
    if (!this.#activeSave) {
      throw new CharacterSessionError("no-active-save", "No character save is currently in flight.");
    }
    if (saveId !== this.#activeSave.saveId) {
      throw new CharacterSessionError(
        "save-identity-mismatch",
        "Save identity does not match the active character save.",
      );
    }
  }
}
