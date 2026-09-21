# Game-data source contract

Status: living source/runtime contract. Acquisition and adaptation accept the canonical source schema v5 with expression syntax v3. The versioned v4/syntax-v2 path remains compatible. V5 staging produces runtime artifact schema v3; published production artifacts remain schema v2 until a separately reviewed publication. Parsing and preserving a rule does not establish execution support.

Last updated: 2026-09-21.

## Canonical source and versions

The canonical editable source is the native Google Sheet [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit).

| Property | Current value |
|---|---|
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Published release Drive version | `647` |
| Published release Drive modified time | `2026-08-09T02:27:03.310Z` |
| Current authoring checkpoint | Accepted September 21 schema cleanup; installation/readback evidence and current counts belong in status.md |
| Source schema | `5` (versioned schema-`4` adaptation retained) |
| Grant syntax | `3` (syntax-`2` compatibility retained) |
| Prerequisite syntax | `3` (syntax-`2` compatibility retained) |
| Production runtime release schema | `2` (reviewed candidate `20260809T022801911Z-51956`) |
| Staged runtime artifact schema | `3` for source v5; `2` for source v4 |
| Production export status | Exact reviewed publisher only; generic export frozen |

`contracts/game-data-source.json` is the machine-readable locator and implemented acquisition expectation: source v5, grant/prerequisite syntax v3, and the 13 current tabs. It contains no credentials. `contracts/game-data-release-baseline.json` separately protects the exact published schema-v2 artifacts. Advancing source acquisition does not publish staged bytes.

The Google Sheet is editable source. Any XLSX file is only a point-in-time transport snapshot and must be acquired with `npm run fetch:data`; it is ignored by Git.

## Authority rules

1. The canonical Sheet owns authored game data; a successful adapter/validator/release run is required before it becomes runtime data.
2. The Player Handbook is used to fill omissions, but complete newer Sheet mechanics win when they intentionally differ.
3. Preserve every authored record through export or a source-located diagnostic. Technique readiness (`status`), acquisition (`selection`), prerequisites, and Rules determine availability; display filtering is not permission for the runtime exporter to drop records.
4. The display workbook is a human-readable downstream view. Its hidden compatibility adapters and rich-text outputs are not canonical runtime fields.
5. The workbook's `Metadata`, `Schema`, and `Enums` tabs are part of the source contract.
6. Unknown/missing headers, invalid values, or unresolved references are diagnostics; the exporter must not silently coerce or skip them.

When a copied grant or summary plainly contradicts the complete current mechanic in `description`, preserve the mechanic and repair the formal representation within the reviewed edit scope. Do not change the rule to match the stale copy. Editorial notes, including old assistant-generated notices, do not override authored mechanics or prove that a rule is missing. Remove only notices demonstrably made obsolete by the current content. Read the latest handbook, including manual edits inside managed tables, before refreshing it; its complete prose can supply a missing range or provider condition without replacing intentionally newer Sheet rules.

## Workbook topology

### Contract/documentation tabs

- `README`: human operating contract; not emitted.
- `Metadata`: source/syntax versions, canonical IDs, and authority policies.
- `Schema`: one row per allowed field with type, required condition, format/default, and description.
- `Enums`: allowed values and their semantics.

### Published runtime-source tabs (schema-v4 checkpoint)

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

The counts above describe the reviewed release's source snapshot, not the current authoring workbook. Its v4 adapter retains the ordered 152-field contract. Current v5 uses the 115 fields below; current row counts are recorded in status and acquisition evidence.

### Current source schema v5

The implemented tab set is README, Metadata, Schema, Enums, Classes, ClassFeatures, Techniques, Feats, Origins, OriginFeatures, WeaponBases, WeaponEnhancements, and Traits. ClassSkills and WeaponProfiles are not required source tabs. Internal class-skill relationships are derived; the empty legacy profile collection is retained for compatibility.

Techniques retain stable `techniqueKey` identity and player-facing `techniqueName`. The source renames `skill` to `selection`, `selectionMode` to readiness `status`, `pumpDamageByRank` to generic `pumpingByRank`, and repurposes the redundant `skillKeys` column as optional `associatedSkill`. It removes `damageByRank`, `notes`, `sourceNote`, `prerequisiteText`, and `tagKeys`. Meaningful mechanical notes must be moved into their appropriate retained field before removal; archive editorial provenance in migration evidence. Unknown mechanics remain unknown.

Classes retain all three authoritative skill fields and remove only the unused `levelUp` column. ClassFeatures, Feats, and OriginFeatures remove blank `grantNotes`. WeaponBases removes redundant `tagKeys` and `sourceNote`, retaining names in `tags`, stable technique references, and `traitsText`. The canonical `ClassSkills` and already-empty `WeaponProfiles` tabs are retired after verifying that no authored relationships or mechanics are lost. These removals do not remove the corresponding published runtime data or saved-state compatibility.

The accepted follow-up retired `grantText` from ClassFeatures, Feats, and OriginFeatures after preserving the 16 meaningful summaries in descriptions. Formal `grants` supply derived display text. Techniques add optional `basicAttack`; syntax v3 preserves underlying attacks, conditional feature references, explicit recipients, and prerequisite alternatives. The adapter and staged schema-v3 artifacts retain these structures and raw source values.

Traits retain their eight core fields and add optional `grants` for explicit recipient tags. Formal prerequisites and the distinction between classification tags and acquired tags are defined below. `Metadata`, `Schema`, `Enums`, header notes, and validation must describe the same source contract; schema/syntax versions are separate from runtime artifact versions.

Display adapters project source headers into their established local positions, supplying correctly sized blank arrays for omitted optional fields. Derived compatibility columns are not new authoring obligations. Entity lookups and parent relationships use stable keys throughout; names are labels and may duplicate. Identity errors remain diagnostics even when optional display fields are absent. Incomplete Feat placeholders stay in source, are listed by original row in display diagnostics, and are excluded from playable/catalogue identities until they have both a key and name. Do not invent identities or mechanics to fill them.

The source plan and native display checks remain authoring tools. The implemented integration separately adapts and validates v5, constructs deterministic schema-v3 artifacts, and checks runtime loading and eligibility safeguards. Character storage and the frozen production release remain unchanged. Conditional class mechanics, recipient-owned state, and the Trait/Familiar/Mech/form subsystems remain deferred where no execution model exists.

### Earlier authoring migrations (historical evidence)

The user approved the September 19 migration even if it does not export. All archetype feats now live in `Feats`, with `archetypeKey` on each top-level member and `archetypeName` once on the entry feat. Nested OPTION rows inherit the parent membership. Class/category and `featType` retain their existing meanings. Prior-feat counts have a single authored representation in `prerequisites`: `archetype | <archetypeKey> | numFeats=N`; no same-group condition means zero. The canonical `ArchetypeFeats` tab was removed; the display workbook generates its compatibility view directly from Feats.

All unfinished techniques live in `Techniques`, with `selectionMode=draft`, blank unknown ranks/skills/costs, `energyCostKind=unassigned` for an unknown Energy cost, and preserved original wording/provenance. The canonical `TechniqueDrafts` tab was removed. The earlier authoring migration reached 112 technique keys; subsequent user edits removed `brutal-strength` and `bullet-spray`, leaving 110 before the weapon migration. Those removals and the user's intervening feat/ClassSkills insertions are preserved. Deflect Projectile is reused rather than duplicated. The handbook must display incomplete mechanics explicitly and must not infer rank zero or a free Energy cost.

The approved weapon migration adds 31 uniquely named techniques, initially bringing the catalogue to 141: 19 basic attacks and four alternatives from canonical profiles use `selectionMode=granted-only`; four Rank 2 basics and four alternatives omitted from the canonical profiles are restored from the current handbook as `draft`. The user's subsequent removal of `snap-kick` and `crooked-cobra` leaves 139 techniques, with all 31 weapon additions intact. Nine former critical profiles become `onCriticalSuccess` riders. Iaijutsu remains a Katana trait. All 33 former `WeaponProfiles!A2:AE34` records are retired after migration readback; the exact header and hidden tab remain as an empty acquisition-compatibility placeholder, and their Schema declarations are deprecated. The source no longer maintains editable copies of the same attacks in both tabs.

`WeaponBases` appends column I `techniqueKeys` and column J `traitsText`. The 22 populated base relationships contain 32 technique references: the 31 new techniques plus Machine Gun's existing `covering-fire` draft. The four previously empty Rank 2 base tag lists are filled from the handbook; source provenance is retained. The intended acquisition rule is automatic access while wielding the corresponding weapon, without spending ordinary technique choices. Draft records remain incomplete and unavailable for runtime grants until their mechanics are resolved.

The completed follow-up presentation separates the main alphabetical catalogue from weapon-base actions without removing source records. The 31 base-specific techniques remain in canonical Techniques and the shared `_TechniqueBlocks` display pool, but are excluded from the main catalogue. At the observed 139-record source checkpoint this produces 108 main catalogue entries; regenerate counts from fresh source after further user edits. All 31 WeaponBases cards embed the complete formatted blocks for their ordered technique references, resolving all 32 references through that same pool; Machine Gun's generic Covering Fire remains in the main catalogue as well as its base card. A technique is excluded from the main catalogue only when it has the exact weapon-specific prerequisite `weapon | key=<base> | wielded=true` and is referenced by that base's `techniqueKeys`. The approved damage/pumping update was read back across 73 cells on 23 basics, preserving the user's concurrent Deflect Energy skill/rank edits. Display/handbook checks passed for all 153 linked base/main/excerpt entries in text and non-whitespace bold/italic styling; the superseded Weapon Damage table was removed after verification. This authoring acceptance does not establish runtime release readiness.

The combat skill is now **Ranged Weapons**, with canonical skill key `ranged-weapons`, replacing the former Targeting label/key across authored skill values and references. This skill migration does not rename unrelated stable technique, feat, weapon, or enhancement identities merely because their keys contain the same word. Published data and saved characters may still contain the legacy skill identity and require the separately maintained compatibility path.

The September 20 Trait migration adds a canonical `Traits` tab with 77 distinct records: 25 existing Monster/Familiar Traits, 25 Mech upgrades, 19 Metamorphic adaptations, and eight approved Origin features. Overlapping mechanics remain separate pending review; 16 populated duplicate groups identify candidates without merging their effects, prerequisites, ranks, or drawbacks. Fourteen associated actions were appended to canonical `Techniques`, preserving the 137 records in the fresh prewrite snapshot and producing 151 observed Techniques, of which 120 are in the main catalogue. These counts are checkpoints rather than assumptions for future work. Eleven existing ClassFeatures/OriginFeatures provider rows now reference the Trait records, retaining their activation and selection rules. The universal format and relationships are specified under [Traits](#traits-authoring-extension).

At those historical checkpoints, these fields were authoring/display extensions outside the exporter contract. The v5 adapter now retains Feats membership, archetype prerequisites, blank unknown mechanics, WeaponBases relationships, Traits, and provider `traitKeys`. Their storage does not establish executable Trait grants or Familiar/Mech/form state. All nine frozen production JSON files and the release contract remain unchanged. Publishing a new runtime release requires separate review of a successful staged candidate. See [data-pipeline.md](data-pipeline.md#handbook-display-and-linked-table-formatting) for the authoring workflow.

### Versioned adapter models

The domain-neutral XLSX reader preserves sheet order, headers, raw values, and physical row numbers. `source-adapters.mjs` routes by a unique declared `Metadata.sourceSchemaVersion`. The isolated v4 adapter retains its previous model and behavior; unknown versions fail. V5 produces flat collections plus normalized `metadata`, `schema`, and `enums`, derives `classSkills`, and adds `traits`.

V4 retains exact ordered headers and its 152 ordered Schema declarations. V5 resolves fields by header name, permits reordering, and rejects missing, duplicate, or unknown headers and unheaded populated cells. Its 115 Schema declarations must agree with the implemented types and required/conditional obligations. Enums must contain the implemented domain/value pairs with meanings; missing, duplicate, or unsupported values, contradictory enum formats, and invalid enum defaults are diagnostics. Declaration defaults never fill unknown source mechanics.

V5 records retain `source: { sheet, row, headers }` and exact authored `sourceValues`. The model also retains `sourceSheets`, including documentation and malformed/unheaded rows, for complete review evidence. Blank numeric mechanics remain null; explicit unresolved values such as `X` remain in source values with a diagnostic. Invalid populated scalars do not disappear. Pumping retains its exact rank-to-effect map and raw text; gaps, multiple effects, strain cost, critical-failure outcomes, and other retained columns survive.

Technique normalization keeps raw `selection` plus typed `selectionRoutes`, authored `status`, optional `associatedSkill` and its canonical key, `basicAttack` clauses and raw text, and `pumpingByRank`. Derived compatibility fields do not become new authoring requirements. `source-v5-values.mjs` derives skill/tag identities centrally, reusing Targeting → Ranged Weapons compatibility and preserving unrelated stable entity keys.

Nested class/feat/origin feature rows remain flat during adaptation. Their stable owner key and `parentKey` are copied only from the row itself. Building and validating owner/parent relationships belongs to whole-model validation, never spreadsheet row order.

## Global source rules

### Stable identity

- New stable keys use lowercase kebab case.
- Existing weapon/enhancement snake_case keys remain frozen until saved-state aliases and migrations exist.
- Entity display names are never persistence or cross-reference identity and need not be unique. Skill/tag vocabulary is authored once by name; normalization derives internal identities centrally with compatibility aliases where required.
- `OPTION` rows require a stable `parentKey` resolving to an `OPTION_GROUP` in the same owner scope.
- An `OPTION_GROUP` may itself have a stable `parentKey` resolving to another `OPTION_GROUP`; recursive nesting is preserved in runtime artifacts.
- `OPTION_GROUP` rows require a positive explicit `chooseCount`; parser fallback `1` is compatibility only, not an authoring rule.
- Every answer-producing grant has a stable explicit `choiceId` or an unambiguous typed source-owned identity derived from its stable owning feature. Explicit IDs are required when another expression must address that exact answer through `choiceRef`; they are not duplicate copies of every owning `featureKey`.

Descriptions are optional presentation content on every runtime-source tab. A blank description never makes an otherwise complete record invalid or unselectable. Mechanical readiness is determined from mechanical fields and readiness status; acquisition is separately controlled by the entity's selection contract.

### Status and selection

Authoring `status` values describe readiness:

- `playable`: complete; the applicable acquisition route still determines access;
- `draft`: exported but unavailable in normal selection;
- `incomplete`: exported but unavailable because required mechanics remain incomplete.

All 19 classes export; the seven currently playable classes are Ninja, Magical Guardian, Monster Tamer, Spirit Warrior, Weapon Master, Henshin Hero, and Metamorph. Origins use the same export-versus-selectability policy.

Technique acquisition is authored separately in `selection`:

- skill names, separated by comma or `OR`, are alternative skill access routes;
- `granted` means access is supplied by a provider and consumes no ordinary Technique choice;
- `tag=Name` requires the recipient to possess that explicitly acquired character tag;
- `weaponTag=Name` requires the relevant weapon tag, which is distinct from a recipient tag;
- blank means unresolved access, not universal availability.

Tag routes unlock normal selection rather than automatically granting the Technique. Formal prerequisites remain additional AND requirements regardless of which selection route succeeds. A draft/incomplete status prohibits both normal selection and grants; `granted` never implies that unfinished mechanics are ready.

`selectionMode` remains part of the implemented runtime contract and unconverted source entities such as WeaponEnhancements. Its existing values are:

- `selectable`: may appear in a normal picker when other Rules pass;
- `granted-only`: may exist only through a grant and must never be offered directly.
- `draft`: exported for review but unavailable through normal selection or grants; incomplete mechanics are reported as warnings.

`Dazzling Transformation` uses Technique `selection=granted`; the `soulbound` enhancement retains `selectionMode=granted-only`. “Granted” is an acquisition route, not a fake prerequisite.

WeaponEnhancements prerequisites apply to the candidate weapon being enhanced. Author a weapon tag constraint as `weapon | tag=Name`; another possessed weapon cannot satisfy it. The September 21 content audit normalized eight former `tag | name=...` requirements without adding a wielded condition or changing the tag/rank. V5 preserves that candidate-weapon evaluation scope. Enhancement mechanics belong in `description`, while `notes` retains editorial uncertainty and cross-references. Draft entries retain `selectionMode=draft`. The published runtime release remains unchanged.

### Editorial and display fields

- Where retained, `notes` is internal/editorial and is not player-facing by default. Technique mechanics formerly placed there must move to retained mechanical fields before the column is removed.
- Where retained, `sourceNote` records provenance or an unresolved editorial comparison. Techniques and WeaponBases no longer author it; migration snapshots retain their earlier provenance.
- `grantText` is retired from ClassFeatures, Feats, and OriginFeatures after preserving its unique meaning. Render readable grants from `grants`; do not recreate a second editable summary or use blank compatibility positions as the display authority.
- Blank `grantNotes` and `Classes.levelUp` are removed from authoring; display adapters may generate blank compatibility columns for existing helpers.
- Level-up mechanics belong to Rules, not workbook prose.

## Domain adaptation

### Classes and derived skill relationships

`Classes.classKey` is the owner/selection identity. A class row always exports; `status` determines picker eligibility. Required playable mechanics include health progression and primary-attribute choices.

The three Classes fields are distinct and authoritative:

- `combatTechniqueSkill`: the skill or alternative skills that provide Technique selection;
- `combatSkills`: combat/defense skill progressions, including attribute-dependent progression such as `Fast (Strength Primary), Medium (Agility Primary)`;
- `utilitySkillOptions`: the ordered starting utility-skill options.

Do not merge these fields or replace them with duplicate authored relationship rows. The v5 adapter derives each combat-technique/combat-defense role, progression, primary-attribute condition, utility choice group, and authored ordering from Classes. A missing or unrecognized progression remains a diagnostic with its original text; the adapter does not invent one. The v4 compatibility path still reads its historical ClassSkills table.

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

An explicit `feature | featureKey=...` grant refers to a canonical feature's rule; it is distinct from `parentKey` membership. It does not import that feature's original level, owner, or parent choice. The invoking feature owns the new invocation and any answers it produces. See the authoring grant extensions below for conditional rules and cycle handling.

### Traits (authoring extension)

A Trait represents a passive benefit or capability, usually a physical component. Its provider determines who receives it, when it is active, and how it is chosen. A Trait may refer to associated techniques; the action's cost, roll, targeting, and outcome belong to its canonical Technique record. Formatting a feature as a Trait does not itself make that feature universally selectable or authorize conversion of every other passive class feature.

`Traits!A:H` has eight core authoring fields, followed by optional `grants` in column I. The user removed the former editorial metadata columns during consolidation; their absence must not break rendering.

| Field | Meaning |
|---|---|
| `traitKey` | Unique stable identity; display names and source variants may overlap. |
| `name` | Player-facing Trait name. |
| `rank` | Minimum acquisition rank; blank means unknown, never Rank 0. A granted Trait scales with its provider-specified associated skill, or Familiar rank for a Familiar. |
| `prerequisites` | Formal authored requirements; stable Trait references and other conditions produce readable display text, with runtime execution deferred. |
| `tags` | Authored tags only; blank does not justify inventing a classification. |
| `description` | Unlabeled benefit text, choices, limits, and ordinary prose naming associated techniques. |
| `rankNotes` | Preserved higher-rank benefits written as `Rank N+` lines. |
| `techniqueKeys` | Ordered comma-separated stable references to canonical associated Techniques. |
| `grants` | Optional explicit recipient grants; `tag \| tag=Name \| minRank=N` acquires a character tag at the stated Trait rank. |

Display requires `traitKey` and `name`; missing nonidentity headers supply blank arrays matching the source row count. This display tolerance includes the legacy `selectionMode`, `duplicateGroup`, `reviewNotes`, and `sourceNote` metadata. Present metadata retains its meaning and formatting. A missing optional header is different from a broken identity or populated technique reference; the latter still produces a diagnostic. A missing rank renders as unknown, not zero. Display tolerance does not certify runtime readiness or grant access.

`tags` classifies a Trait for provider filtering and descriptions; possessing a Trait does not automatically copy those classification tags onto its recipient. `grants` explicitly states acquired recipient tags, including their minimum rank. For example, Wings grants `Wings` at Trait Rank 1 and `Flight` at Rank 2; Rocket Boosters grants `Flight` only at Rank 2. Spiked Hide, Liquid Form, and Plant Physiology grant `Spikes`, `Liquid`, and `Plant` at Rank 1. These conditions use the provider's associated skill or Familiar rank as specified below. Weapon tags remain properties of weapons. The existing authored benefit prose owns the displayed explanation; do not append a second Grants paragraph merely because a formal tag grant exists.

Trait `prerequisites` is formal source data. A Trait dependency uses a stable reference such as `trait | traitKey=liquid-form`; derive its label from the referenced record. Multiple lines mean AND. Preserve an unrecognized or unresolved condition explicitly instead of inventing a prerequisite or silently discarding a qualifier.

The book block has a bold `Name - Rank N` title, separate lines with bold `Prerequisites:` and `Tags:` labels, one blank line, and the authored body and rank notes. Do not add Benefit, Choice, Scaling, or Techniques subsection labels. Blank prerequisites render `None`; blank tags render an em dash; unknown rank renders `Rank ?`. Draft or unknown-rank records retain an italic `Incomplete Trait` notice. Possible-duplicate labels and review notes are italic. Associated techniques are named in ordinary Trait prose and rendered in the existing Technique catalogue, without copying full action blocks into the Trait.

`ClassFeatures` and `OriginFeatures` include `traitKeys`, an ordered comma-separated list of stable references. This relationship identifies the provider's available or supplied Traits; it does not mean every listed Trait is automatically granted. The provider's prose retains counts, permitted selections, recipients, activation costs, duration, form switching, and other source-specific rules. Likewise, a Trait `techniqueKeys` relationship does not override any higher-rank access condition in its description or rank notes.

The granting feature defines the associated skill whenever a Trait needs one. Trait rank always scales with that skill. Familiar Traits instead use Familiar rank, including benefits phrased in terms of associated skill rank; Familiar rank progresses separately. Origin Traits should grant benefits without requiring a skill; fixed-rank grants can preserve a particular benefit (for example, Wall Crawler grants Rank 2 Climber). The minimum rank of a Trait-granted Technique equals the lowest minimum rank among its granting Traits. A tag prerequisite can establish eligibility without automatically granting the Technique.

The initial migration retained 77 variants for review. The user's subsequent consolidation supersedes those identities: providers must reference current keys, deduplicate merged choices, and preserve their activation and selection rules. Quadrupedal is retired; Slime Physiology maps to Inorganic Nature. Broader feature-family conversions, including Fighting Styles, require their own consistent scope and approval. WeaponBases `traitsText` remains its existing authoring field until a separately approved integration addresses it.

The adapter normalizes Traits, provider `traitKeys`, associated Technique references, classification tags, and explicit acquired-tag grants; validation checks their stable references. Syntax v3 recognizes Trait prerequisites and preserves tag-grant rank conditions. Character schema v5 still has no dedicated Trait/Familiar/Mech/form state: provider activation, recipient ownership, rank-driven grants, codec implications, and reconciliation require their own execution work. Preserved records and display prose must not silently become executable rules.

### Techniques

`techniqueKey` is stable identity; `techniqueName` is display text and may duplicate another name. `selection` determines access, while `status` determines readiness. Skill/tag names are authored once; retired `skillKeys` and `tagKeys` source columns are derived internally. Ranged Weapons accepts the saved Targeting identity; unrelated entity keys remain unchanged.

`associatedSkill` is an optional roll/associated-skill override. A skill-access Technique with a blank override uses its chosen access skill. A granted/tag-access Technique with a blank override uses the granting provider's associated skill; if there is no such context, the skill remains unresolved. Weapon-provided scaling uses weapon rank where the authored rule says so. Do not infer a roll skill, rank, or provider from a display name, classification tag, or missing field.

Optional `basicAttack` identifies an underlying attack used by the Technique. It accepts `weapon` for the applicable weapon's basic attack or `technique | techniqueKey=<stable key>` for a canonical Technique, with alternative clauses separated by ` OR `. It does not supply attack counts, targets, costs, riders, or readiness; those remain as authored in their existing fields and description. Optional `attribute` and `defense` fields inside a `basicAttack` clause override that underlying attack, for example `weapon | defense=Spiritual` or `technique | techniqueKey=unarmed-strike | attribute=Agility`.

When a Technique adds no roll of its own, set `rollRequired=N` and leave its own `attribute` and `defense` columns blank. An underlying attack still makes its normal roll with any explicit clause overrides. Do not copy its roll into the Technique's independent-roll columns or interpret `N` as suppressing the referenced attack. Stable Technique references must resolve; unsupported basic-attack forms remain diagnostics until adapted.

`actionType=ActionOrFreeReaction` expresses two timing routes: use the normal number of Actions in `actions` (usually `1`), or use a free Reaction when the authored trigger occurs. The free Reaction does not erase Energy or Strain costs. It is distinct from `ActionOrReaction`, whose Reaction is not marked free.

Energy costs use these fields together:

| `energyCostKind` | `energyCost` | `energyCostOptions` |
|---|---|---|
| `fixed` | required nonnegative number | blank |
| `variable` | blank | pump/variable rule represented by the technique |
| `conditional` | base/default nonnegative number | required named alternatives |
| `unassigned` | blank | blank; content is not release-ready |
| `unspecified` | blank | temporary migration finding; not playable fixed cost |

Legacy `-1`, `N`, blank-means-zero, and `0 or 3` sentinels are not allowed in canonical source. Pinning Ammunition is represented as base `0` plus `pin-only=0; pin-and-attack=3`.

`prerequisites` is the single authored prerequisite field; `prerequisiteText` is removed. Render readable text from formal conditions and stable entity references, retaining every conjunction, alternative, exclusion, rank/reach threshold, and wielded condition. Distinguish a recipient `tag` requirement from a weapon tag. Unresolved references and unsupported qualifiers remain visible diagnostics. Display rendering does not execute or certify the prerequisite.

#### Compact damage and pumping

Author damage and growth once in `damage`; `damageByRank` is retired. State the starting damage, increment, and exact rank basis/minimum. Preserve an irregular progression explicitly in the same field. Do not repeat the rule in a second enumeration or explanatory `rankNotes`.

Canonical compact examples are Spirit Blast's `3 + Hits; +3 damage per rank above 1.` and Spacium Ray's `2 + Hits; +2 damage per rank above 1.`. Their associated skill/provider determines Technique rank; weapon-rank formulas retain their explicit weapon basis. Their pumping maps retain all source entries: Spirit Blast uses Ranks 1–2 at +1 damage/Energy, 3–4 at +2, and 5–6 at +3; Spacium Ray uses Ranks 1–3 at +1, 4–5 at +2, and 6 at +3. These are different schedules, not a universal formula.

`pumpingByRank` replaces the damage-specific column. Use semicolon-separated entries such as `1=+1 healing per Energy;2=+1 healing per Energy;3=+2 healing per Energy`; every entry has an explicit effect and per-Energy basis. Damage, healing, armor, ward, and multiple simultaneous effects are valid authored meanings. Unitless historical values require a reviewed effect before migration; do not assume damage. The shared renderer groups only adjacent identical effects, preserving every rank, gaps, nonconsecutive runs, and unit. Preserve authored higher-rank benefits and meaningful `rankNotes`, including minimum Energy and Rank 0 pumping restrictions.

Full technique blocks omit repetitive provider/availability paragraphs. Weapon-base cards also omit their automatic-availability sentence. Retain source provider relationships, selection/status, prerequisites, costs, an Access line reflecting the authored route, and explicit `Incomplete technique` and missing-mechanic notices.

### Origins

`originKey` is stable identity and source row order is canonical unless a future explicit sort field is added. `questions`, `futureUpgradesText`, and `examplesText` are the current source fields; obsolete exporter aliases such as `roleplayQuestionsText` are adapter concerns only.

### Weapons

- Weapon-base and enhancement keys retain established snake_case identity.
- In the published legacy format, every profile's `weaponKey` must resolve to a base. In schema-v5 authoring, WeaponProfiles is retired and attacks are Techniques. The display may retain an empty header-only compatibility view without importing a deleted source tab.
- `WeaponBases.techniqueKeys` is an ordered comma-separated list of stable technique keys automatically provided while the weapon is wielded. It records the source relationship; it is not a second copy of attack mechanics or permission to offer granted-only techniques in ordinary selectors.
- `WeaponBases.traitsText` is player-facing multiline text for non-action traits. Iaijutsu belongs here, while Machine Gun also records its existing Covering Fire relationship. Editorial `notes` remain separate.
- New weapon techniques require `weapon | key=<weaponKey> | wielded=true`; readable wielding text is derived from that stable reference. Existing base minimum ranks and canonical attack ranks are preserved.
- Basic-attack damage scales automatically with weapon rank under the approved growth rule below. Optional pumping is a separate addition. Both use the weapon's rank, never the character's combat-skill rank.
- Critical profiles are normal `onCriticalSuccess` riders. A basic attack with an alternative may deal normal damage and apply the named alternative's effect instead of multiplying damage. Shuriken Distracting Attack retains its own Distracted 3 critical result.
- WeaponBases authors tags once in `tags`; redundant `tagKeys` and source provenance columns are retired. Internal tag identities remain a normalization concern.

Schema-v3 artifacts derive a read-only `profiles` compatibility view from each base's ordered stable `techniqueKeys`. Each profile carries the referenced canonical Technique and uses `profileType=technique`; the source does not regain an editable WeaponProfiles table. Weapon cards use these profiles, while weapon rank caps use the linked Techniques' explicit `associatedSkill` or skill-selection routes. Repeated skill names are deduplicated without dropping conditional class progressions. No attack classification or skill association is inferred from a weapon or Technique name. The schema-v2 profile behavior remains unchanged.

An enhancement's formal weapon prerequisites are evaluated against the particular weapon receiving that enhancement, including its effective tags, rank, and reach. Another owned weapon cannot satisfy the candidate's requirements. Schema-v3 manual or unsupported conditions, draft readiness, and deferred execution cannot be bypassed by a granted-only selection path.
- A weapon grant's tag fields filter which weapon may be chosen; they do not add those tags to the selected weapon.
- `choiceId` owns the selected answer and `choiceRef` connects later grants/enhancements to that answer.
- Granted-only enhancements are acquisition mode, not prose prerequisites.

The initial migration preserved the original damage/pump tables: seventeen basics had variable pumping, and the four formerly blank free Shuriken/Shield basic/alternative action costs became explicit fixed zero. The approved follow-up supersedes that basic-attack treatment for all 23 basics. It preserves each attack's current damage at its base's minimum rank and adds the following amount automatically for every weapon rank above that minimum, through Rank 6:

| Damage growth per weapon rank | Basic attacks | Count |
|---|---|---:|
| +3 | Baseball Bat, Kitchen Knife, Rock / Brick, Broomstick, Longsword, Katana, Pistol, Spear, Rifle, Axe, Shotgun, Gunblade, Machine Gun | 13 |
| +2 | Bow, Daggers / Kunai Melee, Daggers / Kunai Thrown, Shuriken, Shield, Staff, Chain Sword, Grenade Launcher | 8 |
| +4 | Greatsword, Warhammer | 2 |

The rule is `starting damage + growth × (weapon rank − base minimum rank)`, plus the attack's existing Hits term and any optional pumping. Author all 23 linear basics as a compact `damage` line anchored at the base minimum rank; retain the starting damage and growth amounts above without a second damage column. This replaces the former special Rank 6 jump; it does not change Grenade Launcher's separate 6 splash damage or Chain Sword's +2 damage per sustained round.

Every basic attack costs 0 Energy before optional pumping. All 23 therefore use `energyCostKind=variable` with blank numeric `energyCost`; omit the redundant zero-Energy sentence from the printed block. Pumping remains unavailable at Rank 0, adds +1 damage per Energy at Ranks 1–2, +2 at Ranks 3–4, and +3 at Ranks 5–6. Apply this existing pumping rule to the six basics previously missing it: Shuriken, Shield, and the four Rank 2 basics. A blank numeric cost is the variable-cost representation, not a general blank-means-zero rule.

For these basics, remove only the exact redundant sentence `0 Energy before optional pumping.` from `rankNotes`. Preserve the four Rank 0 no-pumping notes and all other meaningful notes. Keep all pumping map values; the shared renderer supplies the grouped rank ranges without duplicating that schedule in notes.

Alternative-use outcomes and costs are unchanged by this refinement. Shuriken Distracting Attack and Shield Bash retain fixed zero Energy; Pistol Bullet Spray and Shotgun Buckshot Blast retain 2 Energy. The September 21 follow-up resolves Pistol and Machine Gun Bullet Spray through `basicAttack` references to their respective weapon basic attacks, preserving their authored area, attack application, and reload rules. All eight added Rank 2 techniques remain draft: the four basics receive the approved damage and optional-pumping rules but retain unknown action costs and other unresolved fields; the four alternatives keep their existing costs, including Machine Gun Bullet Spray's 2 Actions and 4 Energy. The other unknown alternative Energy/action fields remain unassigned. Timed Explosion's free detonation reaction does not assign a cost to its unspecified initial launch. Referencing draft Covering Fire from Machine Gun does not make that technique complete.

## Grant expression contracts v2 and v3

The parser and normalizer default to syntax v2 for existing callers. V5 adaptation and schema-v3 runtime records explicitly select `syntaxVersion: 3`. Separate versioned registries preserve v2 behavior. `getExpressionRuntimeStatus` returns `implemented`, `compatibility`, `manual`, `stubbed`, or `unsupported`; validation translates execution limitations into deferred record support. Parsing and serialization alone do not establish execution support.

### Implemented normalization extensions (syntax v3)

- `tag | tag=Wings | minRank=1` explicitly grants a recipient tag; `minRank` is the minimum provider-associated Trait/Familiar rank. Classification tags do not supply this grant implicitly.
- `feature | featureKey=monster-evolution` invokes the canonical Monster Evolution feature's complete conditional rule. Each grant creates a fresh invocation owned by its granting feature; it does not inherit the referenced feature's original level or parent option group. Preserve the canonical conditional description instead of copying an unconditional rank increase into every later award. Resolve the stable key in its owner scope, reject ambiguous targets and direct or indirect feature-reference cycles, and retain the invocation relationship for future execution. Conditional execution is deferred; displaying the referenced rule does not execute it.
- `skill | choiceId=living-archive-skills | count=3 | rank=1 | recipientRef=artifact` gives the bonded Artifact three Rank 1 skills. The existing `bond | choiceId=artifact | rank=2 | count=1` identifies the Artifact counterpart. Normalization retains the explicit recipient; validation requires the bond to resolve in the same owner scope. The answers belong to that recipient, not the character. Omission retains the existing character default; an unresolved explicit recipient never falls back to the character. Recipient-owned execution remains deferred.

The shared display derives grant text from the formal expressions and resolves entity labels by stable key. Unknown types, fields, or references must stay visible with their authored details. Display must not erase conditional prose or present a partially understood rule as an unconditional grant.

### Shared grant grammar and v2 compatibility

One grant per line:

```text
type | field=value | field=value
```

Fields are type-specific. A global “any known field on any grant” allowlist is invalid. `GRANT_EXPRESSION_REGISTRY` and its v3 extension encode required/optional fields, scalar types, aliases, defaults, and runtime status. Exporter validation and runtime loading use the pure parser/normalizer in `public/js/core/game-data-expressions.js`. V3 adds recipient tag grants, canonical feature references, and explicit skill recipients without changing v2 normalization.

The normalized runtime shape retains the established compact keys (`key`, `name`, `skill`, `tag`, and `level`) while accepting descriptive schema aliases such as `techniqueKey`, `skillKeys`, `tagKeys`, `featKey`, `maxLevel`, `weaponKey`, and `enhancementKey`. Aliases are type-specific. Supplying an alias and its normalized field together is a duplicate-field error rather than an overwrite.

Implemented runtime grant types:

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

## Prerequisite expression contracts v2 and v3

Syntax v3 adds stable Trait and Technique references, archetype prerequisites, `weapon-set`'s `separateHands` predicate, typed-clause alternatives, and known-option counts. The versioned parser, validator, and runtime prerequisite helpers preserve these structures. Evaluation uses explicit character/context data; absent Trait/form/recipient state is not invented to satisfy a condition. V2 callers retain their existing grammar.

### Implemented prerequisite extensions (syntax v3)

Separate nonblank lines are AND conditions. Within a line, complete typed clauses can be alternatives, for example:

```text
weapon | tag=Melee | wielded=true OR skill | name=Martial Arts | minRank=1
```

This requires either a wielded Melee weapon or at least Rank 1 Martial Arts. An `OR` begins a new clause only when followed by another typed clause and its `|` fields. It normalizes to `{ type: "any", alternatives: [...] }`. Value-level alternatives such as `weapon | tag=Melee OR Ranged | wielded=true` remain an ordered array within one field. Each branch retains its qualifiers; separate lines remain AND conditions.

`option | groupKey=stances | count=2` requires at least two distinct known options from that stable group. It does not grant more options, count duplicate answers, or reference a resource named Stance. Resolve the group and its membership by stable keys. The prerequisite is distinct from the existing `option` grant, where `count` awards additional answers.

Trait/Technique dependencies use `trait | traitKey=...` and `technique | techniqueKey=...`, normalizing their stable references to `key`. Archetype prerequisites accept `archetype | <archetypeKey> | numFeats=N`. A `weapon-set` clause may require `separateHands=true` alongside count, tags, and wielded state. The v3 parser retains that predicate and runtime evaluation checks distinct hand bindings; possession of two weapons alone does not satisfy it.

Canonical saved weapons currently lack the equipment/hand state needed to prove `wielded=true` or `separateHands=true`. V5 validation therefore defers records that depend solely on those conditions. A typed OR remains usable through a supported alternative, such as Deflect Projectile's Martial Arts branch. Do not infer that a possessed weapon is wielded, invent hand assignments, or weaken the condition to bypass this boundary.

### Shared prerequisite grammar and v2 compatibility

Syntax matches grants. Separate lines are AND conditions. Within a supported field, `A OR B` means either value satisfies that field.

Implemented structured runtime types include:

- `class`: stable `classKey` plus minimum level;
- `feat`: stable `featKey`;
- `familiar`: count/rank requirements such as `minCount`;
- `choice`: properties of the source-owned answer referenced by `choiceRef`;
- `weapon`: one weapon satisfying a stable `key` and/or `tag`, `tagAll`, `tagAny`, `tagNot`, `minReach`, and `wielded` predicates;
- `weapon-set`: an explicit `count` of wielded weapons satisfying the same tag/reach predicates.

`PREREQUISITE_EXPRESSION_REGISTRY` also preserves existing runtime types such as origin, attribute, skill, tag, resource, and explicit legacy text. Weapon and weapon-set tag/reach predicates are executable against normalized character weapons. Familiar prerequisites remain typed but explicitly stubbed. Unstructured legacy text is preserved as a manual rule with a diagnostic; it is never mistaken for executable structured data. `selectionMode=granted-only` must never be encoded as prerequisite prose.

For example, `weapon | key=longsword | wielded=true` requires the corresponding wielded base. The v5 exporter also preserves its `WeaponBases.techniqueKeys` relationships, but accepting a predicate or storing that relationship does not by itself create a source-owned Technique answer in character state.

Separate nonblank lines are ordered AND conditions. Within registry fields marked as references, `A OR B` normalizes to an ordered array. Parsing returns `{ ok, value/values, diagnostics }`; diagnostics retain caller-provided sheet/row/column/cell context. Unknown types, type-specific unknown fields, duplicate aliases, missing requirements, and invalid scalars are errors. The pure parser performs no file I/O and never exits the process.

## Required validation before artifact construction

Incomplete game content is valid migration input; importing the format does not require finishing every class or Technique. The v5 adapter retains records, source locations, unknown values, and deterministic diagnostics. Validation distinguishes incomplete content and deferred execution from malformed expressions, broken references, and structural loss. Source completeness is never manufactured by filling blanks with zero, inventing mechanics, or discarding identities. The v4 path retains its existing validation policy.

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
- v4 playable/selectable records missing required mechanics; v5 instead preserves an incomplete record with a warning and deferred execution;
- any normalization that would silently discard source meaning.

V5 validation checks `basicAttack` references, overrides and cycles; typed prerequisite branches; known-option groups/counts; Trait and Technique references; explicit recipient ownership; and feature-invocation scope/cycles. Each repeated feature invocation receives a distinct source-owned identity without inheriting its target's level or parent. Conditional execution stays deferred.

Warnings preserve incomplete content and explicit runtime limitations safely. Structural loss and ambiguous or missing references remain errors. Validation returns `runtimeSupportBySource`, keyed by physical `sheet:row`, with `{ status: "supported" | "deferred", reasons: [...] }`. This execution annotation is separate from authored readiness. Artifact construction carries it forward; selectors and grant execution must respect it. Validation runs without writing artifacts.

`scripts/game-data/model-validator.mjs` retains v4 checks and invokes `model-validator-v5.mjs` for v5 relationships and execution limits. Errors block artifact construction; warnings retain source meaning while reporting incompleteness, manual rules, or stubbed behavior. Findings retain physical source locations and deterministic ordering, including adapter diagnostics.

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

## Staged runtime artifact schemas v2 and v3

Artifact construction accepts only a model whose whole-model validation has no errors. The v4 source path retains runtime schema v2 and its nine files: `classes.json`, `class-skills.json`, `class-features.json`, `feats.json`, `techniques.json`, `origins.json`, `weapon-bases.json`, `weapon-enhancements.json`, and combined `game-x-data.json`. V5 produces runtime schema v3 and adds `traits.json`, for ten files. Arrays retain source ordering; canonical object ordering/serialization produces deterministic bytes.

Schema v3 records `sourceSchemaVersion=5` and `expressionSyntaxVersion=3`, retaining source values/locations, readiness, execution support, archetype memberships, provider relationships, acquired-tag conditions, associated skills, generic pumping, and underlying attack clauses. Class skill names are not duplicated merely because one skill has multiple conditional progressions. Existing schema-v2 runtime loading and fixture artifact bytes remain compatible.

Runtime v3 selection resolves skill alternatives independently, distinguishes acquired recipient tags from candidate weapon tags, honors associated-skill overrides, and rejects unknown readiness or unresolved rank. Formal prerequisites remain additional AND requirements. Draft/incomplete or deferred records cannot enter normal selection or execute grants merely because they parsed successfully. Recipient-owned skill grants, canonical conditional feature invocations, Trait/form acquisition, and broader unfinished class systems are preserved for later execution work.

Every schema-v3 record carries its expression syntax and `runtimeSupport` annotation; combined artifacts also retain source-located validation diagnostics. Mechanical grant collection excludes deferred records and unsupported grants, while explicit inspection can retrieve the complete normalized expressions. A deferred parent cannot activate its nested option grants. Graph and widget prerequisite checks use the same Rules-derived skill ranks, including class grants. These gates do not delete unfinished records or replace their authored readiness with inferred completeness.

The old runtime and saved-character formats remain readable, but that does not establish that every saved selection is valid against a new source revision. Removed source identities must be reviewed as release migration findings before publication. Do not invent aliases for deleted keys; the explicitly accepted `mech-integrated-weapon` → `integrated-weapon` Trait alias is a narrow compatibility mapping, not a general name-based resolver.

The combined artifact records source schema, exporter version, and the exact stable source revision (`fileId`, Drive version, modified time, and normalized-model SHA-256). The raw XLSX SHA-256 identifies one transport export and remains in source provenance and run reports because Google may generate byte-distinct XLSX ZIPs for an unchanged native Sheet revision. Raw transport hashes and volatile fetch/export times do not belong in runtime bytes. Split artifacts must equal their corresponding combined fields, and freshly serialized output must pass current runtime getters, technique indexing, and grant loading before any artifact files are installed.

Schema v2 remains the production release. `WPB-PUBLISH` promoted the exact approved bytes from immutable run `20260809T022801911Z-51956`; its baseline and hashes remain intact. Successful v3 staging is an integration/review result. Publishing candidate bytes and deploying the website remain separate boundaries.

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

The current authoring follow-up is `WPB-AUTHORING-V5` → `WPB-SCHEMA-V5-INTEGRATION`, with its verification and next review boundary recorded in status. It preserves the earlier release and does not authorize completing held class design, publishing data, or deploying the website.
