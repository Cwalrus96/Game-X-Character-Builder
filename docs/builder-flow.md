# Builder flow

The character builder is designed as a multi-step wizard.

## Goals
- Steps are modular: each page focuses on one decision area.
- Navigation is consistent: every step has the same “step list + prev/next” controls.
- The flow is extensible: adding/reordering steps should be a single edit.

## Step registry
The canonical step order lives in:
- `public/builder-flow.js`

To add a new step, add a new entry to `BUILDER_STEPS`:
- `id`: stable identifier for visited tracking
- `title`: label shown in the step list
- `path`: page URL (relative to `public/`)

Prev/Next relationships are derived at runtime.

## Navigation / orientation UI
Rendered by:
- `public/builder-nav.js`

Behavior:
- shows all enabled steps
- user can only click steps they have already visited
- current step has `aria-current="step"`

## Shared builder utilities
Provided by:
- `public/builder-common.js`

Common responsibilities:
- authenticate the user and optionally support GM “edit as”
- load the Firestore character doc
- save a partial patch (with timestamps)
- show confirm modals
- track visited steps in the character document

## Auto-save
The design intent is:
- “Next” triggers an auto-save before moving forward
- “Save” should always be allowed (even if incomplete), but warns about missing requirements

## Extending with new pages
A new builder step should generally:
1. call `initBuilderAuth()` and `loadCharacterDoc()`
2. render the page UI from the current doc
3. on edits, update local state and enforce caps/remaining points
4. on save, write a sanitized patch
5. call `renderBuilderNav()` with `onBeforeNext` to auto-save
