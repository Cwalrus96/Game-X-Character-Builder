# Milestone 0 completion: stabilization before Work Package B

Status: code and automated acceptance complete as of 2026-08-03. Manual browser smoke tests remain deferred and must pass before deployment.

This record closes the stabilization work that sits between Work Package A and Work Package B. It supplements the detailed [Work Package A completion record](./work-package-a-completion.md).

## Remaining stabilization work completed

### Production game-data export freeze

The exporter now rejects any output target at or below `public/data/game-x` before reading or writing the workbook. Staging exports remain available so Work Package B can repair and compare the exporter safely.

- Policy: `scripts/game-data-export-policy.mjs`
- Enforcement: `scripts/export-game-data.mjs`
- Regression coverage: `tests/game-data-export-policy.test.mjs`

The production lock must remain in place until Work Package B supplies the shared data contract, complete validation, provenance, and artifact-diff gate.

### Source-owned weapon integrity

The dependency graph now materializes generated weapons from active grant-choice answers. It restores their canonical weapon, rank, name, and enhancements from that answer; preserves unrelated manually-created weapons; adds an explicit choice-to-weapon graph edge; and removes the generated weapon when its source disappears.

`builder-dependencies.js` now includes `builder.weapons` in the reconciled patch, so a confirmed source change persists the exact weapon state analyzed in memory. The Equipment page displays source-owned weapons as read-only and directs the user back to the granting choice instead of offering an independent removal/edit path.

Regression tests cover both canonical rematerialization and source removal.

### Data-derived HTML safety

The three data-rendering paths identified by the architecture audit no longer assign interpolated strings to `innerHTML`:

- Class details and primary-attribute options;
- Class feature cards and empty states;
- Option-group headings and counts.

They now create DOM elements and assign data through `textContent` or text nodes. A static regression test protects this boundary.

### Route and asset correctness

The root route now loads the real `/css/styles.css` path, uses the shared login shell, provides semantic fallback navigation, and uses the site favicon. The generated Firebase 404 placeholder has been replaced with a branded, accessible page.

`npm run validate:assets` checks every local `href` and `src` in all HTML entry points. It currently validates 14 HTML files and is part of `npm run test:all`.

## Milestone 0 acceptance status

| Audit requirement | Status | Evidence |
|---|---|---|
| Named, reviewable checkpoint | Complete | The accumulated stabilization work is recorded on `codex/milestone-0-stabilization` before Work Package B changes begin. |
| Production exports frozen | Complete | Export policy tests and intentional `npm run export:data` refusal. |
| Critical graph/save regressions covered | Complete | 51 unit tests, including preview, source ownership, weapons, sheet isolation, dialogs, navigation, and save failures. |
| Class no longer pre-clears dependent state | Complete | Graph preview/cancel/confirm tests. |
| Sheet writes only sheet-owned leaves | Complete | Sheet-state unit tests and writer integration. |
| Save failures visible and saves serialized | Complete | Save coordinator/status tests and sheet UI. |
| Identified unsafe HTML paths replaced | Complete | DOM construction plus static regression test. |
| Dialog duplication and unresolved promises removed | Complete | Shared dialog lifecycle and four unit tests. |
| Dirty navigation protected | Complete | Shared guard and seven unit tests. |
| Service credentials outside repository | Complete | Admin credential policy tests and `docs/admin-operations.md`. |
| Root/404/static assets corrected | Complete | Static validator passes all 14 entry points. |

## Automated verification result

The final command was:

```powershell
npm run test:all
```

Result:

- 51 unit/regression tests passed;
- 11 Firestore/Storage emulator rule tests passed;
- 14 HTML entry points passed static asset validation;
- 0 failures.

The production export negative check also behaved as required:

```powershell
npm run export:data
```

It exited with code 1 before writing and reported that production game-data export is frozen until Work Package B adds full workbook validation.

## Deferred manual release checks

The browser scenarios in `docs/work-package-a-completion.md` remain pending: destructive confirmation/cancellation, capacity reconciliation, source-owned technique display, keyboard/focus behavior, dirty navigation and unload prompts, visible save retry, and two-tab write isolation.

These checks do not block beginning Work Package B in a separate reviewable change, but they do block deployment of the stabilization work.

Add one source-owned weapon browser check when suitable workbook data is available: choose the granting source, verify the weapon is read-only on Equipment, cancel removal and confirm it remains, then accept removal and verify only the generated weapon disappears.

## Work Package B handoff

Work Package B is a game-data contract and exporter repair, not a graph expansion. Start it in this order:

1. Baseline the checked-in release JSON and the exact live-workbook revision without changing either.
2. Write a field-by-field mapping for every live sheet, including OriginFeature, Feat, roleplay-question, energy-cost, grant, and prerequisite columns.
3. Define one shared contract for grant/prerequisite types, required fields, stable IDs, and cross-references.
4. Add validator fixtures for valid and invalid rows, including the invalid `5` feature bucket and empty feat record already found by the audit.
5. Separate workbook adaptation, normalization, validation, reporting, and artifact writing enough that validation can run without publishing.
6. Add provenance and a deterministic artifact diff to the staging export report.
7. Only after those checks pass against the live workbook, remove the production export freeze and generate a reviewable artifact diff.

Editorial cleanup remains a separate backlog. Work Package B should first reproduce the intended source faithfully and reject structurally invalid data.
