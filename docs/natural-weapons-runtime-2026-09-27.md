# Natural weapon grants — runtime follow-up

This bounded `WPE-DOMAIN-MIGRATION` follow-up implements the [September 26 source authoring](natural-weapons-source-2026-09-26.md). The existing Trait projection and reviewed character commands now supply actual weapon instances, eligible learned Techniques and optional skill substitutions. It does not complete the broader domain migration.

## Implemented behavior

- Fixed Trait `weapon` grants derive distinct weapons from their stable provider, grant, base and instance. Crushing Limbs supplies two weapons. Provider rank/skill, explicit tags, supported rank-based Reach and linked automatic attacks carry through. No new character fields, equipment purchases, Enhancement capacity or inventory slots are created.
- `technique | access=... | weaponTag=...` adds an ordinary paid acquisition route. Its matching weapons must satisfy all formal weapon requirements; an unrelated carried weapon cannot complete the tag combination. The grant creates neither a free answer nor training.
- Separate `skill-substitution | fromSkill=... | toSkill=...` grants supply alternative roll/scaling contexts. Only explicit added access uses the destination rank for acquisition. Native skill routes retain their rank checks, and the Martial Arts substitution alone never grants higher-rank Techniques. Displays show the strongest qualifying context and retain alternatives.
- The same Rules feed the graph, Techniques page, granted-Technique display and character sheet. Equipment and the sheet share read-only cards for Trait weapons. Editing the provider reviews weapon loss/rank reductions and dependent learned Techniques through the existing confirmation flow; cancellation changes nothing.
- Natural bases remain out of ordinary weapon selectors and the handbook Weapons catalogue. Body-level tags stay separate. Elemental Blaster, Integrated Weapon and Poisonous Skin retain the previously recorded exceptions; no missing mechanics were invented.
- Updated builder module imports consistently share the navigation guard and current dependency review. This avoids loading an older confirmation export and prevents multiple versioned copies of the guard from disagreeing about saved state.

## Source and local installation

The canonical Drive file is `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI`. Read-only metadata confirmed modification time `2026-09-26T18:54:14.114Z`; Drive version was unavailable. The unchanged snapshot SHA-256 is `d51abb8b0054d0ae64fb862da192ce8140ca27029e8c4b8b15ac9def75df9d9b`. Snapshot and provenance remain at `.staging/natural-weapons-source-2026-09-26/`.

Run `20260927T143700456Z-36832` produces ten complete artifacts with **0 errors / 114 warnings** and successful runtime loading. The eight authored Natural bases and Metamorphosis Techniques feature are supported. Unknown Reach expressions and other unfinished mechanics remain explicit warnings/deferred records. The generated candidate is installed only in ignored `public/local-review/`, selected on loopback; no generated production file or canonical Sheet cell was edited.

## Verification

Preflight passed 537 unit tests, the ten-artifact production baseline and asset checks. Controlled runtime fixtures cover ownership/count/rank, body-versus-weapon tags, scoped weapon prerequisites, ordinary capacity, native versus added access, skill substitution, dynamic Reach, inactive parents, graph evidence, cancellation/acceptance, idempotence and persistence without stored derived weapons. Source fixtures cover supported and unknown Reach equations.

Authenticated browser review uses disposable character `D87pCwT3H8XmhInZALx6` at `http://localhost:5000`. Crushing Limbs exposes Devastating Blow and Dual-Strike at Metamorphosis Rank 1; both save in normal slots. Replacing it with Web Shooters reviews their removal and both weapon instances. Cancel restores Crushing Limbs; acceptance removes the dependent selections. Web Shooters exposes Web Area, Piercing Shot and Slowing Shot, grants Shoot Web automatically, and uses Metamorphosis. Web Area saves and appears with the weapon and its full attack rules on the character sheet. Readback confirms only `web-area` is learned, no derived weapon was stored, and the original character's revision/content are unchanged. The sheet reports no console errors.

Final test, asset, baseline and isolated-change results are recorded in [status.md](status.md). Equipment additionally verifies one read-only Web Shooters weapon, zero used slots, no Natural bases in the purchase selector and its complete attack text. The final reverse-change dialog names `Technique: Web Area` and `Weapon: Web Shooters`; cancellation retains the saved Web build. Screenshot: `.staging/natural-runtime-confirmation.png`. Logs and disposable-character evidence are ignored under `.staging/natural-runtime-*`.

## Remaining boundaries

The local website and complete local candidate are available for testing. Publishing the data candidate and deploying to production require explicit instructions and a complete release-impact review. Existing unrelated instruction-consistency edits remain separate. Remaining `WPE-DOMAIN-MIGRATION` acceptance and compatibility cleanup precede `WPF-UI-SYSTEM`, which consolidates shared controls, accessibility and navigation. This feature does not authorize or complete held Familiar/Mech systems or broader incomplete class mechanics.
