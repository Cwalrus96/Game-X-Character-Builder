# Work Package A completion: save and preview safety

Status: implementation and automated verification complete as of 2026-08-03. Manual browser acceptance is pending.

Work Package A establishes safe behavior around proposed character changes and persistence. It does not complete the dependency-graph redesign or the game-data contract work planned for later packages.

## Behavioral contract

A builder change follows this lifecycle:

1. A widget or page produces a proposed patch without mutating persisted state.
2. The dependency layer previews and reconciles the patch in memory.
3. Validation errors block immediately and cannot be confirmed away.
4. Destructive dependency removals require a confirmation handler and affirmative confirmation.
5. Cancellation leaves the working builder and widget state unchanged.
6. Acceptance applies the exact reconciled state that produced the impact report.
7. Persistence occurs through the shared database boundary.

The character sheet owns only temporary play-state leaves. It cannot write builder-owned character identity, class, level, attributes, skills, abilities, techniques, or equipment.

## Acceptance matrix

| Requirement | Implementation | Automated evidence |
|---|---|---|
| Preview errors cannot apply or be confirmed | `public/js/builder/builder-page.js` | `tests/character-dependency-graph.test.mjs`: validation errors never invoke confirmation |
| Destructive warnings cannot apply silently | `public/js/builder/builder-page.js` | missing-handler, cancellation, and confirmed-apply tests |
| Class changes preserve dependent state until graph reconciliation | `public/js/builder/builder-class.js`, dependency graph | class command, source-owned answer, cancellation, and immediate-summary tests |
| Dazzling Wand answers are source-owned and removable through the graph | dependency graph, choice identity, technique-choice widget | grant-node, orphan-removal, migration, slot-count, and removal-summary tests |
| Character-sheet autosave cannot overwrite newer builder state | `public/js/core/sheet-state.js` | exact leaf-path and stale-sheet-tab tests |
| Saves are serialized and edits made during a save remain dirty | `public/js/core/save-coordinator.js` | coalescing, one-in-flight-save, failure, retry, and clean-flush tests |
| Save state and failures are visible and actionable | `public/js/core/save-status.js`, character-sheet status and Retry controls | dirty failure, load failure, and busy presentation tests |
| Confirmation controls cannot duplicate or leave promises unresolved | shared native builder dialog and `public/js/core/dialog-lifecycle.js` | supersession, settle-once, fail-closed, and focus-restoration tests |
| Dirty navigation cannot silently discard edits | `public/js/core/navigation-guard.js` and builder/sheet adapters | clean, dirty, failed, unload, repeated-click, coordinator, and link tests |

## Reproducible verification

Run unit tests that do not require Firebase emulators:

```powershell
npm test
```

Run Firestore and Storage rule tests in the Firebase emulators:

```powershell
npm run test:rules
```

Rule tests use `firebase.rules-test.json` and dedicated ports 8180/9299, so they do not collide with the normal local-development emulators on 8080/9199.

Run both groups:

```powershell
npm run test:all
```

The unit runner discovers `tests/*.test.mjs` while deliberately excluding `*.rules.test.mjs`, which require the emulator environment.

## Manual browser acceptance checklist

Start the local app with `npm run local:start`, use the emulator-backed local account, and complete these scenarios.

### 1. Destructive Class reconciliation

1. Select Magical Guardian and Dazzling Wand.
2. Choose the technique granted by Dazzling Wand and save.
3. Change the class or remove the option that owns Dazzling Wand.
4. Verify the dialog names the affected source-owned technique.
5. Cancel and verify the class, option, and technique remain selected.
6. Repeat and confirm; verify the source-owned technique is removed.

Expected: the graph reports and controls the removal. The page does not pre-clear the answer.

### 2. Capacity reconciliation

1. Select enough feats or techniques to use the current level's capacity.
2. Lower the level so capacity decreases.
3. Verify the preview identifies selections that must be removed.
4. Cancel and confirm state is unchanged.
5. Repeat and accept; save and reload.

Expected: accepted state matches the preview and survives reload.

### 3. Technique ownership and counting

1. Verify a technique chosen through Dazzling Wand is visibly source-owned.
2. Verify it does not consume a normal technique slot.
3. Select and save a normal technique.

Expected: granted/source-owned and normal selections remain distinct.

### 4. Dialog keyboard behavior

1. Trigger a destructive confirmation from a focused control.
2. Verify focus initially lands on Cancel.
3. Use Tab and Shift+Tab; verify focus remains inside the native modal.
4. Press Escape; verify the change is cancelled and focus returns to the triggering control.
5. Trigger it again and confirm with the keyboard.

Expected: no duplicate dialogs, background interaction, lost focus, or unresolved UI state.

### 5. Builder navigation safety

1. Edit each builder page, then click Characters or Profile without pressing Save.
2. Verify the page runs its normal validation/warning/save flow before leaving.
3. Cancel a warning and verify navigation stops with edits intact.
4. Test Previous, Next, Save, and Save & Open Character Sheet.

Expected: clean pages navigate immediately; dirty pages leave only after a successful save.

### 6. Refresh and tab-close safety

1. Make an unsaved builder edit and immediately refresh or close the tab.
2. On the sheet, make an edit and refresh before the autosave debounce completes.

Expected: the browser's native unsaved-changes warning appears while state is dirty or saving. Browser security rules control the warning text.

### 7. Visible sheet saves and retry

1. Edit HP, Strain, Overstrained, Notes, and Conditions.
2. Observe Unsaved changes, Saving, and Saved states.
3. Stop or disconnect the emulator, make another edit, and wait for autosave.
4. Verify the persistent failure message and Retry button appear.
5. Restart the emulator and use Retry.

Expected: failure preserves dirty state; Retry eventually reaches Saved.

### 8. Two-tab write isolation

1. Open the same character's builder and sheet in separate tabs.
2. In the sheet tab, leave an edit pending.
3. In the builder tab, change class, level, attributes, or equipment and save.
4. Return to the sheet tab and let its save complete.
5. Reload both tabs.

Expected: the sheet-owned HP/Strain/Notes/Conditions change persists, and every newer builder-owned value remains unchanged.

## Sign-off boundary

Automated completion means the safety contracts are directly tested and reproducibly runnable. Release sign-off still requires the manual browser checklist because focus behavior, native unload prompts, Firebase emulator transitions, and multi-tab timing depend on real browser integration.
