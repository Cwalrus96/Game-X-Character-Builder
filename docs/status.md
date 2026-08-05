# Current implementation status

Last updated: 2026-08-04

Current branch at update: `codex/work-package-b-data-contract`

Active work package: Work Package B — game-data contract and exporter repair

Next implementation step: `WPB-EXPRESSIONS`

Parallel external setup step: `WPB-SOURCE-ACCESS`

This is the only frequently updated project-status document. Historical audits and completion records must not be edited to look current.

## Checkpoint

- `master` ends at `42bfb99` (`Update Architecture to be more Module`).
- Milestone 0 stabilization is committed at `7d4fc6e`.
- The initial Work Package B baseline is committed at `637c06f`.
- `WPB-SOURCE-SYNC` is the checkpoint commit immediately after `637c06f`, titled `Document handoff architecture and automate source acquisition`.
- At the beginning of the schema-v4 synchronization work, the Work Package B branch was clean and two commits ahead of `master`.

Always verify these statements with `git status` and `git log`; update this section after the next checkpoint commit.

## Completed

### Milestone 0 and Work Package A

- Preview errors block and destructive dependency removals require confirmation.
- Class changes no longer pre-clear graph-owned dependent state.
- Dazzling Wand technique answers and generated weapons are source-owned and graph-reconciled.
- Character-sheet writes are restricted to temporary sheet-owned leaves.
- Saves are serialized; dirty, saving, failure, and retry state is visible.
- Shared dialog lifecycle and dirty-navigation/unload protection are implemented.
- Identified unsafe data-derived HTML paths and low-risk route/asset defects are repaired.
- Privileged credential paths are rejected when they resolve inside the repository.

Evidence: [work-package-a-completion.md](work-package-a-completion.md) and [milestone-0-completion.md](milestone-0-completion.md).

### Work Package B foundations

- `WPB-BASELINE` is complete: the checked-in production release is hash/count baselined and production export is frozen.
- The canonical source Sheet and display Sheet were normalized and validated on 2026-08-03/04.
- The canonical workbook declares source schema v4, grant syntax v2, and prerequisite syntax v2.
- The repository now has an agent entry point, living roadmap/status, refreshed architecture/data contracts, and automated read-only source acquisition.
- The source snapshot and staging artifacts are ignored; credentials are never stored in the repository.

## Canonical external source

| Property | Current value |
|---|---|
| Source Sheet | [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit) |
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Drive modified time | `2026-08-04T02:05:29.623Z` |
| Source schema | `4` |
| Grant syntax | `2` |
| Prerequisite syntax | `2` |
| Display Sheet | [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit) |

The repository's old `data/game-x-class-data.xlsx` is a June 29 snapshot and is not authoritative. Use `npm run fetch:data` to acquire a fresh ignored snapshot.

## Current boundaries

- Production JSON remains frozen at the reviewed June 29 release.
- The schema-v4 source is newer than the runtime artifacts.
- The existing exporter is still a monolithic schema-v1-oriented CLI. It cannot yet represent every schema-v4 grant, prerequisite, cost, or normalized table.
- Runtime grant/prerequisite registries still mark several decided source constructs as unsupported.
- The live Handbook import script was not run after spreadsheet normalization because its bound script source/staging target was inaccessible. The Handbook remains untouched.

## Deferred acceptance and blockers

### Blocks deployment, not Work Package B implementation

- Manual browser scenarios in [work-package-a-completion.md](work-package-a-completion.md): destructive reconciliation, capacity changes, source-owned choices/weapons, dialog focus, dirty navigation, unload prompt, save retry, and two-tab isolation.

### Blocks production data publishing

- `WPB-EXPRESSIONS` through `WPB-DIFF-REVIEW` are incomplete.
- A clean schema-v4 staging export and complete reviewed artifact diff do not yet exist.
- The production export freeze must remain active.

### One-time local setup for automated source acquisition

- `WPB-SOURCE-ACCESS` is blocked on one-time external identity/API/Sheet-sharing configuration.
- Provide Application Default Credentials authorized for read-only Google Drive access.
- If using a service-account key, keep it outside the repository and share the source Sheet with that service account as a reader.
- If using user ADC, Google Drive scopes require a custom OAuth client when invoking `gcloud auth application-default login`.

See [data-pipeline.md](data-pipeline.md) for exact commands and security guidance.

## Last verification

Verified after the schema-v4 synchronization implementation:

- `npm test`: 77 passed, 0 failed, including agent-handoff contracts, structural workbook validation, path/junction boundaries, paired-write rollback, and staging orchestration.
- `npm run test:rules`: 11 passed, 0 failed. The first concurrent invocation collided on emulator port 4400 while Firebase downloaded a changed emulator version; the clean single rerun passed and shut down normally.
- `npm run validate:assets`: 14 HTML entry points passed.
- `npm run baseline:data`: 9 production artifacts matched the frozen baseline.
- `npm run fetch:data -- --help`: passed without credentials.
- `npm run data:source:check`: failed safely with a concise read-only-access message because current user ADC lacks Drive scope; wrote no source snapshot.
- `npm run stage:data`: stopped at the same acquisition boundary and did not invoke production export.
- Connected Drive metadata/export: canonical native Sheet and a 509,362-byte XLSX export independently confirmed, modified `2026-08-04T02:05:29.623Z`; live `Metadata` values match source schema 4 and syntax versions 2/2.
- `git diff --check`: passed; only existing line-ending conversion notices were reported.
- Checkpoint scope: no production JSON or workbook bytes changed.
