# Current implementation status

Last updated: 2026-08-06

Current branch at update: `codex/work-package-b-data-contract`

Active implementation work package: Work Package C — character schema and session skeleton

Next implementation step: `WPC-MIGRATIONS`

Parallel blocked game-data steps: `WPB-SOURCE-ACCESS`, then live acceptance for `WPB-ADAPTERS`, `WPB-REFERENCES`, `WPB-STAGING`, and `WPB-SOURCE-RESOLUTION`

This is the only frequently updated project-status document. Historical audits and completion records must not be edited to look current.

## Checkpoint

- `master` ends at `42bfb99` (`Update Architecture to be more Module`).
- Milestone 0 stabilization is committed at `7d4fc6e`.
- The initial Work Package B baseline is committed at `637c06f`.
- `WPB-SOURCE-SYNC` is the checkpoint commit immediately after `637c06f`, titled `Document handoff architecture and automate source acquisition`.
- The current Work Package B top commit is the schema-v4 expressions/adapters/references/staging and approved source-resolution checkpoint, titled `Implement schema-v4 staging and source resolution`.
- `WPC-CODEC` is the current top commit, titled `Define strict character schema v5 codec`.
- At the beginning of the schema-v4 synchronization work, the Work Package B branch was clean and two commits ahead of `master`.

Always verify these statements with `git status` and `git log`; update this section after each checkpoint commit.

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
- `WPB-EXPRESSIONS` is complete: exporter validation and runtime loading share typed grant/prerequisite registries, pure contextual parsing/serialization, resource capacity semantics, and schema-v4 fixtures.
- `WPB-ADAPTERS` implementation is fixture-complete: the generic XLSX reader and all schema-v4 per-tab adapters are pure, strict, source-located, and covered end to end in memory. The named step remains open for live-source acceptance.
- `WPB-REFERENCES` implementation has begun and is fixture-complete: pure whole-model validation now covers identities, ownership, parent scope, cross-tab and choice references, status/readiness, selection/cost rules, class skills, deterministic ordering, and errors-versus-warnings policy. The named step remains pending behind official adapter acceptance.
- `WPB-STAGING` implementation has begun and is fixture-complete: validated canonical models now produce deterministic schema-v2 artifacts, runtime-load acceptance, provenance/hash reports, and a complete structural/semantic frozen-release diff in atomic ignored runs. The named step remains pending until authenticated end-to-end acceptance.
- `WPB-SOURCE-RESOLUTION` is active. Descriptions are optional, implicit source-owned choice identities are accepted, `draft` is excluded from normal and grant-owned selectors, and generic `rank`/reversible `choice-rebind` contracts preserve the approved meaning. The user-approved canonical-Sheet batch was applied and read back on 2026-08-05: the remaining specialized grant types, duplicate companion IDs, and three selectable incomplete Techniques were corrected. Official zero-error acceptance still requires repository ADC access and a clean immutable staging run. See [game-data-source-resolution.md](game-data-source-resolution.md).

### Work Package C character contract

- `WPC-CODEC` is complete: schema version 5 now has independently allocated canonical defaults and a pure exact codec that reports structured path-specific diagnostics instead of silently coercing malformed state.
- The approved boundary treats schema versions 1–4 as migration input, keeps Firestore timestamps outside canonical state, preserves `visitedSteps` as state, requires stable keys for persisted game-data selections, and exactly allowlists character-sheet fields and repeatables.
- Identity-bearing bond, ability, weapon, enhancement, grant-choice, and resource records are explicit. Existing compatibility snapshots remain transitional fields so later migrations and reconciliation can prove parity.
- The live `database-reader.js` and `database-writer.js` deliberately remain on schema version 4. Switching them before `WPC-MIGRATIONS` would let partial legacy saves falsely claim to be valid v5 documents.
- The approved reversible `choice-rebind` behavior remains documented, but its original-plus-overlay persistence shape is deferred to the later feature vertical slice rather than guessed in the codec.
- [character-data-contract.md](character-data-contract.md) is the living v5 contract. Agent guidance now also requires decision requests to explain the underlying problem and consequences before offering options or a recommendation.

## Canonical external source

| Property | Current value |
|---|---|
| Source Sheet | [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit) |
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Drive modified time | `2026-08-05T23:51:04.524Z` |
| Source schema | `4` |
| Grant syntax | `2` |
| Prerequisite syntax | `2` |
| Display Sheet | [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit) |

The repository's old `data/game-x-class-data.xlsx` is a June 29 snapshot and is not authoritative. Use `npm run fetch:data` to acquire a fresh ignored snapshot.

## Current boundaries

- Production JSON remains frozen at the reviewed June 29 release.
- The schema-v4 source is newer than the runtime artifacts.
- The staging CLI now uses the canonical reader -> adapter -> validator -> schema-v2 builder -> runtime acceptance -> diff pipeline. It never invokes the legacy exporter and production remains frozen.
- Character schema v5 exists as a tested pure module but is not yet connected to Firebase reads or writes; the production site continues to use the transitional v4 persistence path until migrations and repository integration are complete.
- Familiar, vehicle, and gadget expressions are preserved with explicit runtime-stub status until their future subsystem slices; they are no longer rejected or discarded by data loading.
- The live Handbook import script was not run after spreadsheet normalization because its bound script source/staging target was inaccessible. The Handbook remains untouched.

## Deferred acceptance and blockers

### Manual acceptance debt

- Manual browser scenarios in [work-package-a-completion.md](work-package-a-completion.md) remain pending: destructive reconciliation, capacity changes, source-owned choices/weapons, dialog focus, dirty navigation, unload prompt, save retry, and two-tab isolation.
- On 2026-08-05 the user explicitly overrode this gate for a production Firebase Hosting deployment of the current committed `public/` tree. This override does not authorize game-data publishing, Firebase Rules/Functions deployment, or removal of the outstanding acceptance debt.

### Blocks production data publishing

- Authenticated acceptance for `WPB-ADAPTERS`, `WPB-REFERENCES`, and `WPB-STAGING`, followed by `WPB-SOURCE-RESOLUTION` and `WPB-DIFF-REVIEW`, remains incomplete.
- A clean schema-v4 staging export and complete reviewed artifact diff do not yet exist.
- The production export freeze must remain active.
- The decisions covering all 77 previously recorded live-source findings are implemented locally or applied to the canonical Sheet. Connector readback verifies the approved cell values and validation rules. Repository acquisition/staging acceptance remains blocked until its separate ADC identity receives read-only Drive access.

### One-time local setup for automated source acquisition

- `WPB-SOURCE-ACCESS` is blocked on one-time external identity/API/Sheet-sharing configuration.
- Provide Application Default Credentials authorized for read-only Google Drive access.
- If using a service-account key, keep it outside the repository and share the source Sheet with that service account as a reader.
- If using user ADC, Google Drive scopes require a custom OAuth client when invoking `gcloud auth application-default login`.

See [data-pipeline.md](data-pipeline.md) for exact commands and security guidance.

## Last verification

Verified for `WPC-CODEC` on 2026-08-06, with the prior read-only `WPB-SOURCE-RESOLUTION` and Hosting-only release evidence retained below:

- `npm run test:all`: 123 unit tests, 11 Firebase Rules tests, and all 14 HTML entry points passed; zero failures.
- Ten focused codec tests cover complete/fresh defaults, a populated clone-safe round trip, migrate-first rejection, metadata separation, exact root/builder/sheet/nested keys, stable-key and duplicate diagnostics, cross-field invariants, map identity, malformed nested input, and typed assertion errors.
- `npm run baseline:data`: all 9 frozen production artifacts matched; WPC-CODEC changed no production game data.
- The local Firebase review environment was restarted and returned HTTP 200 for `/js/core/character-codec.js`; the served asset declares schema version 5. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Seven STAGING tests cover complete atomic output, production immutability, immutable run IDs, byte determinism, validation-error diagnostic-only runs, the validated-model construction gate, fresh runtime loading, split/combined equality, exact structural paths, stable semantic identities, the legacy technique bridge, and weapon-profile composite identity.
- ADAPTERS and REFERENCES fixtures remain green, including exactly 37 deterministic invalid-reference errors plus one warning after removing a false positive for optional composite-identity fields.
- Live `npm run data:source:check` was retried after the approved Sheet write and failed safely because the configured ADC lacks read-only access to the canonical Sheet; neither ignored XLSX nor provenance output exists.
- The exact `npm run stage:data` acceptance command stops at the same acquisition boundary before creating a run or touching production.
- Advisory connected-Sheet reads confirmed the 14 tab names, exact schema-v4 headers, metadata versions 4/2/2, and all 152 `Schema` declarations. These reads informed fixtures but do not satisfy repository live-source acceptance.
- `git diff --check`: passed.
- On 2026-08-05, an earlier detached local Firebase process did not persist after its command session ended, so the user authorized the documented production Hosting-only fallback. The current 2026-08-06 local process is the separately verified instance reported above.
- `npm run deploy:hosting`: Firebase Hosting released 91 files successfully at `https://game-x-character-builder.web.app`; no data-publish, Rules, Functions, or other Firebase target was deployed.
- External verification returned HTTP 200 for `/` and `/login.html`. The deployed `/js/core/game-data.js` was byte-identical to the local release file (SHA-256 `77d6ea85df004bbaf7ad0457a1542e9b73b9ce0f61197b6ca3a541ed91093726`).
- Checkpoint scope: the approved canonical-Sheet cells and dropdown validations changed; no production JSON, credentials, fetched workbook bytes, or repository staging artifacts changed.
