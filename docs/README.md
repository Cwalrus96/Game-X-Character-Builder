# Game X Character Builder

A lightweight, Firebase-hosted web app for creating and managing **Game X** characters.

The app is intentionally “no build step”:
- Static HTML/CSS/JS served from Firebase Hosting (`public/`)
- ES modules loaded directly in the browser
- Firebase Auth + Firestore + Cloud Storage as the backend
- A small Node script converts the **authoritative Google Sheet (exported as XLSX)** into JSON consumed by the site

This repo is designed to be easy to extend as new builder pages and data-driven systems (classes/feats/techniques) come online.

---

## Quickstart

### Prereqs
- **Firebase CLI** installed and logged in
- Optional for data export: **Node.js** + npm

### Run locally
From the repo root:

1. Serve Hosting locally (simple)
   - Use whatever command you already use for your Firebase workflow (for many projects this is `firebase emulators:start` or `firebase serve`).

2. Open the local URL that Firebase prints.

> Tip: this project uses client-side module imports; a “plain file://” open won’t work reliably. Use the Firebase local server.

### Deploy
From the repo root:
- `firebase deploy`

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

- `public/data/game-x/` *(generated)*  
  Output from the exporter (JSON files the site fetches).

- `docs/`  
  High-level documentation (architecture, data pipeline, builder flow, security).

---

## Core design decisions

### 1) Canonical character model + rules
The current code splits this responsibility across a few small modules:
- `public/js/core/database-reader.js` – default document shape + normalization when reading
- `public/js/core/database-writer.js` – sanitized write helpers for builder patches
- `public/js/core/character-rules.js` – Game X rule math, labels, caps, and derived calculations
- `public/js/core/data-sanitization.js` – low-level string/path/array sanitizers

Builder pages and the sheet should import these modules rather than duplicating logic locally.

### 2) Builder steps are data-driven
Builder pages are meant to be independent.
Navigation (step list, Prev/Next) is derived from `public/js/builder/builder-flow.js`, not hardcoded per page.

### 3) Data is sourced from a Sheet (XLSX export)
Classes/feats/techniques are edited in Google Sheets, exported to XLSX, then converted to JSON for the site.
This keeps content editing approachable while still letting the UI be data-driven.

---

## Data export workflow (XLSX ➜ JSON)

1. Edit your Google Sheet
2. Export it as `.xlsx`
3. Save it locally (commonly into `data/` which is gitignored)
4. Run the exporter (example)

```bash
npm run export:data
```

See `docs/data-pipeline.md` for details.

---

## Security model (short version)

This is a client-rendered app, so **the real security boundary is Firebase Security Rules**.
Client-side validation exists to keep data tidy and reduce accidental risk, but it must be treated as advisory.

- Firestore rules restrict reads/writes to character owners and GMs.
- Storage rules restrict portrait uploads by type/size and ownership/GM.
- Firebase Hosting sets a small set of security headers (CSP is report-only by default).

See `docs/security.md` for details.

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
