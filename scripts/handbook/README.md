# Handbook table formatting

`HandbookFormatter.gs` is the source for the bound [Game X Handbook Formatting project](https://script.google.com/u/0/home/projects/1jyX4rsMeAhTdRwDTNRmSHWPzVB_hEHOfyEqYv5beSgwKyaKNRq4H2Prd/edit). It targets only the [Player's Handbook](https://docs.google.com/document/d/1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss/edit).

The formatter visits all document tabs and tables. It fits columns to the normal text width while retaining their proportions, applies alternating `#f2f2f2` and white rows, uses 1px-equivalent (0.75-point) `#e0e0e0` borders, clears minimum row heights, top-aligns cells, and left-aligns paragraphs. Padding is 3 points vertically and 4 points horizontally. It preserves text, rich-text emphasis, links, images, table structure, and real list indentation. The current pageless handbook uses the stored 468-point (6.5-inch) normal text width as its fallback.

Google's basic `DocumentApp` table border setter did not clear existing per-cell border overrides in a native pilot. This implementation therefore uses the public Docs API with precise field masks and a document revision guard. It never rebuilds or unlinks tables. An overlapping run is skipped through a document lock; a concurrent document edit rejects the stale write.

## Activation

The Docs advanced service is enabled and saved in the bound project. The user approved its service terms on 2026-09-20. Installation, automatic document-open execution, and the document menu command have been verified against the current 50 tables. Exactly one `onHandbookOpen` trigger is installed for the current user, with no clock trigger.

For a new installation:

1. In the bound project, add **Google Docs API**, version **v1**, identifier **Docs**, under **Services**. Google's dialog says adding the service accepts its API terms; obtain the user's explicit confirmation for that acceptance.
2. Run `installHandbookFormatting` once and complete Google's authorization. The manifest records the Docs and script-trigger scopes. The program guards the exact handbook ID and accesses no external files or network services.
3. Verify one `onHandbookOpen` document-open trigger in the project's **Triggers** page. Re-running installation must not create duplicates. There is no clock trigger.
4. Reopen the handbook and verify **Handbook → Format tables**, an automatic open execution, and a successful manual menu execution.

The simple `onOpen` function creates the top menu. The installer must not call it: an Apps Script editor execution has no document UI. The installable open trigger does the formatting, avoiding the simple trigger's 30-second limit and restricted authorization. It runs when an editor opens the handbook, not when a viewer opens it.

Installation uses `ScriptApp.getUserTriggers(doc)` to scope existing triggers to this document and project, retains one matching handler/open event, and removes only duplicates of that handler/event. The live Docs service returned an internal trigger source ID different from `doc.getId()`, so comparing those IDs incorrectly created duplicates. A busy or failed formatting attempt does not install or modify triggers.

Google Docs does not expose a linked-table-refresh trigger or a public method to invoke native **Update all**. After updating linked content, choose **Handbook → Format tables**. Reopening the document also formats it. The menu is a top-menu command; Google does not expose a custom button slot in its formatting toolbar.

## Verification

Run `node --test tests/handbook-formatter.test.mjs`. The tests check width calculations, tab traversal, target guarding, preservation of content and list indentation, revision-safe writes, lock release, and failure-safe, duplicate-free open-trigger installation.

The 2026-09-20 activation pass verified successful installer, document-open trigger, and manual menu executions. Final readback checked all 50 tables, 459 rows, 1,167 cells, and 4,557 table paragraphs, including 37 native list paragraphs. All requested styles passed; table content, emphasis, links, list metadata, dimensions, and indexes matched the pre-run snapshot exactly. All seven focused tests and 257 repository unit tests passed. Evidence is ignored under `.staging/handbook-activation-2026-09-20/`.

The 2026-09-19 live pass verified 45 tables, 418 rows, 1,166 cells, and 3,896 table paragraphs. Text and emphasis were unchanged; all 109 native list paragraphs were retained. Widths, stripes, zero row minima, and compact padding were checked through the connector; effective top alignment was also checked in native Table options. The subsequent user-requested border pass verified all four edges of every cell at 0.75 points and `#e0e0e0`, with other content and styles unchanged. Evidence is ignored under `.staging/handbook-uniform-2026-09-19/`.
