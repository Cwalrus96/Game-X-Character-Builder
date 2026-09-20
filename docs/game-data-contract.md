# Game-data source contract

Status: living source/runtime contract. Schema-v4 acquisition, adaptation, validation, deterministic schema-v2 staging, reviewed publishing, and rollback are implemented and accepted.

Last updated: 2026-09-20.

## Canonical source and versions

The canonical editable source is the native Google Sheet [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit).

| Property | Current value |
|---|---|
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Published release Drive version | `647` |
| Published release Drive modified time | `2026-08-09T02:27:03.310Z` |
| Current authoring checkpoint | September 20 Trait source/display migration: 77 distinct Traits, 151 observed Techniques, and 120 main catalogue entries; authoring extensions remain outside runtime release acceptance |
| Source schema | `4` |
| Grant syntax | `2` |
| Prerequisite syntax | `2` |
| Production runtime release schema | `2` (reviewed candidate `20260809T022801911Z-51956`) |
| Staged runtime artifact schema | `2` |
| Production export status | Exact reviewed publisher only; generic export frozen |

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

The counts above describe the reviewed release's source snapshot, not the current authoring workbook. The `Schema` tab is the authoring field list; the current runtime adapter still requires its accepted 152-field contract.

### Current authoring extension (export integration deferred)

The user approved the September 19 migration even if it does not export. All archetype feats now live in `Feats`, with `archetypeKey` on each top-level member and `archetypeName` once on the entry feat. Nested OPTION rows inherit the parent membership. Class/category and `featType` retain their existing meanings. Prior-feat counts have a single authored representation in `prerequisites`: `archetype | <archetypeKey> | numFeats=N`; no same-group condition means zero. The canonical `ArchetypeFeats` tab was removed; the display workbook generates its compatibility view directly from Feats.

All unfinished techniques live in `Techniques`, with `selectionMode=draft`, blank unknown ranks/skills/costs, `energyCostKind=unassigned` for an unknown Energy cost, and preserved original wording/provenance. The canonical `TechniqueDrafts` tab was removed. The earlier authoring migration reached 112 technique keys; subsequent user edits removed `brutal-strength` and `bullet-spray`, leaving 110 before the weapon migration. Those removals and the user's intervening feat/ClassSkills insertions are preserved. Deflect Projectile is reused rather than duplicated. The handbook must display incomplete mechanics explicitly and must not infer rank zero or a free Energy cost.

The approved weapon migration adds 31 uniquely named techniques, initially bringing the catalogue to 141: 19 basic attacks and four alternatives from canonical profiles use `selectionMode=granted-only`; four Rank 2 basics and four alternatives omitted from the canonical profiles are restored from the current handbook as `draft`. The user's subsequent removal of `snap-kick` and `crooked-cobra` leaves 139 techniques, with all 31 weapon additions intact. Nine former critical profiles become `onCriticalSuccess` riders. Iaijutsu remains a Katana trait. All 33 former `WeaponProfiles!A2:AE34` records are retired after migration readback; the exact header and hidden tab remain as an empty acquisition-compatibility placeholder, and their Schema declarations are deprecated. The source no longer maintains editable copies of the same attacks in both tabs.

`WeaponBases` appends column I `techniqueKeys` and column J `traitsText`. The 22 populated base relationships contain 32 technique references: the 31 new techniques plus Machine Gun's existing `covering-fire` draft. The four previously empty Rank 2 base tag lists are filled from the handbook; source provenance is retained. The intended acquisition rule is automatic access while wielding the corresponding weapon, without spending ordinary technique choices. Draft records remain incomplete and unavailable for runtime grants until their mechanics are resolved.

The completed follow-up presentation separates the main alphabetical catalogue from weapon-base actions without removing source records. The 31 base-specific techniques remain in canonical Techniques and the shared `_TechniqueBlocks` display pool, but are excluded from the main catalogue. At the observed 139-record source checkpoint this produces 108 main catalogue entries; regenerate counts from fresh source after further user edits. All 31 WeaponBases cards embed the complete formatted blocks for their ordered technique references, resolving all 32 references through that same pool; Machine Gun's generic Covering Fire remains in the main catalogue as well as its base card. A technique is excluded from the main catalogue only when it has the exact weapon-specific prerequisite `weapon | key=<base> | wielded=true` and is referenced by that base's `techniqueKeys`. The approved damage/pumping update was read back across 73 cells on 23 basics, preserving the user's concurrent Deflect Energy skill/rank edits. Display/handbook checks passed for all 153 linked base/main/excerpt entries in text and non-whitespace bold/italic styling; the superseded Weapon Damage table was removed after verification. This authoring acceptance does not establish runtime release readiness.

The combat skill is now **Ranged Weapons**, with canonical skill key `ranged-weapons`, replacing the former Targeting label/key across authored skill values and references. This skill migration does not rename unrelated stable technique, feat, weapon, or enhancement identities merely because their keys contain the same word. Published data and saved characters may still contain the legacy skill identity and require the separately maintained compatibility path.

The September 20 Trait migration adds a canonical `Traits` tab with 77 distinct records: 25 existing Monster/Familiar Traits, 25 Mech upgrades, 19 Metamorphic adaptations, and eight approved Origin features. Overlapping mechanics remain separate pending review; 16 populated duplicate groups identify candidates without merging their effects, prerequisites, ranks, or drawbacks. Fourteen associated actions were appended to canonical `Techniques`, preserving the 137 records in the fresh prewrite snapshot and producing 151 observed Techniques, of which 120 are in the main catalogue. These counts are checkpoints rather than assumptions for future work. Eleven existing ClassFeatures/OriginFeatures provider rows now reference the Trait records, retaining their activation and selection rules. The universal format and relationships are specified under [Traits](#traits-authoring-extension).

These are intentional authoring/display extensions. New Feats fields/order, archetype prerequisites, blank technique ranks/skills, WeaponBases technique/trait relationships, the `Traits` table, and provider `traitKeys` remain outside parts of the accepted exporter/runtime contract. Neither source migration establishes executable Trait grants, Familiar/Mech/form state, or automatic weapon techniques. Exporter integration and runtime-data publishing are deferred; all nine frozen production JSON files and the release contract remain unchanged. The next runtime-data release requires separate compatibility work, successful staging, and publish approval. See [data-pipeline.md](data-pipeline.md#handbook-display-and-linked-table-formatting) for the authoring and linked-table workflow.

### Canonical adapter model

The XLSX reader is domain-neutral: it preserves sheet order, exact headers, raw cell values, and physical row numbers. The schema-v4 adapter then produces flat collections for all ten runtime-source tabs plus normalized `metadata`, `schema`, and `enums` contracts. Every adapted record retains `{ sheet, row }` source location.

Headers must exactly match the ordered schema-v4 contract. `Schema` declarations must cover those same 152 fields without unknowns, duplicates, omissions, or reordered declarations. Scalar parsing is strict for integers, numbers, booleans, rank maps, tag/key lists, and energy-cost alternatives. An invalid populated row is retained when structurally possible and accompanied by a diagnostic; it is never silently dropped or repaired from display text.

Nested class/feat/origin feature rows remain flat during adaptation. Their stable owner key and `parentKey` are copied only from the row itself. Building and validating owner/parent relationships belongs to whole-model validation, never spreadsheet row order.

## Global source rules

### Stable identity

- New stable keys use lowercase kebab case.
- Existing weapon/enhancement snake_case keys remain frozen until saved-state aliases and migrations exist.
- Display names are never persistence or cross-reference identity.
- `OPTION` rows require a stable `parentKey` resolving to an `OPTION_GROUP` in the same owner scope.
- An `OPTION_GROUP` may itself have a stable `parentKey` resolving to another `OPTION_GROUP`; recursive nesting is preserved in runtime artifacts.
- `OPTION_GROUP` rows require a positive explicit `chooseCount`; parser fallback `1` is compatibility only, not an authoring rule.
- Every answer-producing grant has a stable explicit `choiceId` or an unambiguous typed source-owned identity derived from its stable owning feature. Explicit IDs are required when another expression must address that exact answer through `choiceRef`; they are not duplicate copies of every owning `featureKey`.

Descriptions are optional presentation content on every runtime-source tab. A blank description never makes an otherwise complete record invalid or unselectable. Mechanical readiness is determined only from typed mechanical fields, status, and selection mode.

### Status and selection

`status` values:

- `playable`: complete and eligible for normal selection;
- `draft`: exported but unavailable in normal selection;
- `incomplete`: exported but unavailable because required mechanics remain incomplete.

All 19 classes export; the seven currently playable classes are Ninja, Magical Guardian, Monster Tamer, Spirit Warrior, Weapon Master, Henshin Hero, and Metamorph. Origins use the same export-versus-selectability policy.

`selectionMode` values:

- `selectable`: may appear in a normal picker when other Rules pass;
- `granted-only`: may exist only through a grant and must never be offered directly.
- `draft`: exported for review but unavailable through normal selection or grants; incomplete mechanics are reported as warnings.

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

Weapon Master receives both Melee Weapons and Ranged Weapons. Strength makes Melee fast and Ranged medium; Agility makes Melee medium and Ranged fast. The published release's older skill identity is compatibility input, not the current authoring label.

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

### Traits (authoring extension)

A Trait represents a passive benefit or capability, usually a physical component. Its provider determines who receives it, when it is active, and how it is chosen. A Trait may refer to associated techniques; the action's cost, roll, targeting, and outcome belong to its canonical Technique record. Formatting a feature as a Trait does not itself make that feature universally selectable or authorize conversion of every other passive class feature.

`Traits!A:L` has the following ordered authoring fields:

| Field | Meaning |
|---|---|
| `traitKey` | Unique stable identity; display names and source variants may overlap. |
| `name` | Player-facing Trait name. |
| `rank` | Authored base rank; blank means unknown, never Rank 0. |
| `prerequisites` | Authored player-facing requirements; currently prose, not a new executable prerequisite DSL. |
| `tags` | Authored tags only; blank does not justify inventing a classification. |
| `description` | Unlabeled benefit text, choices, limits, and ordinary prose naming associated techniques. |
| `rankNotes` | Preserved higher-rank benefits written as `Rank N+` lines. |
| `techniqueKeys` | Ordered comma-separated stable references to canonical associated Techniques. |
| `selectionMode` | Authoring readiness; unresolved records remain `draft`. |
| `duplicateGroup` | Editorial group for possible overlap; blank when no shared review group remains. |
| `reviewNotes` | Concise visible review notes, including source-variant identification or unresolved mechanics. |
| `sourceNote` | Internal source provenance, omitted from the player-facing block. |

The book block has a bold `Name - Rank N` title, separate lines with bold `Prerequisites:` and `Tags:` labels, one blank line, and the authored body and rank notes. Do not add Benefit, Choice, Scaling, or Techniques subsection labels. Blank prerequisites render `None`; blank tags render an em dash; unknown rank renders `Rank ?`. Draft or unknown-rank records retain an italic `Incomplete Trait` notice. Possible-duplicate labels and review notes are italic. Associated techniques are named in ordinary Trait prose and rendered in the existing Technique catalogue, without copying full action blocks into the Trait.

`ClassFeatures` and `OriginFeatures` append column N `traitKeys`, an ordered comma-separated list of stable references. This relationship identifies the provider's available or supplied Traits; it does not mean every listed Trait is automatically granted. The provider's prose retains counts, permitted selections, recipients, activation costs, duration, form switching, and other source-specific rules. Likewise, a Trait `techniqueKeys` relationship does not override any higher-rank access condition in its description or rank notes.

The migration preserves all 77 identities and mechanics without merging any overlap. Source rank bases, choices, drawbacks, and parameter options remain explicit; unknown values stay unknown. Duplicate groups do not establish stacking, replacement, equivalence, or a universal scaling rule. Broader feature-family conversions, including Fighting Styles, require their own consistent scope and approval. WeaponBases `traitsText` remains its existing authoring field until a separately approved integration addresses it.

Trait source/display acceptance is distinct from runtime support. The accepted adapter does not yet normalize Traits or `traitKeys`; the typed grant/prerequisite registries have no Trait type, and character schema v5 has no dedicated Trait/Familiar/Mech/form state. Future integration must define provider and recipient ownership, selection/rank rules, stable reference validation, codec/migration implications, and graph reconciliation through the existing shared Rules/session architecture. Do not use display prose as executable rules, silently drop the new records, or mark them runtime-ready because the display renders them.

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

#### Compact damage and pumping

The current authoring default expresses linear damage growth once in `damage` and leaves `damageByRank` blank. State the starting damage, increment, and exact rank basis/minimum. Do not repeat that rule as a per-rank damage enumeration or explanatory `rankNotes`; retain an explicit `damageByRank` map for irregular progression.

Canonical compact examples are Spirit Blast's `3 + Hits; +3 damage per Martial Arts rank above 1.` and Spacium Ray's `2 + Hits; +2 damage per Henshin Arts rank above 1.`. Both leave `damageByRank` blank. Their pumping maps retain all source rank/value entries: Spirit Blast renders Ranks 1–2 at +1 damage/Energy, 3–4 at +2, and 5–6 at +3; Spacium Ray renders Ranks 1–3 at +1, 4–5 at +2, and 6 at +3. These are different schedules, not a universal pumping formula.

The shared renderer groups only adjacent ranks with equal pumping coefficients and matching units. Do not bridge rank gaps, merge nonconsecutive equal runs, or replace armor/ward units with damage. Preserve authored higher-rank benefits and meaningful `rankNotes`, including Spirit Blast's minimum 1 Energy; remove only explanations duplicated by the compact damage/pumping rules. The compact-format rollout has separate source/display/handbook verification from the earlier weapon refinement checkpoint.

Full technique blocks omit the repetitive provider/availability line, including intended availability for drafts. Weapon-base cards also omit their automatic-availability sentence. This is a presentation rule: retain source provider relationships, selection modes, prerequisites, costs, the skill Access line, and explicit `Incomplete technique` and missing-mechanic notices.

### Origins

`originKey` is stable identity and source row order is canonical unless a future explicit sort field is added. `questions`, `futureUpgradesText`, and `examplesText` are the current source fields; obsolete exporter aliases such as `roleplayQuestionsText` are adapter concerns only.

### Weapons

- Weapon-base and enhancement keys retain established snake_case identity.
- In the published legacy format, every profile's `weaponKey` must resolve to a base. In current authoring, `WeaponProfiles` is a hidden header-only compatibility tab; attacks are Techniques.
- `WeaponBases.techniqueKeys` is an ordered comma-separated list of stable technique keys automatically provided while the weapon is wielded. It records the source relationship; it is not a second copy of attack mechanics or permission to offer granted-only techniques in ordinary selectors.
- `WeaponBases.traitsText` is player-facing multiline text for non-action traits. Iaijutsu belongs here, while Machine Gun also records its existing Covering Fire relationship. Editorial `notes` remain separate.
- New weapon techniques require `weapon | key=<weaponKey> | wielded=true`, with human-readable `prerequisiteText` of `Wielding <base name>.`. Existing base minimum ranks and canonical attack ranks are preserved.
- Basic-attack damage scales automatically with weapon rank under the approved growth rule below. Optional pumping is a separate addition. Both use the weapon's rank, never the character's combat-skill rank.
- Critical profiles are normal `onCriticalSuccess` riders. A basic attack with an alternative may deal normal damage and apply the named alternative's effect instead of multiplying damage. Shuriken Distracting Attack retains its own Distracted 3 critical result.
- `tagKeys` provides normalized mechanical tags while `tags` preserves display text.
- A weapon grant's tag fields filter which weapon may be chosen; they do not add those tags to the selected weapon.
- `choiceId` owns the selected answer and `choiceRef` connects later grants/enhancements to that answer.
- Granted-only enhancements are acquisition mode, not prose prerequisites.

The initial migration preserved the original damage/pump tables: seventeen basics had variable pumping, and the four formerly blank free Shuriken/Shield basic/alternative action costs became explicit fixed zero. The approved follow-up supersedes that basic-attack treatment for all 23 basics. It preserves each attack's current damage at its base's minimum rank and adds the following amount automatically for every weapon rank above that minimum, through Rank 6:

| Damage growth per weapon rank | Basic attacks | Count |
|---|---|---:|
| +3 | Baseball Bat, Kitchen Knife, Rock / Brick, Broomstick, Longsword, Katana, Pistol, Spear, Rifle, Axe, Shotgun, Gunblade, Machine Gun | 13 |
| +2 | Bow, Daggers / Kunai Melee, Daggers / Kunai Thrown, Shuriken, Shield, Staff, Chain Sword, Grenade Launcher | 8 |
| +4 | Greatsword, Warhammer | 2 |

The rule is `starting damage + growth × (weapon rank − base minimum rank)`, plus the attack's existing Hits term and any optional pumping. Author all 23 linear basics as a compact `damage` line anchored at the base minimum rank, with blank `damageByRank`; retain the starting damage and growth amounts above. This replaces the former special Rank 6 jump; it does not change Grenade Launcher's separate 6 splash damage or Chain Sword's +2 damage per sustained round.

Every basic attack costs 0 Energy before optional pumping. All 23 therefore use `energyCostKind=variable` with blank numeric `energyCost`; omit the redundant zero-Energy sentence from the printed block. Pumping remains unavailable at Rank 0, adds +1 damage per Energy at Ranks 1–2, +2 at Ranks 3–4, and +3 at Ranks 5–6. Apply this existing pumping rule to the six basics previously missing it: Shuriken, Shield, and the four Rank 2 basics. A blank numeric cost is the variable-cost representation, not a general blank-means-zero rule.

For these basics, remove only the exact redundant sentence `0 Energy before optional pumping.` from `rankNotes`. Preserve the four Rank 0 no-pumping notes and all other meaningful notes. Keep all pumping map values; the shared renderer supplies the grouped rank ranges without duplicating that schedule in notes.

Alternative-use outcomes and costs are unchanged by this refinement. Shuriken Distracting Attack and Shield Bash retain fixed zero Energy; Pistol Bullet Spray and Shotgun Buckshot Blast retain 2 Energy. Pistol Bullet Spray's missing damage/effect remains unresolved. All eight added Rank 2 techniques remain draft: the four basics receive the approved damage and optional-pumping rules but retain unknown action costs and other unresolved fields; the four alternatives keep their existing costs, including Machine Gun Bullet Spray's 2 Actions and 4 Energy. The other unknown alternative Energy/action fields remain unassigned. Timed Explosion's free detonation reaction does not assign a cost to its unspecified initial launch. Referencing draft Covering Fire from Machine Gun does not make that technique complete.

## Grant expression contract v2

One grant per line:

```text
type | field=value | field=value
```

Fields are type-specific. A global “any known field on any grant” allowlist is invalid. `GRANT_EXPRESSION_REGISTRY` encodes each type's required/optional fields, scalar types, aliases, defaults, and runtime status. Exporter validation and runtime loading both use the pure parser/normalizer in `public/js/core/game-data-expressions.js`.

The normalized runtime shape retains the established compact keys (`key`, `name`, `skill`, `tag`, and `level`) while accepting descriptive schema aliases such as `techniqueKey`, `skillKeys`, `tagKeys`, `featKey`, `maxLevel`, `weaponKey`, and `enhancementKey`. Aliases are type-specific. Supplying an alias and its normalized field together is a duplicate-field error rather than an overwrite.

Canonical source grant types:

| Type | Source meaning | Runtime implementation boundary |
|---|---|---|
| `technique` | Specific `techniqueKey`, or a source-owned filtered technique choice when only skill/filter fields are present. | Typed and normalized; existing graph/widget handling remains partial. |
| `skill` | Specific skill or source-owned skill choice. | Typed and normalized; existing runtime handling retained. |
| `feat` | Source-owned feat choice filtered by type/category/maximum level. | Typed and normalized; factory work remains. |
| `resource` | Limited named resource; `resourceKey` is identity and `count` is a capacity expression. | Typed capacity, initialization, clamping, and prerequisite semantics implemented. |
| `familiar` | Familiar/companion grant. | Typed and preserved; runtime subsystem explicitly `stubbed`. |
| `weapon` | Specific or tag-filtered source-owned weapon choice. | Partial. |
| `weapon-enhancement` | Enhancement, optionally connected through `choiceRef`. | Partial. |
| `option` | Additional answer from an existing option group. | Typed and normalized; factory work remains. |
| `choice` | Generic source-owned answer when no dedicated subsystem exists. | Typed and normalized; factory work remains. |
| `bond` | Bond creation/choice. | Adapter/factory work pending. |
| `specialization` | Skill/tag specialization. | Partial. |
| `vehicle` | Vehicle grant. | Typed and preserved; runtime subsystem explicitly `stubbed`. |
| `gadget` | Gadget or skill selection. | Typed and preserved; runtime subsystem explicitly `stubbed`. |
| `rank` | Applies `operation=set` or `operation=increase` with a nonnegative `value` to the answer addressed by `choiceRef`. | Typed and preserved; source-owned modifier execution is explicitly `stubbed`. |
| `choice-rebind` | Reopens the answer addressed by `choiceRef`, optionally narrowing the replacement by `answerType`, `rank`, or `maxRank`. | Typed and preserved; overlay storage/UI/reconciliation is explicitly `stubbed`. |

Runtime-only compatibility types such as `technique-choice` and `equipment` must be represented as deliberate normalized outputs/aliases in the same registry, not exporter-only magic.

### Resource semantics

A `resource` grant creates a stable named limited resource. Its count expression defines capacity. The character sheet initializes current amount to capacity and lets the player edit it from zero through that capacity. Resources may satisfy prerequisites. `Charms` is the first concrete resource.

Symbolic counts such as “primary attribute”, `heart`, or another stable lowercase hyphen key parse as `{ kind: "symbol", symbol: "..." }`; numeric counts parse as `{ kind: "constant", value: N }`. Resolution uses the explicitly supplied rule context and never guesses a value from prose. Resource state initializes `current` to resolved capacity and clamps edits to the inclusive range zero through capacity. Resources are keyed by `resourceKey` and can satisfy typed `resource` prerequisites by capacity.

### Familiar semantics

Familiar grants and count/rank prerequisites are valid source data. The builder subsystem may remain stubbed until its roadmap slice, but the exporter must preserve the typed meaning and report unsupported runtime behavior explicitly rather than discard the grant.

### Rank and choice-rebind semantics

`rank` is generic and source-relative. It never embeds a familiar or weapon subsystem name. `operation=set` supplies the source-owned rank while active; `operation=increase` adds its value to the referenced answer's preceding effective rank. Removing the source removes that modifier rather than permanently mutating the answer.

`choice-rebind` is also generic. The original answer remains stored and validatable against the original grant. A player's replacement is stored as an overlay owned by the feature that supplied the rebind and is validated against that rebind's constraints. Active overlays compose in stable feature-progression order; removing a later feature reveals the preceding overlay or base answer. `answerType` may identify a nested answer class such as `weapon-enhancement` without changing the generic rebind operation itself.

## Prerequisite expression contract v2

Syntax matches grants. Separate lines are AND conditions. Within a supported field, `A OR B` means either value satisfies that field.

Canonical structured source types currently include:

- `class`: stable `classKey` plus minimum level;
- `feat`: stable `featKey`;
- `familiar`: count/rank requirements such as `minCount`;
- `choice`: properties of the source-owned answer referenced by `choiceRef`;
- `weapon`: one weapon satisfying a stable `key` and/or `tag`, `tagAll`, `tagAny`, `tagNot`, `minReach`, and `wielded` predicates;
- `weapon-set`: an explicit `count` of wielded weapons satisfying the same tag/reach predicates.

`PREREQUISITE_EXPRESSION_REGISTRY` also preserves existing runtime types such as origin, attribute, skill, tag, resource, and explicit legacy text. Weapon and weapon-set tag/reach predicates are executable against normalized character weapons. Familiar prerequisites remain typed but explicitly stubbed. Unstructured legacy text is preserved as a manual rule with a diagnostic; it is never mistaken for executable structured data. `selectionMode=granted-only` must never be encoded as prerequisite prose.

For example, `weapon | key=longsword | wielded=true` requires the corresponding wielded base. The expression parser accepts this existing grammar; that fact alone does not implement the new `WeaponBases.techniqueKeys` acquisition relationship in the exporter or runtime graph.

Separate nonblank lines are ordered AND conditions. Within registry fields marked as references, `A OR B` normalizes to an ordered array. Parsing returns `{ ok, value/values, diagnostics }`; diagnostics retain caller-provided sheet/row/column/cell context. Unknown types, type-specific unknown fields, duplicate aliases, missing requirements, and invalid scalars are errors. The pure parser performs no file I/O and never exits the process.

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

`scripts/game-data/model-validator.mjs` implements this boundary. Errors block artifact construction; warnings preserve complete meaning while identifying an intentional limitation, currently including typed grants whose runtime subsystem is explicitly stubbed. Findings are sorted by canonical tab order, physical row, source column, and stable detection order. Validation includes adapter diagnostics rather than replacing or hiding them.

Whole-model identity and reference rules include:

- global stable identities for classes, techniques, feats, origins, weapon bases, and enhancements;
- owner-scoped class/origin feature identities and explicit composite identities for class-skill relationships and weapon profiles;
- same-owner and same-category option-parent resolution without row-order inference;
- stable class/origin/feat/technique/weapon/enhancement references and unambiguous `choiceId`/`choiceRef` resolution;
- rejection of display-name-only identity references;
- status-derived and selection-mode-derived selectability;
- playable-class readiness, class-skill progression/condition consistency, technique cost-kind readiness, nonnegative costs, normalized tags, and explicit positive option-group counts.
- class primary-attribute conditions compare normalized values case-insensitively while preserving player-facing capitalization;
- optional fields in a composite identity may be blank when every required identity component is present.

## Staged runtime artifact schema v2

Artifact construction accepts only a canonical model whose whole-model validation result has no errors. It produces `classes.json`, `class-skills.json`, `class-features.json`, `feats.json`, `techniques.json`, `origins.json`, `weapon-bases.json`, `weapon-enhancements.json`, and the combined `game-x-data.json`. Source row order remains canonical within arrays; object keys and JSON serialization are canonicalized for deterministic bytes.

The combined artifact records source schema, exporter version, and the exact stable source revision (`fileId`, Drive version, modified time, and normalized-model SHA-256). The raw XLSX SHA-256 identifies one transport export and remains in source provenance and run reports because Google may generate byte-distinct XLSX ZIPs for an unchanged native Sheet revision. Raw transport hashes and volatile fetch/export times do not belong in runtime bytes. Split artifacts must equal their corresponding combined fields, and freshly serialized output must pass current runtime getters, technique indexing, and grant loading before any artifact files are installed.

Schema v2 is the production runtime contract. `WPB-PUBLISH` promoted the exact approved bytes from immutable run `20260809T022801911Z-51956`; the release contract and baseline preserve the approved source/model/artifact hashes. Future releases must repeat acquisition, validation, staging, complete diff review, and separately approved publishing.

## Published schema-v1 to schema-v2 transition

The reviewed transition from schema v1 included, among other content changes:

- removal of the stale class-feature owner bucket `5`;
- removal of the empty feat record;
- restoration of current OriginFeatures;
- all 19 classes exported with only playable classes selectable;
- stable technique keys and structured costs;
- normalized class skills and new/expanded typed grants.

The exact complete diff and hashes are preserved in [game-data-release-candidate-2026-08-08.md](game-data-release-candidate-2026-08-08.md), and the promotion/rollback evidence is preserved in [game-data-release-2026-08-09.md](game-data-release-2026-08-09.md).

## Work Package B handoff

The stable execution sequence is defined in [roadmap.md](roadmap.md):

`WPB-SOURCE-SYNC` → `WPB-EXPRESSIONS` → `WPB-ADAPTERS` → `WPB-REFERENCES` → `WPB-STAGING` → `WPB-SOURCE-RESOLUTION` → `WPB-DIFF-REVIEW` → `WPB-PUBLISH`.
