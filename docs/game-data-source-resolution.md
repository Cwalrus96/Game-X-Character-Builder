# WPB source-resolution register

Status: complete; contract decisions are implemented, the approved canonical-Sheet batch is applied, and authenticated repository staging validates the resolved source with zero errors.

Last inspected: 2026-08-08.

## Scope and evidence

The connected Google Sheet was read using exact bounded ranges from the 14-tab canonical workbook `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` (`game-x-class-data`). Before repair, the read contained the expected 19 Classes, 66 ClassSkills, 103 ClassFeatures, 85 Techniques, 38 Feats, 15 Origins, 23 OriginFeatures, 31 WeaponBases, 33 WeaponProfiles, and 31 WeaponEnhancements, plus all 152 Schema declarations and 41 Enum values. After the approved repair, Drive reported modified time `2026-08-05T23:51:04.524Z` and the Enums tab contained 44 populated values.

The earlier evidence was connector-assisted diagnostic input rather than repository acquisition provenance. The repository's read-only ADC path is now configured, and canonical Drive version `642`, modified `2026-08-08T19:36:29.890Z`, has completed authenticated fetch, adaptation, validation, staging, runtime-load acceptance, and diff generation.

The repository validator initially reported 149 errors and 14 warnings. An intermediate run against the same unchanged live source reported 77 errors and 16 warnings. The approved repository contract decisions accounted for 61 of those errors: 48 blank-description findings and 13 redundant-choice-ID findings. The approved Sheet batch resolved the remaining source-expression/readiness errors. Two authenticated runs of Drive version `642` now produce the same normalized model SHA-256, `1e21863128950325204830abd7e4d3d4f821c56c2df9829b7bd2cd6d172a4da3`, with zero errors and 28 intentional warnings: 25 preserved runtime-subsystem stubs and three non-selectable draft Techniques with incomplete mechanics.

## Repository corrections and approved decisions

1. Blank optional ClassSkills identity fields are valid when required identity parts exist.
2. Primary-attribute conditions compare case-insensitively while preserving display capitalization.
3. Nested `OPTION_GROUP` rows are valid and recursively emitted.
4. Source-owned `skill`/`gadget` and source-relative `specialization` expressions retain typed meaning.
5. Stubbed `vehicle` grants preserve an explicit rank.
6. Descriptions are optional for every record type; blanks never control mechanical readiness or selectability.
7. An unambiguous answer-producing grant may derive its stable choice identity from its owning feature. The 13 previously proposed redundant `choiceId` additions are rejected.
8. Monster Evolution choices require explicit unique IDs because their later rank operations address them through `choiceRef`.
9. `familiar-rank` becomes generic `rank`; `weapon-upgrade` and `weapon-enhancement-swap` become generic `choice-rebind` operations.
10. Rebinding is a source-owned overlay. The base answer remains stored and is validated against its original grant. Removing a rebind source reveals the preceding overlay or base answer.
11. `disguise-makeup`, `distant-whispers`, and `watercolor-illusion` are exported as non-selectable `draft` Techniques.
12. Official source acquisition uses the dedicated Viewer-only service account through short-lived user-ADC impersonation; no persistent key exists.

## Applied canonical-Sheet batch

The user approved these exact cells, values, and validation changes on 2026-08-05. The batch was applied atomically through the connected Sheets API and then read back with values, validation, and formatting metadata. Every target matched; no other cells, formulas, formatting, or validations were changed.

### Schema declarations

Change `yes` to `no` in `Schema!D29,D37,D77,D88,D99,D109,D118,D148`. These are respectively the `description` declarations for ClassFeatures, Techniques, Feats, Origins, OriginFeatures, WeaponBases, WeaponProfiles, and WeaponEnhancements.

### Monster Evolution grants

Replace each entire grants cell with the following two-line value:

- `ClassFeatures!I43`: `familiar | choiceId=monster-evolution-companion | count=1`, then `rank | choiceRef=monster-evolution-companion | operation=increase | value=1`.
- `ClassFeatures!I48`: `familiar | choiceId=monster-evolution-4-companion | count=1`, then `rank | choiceRef=monster-evolution-4-companion | operation=increase | value=1`.
- `ClassFeatures!I51`: `familiar | choiceId=monster-evolution-6-companion | count=1`, then `rank | choiceRef=monster-evolution-6-companion | operation=increase | value=1`.
- `ClassFeatures!I54`: `familiar | choiceId=monster-evolution-8-companion | count=1`, then `rank | choiceRef=monster-evolution-8-companion | operation=increase | value=1`.
- `ClassFeatures!I57`: `familiar | choiceId=monster-evolution-10-companion | count=1`, then `rank | choiceRef=monster-evolution-10-companion | operation=increase | value=1`.

### Weapon Master rebinds

Preserve the two skill grants and the additional weapon-enhancement grant in each cell, but replace both specialized operations:

- `ClassFeatures!I102`: replace `weapon-upgrade` with `choice-rebind | choiceRef=soulbound-weapon | rank=2`; replace `weapon-enhancement-swap` with `choice-rebind | choiceRef=soulbound-weapon | answerType=weapon-enhancement | maxRank=2 | count=1`.
- `ClassFeatures!I104`: use the corresponding `rank=3` and `maxRank=3` values.

### Draft Techniques and validation

- Change `Techniques!AD73,AD74,AD80` from `selectable` to `draft`.
- Change dropdown validation on populated selection-mode ranges `Techniques!AD2:AD86` and `WeaponEnhancements!H2:H32` from `selectable, granted-only` to `selectable, granted-only, draft`, preserving every existing cell value except the three named Techniques.

### Enum declarations

Append these rows to the currently empty `Enums!A43:C45`:

1. `selectionMode` | `draft` | `Exported for review but unavailable for normal selection or grants.`
2. `grantType` | `rank` | `Applies a set or increase operation to the answer rank referenced by choiceRef; source removal removes the modifier.`
3. `grantType` | `choice-rebind` | `Rebinds a prior choice through a source-owned overlay; source removal restores the preceding overlay or base answer.`

No other Sheet cells, formatting, formulas, or validations were in scope. Every target and its validation metadata was re-read immediately before the write and again after it.

## Runtime boundary

`rank` and `choice-rebind` are losslessly parsed, validated, serialized, staged, and runtime-loaded with explicit stub warnings. Work Package B does not add builder graph behavior. Executable overlay storage, widgets, persistence migration, validation of each layer, and reversion during graph reconciliation require a later character-builder vertical slice.

No production JSON change, publish, or production deployment may occur from this register alone. Any future canonical-Sheet write requires a new exact user-approved scope.

## Authenticated completion evidence

Runs `20260808T194536442Z-37004` and `20260808T194543102Z-38020` independently fetched unchanged Drive version `642`. Google produced different raw XLSX transport hashes, while both runs produced the same normalized model and byte-identical nine-artifact runtime set after raw transport provenance was isolated from runtime revision identity. Runtime loading passed without diagnostics, production remained untouched, and the exact candidate identity is recorded in [game-data-release-candidate-2026-08-08.md](game-data-release-candidate-2026-08-08.md).
