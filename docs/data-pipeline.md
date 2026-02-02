# Data pipeline (Google Sheets / XLSX ➜ JSON)

Game rules content (classes, features, feats, techniques) is edited in **Google Sheets**, exported as `.xlsx`, and then converted into JSON files that the web app can fetch at runtime.

## Why this exists
- Editing rules content in a spreadsheet is faster than editing JSON by hand.
- The UI can be data-driven without forcing a database migration.
- Generated JSON can be versioned alongside code.

## Source workbook
You maintain a single spreadsheet workbook with multiple tabs. The exact columns can evolve, but the intent is:

- **Classes**: per-class metadata (display name, description, etc.)
- **Class Features**: features gained by level, including option groups and “choose N” blocks
- **Feats**: class feats (and future global/origin feats), with prerequisites
- **Techniques**: structured technique definitions (actions, costs, roll info, success text, scaling)

Notes:
- Technique names are expected to be globally unique.
- If duplicates appear, the exporter should fail loudly.

## Export script

Location:
- `scripts/export-game-data.mjs`

Inputs:
- XLSX file path (exported from Google Sheets)

Outputs:
- `public/data/game-x/…` (JSON files)

Typical usage:
```bash
npm run export:data
```

A recommended approach:
- keep the exported XLSX in a `data/` folder that is gitignored
- commit the generated JSON under `public/data/game-x/`

## Output files (typical)

- `public/data/game-x/game-x-data.json` – combined payload (convenience)
- `public/data/game-x/classes.json`
- `public/data/game-x/class-features.json`
- `public/data/game-x/feats.json`
- `public/data/game-x/techniques.json`
- `public/data/game-x/export-report.json` – warnings and counts

The UI may choose either:
- one combined fetch (`game-x-data.json`)
- or multiple smaller fetches

## Keeping duplication low
Suggested workflow:
1. Edit narrative rules in the handbook (Docs)
2. Keep structured, UI-facing content in Sheets
3. For parts of the handbook that are essentially tables, embed linked tables from Sheets (so the handbook can “pull” from the sheet)

That reduces “write it twice” pain while still keeping the UI reliable.
