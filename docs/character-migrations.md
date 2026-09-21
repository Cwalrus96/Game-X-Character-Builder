# Character migration contract

`CharacterMigrations` is the only target-v5 module that understands historical saved-character formats. Its job is to accept a recognized old Firestore document, preserve repository timestamps separately, explain every conversion it makes, and return an exact schema-v5 character accepted by `CharacterCodec`.

This boundary keeps historical document-format compatibility out of pages, widgets, rules, graph code, sessions, and the repository's canonical-state logic. Those consumers operate only on v5. The definitive reader applies this registry before exposing character state; old format-compatibility branches must be deleted as their remaining callers switch, and no new historical document-format compatibility logic may be added outside this module. Game-data naming aliases shared by current v5 characters are a separate pure identity concern; the Ranged Weapons/Targeting policy is defined in [character-persistence.md](character-persistence.md#ranged-weapons-naming-compatibility).

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
- `metadata`: `createdAt`, `updatedAt`, persistence `revision`, and historical `lastVisitedAt`, separated from canonical state;
- `report`: deterministic `preserved`, `defaulted`, `normalized`, `renamed`, `removed`, and `unresolved` records;
- `diagnostics`: deterministic path-specific failures such as malformed input, unknown fields, missing references, ambiguous references, or identity collisions.

The database reader invokes this registry without writing. The database writer persists the migrated v5 value only as part of a successful explicit save with a matching revision. See [character-persistence.md](character-persistence.md).

The registry is pure. It does not read Firebase, load files, access the DOM, fetch game data, or mutate its input.

`createCharacterMigrationReferences(gameData)` builds the stable-key lookup used to translate historical display names and composite option labels. Callers must supply a lookup derived from the reviewed game-data model whenever a historical document contains game-data references. Missing, unresolved, or ambiguous mappings fail; the migrator never chooses a plausible-looking record.

## Conversion rules

- Stable v5 references are preserved only when the supplied reference index proves them.
- V1 attributes are treated as base values. The historical primary-attribute bonus is restored before v5 level caps are applied.
- Missing required v5 fields receive their documented canonical defaults and are listed in the report.
- Historical bonds, abilities, weapons, and enhancements that lacked IDs receive deterministic IDs derived from their content and position. Duplicate final identities fail.
- Historical class-option grant answers are rebound to stable choice and owner IDs only when the reviewed game-data reference index proves one unambiguous match. This includes the display/composite identities emitted by the v4 Dazzling Wand picker; the selected technique is retained as its stable technique key.
- Known core/defense `rank_*` field identities in older granted-skill snapshots resolve through the fixed Rules skill catalogue. Named skill grants such as Elementalism supply reviewed skill identities even when the older artifact omitted a separate key. Unknown names or unknown `rank_*` fields still fail; no arbitrary player text is converted into a guessed identity.
- Historical feat/option composite labels resolve using the owning class and level from reviewed structured prerequisites, as well as the older explicit class/level fields. Duplicate matches remain ambiguous and fail.
- Merge-based v4 records may retain `classFeatureChoices` and `selectedFeatIds` from earlier writers. Explicit modern fields, including empty arrays, take precedence over these stale aliases; their removal is reported. If the modern field is absent, the old selections pass through the normal stable-reference conversion instead of being discarded.
- Automatic class-feature weapon/technique choices whose historical sanitizer omitted `sourceId` receive it only when a unique reviewed grant and the character's class/level prove the owner. Existing supplied owners must agree, unavailable or ambiguous owners fail, and generated weapon/choice identities remain unchanged.
- Duplicate entries in `autoAbilityNames` are removed because that field is a derived display snapshot, not identity-bearing state. Repeated ability records remain distinct and receive distinct deterministic IDs, so two same-named feat abilities are not collapsed.
- `migratedAt` and `migratedFromUid` are recognized as obsolete account-import bookkeeping fields and reported as removed. They are not canonical character state.
- Known sheet mirrors and derived values are removed because canonical builder/rules state owns them; the report names each removal.
- Firestore timestamps are returned as repository metadata and never passed into the v5 codec.
- Obsolete nested `builder.updatedAt` is reported and separated as metadata. An existing root timestamp takes precedence; the nested timestamp is a fallback only when the root field is absent. A stored revision remains persistence metadata, including on recognized historical envelopes.
- Unknown fields fail instead of being silently dropped.

Some historical data has no proven lossless v5 binding. A populated legacy custom-technique list, freeform weapon list, `playerName`, or portrait URL/data value without a canonical Storage path produces an unresolved diagnostic. Empty obsolete collections may be removed with a report. Resolving a populated case requires an explicit product/data decision; it is not a license to discard the value.

The September 21 production inspection supplied the shapes above, with historical writer commits confirming their meaning. Real player records remain in ignored local evidence; regression fixtures use synthetic identities and prose. All 13 captured per-user v4 documents pass isolated migration and explicit save/reload after these fixes. Format acceptance does not erase game-rule conflicts: equipment capacity/rank findings from later graph reconciliation remain separately reviewable and must not be repaired by inventing skills or deleting equipment inside a migration.

After conversion, shared grant projection resolves stable option keys against either published schema-2 or staged schema-3 artifacts. Unambiguous schema-2 composite labels remain a compatibility input, but ambiguous labels grant nothing; stable and legacy aliases for the same selected option do not duplicate its grants. Schema-3 deferred-parent execution rules still apply. This prevents a successfully migrated option from losing its granted training merely because the reviewed artifact format is older.

## Going-forward boundary

`WPC-MIGRATIONS` does not change the live Firebase reader or writer. `WPC-REPOSITORY` is responsible for applying this registry before decoding and for stamping every successfully written canonical character with schema version 5. Loading and migrating a historical character is read-only: the migrated v5 value remains in memory and must not be written back merely because the character was opened. Firebase receives the migrated v5 document only as part of a successful explicit user save. The repository must never expose an older shape to the rest of the application or let pages implement compatibility branches.
