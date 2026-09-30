# Technique performance — September 30, 2026

Technique selection now prepares character-wide Rules facts once per catalogue refresh instead of rebuilding ownership, prerequisites and combat ranks for each row. Feature-granted Technique pickers also reuse one prepared context for filtering, ranks and performance descriptions. Contexts live only for a refresh, so changes to skills, weapons, providers, prerequisites or the catalogue cannot leave a persistent stale cache. The Techniques page also stops rendering the same acknowledged state a second time after save.

The existing commands, graph reconciliation, dependency confirmations, legacy prerequisite compatibility, capacity rules and revision-aware database writes remain in place. No game data, saved schema, character-sheet appearance or production deployment changed.

[Original baseline](performance-baseline-2026-09-29.md) · [Raw comparison and hashes](benchmarks/2026-09-30-technique-update.json) · [Reproduction procedure](../scripts/performance/README.md)

## Results

Same Windows machine, in-app Chromium 154, 1280 × 720/DPR 1, anonymized level-2 fixture, published catalogue, local Firebase emulators and observational timing harness as the baseline. Timing suites ran serially. Selection timing ends after two animation frames; save timing ends after Saved plus two frames. These are local measurements, not production multiplayer capacity or formal INP.

| Action | Original fresh-tab median (n) | Updated clean-tab median (n) | Updated slowest | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Toggle Visor Scan | 7.086 s (2) | **0.489 s (10)** | 0.729 s | **93.1%** |
| Complete Techniques save | 10.319 s (2) | **1.150 s (5)** | 1.351 s | **88.9%** |
| Techniques initial ready | 2.910 s (1) | 0.779 s (1) | — | Single observations |

Five updated reloads took **0.640 s median**, 0.648 s maximum. After the control actions and five Attributes/Skills navigation round trips, ten more Technique toggles took **0.465 s median**, 0.628 s maximum; a subsequent save completed in 1.202 s. Skills → Techniques completed in 1.337 s, including the source-page save. The two sets of ten toggles stayed separate in the raw summaries. No crash occurred in this run.

An additional paired control served archived original code from `e0a4e3f` on port 5029, then the update on port 5027. The original code still took **6.649 s median for selection (n=2)** and **8.536 s for save (n=2)**. Compared with this control, the update reduced selection time by 92.6% and save time by 86.5%. All 185 archived files match baseline content: 145 match bytes exactly, while 40 have only Git archive versus Windows working-tree line-ending differences, verified by normalized content comparison. The three optimized application files match the original baseline bytes in the control. Fixture and catalogue hashes match the original benchmark.

Unchanged actions were repeated as controls; their differences are normal run variation, not claimed improvements from this change:

| Action | Original median | Updated median | Updated n |
| --- | ---: | ---: | ---: |
| Agility edit | 292 ms | 271 ms | 10 |
| Society edit | 267 ms | 249 ms | 10 |
| Attributes save | 581 ms | 579 ms | 5 |
| Skills save | 658 ms | 571 ms | 5 |
| Attributes → Skills | 1.273 s | 1.257 s | 6 |
| Skills → Attributes | 1.295 s | 1.196 s | 5 |

HP and sheet-load benchmarks were not rerun because those application paths did not change. The 200-sample Node suite was rerun: Technique removal through proposal/acceptance was 344 ms median, initial reconciliation 339 ms, and Technique save checks 1.017 s. Those are broadly consistent with the original 361 ms, 352 ms and 1.073 s. This change removes repeated UI projection work; it does not reduce graph checks or database transactions. Node and browser timings must not be subtracted from each other.

## Browser conditions and preserved evidence

The initial updated tab produced one 597 ms toggle, then a slower phase after a read-only browser evaluation: Technique toggles had a 1.925 s median and saves 4.518 s. Unchanged Agility edits also slowed to 1.273 s. This resembles the original baseline's session variation; its cause is not established. Those rows remain in the report under `initial-session`, separate from the paired control and clean-tab results. The final comparison used DOM snapshots and locator reads without page evaluation. A preliminary 534 ms toggle from the first implementation pass is also retained, but is not part of the final-code comparison.

Some slower browser actions exceeded the automation tool's deadline even though the application continued. The harness waited for the already-dispatched action's completion record and checked its result rather than repeating the click. All comparison saves completed. The original baseline's crash is not claimed fixed.

The primary improvement percentages compare clean tabs with the original fresh-tab baseline; the paired control provides independent confirmation under this session's conditions. Small samples and uncontrolled inherited browser conditions limit claims about tails and real group play. Live multiplayer transaction contention, mobile performance and production network latency remain unmeasured.

## Verification and handoff

- Preflight: 671 unit tests, the ten-artifact game-data baseline and 15 HTML asset checks passed.
- Final `npm run test:all`: **676 unit tests, 22 emulator rule tests and 15 HTML asset checks passed**. The production-data baseline and `git diff --check` passed.
- Five new controlled tests compare prepared contexts with prior per-record evaluation; exercise changes to ranks, weapons, providers and catalogue prerequisites; check source-owned knowledge, strict granted eligibility, restored state and legacy unresolved-choice deferral. Existing source matrices, cancellation, capacity, grouping, save/conflict and Trait-provider tests remain passing.
- Browser checks verify every Technique toggle's checkbox/count, six completed saves, reload persistence, search, known-skill filtering, full expanded descriptions and no console errors. Normal navigation still saves before leaving.
- The final disposable emulator document is `benchmark-20260930-techniques-final`, revision **38**. Its entire decoded builder equals the starting fixture exactly. The original benchmark document remains revision **52**. The preliminary disposable fixture was not saved. No production character was accessed or edited.
- Exactly three application files changed; all remaining application hashes match the baseline. No timing scripts are shipped to the app; benchmark observers are injected only by the loopback server.

Local review: <http://localhost:5000/builder/builder-techniques.html?charId=benchmark-20260930-techniques-final>. Production has not been deployed. Remaining performance work should target repeated graph reconciliation on general saves and navigation, with the same confirmation/conflict protections and matched benchmarks. Wider `WPE-DOMAIN-MIGRATION` acceptance remains open; `WPF-UI-SYSTEM` follows with shared controls, accessibility and navigation consolidation.
