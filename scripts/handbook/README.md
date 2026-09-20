# Handbook table refresh

The files here maintain the bound [Game X Handbook Formatting project](https://script.google.com/u/0/home/projects/1jyX4rsMeAhTdRwDTNRmSHWPzVB_hEHOfyEqYv5beSgwKyaKNRq4H2Prd/edit), restricted to the [Player's Handbook](https://docs.google.com/document/d/1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss/edit). `ManagedTables.gs` reads the [display spreadsheet](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit); `HandbookFormatter.gs` applies consistent document layout.

## Workflow

1. Edit game content in the canonical source spreadsheet and allow display imports to recalculate.
2. In the display spreadsheet, use **Format Sheet → Update all Display → Formatted tabs**.
3. Open the handbook or choose **Handbook → Refresh tables**. Each registered table contains exactly its populated source rows, with source font family, size, color, bold, italic, underline, strikeout, and hyperlinks. No handbook range adjustment or padding rows are necessary.

The user approved replacing native fixed-range links with script-managed tables on September 20. Each managed section has a small source hyperlink and a named-range anchor. Native **Update table** is replaced by **Refresh tables**. Changes inside these source-owned tables are replaced on refresh; author content and typography in the spreadsheet. Unrelated prose and manually authored tables are retained. New rows in existing registered source columns are automatic; an entirely new source section requires a new binding in `HANDBOOK_TABLES`.

The layout pass visits every document tab and table. It fits columns to the normal text width while retaining their proportions, applies alternating `#f2f2f2` and white rows, uses 1px-equivalent (0.75-point) `#e0e0e0` borders, clears minimum row heights, top-aligns cells, and left-aligns paragraphs. Padding is 3 points vertically and 4 points horizontally. The current pageless handbook uses its stored 468-point normal text width. Source-owned tables are rebuilt to clear native import/positioning overrides, then receive explicit normal paragraph styles and source rich-text runs. Other tables retain their text and genuine list indentation.

## Authorization and installation

Enable the Google Docs v1 service as `Docs` and Google Sheets v4 service as `Sheets`. The manifest explicitly lists only three scopes: Docs access, read-only Sheets access, and script-trigger management. `Sheets.Spreadsheets.get` is intentional: the built-in `SpreadsheetApp.openById` requires spreadsheet-edit permission even when only reading. No source spreadsheet writes or external network service are used.

Run `previewHandbookRefresh` in the editor to authorize and verify the current source counts without changing the handbook. Complete **Review permissions** with the account that owns the open trigger, selecting every requested permission. Ordinary refreshes reuse this authorization. A new permission, revoked grant, different account, or separate script project may require consent again.

For a new installation, run `installHandbookFormatting` once. It verifies Docs access, retains exactly one matching `onHandbookOpen` trigger for this document/project/user, and preserves unrelated triggers. The simple `onOpen` creates the document menu; the installable trigger performs the authorized refresh. There is no clock trigger. Editor installation must not invoke a document UI alert. Reopen as an editor to load the menu; viewers do not run this open trigger. Google does not expose a spreadsheet-change or native linked-table-refresh event to this bound document script.

## Failure handling and verification

The script reads all source outputs and resolves all destinations before modifying the document. Formula errors, ambiguous legacy matches, changed anchors, and missing tabs stop the run. Each replacement is inserted before its previous table is removed. A document lock prevents overlapping script runs. The final Docs API style batch uses a revision guard; a revision conflict causes a fresh document read and a freshly indexed plan, with at most three attempts. Other errors are surfaced immediately.

Run `node --test tests/handbook-formatter.test.mjs tests/handbook-managed-tables.test.mjs`. These cover growth beyond 100 rows, blank filtering, source typography, read-only access, section filters, anchor/cell mismatch detection, layout, fresh-revision retries, and duplicate-free trigger installation. Native migration, visual alignment, repeated refresh, and source-to-handbook readback remain required live checks; see [status](../../docs/status.md) for the current activation state.

The September 20 conversion readback passed for 36 managed tables and 476 populated rows, checking 158,694 non-whitespace characters against source typography. All 49 total tables, 566 rows, and 1,274 cells passed layout checks; unrelated prose and manual table text were retained. Native Henshin and Psychic tables both use left alignment and top cells. Editor, automatic-open, and manual-menu refreshes completed in approximately 132, 115, and 124 seconds. Final repeat-run readback retained every table's content and styles across all four document tabs. All 15 focused tests and 265 repository unit tests passed, along with nine baseline and 14 asset checks.

A full native recovery snapshot and final audit are saved under ignored `.staging/handbook-managed-2026-09-20/`. Earlier layout-only verification under `.staging/handbook-activation-2026-09-20/` covered 50 tables, 459 rows, 1,167 cells, and all 37 native list paragraphs. Those measurements describe the old native-link workflow.
