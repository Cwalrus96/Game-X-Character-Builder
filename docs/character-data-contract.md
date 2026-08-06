# Character data contract

This document defines the canonical in-memory character state accepted by `CharacterCodec`. It is the living contract for saved-character schema version 5.

## Why schema version 5 exists

Schemas 1 through 4 were written incrementally by pages that accepted missing fields, silently sanitized malformed values, and stored some game-data references by display name or composite label. That behavior makes it difficult to distinguish a valid character from a partially damaged one and makes renaming game data unsafe.

Schema version 5 establishes one complete, exact shape. The codec reports missing, unknown, malformed, duplicate, or inconsistent data instead of trimming, defaulting, or dropping it. Older documents are migration input; they are not valid v5 documents until `CharacterMigrations` has transformed them and the v5 codec accepts the result.

## Boundary between character state and persistence metadata

The canonical value has exactly three root fields:

| Field | Meaning |
|---|---|
| `schemaVersion` | Integer `5`. |
| `ownerUid` | Non-empty Firebase owner UID. |
| `builder` | Complete canonical builder and temporary sheet state. |

Firestore bookkeeping is repository metadata, not canonical character state. `createdAt`, `updatedAt`, and the former `builder.lastVisitedAt` value must be read, written, and exposed separately by `CharacterRepository`. They are rejected if passed to the v5 codec. `builder.visitedSteps` remains canonical state because it records which builder sections the character has visited, rather than when a persistence operation occurred.

## Builder shape

Every listed field is required. No additional builder fields are accepted.

| Field | Canonical value |
|---|---|
| `name`, `portraitPath` | Canonical user text and a canonical Storage path. Empty is allowed. |
| `level` | Integer from 1 through 12. |
| `classKey`, `originKey`, `primaryAttribute` | Stable game-data keys; empty while unanswered. `primaryAttribute`, when set, is one of the six attribute keys. |
| `attributes` | Exact map of `strength`, `agility`, `intellect`, `willpower`, `attunement`, and `heart`; integer values obey the level and primary-attribute caps. |
| `originKeystone` | Optional user-facing text. |
| `selectedClassFeatureOptions`, `selectedClassUtilitySkills`, `selectedFeats`, `selectedFeatOptions`, `selectedTechniques` | Duplicate-free arrays of stable game-data keys. Display names and schema-v4 composite option labels are migration inputs, not valid v5 references. |
| `autoAbilityNames` | Transitional duplicate-free display-name snapshot retained so migrations and reconciliation can prove parity while source-owned ability IDs are introduced. It is not selection identity. |
| `grantedCoreSkillSnapshot`, `grantedSkillSnapshot` | Transitional duplicate-free stable-key snapshots retained for migration and reconciliation parity. |
| `bonds` | Ordered exact bond records. |
| `backgroundKeystones` | At most two optional keystone texts. |
| `weapons` | Ordered exact weapon records. |
| `grantChoices` | Map of exact source-owned answer records keyed by `choiceId`. |
| `resources` | Map of exact resource state records keyed by `resourceKey`. |
| `visitedSteps` | Duplicate-free recognized builder step IDs. |
| `sheet` | Exact builder-owned and temporary character-sheet state described below. |

Descriptions in game data remain optional. The character codec does not require a description merely because a referenced record may have one.

## Nested identity and ownership records

Stable identities make list entries and source-owned answers reconcilable without depending on display text or array position.

- A bond is exactly `{ bondId, name, rank, keystone }`. `bondId` is stable; the other values may be blank, although a stored bond cannot be entirely empty.
- A weapon is exactly `{ id, choiceId, sourceChoiceId, generated, weaponKey, rank, customName, enhancements }`. Generated weapons must name their source-owned choice in `sourceChoiceId`.
- A weapon enhancement is exactly `{ id, enhancementKey, rank, selections, granted }`. `selections` is an exact map whose keys identify the enhancement's prompts.
- A grant answer is exactly `{ choiceId, type, sourceId, sourceLabel, value, techniqueKey, skillKey, weaponKey, rank, customName, enhancements, tags }`. All fields are present; fields not used by that answer type take their canonical empty value. Its `choiceId` must equal its map key.
- A resource is exactly `{ resourceKey, name, capacity, current }`. Its key must equal its map key, and `current` cannot exceed `capacity`.
- A repeatable ability is exactly `{ abilityId, sourceId, name, text }`. `abilityId` is stable. `sourceId` is present but may be empty for a user-authored ability.

The approved `choice-rebind` mechanic must preserve the original answer and overlay a replacement only while the granting source exists. Its persistence and reconciliation shape belongs to the later feature vertical slice; WPC-CODEC does not invent that unresolved overlay structure.

## Character-sheet state

`builder.sheet` is exactly `{ fields, repeatables }`.

`fields` contains every fixed defense and core-skill rank from `character-rules.js`, plus `hpcur`, `strain`, `overstrained`, and `notes`. No dynamic `rank_*` field is accepted. Skill ranks are blank or 0 through 6; HP and strain are blank or nonnegative integers.

`repeatables` contains exactly:

- `combatSkillsExtra`: exact `{ skill, rank }` rows with case-insensitive unique names;
- `settingSkills`: exact `{ skill, rank }` rows with case-insensitive unique names;
- `abilities`: exact identity-bearing ability records described above;
- `conditions`: exact `{ name, n, notes }` rows.

The character-sheet autosave ownership restriction remains unchanged: it may write only current HP, strain, overstrained, notes, and conditions. The presence of the other sheet fields in canonical state does not grant the character-sheet page permission to overwrite builder-owned values.

## Codec behavior

`public/js/core/character-codec.js` is pure: it performs no Firebase, DOM, file, or network access.

- `createDefaultCharacter({ ownerUid })` creates a complete, independently allocated v5 value and rejects a missing or noncanonical owner UID.
- `validateCharacter(value)` returns `{ ok, diagnostics }` without modifying its input.
- `decodeCharacter(value)` and `encodeCharacter(value)` return `{ ok, value, diagnostics }`. A successful value is a deep clone; an invalid value is `null`.
- `assertCanonicalCharacter(value)` returns a validated clone or throws `CharacterCodecError` with structured diagnostics.

Each diagnostic has a stable `code`, an exact property `path`, and a human-readable `message`. Validation never silently repairs data.

## Integration boundary

The current production reader and writer continue to use schema version 4 during WPC-CODEC. They must not import this v5 constant or stamp v5 yet. WPC-MIGRATIONS must first provide tested sequential conversions from every supported saved version; WPC-REPOSITORY will then apply migrations before decoding and isolate Firestore metadata from canonical state.
