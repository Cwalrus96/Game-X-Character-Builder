# Builder flow

Status: living current/transition contract. The previously planned Class/Feat, Attributes, Equipment, Techniques, Origin, Skills, and Bonds/Keystones pages use `CharacterSession` plus the graph in local review. The user's September 21 scope addition requires first-class Trait Rules, widgets, saved state, and graph integration; these are not complete merely because Trait data imports. Their personal manual acceptance is deferred and nonblocking. Compatible game data, concrete behavior verification, and the required new Trait implementation remain engineering work; the deployed Class-only hotfix is recorded separately in `docs/status.md`.

## Step registry

`public/js/builder/builder-flow.js` is the single step-order registry. Every entry has:

- `id`: stable visited-state identity;
- `title`: full orientation label;
- optional `navTitle`: compact label;
- `path`: site-root-relative HTML path;
- optional `isEnabled(character)`: future conditional inclusion.

Prev/Next relationships are derived. Do not hardcode neighboring page URLs inside page modules.

Current order:

1. Name & Profile
2. Class
3. Attributes
4. Origin
5. Skills
6. Equipment
7. Techniques
8. Bonds & Keystones

## Navigation contract

`public/js/builder/builder-nav.js` renders the shared orientation/navigation surface:

- current step uses `aria-current="step"`;
- previously visited steps are links;
- unvisited steps are visibly locked unless an explicit mode allows all steps;
- Previous/Next and direct step links use one `onBeforeNavigate(target)` callback;
- external same-origin navigation is routed through the installed dirty-navigation guard.

A dirty page leaves only after its ordinary validate/preview/confirm/save flow succeeds. Failed saves and cancelled warnings keep both navigation and working state in place. Refresh/tab close uses the browser-native unload warning while state is dirty or saving.

## Current page lifecycle

The accepted replacement path for migrated domains is:

- `character-session-page.js`: portable widget registration, typed command proposals, structured impact confirmation, exact acceptance, and save snapshots;
- `CharacterSession` plus the Character Dependency Graph facade: canonical state and dependency authority;
- `database-reader.js` and `database-writer.js`: the separate definitive v5 persistence boundary.

The compatibility path for untouched domains remains in:

- `builder-common.js`: auth/GM bootstrap, URL context, normalized reads, narrow writes, modal support, dirty-navigation adapter;
- `builder-page.js`: widget registration, proposed patch construction, graph preview, fail-closed confirmation, exact reconciled-state application;
- `builder-dependencies.js`: current preview/reconcile API;
- `database-reader.js` and `database-writer.js`: transitional persistence boundary.

Every current builder domain page uses the replacement path in the local review environment. Compatibility modules remain only because focused acceptance has not authorized deletion. Replacement widgets are portable UI components: pages inject session projections, game data, actions, and structured impacts; widgets own DOM/accessibility/interaction behavior without owning a character copy or database access. The graph compiler and each migrated widget consume the same centralized Rules projection for Attributes, Skills, Origin, Bonds, and Feats. Graph reconciliation remains authoritative for applying limits, deterministic fitting, source materialization, and dependent changes.

A class-granted utility skill supplies a free minimum rank, not a locked final rank. The Skills Rules projection combines that floor with any persisted higher rank, charges Skill Points only for ranks above the grant, applies the ordinary level/cap limits, and preserves paid ranks if the grant is later removed. Core and named setting utility skills use the same rule.

The Feats control displays only choices supplied by active explicit `feat` grants. Character level can activate a feat-granting feature, but level never creates a second automatic slot. The shared Rules projection applies grant type/category/max-level filters and assigns persisted feat keys to source-owned slots deterministically. Removing or deactivating the granting feature therefore produces a reviewed dependency removal; cancelling it leaves the selected feat unchanged.

## Proposed-change safety

A migrated choice edit must follow this sequence:

1. Widget produces a narrow typed command without mutating accepted state.
2. `CharacterSession` applies it to a protected proposed clone.
3. The Character Dependency Graph facade reconciles that clone in memory.
4. Validation errors reject immediately and never invoke confirmation.
5. Dependency removals fail closed if no confirmation handler exists.
6. Cancellation changes neither working builder state nor widget display.
7. Acceptance commits the exact schema-v5 reconciled state that produced the impacts.
8. The page passes the session's exact revision-bearing save snapshot to the database writer.

Incomplete but non-destructive expected selections may be informational. A migrated page presents only informational impacts whose exact storage path belongs to fields that page can edit. This current-page ownership is explicit and does not depend on `visitedSteps`, so an Attributes save does not warn about a missing Origin, feat, Bond, or another later-page choice. Destructive impacts caused by the current proposal and blocking structural errors are different structured categories; they are not suppressed by current-page informational scoping and must not be inferred by filtering warning strings.

### Choice rebinds

A `choice-rebind` grant reopens an existing answer slot under new eligibility constraints without overwriting the answer originally stored for that slot. The proposed replacement is source-owned overlay state. Validation checks the original answer against its original grant and each overlay against the grant that created that overlay. The effective answer comes from the highest-precedence active overlay.

If the feature supplying an overlay disappears, reconciliation removes only that overlay and restores the preceding overlay or original answer. Cancellation preserves every layer. A rebind that invalidates dependents follows the normal preview/confirmation flow. The schema-v2/v3 pipeline currently preserves this typed meaning as a runtime stub; the widget, persistence, and graph implementation requires its own later vertical slice.

## Save and navigation behavior

- `Save` may persist an incomplete but structurally valid character after presenting informational warnings for fields editable on the current page. Blocking errors and destructive impacts caused by the current proposal remain applicable across page boundaries.
- `Next`, `Previous`, direct step links, Characters/Profile links, and “Save & Open Character Sheet” all use the same page flush boundary.
- Saves are serialized. Edits made while a save is in flight remain dirty until a later successful flush.
- Save failures remain visible and retryable.
- Widgets may temporarily disable only controls they own while submitting a command. They never disable page-owned Save or navigation actions; the page/session save boundary owns those controls.
- The character sheet writes only its temporary owned leaves; it cannot save builder-owned values.

## Adding or migrating a page

During the current transition:

1. Add the page/module and one registry entry.
2. Use the shared auth, shell, URL, navigation, status, and persistence boundaries.
3. Use `CharacterSessionPage` and portable widgets for a migrated domain; do not extend `BuilderPage` into new work.
4. Produce proposed changes; do not pre-clear dependent fields.
5. Use shared Rules for capacities/prerequisites/expected counts.
6. Route every exit through the same validate/preview/confirm/save callback.
7. Add tests for edit, error, cancellation, confirmation, save, navigation, and reload.

Do not add new `onBeforeNext`-only behavior. Do not calculate remaining slots or dependent removals inside the page merely to make a control look enabled.

## Target session flow

Work Packages C and D now provide typed class/technique/equipment commands, protected `CharacterSession` persisted/working/proposed/reconciled states, and a deterministic graph compiler/fixed-point reconciler with a session adapter. Work Package E adds the remaining domain commands/handlers and removes arbitrary widget patches and remaining page-owned policy one vertical slice at a time. A fully migrated page will:

- load one session projection;
- collect widgets;
- submit typed commands;
- render structured session impacts;
- request confirmation when policy requires it;
- save through the definitive database reader/writer boundary;
- contain no domain-specific capacity, prerequisite, or dependent-removal authority.

The page, rather than the widget or session, coordinates the save snapshot with that database boundary and acknowledges its revision. `CharacterCodec` remains the only whole-character structural validator; widget input checks, command decoding, Rules, graph diagnostics, and persistence conflict checks remain intentionally scoped to their own boundary.
