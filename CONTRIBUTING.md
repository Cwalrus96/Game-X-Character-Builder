# Contributing / Developer workflow

This is a personal project; the goal is to keep process lightweight.

## Common tasks

### Export rules data (XLSX ➜ JSON)
1. Export your Google Sheet as `.xlsx`
2. Run:
```bash
npm run export:data
```
3. Commit the generated JSON under `public/data/game-x/`

### Firebase deploy
```bash
firebase deploy
```

## Code style (informal)
- Prefer small modules under `public/` rather than large inline scripts
- Keep “business logic” in shared modules (schema, security, flow)
- Keep pages focused on orchestration + DOM

## Security expectations
- Never rely on client-only checks for access control
- Any new collections or storage paths should be explicitly ruled in/out in Security Rules
