# Current implementation status

Last updated: 2026-08-10

Current branch at update: `codex/work-package-b-data-contract`

Active implementation work package: Work Package E — vertical domain migration

Next implementation step: `WPE-DOMAIN-MIGRATION`

Parallel blocked character step: deployed-page completion of `WPC-REPOSITORY`, pending affected Work Package E domain integration; the reviewed stable-technique-key data prerequisite is now satisfied

Parallel game-data step: Work Package B is complete through `WPB-PUBLISH`; no game-data manual action is pending

This is the only frequently updated project-status document. Historical audits and completion records must not be edited to look current.

## Checkpoint

- `master` ends at `42bfb99` (`Update Architecture to be more Module`).
- Milestone 0 stabilization is committed at `7d4fc6e`.
- The initial Work Package B baseline is committed at `637c06f`.
- `WPB-SOURCE-SYNC` is the checkpoint commit immediately after `637c06f`, titled `Document handoff architecture and automate source acquisition`.
- The current Work Package B release promotes approved schema-v2 candidate `20260809T022801911Z-51956`, adds the exact-byte publisher, and records transactional rollback.
- The `WPB-PUBLISH` checkpoint is the current top commit, titled `Publish reviewed schema-v2 game data`.
- `WPC-MIGRATIONS` is committed at `5568aa5`, titled `Add isolated character migration registry`.
- The current top feature checkpoint is `WPC-REPOSITORY`, titled `Implement definitive character persistence boundary`; it strengthens the existing database reader/writer rather than adding a duplicate repository implementation.
- The current Work Package C session checkpoint is `WPC-SESSION`, titled `Add canonical character session lifecycle`; it remains pure and does not switch deployed pages.
- The current Work Package D graph checkpoint is `WPD-GRAPH-CORE`, titled `Add deterministic character graph core`; it remains fixture-integrated and does not switch deployed pages or publish data.
- Agent guidance now requires automatic human-readable briefings before every named roadmap step and self-contained plain-language outcome summaries afterward; filenames, test lists, and jargon cannot substitute for those explanations.
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
- `WPB-SOURCE-ACCESS` is complete: the dedicated Viewer-only Sheet identity is available through short-lived user-ADC impersonation, without a persistent key.
- `WPB-ADAPTERS` and `WPB-REFERENCES` are complete. Authenticated canonical Drive version `642` adapts and validates with zero errors, 28 intentional warnings, deterministic finding order, and successful runtime-load acceptance.
- `WPB-STAGING` is complete. Runtime revision identity uses the stable Drive revision plus normalized-model hash; byte-distinct XLSX transports for unchanged Drive version `642` now produce byte-identical nine-artifact runtime sets. Authenticated end-to-end staging passes and leaves production untouched.
- `WPB-SOURCE-RESOLUTION` is complete. Descriptions are optional, implicit source-owned choice identities are accepted, `draft` is excluded from normal and grant-owned selectors, and generic `rank`/reversible `choice-rebind` contracts preserve the approved meaning. The user-approved canonical-Sheet batch was applied and read back on 2026-08-05; authenticated 2026-08-08 staging confirms zero structural errors and 28 intentional warnings. See [game-data-source-resolution.md](game-data-source-resolution.md).
- `WPB-DIFF-REVIEW` is complete. The user approved the exact nine-artifact candidate `20260809T022801911Z-51956`; its identity and hashes are recorded in [game-data-release-candidate-2026-08-08.md](game-data-release-candidate-2026-08-08.md).
- `WPB-PUBLISH` is complete. The separate publisher verified both approval gates and exact source/model/artifact hashes, installed only the approved bytes, removed stale `export-report.json`, added `class-skills.json`, refreshed the exact baseline, and retained the generic production-export freeze. Release and rollback evidence is in [game-data-release-2026-08-09.md](game-data-release-2026-08-09.md).

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
- Deployed page integration is not complete. The published runtime now supplies stable `techniqueKey` values, satisfying the data prerequisite, but existing pages still use clearly marked v4 helpers or direct Firebase calls until their affected Work Package E domain integration is complete. The v4 path must not be removed or falsely stamped v5 before that integration is accepted.
- [character-persistence.md](character-persistence.md) is the living read/write/revision contract and is now part of the required agent startup reading for persistence work.

### Work Package C character session

- `WPC-SESSION` is complete: `CharacterSession` privately owns exact v5 persisted, working, proposed, and reconciled state and exposes only protected projections.
- Strict `SetClass` and `SetTechniqueSelection` commands express direct user intent without dependency policy. Unknown commands/fields, malformed stable keys, and duplicate technique identities fail explicitly.
- One proposal identity records the proposed state, one reconciler invocation, exact reconciled state, deterministic diffs, and structured error/confirmation/information impacts. Pending proposals cannot be silently superseded; cancellation changes no working state; acceptance commits the exact reviewed result without rerunning reconciliation.
- Exact save snapshots carry the expected persistence revision. Successful acknowledgement advances persisted state to what was actually written while preserving newer accepted edits as dirty working state.
- The reconciliation boundary is injectable and defaults to identity behavior. Work Package D now supplies an explicit graph adapter; current pages are intentionally unchanged until their domain slice migrates.
- [character-session.md](character-session.md) is the living state/command/proposal/impact/save contract and is required startup reading for session work.

### Work Package D graph core

- `WPD-GRAPH-CORE` is complete: `GraphCompiler` converts an exact schema-v5 character plus normalized runtime schema-v2 fixture data into deterministic frozen typed nodes, edges, diagnostics, and metadata.
- Every selected class/technique answer in the initial fixture slice has stable identity, source ownership, and an exact scalar, ordered-key-array, or keyed-record storage binding. Populated domains without a registered vertical handler fail explicitly.
- Independent node, grant, and prerequisite handler registries make extension a domain-registration task rather than a traversal rewrite. The initial grant slice covers direct and source-owned technique choices; typed shared prerequisite evaluation remains the Rules boundary.
- `GraphReconciler` applies unavailability, prerequisite, orphan-removal, normal-technique capacity, and incomplete-selection policy to a bounded deterministic fixed point. Removals require confirmation, compiler failures remain blocking errors, and valid incomplete choices remain informational.
- Duplicate identities, dangling references/edges, cycles, missing handlers, handler failures, and non-convergence produce structured diagnostics without hangs or partial reconciled characters.
- A `CharacterSession` adapter supplies the graph result through the existing injected boundary exactly once per proposal. Acceptance commits the reviewed fixed point and cancellation remains byte-for-byte side-effect free.
- [character-graph.md](character-graph.md) is the living graph/compiler/reconciler and domain-extension contract.

## Canonical external source

| Property | Current value |
|---|---|
| Source Sheet | [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit) |
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Drive version | `647` |
| Drive modified time | `2026-08-09T02:27:03.310Z` |
| Source schema | `4` |
| Grant syntax | `2` |
| Prerequisite syntax | `2` |
| Display Sheet | [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit) |

The repository's old `data/game-x-class-data.xlsx` is a June 29 snapshot and is not authoritative. Use `npm run fetch:data` to acquire a fresh ignored snapshot.

## Current boundaries

- Production JSON is the reviewed schema-v2 release from canonical Drive version `647`, exact-hash baselined across nine runtime artifacts.
- The staging CLI uses the canonical reader -> adapter -> validator -> schema-v2 builder -> runtime acceptance -> diff pipeline. It never invokes the legacy exporter or publisher.
- The generic exporter remains frozen. Only `npm run publish:data -- --confirm <approved-run-id>` may promote an exact separately approved staging run.
- Character schema v5, its migration registry, the definitive Firebase reader/writer APIs, the pure four-state session lifecycle, and the deterministic graph compiler/fixed-point reconciler are implemented and tested. The production site continues to use the transitional v4 page path until stable-key runtime data and Work Package E domain integration permit a safe switch.
- Runtime stable technique keys are now available. Switching the deployed persistence path remains blocked only on the affected Work Package E domain integration and its acceptance boundaries.
- Familiar, vehicle, and gadget expressions are preserved with explicit runtime-stub status until their future subsystem slices; they are no longer rejected or discarded by data loading.
- The graph core requires normalized runtime artifact schema 2, which is now published, but remains fixture-integrated until the corresponding Work Package E page/domain slice authorizes a deployed-page cutover.
- The live Handbook import script was not run after spreadsheet normalization because its bound script source/staging target was inaccessible. The Handbook remains untouched.

## Deferred acceptance and blockers

### Manual acceptance debt

- Manual browser scenarios in [work-package-a-completion.md](work-package-a-completion.md) remain pending: destructive reconciliation, capacity changes, source-owned choices/weapons, dialog focus, dirty navigation, unload prompt, save retry, and two-tab isolation.
- On 2026-08-05 the user explicitly overrode this gate for a production Firebase Hosting deployment of the current committed `public/` tree. This override does not authorize game-data publishing, Firebase Rules/Functions deployment, or removal of the outstanding acceptance debt.

### Production data publishing

- No publishing blocker remains for candidate `20260809T022801911Z-51956`; it was approved and promoted through the exact-byte publisher.
- Future source changes require a new immutable run, zero-error validation, complete semantic diff review, an exact release contract, and separate publish approval. The generic production export freeze remains active.

### Automated source acquisition

- `WPB-SOURCE-ACCESS` completed on 2026-08-08 with `game-x-sheet-exporter@game-x-character-builder.iam.gserviceaccount.com` shared as Viewer on only the canonical Sheet.
- Local user ADC impersonates that identity; the repository requests a 15-minute Drive-read-only target token.
- No persistent service-account key was created and no credential file exists under the repository.
- Set `GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT` to the service-account email in each acquisition shell before running the documented commands.

See [data-pipeline.md](data-pipeline.md) for exact commands and security guidance.

## Last verification

Work Package B publish verification on 2026-08-09:

- The user approved and the agent applied exactly six `WeaponBases` source-cell corrections: the display and stable tag lists for Longsword, Shuriken, and Greatsword. Connector readback verified the values and preserved surrounding formatting.
- The user also approved executable Heavy prerequisites and `draft` selection mode for Gravity Weapon and Seismic Weapon; connector readback verified the six affected cells and preserved their validation and formatting.
- `npm run data:source:check` passed for canonical Drive version `647`, modified `2026-08-09T02:27:03.310Z`, using the dedicated Viewer identity through short-lived impersonation.
- `npm run stage:data` produced immutable run `20260809T022801911Z-51956` with zero errors, the same 28 intentional warnings, runtime-load acceptance, nine staged artifacts, and no production write. Model SHA-256: `c03ed329b10e27310baef32d73fe239c9146e415c332ae62f7842d81e9a17739`.
- Against the preceding candidate, only `weapon-enhancements.json` and the combined `game-x-data.json` changed, matching the approved source scope. The refreshed exact candidate is `20260809T022801911Z-51956`.
- Earlier runs `20260808T194536442Z-37004` and `20260808T194543102Z-38020` established that byte-distinct XLSX transports for unchanged Drive version `642` produce byte-identical runtime artifacts.
- The user approved the exact candidate and separately authorized `WPB-PUBLISH`. `npm run publish:data -- --confirm 20260809T022801911Z-51956` installed the nine exact artifacts and transactionally updated release provenance/baseline.
- Publisher tests cover approval mismatch/tampering, exact promotion and stale-artifact removal, and full restoration of production plus baseline after an injected mid-install failure.
- The schema-v2 release exposed and repaired legacy feat-category and grant-identity casing assumptions; compatibility aliases preserve existing source-owned choice answers.
- `npm run test:all`: 174 unit tests, 16 Firebase emulator tests, and all 14 HTML entry points passed. `npm run baseline:data` verified all nine schema-v2 production artifacts.
- The local Firebase review environment was restarted at PID 24108. An authenticated browser loaded the existing Magical Guardian class builder, class feats, Dazzling Wand, canonical Spellcasting technique choices, and stable-key technique options with no console errors. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- `npm run deploy:hosting` released 100 public files successfully at `https://game-x-character-builder.web.app`; no Rules, Functions, or other Firebase target was deployed.
- External verification returned HTTP 200 for every runtime artifact; all nine deployed byte lengths and SHA-256 hashes exactly matched `contracts/game-data-release.json`. The deployed sign-in page loaded in the browser with no console errors.
- Checkpoint scope: the exact approved production JSON, compatibility loaders/identity handling, publisher, release contracts, baseline, tests, and living docs changed. No canonical-Sheet cell, Firebase Rule, Function, or Firebase document changed.

Verified at `WPD-GRAPH-CORE` completion on 2026-08-08, with the prior session, persistence, migration, read-only `WPB-SOURCE-RESOLUTION`, and Hosting-only release evidence retained below:

- `npm run test:all`: 169 unit tests, 16 Firebase emulator tests, and all 14 HTML entry points passed with zero failures.
- Twelve focused graph-core tests cover deterministic typed graph construction, stable ownership/storage bindings, collection-order stability, duplicate/dangling/cycle/missing-handler failures, fixed-point removal/capacity/prerequisite/incomplete policy, blocking-error separation, bounded non-convergence without partial state, transitive affected closure, exact session acceptance, side-effect-free cancellation, 40 generated convergence/idempotence/input-purity cases, and forbidden dependency imports.
- `npm run baseline:data`: all 9 frozen production artifacts matched; WPD-GRAPH-CORE changed no production game data.
- `git diff --check`: passed.
- The local Firebase review environment was restarted at PID 38004. `/js/core/graph-core.js`, `/js/core/graph-compiler.js`, and `/js/core/graph-reconciler.js` returned HTTP 200. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Checkpoint scope: fixture-driven pure graph modules, tests, and living contracts changed; no deployed page path, production JSON, canonical Sheet cell, Firebase document, Rule, Function, or production Hosting release changed.

- `npm run test:all`: 157 unit tests, 16 Firebase emulator tests, and all 14 HTML entry points passed with zero failures.
- Thirteen focused command/session/diff tests cover direct-intent validation, state isolation, deterministic exact-path diffs and impact ordering, one-pending-proposal identity, structured impact policy, side-effect-free cancellation, exact acceptance without rerunning reconciliation, invalid reconciled state, save-in-flight edits, and dependency purity.
- The five focused persistence emulator tests remain green for create/read, timestamps, migrated read without a write, explicit-save migration persistence, valid and invalid patches, stale-write preservation, missing documents, and authorization propagation; the other 11 emulator tests continue to cover Firestore and Storage Rules.
- `npm run baseline:data`: all 9 frozen production artifacts matched; WPC-SESSION changed no production game data.
- `git diff --check`: passed.
- The local Firebase review environment was restarted at PID 24476. `/js/core/character-session.js` and `/js/core/character-commands.js` both returned HTTP 200 and exposed the protected session, deterministic impact IDs, and typed command implementations. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
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
