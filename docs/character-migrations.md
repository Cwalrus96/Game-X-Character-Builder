# Character migration contract

`CharacterMigrations` is the only target-v5 module that understands historical saved-character formats. Its job is to accept a recognized old Firestore document, preserve repository timestamps separately, explain every conversion it makes, and return an exact schema-v5 character accepted by `CharacterCodec`.

This boundary keeps backward compatibility out of pages, widgets, rules, graph code, sessions, and the repository's canonical-state logic. Those consumers operate only on v5. Transitional v4 reader/writer and dependency paths still serve the deployed application until repository and page integration; those old compatibility branches must be deleted as their callers switch, and no new compatibility logic may be added outside this module.

## Evidence-backed version history

The registry follows formats that executable repository history actually wrote; version numbers are not inferred merely because they are numerically adjacent.

| Input | Historical evidence | Registry edge |
|---|---|---|
| Unversioned (`0` inside the migrator only) | The earliest writer stored root ownership/name/sheet data without `schemaVersion`. | `0 -> 1` |
| Version 1 | Introduced by commit `c6ff2fd`; later v1 writers added class/feat choices and stored base attributes. | `1 -> 3` |
| Version 2 | No repository writer emitted this version. | Rejected as reserved; its meaning is not guessed. |
| Version 3 | Introduced by commit `3e783d2`; its builder shape grew while the version stayed 3. | `3 -> 4` |
| Version 4 | Introduced by commit `6da3708`; weapons, grant choices, and resources were added during the v4 period. | `4 -> 5` |
| Version 5 | The current exact canonical contract. | Validated without migration. |

The recognized unversioned envelope is deliberately narrow. An arbitrary object missing `schemaVersion` is not assumed to be the oldest format.

## Public behavior

`migrateCharacterDocument(document, { references })` returns a structured result:

- `ok` and `value`: `value` exists only when the final v5 codec accepts it;
- `fromVersion`, `toVersion`, and `appliedVersions`: the recognized input and exact edges used;
- `metadata`: `createdAt`, `updatedAt`, and historical `lastVisitedAt`, separated from canonical state;
- `report`: deterministic `preserved`, `defaulted`, `normalized`, `renamed`, `removed`, and `unresolved` records;
- `diagnostics`: deterministic path-specific failures such as malformed input, unknown fields, missing references, ambiguous references, or identity collisions.

The registry is pure. It does not read Firebase, load files, access the DOM, fetch game data, or mutate its input.

`createCharacterMigrationReferences(gameData)` builds the stable-key lookup used to translate historical display names and composite option labels. Callers must supply a lookup derived from the reviewed game-data model whenever a historical document contains game-data references. Missing, unresolved, or ambiguous mappings fail; the migrator never chooses a plausible-looking record.

## Conversion rules

- Stable v5 references are preserved only when the supplied reference index proves them.
- V1 attributes are treated as base values. The historical primary-attribute bonus is restored before v5 level caps are applied.
- Missing required v5 fields receive their documented canonical defaults and are listed in the report.
- Historical bonds, abilities, weapons, and enhancements that lacked IDs receive deterministic IDs derived from their content and position. Duplicate final identities fail.
- Known sheet mirrors and derived values are removed because canonical builder/rules state owns them; the report names each removal.
- Firestore timestamps are returned as repository metadata and never passed into the v5 codec.
- Unknown fields fail instead of being silently dropped.

Some historical data has no proven lossless v5 binding. A populated legacy custom-technique list, freeform weapon list, `playerName`, or portrait URL/data value without a canonical Storage path produces an unresolved diagnostic. Empty obsolete collections may be removed with a report. Resolving a populated case requires an explicit product/data decision; it is not a license to discard the value.

## Going-forward boundary

`WPC-MIGRATIONS` does not change the live Firebase reader or writer. `WPC-REPOSITORY` is responsible for applying this registry before decoding and for stamping every successfully written canonical character with schema version 5. Loading and migrating a historical character is read-only: the migrated v5 value remains in memory and must not be written back merely because the character was opened. Firebase receives the migrated v5 document only as part of a successful explicit user save. The repository must never expose an older shape to the rest of the application or let pages implement compatibility branches.
