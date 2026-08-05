# Game-data pipeline: Google Sheet to reviewed JSON

Status: living operational design. Automated read-only acquisition is implemented; schema-v4 validation/export/diff remains Work Package B work.

Last updated: 2026-08-04.

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

### Fetch and invoke a staging export

```powershell
npm run stage:data
```

This fetches the canonical Sheet, creates a unique run, copies the source provenance into it, and invokes the current exporter with output under:

```text
.staging/game-data/runs/<timestamp>-<process-id>/
  source-provenance.json
  artifacts/
```

Unique run directories prevent a failed attempt from being confused with stale artifacts from an earlier attempt.

At the current `WPB-EXPRESSIONS` boundary, the command is expected to stop when the legacy exporter encounters schema-v4 constructs it cannot faithfully represent. Do not weaken validation, skip rows, or add coercions just to make this command green. `WPB-EXPRESSIONS`, `WPB-ADAPTERS`, and `WPB-REFERENCES` repair those contracts first.

### Verify frozen production

```powershell
npm run baseline:data
```

This verifies exact filenames, byte lengths, SHA-256 hashes, release metadata, and structural counts for the nine reviewed production artifacts.

`npm run export:data` still targets `public/data/game-x` and intentionally fails before reading/writing while the production freeze is active. It is retained as a negative safety boundary until `WPB-PUBLISH` replaces it with explicit promotion.

## Target staging run

After `WPB-STAGING`, one command will create an immutable ignored run:

```text
.staging/game-data/runs/<run-id>/
  source-provenance.json
  validation-report.json
  artifacts/
  export-report.json
  artifact-diff.json
  artifact-diff.md
```

Target phase boundaries:

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

No runtime artifact is written if validation has errors. A validation report may still be staged. The report records source schema, runtime artifact schema, exporter version, Drive version/time, source/model/artifact hashes, counts, warnings/errors, and diff summary.

The semantic diff uses stable identities and reports added, removed, changed entities and changed field paths. Byte hashes alone are not sufficient. Weapon profiles require an explicit stable composite identity until a `profileKey` decision is made.

## Publishing boundary

Publishing is deliberately not implemented yet. `WPB-PUBLISH` will add a separate command that promotes the exact reviewed staged bytes without re-downloading or regenerating them. It must require:

- zero structural validation errors;
- runtime-load acceptance of staged artifacts;
- approved source/model/artifact hashes;
- completed semantic diff review;
- intentional production-freeze change;
- updated release baseline and rollback record.

Fetch, stage, and publish must never be aliases for the same side-effecting operation.

## Runtime artifacts

The website currently loads `public/data/game-x/game-x-data.json`; domain files remain checked in for review/tooling. The frozen release contains:

- `classes.json`
- `class-features.json`
- `feats.json`
- `techniques.json`
- `origins.json`
- `weapon-bases.json`
- `weapon-enhancements.json`
- `game-x-data.json`
- `export-report.json`

The normalized source has additional concepts such as `ClassSkills`, stable technique keys, status/selectability, structured costs, resources, and stubbed subsystems. Artifact topology/version changes are decided and diffed during Work Package B; source rows must not be dropped merely to preserve the old file list.

## Failure policy

- 401/403: stop with concise setup guidance; never print provider bodies/tokens.
- 429/5xx/network failure: bounded retry, then stop.
- wrong file/name/MIME, trashed source, or no download permission: stop.
- source version changes during export: discard bytes and retry in a new invocation.
- empty, oversized, structurally unreadable, wrong-version, or wrong-workbook response: stop without replacing the last valid snapshot.
- validation errors: stage diagnostics only; write no artifacts.
- production path while frozen: reject before reading or writing.

The local snapshot is a convenience, not a fallback authority. If Drive is unavailable, use an explicitly supplied known snapshot only for offline parser development and label its provenance; never treat it as a releasable current source.
