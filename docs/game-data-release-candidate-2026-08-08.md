# Game-data release candidate review — 2026-08-08

Status: exact-hash review approved and published through `WPB-PUBLISH` on 2026-08-09.

## Exact candidate identity

The immutable ignored staging run is `.staging/game-data/runs/20260809T022801911Z-51956`.

| Property | Exact value |
|---|---|
| Drive file ID | `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI` |
| Drive version | `647` |
| Drive modified time | `2026-08-09T02:27:03.310Z` |
| Candidate raw XLSX SHA-256 | `2db974d02773d340957a2f34c1c3de47f365064d5307658bba9572392ccd5916` |
| Normalized model SHA-256 | `c03ed329b10e27310baef32d73fe239c9146e415c332ae62f7842d81e9a17739` |
| Exporter version | `2.0.1-wpb-staging` |
| Runtime artifact schema | `2` |

The previous staging candidates were superseded after the user approved canonical corrections for Longsword, Shuriken, Greatsword, Gravity Weapon, and Seismic Weapon. The raw XLSX hash identifies this candidate's transport bytes; the Drive revision and normalized model identify its stable source meaning.

## Runtime artifact hashes

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `classes.json` | 18,653 | `21e43f0b5fdd31273c321b0257a2dcdef698ada145867ff00e208672707fb559` |
| `class-skills.json` | 16,483 | `215de2cabf534ed2b69dd08cc9f1ed1f281b5ef978a6647f5ab5dd64b1f18a48` |
| `class-features.json` | 89,868 | `2fa2b7597c6454a4426b816d2e0566820ba6b3aba7b73ef9f483887cec6cdfff` |
| `feats.json` | 35,712 | `e0f7f78bc1682acc04bde78c16a30f2209707c6ba4c86bf254a28b6cf513339f` |
| `techniques.json` | 109,919 | `1c97d44358c7eb45648cc9b84faa08a76c0efbb3893b7f3062672f19f8055a40` |
| `origins.json` | 42,184 | `a5d1aa39a07c139c37cd291e7a503ecf04b215e3cf610dabc8ab1c7e6422bac1` |
| `weapon-bases.json` | 56,935 | `9ade906def32c14d597d4166913a28a4de6a0f9faea5b8a59b7f02c81de9f3de` |
| `weapon-enhancements.json` | 14,155 | `e71c273497442dd51baaee84f6397f0248342e951ecd1a76043e0f590aa70c6e` |
| `game-x-data.json` | 407,626 | `1b394658a0ac5042600e1f5ecd361f88f5fe2d98f2a339d77c0c4dba6b45a177` |

## Validation and content inventory

- Validation: zero errors and 28 warnings. Twenty-five warnings preserve explicitly stubbed future runtime subsystems; three warnings identify draft Techniques with incomplete energy-cost mechanics.
- Runtime-load acceptance: passed without diagnostics.
- Records: 19 classes, 66 class skills, 103 class features, 38 feats, 85 techniques, 15 origins, 23 origin features, 31 weapon bases, 33 weapon profiles, and 31 weapon enhancements.
- Frozen-release diff: one artifact added, one stale artifact removed, eight artifacts changed, and zero unchanged.
- `class-skills.json` is added. The old production `export-report.json` is removed from runtime artifacts and remains run metadata beside the staged artifacts.
- Twelve incomplete classes export with `selectable: false`: Elementalist, Mech Pilot, Psychic, JRPG Mage, Mastermind, Dragoon, Sports Athlete, Racer, Gamer, Idol, Spirit Exorcist, and Monster Hunter.
- Seven draft origins export with `selectable: false`: Magical Dimension, Curse, Manifest Spirit, Demon of Hard Work, Legend Reborn, Experiment, and Cyborg.
- Disguise Makeup, Distant Whispers, and Watercolor Illusion export as non-selectable draft Techniques. Dazzling Transformation remains non-selectable for normal selection because it is `granted-only`.
- The approved weapon corrections export as Longsword `Melee, Sharp, Versatile`; Shuriken `Sharp, One-Handed, Thrown 10, Volley, Concealed`; and Greatsword `Melee, Sharp, Two-Handed, Heavy`. The retired `Throwable` tag is absent.
- Gravity Weapon and Seismic Weapon each export with an executable Heavy tag prerequisite, `selectionMode: "draft"`, and `selectable: false`.

## Manual review procedure

1. Read `.staging/game-data/runs/20260809T022801911Z-51956/artifact-diff.md` for the artifact-level inventory.
2. Review `.staging/game-data/runs/20260809T022801911Z-51956/artifact-diff.json`. Its `structural` arrays contain every changed field path; its `semantic` sections contain every added, removed, and changed stable-identity record.
3. Inspect the corresponding files under `.staging/game-data/runs/20260809T022801911Z-51956/artifacts/` when a semantic or structural change needs its full surrounding record.
4. Confirm the added `class-skills.json`, removal of the stale runtime `export-report.json`, stable-key additions, normalized costs/expressions, and the incomplete class/origin selectability lists above are intended.
5. Approve or reject this exact candidate. Approval must name Drive version `647`, normalized-model SHA-256 `c03ed329b10e27310baef32d73fe239c9146e415c332ae62f7842d81e9a17739`, and the artifact hashes in this record. Any new Drive revision or different artifact hash requires a new review.

The user separately approved `WPB-DIFF-REVIEW` and then explicitly authorized `WPB-PUBLISH`. The release result and rollback instructions are recorded in [game-data-release-2026-08-09.md](game-data-release-2026-08-09.md).
