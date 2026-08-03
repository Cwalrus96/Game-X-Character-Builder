# Game-data pipeline: Google Sheets → validated JSON

Game rules content is edited in one canonical Google Sheet and released as versioned JSON consumed by the static website.

## Canonical source

The canonical editable workbook is the native Google Sheet [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit).

Its domain tabs are:

- Classes
- ClassFeatures
- Techniques
- Feats
- Origins
- OriginFeatures
- WeaponBases
- WeaponProfiles
- WeaponEnhancements

The complete field mapping and validation rules are documented in [game-data-contract.md](./game-data-contract.md).

## Current release state

Production export is deliberately frozen during Work Package B. `npm run export:data` refuses to write into `public/data/game-x` until the repaired validator and artifact-diff gate are complete.

The checked-in release is baselined in `contracts/game-data-release-baseline.json`. Verify it with:

```powershell
npm run baseline:data
```

This command checks exact filenames, byte lengths, SHA-256 hashes, schema metadata, and structural counts. A failure means the production data changed without updating the reviewed baseline.

## Intended release flow

1. Record the exact Drive file ID and source revision/modified time.
2. Export or download the native Sheet to a staging input file.
3. Adapt live sheet columns into a canonical in-memory source model.
4. Normalize values with shared grant/prerequisite definitions.
5. Validate headers, stable IDs, enums, owner/parent relationships, and cross-references.
6. Write JSON only to a staging directory.
7. Produce an export report containing source provenance, schema/exporter versions, content hashes, warnings/errors, and a diff from the checked-in release.
8. Review the artifact diff.
9. Publish to `public/data/game-x` only after validation succeeds and the production lock is intentionally removed.

Source adaptation, normalization, validation, and artifact writing must remain separable. Validation must be runnable without writing release files.

## Runtime artifacts

The website currently loads the combined `public/data/game-x/game-x-data.json` file. Domain files are also emitted for review and tooling:

- `classes.json`
- `class-features.json`
- `feats.json`
- `techniques.json`
- `origins.json`
- `weapon-bases.json`
- `weapon-enhancements.json`
- `export-report.json`

Generated JSON is committed so releases are reviewable and Firebase Hosting can serve static data without a runtime spreadsheet dependency.

## Source ownership

The Sheet owns structured, UI-facing rules data. Handbook prose may remain authoritative for broader editorial text, but every runtime field must name its source column and adaptation rule. Content should not be copied between the handbook and Sheet without documenting which one owns future edits.
