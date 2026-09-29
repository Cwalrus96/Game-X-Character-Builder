# All pending website changes released · September 29, 2026

The user's explicit **“Deploy all changes”** instruction authorizes this production Hosting release, including the previously separate pending instruction-consistency changes. Reviewed code and documentation were committed as `114d626`, after the font feature `88c96de` and player-reported fixes `b3c1299`. All three commits were pushed to `origin/codex/work-package-b-data-contract` before deployment.

The live website now includes the bundled Nunito, Patrick Hand and Pacifico heading choices, the whole-sheet OpenDyslexic option, editable optional enhancements on granted weapons, the implicit weapon-grant picker and specific missing-answer messages, and heading-only background colors. The older pending consistency work supplies exact prerequisite identities with readable labels and hides unavailable Class/Origin acquisition options while retaining saved selections for inspection.

## Release verification

- Fresh full workspace suite: **671 unit tests**, **22 Firestore/Storage emulator tests**, **15 HTML asset checks**, all passing.
- Published-catalogue integration: **3 tests**, all passing. The ten reviewed game-data artifacts are unchanged.
- Immutable committed-file export: **671 unit tests**, **14 tracked HTML asset checks**, unchanged ten-artifact baseline. It contains **185 Hosting files**; local review fixtures, backups and ignored administration scripts are excluded. Git content comparison permits only normal checkout line-ending differences for text files.
- The complete candidate's authenticated local Class page retains Kazuma's Pistol, Explosive Transformation and Chroma Ranger Initiate and saves successfully. Earlier focused browser acceptance covers persisted optional enhancements, font settings and heading-only colors.
- Firebase Hosting deployment from `.staging/all-changes-release-20260929` succeeded for project `game-x-character-builder` using `--only hosting`.
- Every one of the **185 live files** matches the tested package **byte for byte**. JavaScript responses retain `Cache-Control: no-cache`.
- The live Character Sheet entry correctly redirects a signed-out browser to sign-in, with no browser warnings or errors. Authenticated production character interaction was not performed during release verification. A production screenshot is saved in the task's `outputs/all-changes-live-release.png`.

Live site: **https://game-x-character-builder.web.app**.

Evidence: `.staging/all-changes-release-test-all.log`, `.staging/all-changes-release-isolated-test.log`, `.staging/all-changes-release-hosting.log`, and `.staging/all-changes-release-verification.json`. The prior customization release and this immutable export remain available for rollback. No new spreadsheet fetch/publication, Security Rules/Functions deployment, or production database write was performed. Kazuma's separately authorized Pistol repair was completed and verified before this release.

The working tree is clean after recording this release. Broader `WPE-DOMAIN-MIGRATION` acceptance and subsequent `WPF-UI-SYSTEM` controls/accessibility/navigation work remain separate. This instruction completes the current production release; it is not continuing authorization for future releases.
