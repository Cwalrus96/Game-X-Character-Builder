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
 
Fields are intentionally flexible, but the current schema centers around:
- `schemaVersion` (number)
- `builder` (object; per-step state)
  - `name` (string)
  - `portraitPath` (string; Cloud Storage path)
  - `level` (number)
  - `classKey` (string; canonical kebab-case id)
  - `primaryAttribute` (string)
  - `attributes` (object)
  - `originKey` / `originKeystone` (origin step state)
  - `selectedClassFeatureOptions` / `selectedClassUtilitySkills` / `selectedFeats` / `autoAbilityNames` (arrays)
  - `grantedCoreSkillSnapshot` / `grantedSkillSnapshot` (skills-step bookkeeping for granted class skills)
  - `bonds` (builder-owned structured bond records: name, rank, keystone)
- `backgroundKeystones` (builder-owned background keystone strings)
  - `visitedSteps` / `lastVisitedAt` (builder flow state)
  - `sheet.fields` / `sheet.repeatables` (temporary character-sheet state only; permanent character data should come from builder-owned fields)
- `createdAt` / `updatedAt` (timestamps; server-side)

Note: we store only `portraitPath` in Firestore. Download URLs are resolved at runtime via the Storage SDK.

## Roles: GM vs player

The GM role is represented as a custom auth claim (`request.auth.token.gm == true`).
Rules allow:
- players to manage only their own data
- GMs to view/edit other users’ characters (through a controlled path)

## Canonical character model and rules

The current codebase splits these responsibilities across focused modules:
- `public/database-reader.js` – canonical character document defaults + normalization on read
- `public/database-writer.js` – sanitized patch builders for writes
- `public/character-rules.js` – attributes, limits / caps / point budgets, and derived calculations
- `public/data-sanitization.js` – low-level sanitizers shared by read/write modules

Builder pages and the character sheet should reference these modules rather than duplicating logic.

## Generated game data

Classes/feats/techniques are treated as **data**, not hardcoded UI.
The source of truth is a Google Sheet (exported to XLSX), converted by a script into:
- `public/data/game-x/*.json` (including `origins.json`)

This keeps the UI and the rules content loosely coupled.

See `docs/data-pipeline.md`.


Keystone handling is source-owned in storage (origin, background, bond), but UI rendering should derive from a unified normalized keystone view rather than duplicating display logic in each page. Bonds stay separate from that generic keystone view because a bond record contains more than its keystone text.
