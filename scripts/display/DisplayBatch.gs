/** Bulk conversion for the Game-X-Data-Display bound project. */
function generateAllFormattedOutputTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) {
    ss.toast('Formatting is already running. Try again when it finishes.', 'Format Sheet', 8);
    return;
  }
  const activeSheet = ss.getActiveSheet();
  const completed = [];
  let currentOutput;
  let message;
  try {
    SpreadsheetApp.flush();
    const sources = ss.getSheets().filter(sheet => /_display$/i.test(sheet.getName()));
    if (!sources.length) throw new Error('No tabs ending in _Display were found.');

    // Read and validate every source before changing any existing output.
    const plans = sources.map(prepareDisplayFormatting_);
    for (const plan of plans) {
      currentOutput = plan.formattedSheetName;
      ss.toast('Updating ' + plan.formattedSheetName + ' (' + (completed.length + 1) + '/' + plans.length + ')', 'Format Sheet', -1);
      writeDisplayFormatting_(ss, plan);
      completed.push(plan.formattedSheetName);
      currentOutput = null;
    }
    SpreadsheetApp.flush();
    message = 'Updated ' + completed.length + ' formatted tabs:\n\n' + completed.join('\n');
    console.log(JSON.stringify({formattedTabs: completed}));
  } catch (error) {
    message = 'Formatting stopped: ' + error.message + '\n\n' +
      (completed.length ? 'Already updated:\n' + completed.join('\n') :
        currentOutput ? 'No tabs finished updating.' : 'No formatted tabs were changed.') +
      (currentOutput ? '\n\nCheck ' + currentOutput + '; its update may be incomplete. Run again after fixing the problem.' : '');
    console.error(message);
  } finally {
    try { ss.setActiveSheet(activeSheet); } finally { lock.releaseLock(); }
  }
  ss.toast(message.split('\n')[0], 'Format Sheet', 8);
  ui.alert('Format Sheet', message, ui.ButtonSet.OK);
}

function prepareDisplayFormatting_(sourceSheet) {
  const range = FORMAT_CONFIG.rangeA1
    ? sourceSheet.getRange(FORMAT_CONFIG.rangeA1) : sourceSheet.getDataRange();
  const values = range.getDisplayValues();
  const errorPattern = /^(?:#(?:REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|ERROR!|SPILL!|CALC!|LOADING!)|Loading(?:\.{3}|\u2026)?)$/i;
  values.forEach((row, r) => row.forEach((value, c) => {
    if (errorPattern.test(String(value).trim())) {
      throw new Error(sourceSheet.getName() + ' contains ' + value + ' at row ' +
        (range.getRow() + r) + ', column ' + (range.getColumn() + c) +
        '. Wait for formulas/imports to finish or fix the error, then run again.');
    }
  }));
  // Formula-filled empty tails need not create thousands of empty rich-text cells.
  let rows = 0;
  let columns = 0;
  values.forEach((row, r) => row.forEach((value, c) => {
    if (value !== '') { rows = Math.max(rows, r + 1); columns = Math.max(columns, c + 1); }
  }));
  rows = Math.max(rows, 1);
  columns = Math.max(columns, 1);
  const trimmed = Array.from({length: rows}, (_, r) =>
    Array.from({length: columns}, (_, c) => values[r]?.[c] ?? ''));
  return {
    sourceSheet,
    sourceRange: sourceSheet.getRange(range.getRow(), range.getColumn(), rows, columns),
    formattedSheetName: sourceSheet.getName().replace(/_display$/i, '_Formatted'),
    rows, columns,
    richTextGrid: buildMarkdownRichTextGrid_(trimmed),
  };
}

function writeDisplayFormatting_(ss, plan) {
  const {sourceSheet, sourceRange, formattedSheetName, rows, columns, richTextGrid} = plan;
  // Reuse the existing tab and sheet ID so linked handbook tables stay connected.
  let target = ss.getSheets().find(sheet => sheet.getName().toLowerCase() === formattedSheetName.toLowerCase());
  if (!target) {
    target = ss.insertSheet(formattedSheetName);
    if (sourceSheet.isSheetHidden()) target.hideSheet();
  }
  ensureSheetSize_(target, rows, columns);
  target.clear();
  sourceRange.copyFormatToRange(target, 1, columns, 1, rows);
  copyColumnWidths_(sourceSheet, target, sourceRange);
  target.setFrozenRows(Math.min(sourceSheet.getFrozenRows(), rows));
  target.setFrozenColumns(Math.min(sourceSheet.getFrozenColumns(), columns));
  target.getRange(1, 1, rows, columns).setRichTextValues(richTextGrid).setWrap(true);
  target.autoResizeRows(1, rows);
}
