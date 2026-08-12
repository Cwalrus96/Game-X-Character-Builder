# Character session contract

Status: implemented pure Work Package C core with the Work Package D graph facade. Work Package E now uses it in every local-review builder domain page; focused signed-in browser acceptance is deferred at the user's request.

`CharacterSession` is the single in-memory owner of complete canonical character editing state. It sits between pages/portable widgets and the Character Dependency Graph subsystem. Pages may inspect its projections and submit typed commands; they may not retain a mutable character object and update it independently.

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

The command registry currently contains:

- `SetClass(classKey)`, which changes only `builder.classKey`;
- `SetLevel(level)`, which changes only `builder.level`;
- `SetPrimaryAttribute(attributeKey)`, which changes only `builder.primaryAttribute`;
- `SetAttributeValue(attributeKey, value)`, which changes only the named scalar under `builder.attributes`;
- `SetOrigin(originKey)` and `SetOriginKeystone(text)`, which change only the stable Origin selection or its canonical user text;
- `AddBond`, `RemoveBond`, and `UpdateBond`, which target one stable Bond identity, reserve source-owned identities, and allow source-owned relationship text/Keystones but not direct source-rank/removal edits;
- `SetBackgroundKeystones(texts)`, which replaces only the bounded canonical Background Keystone collection;
- `SetClassUtilitySkills(skillKeys)`, which replaces only the ordered stable-key class utility selection;
- `SetSkillRank(fieldKey, rank)`, which changes only one editable core-skill scalar;
- `SetCombatSkills(rows)` and `SetSettingSkills(rows)`, which replace only their exact named-skill collections and leave whole-record validation to `CharacterCodec`;
- `SetClassFeatureOptions(optionKeys)`, which replaces only the ordered class-option stable-key array;
- `SetFeatSelection(featKeys)` and `SetFeatOptions(optionKeys)`, which replace only their ordered stable-key arrays;
- `SetGrantChoices(grantChoices)`, whose intent envelope is narrow while the codec remains the one whole-record structural validator;
- `SetTechniqueSelection(techniqueKeys)`, which replaces only the ordered `builder.selectedTechniques` stable-key array.
- `AddWeapon`, `RemoveWeapon`, and `UpdateWeapon`, which address one exact weapon identity and permit only direct weapon fields;
- `AddWeaponEnhancement`, `RemoveWeaponEnhancement`, and `UpdateWeaponEnhancement`, which address one exact parent weapon and enhancement identity and permit only direct enhancement fields;
- `VisitBuilderStep(stepId)`, which adds one recognized visited-step identity without duplication.

Commands represent direct user intent only. They do not clear dependencies, enforce prerequisites, calculate capacity, or invent graph policy. Attribute commands accept one recognized key and an integer inside the codec's scalar range; skill commands accept exact editable fields or exact canonical row collections. The graph, not the command, owns attribute/skill/Bond caps, free or source ranks, total-point fitting, source effects, and dependent changes. Equipment updates cannot replace the whole equipment array, edit ownership fields, or silently target a different row after reconciliation. Unknown fields, unknown command types, stale equipment/Bond targets, noncanonical keys, and duplicate identities fail explicitly.

Additional domains add typed commands during their vertical migration. Arbitrary path patches are not a session command API.

## Proposal lifecycle

One proposal may await a decision at a time:

1. Apply one decoded command to a clone of working state.
2. Invoke the configured reconciler exactly once with protected persisted, working, proposed, and command values.
3. Record the proposed state, reconciled state, deterministic diffs, and structured impacts under one proposal identity.
4. Require the caller to accept or cancel that exact identity; a second proposal cannot silently replace it.
5. On acceptance, commit the already-reviewed reconciled state without rerunning reconciliation. On cancellation, leave working state unchanged.

The default injected reconciler remains an identity function so session construction never acquires implicit game-data policy. `createCharacterSessionGraphReconciler` is the explicit implemented dependency adapter; callers supply it with normalized schema-v2 game data and the selected handler registry.

Impacts use three categories:

- `error`: blocking and never confirmable;
- `confirmation-required`: potentially destructive or otherwise explicit-review changes;
- `informational`: nonblocking context such as an incomplete expected selection.

Impact codes, paths, node identities, and before/after values are authoritative machine data. UI wording is presentation only. Removal impacts require confirmation by default.

## Diff contract

`character-state-diff.js` compares two exact canonical v5 values and emits deterministic path-sorted changes. Objects are traversed by sorted key; ordered arrays are atomic values so reordering remains visible as one field replacement. Every before/after value is cloned and frozen.

## Save snapshots and revisions

`createSaveSnapshot()` captures the exact accepted working value and current expected persistence revision. A pending proposal must be decided first, and only one save may be active.

The page coordinates the separate database boundary: it requests a save snapshot, passes that exact character and expected revision to the database writer, then acknowledges the returned revision. `CharacterSession` does not import or call Firebase. On success, `acknowledgeSave()` requires the matching save identity and exactly the next revision. Persisted state advances to the snapshot that was actually written. If the user accepted another edit while that write was in flight, working state keeps that newer edit and remains dirty. A rejected save clears only the in-flight marker; it does not discard working edits.

This preserves the approved migration rule: loading an old character can produce v5 in memory without a write, while an explicit save snapshot may persist the migrated v5 value even when there are no additional edits.

## Dependency and transition boundaries

The session, commands, and diff modules are pure browser-compatible modules. They do not import Firebase, DOM, pages, widgets, files, or network APIs.

`CharacterCodec` is the sole complete-character structural validation boundary. The session uses it to protect full snapshots. Typed command decoding validates only direct intent; widget checks validate only local raw input; graph/rules checks validate dependency and game meaning; persistence checks validate storage envelopes, paths, and revisions. None of those narrower checks is a second whole-character validator.

`WPD-GRAPH-CORE` supplies the pure compiler/reconciler behind the injected reconciliation boundary; see [character-graph.md](character-graph.md). Work Package E connects pages and typed domain commands one vertical slice at a time. Stable-key runtime data is now available, but deployed pages continue using the documented transitional path until their vertical slice passes acceptance; that does not authorize a second session implementation.
