# Character persistence contract

This document defines the page-facing Firebase boundary for saved characters. The existing `public/js/core/database-reader.js` and `public/js/core/database-writer.js` modules are the two halves of that single boundary. Do not add a parallel `CharacterRepository` implementation or let pages call Firestore directly for normal character persistence.

`public/js/core/character-persistence.js` contains the shared, Firebase-free rules used by both halves: envelope decoding/encoding, metadata separation, patch ownership, revision comparison, and structured persistence errors. It is an internal contract, not a competing page-facing repository.

## Read contract

`readCharacter` and `observeCharacters` perform this pipeline:

```text
raw Firestore document -> CharacterMigrations -> CharacterCodec -> exact v5 state + metadata
```

Recognized historical documents migrate only in memory. A read never writes the migrated result to Firebase. Invalid, unresolved, future-version, owner-mismatched, or malformed documents fail with structured diagnostics instead of being defaulted or sanitized.

The returned canonical character contains only `schemaVersion`, `ownerUid`, and `builder`. `createdAt`, `updatedAt`, historical `lastVisitedAt`, and `revision` are returned separately as persistence metadata.

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

The definitive v5 APIs are implemented in the existing reader/writer modules, but the deployed pages still call their clearly marked transitional v4 exports. Those callers cannot switch safely until reviewed runtime game data supplies stable `techniqueKey` values and the affected builder domains consume v5 stable-key state. The frozen production schema-v1 artifacts contain technique display names only.

Until that prerequisite is satisfied:

- do not stamp transitional partial writes as v5;
- do not duplicate migration or compatibility logic in pages;
- do not remove the v4 helpers while their callers remain;
- do not claim that `WPC-REPOSITORY` page integration is complete;
- continue implementing and testing the v5 boundary against fixtures and Firebase emulators only.
