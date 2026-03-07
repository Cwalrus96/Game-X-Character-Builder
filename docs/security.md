# Security (practical, low-effort)

This project is a small personal app. The goal is to avoid glaring holes without adding a lot of process or heavy backend code.

## Trust boundaries
- Anything in the browser can be tampered with.
- The true enforcement layer is Firebase Security Rules:
  - Firestore rules for character documents
  - Storage rules for portrait uploads

Client-side validation exists primarily to:
- keep data tidy
- reduce accidental risk (e.g., storing HTML)
- improve user feedback (e.g., “unsupported image type”)

## Firestore rules
Rules aim to ensure:
- players can read/write only their own characters
- GMs can read/write characters for other users
- unknown collections are denied by default

Important: Firestore rules and queries must align. If you restrict reads by owner, queries should filter by owner. Otherwise reads can fail even for legitimate users.

## Storage rules (portraits)
Portrait images are restricted by:
- path ownership (userId in path must match auth.uid unless GM)
- file size limit
- content type whitelist (PNG/JPG/WEBP/GIF)
- deletes allowed separately (because deletes have no request.resource)

This blocks most “bad upload” classes while staying simple.

## Hosting security headers
Firebase Hosting can apply security headers site-wide from `firebase.json`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy`
- `Permissions-Policy`
- HSTS
- CSP in **Report-Only** mode

Why Report-Only?
- It gives visibility into what would break without risking the app
- When you decide to enforce CSP, you can tighten it gradually

## Canonical sanitize-before-store
The current codebase splits sanitization and schema responsibilities across a few modules:
- `public/data-sanitization.js` – basic field-level helpers such as `sanitizeText`, `sanitizeCharName`, and `sanitizeStoragePath`
- `public/database-writer.js` – sanitized builder patch creation for Firestore writes
- `public/database-reader.js` – normalization into the canonical character-doc shape on read
- `public/character-rules.js` – Game X rule math and limits used by builder + sheet

Builder and sheet code should sanitize on write rather than sprinkling one-off checks in each field handler.
In particular, builder pages should write via `saveCharacterPatch(...)` in `public/builder-common.js`, which delegates to the write-layer helpers before sending the update to Firestore.

## If you later want “one step stronger”
- Enable CSP enforcement (remove “Report-Only”), then fix violations it reports.
- Consider moving some validation into Security Rules (basic type/range checks).
- Add a very small CI check to ensure the exporter runs cleanly (no duplicate technique names).
