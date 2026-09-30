# Performance baseline harness

These tools observe the current app. They do not optimize or edit application source, publish data, deploy, or access production character documents.

## Reproduce

Run from the repository root with Node 22 and installed project dependencies. Preserve the same catalogue bytes, fixture, browser version, viewport, machine, and sample order for before/after comparisons. Run timing suites serially, without tests/builds or other benchmark suites competing for CPU.

1. Run `node scripts/performance/core.mjs`. This writes `.staging/performance-baseline/core.json`. An optional first argument selects a fixture and the second selects the output JSON. It uses the app's skill-name projection, migration boundary, shared Rules, graph reconciler and CharacterSession. Each case has two discarded warmups and 20 recorded samples. Session setup is outside the timer. Proposal acceptance excludes human decision time. The save-check cases mirror page-level checks and snapshot creation; they exclude DOM work, persistence, and post-save refresh.
2. Start the existing local Firebase emulators. Run `node scripts/performance/seed.mjs benchmark-<unique-run-id>`. It creates, never overwrites, one local-only character using `scripts/performance/fixtures/typical.json`. It forces the Firestore emulator endpoint and uses `local-dev-user`.
3. Run `node scripts/performance/serve.mjs`. Open `http://127.0.0.1:5027/login.html?next=/character-sheet.html?charId=benchmark-<unique-run-id>` in the benchmark browser and use the normal local sign-in flow. Set the desktop viewport to 1280 × 720, DPR 1, with no throttling. The server exposes the existing `public` files, adds the observer script only in its HTML responses, excludes local catalogue overrides, and writes the application-file hashes to `.staging/performance-baseline/manifest.json`. It binds only loopback. JavaScript and HTML revalidate; other assets have a one-hour browser cache. This is a controlled local server, not the production CDN.
4. Through normal UI controls, perform this matrix, always verifying the resulting value, selected count, Saved status or destination before continuing:

| Action | Procedure |
| --- | --- |
| HP | Alternate `-1` and `+1`, apply with Enter, wait for Saved; 10 actions, ending at 76. |
| Sheet load | Reload the sheet 10 times; wait for enabled HP, populated Techniques, Saved and a recorded page-ready row. |
| Attributes | Open Attributes. Use native numeric arrow keys to alternate Agility 4 → 3 → 4, 10 changes. Do not rely on programmatic fill alone to emit a native change event. |
| Attribute save | Press Save and wait for Saved, 10 times. First follows accepted edits; remaining explicit saves repeat with the same accepted values. |
| Skills | Open Skills. Use the Society rank control to alternate 1 → 0 → 1, 10 changes. Save five times, verifying Saved. |
| Page switching | Follow the normal Attributes and Skills navigation links for five round trips. Measure from source click through destination readiness, including the app's automatic save. |
| Techniques | Open Techniques. Toggle Visor Scan off/on in pairs and verify Selected 4/5 or 5/5 after each. For slow handlers, preserve dispatched actions and verify completion instead of blindly retrying a timeout. Record sample count explicitly. |
| Technique save | With all five selections restored, press Save, wait for Saved and verify database revision. |

5. Read `.staging/performance-baseline/browser.jsonl`, preserving every raw row and noting calibration/failed attempts separately. The observer records local monotonic durations, ready-state timing, long tasks, catalogue resource sizes, browser version and viewport. A collapsed “Local benchmark measurements” panel also exposes recent rows in the UI.
6. Optionally run `node scripts/performance/static-network.mjs` for serial, read-only live Hosting requests. These measure public HTML/catalogue delivery, not authenticated page readiness or database saves. Preserve their separate output `.staging/performance-baseline/static-network.json`.

Use a fresh output directory/run snapshot between comparisons; the browser JSONL is append-only. Stop the local server with Ctrl+C when finished. Disposable emulator documents may be retained for inspection. Never run a production character write or stress test as part of this harness.

`summarize.mjs` packages this dated baseline, including its specific recovery boundary and explicit excluded rows. It is intentionally a September 29 evidence tool, not a generic classifier for later runs. Its verification input records the application-hash comparison and restored fixture readback. Preserve the dated JSON and use separate evidence files for future comparisons. In the completed run, ordinary actions were repeated in fresh tabs after a crash; the phase boundary and both sets of raw measurements are retained. Wait for each observer measurement, as well as the UI outcome, before sending the next input so two-frame intervals do not overlap.

## Timing definitions and limitations

- Selection/HP feedback: capture of the trusted DOM event through two animation frames, covering synchronous handlers and the app's next-frame work. This is a paint-opportunity proxy, not a hardware presentation timestamp or formal INP.
- Save: click/Enter through the Saved status plus two animation frames. HP includes the existing 1,200 ms debounce. Ordinary builder saves include revision-aware persistence and post-save UI work.
- Page readiness: navigation time origin through explicit ready state and two frames. First visits and reloads are separate. The first observed visit is not a guaranteed cold disk/OS/network cache.
- Page switch: original link click through destination readiness. Destination long-task figures exclude source-page work; total elapsed time includes it.
- Long-task duration is diagnostic, not an additive decomposition of total time. The observer and small collapsed panel add overhead; retain the same harness for comparison.
- Browser tests use local Firebase emulators. They cannot establish production transaction latency, mobile behavior or group-load capacity. Live static request measurements do not close those gaps.
- Use median and maximum for small browser samples. Core p95 uses the nearest-rank definition with 20 samples; neither constitutes a reliable production tail estimate.
- Treat speed gains as valid only with unchanged mechanical outcomes, dependency review/cancellation, save/reload behavior and data hashes. Use the same human-visible completion conditions after optimization.
