# Character graph contract

Status: implemented pure Work Package D core. The initial fixture-driven slice covers class facts/features/options, normal and source-owned technique selections, typed technique grants, prerequisites, capacity, and incomplete selections. Deployed-page and remaining-domain integration belongs to Work Package E.

Last updated: 2026-08-08.

## Purpose and boundary

The graph is the authoritative pure representation of character selection ownership and dependency effects. It accepts one exact schema-v5 character plus normalized runtime artifact schema-v2 game data and produces deterministic plain-data nodes, edges, diagnostics, and metadata.

`GraphCompiler` never reads Firebase, the DOM, pages, widgets, files, or the network. `GraphReconciler` repeatedly compiles and applies registered removal, prerequisite, capacity, and incomplete-selection policy until it reaches a deterministic fixed point. Neither component mutates caller-owned character or game-data values.

The production game-data release is still frozen at schema v1, so the graph core is fixture-integrated only. This implementation does not authorize publishing staged data or switching deployed pages.

## Node contract

Every node has exactly these graph-contract fields:

| Field | Meaning |
|---|---|
| `id` | Stable graph identity. It cannot depend on array position or display text. |
| `type` | Registered node handler type. |
| `key` | Stable domain key when the node represents keyed state. |
| `label` | Presentation aid only; never identity. |
| `state` | `available`, `selected`, `automatic`, `incomplete`, or `invalid`. |
| `sourceOwnerId` | Stable identity of the source that owns the node or answer. |
| `storageBinding` | `null` or an exact scalar, ordered-key-array, or keyed-record character path. |
| `metadata` | Typed domain details used by reconciliation; it must remain deterministic plain data. |

The initial node registry includes root/fact, class/origin/resource, class feature and option group/answer, grant, automatic technique, source-owned grant choice/answer, normal technique selection, and prerequisite requirement nodes.

Every selected answer in the initial class/technique fixture slice has a stable ID, source owner, and storage binding. Populated selection domains not yet migratedâ€”including Feats, class utility skills, Bonds, and Weaponsâ€”fail with `unhandled-character-domain` rather than being omitted or guessed.

## Edge contract

Registered edge kinds are:

| Kind | Direction and meaning |
|---|---|
| `owns` | Source to its selected or source-owned state. |
| `offers` | Source/group to an available answer or nested group. |
| `grants` | Active source/grant to materialized grant state. |
| `requires` | Selected/source node to its prerequisite requirement. |
| `satisfies` | Fact or answer to the requirement it satisfies. |
| `materializes` | Source answer to a projected domain object. |
| `excludes` | One graph node to an incompatible node. |

Affected-closure traversal follows ownership/grant/satisfaction edges forward and follows `requires` from a requirement back to the dependent node. This makes a removed fact affect the requirement it satisfied and then every selected node that depended on that requirement.

Every edge endpoint must already resolve to a node. Dangling edges, conflicting duplicate node/edge identities, and directed cycles are blocking structured diagnostics.

## Handler registries

`GraphHandlerRegistry` has independent node, grant, and prerequisite registries. Compilation never switches over every domain in traversal code; it asks the registry for the current handler. A missing handler is a blocking diagnostic naming the handler class and exact source path.

The default Work Package D registry provides:

- node handlers for the initial class/technique slice;
- grant handlers for direct `technique` grants and filtered `technique`/`technique-choice` source-owned answers;
- prerequisite handlers for the shared typed runtime prerequisite registry, delegating evaluation to the existing pure Rules boundary.

Work Package E adds domain handlers and tests without adding page logic or editing graph traversal. Stubbed grant subsystems such as familiars, vehicles, gadgets, generic rank changes, and `choice-rebind` overlays remain explicit missing-handler boundaries until their vertical slice implements their storage and reconciliation contracts.

## Compiler behavior

`compileCharacterGraph({ character, gameData, registry })` and `GraphCompiler.compile(character)`:

1. decode the character through the exact v5 codec;
2. require normalized runtime artifact schema 2;
3. index stable class, origin, feature, option, technique, choice, and answer identities;
4. compile typed nodes and edges through the supplied registries;
5. sort nodes, edges, diagnostics, and metadata deterministically;
6. validate duplicates, handler coverage, edge endpoints, and cycles before reporting `ok`.

Compilation is diagnostic-producing, not repairing. Missing game-data identities, malformed stable identities, duplicate records, unsupported populated domains, missing handlers, handler failures, dangling references, and cycles are errors. Manual-but-representable prerequisites are warnings and remain explicit incomplete requirements.

## Reconciliation behavior

`reconcileCharacterGraph` and `GraphReconciler.reconcile` operate on a protected clone:

1. compile the current candidate;
2. stop with error impacts and the unmodified proposed character if compilation fails;
3. remove normal techniques that are unavailable, automatically granted, or no longer meet prerequisites;
4. remove orphaned/invalid source-owned technique answers and unavailable class options;
5. enforce normal technique capacity through shared Rules while source-owned and automatic techniques remain outside normal slots;
6. recompile and repeat until no character field changes;
7. emit deterministic informational impacts for unanswered source-owned choices and underfilled expected selections.

Every removal is represented in the reconciled character and reported as `confirmation-required`. Blocking diagnostics are always `error`; they are never converted into confirmable warnings. Incomplete but valid state is `informational` and does not block saving.

The default maximum is 32 iterations. Exceeding the configured bound reports `graph-non-convergence`, returns the original proposed character rather than a partial intermediate value, and cannot be accepted by `CharacterSession`.

Running reconciliation again on its reconciled character is character-idempotent. Informational impacts may remain because they describe the same still-incomplete valid state.

## CharacterSession integration

`createCharacterSessionGraphReconciler({ gameData, registry })` adapts the graph result to the existing synchronous session reconciliation contract:

```text
{ working, proposed, command } -> { character, impacts }
```

The session invokes that adapter exactly once for a proposal. Internal fixed-point iterations are part of that one graph operation. Acceptance commits the exact reconciled character already reviewed; cancellation leaves the working character byte-for-byte unchanged.

The adapter is not installed on deployed pages yet. Work Package E first migrates the current class/feat/technique vertical slice, adds the remaining typed commands/handlers, and proves parity before removing the transitional `character-dependency-graph.js` path.

## Evidence

- `public/js/core/graph-core.js`: typed graph builder, handler registry, contract validation, deterministic freezing, and affected closure;
- `public/js/core/graph-compiler.js`: exact-v5/schema-v2 deterministic compiler and initial handlers;
- `public/js/core/graph-reconciler.js`: bounded fixed-point policy, structured impacts, and session adapter;
- `tests/fixtures/graph-core.mjs`: normalized schema-v2 class/technique fixture;
- `tests/graph-core.test.mjs`: deterministic examples, generated cases, convergence/idempotence, transitive closure, cycle/dangling/duplicate/missing-handler/non-convergence failures, session exactness/cancellation, and dependency-purity checks.
