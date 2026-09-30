# Performance baseline — September 29, 2026

This baseline precedes application optimization. Only benchmark tooling and evidence were added. Application commit: **ae069ead383027ac7d9b6d49db039ce4931eadd1**, including the local sheet-formatting change; this is not a claim that this commit is deployed.

[Raw results, file hashes, environment, exclusions and failure record](benchmarks/2026-09-29-baseline.json) · [Reproduction procedure](../scripts/performance/README.md)

## Browser measurements

Desktop in-app Chromium 154.0.0.0, 1280 × 720, DPR 1, Windows 11, Intel i7-11800H. The harness configured no CPU/network throttling; inherited renderer/browser conditions were not fully controlled. Local static server and existing Firebase emulators. The anonymized level-2 Henshin Hero fixture has two Feats, five ordinary Techniques, granted Techniques, three weapons and four Bonds. Writes targeted only `users/local-dev-user/characters/benchmark-20260929-ae069ea` in the emulator.

The primary table uses **fresh tabs after recovery from a browser-tab crash**. No application optimization occurred between phases. Sample counts are explicit; these describe one machine/run, not production tail latency.

| Common action | Samples | Median | Slowest |
| --- | ---: | ---: | ---: |
| Apply HP adjustment: immediate feedback | 10 | 20 ms | 26 ms |
| Apply HP adjustment through Saved | 10 | 1.246 s | 1.280 s |
| Reload sheet through ready content | 10 | 385 ms | 435 ms |
| Change Agility between 4 and 3 | 10 | 292 ms | 351 ms |
| Change Society rank between 1 and 0 | 10 | 267 ms | 342 ms |
| Save on Attributes | 5 | 581 ms | 631 ms |
| Save on Skills | 5 | 658 ms | 676 ms |
| Attributes → Skills, including automatic save | 6 | 1.273 s | 1.325 s |
| Skills → Attributes, including automatic save | 5 | 1.295 s | 1.396 s |
| Toggle Visor Scan selection | 2 | **7.086 s** | **7.199 s** |
| Save on Techniques | 2 | **10.319 s** | **10.644 s** |

Single fresh-tab observations: Techniques ready in **2.910 s**; sheet ready in **432 ms**. Initial visits were not guaranteed cold disk/OS/network-cache loads. Explicit Save repetitions include the first save after accepted edits and subsequent saves with unchanged accepted values.

Selections measure trusted DOM event capture through two animation frames, covering synchronous handlers and next-frame work. This is a paint-opportunity proxy, not hardware presentation time or formal INP. Saves end after Saved and two frames; HP includes the existing 1,200 ms debounce. Page switches begin at the source link click and include its save. Human typing/confirmation time is excluded. The observer does not invoke app actions or bypass validation; its small overhead must remain consistent between comparisons.

## Earlier session and failure

The first benchmark tab produced slower results with identical application/catalogue files:

| Action | Samples | Median | Slowest |
| --- | ---: | ---: | ---: |
| Attribute changes, isolated samples | 8 | 1.279 s | 1.391 s |
| Skill changes | 10 | 1.396 s | 1.563 s |
| Attributes Save | 10 | 2.503 s | 2.775 s |
| Skills Save | 5 | 2.638 s | 2.711 s |
| Attributes → Skills | 6 | 4.142 s | 4.461 s |
| Skills → Attributes | 5 | 4.197 s | 4.250 s |
| Technique selection | 4 | **27.362 s** | **28.720 s** |

The first Techniques load took **10.292 s**; Skills → Techniques took **12.801 s**. The first Techniques Save produced no Saved sample and the tab displayed a crash page. A 55-second result wait expired; no precise crash-duration measurement is available. Emulator readback remained at revision 28 with five Techniques and 76 HP. Fresh-tab retries succeeded in 10.644 s and 9.995 s.

**The phase difference and crash cause are unconfirmed.** Do not pool phases or treat recovery as optimization. This does not establish a memory leak, server overload or group-load capacity. Future comparisons need both fresh-tab and repeated-use scenarios with tighter browser/renderer controls.

The four slow Technique changes spent 27.217–28.714 seconds in recorded long browser tasks; the fresh-session pair spent 6.972 and 7.197 seconds. Client work is an observed contributor in both phases. Long-task totals are diagnostic, not a complete additive decomposition; cross-page totals include source time while destination task records do not.

Raw evidence preserves three excluded attribute rows: one no-op calibration and two overlapping inputs. Fresh attribute/skill runs waited for each measurement before the next input. Failed automation attempts without a changed selection were not counted. Long-handler timeouts were followed by recorded-completion and rendered-checkbox checks before continuing.

## Calculation-only measurements

Node 22.22.1, serial execution, two discarded warmups and **20 recorded samples per case**. Catalogue loading, skill-name projection, stored-character migration and session setup occur outside the timer. No DOM, Firebase or human decision time is included.

| Operation | Median | p95, nearest rank |
| --- | ---: | ---: |
| Attribute proposal and acceptance | 316 ms | 383 ms |
| Skill proposal and acceptance | 366 ms | 394 ms |
| Feat removal proposal and acceptance | 501 ms | 585 ms |
| Technique removal proposal and acceptance | 361 ms | 421 ms |
| Initial full reconciliation | 352 ms | 403 ms |
| Technique ownership projection | 25 ms | 34 ms |
| Sheet Technique projection | 23 ms | 30 ms |
| Save snapshot only | 0.16 ms | 0.24 ms |
| Attribute save checks and snapshot | 720 ms | 821 ms |
| Technique save checks and snapshot | 1.073 s | 1.149 s |

Save-check cases mirror repeated page-level reconciliations but exclude widget notifications, rendering, persistence and post-save refresh. Do not present them as full saves or subtract Node numbers from browser totals as if the runtimes were equivalent. The snapshot-only timing is not representative of player wait time.

## Live public asset delivery

Twelve serial Node HTTP requests: one GET and five conditional repeats per asset, using a shared connection pool. No browser parsing, authentication or character-database requests.

- Sheet HTML: first request **116 ms**; conditional requests **6.8–31.7 ms**, returning 304.
- Catalogue: first request **35.4 ms**; conditional requests **6.4–10.3 ms**, returning 304. The first response used Brotli. **2,775,498 bytes** is decoded size, not wire size.
- Both advertised `max-age=3600`. Local builder resource entries show full catalogue transfers with the callers' `no-store` behavior; sheet reloads show catalogue cache hits. The local server's cache settings and extra local-review 404 are recorded separately in the procedure.

This is one delivery snapshot, not a production-save, mobile, shared-Wi-Fi, simultaneous-player or same-character contention benchmark. Those remain unmeasured.

## Comparison and verification

Keep the raw baseline immutable. Use a separate output directory for changes, identical fixture/catalogue hashes and equivalent fresh-tab/repeated-use conditions. Repeat the same actions and readiness checks. Compare medians, maxima, long tasks and failures while requiring unchanged selections, dependency confirmation/cancellation and save/reload behavior. Record differing environments/sample counts explicitly.

Preflight passes **671 units**, the **ten-artifact data baseline**, and **15 HTML asset checks**. The final core suite completed all 200 samples with canonical-state and actual-change assertions. Final verification checks script syntax, application-file hashes, unchanged catalogue and restored expected HP/attributes/skills/Techniques in the disposable emulator character. No writes target existing player records, and no optimization or deployment is included.

This evidence does not complete broader `WPE-DOMAIN-MIGRATION` acceptance or `WPF-UI-SYSTEM`; the latter remains shared controls, accessibility and navigation work. The performance follow-up should examine Technique catalogue rendering and repeated refresh work, then compare against this baseline.
