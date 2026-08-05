# Game-data source contract

Status: living source-schema contract. Work Package B has not yet certified or published a schema-v4 runtime export.

Last updated: 2026-08-04.

## Canonical source and versions

The canonical editable source is the native Google Sheet [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit).

| Property | Current value |
|---|---|
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Observed Drive modified time | `2026-08-04T02:05:29.623Z` |
| Source schema | `4` |
| Grant syntax | `2` |
| Prerequisite syntax | `2` |
| Runtime release schema | `1` (frozen June 29 artifacts) |
| Production export status | Frozen |

`contracts/game-data-source.json` is the machine-readable locator and MIME/schema expectation. It contains no credentials. `contracts/game-data-release-baseline.json` protects the exact checked-in production artifacts. These contracts describe different things and must not be conflated.

The Google Sheet is editable source. Any XLSX file is only a point-in-time transport snapshot and must be acquired with `npm run fetch:data`; it is ignored by Git.

## Authority rules

1. The canonical Sheet owns structured runtime data.
2. The Player Handbook is used to fill omissions, but complete newer Sheet mechanics win when they intentionally differ.
3. Every Sheet row is exported. Eligibility for ordinary selection comes from `status`, `selectionMode`, prerequisites, and Rules—not omission from export.
4. The display workbook is a human-readable downstream view. Its hidden compatibility adapters and rich-text outputs are not canonical runtime fields.
5. The workbook's `Metadata`, `Schema`, and `Enums` tabs are part of the source contract.
6. Unknown/missing headers, invalid values, or unresolved references are diagnostics; the exporter must not silently coerce or skip them.

## Workbook topology

### Contract/documentation tabs

- `README`: human operating contract; not emitted.
- `Metadata`: source/syntax versions, canonical IDs, and authority policies.
- `Schema`: one row per allowed field with type, required condition, format/default, and description.
- `Enums`: allowed values and their semantics.

### Runtime-source tabs

| Tab | Stable identity | Normalized rows observed after cleanup |
|---|---|---:|
| `Classes` | `classKey` | 19 |
| `ClassSkills` | class/skill/role/condition relationship | 66 |
| `ClassFeatures` | `classKey` + `featureKey` | 103 |
| `Techniques` | `techniqueKey` | 85 |
| `Feats` | `featKey` | 38 |
| `Origins` | `originKey` | 15 |
| `OriginFeatures` | `originKey` + `featureKey` | 23 |
| `WeaponBases` | `weaponKey` | 31 |
| `WeaponProfiles` | documented composite identity pending a future `profileKey` decision | 33 |
| `WeaponEnhancements` | `enhancementKey` | 31 |

The `Schema` tab is the exhaustive field list. This document records cross-field meaning and runtime adaptation rather than duplicating all 152 field rows.

## Global source rules

### Stable identity

- New stable keys use lowercase kebab case.
- Existing weapon/enhancement snake_case keys remain frozen until saved-state aliases and migrations exist.
- Display names are never persistence or cross-reference identity.
- `OPTION` rows require a stable `parentKey` resolving to an `OPTION_GROUP` in the same owner scope.
- `OPTION_GROUP` rows require a positive explicit `chooseCount`; parser fallback `1` is compatibility only, not an authoring rule.
- Every answer-producing grant has a stable `choiceId`, a stable `choiceRef`, or an unambiguous typed source-owned choice definition.

### Status and selection

`status` values:

- `playable`: complete and eligible for normal selection;
- `draft`: exported but unavailable in normal selection;
- `incomplete`: exported but unavailable because required mechanics remain incomplete.

All 19 classes export; the seven currently playable classes are Ninja, Magical Guardian, Monster Tamer, Spirit Warrior, Weapon Master, Henshin Hero, and Metamorph. Origins use the same export-versus-selectability policy.

`selectionMode` values:

- `selectable`: may appear in a normal picker when other Rules pass;
- `granted-only`: may exist only through a grant and must never be offered directly.

`Dazzling Transformation` and the `soulbound` weapon enhancement are examples of granted-only source records. “Granted” is acquisition mode, not a fake prerequisite.

### Editorial and display fields

- `notes` is internal/editorial and is not player-facing by default.
- `sourceNote` records provenance or an unresolved editorial comparison.
- `grantText` is a human-readable fallback for downstream formatters that do not yet render a typed grant.
- Deprecated `grantNotes` and `Classes.levelUp` remain blank only for compatibility.
- Level-up mechanics belong to Rules, not workbook prose.

## Domain adaptation

### Classes and ClassSkills

`Classes.classKey` is the owner/selection identity. A class row always exports; `status` determines picker eligibility. Required playable mechanics include health progression and primary-attribute choices.

`ClassSkills` is the normalized mechanical source for class skill relationships. Its important fields are:

- `classKey`;
- `skillKey` and `skillName`;
- `role`: `combat-technique`, `combat-defense`, or `utility-option`;
- `progression`: `fast`, `medium`, or `slow` when applicable;
- `whenPrimaryAttribute` for conditional progression;
- `choiceGroup` and `displayOrder`.

Legacy `Classes.combatTechniqueSkill`, `combatSkills`, and `utilitySkillOptions` remain only for display compatibility. Runtime adaptation must use `ClassSkills` once schema-v4 export is enabled.

Weapon Master receives both Melee Weapons and Targeting. Strength makes Melee fast and Targeting medium; Agility makes Melee medium and Targeting fast.

### ClassFeatures, Feats, and OriginFeatures

These tabs share nested row semantics:

- `FEATURE`: automatic or individually selectable feature;
- `OPTION_GROUP`: source-owned choice with `chooseCount`;
- `OPTION`: answer owned by `parentKey`.

Owner fields are always explicit (`classKey`, feat category/parent, or `originKey`). Exporters must never infer owners by carrying the previous row forward.

Feats use:

- `category` as a stable category, not necessarily a class forever;
- `featType` (`class`, `archetype`, or `general`);
- structured prerequisites for class/level requirements;
- `chooseCount` and `parentKey` for nested options.

Do not restore obsolete `classKey`, `minLevel`, or `review` source columns. If future behavior needs another classification, extend `featType`/Enums deliberately.

### Techniques

`techniqueKey` is stable identity; `techniqueName` is display text. `skillKeys` and `tagKeys` are normalized mechanical keys while legacy display text can be preserved separately.

Energy costs use these fields together:

| `energyCostKind` | `energyCost` | `energyCostOptions` |
|---|---|---|
| `fixed` | required nonnegative number | blank |
| `variable` | blank | pump/variable rule represented by the technique |
| `conditional` | base/default nonnegative number | required named alternatives |
| `unassigned` | blank | blank; content is not release-ready |
| `unspecified` | blank | temporary migration finding; not playable fixed cost |

Legacy `-1`, `N`, blank-means-zero, and `0 or 3` sentinels are not allowed in canonical source. Pinning Ammunition is represented as base `0` plus `pin-only=0; pin-and-attack=3`.

`prerequisites` is structured mechanical data. `prerequisiteText` is optional human-readable display text; runtime code must not parse it into rules.

### Origins

`originKey` is stable identity and source row order is canonical unless a future explicit sort field is added. `questions`, `futureUpgradesText`, and `examplesText` are the current source fields; obsolete exporter aliases such as `roleplayQuestionsText` are adapter concerns only.

### Weapons

- Weapon-base and enhancement keys retain established snake_case identity.
- Every profile's `weaponKey` must resolve to a base.
- `tagKeys` provides normalized mechanical tags while `tags` preserves display text.
- A weapon grant's tag fields filter which weapon may be chosen; they do not add those tags to the selected weapon.
- `choiceId` owns the selected answer and `choiceRef` connects later grants/enhancements to that answer.
- Granted-only enhancements are acquisition mode, not prose prerequisites.

## Grant expression contract v2

One grant per line:

```text
type | field=value | field=value
```

Fields are type-specific. A global “any known field on any grant” allowlist is invalid. `WPB-EXPRESSIONS` will encode required/optional fields and scalar types in one shared registry.

Canonical source grant types:

| Type | Source meaning | Runtime implementation boundary |
|---|---|---|
| `technique` | Specific `techniqueKey`, or a source-owned filtered technique choice when only skill/filter fields are present. | Partial; shared normalization pending. |
| `skill` | Specific skill or source-owned skill choice. | Partial. |
| `feat` | Source-owned feat choice filtered by type/category/maximum level. | Registry/factory completion pending. |
| `resource` | Limited named resource; `resourceKey` is identity and `count` is a capacity expression. | New implementation required. |
| `familiar` | Familiar/companion grant. | Source semantics accepted; runtime subsystem stubbed. |
| `weapon` | Specific or tag-filtered source-owned weapon choice. | Partial. |
| `weapon-enhancement` | Enhancement, optionally connected through `choiceRef`. | Partial. |
| `option` | Additional answer from an existing option group. | New registry handling required. |
| `choice` | Generic source-owned answer when no dedicated subsystem exists. | New registry handling required. |
| `bond` | Bond creation/choice. | Adapter/factory work pending. |
| `specialization` | Skill/tag specialization. | Partial. |
| `vehicle` | Vehicle grant. | Source semantics accepted; runtime subsystem stubbed. |
| `gadget` | Gadget or skill selection. | Source semantics accepted; runtime subsystem stubbed. |

Runtime-only compatibility types such as `technique-choice` and `equipment` must be represented as deliberate normalized outputs/aliases in the same registry, not exporter-only magic.

### Resource semantics

A `resource` grant creates a stable named limited resource. Its count expression defines capacity. The character sheet initializes current amount to capacity and lets the player edit it from zero through that capacity. Resources may satisfy prerequisites. `Charms` is the first concrete resource.

Symbolic counts such as “primary attribute” must be parsed into a typed capacity expression, not coerced to an integer or retained as runtime prose.

### Familiar semantics

Familiar grants and count/rank prerequisites are valid source data. The builder subsystem may remain stubbed until its roadmap slice, but the exporter must preserve the typed meaning and report unsupported runtime behavior explicitly rather than discard the grant.

## Prerequisite expression contract v2

Syntax matches grants. Separate lines are AND conditions. Within a supported field, `A OR B` means either value satisfies that field.

Canonical structured source types currently include:

- `class`: stable `classKey` plus minimum level;
- `feat`: stable `featKey`;
- `familiar`: count/rank requirements such as `minCount`;
- `choice`: properties of the source-owned answer referenced by `choiceRef`;
- `weapon`: one weapon satisfying tag/reach predicates;
- `weapon-set`: multiple wielded weapons satisfying the predicate.

The shared registry may also preserve existing runtime types such as origin, attribute, skill, tag, and explicit legacy text, but it must distinguish structured executable rules from unresolved prose. `selectionMode=granted-only` must never be encoded as prerequisite prose.

## Required validation before artifact construction

Validation must reject:

- missing required tabs or headers and unknown/legacy headers outside a versioned adapter;
- source `Metadata`/`Schema`/`Enums` disagreement;
- blank or duplicate stable IDs;
- unsupported enum values;
- invalid scalar, boolean, integer, rank-map, tag, or energy-cost shapes;
- grant/prerequisite fields not permitted for their type;
- unresolved class, origin, feat, technique, weapon, enhancement, parent, choice, or grant references;
- owner/child scope mismatch;
- option groups without a positive explicit `chooseCount`;
- generated records with blank names or invalid owner buckets;
- playable/selectable records missing required mechanics;
- any normalization that would silently discard source meaning.

Warnings are reserved for intentional editorial incompleteness that runtime artifacts can represent safely. Structural loss is an error. Validation returns all deterministic findings and can run without writing artifact files.

## Frozen-release diff expectations

The frozen schema-v1 release predates the normalized source. Its eventual reviewed diff is expected to include, among other content changes:

- removal of the stale class-feature owner bucket `5`;
- removal of the empty feat record;
- restoration of current OriginFeatures;
- all 19 classes exported with only playable classes selectable;
- stable technique keys and structured costs;
- normalized class skills and new/expanded typed grants.

These are expectations, not permission to publish without the complete `WPB-STAGING` through `WPB-DIFF-REVIEW` gates.

## Work Package B handoff

The stable execution sequence is defined in [roadmap.md](roadmap.md):

`WPB-SOURCE-SYNC` → `WPB-EXPRESSIONS` → `WPB-ADAPTERS` → `WPB-REFERENCES` → `WPB-STAGING` → `WPB-SOURCE-RESOLUTION` → `WPB-DIFF-REVIEW` → `WPB-PUBLISH`.
