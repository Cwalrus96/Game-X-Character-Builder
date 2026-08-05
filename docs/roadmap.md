# Implementation roadmap

Last updated: 2026-08-04

This is the living execution plan derived from the dated architecture audit. Step IDs are stable API-like identifiers for humans and agents: never rename or renumber an existing ID. Add a new ID if scope changes materially.

Status values: `complete`, `active`, `ready`, `blocked`, `pending`, or `deferred`.

## How to execute a named step

For a request such as “Proceed from `WPB-EXPRESSIONS`”:

1. Read `AGENTS.md`, [status.md](status.md), and this step completely.
2. Verify every prerequisite. Do not silently redo completed work.
3. Implement only the named scope through its acceptance criteria.
4. Update tests and living contracts in the same change.
5. Record evidence here and in [status.md](status.md), then identify the next step.

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

Status: `ready`

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

### `WPB-ADAPTERS` — canonical per-tab source model

Status: `pending`

Prerequisite: `WPB-EXPRESSIONS`

Deliverables:

- workbook reader separated from domain adapters;
- `Metadata`, `Schema`, and `Enums` contract adaptation;
- canonical adapters for Classes, ClassSkills, ClassFeatures, Techniques, Feats, Origins, OriginFeatures, WeaponBases, WeaponProfiles, and WeaponEnhancements;
- strict header/schema checks;
- normalized status/selectability, costs, stable keys, nested rows, rank maps, tags, and human-readable fallbacks;
- adapter fixtures independent of file writing.

Acceptance: every populated schema-v4 source row is represented or produces an explicit structural diagnostic; no row-order ownership inference or display-name identity remains.

### `WPB-REFERENCES` — cross-reference and domain validation

Status: `pending`

Prerequisite: `WPB-ADAPTERS`

Deliverables:

- duplicate/blank stable-ID checks;
- owner/parent scope validation;
- class/origin/feat/technique/weapon/enhancement/choice reference validation;
- option-group `chooseCount`, selection-mode, cost-kind, class-skill, status/readiness, and domain invariant checks;
- errors versus warnings policy;
- valid and invalid whole-workbook fixtures.

Acceptance: validation runs without writing artifacts and reports all findings deterministically in source order.

### `WPB-STAGING` — deterministic artifacts, provenance, and diff

Status: `pending`

Prerequisite: `WPB-REFERENCES`

Deliverables:

- artifact writer consumes only a validated canonical model;
- staging-only default output;
- source/exporter/schema versions, file ID/revision, timestamps, and content hashes;
- deterministic per-artifact structural and semantic diff against the frozen release;
- runtime-load acceptance test against freshly staged output;
- publish gate separate from fetch/validate/stage.

Acceptance: one authenticated command fetches, validates, stages, and reports a complete diff without touching production JSON.

### `WPB-SOURCE-RESOLUTION` — resolve remaining findings

Status: `pending`

Prerequisite: `WPB-STAGING`

Resolve every validation finding through either a tracked canonical-Sheet edit or a documented contract decision. Never patch generated JSON. Keep editorial changes separately reviewable from exporter behavior where practical.

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

Work Package C begins only after Work Package B has a validated runtime contract. Its steps may be refined, but their IDs remain stable once implementation begins.

### `WPC-CODEC`

Status: `pending`


Create pure canonical defaults and exact CharacterCodec validation. Unknown or malformed fields must not pass silently.

### `WPC-MIGRATIONS`

Status: `pending`

Create a sequential, idempotent CharacterMigrations registry with fixtures for every supported saved schema, including stable-ID migration preparation.

### `WPC-REPOSITORY`

Status: `pending`

Introduce CharacterRepository and remove direct Firebase writes from pages. Close open-ended builder path writes and define conflict/revision behavior.

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
