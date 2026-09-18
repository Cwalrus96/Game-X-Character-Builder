# Game-data pipeline: Google Sheet to reviewed JSON

Status: living operational design. Read-only acquisition, schema-v4 read/validate/stage/diff, authenticated live acceptance, exact reviewed publishing, and rollback are implemented.

Last updated: 2026-09-18.

## Goals

- No routine browser export or manual XLSX download.
- No credentials or source snapshots committed to Git.
- One fixed canonical Drive file, authenticated with least privilege.
- Source acquisition, adaptation, normalization, validation, artifact construction, staging, diff, and publishing remain separate.
- Production JSON changes only by promoting a complete reviewed staging run.

## Canonical source

The source is [game-x-class-data](https://docs.google.com/spreadsheets/d/1TEdxuufglP8lFRNk8QD4N_351-0ihAUFLG2743ESjoI/edit). Its non-secret locator and expected MIME/schema values live in `contracts/game-data-source.json`.

`npm run fetch:data` uses Google Drive `files.get` and `files.export` to acquire the entire native Sheet as XLSX. XLSX remains the transport boundary so spreadsheet formulas/tab structure are captured consistently with the old manual workflow.

The Drive API limits native-file exports to 10 MB. The acquisition module enforces the same limit, opens the XLSX structurally, verifies every tab named in `contracts/game-data-source.json`, and checks the workbook's `Metadata` schema/syntax versions and canonical workbook ID before writing anything.

## Handbook display and linked-table formatting

The handbook's technique table follows a separate display path: the canonical Sheet feeds [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit), whose `Techniques_Formatted!A1:A85` is linked into the [Player Handbook's Tags, Traits, Techniques tab](https://docs.google.com/document/d/1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss/edit?tab=t.yz4ctfxm1pnu). This does not publish runtime JSON.

Maintain linked-cell typography in the display Sheet's rich-text formatting: bold technique title, italic Access line, and explicitly nonbold body text. Apply future typography changes there and refresh the linked table; do not maintain a second set of title/body styles directly in Docs.

If a refresh produces incorrect formatting despite correct source rich-text runs, use the linked-table menu's **Match spreadsheet data and formatting** action to clear Docs formatting overrides for the whole linked table. Then use ordinary **Update Table** for source changes. This action matches source typography and table formatting, so review the resulting layout as well as the text. It is a repair action, not a documented persistent setting.

On 2026-09-18, four techniques had entirely bold, 14-point text in Docs while every source cell had explicit nonbold body runs. Matching the table to the spreadsheet repaired all four without individual Docs cell edits. Three subsequent ordinary refreshes, including temporary paragraph-break changes, preserved mixed formatting. Final verification covered all 85 entries, with bold titles and no bold body runs; temporary source changes were restored exactly. When changing this workflow, verify both the source rich-text runs and the rendered handbook after a changed-cell refresh, including a change in paragraph count.

## Authentication

The command uses Google Application Default Credentials (ADC). It never uses browser/Firebase login state or Codex connector credentials.

### Preferred: short-lived service-account impersonation

Use a dedicated service account, conventionally `game-x-sheet-exporter`, with these boundaries:

- share only the canonical Sheet with the service-account email as Viewer;
- no domain-wide delegation;
- no project-wide content/data role;
- grant each authorized developer `roles/iam.serviceAccountTokenCreator` on that service account only;
- enable the IAM Service Account Credentials API and Google Drive API in the owning project.

Create normal user ADC once:

```powershell
gcloud auth application-default login
```

Then select the read-only target identity for the current shell:

```powershell
$env:GAME_X_DATA_IMPERSONATE_SERVICE_ACCOUNT = "game-x-sheet-exporter@YOUR_PROJECT.iam.gserviceaccount.com"
npm run data:source:check
```

The source identity receives the Cloud scope needed to call IAM Credentials. The impersonated short-lived token receives only `https://www.googleapis.com/auth/drive.readonly`.

### Fallback: external service-account key

If impersonation cannot be configured, store a dedicated service-account key outside the repository, share the Sheet with its service-account email as Viewer, and set:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\your-name\.config\game-x\credentials\sheet-reader.json"
npm run data:source:check
```

The script rejects credential paths inside the repository, including external-looking symlinks/junctions that resolve into it. Do not put the key in `.env`, an ignored repository directory, source code, scripts, documentation, screenshots, or chat.

### Fallback: user OAuth ADC

Direct user ADC must be created with a custom OAuth client and explicit Drive read-only scope; ordinary Cloud-only ADC cannot read Drive. Follow Google's ADC guidance for non-Cloud scopes and use `gcloud auth application-default login --client-id-file ... --scopes ...`. Store the OAuth client file outside the repository.

References:

- [Drive files.export](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)
- [Drive export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Local Application Default Credentials](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
- [Service-account impersonation](https://cloud.google.com/docs/authentication/use-service-account-impersonation)
- [Service-account security](https://cloud.google.com/iam/docs/best-practices-service-accounts)

## Current commands

### Check access without writing

```powershell
npm run data:source:check
```

This requests and validates only Drive metadata. It confirms the fixed file ID, expected name/MIME type, download permission, Drive version, and modification time.

### Fetch a source snapshot

```powershell
npm run fetch:data
```

This performs:

1. metadata read;
2. XLSX export into memory;
3. second metadata read;
4. rejection if Drive `version` or `modifiedTime` changed during export;
5. XLSX size, structure, required-tab, and `Metadata` contract validation;
6. SHA-256 calculation;
7. rollback-protected paired replacement of the ignored snapshot and provenance sidecar.

Default outputs:

```text
.staging/game-data/source/game-x-class-data.xlsx
.staging/game-data/source/source-provenance.json
```

The sidecar contains file ID/name, source/export MIME types, source schema and syntax versions, Drive version, modification time, fetch time, byte length, web link, and exact XLSX SHA-256. It never contains tokens, auth headers, credential paths, or account claims.

For an explicit ignored/recovery path:

```powershell
npm run fetch:data -- --out C:\temporary\game-x.xlsx --provenance C:\temporary\game-x-source.json
```

Explicit targets are accepted only beneath this repository's real, non-redirected `.staging` directory or completely outside the repository. Symlinks/junctions that redirect either location back into repository content are rejected. The workbook and provenance targets must also be distinct, non-nested file paths. This prevents the acquisition command itself from overwriting source code, contracts, or frozen production JSON.

### Fetch, validate, and stage

```powershell
npm run stage:data
```

This fetches the canonical Sheet, reads and validates schema v4, constructs deterministic runtime artifacts in memory, verifies them through current runtime loader APIs, and installs a complete unique run under:

```text
.staging/game-data/runs/<timestamp>-<process-id>/
  source-provenance.json
  validation-report.json
  artifacts/
  export-report.json
  artifact-diff.json
  artifact-diff.md
```

Unique run directories prevent a failed attempt from being confused with stale artifacts from an earlier attempt.

The reader, adapters, validator, schema-v2 artifact builder, runtime-load acceptance, atomic staging writer, and structural/semantic diff are fixture-verified. Authenticated acceptance still awaits `WPB-SOURCE-ACCESS`; until that succeeds, a fixture run is implementation evidence rather than a releasable current-source candidate. Do not weaken validation, skip rows, or add coercions just to make a live command green.

### Verify frozen production

```powershell
npm run baseline:data
```

This verifies exact filenames, byte lengths, SHA-256 hashes, release metadata, and structural counts for the nine reviewed production artifacts.

`npm run export:data` still targets `public/data/game-x` and intentionally fails before reading/writing. It remains a negative safety boundary: production can be changed only by the separately approved exact-byte publisher.

## Staging run

One command creates an immutable ignored run:

```text
.staging/game-data/runs/<run-id>/
  source-provenance.json
  validation-report.json
  artifacts/
  export-report.json
  artifact-diff.json
  artifact-diff.md
```

Implemented phase boundaries:

```text
Drive acquisition
  -> workbook reader
  -> source-version adapters
  -> shared expression/scalar normalization
  -> schema/cross-reference/domain validation
  -> deterministic in-memory artifacts
  -> staged write
  -> byte and semantic diff
```

`scripts/game-data/workbook-reader.mjs` owns only XLSX decoding, raw headers/values, and physical row numbers. `scripts/game-data/source-adapters.mjs` owns schema-v4 tab/header meaning and returns `{ ok, model, diagnostics }` without file I/O. `scripts/game-data/model-validator.mjs` merges adapter findings with duplicate, ownership, reference, choice, status, readiness, and domain findings in deterministic workbook order. Populated invalid rows remain represented when possible; any meaning that cannot be adapted or validated produces a source-located diagnostic. None of these phases writes artifacts. `artifact-builder.mjs` accepts only that validated model, and `staging-run.mjs` owns the later file-I/O boundary.

No runtime artifact is written if validation or runtime-load acceptance has errors. A validation report and provenance may still be staged. The reports record source schema, runtime artifact schema, exporter version, Drive version/time, fetch/export timestamps, raw XLSX/model/artifact hashes, counts, warnings/errors, runtime acceptance, and diff summary. The raw XLSX hash identifies the fetched transport bytes but is not runtime revision identity because Google may produce byte-distinct XLSX ZIPs for the same native Sheet revision. Runtime artifact bytes use the stable Drive revision plus normalized-model hash and omit raw transport hashes and volatile timestamps, so the same validated source revision produces identical hashes in different runs.

The semantic diff uses stable identities and reports added, removed, changed entities and every changed field path. Byte hashes alone are not sufficient. Because the frozen release predates `techniqueKey`, the diff explicitly bridges an old technique name to the matching new stable key; this is compatibility analysis, not permission to restore display-name identity. Weapon profiles use the explicit `weaponKey/profileType/profileName/rank` composite until a `profileKey` decision is made.

## Publishing boundary

Publishing is a separate exact-byte operation. The checked-in `contracts/game-data-release.json` records the approved run, source/model hashes, every artifact hash and byte length, and both approval gates. Run:

```powershell
npm run publish:data -- --confirm <approved-run-id>
```

The publisher does not authenticate, fetch, adapt, regenerate, or infer approval. It fails unless all of the following match exactly:

- zero structural validation errors;
- runtime-load acceptance of staged artifacts;
- approved source/model/artifact hashes;
- completed semantic diff review;
- explicit diff-review and publish approval booleans plus the matching CLI confirmation;
- updated release baseline and rollback record.

It also verifies that the currently installed production bytes still match their existing baseline, reruns runtime acceptance against the candidate, installs only the nine approved artifact names, removes stale runtime files, and updates `contracts/game-data-release-baseline.json` in the same transaction. If either installation fails, it restores both the prior production directory and prior baseline. The generic exporter remains frozen so a fresh source run cannot bypass review.

Fetch, stage, and publish must never be aliases for the same side-effecting operation.

## Canonical-Sheet edit approval

Source resolution is not automatic cleanup. Read-only inspection, validation, or permission to proceed with a roadmap step does not authorize Sheet writes. Before any connector, API, script, or browser automation changes the canonical Sheet, present the exact tabs/ranges, proposed values or contract changes, and reasons, then obtain explicit user approval for that edit batch. Repository validator/exporter corrections and source editorial changes remain separately reviewable.

## Runtime artifacts

The website loads `public/data/game-x/game-x-data.json`; domain files remain checked in for review/tooling. The reviewed schema-v2 production release contains:

- `classes.json`
- `class-skills.json`
- `class-features.json`
- `feats.json`
- `techniques.json`
- `origins.json`
- `weapon-bases.json`
- `weapon-enhancements.json`
- `game-x-data.json`

`export-report.json` is run metadata beside staged `artifacts/`, not a runtime artifact, and was removed from production during the schema-v2 publish. The v2 bytes preserve `ClassSkills`, stable technique keys, status/selectability, structured costs and expressions, source revision identity, and explicit stubbed subsystems. Source rows are not dropped merely to preserve the old file list.

## Failure policy

- 401/403: stop with concise setup guidance; never print provider bodies/tokens.
- 429/5xx/network failure: bounded retry, then stop.
- wrong file/name/MIME, trashed source, or no download permission: stop.
- source version changes during export: discard bytes and retry in a new invocation.
- empty, oversized, structurally unreadable, wrong-version, or wrong-workbook response: stop without replacing the last valid snapshot.
- validation errors: stage diagnostics only; write no artifacts.
- generic production export: reject before reading or writing; only the exact reviewed publisher may install production bytes.

The local snapshot is a convenience, not a fallback authority. If Drive is unavailable, use an explicitly supplied known snapshot only for offline parser development and label its provenance; never treat it as a releasable current source.
