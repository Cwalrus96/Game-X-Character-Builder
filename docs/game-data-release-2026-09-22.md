# September 22 coordinated release

The user requested "Can we push the latest version!" after review of candidate `20260922T184507461Z-43412` and its matching website package. This authorized exact data publication and Hosting-only deployment. Their subsequent "Deploy first, test later!" directed deployment before completing cleanup of tests coupled to old source content. Personal manual acceptance remains follow-up.

## Released package

- Runtime schema 3, source schema 5 / syntax 3; ten exact artifacts published with the reviewed publisher.
- Combined data SHA-256: `0cedfcc8359af9809360277017502b3cf5435cf733b4bcd143288879a1b6e396`.
- Source modified: `2026-09-22T00:57:44.536Z`; Drive version explicitly unknown. Metadata remained unchanged before publication.
- Hosting version: `827d0c70ef63bcda`, released `2026-09-22T22:14:12.448Z`.
- Previous Hosting version / rollback: `d5c9671adee0ab31`.
- All 128 reviewed application/data files match public HTTP readback and the authoritative Hosting manifest. Firebase CLI additionally creates its two standard `/__/firebase/init.js` and `/__/firebase/init.json` resources; the latter identifies the expected project.
- Serving configuration matches the prepared package, including JavaScript `Cache-Control: no-cache` and existing security headers.
- Live sign-in page renders normally with no console warnings/errors. Signed-in save/reload, cancellation, focus and stale-revision checks were performed against local emulator characters before release; no production-character test write is claimed.

The release includes first-class Traits, static eligibility, the new Metamorph Trait choices, Celestial Knight's narrow obsolete-answer conversion, and explicit old-Metamorph rebuild handling. Migrating a read does not write Firebase; only a successful explicit player save stores the reviewed schema-6 result. Unresolved references preserve the original. Existing rule conflicts still require review.

No Rules, Functions or production character documents were modified. The canonical Sheet was unchanged by this initial release. Metamorph Natural Weapon/Technique policy and generic Transformation Keystone automation remain separate Work Package E work.

## Verification and test isolation

Preflight passed 431 unit tests and the old nine-file baseline. After publication, nine tests failed because they read the current catalogue while expecting retired content. The immediate expectation repair passed 431 unit, 20 emulator and 14 asset checks. The user then required permanent isolation from source content.

Unit scenarios now use small explicitly authored fixtures. The three generic installed-catalogue checks move to `npm run test:data`, separate from `npm test`. The misleading option-readiness message has a fixture regression. Final verification passes 429 unit tests, 20 emulator tests, 14 asset checks and three release integration checks, plus the ten-file baseline and `git diff --check`.

Ignored evidence: `.staging/release-review/hosting-live-verification-sep22.json`, `hosting-deploy-sep22.log`, `release-test-all-sep22-final.log`, `unit-fixture-suite-sep22.log`, `release-test-all-fixtures-sep22.log`. Private character captures are not committed.

## Instinct follow-up

The user correctly observed that all four Instinct reactions already contain mechanics. Their blank Technique `status` cells disabled the granting Class options, and the widget incorrectly described every deferred option as lacking mechanics. The user explicitly approved setting `Techniques!AA152:AA155` to `playable` and publishing. Those four cells were updated and read back across 186 cells, preserving formatting, validation, descriptions and neighbors; native visual inspection passed.

Run `20260922T222417746Z-30652` stages that correction with zero errors and 246 warnings but is not published: the four reactions also have blank Energy cost and cost kind, retaining `record-unready` diagnostics. Setting `K152:K155 = 0` and `AB152:AB155 = fixed` has been proposed separately and awaits the user's answer. No zero-cost rule has been inferred.

The UI-message correction is deployed as Hosting `0b5a7124566ffee7`, released `2026-09-22T22:43:36.778Z`; rollback is `827d0c70ef63bcda`. An isolated package copies the initial release and changes only `js/builder/widgets/option-group-widget.js`. All 128 application/data files, Hosting hashes and public readback pass; ten data artifacts and serving configuration are unchanged. The concurrent "Add feat grant widgets" task's unfinished files are excluded. The live sign-in page loads without console warnings/errors. Evidence: `.staging/release-review/hosting-instinct-message-live-sep22.json` and `hosting-instinct-message-deploy-sep22.log`.
