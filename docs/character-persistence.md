# Character persistence contract

Repeatable Trait child choices use the existing schema-6 `builder.grantChoices` record with `type: "trait-option"`, instance-owned `sourceId` and stable-key `value`. The answer identity includes acquisition instance, Trait definition and option slot, so replacing one instance cannot reuse another's children. Ordinary revision-aware saves persist the answers; derived weapons and Techniques remain projections. No schema bump or read-time write is needed. Missing historical answers remain incomplete rather than being guessed. See [the repeatable Trait contract](repeatable-traits-2026-09-29.md).

Source-qualified choice exports include exact old-ID/owner/new-ID aliases. CharacterMigrations applies those content bindings in memory after shape migration, including existing schema-6 characters. Saved answers must match their recorded owner; ambiguous ownership and occupied destination keys fail without overwriting either answer. Generated weapons keep their IDs, ranks, enhancements and names while their choice references follow the proved answer. Loading remains read-only, the normal explicit save persists the conversion, and reload is idempotent. No character schema version changes. Historical catalogues without the binding marker retain the previous behavior. See [the choice identity record](source-choice-identity-2026-09-29.md).

Feature Keystones add a `type: "keystone"` variant to the existing schema-v6 `builder.grantChoices` envelope. Its `value` is nonempty canonical text of at most 400 characters; other answer types retain stable-key validation. Existing fields, versions and historical values are unchanged, so no stored-shape migration or read-time write is needed. Source/slot identity remains separate from prose, and the standard codec, session snapshot and revision-aware writer own the complete round trip. Ordinary Origin/Background/Bond Keystones keep their existing storage bindings.

This document defines the page-facing Firebase boundary for saved characters. The existing `public/js/core/database-reader.js` and `public/js/core/database-writer.js` modules are the two halves of that single boundary. Do not add a parallel `CharacterRepository` implementation or let pages call Firestore directly for normal character persistence.

`public/js/core/character-persistence.js` contains the shared, Firebase-free rules used by both halves: envelope decoding/encoding, metadata separation, patch ownership, revision comparison, and structured persistence errors. It is an internal contract, not a competing page-facing repository.

## Read contract

`readCharacter` and `observeCharacters` perform this pipeline:

```text
raw Firestore document -> CharacterMigrations -> CharacterCodec -> exact v6 state + metadata
```

Recognized historical documents migrate only in memory. A read never writes the migrated result to Firebase. Invalid, unresolved, future-version, owner-mismatched, or malformed documents fail with structured diagnostics instead of being defaulted or sanitized.

Known v4 account-import envelopes are supported, including their obsolete import timestamps, duplicate derived ability-name snapshots, and source-owned class-option answers whose old display/composite identities can be proven against reviewed game data. Identity-bearing repeated records are preserved. The reader still fails closed for unknown fields, ambiguous owners, or references that cannot be proven.

The live-record repair also covers old `rank_*` skill snapshot identities, obsolete merged selection aliases, nested update timestamps, composite feat-option labels, and source-less automatic choices when reviewed grant ownership is unique and active. These conversions stay in CharacterMigrations. Loading remains read-only; an explicit save writes the canonical result once, and a subsequent v6 read does not reapply migration. The synthetic emulator regression verifies complete state preservation and stale revision rejection for this observed envelope.

Schema 6 adds `builder.traitChoices` and the compatibility `builder.traitActivations` map. Reading schema 5 adds empty maps in memory while preserving every previous field and persistence revision; it creates no Trait selection. The accepted static Trait model uses only source-owned choices. Existing activation records and recipient bindings remain structurally supported and are preserved, but Rules ignore activation values and current widgets never write them. This correction needs no new schema version or destructive migration. The explicit save uses the same transaction/revision boundary. Trait maps are builder-owned, and sheet autosave cannot write them. Firebase Rules authorize owner/GM access independently of character schema and require no change for this format addition.

The returned canonical character contains only `schemaVersion`, `ownerUid`, and `builder`. `createdAt`, `updatedAt`, historical `lastVisitedAt`, and `revision` are returned separately as persistence metadata.

## Reviewed content changes

Stored shape versions and game-content revisions are independent. `character-content-migrations.js` is a pure internal operation of CharacterMigrations, called once when a historical document reaches the v4 builder boundary or when an existing v5/v6 document opens. It uses a policy derived from the loaded catalog; it does not introduce another persistence boundary or a new character schema.

The September 22 Celestial Knight conversion recognizes only the reviewed stable child keys and historical composite answers. It absorbs the obsolete either/or answer into the same selected `celestial-knight-path-initiate` feat only when that unique current feature grants both Melee Weapons and Ranged Weapons at Rank 1 with slow progression. A missing parent, multiple historical answers, a still-present old option, a recipient-only grant, or insufficient replacement evidence cannot trigger absorption. The original answer, retired key and surviving source key remain in the returned migration report. Unrelated selections and player state are preserved. Current-schema characters can therefore report `migrated: true` for this content conversion even without a schema-version change.

Old Metamorph characters require a player rebuild under the user's September 22 decision. When the new Trait provider is present, pre-v6 Metamorph documents or canonical characters retaining reviewed retired form/Technique keys return `character-rebuild-required`. The reader displays a clear instruction to create a new character; it leaves the original stored document intact and never infers Trait selections. New schema-v6 Metamorph characters remain supported. Other unknown references retain their ordinary unresolved diagnostics.

Both dispositions are read-only. Celestial Knight persists the conversion on the next successful explicit save, and a subsequent read is idempotent. Rule changes to weapon ranks, enhancements or other selections remain graph proposals requiring the usual review; content migration never applies them. Authenticated emulator tests cover v4/v6 first-save conversion, full reload, revision conflicts and preservation of the old Metamorph document after failed reads/patches.

## Ranged Weapons naming compatibility

Ranged Weapons is the current display name and `ranged-weapons` is its current skill key. The pure `skill-identity.js` boundary recognizes the former Targeting label and `targeting` key when Rules and UI consume existing saved state or reviewed older game data. This naming compatibility does not alter saved skill identities or trigger a Firebase write on read.

- Historical reference indexes resolve the old label/key to `ranged-weapons`. Current answers may retain their stored `targeting` skill key; consumers accept that alias, and newly authored technique-choice patches use the current key.
- Existing `combatSkillsExtra` rows retain their stored name and rank until an explicit edit/save changes them. Projections display Ranged Weapons and apply the same effective rank to weapon caps, techniques, and prerequisites; the rename must not remove a trained rank or a selected technique.
- Only the exact `targeting` persisted skill key is remapped. Comparison normalization is separate from storage identity: `custom_skill`, `custom-skill`, and other unrelated keys remain distinct and unchanged in migrations, snapshots, and choice patches.
- Feature, feat, weapon, and enhancement keys are unchanged. Explicit choice IDs are unchanged. For an existing choice whose ID is derived from its granting skill, `choice-identity.js` retains the historical `targeting` token and accepts historical display-case aliases, preserving the selected answer and its generated weapon owner.

Compatibility projections do not alter the reviewed JSON artifacts. They also do not rename separate aiming concepts such as Enhanced Targeting. The regression coverage in `tests/skill-identity.test.mjs` proves rank preservation, retained source-owned Rifle answers, historical reference resolution, and preservation of unrelated skill keys.

## Write contract

The writer exposes narrow operations:

- `createCharacter` writes a complete codec-accepted v6 document at revision 1;
- `replaceCharacter` writes a complete codec-accepted v6 replacement;
- `patchCharacter` applies only an explicit builder or character-sheet owned patch to the latest value read inside its transaction;
- `deleteCharacter` deletes only the exact revision the caller reviewed.

Every successful canonical create or save writes schema version 6 and server-managed `createdAt`/`updatedAt` metadata. A historical document is therefore written back as v6 only when an explicit user save succeeds. Failed validation, failed authorization, cancellation before the write, or revision conflict leaves Firebase unchanged.

Builder patches use an explicit canonical field allowlist. Character-sheet patches remain limited to current HP, strain, overstrained, notes, conditions, and exact presentation-preference leaves under `builder.sheet.appearance.*`. The boundary validates exact values; it does not silently coerce malformed input into a different value.

September 29 sheet customization adds optional `builder.sheet.appearance` to the exact schema-6 codec. Absent preferences retain neutral UI defaults without a read-time write or schema bump. Partial records accept only the known colors, heading font, text size, corners, dice style and animation/effects booleans; invalid or unknown fields fail canonical validation. Historical shape normalization and ordinary whole-builder snapshots preserve valid preferences. The sheet saves only edited preference leaves alongside its existing temporary-state patch, retains newer edits while an earlier save completes, and uses the existing save/retry/navigation coordinator. Its transitional writer validates preference leaves and uses a transaction whenever they are present, advancing the stored revision without rewriting the character or stamping a newer schema. An older builder snapshot therefore conflicts rather than overwriting new preferences. Temporary-only legacy saves retain their previous behavior; the broader sheet session cutover is still deferred. See [the customization record](sheet-customization-2026-09-29.md).

The subsequent font extension adds heading values `nunito`, `handwritten`, and `script`, plus the optional exact boolean `dyslexiaFriendly` (UI default `false`). When enabled, OpenDyslexic overrides body and heading rendering without replacing the saved `headingFont`; disabling it restores that choice. These preferences use the same validated leaf patches, revision handling, codec and migrations. Existing records require no rewrite. Reset restores the clean heading and disables the override. See [the font extension record](sheet-fonts-2026-09-29.md).

## Revision and conflict policy

`revision` is a nonnegative safe integer stored in the Firestore envelope and excluded from canonical state. Historical documents without a revision are treated as revision 0. New characters begin at revision 1, and each accepted save increments once.

Replace, patch, and delete operations require `expectedRevision`. The writer compares it with the current stored revision inside a Firestore transaction. A mismatch raises `CharacterConflictError` and does not write. This is deliberately document-wide: field-aware merge policy belongs to `CharacterSession` and reconciliation, not the database boundary.

Narrow patches preserve unrelated current fields because they decode the latest stored document and apply the approved paths inside the same transaction. Full replacements are safe only when the caller's expected revision still matches.

`CharacterSession` owns the caller-side save snapshot. The session passes the snapshot's expected revision to the writer and acknowledges only the matching save identity at exactly the returned next revision. Persisted session state advances to the value actually written; edits accepted while that write was in flight remain in working state and stay dirty. See [character-session.md](character-session.md).

## Error and authorization behavior

Contract failures use `CharacterPersistenceError` with a stable `code` and structured diagnostics. Revision conflicts use `CharacterConflictError` with expected and actual revisions. Missing documents are explicit. Firebase authorization and transport errors propagate without being disguised as schema failures.

The Firebase SDK and database instance are injectable for emulator verification. The website uses the checked-in browser SDK and configured Firebase instance by default; tests supply a matching isolated SDK/database pair so no production document is touched.

## Deployed persistence boundary

September 27 HP inspection clarifies a remaining sheet compatibility path: `character-sheet.js` reads its document with `getDoc` and autosaves sheet-owned leaves through `buildTemporarySheetUpdatePatch` and the transitional `saveCharacterPatch` writer. Current HP is already persisted at `builder.sheet.fields.hpcur` and restored by `loadCloudOrInit`/`applyState`. This sheet path does not yet use the builder's revision-aware `CharacterSession` save flow; the builder cutover described below must not be read as a sheet cutover. HP usability work preserves this existing persistence boundary and leaves its broader retirement to the domain-migration work.

The HP control accepts an unsigned whole number as a direct set and a leading `+` or `-` as an adjustment to accepted current HP. Enter or leaving the field commits once; Escape restores the accepted value. The control keeps raw editing text separate from the value collected for autosave, so pending saves and edits elsewhere cannot persist partial/invalid HP input. A blank initial HP requires a direct set before adjustments. Negative results stop at zero; character maximum HP does not cap this control, preserving existing behavior. Inputs and results must fit the existing 0–999999 sheet bound. No saved format, migration, Firebase rule or second persistence store is added. See [the HP verification record](hp-usability-2026-09-27.md).

The definitive APIs in the existing reader/writer modules target schema 6 and are deployed with compatible schema-3 game data as of September 22. All eight builder pages passed signed-in local save/reload, dependency-review and conflict checks. Public readback verifies the deployed code; no production character save was used as a release test. Personal acceptance remains nonblocking follow-up. Transitional v4 helpers remain for compatibility until their remaining callers can be retired separately.

A September 21 public-file audit found that the then-deployed builder and sheet used transitional `saveCharacterPatch`, independently of the migrator. Its Class-page missing-import fault was fixed by the bounded schema-v4 hotfix; that earlier repair is historical context, not the current deployed save path.

Hosting version `d5c9671adee0ab31` carried the earlier Class-only repair. The September 22 coordinated release supersedes it and activates schema-6 migration on read, persisting the reviewed result only on a successful explicit player save. No bulk production migration was performed.

The earlier inspection established why code and data must deploy together: schema-2 Spirit Warrior data lacked an explicit feat grant required by the new graph. Published schema-3 data supplies it, preserving the valid feat. A content-rule change is still distinct from a format conversion; destructive consequences require review. See [the live-save investigation](live-save-repair-2026-09-21.md).

Continuing compatibility safeguards:

- do not stamp transitional partial writes as canonical v5 or v6;
- do not duplicate migration or compatibility logic in pages;
- do not remove the v4 helpers while their callers remain;
- keep remaining compatibility-helper retirement separate from the completed deployed-page cutover;
- continue fixture/emulator coverage for the v6 boundary; deferred personal acceptance does not block authorized engineering or releases.
