# Display spreadsheet bulk formatter

`DisplayBatch.gs` extends the existing bound [Game X project](https://script.google.com/u/0/home/projects/1RfzvZR0z7ytWstW5e6EnXEpP90dqu8muhSz5Kojv4k1mRBvrTRBgrht2/edit) for [Game-X-Data-Display](https://docs.google.com/spreadsheets/d/106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U/edit).

The existing `Code.gs` owns markdown parsing and individual-tab formatting. Add this item to its `onOpen()` menu chain, before the existing items:

```js
.addItem('Update all Display → Formatted tabs', 'generateAllFormattedOutputTabs')
.addSeparator()
```

The new function finds every tab ending in `_Display`, case-insensitively, including hidden tabs. It flushes pending spreadsheet changes, reads current calculated display values, validates every source, and converts all outputs using the existing `buildMarkdownRichTextGrid_`, `ensureSheetSize_`, and `copyColumnWidths_` helpers. It stops before changing outputs if any source contains a formula error or loading indicator. This does not force an upstream `IMPORTRANGE` refresh; imports must have finished recalculating before the command runs.

Existing output tabs are reused without changing sheet IDs. Missing outputs are created, matching the source's hidden status. Empty formula tails are trimmed while retaining internal blank rows/columns and all technique excerpt columns. Each output receives the existing markdown styling, source cell formats/column widths, wrapping, frozen rows/columns, and automatic row sizing. The command uses a document lock, restores the originally active tab, and reports completion or partial failures.

No new service, permission scope, timed trigger, or source-workbook write is introduced. The handbook's native linked tables still need **Update all** in Google Docs after this spreadsheet command completes.

Verified on 2026-09-19: the saved menu command completed all six display pairs, creating `ClassFeatures_Formatted` (hidden) and `Origins_Formatted` while retaining all existing destination IDs. Readback matched 502 populated output cells and confirmed unchanged source cells and all technique excerpt columns. The full unit suite passed 247 tests. Local evidence is ignored under `.staging/display-batch-2026-09-19/`.
