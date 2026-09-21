# Trait source changes — September 21, 2026

Status: **accepted with the user's static-only simplification, applied and verified**. This replaces the earlier 24-cell proposal with its activation, recipient and gameplay fields. The final batch changes 27 cells. It does not publish runtime data or deploy the newer builder.

The user accepted most of the proposal and specified that Trait grants should track choices, source ownership, prerequisites and eligibility. Costs, timing, form switching and other moment-to-moment rules remain player-tracked prose. Familiar and Mech Trait recipients wait for their subsystems. Metamorph itself is supported for import; incomplete individual feats do not disable the class.

## Accepted format

Grant a named Trait by its stable key:

```text
trait | traitKey=spirit-sight
```

Choose by classification tag, retaining one stable identity for the answer:

```text
trait | tag=Body | choiceId=body-transformation | associatedSkill=Metamorphosis
```

`count` defaults to 1. Without an associated skill, rank defaults to 1; an explicit fixed rank such as `rank=2` overrides that default. Rank and associated skill cannot both be specified. The granting feature supplies source ownership automatically. A `choiceId` identifies a saved answer within that source; it is not a gameplay group. The supported fields are key/traitKey, tag, choiceId, count, rank and skill/associatedSkill. Key and tag filters support OR alternatives.

An acquired Trait explicitly supplies eligibility tags:

```text
tag | tag=Web | minRank=1
```

A Technique can then use `tag=Web` in its selection column. This unlocks a normal choice; it does not automatically learn the Technique or override incomplete status. Trait classification tags and weapon tags remain separate. Formal Trait prerequisites still apply.

## Applied source cells

All cells are in [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit). Row keys and before values were re-read immediately before writing. No rows or columns were inserted, removed or reordered; the writes targeted `userEnteredValue` only.

| Cell | Change |
|---|---|
| `ClassFeatures!H238` | Set Transformed Instinct's choose count to numeric `1`, matching its prose. |
| `ClassFeatures!I241` | Escape option grants `technique \| techniqueKey=escape-instinct`. |
| `ClassFeatures!I242` | Learning option grants `technique \| techniqueKey=learning-instinct`. |
| `ClassFeatures!I235` | Give the three existing Metamorphic Transformations grants stable choice IDs and their prose-defined Metamorphosis scaling, as shown below. |
| `OriginFeatures!G7` | Eyes of Legend: `trait \| traitKey=spirit-sight`. |
| `OriginFeatures!G12` | Amphibious Form: `trait \| traitKey=amphibious`. |
| `OriginFeatures!G13` | Wall Crawler: `trait \| traitKey=climber \| rank=2`. |
| `OriginFeatures!G14` | Camouflage: `trait \| traitKey=natural-camouflage`. |
| `OriginFeatures!G18` | Keen Senses: `trait \| traitKey=keen-smell`. |
| `OriginFeatures!G22` | Slime Physiology: `trait \| traitKey=inorganic-nature`. |
| `OriginFeatures!G23` | Slippery Ooze: separate `trait \| traitKey=liquid-form` and `trait \| traitKey=slippery` lines. |
| `OriginFeatures!G24` | Slimy Storage: `trait \| traitKey=dissolved-storage`. |
| `Traits!I56` | Web Shooters: `tag \| tag=Web \| minRank=1`. |
| `Techniques!D143` | Web Area access changes from `weaponTag=Web` to `tag=Web`, matching the requested Trait eligibility route. |

`ClassFeatures!I235` now contains exactly:

```text
trait | tag=Natural Weapon | choiceId=natural-weapon | associatedSkill=Metamorphosis
trait | tag=Body | choiceId=body-transformation | associatedSkill=Metamorphosis
trait | tag=Anatomy OR Material OR Senses OR Movement | choiceId=free-trait | associatedSkill=Metamorphosis
```

The remaining 13 edits update authoring guidance to this same static format:

| Cells | Meaning |
|---|---|
| `Metadata!B16` | Require stable Trait choice IDs and distinguish fixed automatic grants. |
| `Metadata!B21` | Record static Trait scope, derived source ownership, player-tracked gameplay and future Familiar/Mech support. |
| `Metadata!B22` | Document the small grammar, Rank 1 default, explicit tag grants and separate release operations. |
| `Enums!C46:C47` | Acquired tags and Trait prerequisites depend on acquisition/rank, not activation. |
| `Enums!A61:C61` | Add `grantType`, `trait` and its static grammar guidance in the previously empty row. |
| `Schema!G10`, `G37`, `G47` | Document the same Trait grammar for ClassFeatures, Feats and OriginFeatures. |
| `Schema!G53` | Keep `traitKeys` reference-only; formal grants own acquisition. |
| `Schema!G102` | Explicit acquired tags unlock Technique eligibility without learning tag-routed Techniques or enabling incomplete content. |

Provider descriptions and their costs, durations, ranges and form conditions are unchanged. Wings already grants Wings at Rank 1 and Flight at Rank 2; Wing Blast already uses `tag=Wings`, so those cells needed no edit. Shoot Web, Web Area and Wing Blast retain their authored incomplete status. The Instinct corrections do not fill blank Technique mechanics. `Metadata!B2:B4` remains source schema 5 and grant/prerequisite syntax 3.

## Verification

- Exact native readback confirms all 27 intended values, unchanged neighboring values and preserved formatting, validation, notes and rich text across 357 inspected cells. Wall Crawler's explicit Rank 2 is retained; other fixed Origin grants use the accepted Rank 1 default.
- A fresh read-only native export has source modification time `2026-09-22T00:57:44.536Z` (September 21 local time), explicit null Drive version, fetch time `2026-09-22T00:58:50.3129641Z`, and XLSX SHA-256 `6968f1d21d6615937ee48b04831febba645058975a9f5df17bf4244c14d51f00`. Metadata was stable across export.
- Immutable staging run `20260922T005923417Z-35172` produces ten runtime files with **0 errors, 302 warnings**, successful runtime-load acceptance and the complete semantic diff. It includes 19 classes, 154 Techniques and 60 Traits. Metamorph is selectable and its three Trait choices execute against the imported data.
- Repository verification passes **419 unit tests, 18 Firebase emulator rule tests and 14 asset checks**. Browser checks use the actual widget/session/graph and fresh staged Metamorph: three labeled choices, rank/prerequisite filtering, Web/Wings tags, incomplete-Technique exclusion, reviewed dependency removal, cancellation/focus and exact schema-v6 local save/full reload all pass. Browser console reports no warnings or errors. Separate authenticated emulator tests cover the persistence transaction boundary.

The literal before/after plan, prewrite cells, readback and export provenance are retained under ignored `.staging/traits-integration/` as `static-source-plan.json`, `static-prewrite.json`, `static-source-readback.json`, `static-source.xlsx` and `static-source-provenance.json`. Browser evidence is `static-browser-verification.json`. Staged reports/artifacts are under `.staging/game-data/runs/20260922T005923417Z-35172/`.

## Remaining release work

No headers changed, so optional-header display projections remain compatible. The current display grant renderer preserves unrecognized Trait grant lines through its fallback; a dedicated readable Trait grant renderer and subsequent display/handbook refresh remain follow-up work, not a claimed native update. Preserve manual handbook edits before any refresh.

The static Trait correction is complete. It does not complete missing Metamorph feat/Technique mechanics or formalize its remaining prose-only Technique grants. `WPB-V5-RELEASE-REVIEW` still needs disposition of removed identities and existing-character impacts plus exact candidate approval. `WPE-DOMAIN-MIGRATION` still needs the broader compatible builder/data browser checks. The user's later personal acceptance is nonblocking. The nine published schema-v2 artifacts, production character documents and broader live website are unchanged.
