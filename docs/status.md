# Current implementation status

Last updated: 2026-09-19

Current branch at update: `codex/work-package-b-data-contract`

Active implementation work package: Work Package E — vertical domain migration

Next implementation step: `WPE-DOMAIN-MIGRATION`

Parallel blocked character step: deployed-page completion of `WPC-REPOSITORY`, pending affected Work Package E domain integration; the reviewed stable-technique-key data prerequisite is now satisfied

Parallel game-data step: Work Package B is complete through the prior `WPB-PUBLISH`; the 2026-09-18 source/handbook updates are unpublished, with live-source compatibility findings to resolve before a new release candidate

This is the only frequently updated project-status document. Historical audits and completion records must not be edited to look current.

## Checkpoint

- `master` ends at `42bfb99` (`Update Architecture to be more Module`).
- Milestone 0 stabilization is committed at `7d4fc6e`.
- The initial Work Package B baseline is committed at `637c06f`.
- `WPB-SOURCE-SYNC` is the checkpoint commit immediately after `637c06f`, titled `Document handoff architecture and automate source acquisition`.
- The current Work Package B release promotes approved schema-v2 candidate `20260809T022801911Z-51956`, adds the exact-byte publisher, and records transactional rollback.
- The `WPB-PUBLISH` checkpoint is `ea4e373`, titled `Publish reviewed schema-v2 game data`.
- `WPC-MIGRATIONS` is committed at `5568aa5`, titled `Add isolated character migration registry`.
- The `WPC-REPOSITORY` checkpoint is `44ada92`, titled `Implement definitive character persistence boundary`; it strengthens the existing database reader/writer rather than adding a duplicate repository implementation.
- The current Work Package C session checkpoint is `WPC-SESSION`, titled `Add canonical character session lifecycle`; it remains pure and does not switch deployed pages.
- The current Work Package D graph checkpoint is `WPD-GRAPH-CORE`, titled `Add deterministic character graph core`; it remains fixture-integrated and does not switch deployed pages or publish data.
- The current Work Package E implementation checkpoint is `d035a40`, titled `Migrate builder domains to character session graph`; focused signed-in acceptance remains deferred, so this commit does not remove compatibility paths or deploy production.
- The earlier 2026-09-18 handbook formatting repair cleared linked-table formatting overrides using **Match spreadsheet data and formatting**. All 85 then-existing techniques followed the display Sheet's rich-text title/access/body formatting. Three subsequent ordinary refreshes, including paragraph-count changes, passed; source values, formats, and rich-text runs were restored exactly.
- The later 2026-09-18 operational checkpoint migrated 12 complete handbook techniques into canonical source, preserved 16 editorial weapon records in `TechniqueDrafts`, linked the Rank 0 and new technique excerpts, and repaired feat display imports and native handbook links. The catalogue now contains 97 techniques; verified feat tables contain 19 class feats and 43 archetype memberships. The workflow is recorded in [data-pipeline.md](data-pipeline.md#handbook-display-and-linked-table-formatting). No application code or production data changed; the active Work Package E acceptance boundary is unchanged.
- The 2026-09-19 follow-up removed imported minimum row heights and redundant archetype prerequisite lines, normalized stray grant prefixes, and repaired accidental list/formatting overrides in linked handbook tables. The ordinary-refresh regression and final handbook audit passed: all 62 feat/archetype entries match display text and bold styling, and all 21 relevant tables have zero positive row minima. This changes display/handbook formatting only; the canonical source and active Work Package E boundary are unchanged.
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

### Work Package E domain migration

- `WPE-DOMAIN-MIGRATION` is active at its browser-acceptance boundary. Automated local-review slices cover the class page's class, level, primary attribute, class options, feats, feat options, and source-owned grant answers; normal techniques; ordinary/source-owned equipment; all six Attributes; Origin selection/Keystone text/Origin feature sources; fixed, custom, class-utility, defense, and granted Skills; and ordinary/source-owned Bonds plus Bond/Background Keystones.
- Those controls now submit narrow typed commands to `CharacterSessionPage`; `CharacterSession` protects proposal/cancellation/acceptance state; the one graph facade owns prerequisite, capacity, orphan removal, generated weapon/resource/Bond state, derived abilities, and granted-skill reconciliation.
- The migrated pages read and replace exact schema-v5 characters through the definitive revision-aware database reader/writer. `VisitBuilderStep` records navigation state through the session rather than a separate Firebase patch. Equipment no longer holds a mutable `currentWeapons` page model; Attributes no longer owns DOM-derived character state or point pruning; and Origin/Skills no longer build broad patches, call the transitional dependency refresher, or calculate selection/capacity rules inside their pages.
- Portable widgets still own DOM, accessibility, and interaction behavior. They do not import Firebase or persistence modules and do not own a second character model. Page-level prerequisite/capacity checks are presentation hints from shared pure Rules; enforcement and dependency removal remain graph-owned.
- The graph accepts the published stable-key contract, including underscore-bearing weapon keys. Regression tests reconcile every selectable class and every selectable weapon base against the published combined runtime artifact.
- Equipment commands address stable weapon/enhancement identities and cannot edit ownership fields. Graph nodes own weapon/enhancement references, rank and compatibility rules, four-slot weapon capacity, enhancement capacity, generated-weapon synchronization/tamper rejection, incomplete enhancement answers, and confirmed dependent rank/removal effects.
- `SetAttributeValue` addresses one recognized attribute key and integer value. The shared pure `getAttributeAllocationState` Rules projection is the single source for point capacity/usage/remaining, primary minimums, level caps, and currently assignable maxima consumed by both graph compilation and widget presentation; deterministic over-budget fitting also remains in Rules. Graph fact nodes retain exact scalar bindings, destructive adjustments require review, and unspent points remain informational.
- `SetOrigin`, `SetOriginKeystone`, `SetClassUtilitySkills`, `SetSkillRank`, `SetCombatSkills`, and `SetSettingSkills` express only direct Origin/Skills intent. `selection-rules.js` now owns normal/granted-only/draft eligibility and `getOriginSelectionState` applies it to Origins. `skill-rules.js` is now the sole home of skill progression breakpoints, grant-derived ranks, utility-choice capacity, cap bonuses, level rank caps, point capacity/usage/remaining, assignable maxima, and deterministic cap/budget fitting; the duplicate mechanics formerly in `game-data.js` and the Skills page were removed.
- Origin and skill graph nodes retain source ownership and exact scalar/named-collection bindings. Origin features compile as active graph sources, their grants flow through the existing registries, source-owned ability removal is reviewed, unavailable Origins and excess class utility choices reconcile deterministically, and destructive rank fitting requires confirmation. Unspent points and incomplete Origin/Keystone/utility selections remain informational.
- `AddBond`, `RemoveBond`, `UpdateBond`, and `SetBackgroundKeystones` express exact direct intent. `bond-rules.js` is the sole source for Heart-based user capacity, level rank caps, two Background Keystone slots, source-owned exclusions, and deterministic repair used by both graph and widget.
- The graph compiles stable Bond/Keystone identities and materializes the published Artifact Rank 2 and Patron Rank 1 Bonds as source-owned additions outside Heart capacity. Source ranks and removal stay owned by the grant; relationship name and Keystone remain editable. Removing the source reviews both the Bond and derived ability, and cancellation is side-effect free.
- Existing ordinary Bonds are never guessed to be an Artifact/Patron grant answer because v5 has no historical ownership evidence for that inference. A character that previously entered the same relationship manually may temporarily show both records; the ordinary record remains user-owned and removable, while the generated record carries the source binding.
- The Boon extensibility proof adds an isolated Rules adapter, automatic node/grant extension, portable widget, and generic widget registry. Existing page controllers and graph traversal contain no Boon branch; no selectable Boon content or new persisted field was invented without a source contract.
- JavaScript responses require cache revalidation, and all seven migrated HTML entry points use a migration version on their module roots so returning browsers cannot combine cached pre-migration dependencies with the new graph/session path.
- Focused browser-independent acceptance is green. The user resumed signed-in browser acceptance on 2026-08-30. Loading historical character `oQvPBy4LCN6GxGYEGvKR` on the Class page initially failed exact-v5 decoding; the local fix now recognizes prior account-import bookkeeping, rebinds the Dazzling Wand option/answer to reviewed stable identities, and displays Prismatic Burst as selected. The subsequent save attempt correctly remained unsaved but exposed duplicate `autoAbilityNames` output for the two distinct Magical Guardian Feat sources. Graph reconciliation now deduplicates only that non-identity display snapshot while preserving both stable ability records. The raw emulator document remains unchanged until an explicit save. Remaining Class/Feat/Technique and other domain scenarios—including the successful explicit save/reload, destructive confirmation/cancellation, conflict messaging, and console checks—are still pending; no compatibility path was removed.

## Canonical external source

| Property | Current value |
|---|---|
| Source Sheet | [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit) |
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Published release Drive version | `647` |
| Published release Drive modified time | `2026-08-09T02:27:03.310Z` |
| Current source checkpoint | 2026-09-18 handbook migration; 97 techniques, newer than the published release |
| Source schema | `4` |
| Grant syntax | `2` |
| Prerequisite syntax | `2` |
| Display Sheet | [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit) |

The repository's old `data/game-x-class-data.xlsx` is a June 29 snapshot and is not authoritative. Use `npm run fetch:data` to acquire a fresh ignored snapshot.

## Current boundaries

- Production JSON is the reviewed schema-v2 release from canonical Drive version `647`, exact-hash baselined across nine runtime artifacts.
- The staging CLI uses the canonical reader -> adapter -> validator -> schema-v2 builder -> runtime acceptance -> diff pipeline. It never invokes the legacy exporter or publisher.
- The generic exporter remains frozen. Only `npm run publish:data -- --confirm <approved-run-id>` may promote an exact separately approved staging run.
- Character schema v5, its migration registry, the definitive Firebase reader/writer APIs, the pure four-state session lifecycle, and the deterministic graph compiler/fixed-point reconciler are implemented and tested. Every local-review builder domain uses them; production cutover and transitional-code removal remain blocked on deferred focused acceptance.
- Runtime stable technique keys are available. The remaining Work Package E gate is behavioral browser acceptance, not domain implementation or data identity.
- Familiar, vehicle, and gadget expressions are preserved with explicit runtime-stub status until their future subsystem slices; they are no longer rejected or discarded by data loading.
- The graph core requires normalized runtime artifact schema 2, which is now published, but remains fixture-integrated until the corresponding Work Package E page/domain slice authorizes a deployed-page cutover.
- During the earlier spreadsheet-normalization checkpoint, the Handbook remained untouched because its bound import script was inaccessible. The 2026-09-18 work subsequently regenerated native display outputs and updated the handbook's linked tables; that historical restriction no longer describes the current handbook.

## Deferred acceptance and blockers

### Manual acceptance debt

- Manual browser scenarios in [work-package-a-completion.md](work-package-a-completion.md) remain pending: destructive reconciliation, capacity changes, source-owned choices/weapons, dialog focus, dirty navigation, unload prompt, save retry, and two-tab isolation.
- On 2026-08-05 the user explicitly overrode this gate for a production Firebase Hosting deployment of the current committed `public/` tree. This override does not authorize game-data publishing, Firebase Rules/Functions deployment, or removal of the outstanding acceptance debt.

### Production data publishing

- No publishing blocker remains for candidate `20260809T022801911Z-51956`; it was approved and promoted through the exact-byte publisher.
- The current live source has pre-existing compatibility findings: `Feats` column order differs from the runtime adapter contract, archetype DSL is unsupported by the current registry, and `ArchetypeFeats` has no runtime adapter. These findings block preparation of a new publishable candidate; the handbook display repair does not resolve them. They were identified by source/code inspection, not a new live staging run.
- Future source changes require a new immutable run, zero-error validation, complete semantic diff review, an exact release contract, and separate publish approval. The generic production export freeze remains active.

### Automated source acquisition

- `WPB-SOURCE-ACCESS` completed on 2026-08-08 with `game-x-sheet-exporter@game-x-character-builder.iam.gserviceaccount.com` shared as Viewer on only the canonical Sheet.
- Local user ADC impersonates that identity; the repository requests a 15-minute Drive-read-only target token.
- No persistent service-account key was created and no credential file exists under the repository.
- Set `GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT` to the service-account email in each acquisition shell before running the documented commands.

See [data-pipeline.md](data-pipeline.md) for exact commands and security guidance.

## Last verification

Handbook spacing and duplicate-prerequisite follow-up on 2026-09-19:

- Preflight passed on Node.js `v22.22.1`: all 238 unit tests, nine frozen artifacts, and 14 HTML files passed. The starting worktree was clean at `80c34de` (`Document linked handbook feat and technique migration`).
- Range expansion had added positive row-height minima to new rows while original rows retained zero minima. All 51 affected rows across nine tables were reset in bulk; the largest minimum was 982.5 points for a short Dark Witch entry. All 21 relevant tables currently have zero minima after ten affected native refreshes and source-format matching.
- Nine display formula anchors (`_Feats!A1`, `Feats_Display!A2`, and `Archetypes_Display!A1:G1`) now resolve referenced prerequisite groups, suppress only matching duplicate metadata, and normalize stray single-line grant prefixes. A native pilot verified 62 records with zero errors: exactly 19 intended text changes (seven duplicate lines and 12 grant prefixes), with the other 43 unchanged apart from concurrent user edits to Ghostwalker and Warden Soul, which were preserved.
- Accidental native bullets were removed from 118 paragraphs in 12 feat cells and their indentation reset to zero. The two Celestial Knight literal choice bullets and 109 other native bullet paragraphs were preserved. An ordinary refresh initially made those 12 cells entirely bold through inherited Docs overrides; **Match spreadsheet data and formatting** cleared those overrides.
- The controlled Weaponsmith ordinary-refresh regression added one temporary newline before Grants, preserving bold title, regular body, no native bullets, and zero row minimum. Exact restoration of the Sheet value, format, and rich-text runs passed JSON equality and was applied with ordinary **Update Table**. Native visual review confirmed correct typography and a compact row. Evidence: `.staging/handbook-compact-2026-09-19/refresh-regression.json`.
- The final handbook audit passed: all 62 feat/archetype entries match current formatted display text and every non-whitespace character's bold flag; all titles are bold and the 12 affected bodies are regular. Those 12 cells have no native bullets, while the other 109 native bullet paragraphs retain exact text and bullet metadata and both Celestial Knight literal choice bullets remain. All 21 relevant feat/technique tables have zero positive row minima, including the nine repaired tables. Evidence: `.staging/handbook-compact-2026-09-19/final-handbook-qa.json`, including the source snapshot hash and final document revision. No canonical source edit, runtime publish, application change, or deployment was performed; `WPE-DOMAIN-MIGRATION` remains the next application step.

Source/handbook migration and display repair on 2026-09-18:

- Preflight passed on Node.js `v22.22.1`: `npm test` ran 238 tests with zero failures; `npm run baseline:data` matched all nine frozen artifacts; `npm run validate:assets` passed all 14 HTML files.
- The 12 prepared technique rows passed the source adapter and model validator with zero diagnostics in a fixture-backed check. An additional editorial `TechniqueDrafts` tab left the runtime technique count unchanged. A blank rank on an actual runtime draft technique was separately confirmed to fail validation, so unknown ranks were preserved editorially rather than invented.
- Canonical `Techniques!A87:AI98` now contains the 12 authored additions. A final read compared every field of the original 85 records: all 2,975 comparisons matched. The 97-record source snapshot SHA-256 is `5ea33fb1f2104f3a8d535a4938d3912307de0199d52adc4966ac2a375aefd6a9`; the source modified time is `2026-09-18T20:17:38.284Z`. The connector did not expose the current Drive version.
- Independent handbook verification matched all 97 catalogue rows to display text after whitespace normalization, with bold titles and zero bold body characters. All 31 new helper rows (three Rank 0, 12 migrated techniques, 16 editorial entries) also matched their display outputs with the intended title/body styling. The catalogue retained its 468-point width within the stored 6.5-inch content area.
- The repaired feat pipeline and refreshed native links matched all 62 handbook rows: 19 class feats, including the migrated Fairy Transformation, and 43 archetype memberships. Titles were bold and body text nonbold; membership consistency was verified.
- Local evidence is retained under `.staging/technique-migration-2026-09-18/`, including source snapshots, exact migration plans, and handbook checks. No live staging run, runtime publish, application change, or deployment was performed. Live-source publishing findings above remain unresolved; `WPE-DOMAIN-MIGRATION` remains the next application step.

Work Package E historical-character acceptance repair verification on 2026-08-30:

- Signed-in local browser verification loaded historical character `oQvPBy4LCN6GxGYEGvKR` at the Class page with no visible error. Magical Guardian, level 5, Attunement, Dazzling Wand, and its source-owned Prismatic Burst technique were restored; the picker value is the canonical `prismatic-burst` key.
- The raw Firestore emulator document was not changed. Exact replay through the reader's migration/reference path returned schema v5 with zero diagnostics and revision 0, while preserving both identity-bearing Magical Guardian Feat ability records.
- Focused migration, persistence, session-page, and graph verification passed 55/55 tests. `npm run test:all` passed 226 unit tests, 16 Firebase emulator Rules/persistence tests, and all 14 HTML entry points. `npm run baseline:data` matched all nine frozen artifacts, and `git diff --check` passed.
- The local Firebase review environment was restarted at PID `30140`, the user was signed back into the local emulator, and the same historical Class-page state was reverified after restart. The imported raw emulator record remains schema v4 with no revision, proving that page load did not write the in-memory migration. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- The first explicit save attempt remained unsaved because reconciliation emitted the shared display label `Class Feature - Magical Guardian Feat` twice into the duplicate-free compatibility snapshot. The repaired reconciler emits that display label once but retains two source-owned ability records with distinct `abilityId` and `sourceId` values. A signed-in same-class command exercised the repaired reconciliation without writing; the visible error cleared and the raw emulator document remained schema v4 with no revision.
- The same-name derived-ability regression is idempotent and passed within the full `npm run test:all` gate: 227 unit tests, 16 Firebase emulator Rules/persistence tests, and all 14 HTML entry points passed. `npm run baseline:data` again matched all nine frozen artifacts, and `git diff --check` passed.
- The next save preview exposed an unfinished boundary rather than a malformed character: typed `feat` grants were preserved as deferred effects while both the Class page and graph compiler separately manufactured slots from `floor(level / 2)`. The user rejected duplicate automatic plus feature-granted capacity and approved explicit feat-granting features as the only source of feat choices.
- `feat-rules.js` now centrally materializes explicit slots from active typed grants, applies type/category/max-level filters, and deterministically assigns the existing ordered `selectedFeats` keys without a storage migration. The graph registers real `feat` grant and `feat-slot` nodes, each selected feat is owned by its matched slot, and removing a granting source requires confirmation. The portable widget imports the same projection; the page and legacy compatibility graph no longer contain a level-derived feat-slot formula. The prior deferred-domain message is no longer emitted for `feat` grants.
- The explicit-feat regression and architecture gates passed within `npm run test:all`: 232 unit tests, 16 Firebase emulator Rules/persistence tests, and all 14 HTML entry points passed. `npm run baseline:data` matched all nine frozen artifacts and `git diff --check` passed.
- The local review environment was restarted at PID `2480`. Signed-in browser verification reloaded historical character `oQvPBy4LCN6GxGYEGvKR` with no visible error, preserved Dazzling Wand/Prismatic Burst, and displayed `Explicit feat choices: 0/3` at Magical Guardian level 5: two class slots and one archetype slot from the three active published feature grants. No Save button was clicked and no character write was attempted at that checkpoint. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Informational save notices now use centralized exact field ownership for the current builder page. They do not depend on visit history and cannot surface incomplete choices from other pages; blocking structural errors and confirmation-required consequences remain unfiltered. All seven migrated page entry points use this presentation boundary.
- The warning-scope regression passed within `npm run test:all`: 235 unit tests, 16 Firebase emulator Rules/persistence tests, and all 14 HTML entry points passed. `npm run baseline:data` matched all nine frozen artifacts and `git diff --check` passed.
- The local review environment was restarted at PID `33416`. Signed-in browser verification opened the Attributes save preview for historical character `oQvPBy4LCN6GxGYEGvKR`; it listed only `24 attribute points are still unspent.` and omitted the character's incomplete Origin, class feat, archetype feat, source-owned answer, technique, skill, Bond, and Keystone notices. The dialog was cancelled and the page reloaded, so no explicit character save was performed. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Skills/Bonds browser acceptance exposed two responsibility bugs. Class utility grants were treated as locked final Rank 1 values and reconciliation erased stored ranks for the same fields; widget command-busy code also disabled every control under the page main, capturing page-owned Save actions and leaving both Background Keystone inputs disabled after blur.
- Shared Skill Rules now treat a class utility grant as a free minimum rank. Core and named setting utility skills remain editable through the ordinary cap, charge only ranks above the grant, omit a paid overlay at the free floor, preserve higher paid ranks when the grant changes, and cannot be budget-repaired below the granted rank. Skills and Bonds widgets now disable only controls they own.
- Signed-in browser verification used historical character `oQvPBy4LCN6GxGYEGvKR`. Moving Academics from Rank 3 to 2 freed one point, Medicine then increased from its free Rank 1 to paid Rank 2, and Save remained enabled. On Bonds, blurring Background Keystone 1 preserved `keystone 1`, left both Keystone inputs and both Save actions enabled, and retained the unsaved granted-Bond Keystone text `Test`. The corrected Bonds tab remains open with those two unsaved values; no Save action or character write was performed.
- The final regression gate passed: `npm run test:all` ran 238 unit tests, 16 Firebase emulator Rules/persistence tests, and all 14 HTML entry points with zero failures. `npm run baseline:data` matched all nine frozen artifacts and `git diff --check` passed. The local review environment was restarted at PID `29792`; App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Scope remains within the current top Work Package E feature commit. No production data, canonical Sheet cell, Firebase document, Rule, Function, or production Hosting target changed.

Prior Work Package E all-domain automated verification on 2026-08-12:

- `npm run test:all`: 223 unit tests, 16 Firebase emulator Rules tests, and all 14 HTML entry points passed with zero failures.
- The published-data regression reconciles every selectable class, every selectable weapon base, valid exact-budget attribute allocations at all 12 supported levels, and canonical Artifact/Patron Bond grants against `public/data/game-x/game-x-data.json`. Focused tests cover exact Bond/Keystone commands, centralized Rules, stable graph bindings, source ownership, deterministic caps/repair, derived ability removal, fixed-point idempotence, cancellation, page/widget/persistence independence, and Boon extension without page/traversal branches.
- `npm run baseline:data`: all nine frozen production artifacts matched. `git diff --check` passed.
- The local Firebase review environment was restarted and is running at PID `16516`. The Bonds/Keystones HTML, migrated page, portable widget, Bond Rules, and Boon graph/widget adapters all returned HTTP 200. App: `http://127.0.0.1:5000`; Emulator UI: `http://127.0.0.1:4000`.
- Browser testing previously exposed a mixed-version cached ES-module graph on the first returning-user load. JavaScript revalidation headers and versioned migrated entry modules remain in place. Manual acceptance is recorded as deferred and must not be prompted again until the user reports availability.
- Checkpoint scope is committed in the current top feature commit. No production data, canonical Sheet cell, Firebase document, Rule, Function, or production Hosting target changed.

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
