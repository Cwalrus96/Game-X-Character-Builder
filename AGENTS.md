# Game X Character Builder agent guide

This file is the required entry point for coding agents working in this repository. Its scope is the entire repository. More specific `AGENTS.md` files may be added later for subsystems; when present, the closest file to the edited code takes precedence.

## Start every task here

1. Read this file completely.
2. Read [docs/status.md](docs/status.md) for the current checkpoint, active step, blockers, and last verification result.
3. Read the named step in [docs/roadmap.md](docs/roadmap.md). Step IDs are stable and must never be renumbered.
4. Read only the living contracts relevant to that step:
   - [docs/architecture.md](docs/architecture.md) for dependency direction and ownership;
   - [docs/game-data-contract.md](docs/game-data-contract.md) and [docs/data-pipeline.md](docs/data-pipeline.md) for source/export work;
   - [docs/builder-flow.md](docs/builder-flow.md) for builder behavior;
   - [docs/character-session.md](docs/character-session.md) for canonical in-memory editing state, commands, proposals, impacts, and save snapshots;
   - [docs/character-graph.md](docs/character-graph.md) for typed graph nodes/edges, handler registries, compilation, fixed-point reconciliation, and affected closure;
   - [docs/character-persistence.md](docs/character-persistence.md) for saved-character reads, writes, migrations, revisions, and conflicts;
   - [docs/security.md](docs/security.md) and [docs/admin-operations.md](docs/admin-operations.md) for trust boundaries and credentials.
5. Inspect `git status`, the current branch, and recent commits. Preserve unrelated user changes.
6. Run the standard preflight in `docs/roadmap.md` plus any step-specific preflight before editing. If the documented status disagrees with the repository or canonical Sheet, stop implementation and update the status/contract evidence first.

When the user says, for example, “Read `AGENTS.md` and proceed from `WPB-EXPRESSIONS`,” complete that named step through its acceptance criteria, update its evidence and [docs/status.md](docs/status.md), and stop at the next named boundary unless the user explicitly asks to continue.

Before beginning any named roadmap step, explain it in plain language for a technically capable reader who is not familiar with this project's specific implementation. State what the preceding step established, what the named step will produce, why it is useful, and any known blocker or approval boundary. At handoff, explain the purpose and benefit of the next named step by default; do not wait for the user to request that explanation.

When a decision is required, first explain the concrete problem or ambiguity and the consequence of choosing incorrectly. Then present the viable options and a recommendation. A recommendation by itself is not an adequate decision request.

## Source-of-truth hierarchy

Use the narrowest authoritative source; do not resolve contradictions by guessing.

1. Executable code, tests, Firebase rules, and checked-in contracts define current implemented behavior.
2. The canonical Google Sheet defines structured game-data source schema and content. Its Drive file ID is recorded in `contracts/game-data-source.json`.
3. Living documents under `docs/` define intended architecture and accepted decisions.
4. `docs/architecture-audit-2026-08-02.md`, completion records, and Git history are historical evidence, not current specifications.
5. The Player Handbook is a cross-reference for omissions and prose. Complete, newer mechanics in the canonical Sheet take precedence unless an explicit decision says otherwise.

If an implementation decision changes a contract, update the relevant living document in the same change. Do not leave architecture decisions only in chat transcripts or commit messages.

## Current target architecture

The target dependency direction is:

```text
Pages / Widgets -> CharacterSession
Pages / Widgets -> pure Rules
CharacterSession -> GraphCompiler -> GraphReconciler
GraphCompiler -> pure Rules
GraphReconciler -> pure Rules
CharacterSession -> database reader/writer -> Firebase
database reader/writer -> CharacterCodec
database reader/writer -> CharacterMigrations

Google Sheet -> acquisition -> adaptation -> normalization -> validation
             -> staged artifacts/diff -> reviewed publish -> runtime loader
```

Key ownership rules:

- Pages coordinate widgets and submit typed commands. They do not own capacity, prerequisite, or dependency-removal policy.
- Widgets render/edit one choice type and produce commands or proposed patches. They are not dependency truth.
- Rules are pure and shared by widgets and graph code. Rules never depend on DOM or live widgets.
- The graph is authoritative for what exists, what breaks, and what is removed. It does not depend on live widgets.
- `CharacterSession` will own persisted, working, proposed, and reconciled in-memory states.
- The existing database reader/writer jointly own character persistence as one boundary; do not add a duplicate repository implementation. Codecs and sequential migrations isolate stored Firebase formats.
- Database format knowledge stays in reader/writer/codec/migration modules.
- Game-data source acquisition, adaptation, normalization, validation, artifact writing, and publishing are separate phases.

See [docs/architecture.md](docs/architecture.md) for current-versus-target details and the full component contracts.

## Non-negotiable invariants

### Character builder

- Every selected answer has a stable identity, source owner, and storage binding.
- Every answer-producing grant owns its answer as source-owned state.
- A UI change is proposed and reconciled in memory before committed state is mutated.
- Validation errors cannot be confirmed away.
- Destructive dependency changes require explicit confirmation; cancellation is side-effect free.
- Accepted state is exactly the reconciled state used to produce the impact report and save patch.
- Source-owned techniques do not consume normal technique capacity.
- Builder pages must not duplicate shared choice-capacity or prerequisite logic.
- Character-sheet autosave may write only sheet-owned temporary leaves.

### Game data

- The native Google Sheet is the editable source. A local XLSX is only an ignored fetched snapshot.
- Never edit the canonical Google Sheet through a connector, API, script, or browser automation unless the user explicitly approves the exact edit scope. Permission to inspect, diagnose, or proceed with a roadmap step is not permission to write source cells.
- Never hand-edit generated JSON to repair source or exporter defects.
- Export all records; normal selectors admit only records whose `status` or `selectionMode` allows direct selection.
- Stable keys, not display names, identify persisted and cross-referenced entities.
- Workbook schema v4 `Metadata`, `Schema`, and `Enums` are contract inputs, not editorial tabs.
- `ClassSkills` is the normalized mechanical source. Legacy class skill columns remain compatibility-only.
- Never write beneath `public/data/game-x` while the production export status is `frozen`.
- Validate and produce a complete staged diff before publishing.
- Every data run records the Drive file ID, source modification time/version when available, export time, and SHA-256 hash.

### Security and operations

- Never store credentials anywhere inside the repository, including ignored paths.
- Use read-only Drive scope for source acquisition.
- Validate any `GOOGLE_APPLICATION_CREDENTIALS` path with the repository credential policy before authentication.
- Never deploy while [docs/status.md](docs/status.md) records deployment-blocking manual acceptance as pending unless the user explicitly overrides that boundary in the current request. Record the override and its exact deployment scope; do not infer permission for data publishing, rules, functions, or other targets.
- Firebase Security Rules are the authorization boundary; client validation is advisory.

## Repository map

- `public/js/core/`: shared browser rules, graph, persistence, save, and data modules.
- `public/js/builder/`: builder coordinators and widgets.
- `public/js/pages/`: non-builder page entry modules.
- `public/data/game-x/`: reviewed generated runtime artifacts.
- `scripts/`: local tooling, data pipeline, Firebase emulator, and admin commands.
- `contracts/`: machine-readable source and frozen-release contracts.
- `tests/`: unit and Firebase emulator rule tests.
- `docs/`: living architecture/contracts plus explicitly dated historical records.

## Standard commands

Run from the repository root on Node.js 22 or a compatible current LTS release.

```powershell
npm install
npm test
npm run baseline:data
npm run validate:assets
```

Use the full suite when a change touches persistence, rules, browser assets, release behavior, or crosses subsystem boundaries:

```powershell
npm run test:all
```

Game-data commands:

```powershell
npm run data:source:check # metadata-only access check; requires read-only ADC
npm run fetch:data       # authenticated, read-only Sheet -> ignored staging XLSX + provenance
npm run stage:data       # fetch, validate, runtime-check, and diff an ignored immutable staging run
npm run baseline:data    # prove reviewed production JSON has not drifted
```

`npm run stage:data` fails closed on acquisition, adaptation, validation, or runtime-load errors. A failed run is a contract/source finding, not permission to coerce, skip, or patch generated data.

## Implementation and test discipline

- Prefer small pure modules over extending monolithic page or CLI files.
- Keep parsing free of file I/O and `process.exit`; return structured diagnostics or throw typed errors at the CLI boundary.
- Keep source-specific column aliases in adapters, never in graph/rules/runtime consumers.
- Add valid and invalid fixtures for each schema, grant, prerequisite, migration, or reconciliation rule.
- Preserve deterministic ordering and output so diffs are reviewable.
- Do not mix source editorial changes with exporter behavior changes in one review unless the named roadmap step explicitly requires both.
- Do not remove compatibility fields or aliases until persisted-state migrations and tests exist.
- Use `rg`/`rg --files` for repository search. Use `apply_patch` for hand-authored file edits.

## Deployment and commit discipline

- Always redeploy ready website changes to the appropriate website target so manual review and release verification never exercise stale code. While production deployment is blocked or not yet approved, restart/redeploy the local Firebase review environment and report the local URL; do not treat that as permission to deploy production. Once production deployment is unblocked and authorized, deploy the ready change and verify the deployed site.
- Create a new commit for each new feature. When modifying a feature represented by the current top commit, amend that top commit so the feature remains one coherent change. If that feature commit is not `HEAD`, create a new commit; never rewrite a non-top commit or unrelated history.
- Before amending, verify the current top commit and worktree scope. Do not fold unrelated user changes into either a new or amended commit.

## Completion and handoff protocol

Before declaring a named step complete:

1. Satisfy every deliverable and acceptance criterion in [docs/roadmap.md](docs/roadmap.md).
2. Run the listed tests and record exact results in [docs/status.md](docs/status.md).
3. Update living architecture/contracts affected by the change.
4. Mark the roadmap step complete without renumbering it; identify the next step.
5. Record unresolved risks, manual checks, and whether they block implementation, publishing, or deployment.
6. Leave the worktree reviewable and report any unrelated pre-existing changes.
7. Explain the next named step in plain language, including its purpose, expected benefit, prerequisites, and approval boundaries, even when stopping at that boundary.

Do not mark an entire work package complete merely because one command succeeds. Production data publishing and website deployment are separate approval boundaries.
