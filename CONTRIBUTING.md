# Contributing / developer workflow

Read `AGENTS.md`, `docs/status.md`, and the named step in `docs/roadmap.md` before changing implementation. The roadmap has stable step IDs so work can be handed between agents without relying on chat history.

## Common verification

```powershell
npm install
npm test
npm run baseline:data
```

Use `npm run test:all` for persistence/rules/release work or changes that cross subsystem boundaries.

## Game-data work

Do not manually export the canonical Sheet and do not hand-edit generated JSON.

After one-time read-only Drive authentication is configured:

```powershell
npm run data:source:check
npm run fetch:data
npm run stage:data
```

The source XLSX and staging output are ignored. Production JSON under `public/data/game-x` is frozen until `WPB-PUBLISH`; `npm run export:data` intentionally refuses that target. See `docs/data-pipeline.md` and `docs/game-data-contract.md`.

## Firebase deployment

Deployment remains blocked until the deferred manual browser scenarios in `docs/status.md` pass.

When that boundary is cleared:

```powershell
npm run deploy:remote
```

Use the narrower `deploy:hosting` or `deploy:rules` commands only when their scope is intentional.

## Code and architecture expectations

- Prefer small pure modules over large page or CLI files.
- Put shared business rules in core modules; keep pages focused on orchestration and DOM.
- Pages and widgets do not own capacity, prerequisite, or dependency-removal policy.
- Keep source-specific workbook aliases in adapters, not runtime/graph code.
- Add or update tests and living contracts in the same change.
- Never rely on client-only authorization checks; Firebase Security Rules are the boundary.
- Keep all credentials outside the repository, including ignored directories.
