# Builder flow

Status: living current/transition contract. The pure `CharacterSession` lifecycle is implemented and specified in [character-session.md](character-session.md); graph policy and page/domain integration remain scheduled in [roadmap.md](roadmap.md).

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

Shared transition utilities live in:

- `builder-common.js`: auth/GM bootstrap, URL context, normalized reads, narrow writes, modal support, dirty-navigation adapter;
- `builder-page.js`: widget registration, proposed patch construction, graph preview, fail-closed confirmation, exact reconciled-state application;
- `builder-dependencies.js`: current preview/reconcile API;
- `database-reader.js` and `database-writer.js`: transitional persistence boundary.

Class and Techniques currently use `BuilderPage` most directly. Other pages still contain legacy page-owned state/policy and will migrate in vertical slices; their current existence is not permission to copy that pattern.

## Proposed-change safety

A choice edit must follow this sequence:

1. Widget/page produces a proposed patch without mutating persisted state.
2. `BuilderPage` combines current widget state and the pending patch.
3. The dependency layer reconciles a proposed clone in memory.
4. Validation errors reject immediately and never invoke confirmation.
5. Dependency removals fail closed if no confirmation handler exists.
6. Cancellation changes neither working builder state nor widget display.
7. Acceptance applies the exact `reconciledBuilder` that produced the preview.
8. The normal page save path persists the reconciled state.

Incomplete but non-destructive expected selections may be informational. Destructive impacts and blocking errors are different structured categories and must not be inferred by filtering warning strings.

### Choice rebinds

A `choice-rebind` grant reopens an existing answer slot under new eligibility constraints without overwriting the answer originally stored for that slot. The proposed replacement is source-owned overlay state. Validation checks the original answer against its original grant and each overlay against the grant that created that overlay. The effective answer comes from the highest-precedence active overlay.

If the feature supplying an overlay disappears, reconciliation removes only that overlay and restores the preceding overlay or original answer. Cancellation preserves every layer. A rebind that invalidates dependents follows the normal preview/confirmation flow. The schema-v2 pipeline currently preserves this typed meaning as a runtime stub; the widget, persistence, and graph implementation requires its own later vertical slice.

## Save and navigation behavior

- `Save` may persist an incomplete but structurally valid character after presenting applicable information/warnings.
- `Next`, `Previous`, direct step links, Characters/Profile links, and “Save & Open Character Sheet” all use the same page flush boundary.
- Saves are serialized. Edits made while a save is in flight remain dirty until a later successful flush.
- Save failures remain visible and retryable.
- The character sheet writes only its temporary owned leaves; it cannot save builder-owned values.

## Adding or migrating a page

During the current transition:

1. Add the page/module and one registry entry.
2. Use the shared auth, shell, URL, navigation, status, and persistence boundaries.
3. Prefer `BuilderPage` and shared widgets for choice edits.
4. Produce proposed changes; do not pre-clear dependent fields.
5. Use shared Rules for capacities/prerequisites/expected counts.
6. Route every exit through the same validate/preview/confirm/save callback.
7. Add tests for edit, error, cancellation, confirmation, save, navigation, and reload.

Do not add new `onBeforeNext`-only behavior. Do not calculate remaining slots or dependent removals inside the page merely to make a control look enabled.

## Target session flow

Work Package C now provides typed class/technique commands and protected `CharacterSession` persisted/working/proposed/reconciled states. The current pages do not yet use that session. Later graph/domain work supplies real reconciliation policy, adds domain commands, and removes arbitrary widget patches and remaining page-owned policy. A fully migrated page will:

- load one session projection;
- collect widgets;
- submit typed commands;
- render structured session impacts;
- request confirmation when policy requires it;
- save through the definitive database reader/writer boundary;
- contain no domain-specific capacity, prerequisite, or dependent-removal authority.
