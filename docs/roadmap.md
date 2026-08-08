# Implementation roadmap

Last updated: 2026-08-08

This is the living execution plan derived from the dated architecture audit. Step IDs are stable API-like identifiers for humans and agents: never rename or renumber an existing ID. Add a new ID if scope changes materially.

Status values: `complete`, `active`, `ready`, `blocked`, `pending`, or `deferred`.

## How to execute a named step

For a request such as “Proceed from `WPB-EXPRESSIONS`”:

1. Read `AGENTS.md`, [status.md](status.md), and this step completely.
2. Verify every prerequisite. Do not silently redo completed work.
3. Before implementation, explain in plain language what the preceding step established, what this step produces, why it is useful, and any blocker or approval boundary.
4. Implement only the named scope through its acceptance criteria.
5. Update tests and living contracts in the same change.
6. Record evidence here and in [status.md](status.md), identify the next step, and explain that next step's purpose and benefit without waiting to be asked.

Standard preflight for every implementation step:

```powershell
git status --short
npm test
```

For every Work Package B step, also run `npm run baseline:data` before editing. A step may add stricter preflight requirements in its own section. Live Drive access is required only where the step explicitly names `WPB-SOURCE-ACCESS` as a prerequisite.

## Work Package A — save and preview safety

### `WPA-SAFETY` — automated implementation

Status: `complete`

Delivered preview/confirmation safety, graph-owned class reconciliation, sheet write isolation, serialized/visible saves, dialog lifecycle, dirty navigation, source-owned weapon integrity, HTML safety, credential policy, and route/static-asset repairs.

Evidence: [work-package-a-completion.md](work-package-a-completion.md) and [milestone-0-completion.md](milestone-0-completion.md).

### `WPA-BROWSER` — real-browser acceptance

Status: `deferred`

Blocks: deployment

Run every scenario in [work-package-a-completion.md](work-package-a-completion.md), including the source-owned weapon addition in [milestone-0-completion.md](milestone-0-completion.md). Record browser, viewport, emulator state, results, and any defects. This may proceed independently of Work Package B but must pass before deployment.

## Work Package B — game-data contract and exporter repair

Work Package B repairs the source-to-runtime contract. It does not expand the character graph.

### `WPB-BASELINE` — freeze the reviewed release

Status: `complete`

Deliverables:

- exact hash/count baseline for checked-in production artifacts;
- hard refusal to write at or below `public/data/game-x`;
- staging paths remain usable.

Acceptance:

- `npm run baseline:data` passes;
- production-target policy tests pass.

Evidence: commit `637c06f`, `contracts/game-data-release-baseline.json`, and `scripts/game-data-export-policy.mjs`.

### `WPB-SOURCE-SYNC` — synchronize schema v4 and automate acquisition

Status: `complete`

Prerequisite: `WPB-BASELINE`.

Goal: remove chat history and manual XLSX download as hidden dependencies.

Deliverables:

- root `AGENTS.md`, living status, and stable roadmap;
- living architecture and data contracts aligned with canonical workbook schema v4;
- checked-in source locator/configuration, but no credentials or workbook bytes;
- authenticated read-only Drive acquisition into an ignored staging directory;
- provenance sidecar containing file ID, source modification/version metadata, export time, byte length, and SHA-256;
- one command that fetches the source and invokes only a staging export;
- unit tests for source configuration, credential-path enforcement, URL construction, metadata validation, provenance, and staging boundaries;
- README/Contributing commands no longer require manual browser export.

Non-goals:

- accepting every schema-v4 construct in runtime code;
- publishing new production JSON;
- changing the canonical or display Sheet;
- running the Handbook import script.

Acceptance:

- `npm test` passes;
- `npm run baseline:data` still passes;
- `npm run fetch:data -- --help` succeeds without credentials;
- a missing/insufficient credential fails clearly without writing a fake workbook;
- fixture-backed acquisition opens the XLSX, verifies all required tabs and workbook-declared schema/syntax versions, and produces a paired snapshot/provenance result;
- `npm run stage:data` cannot target production and preserves the production freeze.

Evidence:

- `AGENTS.md`, [status.md](status.md), and this roadmap provide the durable handoff path;
- `contracts/game-data-source.json` fixes the non-secret canonical source identity;
- `scripts/game-data/config.mjs`, `scripts/game-data/google-drive-source.mjs`, and the fetch/stage CLIs implement the boundary;
- source-acquisition unit tests cover config, URLs, metadata, revisions, XLSX/hash provenance, transient failures, credential paths, impersonation scopes, atomic paired writes, and CLI arguments;
- connected Drive metadata/export independently confirmed the canonical file and XLSX availability;
- the repository live access check failed safely and wrote nothing because this workstation's current user ADC lacks Drive scope. Complete `WPB-SOURCE-ACCESS` before relying on live local acquisition.

### `WPB-SOURCE-ACCESS` — configure the read-only local identity

Status: `complete`

Prerequisite: `WPB-SOURCE-SYNC`

Blocks: live-source acceptance for `WPB-ADAPTERS` and later staging; does not block pure `WPB-EXPRESSIONS` work.

Preferred completion is a dedicated Viewer-only source service account plus user-ADC impersonation. Fallbacks and commands are documented in [data-pipeline.md](data-pipeline.md). This step requires choosing/creating the Google Cloud identity, enabling APIs, granting narrowly scoped impersonation, and sharing the Sheet; do not infer authorization for those external changes.

Acceptance:

- `npm run data:source:check` succeeds;
- `npm run fetch:data` writes a valid ignored XLSX and provenance sidecar for the current Drive version;
- no key/credential file exists anywhere under the repository;
- the acquired SHA-256/metadata agree with a second read of the same Drive revision.

Completion evidence as of 2026-08-08:

- the dedicated `game-x-sheet-exporter@game-x-character-builder.iam.gserviceaccount.com` identity has Viewer-only access to the canonical Sheet and the local user ADC may impersonate it through a service-account-scoped Token Creator binding;
- Google Drive and IAM Service Account Credentials APIs are enabled, no persistent service-account key was created, and the repository credential-path boundary remains intact;
- `npm run data:source:check` succeeded twice against Drive version `642`, modified `2026-08-08T19:36:29.890Z`;
- `npm run fetch:data` wrote the ignored schema-v4 XLSX and matching provenance sidecar, with the fetch boundary verifying the local SHA-256 and unchanged Drive metadata before and after export.

### `WPB-EXPRESSIONS` — shared typed expressions

Status: `complete`

Prerequisite: `WPB-SOURCE-SYNC`

Step-specific preflight: `npm run fetch:data -- --help`. Do not require live Drive credentials or modify source spreadsheets; this step works from contract fixtures.

Goal: one pure contract for grants and prerequisites shared by exporter validation and runtime loading.

Deliverables:

- typed registries defining each grant/prerequisite type, required/optional fields, scalar types, aliases, and normalization;
- pure parser returning values and structured diagnostics without file I/O or `process.exit`;
- pure formatter/serializer if round-trip syntax remains part of the contract;
- fixtures for every schema-v4 enum entry and malformed expression class;
- explicit end-to-end status for runtime-stubbed `familiar`, `vehicle`, and `gadget` constructs;
- implemented `resource` semantics and symbolic capacity-expression representation;
- support for feat filters/max level, weapon tag filters, technique stable keys/skill filters, choice references, AND lines, and within-field OR values.

Non-goals:

- adapting complete workbook rows;
- graph factories for every future subsystem;
- artifact publishing.

Acceptance:

- exporter and runtime import the same registry;
- no expression parser calls `process.exit`;
- all valid/invalid fixtures pass;
- unknown types and fields fail with row/cell context;
- parsing is deterministic and never silently drops meaning.

Evidence:

- `public/js/core/game-data-contract.js` defines type-specific grant and prerequisite registries, schema-v4 enum sets, aliases, scalar contracts, defaults, and runtime status;
- `public/js/core/game-data-expressions.js` implements pure contextual parsing, object normalization, deterministic serialization, AND/OR preservation, and symbolic capacity expressions without file I/O or process exit;
- exporter expression handling and runtime grant/prerequisite loading use the same module and registries;
- `tests/fixtures/game-data-expressions.json` covers every schema-v4 enum entry and malformed expression classes;
- focused tests cover resource initialization/clamping/prerequisites, weapon predicates, stable-key/filter aliases, runtime compatibility forms, and explicit `familiar`/`vehicle`/`gadget` stubs.

### `WPB-ADAPTERS` — canonical per-tab source model

Status: `complete`

Prerequisite: `WPB-EXPRESSIONS`

Deliverables:

- workbook reader separated from domain adapters;
- `Metadata`, `Schema`, and `Enums` contract adaptation;
- canonical adapters for Classes, ClassSkills, ClassFeatures, Techniques, Feats, Origins, OriginFeatures, WeaponBases, WeaponProfiles, and WeaponEnhancements;
- strict header/schema checks;
- normalized status/selectability, costs, stable keys, nested rows, rank maps, tags, and human-readable fallbacks;
- adapter fixtures independent of file writing.

Acceptance: every populated schema-v4 source row is represented or produces an explicit structural diagnostic; no row-order ownership inference or display-name identity remains.

Implementation evidence:

- `scripts/game-data/workbook-reader.mjs` converts in-memory XLSX bytes to domain-neutral headers, raw values, and physical source rows without file I/O;
- `scripts/game-data/source-adapters.mjs` strictly adapts all contract and runtime-source tabs to a canonical flat model with source-located diagnostics;
- `tests/fixtures/game-data-schema-v4.mjs` defines an independent 152-field schema-v4 fixture across every required adapter tab;
- `tests/game-data-adapters.test.mjs` covers XLSX-to-model flow, all tab collections, scalar/expression normalization, explicit owner/parent preservation, strict headers/schema, malformed populated rows, and purity;
- authenticated staging of canonical Drive version `642` adapted every populated schema-v4 source row without structural errors; the live model hash is `1e21863128950325204830abd7e4d3d4f821c56c2df9829b7bd2cd6d172a4da3`.

### `WPB-REFERENCES` — cross-reference and domain validation

Status: `complete`

Prerequisite: `WPB-ADAPTERS`

Deliverables:

- duplicate/blank stable-ID checks;
- owner/parent scope validation;
- class/origin/feat/technique/weapon/enhancement/choice reference validation;
- option-group `chooseCount`, selection-mode, cost-kind, class-skill, status/readiness, and domain invariant checks;
- errors versus warnings policy;
- valid and invalid whole-workbook fixtures.

Acceptance: validation runs without writing artifacts and reports all findings deterministically in source order.

Implementation evidence:

- `scripts/game-data/model-validator.mjs` is a pure validation boundary that merges adapter and whole-model diagnostics, classifies errors versus warnings, and sorts findings by canonical source order;
- identity indexes cover global, owner-scoped, class-skill composite, and weapon-profile composite identities;
- reference checks cover owners, parents, classes, origins, feats, techniques, weapon bases, enhancements, and source-owned choices without display-name or row-order inference;
- domain checks cover option-group counts, status/selectability, selection modes, class-skill conditions, stable tags, technique/weapon costs, readiness, and explicit runtime stubs;
- `tests/fixtures/game-data-references.mjs` supplies an invalid whole-workbook fixture alongside the valid schema-v4 fixture;
- `tests/game-data-references.test.mjs` proves a clean whole model, exactly 37 deterministic invalid-fixture errors plus one warning, row-order-independent and recursively nested parent resolution, readiness rules, warning non-blocking behavior, and absence of artifact-writing APIs;
- two authenticated staging runs of canonical Drive version `642` produced the same normalized model and the same ordered set of 28 intentional warnings with zero errors. Runtime-load acceptance also passed without diagnostics.

### `WPB-STAGING` — deterministic artifacts, provenance, and diff

Status: `complete`

Prerequisite: `WPB-REFERENCES`

Deliverables:

- artifact writer consumes only a validated canonical model;
- staging-only default output;
- source/exporter/schema versions, file ID/revision, timestamps, and content hashes;
- deterministic per-artifact structural and semantic diff against the frozen release;
- runtime-load acceptance test against freshly staged output;
- publish gate separate from fetch/validate/stage.

Acceptance: one authenticated command fetches, validates, stages, and reports a complete diff without touching production JSON.

Implementation evidence:

- `scripts/game-data/artifact-builder.mjs` accepts only a successfully validated canonical model and deterministically constructs runtime artifact schema v2 entirely in memory;
- the v2 artifact set adds normalized `class-skills.json`, preserves stable keys/selectability/structured expressions and costs, and keeps volatile export timestamps out of runtime bytes;
- `scripts/game-data/runtime-artifact-acceptance.mjs` parses freshly serialized bytes through current runtime getters, technique indexes, and grant loading and checks every split artifact against the combined artifact;
- `scripts/game-data/artifact-diff.mjs` reports byte hashes, complete structural field paths, and stable-identity semantic changes; it explicitly bridges the frozen release's name-only techniques and identifies weapon profiles by `weaponKey/profileType/profileName/rank` until `profileKey` exists;
- `scripts/game-data/staging-run.mjs` runs reader -> adapter -> whole-model validation -> construction -> runtime acceptance -> frozen-release diff, installs a unique run atomically, and writes diagnostics only when validation/runtime acceptance fails;
- `scripts/stage-game-data.mjs` now fetches once and invokes that canonical staging boundary; it never invokes the legacy exporter or writes beneath `public/data/game-x`;
- `tests/game-data-staging.test.mjs` covers complete output, production immutability, immutable runs, deterministic bytes, validation-error diagnostic-only output, construction gating, runtime acceptance, and structural/semantic diffing;
- runtime revision identity now uses the stable Drive revision plus normalized-model SHA-256; raw XLSX transport hashes remain in source provenance and run reports and cannot perturb runtime bytes;
- regression coverage varies raw XLSX/fetch provenance while holding the normalized source revision constant and requires all nine artifact hashes to remain identical;
- authenticated end-to-end runs `20260808T194536442Z-37004` and `20260808T194543102Z-38020` fetched byte-distinct XLSX transports for unchanged Drive version `642`, then produced the same model hash and byte-identical nine-artifact set, passed zero-error validation and runtime loading, reported the complete frozen-release diff, and left production untouched.

### `WPB-SOURCE-RESOLUTION` — resolve remaining findings

Status: `complete`

Prerequisite: `WPB-STAGING`

Resolve every validation finding through either a tracked canonical-Sheet edit or a documented contract decision. Never patch generated JSON. Keep editorial changes separately reviewable from exporter behavior where practical.

Read-only evidence, the approved source batch, and post-write verification are recorded in [game-data-source-resolution.md](game-data-source-resolution.md). Repository-side false positives were corrected without source writes. The 2026-08-05 canonical-Sheet batch was applied only after the user approved its exact cells, values, and validation changes; any later source change requires a new exact approval scope.

Evidence as of 2026-08-08:

- descriptions are optional in all relevant adapters, and stable choice identity may be derived from an unambiguous owning source unless a later `choiceRef` requires an explicit ID;
- generic `rank` and reversible layered `choice-rebind` expressions are typed, round-tripped, and retained with explicit runtime-stub warnings; the base-answer/overlay/reversion contract is recorded for the later builder vertical slice;
- `draft` records remain exported but are rejected by normal and grant-owned technique selection, direct grants to draft Techniques fail validation, and previously stored draft picks enter normal dependency reconciliation;
- the exact canonical-Sheet cells, full replacement values, enum additions, and dropdown-validation changes were applied in one approved batch and verified through post-write cell/validation reads;
- authenticated Drive version `642` validates with zero errors and 28 explicitly classified warnings, the normalized model is deterministic, runtime-load acceptance passes, and production JSON remains untouched;
- `npm run test:all` passes 170 unit tests, 16 Firebase emulator tests, and all 14 HTML files; `npm run baseline:data` verifies all 9 frozen production artifacts.

Acceptance: the canonical source validates with zero structural errors; intentional incompleteness is representable and explicitly classified.

### `WPB-DIFF-REVIEW` — review the complete release candidate

Status: `ready` — manual review underway; exact-hash approval required

Prerequisite: `WPB-SOURCE-RESOLUTION`

Review every added, removed, and changed runtime record, including removal of stale artifacts. Confirm incomplete classes/origins export but remain unselectable. Record approval and the exact source/export hashes.

Candidate identity, hashes, validation evidence, selectability checks, and the approved weapon-base and Heavy/draft enhancement corrections are frozen in [game-data-release-candidate-2026-08-08.md](game-data-release-candidate-2026-08-08.md). Exact-hash approval is a manual boundary; no production publish is implied.

### `WPB-PUBLISH` — unlock reviewed production export

Status: `pending`

Prerequisite: `WPB-DIFF-REVIEW`

Remove or change the production freeze only in an explicit reviewed change. Publish the approved staged bytes, update the release baseline/provenance, run the full test suite and browser data-loading smoke test, and document rollback.

## Work Package C — character schema and session skeleton

Work Package C begins after Work Package B has a fixture-validated runtime contract. Its pure character-schema work may proceed in parallel with Work Package B's externally blocked live-source acquisition and publishing acceptance. It must not assume that unpublished schema-v4 game data is already available in production. Step IDs remain stable.

### `WPC-CODEC`

Status: `complete`

Prerequisite: the fixture-validated schema-v4 game-data runtime contract from Work Package B.

Goal: define one complete saved-character shape so malformed, partial, or ambiguously identified state cannot be mistaken for valid canonical state.

Deliverables:

- schema version 5 canonical defaults with independently allocated nested state;
- a pure exact `CharacterCodec` with structured path-specific diagnostics;
- stable identity/key requirements for persisted game-data selections and source-owned records;
- an exact allowlist for character-sheet fields and repeatables;
- explicit separation of canonical state from Firestore timestamp metadata;
- a living character-data contract and valid/invalid fixtures.

Non-goals:

- migrating existing schema 1–4 documents;
- switching the live reader/writer to schema version 5;
- introducing the definitive database reader/writer APIs or changing Firebase writes;
- defining the later `choice-rebind` overlay persistence shape.

Acceptance:

- complete defaults pass the codec and do not share nested references;
- encoding and decoding are pure, clone successful values, and never silently coerce input;
- unknown, missing, malformed, duplicate, and cross-field-invalid values produce exact diagnostics;
- schema 1–4 values are rejected with an explicit migrate-first diagnostic;
- timestamp metadata is rejected as canonical state;
- unit tests cover defaults, a populated round trip, exact keys, stable references, identity ownership, malformed nested values, and assertion errors;
- the transitional reader/writer remains on schema version 4 until `WPC-MIGRATIONS` exists.

Evidence:

- `public/js/core/character-codec.js` implements schema version 5 defaults, validation, encode/decode, cloning, and typed assertion errors without Firebase, DOM, file, or network access;
- [character-data-contract.md](character-data-contract.md) records the approved canonical/metadata split, exact nested shapes, stable-reference rules, sheet allowlist, and integration boundary;
- `tests/character-codec.test.mjs` supplies valid and invalid contract fixtures.

### `WPC-MIGRATIONS`

Status: `complete`

Prerequisite: `WPC-CODEC`

Goal: convert every supported historical character shape to the exact v5 contract without making a page, repository, or migration caller guess which repairs occurred.

The problem is that the observed unversioned, v1, v3, and v4 formats are partial and use a mixture of display names, composite labels, optional identity fields, and page-specific defaults. Passing those documents directly to the strict v5 codec would reject existing characters; silently filling them at read time would recreate the ambiguity WPC-CODEC removed. Repository history contains no schema-v2 writer, so claimed v2 documents are rejected instead of assigned an invented meaning.

Deliverables:

- an evidence-backed inventory and fixture for every supported stored schema version;
- a pure evidence-backed registry with explicit `unversioned -> 1 -> 3 -> 4 -> 5` transformations;
- deterministic defaulting and identity assignment rules recorded per migration edge;
- stable-key migration preparation that reports unresolved or ambiguous display-name mappings instead of guessing;
- structured migration reports that distinguish preserved, defaulted, renamed, and unresolved state;
- explicit separation of repository timestamp metadata from the migrated canonical character value.

Non-goals:

- reading or writing Firebase documents;
- publishing game data or bypassing the Work Package B production freeze;
- switching pages to the new repository boundary;
- inventing mappings that cannot be proved from executable history, fixtures, or reviewed game data.

Acceptance:

- each supported historical fixture reaches a value accepted by the v5 codec by applying only declared evidence-backed edges;
- the registry is deterministic, does not mutate its input, and is idempotent when presented with its already-upgraded output;
- already-current v5 input remains byte-equivalent in value;
- unsupported, missing, malformed, unresolved, and ambiguous inputs fail with structured path-specific diagnostics;
- stable identities are reproducible and collisions are rejected;
- tests prove that metadata is preserved separately and no production Firebase or game-data artifact is changed.

Evidence:

- `public/js/core/character-migrations.js` is the isolated pure compatibility registry and stable-reference-index builder;
- `tests/fixtures/character-schemas.mjs` records recognized unversioned, v1, v3, v4, and v5 shapes;
- `tests/character-migrations.test.mjs` covers every declared edge, v2/future rejection, codec acceptance, non-mutation, idempotence, metadata separation, deterministic identities/reports, collisions, unresolved/ambiguous mappings, unknown fields, and purity;
- [character-migrations.md](character-migrations.md) records the evidence-backed history, conversion policy, unresolved cases, and repository integration boundary.

### `WPC-REPOSITORY`

Status: `active`

Prerequisite: `WPC-MIGRATIONS`

Implementation may proceed against fixtures. Switching the deployed persistence path also requires a reviewed runtime game-data release that supplies stable `techniqueKey` values (or another explicitly approved stable-key source); the frozen schema-v1 production artifacts contain technique display names only.

Goal: make one reader/writer boundary responsible for loading and saving characters so every application consumer receives exact v5 state and no page needs to understand Firestore layout, historical schemas, timestamps, or revision conflicts.

The problem is that pages currently mix direct Firebase calls with transitional reader/writer helpers. Those paths can stamp partial v4 state, accept open-ended patch paths, and let a stale tab overwrite newer data. Connecting the v5 codec or migrator independently in each page would spread persistence and compatibility policy throughout the application.

Deliverables:

- the existing database reader/writer strengthened as the sole normal character persistence boundary, without adding a duplicate repository implementation;
- a read pipeline of raw Firestore envelope -> `CharacterMigrations` -> `CharacterCodec` -> canonical character plus separate metadata, migration report, and revision state;
- create/replace/patch operations that validate canonical state and stamp schema version 5 before writing;
- narrow typed write operations, including preservation of the character-sheet temporary-leaf ownership allowlist;
- tested revision/conflict behavior that rejects stale writes without losing the newer persisted value;
- page integration that removes normal direct character writes through the transitional reader/writer helpers;
- the approved migration write-back policy: loading/migration is read-only, and a migrated v5 document is persisted only as part of a successful explicit user save;

Non-goals:

- introducing `CharacterSession` working/proposed/reconciled state;
- changing graph or reconciliation policy;
- publishing Work Package B game data;
- writing production character documents during tests or migration inspection;
- placing historical-format branches outside `CharacterMigrations`.

Acceptance:

- recognized legacy fixtures load only through migrations and emerge as exact v5; invalid or unresolved documents fail with structured diagnostics;
- every successful create or save writes a codec-accepted value marked schema version 5 and keeps repository timestamps outside canonical state;
- stale revisions fail deterministically, while accepted writes preserve unrelated newer data according to the documented operation contract;
- arbitrary/open-ended page patch paths are rejected and character-sheet writes remain limited to sheet-owned temporary leaves;
- unit and emulator tests cover create, read, migrated read without a write, explicit-save migration persistence, valid save, invalid save, authorization propagation, missing documents, conflicts, and timestamp handling;
- no Firebase production document, production game-data artifact, or canonical Sheet cell changes during verification.

### `WPC-SESSION`

Status: `complete`

Prerequisite: the exact v5 codec, migrations, and definitive reader/writer APIs from the implemented portion of `WPC-REPOSITORY`. The blocked deployed-page cutover is not a prerequisite for this pure fixture-driven session core.

Goal: give one in-memory component ownership of character editing state so pages can submit explicit intent, preview one deterministic reconciliation result, and accept or cancel that exact result without mutating persisted state.

The problem is that current pages and `BuilderPage` still coordinate mutable builder objects and arbitrary patches. Even where preview safety exists, there is no complete-character owner that distinguishes loaded state, accepted unsaved state, the current proposal, and its reconciled result. Extending that pattern would make later graph integration and stale-save handling page-dependent.

Deliverables:

- a pure `CharacterSession` with independently protected persisted, working, proposed, and reconciled canonical v5 states;
- strict typed `SetClass` and `SetTechniqueSelection` commands that express only direct user intent and reject unknown or malformed commands;
- a deterministic canonical state diff with exact paths and cloned before/after values;
- a structured impact contract that distinguishes blocking errors, confirmation-required impacts, and informational impacts without making UI strings authoritative;
- an injected reconciliation boundary so the session lifecycle is complete before `WPD-GRAPH-CORE` supplies the final compiler/reconciler;
- proposal acceptance/cancellation behavior that never reruns reconciliation or changes working state behind the reviewed preview;
- save-snapshot bookkeeping that can acknowledge a successful persistence revision without discarding edits accepted while the save was in flight.

Non-goals:

- implementing `GraphCompiler` or `GraphReconciler` policy;
- connecting deployed pages or removing transitional v4 persistence helpers;
- defining `choice-rebind` overlays or migrating additional domains;
- publishing game data or writing production Firebase documents.

Acceptance:

- construction and every exposed state accept only exact codec-valid v5 and do not share mutable references with callers;
- commands alter only their declared direct fields, preserve selection order, and fail explicitly on invalid type, keys, duplicates, or unknown command types;
- proposing records proposed and reconciled states, invokes the supplied reconciler exactly once, and produces deterministic diff and structured impacts;
- blocking impacts can never be accepted, confirmation-required impacts require explicit confirmation, cancellation is byte-for-byte side-effect free, and acceptance commits the exact reviewed reconciled state;
- a proposal awaiting a decision cannot be silently superseded;
- save acknowledgement advances persisted state/revision to the exact save snapshot while preserving newer accepted working edits as dirty;
- unit tests cover valid/invalid commands, state isolation, deterministic diff/impacts, proposal conflicts, error/confirmation/information policy, cancel, exact accept, and save-in-flight behavior;
- the session/diff/command modules have no Firebase, DOM, file, network, page, or widget dependency.

Evidence:

- `public/js/core/character-session.js` owns the protected four-state proposal and save lifecycle;
- `public/js/core/character-commands.js` defines the initial strict direct-intent command registry;
- `public/js/core/character-state-diff.js` defines deterministic canonical diffs;
- `tests/character-session.test.mjs`, `tests/character-commands.test.mjs`, and `tests/character-state-diff.test.mjs` cover the acceptance cases;
- [character-session.md](character-session.md) records the living session/command/impact/save contract.

## Later work packages

### `WPD-GRAPH-CORE`

Status: `complete`

Prerequisite: `WPC-SESSION`. Fixture-driven graph-core work does not require deployed-page integration or a production game-data publish.

Goal: make one deterministic graph, rather than pages or widgets, authoritative for what character selections exist, what owns them, which requirements they satisfy, and what must change when a source changes.

The problem is that the session now safely separates proposed and accepted state, but its injected reconciler does not yet understand dependencies. The transitional dependency layer can preview parts of class/feat/technique behavior, but it relies on current builder shapes and does not expose a complete typed graph or a general fixed-point contract. Connecting pages directly to that transitional policy would preserve duplicated domain rules and incomplete transitive removal behavior.

Deliverables:

- pure typed node and edge contracts with stable identities, source ownership, storage bindings, and structured diagnostics;
- registries for node, grant, and prerequisite handlers so new domains do not require edits to graph traversal;
- a deterministic `GraphCompiler` that builds a graph from one exact v5 character plus normalized fixture game data;
- a deterministic `GraphReconciler` that applies registered removal, prerequisite, capacity, and incomplete-selection rules to a fixed point;
- structured reconciliation output compatible with `CharacterSession`: exact reconciled character plus error, confirmation-required, and informational impacts;
- deterministic and property-oriented tests covering ordering, idempotence, convergence, affected closure, cycles, missing handlers, and widget/DOM independence.

Non-goals:

- switching deployed pages or removing the transitional dependency layer;
- migrating every domain or implementing `choice-rebind` overlays before its vertical slice;
- publishing staged game data or changing the canonical Sheet;
- reading or writing Firebase.

Acceptance:

- compiling the same canonical character and normalized game data always yields byte-equivalent nodes, edges, diagnostics, and ordering;
- every selected answer represented by the initial fixture slice has stable identity, source ownership, and storage binding, with malformed or unhandled inputs failing explicitly;
- reconciliation reaches a deterministic fixed point, is idempotent on its own output, and reports rather than silently applies any removal requiring confirmation;
- blocking errors cannot be converted into confirmation impacts, while incomplete-but-valid selections remain informational according to shared Rules;
- cycles, dangling references, duplicate identities, missing registry handlers, and non-convergence fail with structured diagnostics rather than hangs or partial results;
- `CharacterSession` can consume the reconciler result through its existing injected boundary without rerunning or translating graph policy;
- graph/compiler/reconciler modules have no Firebase, DOM, file, network, page, or widget dependency;
- deterministic example tests and generated/property-oriented tests cover graph construction, transitive affected closure, convergence, cancellation input purity, and output stability.

Evidence:

- `public/js/core/graph-core.js` defines the typed/frozen graph contract, independent handler registries, duplicate/edge/cycle validation, and deterministic affected closure;
- `public/js/core/graph-compiler.js` compiles exact schema-v5 characters plus normalized schema-v2 fixture data through registered node, grant, and prerequisite handlers;
- `public/js/core/graph-reconciler.js` applies prerequisite, removal, normal-technique capacity, and incomplete-selection policy to a bounded fixed point and exposes the `CharacterSession` adapter;
- `tests/fixtures/graph-core.mjs` supplies the normalized stable-key class/technique fixture;
- `tests/graph-core.test.mjs` covers deterministic ordering, identity/ownership/storage bindings, collection-order stability, cycles, dangling references/edges, duplicate identities, missing handlers, fixed-point convergence, idempotence, non-convergence, affected closure, session exactness/cancellation, 40 generated cases, and dependency purity;
- [character-graph.md](character-graph.md) records the living graph/compiler/reconciler and Work Package E extension contract.

### `WPE-DOMAIN-MIGRATION`

Status: `ready`

Prerequisite: `WPD-GRAPH-CORE`. Deployed class/feat/technique cutover also requires reviewed runtime stable keys and coordination with the active `WPC-REPOSITORY` page-integration boundary.

Goal: replace the transitional page/widget dependency policy with typed commands and registered graph handlers one complete vertical domain at a time, proving behavior and persistence parity before removing each legacy path.

Migrate vertical domains in this order: current class/feat/technique slice; Equipment; Attributes; Origin/Skills; Bonds/Keystones/derived abilities; then Boons as the extensibility proof.

Acceptance:

- each vertical slice adds exact typed commands, node/grant/prerequisite handlers, storage bindings, reconciliation policy, and valid/invalid fixtures before the next domain begins;
- migrated pages submit intent through `CharacterSession`, render structured graph impacts, save the exact accepted reconciled state through the definitive v5 persistence boundary, and contain no duplicate capacity, prerequisite, or dependency-removal authority;
- stable runtime keys and migration evidence exist before a deployed domain stops reading its transitional compatibility fields;
- automated tests prove parity, destructive confirmation/cancellation, reload/save conflict behavior, graph convergence/idempotence, and page/widget independence for the migrated domain;
- the corresponding transitional path is removed only after focused browser acceptance exercises the replacement against the current local review environment;
- no production data publish or deployed-page cutover is inferred from fixture completion; those approval and stable-key prerequisites remain explicit per slice.

### `WPF-UI-SYSTEM`

Consolidate shared UI primitives, CSS ownership, forms/status/dialog accessibility, app-wide save/navigation behavior, and character-sheet decomposition.

### `WPG-GOVERNANCE`

Add CI gates, automated source governance, content readiness, release/deploy/rollback checklists, ADRs, accessibility/browser coverage, and workbook/display/Handbook pipeline ownership.
