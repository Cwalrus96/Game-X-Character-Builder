# Builder flow

The character builder is designed as a multi-step wizard.

## Goals
- Steps are modular: each page focuses on one decision area.
- Navigation is consistent: every step has the same “step list + prev/next” controls.
- The flow is extensible: adding/reordering steps should be a single edit.

## Step registry
The canonical step order lives in:
- `public/js/builder/builder-flow.js`

To add a new step, add a new entry to `BUILDER_STEPS`:
- `id`: stable identifier for visited tracking
- `title`: label shown in the step list
- `path`: page URL (site-root-relative from the `public/` Hosting root, for example `/builder/builder-profile.html`)

Prev/Next relationships are derived at runtime.

## Navigation / orientation UI
Rendered by:
- `public/js/builder/builder-nav.js`

Behavior:
- shows all enabled steps
- user can only click steps they have already visited
- current step has `aria-current="step"`

## Shared builder utilities
Provided by:
- `public/js/builder/builder-common.js`

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

## Current implemented steps
The current registry contains these pages:
- `public/builder/builder-profile.html` / `public/js/builder/builder-profile.js` – Name & Profile
- `public/builder/builder-class.html` / `public/js/builder/builder-class.js` – Class
- `public/builder/builder-attributes.html` / `public/js/builder/builder-attributes.js` – Attributes
- `public/builder/builder-origin.html` / `public/js/builder/builder-origin.js` – Origin
- `public/builder/builder-skills.html` / `public/js/builder/builder-skills.js` – Skills
- `public/builder/builder-techniques.html` / `public/js/builder/builder-techniques.js` – Techniques
- `public/builder/builder-bonds-keystones.html` / `public/js/builder/builder-bonds-keystones.js` – Bonds + Background Keystones

## Extending with new pages
A new builder step should generally:
1. add the HTML page under `public/builder/` and point its module script at the JS file in `public/js/builder/`
2. call `initBuilderAuth()` and `loadCharacterDoc()`
3. render the page UI from the current doc
4. on edits, update local state and enforce caps/remaining points
5. on save, write a sanitized patch
6. call `renderBuilderNav()` with `onBeforeNext` to auto-save


Notes on the current flow:
- `builder-origin.*` remains the editing step for the Origin Keystone.
- `builder-bonds-keystones.*` edits structured bonds plus the 2 Background Keystones.
- The character sheet should render Bonds in their own section, while the generic Keystones section shows the non-bond keystones through a shared derived keystone model.
