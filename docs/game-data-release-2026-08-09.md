# Game-data schema-v2 release — 2026-08-09

Status: published from the exact reviewed candidate and deployed to Firebase Hosting.

## Approved identity

- Candidate run: `20260809T022801911Z-51956`
- Canonical Drive version: `647`
- Drive modified time: `2026-08-09T02:27:03.310Z`
- Raw XLSX SHA-256: `2db974d02773d340957a2f34c1c3de47f365064d5307658bba9572392ccd5916`
- Normalized model SHA-256: `c03ed329b10e27310baef32d73fe239c9146e415c332ae62f7842d81e9a17739`
- Runtime artifact schema: `2`
- Approval contract: `contracts/game-data-release.json`
- Exact artifact hashes: [game-data-release-candidate-2026-08-08.md](game-data-release-candidate-2026-08-08.md)

The user approved the complete exact-hash diff and separately authorized `WPB-PUBLISH`. No canonical-Sheet edit, Firebase Rules deployment, Functions deployment, or Firebase document migration was included.

## Promotion result

`npm run publish:data -- --confirm 20260809T022801911Z-51956` verified the immutable run, approval contract, source/model hashes, nine artifact byte lengths and hashes, zero-error validation, runtime acceptance, and the prior production baseline before installing anything. It then installed the exact reviewed bytes and transactionally refreshed `contracts/game-data-release-baseline.json`.

The release added `class-skills.json` and removed the stale production `export-report.json`; staging reports remain outside the runtime artifact directory. The generic `npm run export:data` path remains frozen.

The published data exposed two compatibility assumptions in the current class builder: class feats were filtered only by legacy `classKey`, and display capitalization affected derived grant-choice identity. The publish change accepts both legacy `classKey` and schema-v2 class-feat `category`, derives choice identity case-insensitively while retaining compatibility aliases, and keeps canonical display capitalization in UI text.

## Verification

- `npm run baseline:data`: all nine schema-v2 production artifacts matched the refreshed exact baseline.
- Fresh runtime acceptance: split/combined equality and current runtime getters passed for all nine artifacts.
- `npm run test:all`: 174 unit tests, 16 Firebase emulator Rules tests, and all 14 HTML entry points passed.
- Local browser smoke: the authenticated class builder loaded Magical Guardian, class feats, Dazzling Wand, the Spellcasting technique choice, and stable-key technique options without console errors.
- `npm run deploy:hosting`: released 100 public files to `https://game-x-character-builder.web.app`; no Rules or Functions were deployed.
- Deployed verification: all nine runtime URLs returned HTTP 200 with the exact approved byte lengths and SHA-256 hashes; the deployed sign-in page loaded with no browser console errors.
- Publisher failure injection: a mid-install failure restored both the prior production directory and prior release baseline.

## Rollback

The repository commit containing this release is the rollback unit. To roll back after deployment:

1. Revert that release commit with a new revert commit; do not rewrite shared history.
2. Run `npm run baseline:data` to prove the restored schema-v1 artifact set and baseline agree.
3. Run `npm run test:all`.
4. Deploy Hosting only with `npm run deploy:hosting`; do not deploy Rules or Functions.
5. Verify `/data/game-x/game-x-data.json` and the restored artifact hashes against the reverted baseline.

If the publisher fails before a commit, no manual rollback is needed: its transaction restores the previous runtime directory and baseline automatically. Do not regenerate or hand-edit JSON to repair a release.
