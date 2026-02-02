# Architecture

This app is a small, static, Firebase-hosted web application.

## High-level diagram

Browser
- Loads static pages and ES modules from Firebase Hosting (`public/`)
- Uses Firebase Auth to identify the user
- Reads/writes character docs in Firestore
- Uploads portrait images to Cloud Storage
- Fetches generated rules JSON (classes/feats/techniques) from Hosting

Firebase
- Hosting: serves static content + generated JSON
- Auth: user identity + optional GM custom claim
- Firestore: character documents
- Storage: portrait images

## “No build step” frontend

This project intentionally avoids a bundler to keep iteration fast:
- Scripts are ES modules (`type="module"`)
- Firebase SDK is loaded via the official CDN module endpoints

### Implications
Pros
- Very easy to run and deploy
- Minimal tooling / fewer moving pieces
- Each HTML page can stay relatively self-contained

Tradeoffs
- More network requests (modules loaded individually)
- Must be mindful about CSP (module imports, inline styles)
- Refactoring shared UI often means creating shared modules manually (which we do)

## Data model overview (Firestore)

Primary (current) path:
- `users/{uid}/characters/{charId}`

Fields are intentionally flexible, but the design centers around:
- `ownerUid` (string)
- `name` (string)
- `builder` (object; per-step state, visited steps)
- `sheet` (object; character sheet fields)
- `portraitUrl` + `portraitPath` (strings; Storage download URL + storage location)
- `createdAt` / `updatedAt` (timestamps)

Legacy support exists for:
- `characters/{uid}` (older structure)

## Roles: GM vs player

The GM role is represented as a custom auth claim (`request.auth.token.gm == true`).
Rules allow:
- players to manage only their own data
- GMs to view/edit other users’ characters (through a controlled path)

## Canonical schema

`public/character-schema.js` is the intended single source of truth for shared definitions:
- attributes and what they do
- limits / caps / point budgets
- shared labels and formatting rules

Builder pages and the character sheet should reference this schema rather than duplicating logic.

## Generated game data

Classes/feats/techniques are treated as **data**, not hardcoded UI.
The source of truth is a Google Sheet (exported to XLSX), converted by a script into:
- `public/data/game-x/*.json`

This keeps the UI and the rules content loosely coupled.

See `docs/data-pipeline.md`.
