# Character persistence contract

This document defines the page-facing Firebase boundary for saved characters. The existing `public/js/core/database-reader.js` and `public/js/core/database-writer.js` modules are the two halves of that single boundary. Do not add a parallel `CharacterRepository` implementation or let pages call Firestore directly for normal character persistence.

`public/js/core/character-persistence.js` contains the shared, Firebase-free rules used by both halves: envelope decoding/encoding, metadata separation, patch ownership, revision comparison, and structured persistence errors. It is an internal contract, not a competing page-facing repository.

## Read contract

`readCharacter` and `observeCharacters` perform this pipeline:

```text
raw Firestore document -> CharacterMigrations -> CharacterCodec -> exact v5 state + metadata
```

Recognized historical documents migrate only in memory. A read never writes the migrated result to Firebase. Invalid, unresolved, future-version, owner-mismatched, or malformed documents fail with structured diagnostics instead of being defaulted or sanitized.

Known v4 account-import envelopes are supported, including their obsolete import timestamps, duplicate derived ability-name snapshots, and source-owned class-option answers whose old display/composite identities can be proven against reviewed game data. Identity-bearing repeated records are preserved. The reader still fails closed for unknown fields, ambiguous owners, or references that cannot be proven.

The live-record repair also covers old `rank_*` skill snapshot identities, obsolete merged selection aliases, nested update timestamps, composite feat-option labels, and source-less automatic choices when reviewed grant ownership is unique and active. These conversions stay in CharacterMigrations. Loading remains read-only; an explicit save writes the canonical result once, and a subsequent v5 read does not reapply migration. The synthetic emulator regression verifies complete state preservation and stale revision rejection for this observed envelope.

The returned canonical character contains only `schemaVersion`, `ownerUid`, and `builder`. `createdAt`, `updatedAt`, historical `lastVisitedAt`, and `revision` are returned separately as persistence metadata.

## Ranged Weapons naming compatibility

Ranged Weapons is the current display name and `ranged-weapons` is its current skill key. The pure `skill-identity.js` boundary recognizes the former Targeting label and `targeting` key when Rules and UI consume existing saved state or reviewed older game data. This rename does not change the schema-v5 character shape or trigger a Firebase write on read.

- Historical reference indexes resolve the old label/key to `ranged-weapons`. Current v5 answers may retain their stored `targeting` skill key; consumers accept that alias, and newly authored technique-choice patches use the current key.
- Existing `combatSkillsExtra` rows retain their stored name and rank until an explicit edit/save changes them. Projections display Ranged Weapons and apply the same effective rank to weapon caps, techniques, and prerequisites; the rename must not remove a trained rank or a selected technique.
- Only the exact `targeting` persisted skill key is remapped. Comparison normalization is separate from storage identity: `custom_skill`, `custom-skill`, and other unrelated keys remain distinct and unchanged in migrations, snapshots, and choice patches.
- Feature, feat, weapon, and enhancement keys are unchanged. Explicit choice IDs are unchanged. For an existing choice whose ID is derived from its granting skill, `choice-identity.js` retains the historical `targeting` token and accepts historical display-case aliases, preserving the selected answer and its generated weapon owner.

Compatibility projections do not alter the reviewed JSON artifacts. They also do not rename separate aiming concepts such as Enhanced Targeting. The regression coverage in `tests/skill-identity.test.mjs` proves rank preservation, retained source-owned Rifle answers, historical reference resolution, and preservation of unrelated skill keys.

## Write contract

The writer exposes narrow operations:

- `createCharacter` writes a complete codec-accepted v5 document at revision 1;
- `replaceCharacter` writes a complete codec-accepted v5 replacement;
- `patchCharacter` applies only an explicit builder or character-sheet owned patch to the latest value read inside its transaction;
- `deleteCharacter` deletes only the exact revision the caller reviewed.

Every successful create or save writes schema version 5 and server-managed `createdAt`/`updatedAt` metadata. A historical document is therefore written back as v5 only when an explicit user save succeeds. Failed validation, failed authorization, cancellation before the write, or revision conflict leaves Firebase unchanged.

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

The definitive v5 APIs are implemented in the existing reader/writer modules, and every local-review builder domain now calls them. The full builder release still needs compatible explicit-grant data and verification of actual signed-in behavior. The user's September 21 direction defers their personal acceptance without making it a blocker; agent-performed compatibility and browser checks can continue. Transitional v4 exports remain while deployed callers need them.

A September 21 public-file audit confirms that the currently deployed builder and sheet still call the transitional `saveCharacterPatch` path. That path does not invoke the v5 migrator. Its Class-page missing-import failure is therefore distinct from the migration gaps discovered in stored records. The staged Class-only hotfix uses compatible feat lookup and sanitizes then writes only owned skill/ability leaves, preserving sheet-owned play state. Preparing or deploying this bounded legacy-page fix does not deploy the current session/graph builder, migrate production characters, or publish new game data.

Following the user's nonblocking-manual-acceptance direction, the Class-only repair is deployed in Hosting version `d5c9671adee0ab31`. Its writes remain schema v4. The newer migration registry still ships with the future complete builder release; do not describe it as already active in production.

The same inspection also proves a coordinated runtime/data acceptance dependency: the deployed Class page supplies feat capacity through its historical level formula, whereas the new graph requires explicit feat grants. For the captured level-2 Spirit Warrior, the published schema-2 data has no such grant, so the graph proposes removing a valid existing feat; the reviewed staged candidate contains the explicit grant and assigns that feat correctly. Migration preserves the feat. Do not apply this reconciliation or deploy the graph against the old data as a format repair. See [the live-save investigation](live-save-repair-2026-09-21.md).

Until the compatible builder/data release is ready:

- do not stamp transitional partial writes as v5;
- do not duplicate migration or compatibility logic in pages;
- do not remove the v4 helpers while their callers remain;
- do not claim that `WPC-REPOSITORY` page integration is complete;
- continue implementing and testing the v5 boundary against fixtures and Firebase emulators; deferred personal acceptance does not block that work or the separately authorized Class hotfix.
