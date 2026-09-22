# Schema-v3 release review — September 21, 2026

Status: engineering review in progress; not approved for publishing or production deployment. The user's deferred personal acceptance is nonblocking.

## Exact candidate

- Run: `20260922T005923417Z-35172`.
- Canonical Sheet: `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI`, modified `2026-09-22T00:57:44.536Z`; Drive version unavailable. Metadata was checked again before this review and was unchanged.
- Fetched source SHA-256: `6968f1d21d6615937ee48b04831febba645058975a9f5df17bf4244c14d51f00`.
- Combined artifact SHA-256: `f64b92f1ac3ffe0d827cc1849227ffc37a182767a1092778841d00bceb7e2b0a`.
- Ten artifacts: nine changed existing artifacts plus `traits.json`; zero errors, 302 warnings, successful runtime load.
- 19 classes, 98 feats, 154 Techniques, 60 Traits, 15 Origins, 31 weapon bases and 31 enhancements. Incomplete content remains represented and is not made executable by migration.

The immutable run's `artifact-diff.json` records every structural path and stable-identity difference. Its `export-report.json` contains every file size and hash. The current reviewed production release remains the nine-file schema-v2 release; no generated production bytes changed during this review.

## Existing-character replay

Read-only Firestore capture at `2026-09-22T01:57:33.763Z` found 13 current-path characters and one legacy-path document. No production write occurred. Private source records and exact per-character findings are ignored under `.staging/release-review/`; they are not committed. Snapshot SHA-256: `c17893077695262c87115fa5564d4c05482409999937295e0f0b0e5d42fce9a7`.

After the skill correction, the candidate has these outcomes for the 13 current-path characters:

| Outcome | Count | Disposition |
| --- | ---: | --- |
| Decodes and reconciles without errors or destructive changes | 8 | Compatible on replay; incomplete informational choices remain permitted. |
| Decodes, with an existing equipment-capacity error | 1 | Two two-handed weapons cost three slots each under the existing four-slot rule. Preserve both; the player must review Equipment. This is not a new format failure. |
| Decodes, with confirmation-required rule/content changes | 2 | Weapon-use prerequisites, changed weapon rank/enhancement eligibility, and one orphaned Barrage Style choice. Never apply these changes during read. Weapon-use policy remains pending below. |
| Cannot yet resolve retired source choices | 2 | One Celestial Knight option and one old Metamorph. Implement explicit historical handling before promotion. |

The current data fixes several older missing feat-slot grants, including the reported Spirit Warrior scenario. A software bug also charged older stored combat rows for ranks already supplied by grants. Shared Skill Rules now charge only ranks above the grant; this removes the false budget reductions in the replay. User-owned paid overlays survive source removal, with any newly excessive budget reviewed explicitly.

## Removed stable identities

These are source content changes, not ordinary schema conversions. The following dispositions are review proposals until compatibility handling and approval are complete. No replacement identity has been guessed from a similar display name.

| Kind | Removed keys | Proposed handling |
| --- | --- | --- |
| Technique | `snap-kick`, `crooked-cobra`, `swiss-army-hands`, `rubber-punch`, `bestial-claw-slash`, `absorb-elements`, `savage-bite`, `elemental-chaos-strike`, `titan-form`, `disguise-makeup`, `distant-whispers` | Retire from new acquisition. Preserve recognized historical selections visibly until explicit replacement; the old Metamorph currently holds three of these. User policy confirmation is pending. |
| Feat option | `celestial-knight-melee-weapons`, `celestial-knight-targeting` | The surviving `celestial-knight-path-initiate` now grants both skills, matching the user's earlier direction. Provide an evidence-backed conversion of the obsolete child choice, retaining its provenance and reporting the change; do not choose a replacement feat. |
| Feat | `summoning-school`, `sparkling-idol-path-initiate`, `sacred-priestex-staff`, `qi-blaster-initiate`, `spirit-manipulator-initiate`, `titan-shifter-path-initiate` | Retire from new acquisition. No selected current-path reference was found in this capture; historical compatibility must still recognize old keys without inventing replacements. |
| ClassFeature | `beast-form`, `material-form`, `elemental-form`, `monstrous-mimicry` | Old Metamorph forms do not determine three new Trait choices. Preserve the old selection for player review; do not infer Traits. Policy confirmation is pending. |
| Weapon profile | All 33 old inline weapon profiles | The accepted authoring migration replaces inline profiles with stable Technique references on weapon bases. Weapon base keys and stored weapon instance IDs remain the identities; no saved character identifies a profile independently. Preserve weapon instances and enhancement selections subject to explicit rule-change review. |

## Decisions still needed

1. Several formal prerequisites require a wielded weapon or separate hands. Saved characters track ownership but not current hands. Proposed static rule: require matching owned equipment for learning; retain wielding/hand details as use-time prose. An alternative is to treat all weapon-use requirements as use-time only. Current behavior remains unchanged pending the user's answer.
2. The old Metamorph has Elemental Form, Elemental Chaos Strike, Rubber Punch and Titan Form. There is no exact mechanical conversion to current Traits. Proposed handling: show the retired selections and let the player explicitly replace them. The alternative is a user-specified conversion. No automatic substitution or deletion is authorized by this review.

Metamorph's three Trait choices are implemented. Its prose-only Natural Weapon/Metamorphosis Technique rules and generic Transformation Keystone execution are separate unfinished implementation; unfinished Instinct Techniques stay visible but unavailable. Familiar, Mech and other held subsystem mechanics remain deferred. Do not confuse successful Trait import with completion of those systems.

## Local verification

The complete current website and exact candidate data are served at `http://127.0.0.1:5015/`, using the local Firebase Auth/Firestore emulators. The preview overlays the immutable staged artifacts and does not write under `public/data/game-x`.

A new isolated review character traversed all eight pages and saved/reloaded Metamorph, Web Shooters/Wings/Climber choices, Attributes, Mutation Origin, paid and free Skills, a Rank-0 Kitchen Knife, a Bond, and Origin/Background Keystones. Empty Instinct and normal Technique selections remained savable after the appropriate informational warning. The character sheet displays all acquired Traits with their source and tags. Browser review exposed and repaired the sheet's mistaken treatment of utility keys as display names; Nature and Spirituality now appear at Rank 1 in Core Skills rather than as lowercase Setting Skills.

An Origin-change proposal displayed the source-owned removals. Cancellation restored Mutation and its Traits; acceptance switched to Getaba Warrior, kept the three class-owned Trait choices, and saved/reloaded the reviewed result. Instinct controls are disabled with an explicit incomplete-mechanics explanation rather than inviting a rejected click.

Keyboard verification exposed and repaired lost focus after an Origin proposal disabled its control; both Cancel and Apply now return focus to the Origin selector. A second stale browser tab received the explicit revision-conflict error. Direct emulator verification confirms that the winning text was preserved, followed by restoration of the review character to Mutation; its final document is schema 6/revision 14 with all eight visited steps and all three Trait choices. No production write was used for these checks.

Final `npm run test:all` passes 424 unit tests, 18 Firebase emulator tests and 14 HTML asset checks. The nine frozen production artifacts and `git diff --check` also pass. The local candidate website was restarted at PID `48900` and the final sheet reloaded with no console warnings/errors. Production still has only the previously deployed Class-page hotfix, version `d5c9671adee0ab31`.
