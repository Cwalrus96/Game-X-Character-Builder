# Character session contract

Status: implemented pure Work Package C core. Page integration waits for the graph/domain slices and the stable-key runtime-data prerequisite described in [status.md](status.md).

`CharacterSession` is the single in-memory owner of complete canonical character editing state. It sits between pages/widgets and reconciliation/persistence. Pages may inspect its projections and submit typed commands; they may not retain a mutable character object and update it independently.

## State ownership

The session privately owns four exact schema-v5 states:

| State | Meaning |
|---|---|
| Persisted | The last character snapshot known to have been saved successfully. |
| Working | Persisted state plus accepted edits that may not yet be saved. |
| Proposed | A clone of working state with one typed command applied. |
| Reconciled | The exact proposed state after the injected reconciler has applied graph/rules policy. |

Constructor input, reconciler output, accepted state, and save snapshots must pass the exact v5 codec. Public projections are cloned and recursively frozen so callers cannot mutate session-owned state through shared references.

## Command boundary

The first command registry contains:

- `SetClass(classKey)`, which changes only `builder.classKey`;
- `SetTechniqueSelection(techniqueKeys)`, which replaces only the ordered `builder.selectedTechniques` stable-key array.

Commands represent direct user intent only. They do not clear dependencies, enforce prerequisites, calculate capacity, or invent graph policy. Unknown fields, unknown command types, noncanonical keys, and duplicate technique identities fail explicitly.

Additional domains add typed commands during their vertical migration. Arbitrary path patches are not a session command API.

## Proposal lifecycle

One proposal may await a decision at a time:

1. Apply one decoded command to a clone of working state.
2. Invoke the configured reconciler exactly once with protected persisted, working, proposed, and command values.
3. Record the proposed state, reconciled state, deterministic diffs, and structured impacts under one proposal identity.
4. Require the caller to accept or cancel that exact identity; a second proposal cannot silently replace it.
5. On acceptance, commit the already-reviewed reconciled state without rerunning reconciliation. On cancellation, leave working state unchanged.

The default injected reconciler is an identity function so this lifecycle can be tested before `WPD-GRAPH-CORE`. It is not the final dependency policy.

Impacts use three categories:

- `error`: blocking and never confirmable;
- `confirmation-required`: potentially destructive or otherwise explicit-review changes;
- `informational`: nonblocking context such as an incomplete expected selection.

Impact codes, paths, node identities, and before/after values are authoritative machine data. UI wording is presentation only. Removal impacts require confirmation by default.

## Diff contract

`character-state-diff.js` compares two exact canonical v5 values and emits deterministic path-sorted changes. Objects are traversed by sorted key; ordered arrays are atomic values so reordering remains visible as one field replacement. Every before/after value is cloned and frozen.

## Save snapshots and revisions

`createSaveSnapshot()` captures the exact accepted working value and current expected persistence revision. A pending proposal must be decided first, and only one save may be active.

The database writer performs the actual Firebase operation. On success, `acknowledgeSave()` requires the matching save identity and exactly the next revision. Persisted state advances to the snapshot that was actually written. If the user accepted another edit while that write was in flight, working state keeps that newer edit and remains dirty. A rejected save clears only the in-flight marker; it does not discard working edits.

This preserves the approved migration rule: loading an old character can produce v5 in memory without a write, while an explicit save snapshot may persist the migrated v5 value even when there are no additional edits.

## Dependency and transition boundaries

The session, commands, and diff modules are pure browser-compatible modules. They do not import Firebase, DOM, pages, widgets, files, or network APIs.

`WPD-GRAPH-CORE` supplies the production compiler/reconciler behind the injected reconciliation boundary. Later domain migration connects pages and typed domain commands. Until stable-key runtime data and those vertical slices are ready, deployed pages continue using the documented transitional path; that does not authorize a second session implementation.
