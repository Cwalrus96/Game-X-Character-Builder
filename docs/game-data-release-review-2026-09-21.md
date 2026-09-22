# Schema-v3 release review — September 21, 2026

Status: September 22 compatibility decisions implemented and verified; exact publishing and Hosting approval are pending. The user's deferred personal acceptance is nonblocking.

## Exact candidate

- Run: `20260922T184507461Z-43412`, superseding `20260922T005923417Z-35172` after the static weapon policy correction.
- Canonical Sheet: `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI`, modified `2026-09-22T00:57:44.536Z`; Drive version unavailable. Metadata was checked again before this review and was unchanged.
- Fetched source SHA-256: `6968f1d21d6615937ee48b04831febba645058975a9f5df17bf4244c14d51f00`.
- Combined artifact SHA-256: `0cedfcc8359af9809360277017502b3cf5435cf733b4bcd143288879a1b6e396`.
- Ten artifacts: nine changed existing artifacts plus `traits.json`; zero errors, 254 warnings, successful runtime load. Removing hand-state deferrals accounts for the 48-warning reduction and enables 16 previously deferred records for normal selection. Comparison with the preceding candidate verifies only runtime-support, diagnostics and these derived selectable flags change; authored cells and the normalized model are unchanged.
- 19 classes, 98 feats, 154 Techniques, 60 Traits, 15 Origins, 31 weapon bases and 31 enhancements. Incomplete content remains represented and is not made executable by migration.

The immutable run's `artifact-diff.json` records every structural path and stable-identity difference. Its `export-report.json` contains every file size and hash. The current reviewed production release remains the nine-file schema-v2 release; no generated production bytes changed during this review.

## Existing-character replay

Read-only Firestore capture at `2026-09-22T01:57:33.763Z` found 13 current-path characters and one legacy-path document. No production write occurred. Private source records and exact per-character findings are ignored under `.staging/release-review/`; they are not committed. Snapshot SHA-256: `c17893077695262c87115fa5564d4c05482409999937295e0f0b0e5d42fce9a7`.

After the skill correction and September 22 compatibility changes, replay against the fresh candidate has these outcomes for the 13 captured current-path characters:

| Outcome | Count | Disposition |
| --- | ---: | --- |
| Decodes and reconciles without errors or destructive changes | 8 | Compatible on replay; incomplete informational choices remain permitted. |
| Decodes, with an existing equipment-capacity error | 1 | Two two-handed weapons cost three slots each under the existing four-slot rule. Preserve both; the player must review Equipment. This is not a new format failure. |
| Decodes, with confirmation-required rule/content changes | 3 | One Ninja needs two owned weapons for Dual-Strike, revised rank/enhancement eligibility affects that Ninja and Celestial Knight, and one Weapon Master has an orphaned Barrage Style choice. Hands no longer cause removals. Never apply these changes during read. |
| Requires a player rebuild | 1 | The old Metamorph is explicitly marked `character-rebuild-required`; its stored original remains intact. No guessed Trait conversion. |

The current data fixes several older missing feat-slot grants, including the reported Spirit Warrior scenario. A software bug also charged older stored combat rows for ranks already supplied by grants. Shared Skill Rules now charge only ranks above the grant; this removes the false budget reductions in the replay. User-owned paid overlays survive source removal, with any newly excessive budget reviewed explicitly. Celestial Knight now decodes successfully. Comparison with its published-catalog decode proves that only the obsolete feat-option answer changes during content migration; subsequent equipment impacts are separate proposals.

## Removed stable identities

These are source content changes, not ordinary shape conversions. The following engineering dispositions implement the user's decisions; promotion of the exact candidate remains unapproved. No replacement identity has been guessed from a similar display name.

| Kind | Removed keys | Proposed handling |
| --- | --- | --- |
| Technique | `snap-kick`, `crooked-cobra`, `swiss-army-hands`, `rubber-punch`, `bestial-claw-slash`, `absorb-elements`, `savage-bite`, `elemental-chaos-strike`, `titan-form`, `disguise-makeup`, `distant-whispers` | Retire from new acquisition. The only selected examples in the captured current-path records belong to the old Metamorph, which must be rebuilt. Other unresolved historical references fail explicitly and leave the stored original intact; no automatic deletion or substitution. |
| Feat option | `celestial-knight-melee-weapons`, `celestial-knight-targeting` | Implemented: absorb the single historical child into its selected `celestial-knight-path-initiate` only when the unique current parent grants both skills. The migration report records the original answer, retired key and surviving source. V4, v5 and v6 are covered; no replacement feat is selected. |
| Feat | `summoning-school`, `sparkling-idol-path-initiate`, `sacred-priestex-staff`, `qi-blaster-initiate`, `spirit-manipulator-initiate`, `titan-shifter-path-initiate` | Retire from new acquisition. No selected current-path reference was found in this capture. Any unresolved historical reference still fails closed and preserves the original document for a specific later disposition; no inferred replacement. |
| ClassFeature | `beast-form`, `material-form`, `elemental-form`, `monstrous-mimicry` | User-directed full Metamorph rebuild. The reader gives an actionable message and preserves the original, rather than inferring three new Trait choices from old forms. |
| Weapon profile | All 33 old inline weapon profiles | The accepted authoring migration replaces inline profiles with stable Technique references on weapon bases. Weapon base keys and stored weapon instance IDs remain the identities; no saved character identifies a profile independently. Preserve weapon instances and enhancement selections subject to explicit rule-change review. |

## Accepted September 22 decisions

1. Weapons do not track available hands. Static eligibility checks owned equipment, count, key, tags, reach and rank; authored wielding/separate-hand qualifiers remain gameplay descriptions. Candidate-weapon enhancement scope and inventory slot capacity are unchanged.
2. The old Metamorph must be rebuilt by its player. It receives a clear rebuild diagnostic and is not changed remotely. New Metamorph characters and their Trait choices remain supported.
3. Update Celestial Knight compatibility to its surviving both-skills feature. The conversion is in memory on read and is persisted once on the next successful explicit save. Missing parents or ambiguous/multiple historical answers cannot be silently absorbed.

Metamorph's three Trait choices are implemented. Its prose-only Natural Weapon/Metamorphosis Technique rules and generic Transformation Keystone execution are separate unfinished implementation; unfinished Instinct Techniques stay visible but unavailable. Familiar, Mech and other held subsystem mechanics remain deferred. Do not confuse successful Trait import with completion of those systems.

## Local verification

The complete current website and exact candidate data are served at `http://127.0.0.1:5015/`, using the local Firebase Auth/Firestore emulators. The preview overlays the immutable staged artifacts and does not write under `public/data/game-x`.

A new isolated review character traversed all eight pages and saved/reloaded Metamorph, Web Shooters/Wings/Climber choices, Attributes, Mutation Origin, paid and free Skills, a Rank-0 Kitchen Knife, a Bond, and Origin/Background Keystones. Empty Instinct and normal Technique selections remained savable after the appropriate informational warning. The character sheet displays all acquired Traits with their source and tags. Browser review exposed and repaired the sheet's mistaken treatment of utility keys as display names; Nature and Spirituality now appear at Rank 1 in Core Skills rather than as lowercase Setting Skills.

An Origin-change proposal displayed the source-owned removals. Cancellation restored Mutation and its Traits; acceptance switched to Getaba Warrior, kept the three class-owned Trait choices, and saved/reloaded the reviewed result. Instinct controls are disabled with an explicit incomplete-mechanics explanation rather than inviting a rejected click.

Keyboard verification exposed and repaired lost focus after an Origin proposal disabled its control; both Cancel and Apply now return focus to the Origin selector. A second stale browser tab received the explicit revision-conflict error. Direct emulator verification confirms that the winning text was preserved, followed by restoration of the review character to Mutation; its final document is schema 6/revision 14 with all eight visited steps and all three Trait choices. No production write was used for these checks.

The earlier complete new-character pass finished with 424 unit tests and 18 emulator tests. September 22 verification adds seven unit regressions and two emulator scenarios: final `npm run test:all` passes **431 unit tests, 20 Firebase emulator tests and 14 HTML asset checks**. The nine frozen production artifacts and `git diff --check` also pass.

The full website was restarted at PID `54740` with the new candidate. An isolated copy of the captured Celestial Knight opens on Class without the retired selector, keeps both selected feats, and derives both weapon skills. Cancelling its equipment-impact review leaves the original local document unchanged; a misleading cancellation error was repaired. Accepting the review and incomplete-choice notice saves schema 6/revision 1, reloads successfully, and exactly matches the graph's reviewed state. A direct emulator check proves that the retired Metamorph copy remains unchanged and the previously created new Metamorph still has its three Traits. The old Metamorph's rebuild instruction is visible in the browser. The Celestial Class page has no console warnings/errors; its sheet reports only the expected unavailable portrait in the isolated emulator, whose owner differs from the captured source. Production records were never written.

## Prepared release boundary

The exact ten-file data candidate is paired with a prepared 128-file Hosting package under ignored `.staging/release-review/hosting-candidate-sep22/`. Its manifest SHA-256 is `d955fdd1c22c9b0dc05107f84f308efc77da37e20debcd98800ec7263ea36256`. It copies current website bytes and overlays the staged artifacts, matching the local preview. The draft data approval keeps both approval flags false; it does not replace the checked-in approved release.

Next, obtain approval for this exact candidate and a coordinated Hosting-only release of the matching builder. Publishing data and deploying the website are separate actions; release them together operationally so the new graph never runs against the old grants. No Rules, Functions, manual production character writes or source-cell edits are included. The existing Hosting version remains `d5c9671adee0ab31`. Personal manual testing is follow-up. Existing rule conflicts remain player-reviewed, and incomplete/deferred systems listed above remain explicitly unavailable rather than invented.
