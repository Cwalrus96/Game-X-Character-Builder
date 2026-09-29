# Latest spreadsheet release check — September 29, 2026

The user requested a freshness check, a current spreadsheet export if needed, and production deployment only if generation has no errors. The live site already contains the latest committed website, including animated dice, HP adjustments, rolling and source-consistency fixes. Its game data still comes from the September 22 release. The fresh source does not pass the current importer, so publication and deployment did not occur.

## Evidence

- Git fetch succeeded; local `e4e78fc` and `origin/codex/work-package-b-data-contract` matched before recording this check.
- All 165 tracked public URLs were fetched. 164 matched committed Git bytes exactly; `favicon.svg` differs only by CRLF/LF checkout line endings. No code-content difference was found.
- Preflight: 632 unit tests, 15 HTML asset checks and the ten-artifact production baseline pass.
- Default `stage:data` could not authenticate with read-only Drive access. The connected Google Drive plugin successfully exported the exact canonical native Sheet as XLSX. Metadata reads before and after export both returned modification time `2026-09-28T22:49:32.208Z`; Drive version was unavailable and recorded as null. No connector credentials were transferred to repository scripts.
- Snapshot: 481121 bytes, SHA-256 `0a210a5cd5d0decac0591228d12b0a4170bf5eb77d2120a32277cf59b24597f8`. Canonical file ID: `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI`.
- Native workbook identity, required tabs, source versions, byte length and hash passed `validateAcquiredSnapshot` before staging.
- Immutable run `20260929T174241005Z-36352`: **3 errors / 111 warnings**, normalized-model SHA-256 `72b86ccca218bda625b60f8d4afc8e837598cf7a5b0dd4a8b600728a3de57244`. Validation stopped before runtime artifact construction; there is no artifacts directory or releasable candidate.

## Blocking findings

| Location | Finding | Consequence |
| --- | --- | --- |
| Schema row 117 | `Traits.repeatable` is not declared in the current importer contract. | New authored mechanics require integration. |
| Traits J1 | Unknown `repeatable` header. | The importer correctly refuses to discard the new column. |
| Traits I26 / ClassFeatures I79 | Elemental Blaster and Henshin Hero's Element both define `choiceId=element`; current validation indexes choice identities globally. | Ownership/reference resolution must be reviewed before this combination can be released. |

Schema row 117 explicitly defines `Y` as allowing repeated selections with a different option each time, defaulting blank to `N`, and records repeat-instance choice ownership/enforcement as runtime integration work. Elemental Blaster, Integrated Weapon and Combat Training currently set `repeatable=Y`. The existing Trait Rules still reject duplicate selections for a provider. Ignoring the column or merely allowing its header would misrepresent the authored rule. Integrated Weapon also remains reported as a deferred selectable-weapon projection; successful parsing alone would not implement its new selection behavior.

The next work is to integrate the authored Trait mechanics consistently through import, owned instances/options, eligibility, dependency review, persistence, builder controls and the sheet, and resolve owner-aware choice identity/reference validation with compatibility tests. Then acquire a fresh export, review the complete semantic diff and saved-character impact, and rerun release checks. This is additional supported-mechanics work within `WPE-DOMAIN-MIGRATION`; the subsequent `WPF-UI-SYSTEM` consolidates shared controls, accessibility and navigation after remaining domain acceptance. It is not grounds to alter source cells or weaken validation during this release check.

## State left intact

No canonical source cells, release approval, production baseline, runtime JSON, Hosting version, security rules, functions or character records changed. Unrelated workspace edits remain separate. The previously deployed site remains available with its last validated game data.

Local evidence is retained under `.staging/latest-release-source/`, `.staging/latest-release-preflight.log`, `.staging/latest-release-stage.log`, `.staging/latest-release-live-check.json` and `.staging/game-data/runs/20260929T174241005Z-36352/`.
