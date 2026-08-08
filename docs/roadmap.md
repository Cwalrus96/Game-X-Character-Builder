# Implementation roadmap

Last updated: 2026-08-04

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

Status: `blocked` on one-time external configuration

Prerequisite: `WPB-SOURCE-SYNC`

Blocks: live-source acceptance for `WPB-ADAPTERS` and later staging; does not block pure `WPB-EXPRESSIONS` work.

Preferred completion is a dedicated Viewer-only source service account plus user-ADC impersonation. Fallbacks and commands are documented in [data-pipeline.md](data-pipeline.md). This step requires choosing/creating the Google Cloud identity, enabling APIs, granting narrowly scoped impersonation, and sharing the Sheet; do not infer authorization for those external changes.

Acceptance:

- `npm run data:source:check` succeeds;
- `npm run fetch:data` writes a valid ignored XLSX and provenance sidecar for the current Drive version;
- no key/credential file exists anywhere under the repository;
- the acquired SHA-256/metadata agree with a second read of the same Drive revision.

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

Status: `ready` — implementation is fixture-complete; live-source acceptance is blocked by `WPB-SOURCE-ACCESS`

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
- official live-row acceptance remains open because `npm run data:source:check` cannot access the Sheet with this workstation's current ADC. Connector reads confirmed the exact live headers and 152 schema declarations for implementation guidance but do not replace the repository acquisition contract.

### `WPB-REFERENCES` — cross-reference and domain validation

Status: `pending` — fixture implementation is complete; official acceptance waits on `WPB-ADAPTERS` live acceptance

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
- authenticated live-workbook validation remains blocked by `WPB-SOURCE-ACCESS`, so this step is not marked complete. The user authorized fixture-driven `WPB-STAGING` implementation to proceed without treating that work as official live acceptance.

### `WPB-STAGING` — deterministic artifacts, provenance, and diff

Status: `pending` - fixture implementation is complete; official acceptance waits on live adapter/reference acceptance and `WPB-SOURCE-ACCESS`

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
- authenticated end-to-end acceptance is still blocked by the external Drive identity tracked as `WPB-SOURCE-ACCESS`; no live run or production publish is claimed.

### `WPB-SOURCE-RESOLUTION` — resolve remaining findings

Status: `active` - approved canonical-Sheet repairs are applied; official staged validation awaits read-only ADC access

Prerequisite: `WPB-STAGING`

Resolve every validation finding through either a tracked canonical-Sheet edit or a documented contract decision. Never patch generated JSON. Keep editorial changes separately reviewable from exporter behavior where practical.

Read-only evidence, the approved source batch, and post-write verification are recorded in [game-data-source-resolution.md](game-data-source-resolution.md). Repository-side false positives were corrected without source writes. The 2026-08-05 canonical-Sheet batch was applied only after the user approved its exact cells, values, and validation changes; any later source change requires a new exact approval scope.

Evidence as of 2026-08-05:

- descriptions are optional in all relevant adapters, and stable choice identity may be derived from an unambiguous owning source unless a later `choiceRef` requires an explicit ID;
- generic `rank` and reversible layered `choice-rebind` expressions are typed, round-tripped, and retained with explicit runtime-stub warnings; the base-answer/overlay/reversion contract is recorded for the later builder vertical slice;
- `draft` records remain exported but are rejected by normal and grant-owned technique selection, direct grants to draft Techniques fail validation, and previously stored draft picks enter normal dependency reconciliation;
- the exact canonical-Sheet cells, full replacement values, enum additions, and dropdown-validation changes were applied in one approved batch and verified through post-write cell/validation reads;
- `npm test` passes 113 tests, `npm run validate:assets` passes 14 HTML files, `npm run baseline:data` verifies all 9 frozen production artifacts, and production JSON remains untouched.

Acceptance: the canonical source validates with zero structural errors; intentional incompleteness is representable and explicitly classified.

### `WPB-DIFF-REVIEW` — review the complete release candidate

Status: `pending`

Prerequisite: `WPB-SOURCE-RESOLUTION`

Review every added, removed, and changed runtime record, including removal of stale artifacts. Confirm incomplete classes/origins export but remain unselectable. Record approval and the exact source/export hashes.

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

Status: `pending`

Introduce CharacterSession with persisted, working, proposed, and reconciled states; typed `SetClass` and `SetTechniqueSelection` commands; canonical state diff; and structured impacts.

## Later work packages

### `WPD-GRAPH-CORE`

Build GraphCompiler/GraphReconciler, typed nodes/edges, fixed-point reconciliation, registries, pure Rules integration, and deterministic/property tests.

### `WPE-DOMAIN-MIGRATION`

Migrate vertical domains in this order: current class/feat/technique slice; Equipment; Attributes; Origin/Skills; Bonds/Keystones/derived abilities; then Boons as the extensibility proof.

### `WPF-UI-SYSTEM`

Consolidate shared UI primitives, CSS ownership, forms/status/dialog accessibility, app-wide save/navigation behavior, and character-sheet decomposition.

### `WPG-GOVERNANCE`

Add CI gates, automated source governance, content readiness, release/deploy/rollback checklists, ADRs, accessibility/browser coverage, and workbook/display/Handbook pipeline ownership.
