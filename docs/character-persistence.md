# Character persistence contract

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

Builder patches use an explicit canonical field allowlist. Character-sheet patches remain limited to current HP, strain, overstrained, notes, and conditions. The boundary validates exact values; it does not silently coerce malformed input into a different value.

## Revision and conflict policy

`revision` is a nonnegative safe integer stored in the Firestore envelope and excluded from canonical state. Historical documents without a revision are treated as revision 0. New characters begin at revision 1, and each accepted save increments once.

Replace, patch, and delete operations require `expectedRevision`. The writer compares it with the current stored revision inside a Firestore transaction. A mismatch raises `CharacterConflictError` and does not write. This is deliberately document-wide: field-aware merge policy belongs to `CharacterSession` and reconciliation, not the database boundary.

Narrow patches preserve unrelated current fields because they decode the latest stored document and apply the approved paths inside the same transaction. Full replacements are safe only when the caller's expected revision still matches.

`CharacterSession` owns the caller-side save snapshot. The session passes the snapshot's expected revision to the writer and acknowledges only the matching save identity at exactly the returned next revision. Persisted session state advances to the value actually written; edits accepted while that write was in flight remain in working state and stay dirty. See [character-session.md](character-session.md).

## Error and authorization behavior

Contract failures use `CharacterPersistenceError` with a stable `code` and structured diagnostics. Revision conflicts use `CharacterConflictError` with expected and actual revisions. Missing documents are explicit. Firebase authorization and transport errors propagate without being disguised as schema failures.

The Firebase SDK and database instance are injectable for emulator verification. The website uses the checked-in browser SDK and configured Firebase instance by default; tests supply a matching isolated SDK/database pair so no production document is touched.

## Transitional deployment boundary

The definitive APIs are implemented in the existing reader/writer modules and now target schema 6; every local-review builder domain calls them. The full builder release still needs compatible explicit-grant data and verification of actual signed-in behavior. The user's September 21 direction defers their personal acceptance without making it a blocker; agent-performed compatibility and browser checks can continue. Transitional v4 exports remain while deployed callers need them.

A September 21 public-file audit confirms that the currently deployed builder and sheet still call the transitional `saveCharacterPatch` path. That path does not invoke the v5 migrator. Its Class-page missing-import failure is therefore distinct from the migration gaps discovered in stored records. The staged Class-only hotfix uses compatible feat lookup and sanitizes then writes only owned skill/ability leaves, preserving sheet-owned play state. Preparing or deploying this bounded legacy-page fix does not deploy the current session/graph builder, migrate production characters, or publish new game data.

Following the user's nonblocking-manual-acceptance direction, the Class-only repair is deployed in Hosting version `d5c9671adee0ab31`. Its writes remain schema v4. The newer migration registry still ships with the future complete builder release; do not describe it as already active in production.

The same inspection also proves a coordinated runtime/data acceptance dependency: the deployed Class page supplies feat capacity through its historical level formula, whereas the new graph requires explicit feat grants. For the captured level-2 Spirit Warrior, the published schema-2 data has no such grant, so the graph proposes removing a valid existing feat; the reviewed staged candidate contains the explicit grant and assigns that feat correctly. Migration preserves the feat. Do not apply this reconciliation or deploy the graph against the old data as a format repair. See [the live-save investigation](live-save-repair-2026-09-21.md).

Until the compatible builder/data release is ready:

- do not stamp transitional partial writes as canonical v5 or v6;
- do not duplicate migration or compatibility logic in pages;
- do not remove the v4 helpers while their callers remain;
- do not claim that `WPC-REPOSITORY` page integration is complete;
- continue implementing and testing the v6 boundary against fixtures and Firebase emulators; deferred personal acceptance does not block that work or the separately authorized Class hotfix.
