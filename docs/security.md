# Security boundaries

Status: living security overview. Operational credential instructions are in [admin-operations.md](admin-operations.md) and [data-pipeline.md](data-pipeline.md).

## Browser trust boundary

Anything delivered to or entered in the browser can be inspected or modified by a user. Client-side validation, hidden controls, graph reconciliation, and UI role checks improve correctness and feedback; they do not authorize access.

Firebase Security Rules are the enforcement boundary:

- Firestore rules govern character documents, private campaign membership and Super GM account access;
- Storage rules govern portrait reads/writes/deletes;
- unknown Firestore paths are denied by default.

Players normally access `users/{uid}/characters/{characterId}` for their own UID. The historical `gm` custom claim identifies a **Super GM** with global account and character access. A normal campaign GM is the campaign's current `gmUid`, assigned only by its immutable creator from current members. This role grants exact character-document reads through verified campaign links; it does not grant user-profile reads, character-collection listing or any character writes. Rules and queries must remain compatible: campaign listing requires `memberUids array-contains currentUid`; invite enumeration is denied. See [campaigns.md](campaigns.md).

Joining requires a current 128-bit random invite code, authenticated identity and an atomic membership proof. Invite links carry the code in a fragment, including through login. Rotation/disabling invalidates earlier codes. Character links and campaign roster references are paired atomically and owned by the character's owner. Active membership and the current GM are checked at read time, so leaving/removal, reassignment and detachment revoke future authorized reads. No client can promote itself via a profile, role label or copied roster entry. The creator remains a member; a departing GM must first be replaced.

The older `characters/{uid}` path remains a deliberate legacy boundary and must not be expanded casually; migration/retirement belongs in the character repository work.

## Storage boundary

Portraits are scoped by user/character path. Rules restrict:

- authenticated owner/Super GM reads and writes, plus current campaign GM reads of linked characters' portraits;
- accepted image content types;
- upload size;
- delete behavior separately from writes because deletes have no `request.resource`.

Store only the portrait path in Firestore. Owner/Super GM views retain the existing Storage download URL flow. Campaign GM views use authenticated `getBlob` and revoke their temporary object URL on page exit. Storage rules use exactly two Firestore documents (character link and campaign) for campaign authorization. Production rollout must verify the cross-service permission and bucket GET CORS for the app origin. Already downloaded bytes and existing bearer URLs cannot be recalled by revoking membership.

## Character write boundary

Current sanitization and persistence modules are under `public/js/core/`:

- `data-sanitization.js`: bounded field-level sanitizers;
- `database-reader.js`: normalized current character reads;
- `database-writer.js`: narrow sanitized patches;
- `sheet-state.js`: exact character-sheet-owned leaf paths;
- `save-coordinator.js` and `save-status.js`: serialized writes and visible failure/retry.

Builder pages should use the shared builder/database boundary rather than direct Firestore writes. The character sheet may write temporary play-state and validated presentation-preference leaves only; it cannot write builder-owned character identity, class, attributes, skills, abilities, techniques, equipment, or choices. Appearance uses exact six-digit hex colors, known font/style enums and booleans at `builder.sheet.appearance.*`; it never accepts arbitrary CSS, markup, fonts or remote assets. Owner/GM Firebase authorization remains unchanged.

The existing database reader/writer provide the definitive schema-6 persistence boundary, backed by CharacterCodec and sequential migrations. The September 22 coordinated release deploys these callers with compatible explicit-grant game data. Reads never migrate production documents in place; the first successful explicit save persists the accepted state. Do not add a parallel repository or spread Firebase document-shape knowledge into Rules, graph or widgets.

## Data-source and administration credentials

Credentials must never be stored inside the repository, including ignored directories or symlinks/junctions that resolve into it.

- Firebase administration and Sheet acquisition use ADC plus the shared policy in `scripts/credential-policy.mjs`.
- Google Sheet acquisition uses read-only Drive scope and the same credential-path policy.
- Prefer short-lived service-account impersonation. A persistent service-account key is a fallback stored outside the repository.
- Never log tokens, authorization headers, credential contents/paths, or complete custom-claim objects.
- Codex/Google Drive connector identity is not a credential source for repository scripts.

## Generated game data

The live website loads reviewed static JSON; it never reads the Google Sheet. Source acquisition is read-only. Validation and staging must not write production artifacts, and the active production freeze rejects output at/below `public/data/game-x`.

Generated JSON is not a repair surface. Fix source data or versioned adapter/validator behavior, then review the complete staged diff.

## Data-derived HTML

Treat Sheet, Handbook, Firebase, filenames, and user-entered values as untrusted display data. Prefer DOM construction and `textContent`; do not interpolate them into `innerHTML`. URL/path values require context-appropriate validation rather than HTML escaping alone.

## Hosting headers

`firebase.json` currently configures site-wide headers including:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- Referrer and Permissions policies;
- HSTS;
- Content Security Policy in Report-Only mode.

Do not describe Report-Only CSP as enforcement. Enforcing CSP requires removal of remaining inline-style/script patterns, testing every route, and an intentional reviewed header change.

## Required security verification

- Unit tests for sanitization, write ownership, credential paths, save isolation, and data-derived HTML.
- Firebase emulator tests for Firestore and Storage rules.
- Static asset/path checks.
- Real-browser tests for auth redirects, GM editing, dirty navigation, failures, multi-tab writes, and CSP/accessibility behavior.

Run `npm run test:all` for changes that touch these boundaries. The user explicitly made personal acceptance nonblocking and authorized the September 22 Hosting releases; later release scope and any remaining blockers belong in [status.md](status.md).
