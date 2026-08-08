# Current implementation status

Last updated: 2026-08-07

Current branch at update: `codex/work-package-b-data-contract`

Active implementation work package: Work Package C — character schema and session skeleton

Next implementation step: `WPC-REPOSITORY`

Parallel blocked game-data steps: `WPB-SOURCE-ACCESS`, then live acceptance for `WPB-ADAPTERS`, `WPB-REFERENCES`, `WPB-STAGING`, and `WPB-SOURCE-RESOLUTION`

This is the only frequently updated project-status document. Historical audits and completion records must not be edited to look current.

## Checkpoint

- `master` ends at `42bfb99` (`Update Architecture to be more Module`).
- Milestone 0 stabilization is committed at `7d4fc6e`.
- The initial Work Package B baseline is committed at `637c06f`.
- `WPB-SOURCE-SYNC` is the checkpoint commit immediately after `637c06f`, titled `Document handoff architecture and automate source acquisition`.
- The current Work Package B top commit is the schema-v4 expressions/adapters/references/staging and approved source-resolution checkpoint, titled `Implement schema-v4 staging and source resolution`.
- `WPC-MIGRATIONS` is committed at `5568aa5`, titled `Add isolated character migration registry`.
- The current top feature checkpoint is `WPC-REPOSITORY`, titled `Implement definitive character persistence boundary`; it strengthens the existing database reader/writer rather than adding a duplicate repository implementation.
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
- The live `database-reader.js` and `database-writer.js` deliberately remain on schema version 4. Switching their version stamp outside `WPC-REPOSITORY` would let partial legacy saves falsely claim to be valid v5 documents.
- The approved reversible `choice-rebind` behavior remains documented, but its original-plus-overlay persistence shape is deferred to the later feature vertical slice rather than guessed in the codec.
- [character-data-contract.md](character-data-contract.md) is the living v5 contract. Agent guidance now also requires decision requests to explain the underlying problem and consequences before offering options or a recommendation.
- `WPC-MIGRATIONS` is complete: historical saved-document compatibility for the target v5 path is isolated in pure `CharacterMigrations`; pages, widgets, rules, graph code, sessions, and the future repository's canonical logic must consume only v5. Existing transitional v4 compatibility branches remain live only until their callers move behind `WPC-REPOSITORY` and later vertical integration.
- Executable history supports unversioned, v1, v3, and v4 inputs. No schema-v2 writer existed, so explicit v2 is reserved and rejected rather than guessed.
- Historical display/composite references require a supplied reviewed-game-data lookup. Missing, unresolved, and ambiguous mappings fail with exact diagnostics; deterministic generated identities and collisions are reported.
- Migration returns exact codec-accepted v5 separately from `createdAt`, `updatedAt`, and historical `lastVisitedAt` repository metadata. Populated legacy values without a lossless v5 binding fail instead of being discarded.
- [character-migrations.md](character-migrations.md) is the living backward-compatibility contract. The live persistence path remains transitional until `WPC-REPOSITORY` owns migrate-then-decode and stamps every successful canonical write as v5.
- Migration write-back policy is approved: opening a historical character migrates it in memory without touching Firebase; the v5 replacement is persisted only when the user explicitly saves successfully.

### Work Package C persistence boundary

- `WPC-REPOSITORY` is active. The existing `database-reader.js` and `database-writer.js` are now the definitive v5 persistence entry points; `character-persistence.js` holds their shared Firebase-free envelope, patch-ownership, revision, and error rules.
- Reads run raw Firestore data through `CharacterMigrations` and the exact v5 codec and return canonical state separately from timestamps, historical visit time, revision, and migration evidence. Migrated reads never write.
- Creates, full replacements, narrow builder/sheet patches, and deletes use exact validation. Successful creates/saves stamp v5; patches apply to the latest value inside a Firestore transaction; full replacement, patch, and delete require a matching document-wide revision.
- Historical documents without a revision are revision 0, new documents begin at 1, and accepted saves increment once. Stale writes raise a typed conflict without changing the newer stored value.
- The character-sheet temporary-leaf allowlist remains exact, arbitrary page paths are rejected, owner/path mismatch is rejected, missing documents are explicit, and Firebase authorization errors propagate.
- Focused emulator tests prove create/read, timestamp resolution, migrated read without write, explicit-save migration write-back, valid and invalid patches, newer-value preservation after a conflict, missing documents, and authorization propagation.
- Deployed page integration is not complete. Existing pages still use clearly marked v4 helpers or direct Firebase calls because the frozen runtime game data lacks stable `techniqueKey` values required to migrate populated technique selections safely. The v4 path must not be removed or falsely stamped v5 until that prerequisite and affected domain integration are complete.
- [character-persistence.md](character-persistence.md) is the living read/write/revision contract and is now part of the required agent startup reading for persistence work.

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
- Character schema v5, its migration registry, and the definitive Firebase reader/writer APIs are implemented and emulator-tested. The production site continues to use the transitional v4 page path until stable-key runtime data and affected domain integration permit a safe switch.
- Repository implementation can proceed against fixtures, but live migration of stored technique selections requires runtime game data with `techniqueKey`. The frozen production schema-v1 artifacts do not provide that key, so switching the deployed persistence path remains blocked until the reviewed Work Package B release or another explicit stable-key source is available.
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

Verified during active `WPC-REPOSITORY` implementation on 2026-08-07, with the prior read-only `WPB-SOURCE-RESOLUTION` and Hosting-only release evidence retained below:

- `npm run test:all`: 144 unit tests, 16 Firebase emulator tests, and all 14 HTML entry points passed with zero failures. This includes migration metadata/revision separation, exact persistence envelopes, explicit patch ownership, owner/path checks, revision planning, and typed stale conflicts.
- Five focused persistence emulator tests cover create/read, timestamps, migrated read without a write, explicit-save migration persistence, valid and invalid patches, stale-write preservation, missing documents, and authorization propagation; the other 11 emulator tests continue to cover Firestore and Storage Rules.
- `npm run baseline:data`: all 9 frozen production artifacts matched; WPC-REPOSITORY changed no production game data.
- `git diff --check`: passed.
- The local Firebase review environment was restarted at PID 67024. The served writer and pure persistence assets returned HTTP 200, exposed the new v5 APIs, and contained the final visit-metadata preservation logic. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Ten focused migration tests cover every evidence-backed edge, v2/future rejection, exact v5 codec acceptance, non-mutation/idempotence, metadata separation, primary-attribute restoration, stable reference resolution, deterministic IDs/reports, collisions, unresolved/ambiguous/unknown input, and module purity.
- `npm run baseline:data`: all 9 frozen production artifacts matched; WPC-MIGRATIONS changed no production game data.
- The local Firebase review environment was restarted (PID 48356) and returned HTTP 200 for `/js/core/character-migrations.js`; the served asset contains the supported-version registry. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
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
