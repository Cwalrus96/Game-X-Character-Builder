# Character Sheet HP usability

Scope: the user's first requested Character Sheet feature only. The second feature, broader sheet refactoring, source data, and production deployment are outside this change.

## Persistence finding

Current HP already persists at `builder.sheet.fields.hpcur`. `collectFields` feeds `buildTemporarySheetUpdatePatch`; the save coordinator debounces and serializes `saveCloudNow`, which calls the existing `saveCharacterPatch` writer. `loadCloudOrInit` reads the Firestore document and restores HP through `applyState`/`applyFields`, including the string `"0"`.

The sheet still uses the transitional leaf-patch writer, unlike the builder's revision-aware session saves. The living persistence contract now clarifies this distinction. This feature reuses that path and makes no broader concurrency or migration change.

## Player behavior

- Enter `40` to set HP to 40, `+16` to heal to 56, or `-21` to reduce it to 35.
- Apply with Enter or by leaving the field. Enter followed by blur/change applies an adjustment once. Escape cancels the edit.
- Negative results stop at zero. Values above character maximum HP remain possible, as before. The existing storage bound is 999999.
- Empty, partial, fractional, scientific, malformed and oversized entries display an inline error and preserve accepted HP. Initially blank HP needs a direct value before a delta.
- Raw editing text stays separate from save snapshots. Other field edits, pending autosaves, and retries always collect accepted HP. The control is disabled until the character finishes loading.
- The existing resource styling, accessible label and save status remain; adjacent help explains the new interaction, and errors are associated with the field.

## Verification

- Before editing: `npm test` passed 561 unit tests.
- Final `npm run test:all`: 569 unit tests, 21 Firebase emulator tests, and asset validation for 15 HTML pages passed.
- `npm run baseline:data`: all ten reviewed production artifacts unchanged. `git diff --check` passed.
- Eight focused unit regressions cover parsing, bounds, invalid inputs, draft isolation, repeated events, direct entry, cancellation, loading/composition and blank/zero HP.
- A new authenticated emulator regression exercises the same sanitized sheet leaf update and timestamp as the transitional writer. Direct HP, both delta signs and zero survive fresh authenticated contexts, with every other builder field preserved.
- Local browser review on a newly created disposable character verified `40 → +16 → 56 → -21 → 35`, Enter/Tab, direct entry of 72, invalid `1e2` while Strain autosaves, reload, damage to zero, and zero after sign-out/sign-in. It caught a blur-event gap, repaired by explicitly committing on blur and covered by the event regression. Final full-suite results include that repair.
- At the browser's narrow 329px viewport, the help text wraps inside the existing HP card and no horizontal page overflow occurs. This is a bounded visual check, not full mobile keyboard or accessibility acceptance.

Preview: http://localhost:5000/character-sheet.html?charId=hp-usability-20260927. The disposable character ends at 35 HP; its temporary Strain test value was cleared. Logs: `.staging/hp-adjustment-preflight.log` and `.staging/hp-adjustment-test-all.log`.

Unrelated pre-existing builder and documentation edits remain outside the feature commit. No original character or production data was used for write testing. Wider `WPE-DOMAIN-MIGRATION` compatibility cleanup and `WPF-UI-SYSTEM` accessibility/navigation work remain open; this bounded HP request does not complete those steps. Production deployment still requires explicit instruction.
