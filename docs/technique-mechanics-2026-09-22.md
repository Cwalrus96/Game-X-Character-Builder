# Four Technique mechanics clarified — September 22, 2026

The user resolved the four open questions from the handbook migration. The canonical source, calculated displays, formatted outputs and handbook catalogue now reflect these decisions. This is source-content work; no production data was published or website deployed.

| Technique | Confirmed rule | Source cells |
| --- | --- | --- |
| Driving Barrage | Targets one creature in melee; the creature need not be grappled. | `Techniques!R159` |
| Lotus Lock | Uses one Action, with no Reaction route or trigger. | `Techniques!H162` |
| Hurricane Kick | Makes Unarmed Strikes against up to two different enemies along the existing movement. Its `basicAttack` references `unarmed-strike`; `rollRequired=N` and blank independent attribute/defense fields avoid a duplicate roll. Unarmed Strike already supplies Primary versus Physical. | `Techniques!C164`, `N164:P164`, `AD164` |
| Block the Blast | Both outcomes affect all allies in the triggering line or cone. Success increases each ally's degree of success by one; critical success leaves all those allies unaffected by the attack. | `Techniques!R167`, `T167:U167` |

Existing costs, movement, attack counts, access skills and other effects are preserved. The earlier Living Shield correction remains intact. None of these five migration questions remains open; unrelated unfinished game content is retained.

## Verification

- Preflight passes 503 unit tests and the ten-artifact production baseline. No application code or schema change was needed.
- Native readback covers the 390 cells in `Techniques!A156:AD168`: exactly ten values changed; all neighboring values, formatting and validation match the prewrite snapshot. Source dropdowns retain their existing allowed values; `Action` and `N` are valid selections.
- A complete native export compared with the preceding consistency snapshot confirms exactly those ten cell changes across the entire workbook. The other twelve tabs, row order and all other Technique cells are unchanged.
- Native calculated and formatted Technique blocks contain all four decisions. The existing formatter reports all eight output tabs updated. Its completion alert remained open long enough for Apps Script to report an execution timeout afterward; native readback confirms the completed outputs. No formula changes were necessary.
- The handbook's four affected catalogue entries were updated through one revision-guarded batch, preserving their table cells and typography. All 136 catalogue rows match current formatted source text and font/size/emphasis across 42,093 non-whitespace characters. All four document tabs, other tables and unrelated author prose are unchanged. No controls were detected in the trusted prewrite read.
- Source and formatted output were visually inspected in Google Sheets at 100% zoom. Existing dimensions and wrapping were retained.
- Immutable candidate `20260923T023328815Z-1644` stages ten artifacts with **0 errors / 114 warnings** and successful runtime loading. The whole candidate includes earlier unpublished source changes, so a future production review must cover the complete diff.
- The existing local-data installer installs this complete validated candidate under ignored, Hosting-excluded `public/local-review/`. HTTP readback from `http://127.0.0.1:5000/local-review/game-x-data.json` matches the staged bytes exactly. Reloading the local builder uses the clarified catalogue; production JSON remains unchanged.
- Source ID: `1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI`; modification time `2026-09-23T02:24:16.729Z`; Drive version unavailable/null. Native export: 473,636 bytes; SHA-256 `ff233f6662b00dd80aa85178c05d5ec089b2e8eb487a5dbee7054e27712f41cc`. Connector export supplied the snapshot because local ADC lacked source-read access; no credential or access change was made.

Ignored evidence is under `.staging/mechanics/`, `.staging/mechanics-preflight.log` and `.staging/mechanics-stage.log`. Concurrent application and instruction-consistency changes remain separate.

The next data boundary is `WPB-REQUIRED-CELLS-RELEASE`: review the complete staged candidate and obtain explicit production authorization before publishing the data and matching website. These content clarifications do not complete the separate `WPE-DOMAIN-MIGRATION` implementation package.
