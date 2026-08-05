# Game X Character Builder

A lightweight, Firebase-hosted web app for creating and managing **Game X** characters.

The app is intentionally “no build step”:
- Static HTML/CSS/JS served from Firebase Hosting (`public/`)
- ES modules loaded directly in the browser
- Firebase Auth + Firestore + Cloud Storage as the backend
- Node tooling acquires the **authoritative Google Sheet** through read-only Drive access, validates it, and stages JSON consumed by the site

This repo is designed to be easy to extend as new builder pages and data-driven systems (classes/feats/techniques) come online.

---

## Quickstart

### Prereqs
- **Firebase CLI** installed and logged in
- Optional for data export: **Node.js** + npm

### Run locally
From the repo root:

1. Install dependencies if needed:
   ```bash
   npm install
   ```

2. Start the local Firebase Emulator Suite in the background:
   ```bash
   npm run local:start
   ```

3. Open:
   - App: `http://127.0.0.1:5000`
   - Emulator UI: `http://127.0.0.1:4000`

When the app is opened on `localhost`, `127.0.0.1`, or `::1`, it connects to the local Auth, Firestore, and Storage emulators instead of the production Firebase project.
Local sign-in uses a fixed emulator-only user ID, `local-dev-user`, so it does not open the Google OAuth popup and your local characters stay attached to the same local account. The Firebase browser SDK files are vendored under `public/vendor/firebase/`, which keeps local development from depending on the Firebase CDN after dependencies are installed.
Local saves go to the Firebase emulators, not the live website. The local wrapper saves emulator Auth, Firestore, and Storage data under `.firebase/local-data/` when you run `npm run local:stop`, and imports that data on the next `npm run local:start`.

Useful local commands:
- `npm run local:start` starts the emulators in the background
- `npm run local:stop` stops the emulators
- `npm run local:restart` reloads the emulator suite
- `npm run local:status` shows whether they are running
- `npm run local:logs` shows the recent emulator log
- `npm run local:deploy` makes sure the local app is running with your current Hosting files

For static HTML/CSS/JS edits under `public/`, the local server usually sees changes immediately. Use `npm run local:restart` after changing Firebase rules, indexes, emulator config, or when you want a clean local reload.

> Tip: this project uses client-side module imports; a “plain file://” open won’t work reliably. Use the Firebase local server.

### Deploy
From the repo root:
- `npm run deploy:remote` for everything configured in `firebase.json`
- `npm run deploy:hosting` for Hosting only
- `npm run deploy:rules` for Firestore and Storage rules only

---

## Folder map (high level)

- `firebase.json`  
  Firebase Hosting + Security Rules configuration. Hosting points to `public/` as the served directory.

- `firestore.rules` / `storage.rules`  
  Security rules for Firestore and Cloud Storage.

- `public/`  
  Everything served to the browser (pages, scripts, styles). Most HTML pages remain at the `public/` root; builder HTML pages live under `public/builder/`.
  - `css/` – shared and page-specific stylesheets
  - `js/core/` – shared browser modules (Firebase, auth, sanitization, rules, database helpers, game data, weapon helpers)
  - `js/builder/` – builder flow/navigation utilities and builder step modules
  - `js/pages/` – root-page entry modules
  - `character-sheet.html` / `js/pages/character-sheet.js` – character sheet rendering + saving, with an Edit link back into the builder
  - Other pages:
    - `characters.html` / `js/pages/characters.js` – list/create characters, with separate Edit and View actions
    - `login.html` / `js/pages/login.js` – sign-in flow
    - `gm_users.html` / `js/pages/gm_users.js` – GM tools (if enabled)
- `scripts/`  
  Dev-only tooling (not served by Hosting).
  - `export-game-data.mjs` – XLSX ➜ JSON exporter for classes/feats/techniques
  - `admin/` – reviewed Firebase administration commands; see `docs/admin-operations.md`

- `public/data/game-x/` *(generated)*  
  Output from the exporter (JSON files the site fetches).

- `docs/`  
  High-level documentation (architecture, data pipeline, builder flow, security).

---

## Core design decisions

### 1) In-memory character authority

The target architecture reconstructs persisted Firebase state plus unsaved choices in a `CharacterSession`, compiles it into a dependency graph, and reconciles proposed changes before mutation or persistence. Pure shared Rules own capacity and prerequisites; pages and widgets are editors, not dependency truth.

### 2) Builder steps are data-driven
Builder pages are meant to be independent.
Navigation (step list, Prev/Next) is derived from `public/js/builder/builder-flow.js`, not hardcoded per page.

### 3) Data is sourced from one canonical Sheet

Structured rules are edited in Google Sheets. Repository tooling exports the fixed private Sheet as XLSX using authenticated read-only Drive access, then adapts and validates it before staging JSON. The live website depends only on reviewed static artifacts, never on Google Sheets availability.

See `AGENTS.md` for the repository operating contract, `docs/architecture.md` for current/target component ownership, and `docs/roadmap.md` for stable implementation step IDs.

---

## Data release workflow

The canonical Google Sheet is converted to versioned JSON under `public/data/game-x`. Production export is currently frozen while Work Package B repairs the schema-v4 mapping and validation contract; `npm run export:data` intentionally refuses to overwrite those files.

Use `npm run data:source:check` to verify read-only Drive access, `npm run fetch:data` to acquire an ignored source snapshot with provenance, and `npm run stage:data` to exercise the staging boundary. Use `npm run baseline:data` to verify the frozen release. See `docs/data-pipeline.md` for authentication and release workflow.

---

## Security model (short version)

This is a client-rendered app, so **the real security boundary is Firebase Security Rules**.
Client-side validation exists to keep data tidy and reduce accidental risk, but it must be treated as advisory.

- Firestore rules restrict reads/writes to character owners and GMs.
- Storage rules restrict portrait uploads by type/size and ownership/GM.
- Firebase Hosting sets a small set of security headers (CSP is report-only by default).

See `docs/security.md` for details.

Privileged Firebase credentials must remain outside the repository, including ignored directories. See `docs/admin-operations.md` before running an administration command.

---

## Adding a new builder step (high level)

1. Add a new HTML page under `public/builder/` and its JS module under `public/js/builder/`
2. Add the step to `BUILDER_STEPS` in `public/js/builder/builder-flow.js` using the `/builder/...` page path
3. Use `builder-common.js` utilities to:
   - bootstrap auth
   - load the character doc
   - save patches
4. Render navigation via `builder-nav.js`

See `docs/builder-flow.md` for specifics.
