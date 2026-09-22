# Character graph contract

Status: Work Package D core is complete and Work Package E migration is active. The class/feat/technique, Equipment, Attributes, and Origin/Skills slices have typed commands, graph coverage, portable session-page controllers, and local page integration; signed-in focused browser acceptance is still pending before the replacements are accepted.

Last updated: 2026-09-21.

Release-review skill correction: named grants and class utility choices supply free minimum ranks for allocation. Older extra rows repeating granted skills do not spend points twice. Canonical extra rows remain user-owned when a grant disappears; Skill Rules assess their newly owed cost and reconciliation reports any budget reduction for confirmation. Only the transitional label-based compatibility projection retains its historical grant-row pruning. The read-only sheet consumes the same effective-rank projection.

## Purpose and boundary

The Character Dependency Graph is one authoritative pure subsystem for character selection ownership and dependency effects. It accepts one exact schema-v6 character plus normalized runtime artifact schema-v2 or schema-v3 game data and produces deterministic plain-data nodes, edges, diagnostics, metadata, and reconciled outcomes.

`GraphCompiler` is the subsystem's snapshot-building operation. The reconciler is its fixed-point operation: it repeatedly compiles and applies registered removal, prerequisite, capacity, compatibility, and incomplete-selection policy until it reaches a deterministic fixed point. Keeping those internal operations separate makes snapshot construction independently testable and lets reconciliation recompile after each state change; it does not create two authorities. `CharacterSession` uses one graph reconciliation facade. Neither operation reads Firebase, the DOM, pages, widgets, files, or the network or mutates caller-owned values.

The reviewed production game-data release is schema v2 and supplies stable keys. Work Package E tests the graph against both focused fixtures and the published combined runtime artifact. Production deployment remains a separate approval boundary.

The v5 source importer produces staged schema-v3 game data without changing character persistence. Shared selection Rules handle multiple skill routes, tag/weapon-tag routes, and explicit readiness/runtime deferrals. Typed prerequisite alternatives retain their separate dependencies and use current character/option context. Source-owned repeated features and recipient-owned skills remain explicit deferred effects until their state and execution are implemented. Syntax-v3 wielded/separate-hand prerequisites require evidence that the current character schema does not yet store; weapon ownership alone cannot satisfy them. An OR prerequisite may still use another supported alternative. Deleted source identities require release review rather than guessed replacements or silent character rewrites.

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

The active registry includes root/fact, class/origin/origin-feature/resource, class feature and option group/answer, explicit feat slot and feat selection/group/option, class utility skill, fixed/custom/granted skill, grant/effect/resource/Bond, ordinary and source-owned Bonds, Bond/Background Keystones, automatic technique, source-owned grant choice/answer, normal technique selection, weapon, weapon-enhancement, prerequisite requirement, and extension-registered automatic Boon nodes.

Every selected answer in the builder has a stable ID, source owner, and storage binding. Each Attribute is a stable fact node with an exact scalar binding plus level-derived minimum and maximum metadata. Each user-owned skill is a typed node bound to its scalar field or case-insensitive named row; defense, common, class, and Origin-granted skills are automatic nodes. A `feat` grant materializes stable `feat-slot:*` nodes; each selected feat is owned by one matching slot rather than by the character root or an automatic level formula. Bond nodes bind by stable `bondId`; user Bonds are root-owned, while `grant-bond:*` records are owned and materialized by their active source. Keystones are typed child/slot nodes. Origin features are source-owned nodes whose grants and derived abilities disappear only through reviewed reconciliation. Missing handlers for an active grant or prerequisite remain blocking errors; the graph never silently discards an unknown active effect.

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

The default registry currently provides:

- node handlers for class, Origin and Origin features, feat, technique, class-utility-skill, fixed/custom/granted skills, source-owned answers, derived resources, ordinary/generated weapons, and weapon enhancements in the migrated slices;
- grant handlers for explicit filtered `feat` slots, direct `technique` grants, filtered `technique`/`technique-choice` answers, source-owned weapons, resources, and source-owned Bonds;
- prerequisite handlers for the shared typed runtime prerequisite registry, delegating evaluation to the existing pure Rules boundary.

Work Package E adds domain handlers and tests without adding dependency policy to pages or widgets. Representable grants scheduled for later slices compile as explicit deferred effects; malformed, custom, or unregistered handlers still fail closed. Familiar, vehicle, gadget, generic rank-change, and `choice-rebind` state remain later vertical-slice work.

## Compiler behavior

`compileCharacterGraph({ character, gameData, registry })` and `GraphCompiler.compile(character)`:

1. decode the character through the exact v6 codec;
2. require normalized runtime artifact schema 2 or 3;
3. index stable class, origin, feat, feature, option, technique, weapon, choice, and answer identities;
4. compile typed nodes and edges through the supplied registries;
5. sort nodes, edges, diagnostics, and metadata deterministically;
6. validate duplicates, handler coverage, edge endpoints, and cycles before reporting `ok`.

Compilation is diagnostic-producing, not repairing. Missing game-data identities, malformed stable identities, duplicate records, missing handlers, handler failures, dangling references, and cycles are errors. Deferred later-slice effects and manual-but-representable prerequisites are warnings and remain explicit.

## Reconciliation behavior

`reconcileCharacterGraph` and `GraphReconciler.reconcile` operate on a protected clone:

1. compile the current candidate;
2. stop with error impacts and the unmodified proposed character if compilation fails;
3. remove normal techniques, feats, feat options, class options, class utility skills, Origins, or primary attributes that are unavailable, orphaned, incompatible, over capacity, or no longer meet prerequisites;
4. remove orphaned/invalid source-owned answers and synchronize generated weapons, resources, and Bonds;
5. enforce attribute minimum/cap/total-point, skill grant/rank-cap/total-point, Bond Heart/rank/source policy, explicit feat-slot filters/assignment, technique, weapon-slot, enhancement-slot, weapon-rank, and enhancement compatibility through shared Rules while source-owned state remains owned by its source node or grant answer;
6. synchronize graph-derived abilities, granted-skill projections, generated weapons, and granted Bonds without overwriting user-owned state; the transitional `autoAbilityNames` display snapshot remains duplicate-free even when distinct stable sources intentionally produce same-named ability records;
7. recompile and repeat until no character field changes;
8. emit deterministic informational impacts for deferred effects, unanswered source-owned choices, unspent attribute/skill points, missing Origin/Keystone data, each unfilled explicit feat grant, and other underfilled expected selections.

Every removal is represented in the reconciled character and reported as `confirmation-required`. Blocking diagnostics are always `error`; they are never converted into confirmable warnings. Incomplete but valid state is `informational` and does not block saving.

The default maximum is 32 iterations. Exceeding the configured bound reports `graph-non-convergence`, returns the original proposed character rather than a partial intermediate value, and cannot be accepted by `CharacterSession`.

Running reconciliation again on its reconciled character is character-idempotent. Informational impacts may remain because they describe the same still-incomplete valid state.

## Traits

`trait-rules.js` projects explicit Trait providers, saved choices, fixed or associated-skill ranks, acquired tags and ready Technique access. Named grants default to Rank 1 without an associated skill; the Trait definition's minimum rank and prerequisites still apply. Prerequisite acquisition starts with no derived Traits and reaches a least fixed point; circular Traits or linked Techniques cannot authorize themselves. Classification tags never become character tags. Reference-only `traitKeys` remain visible without granting benefits. Missing choice identity and unfinished definitions remain unavailable; Familiar/Mech recipients await their own subsystems.

`trait-graph.js` materializes registered `trait` and `trait-choice` nodes from that projection. Saved answers bind to schema-v6 `traitChoices`; automatic Traits have no invented stored answers. Ownership uses stable feature keys, including schema-v3 Origin features, rather than row positions or labels. Trait/tag/Technique prerequisite evidence links back to its Trait source for affected-closure traversal. Legacy `traitActivations` values are preserved unchanged and do not create nodes or affect eligibility.

Reconciliation removes orphaned or invalid Trait answers only through confirmation-required impacts. Ownership mismatches are errors and cannot be confirmed away. Replacing a Trait or removing its source reviews dependent learned choices together; cancellation preserves the accepted state. Multiple providers retain distinct ownership, with the strongest qualifying provider determining the displayed Technique rank. Explicit granted-only Technique links consume no normal slots; tag-routed Techniques remain ordinary learned choices. Gameplay form switching, costs and timing are outside this static model.

`prerequisite-rules.js` is the independent typed evaluator. The character-aware `prerequisites.js` facade adds the shared Trait projection; all public prerequisite entry points use the same context. The split avoids recursive projection while Trait prerequisites are evaluated.

## CharacterSession integration

`createCharacterSessionGraphReconciler({ gameData, registry })` is the graph subsystem's single public integration facade for the existing synchronous session reconciliation contract:

```text
{ working, proposed, command } -> { character, impacts }
```

The session invokes that adapter exactly once for a proposal. Internal fixed-point iterations are part of that one graph operation. Acceptance commits the exact reconciled character already reviewed; cancellation leaves the working character byte-for-byte unchanged.

The adapter is installed in the local-review class/feat, Attributes, Equipment, technique, Origin, and Skills pages through `CharacterSessionPage`. Those pages coordinate exact revision-aware save snapshots with the definitive reader/writer; widgets remain portable DOM/input components. The production site has not been redeployed, and the replacements are not accepted until the signed-in focused browser scenarios pass.

## Evidence

- `public/js/core/graph-core.js`: typed graph builder, handler registry, contract validation, deterministic freezing, and affected closure;
- `public/js/core/graph-compiler.js`: exact-v6/schema-v2/v3 deterministic compiler and registered handlers;
- `public/js/core/graph-reconciler.js`: bounded fixed-point policy, structured impacts, derived projections, and session adapter;
- `public/js/core/skill-rules.js`: sole pure owner of skill progression, grants, caps, point budgets, utility capacity, allocation projections, and deterministic fitting;
- `public/js/core/origin-rules.js`: shared pure Origin eligibility/presentation projection;
- `public/js/core/selection-rules.js`: shared pure normal/granted-only/draft selection eligibility used by graph and widgets;
- `public/js/core/feat-rules.js`: sole pure owner of explicit feat-grant slots, feat filters/max levels, deterministic assignment, and the shared graph/widget selection projection;
- `public/js/core/character-skill-projection.js`: source-owned skill storage projection used by graph reconciliation;
- `public/js/builder/character-session-page.js`: DOM- and Firebase-independent page/session interaction controller;
- `public/js/builder/widgets/equipment-widget.js`: portable equipment rendering, accessibility/input handling, and typed-command production without persistence access;
- `public/js/builder/widgets/attributes-widget.js`: portable attribute rendering/input handling using shared presentation math and exact scalar commands without persistence access;
- `public/js/builder/widgets/origin-widget.js` and `skills-widget.js`: portable Origin/Skills interaction using shared Rules projections and exact typed commands without persistence access;
- `tests/fixtures/graph-core.mjs`: normalized valid/invalid class, feat, technique, weapon, resource, and utility-skill fixtures;
- `tests/graph-core.test.mjs`: published-data coverage, deterministic examples, generated cases, convergence/idempotence, transitive closure, failure policy, session exactness/cancellation, and dependency purity;
- `tests/character-session-page.test.mjs`: structured confirmation, cancellation, exact save/revision/conflict behavior, concurrent-save handling, and page/widget independence.
