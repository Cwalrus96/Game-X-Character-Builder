# Game-data source contract

Status: Work Package B baseline and field mapping, captured 2026-08-03. This document describes the live source and intended mapping; it does not yet certify the exporter.

## Canonical source and frozen release

The canonical editable source is the native Google Sheet [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit).

| Property | Baseline value |
|---|---|
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Last modified | `2026-07-31T21:50:31.191Z` |
| Source tabs | README plus nine exported domain tabs |
| Checked-in release generated | `2026-06-29T22:09:43.726Z` |
| Release schema | 1 |
| Production export status | Frozen |

The exact checked-in artifact hashes and structural counts live in `contracts/game-data-release-baseline.json`. Run `npm run baseline:data` to prove that no production artifact has drifted.

The live Sheet is newer than the checked-in release. This is intentional during repair: Work Package B must explain the complete staged diff before production export is unlocked.

## Contract rules

1. A header is a schema field, not an editorial suggestion. Unknown, missing, or legacy headers produce validation findings.
2. Stable identifiers are required for persisted or cross-referenced entities. Display names are not identifiers.
3. Blank cells and malformed values are not silently coerced when they change meaning.
4. Nested `OPTION_GROUP` and `OPTION` records must identify both their owner and stable parent.
5. Grant and prerequisite expressions use one shared parser and one shared set of type/field definitions.
6. Cross-references are validated before artifacts are written.
7. Source adaptation, normalization, validation, and artifact writing are separate phases.
8. Production files are written only after a validation-clean staging export and reviewed artifact diff.

## Live sheet mapping

### README

Documentation only. It is never emitted into runtime JSON.

### Classes

Primary key: `classKey`.

| Live column | Runtime field / behavior | Status |
|---|---|---|
| `classKey` | `classKey` stable ID | Required |
| `name` | `name` | Required |
| `pitch` | `pitch` | Supported |
| `examples` | `examples` | Supported |
| `hpProgression` | `hpProgression` | Required for a playable class |
| `primaryAttributeA`, `primaryAttributeB` | same fields | Required for a playable class |
| `combatTechniqueSkill` | same field | Required for a playable class |
| `combatSkills` | parsed `{name, progression}` list | Supported |
| `utilitySkillOptions` | parsed string list | Supported |
| `levelUp` | player-facing level-up prose | Currently dropped; mapping required |
| `notes` | `notes` | Supported |

The live source contains 19 class rows; the frozen release contains 10.

### ClassFeatures

Primary key: `featureKey`, scoped by `classKey`. Nested rows reference `parentKey` within that owner scope.

| Live column | Runtime field / behavior | Status |
|---|---|---|
| `classKey` | source owner and output bucket | Required; no carry-forward inference |
| `level` | `level` and availability threshold | Required integer |
| `rowType` | `FEATURE`, `OPTION_GROUP`, or `OPTION` | Required enum |
| `featureKey` | stable node ID | Required |
| `name` | display label | Required |
| `parentKey` | stable parent reference | Required for `OPTION` |
| `description` | `description` | Supported |
| `chooseCount` | `chooseCount` | Required positive integer for option groups |
| `grants` | parsed grant expressions | Contract work below |
| `grantNotes` | `grantNotes` | Supported |
| `prerequisites` | parsed prerequisite expressions | Contract work below |

Live row 4 (`heroic-combat-training`) has blank `classKey` and `level`. The old exporter skips it, orphaning its options. The validator should reject this source row until the owner and level are explicit; it should not guess based on row order.

The frozen release also contains a bogus class-feature bucket named `5`. That owner is absent from the live source, so it is a stale artifact defect that a corrected export should remove.

### Feats

Primary key: `featKey`; nested rows use `parentKey`.

| Live column | Runtime field / behavior | Status |
|---|---|---|
| `category` | `classKey` for the current class-feat rows | Exporter incorrectly reads obsolete `classKey` |
| `rowType` | output `type` and nesting behavior | Supported |
| `featKey` | stable feat/option ID | Required |
| `name` | display label | Required |
| `parentKey` | stable parent reference | Required for options |
| `prerequisites` | structured prerequisites; class prerequisite supplies minimum level | Exporter currently reads the wrong fields/context |
| `description` | `description` | Supported |
| `grants` | structured grants | Supported after shared contract repair |
| `grantNotes` | `grantNotes` | Supported |

For current rows, output `featType` is `CLASS`, `classKey` comes from `category`, and `minLevel` comes from the matching `class` prerequisite. This adaptation must be explicit and tested.

The live source has 38 valid rows. The frozen release contains an extra empty feat record (`featKey: "feat"`, blank name) that is no longer present in the Sheet.

### Techniques

Primary key: `techniqueName` in schema version 1. A future stable `techniqueKey` is still required before name changes can be migration-safe.

All 28 live columns map directly except where noted:

- `tags` is a normalized list.
- `prerequisites` uses the shared prerequisite parser. Existing prose-only rows remain legacy text until converted to structured expressions.
- `energyCost` must not use permissive integer parsing. Fixed integer costs, blank values, the legacy `-1` pumpable sentinel, and variable/non-numeric values must be distinguished.
- `damageByRank`, `pumpDamageByRank`, and `rankNotes` are rank maps.
- boolean fields `sustained` and `rollRequired` accept only documented values.

Live energy-cost findings:

- 10 rows use `-1` for variable/pumpable energy;
- 18 rows are blank;
- `Pinning Ammunition` uses `0 or 3`, which needs a structured representation;
- three rows use `N`, which is not a valid numeric cost and must be corrected or explicitly modeled.

The current exporter silently maps non-integer values to `null`, losing the distinction. Validation must fail instead.

### Origins

Primary key: `originKey`.

| Live column | Runtime field / behavior | Status |
|---|---|---|
| `originKey` | stable ID | Required |
| `name` | display name | Required |
| `status` | `playable`, `draft`, or `incomplete` | Required enum |
| `summary` | `summary` | Supported |
| `description` | `description` | Supported |
| `originKeystone` | `originKeystone` | Supported |
| `questions` | parsed `roleplayQuestions` list | Exporter incorrectly reads obsolete `roleplayQuestionsText` |
| `futureUpgradesText` | parsed `higherLevelUpgrades` list | Supported |
| `examplesText` | parsed `examples` list | Supported |

With no explicit sort column, source row order is canonical. The live source contains 15 origins; the frozen release contains 14.

### OriginFeatures

Primary key: `featureKey`, scoped by `originKey`.

| Live column | Runtime field / behavior | Status |
|---|---|---|
| `originKey` | source owner | Required and cross-referenced |
| `level` | feature availability level | Must be preserved |
| `rowType` | feature/nesting type | Must be preserved/validated |
| `featureKey` | stable feature ID | Required |
| `name` | feature name | Exporter incorrectly requires obsolete `featureName` |
| `description` | feature description | Exporter incorrectly requires obsolete `featureText` |
| `grants` | structured grants | Shared contract |
| `grantNotes` | grant notes | Supported |

The live source contains 23 valid feature rows. The old field mapping skips all of them when run against the current Sheet.

### WeaponBases, WeaponProfiles, and WeaponEnhancements

- `WeaponBases.weaponKey` and `WeaponEnhancements.enhancementKey` are globally unique stable IDs.
- Every `WeaponProfiles.weaponKey` must resolve to a weapon base.
- Profile action/cost/roll fields follow the same scalar contracts as Techniques.
- Tag and prerequisite comparisons are case-normalized but preserve display text separately.
- Rank maps use the same parser as Techniques.

The observed live counts match the frozen release: 31 bases, 33 profiles, and 31 enhancements.

## Grant expression contract

Syntax is one expression per line:

```text
type | field=value | field=value
```

Observed source types are `skill`, `technique`, `feat`, `weapon`, `weapon-enhancement`, `specialization`, `familiar`, and `resource`. Runtime code additionally knows `technique-choice`, `equipment`, and some source-owned choice semantics.

Current inconsistencies that must be resolved in the shared registry:

- `familiar` and `resource` appear in the Sheet but are rejected by both exporter/runtime grant allowlists.
- Live `feat` grants use `type`, `classKey`, and `level`, which the exporter field allowlist rejects.
- Live weapon grants use `tag`; the exporter field allowlist rejects it.
- `resource.count=primary attribute` is symbolic, but the exporter currently requires integer `count`.
- A `technique` grant with `skill` and no name is adapted to `technique-choice`; this normalization must be shared rather than exporter-only.

No new grant type is accepted until its required/optional fields, runtime factory, graph behavior, and serialization behavior are registered together.

## Prerequisite expression contract

Structured syntax matches grants. Observed structured types are `class`, `feat`, `familiar`, `choice`, and `tag`.

Current inconsistencies:

- Live `class` prerequisites use `classKey`; the exporter allowlist expects `key`/`name` and rejects `classKey`.
- Live `feat` prerequisites use `featKey`; the exporter rejects it.
- Live `familiar` prerequisites use `minCount`; both exporter and runtime registries lack this contract.
- Twenty rows still contain prose-only prerequisites such as `Heavy Weapon` or `granted`. They must be treated as explicit legacy text findings, not silently interpreted as structured rules.

OR values such as `tag=ranged OR thrown` are arrays after normalization. Cross-reference validation occurs after parsing.

## Required validation before artifact writing

The staging validator must reject:

- missing or unknown sheets/headers;
- blank or duplicate stable IDs;
- unsupported row, grant, prerequisite, boolean, or status enums;
- fields not permitted for their expression type;
- malformed integer/rank-map/cost values;
- unresolved class, origin, feat, technique, weapon, enhancement, parent, choice, or grant references;
- owner/child scope mismatches;
- option groups without a valid positive `chooseCount`;
- generated records with blank names or invalid owner buckets.

Warnings are reserved for intentional editorial incompleteness that the runtime can represent safely. Structural data loss is an error.

## Work Package B sequencing

1. Keep the current release baseline and production freeze intact.
2. Implement shared expression definitions and pure parsing/validation fixtures.
3. Adapt each live tab to a canonical in-memory source model.
4. Validate cross-references and domain invariants.
5. Write only to a staging directory and produce provenance plus artifact diff.
6. Resolve source validation errors in tracked Sheet edits or explicit contract decisions.
7. Review the complete staged diff.
8. Unlock production export only when the live source validates cleanly.
