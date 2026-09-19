/** Bound to the Player's Handbook. Requires the Google Docs advanced service. */
const HANDBOOK_STYLE = Object.freeze({
  documentId: '1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss',
  grey: 242 / 255,
  paddingVertical: 3,
  paddingHorizontal: 4,
  fallbackWidth: 468,
});

function onOpen() {
  DocumentApp.getUi().createMenu('Handbook')
    .addItem('Format tables', 'formatHandbookTables')
    .addToUi();
}

function installHandbookFormatting() {
  const doc = handbookDocument_();
  // Prove API access and formatting before installing an automatic trigger.
  const result = formatHandbookTables_();
  const exists = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === 'onHandbookOpen' &&
    trigger.getEventType() === ScriptApp.EventType.ON_OPEN &&
    trigger.getTriggerSourceId() === doc.getId());
  if (!exists) ScriptApp.newTrigger('onHandbookOpen').forDocument(doc).onOpen().create();
  onOpen();
  console.log(JSON.stringify({installed: true, timer: false, ...result}));
}

function onHandbookOpen() {
  formatHandbookTables_();
}

function formatHandbookTables() {
  const result = formatHandbookTables_();
  DocumentApp.getUi().alert('Handbook tables', result.busy
    ? 'Table formatting is already running.'
    : 'Formatted ' + result.tables + ' tables across ' + result.tabs + ' tabs.',
  DocumentApp.getUi().ButtonSet.OK);
}

function handbookDocument_() {
  const doc = DocumentApp.getActiveDocument();
  if (!doc || doc.getId() !== HANDBOOK_STYLE.documentId) {
    throw new Error('This formatter is restricted to the Player\'s Handbook.');
  }
  return doc;
}

function scaledWidths_(widths, available) {
  const weights = widths.every(width => Number.isFinite(width) && width > 0)
    ? widths : widths.map(() => 1);
  const total = weights.reduce((sum, width) => sum + width, 0);
  return weights.map(width => available * width / total);
}

function textWidth_(style) {
  const size = style.pageSize || style.documentSize;
  const page = size && size.width && size.width.magnitude;
  const left = style.marginLeft && (style.marginLeft.magnitude || 0);
  const right = style.marginRight && (style.marginRight.magnitude || 0);
  return Number.isFinite(page) && Number.isFinite(left) && Number.isFinite(right) && page > left + right
    ? page - left - right : HANDBOOK_STYLE.fallbackWidth;
}

function flattenTabs_(tabs) {
  return tabs.flatMap(tab => [tab, ...flattenTabs_(tab.childTabs || [])]);
}

function buildHandbookRequests_(doc) {
  if (doc.documentId !== HANDBOOK_STYLE.documentId) throw new Error('Unexpected document.');
  const requests = [];
  const tabs = flattenTabs_(doc.tabs || []);
  const counts = {tabs: tabs.length, tables: 0, rows: 0, cells: 0};
  const pt = value => ({magnitude: value, unit: 'PT'});
  const rgb = value => ({red: value, green: value, blue: value});
  const border = {width: pt(0.75), dashStyle: 'SOLID', color: {color: {rgbColor: rgb(224 / 255)}}};
  const baseCell = {
    contentAlignment: 'TOP', paddingTop: pt(HANDBOOK_STYLE.paddingVertical),
    paddingBottom: pt(HANDBOOK_STYLE.paddingVertical), paddingLeft: pt(HANDBOOK_STYLE.paddingHorizontal),
    paddingRight: pt(HANDBOOK_STYLE.paddingHorizontal),
    borderTop: border, borderBottom: border, borderLeft: border, borderRight: border,
  };
  function visit(content, tabId, availableWidth) {
    for (const element of content || []) {
      if (!element.table) continue;
      const table = element.table;
      const rows = table.tableRows || [];
      if (!rows.length || !table.columns) continue;
      const location = {index: element.startIndex, tabId};
      const cellRange = (row, rowSpan) => ({
        tableCellLocation: {tableStartLocation: location, rowIndex: row, columnIndex: 0},
        rowSpan, columnSpan: table.columns,
      });
      const properties = (table.tableStyle && table.tableStyle.tableColumnProperties) || [];
      const widths = scaledWidths_(Array.from({length: table.columns}, (_, i) =>
        properties[i] && properties[i].width && properties[i].width.magnitude), availableWidth);
      widths.forEach((width, column) => requests.push({updateTableColumnProperties: {
        tableStartLocation: location, columnIndices: [column],
        tableColumnProperties: {widthType: 'FIXED_WIDTH', width: pt(width)}, fields: 'widthType,width',
      }}));
      requests.push({updateTableRowStyle: {
        tableStartLocation: location, tableRowStyle: {minRowHeight: pt(0)}, fields: 'minRowHeight',
      }});
      requests.push({updateTableCellStyle: {
        tableRange: cellRange(0, rows.length), tableCellStyle: baseCell, fields: Object.keys(baseCell).join(','),
      }});
      requests.push({updateParagraphStyle: {
        range: {tabId, startIndex: element.startIndex, endIndex: element.endIndex},
        paragraphStyle: {alignment: 'START'}, fields: 'alignment',
      }});
      counts.tables++;
      rows.forEach((row, rowIndex) => {
        requests.push({updateTableCellStyle: {
          tableRange: cellRange(rowIndex, 1),
          tableCellStyle: {backgroundColor: {color: {rgbColor: rgb(rowIndex % 2 === 0 ? HANDBOOK_STYLE.grey : 1)}}},
          fields: 'backgroundColor',
        }});
        counts.rows++;
        let column = 0;
        for (const cell of row.tableCells || []) {
          const span = (cell.tableCellStyle && cell.tableCellStyle.columnSpan) || 1;
          const cellWidth = widths.slice(column, column + span).reduce((sum, width) => sum + width, 0);
          column += span;
          counts.cells++;
          for (const item of cell.content || []) {
            const paragraph = item.paragraph;
            if (!paragraph || paragraph.bullet) continue;
            const style = paragraph.paragraphStyle || {};
            const fields = ['indentStart', 'indentEnd', 'indentFirstLine'].filter(key =>
              style[key] && style[key].magnitude);
            if (fields.length) requests.push({updateParagraphStyle: {
              range: {tabId, startIndex: item.startIndex, endIndex: item.endIndex},
              paragraphStyle: Object.fromEntries(fields.map(key => [key, pt(0)])), fields: fields.join(','),
            }});
          }
          visit(cell.content, tabId, Math.max(1, cellWidth - 2 * HANDBOOK_STYLE.paddingHorizontal));
        }
      });
    }
  }
  for (const tab of tabs) {
    const body = (tab.documentTab && tab.documentTab.body) || tab.body;
    visit(body && body.content, (tab.tabProperties && tab.tabProperties.tabId) || tab.tabId,
      textWidth_((tab.documentTab && tab.documentTab.documentStyle) || tab.documentStyle || doc.documentStyle || {}));
  }
  return {requests, counts};
}

function formatHandbookTables_() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) return {busy: true};
  const started = Date.now();
  try {
    const id = handbookDocument_().getId();
    const doc = Docs.Documents.get(id, {includeTabsContent: true});
    const plan = buildHandbookRequests_(doc);
    if (plan.requests.length) Docs.Documents.batchUpdate({
      requests: plan.requests, writeControl: {requiredRevisionId: doc.revisionId},
    }, id);
    console.log(JSON.stringify({...plan.counts, elapsedMs: Date.now() - started}));
    return plan.counts;
  } finally {
    lock.releaseLock();
  }
}
