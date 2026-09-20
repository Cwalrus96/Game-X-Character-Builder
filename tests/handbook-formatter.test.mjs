import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/handbook/HandbookFormatter.gs', import.meta.url), 'utf8');
const documentId = '1cuwDpTwqG2LHulyXm0okgD-4Rj3ZNwZufEFjL777jss';
function load(globals = {}) {
  return runInNewContext(source + '\n({scaledWidths_, textWidth_, flattenTabs_, buildHandbookRequests_, handbookDocument_, installHandbookFormatting, formatHandbookTables_});',
    { console: { log() {} }, ...globals });
}
function fixture() {
  const paragraph = (index, bullet = false) => ({ startIndex: index, endIndex: index + 3,
    paragraph: { ...(bullet ? { bullet: { listId: 'real-list', nestingLevel: 1 } } : {}),
      paragraphStyle: { indentStart: { magnitude: 18, unit: 'PT' } },
      elements: [{ textRun: { content: 'Hi\n', textStyle: { bold: true } } }] } });
  return { documentId, revisionId: 'revision-1', tabs: [{ tabProperties: { tabId: 't.0' },
    documentTab: { body: { content: [{ startIndex: 1, endIndex: 25, table: {
      rows: 2, columns: 2, tableStyle: { tableColumnProperties: [100, 300].map(width => ({ width: { magnitude: width, unit: 'PT' } })) },
      tableRows: [0, 1].map(row => ({ tableCells: [0, 1].map(column => ({
        tableCellStyle: { columnSpan: 1 }, content: [paragraph(3 + 10 * row + 4 * column, row === 1)],
      })) })),
    } }] } } }] };
}

test('handbook widths preserve proportions and use normal text width', () => {
  const { scaledWidths_, textWidth_ } = load();
  assert.deepEqual(Array.from(scaledWidths_([100, 300], 468)), [117, 351]);
  assert.deepEqual(Array.from(scaledWidths_([null, 50], 468)), [234, 234]);
  assert.equal(textWidth_({ documentSize: { width: { magnitude: 612 } }, marginLeft: { magnitude: 72 }, marginRight: { magnitude: 72 } }), 468);
  assert.equal(textWidth_({}), 468);
});

test('formatter includes child tabs and refuses a different document', () => {
  const api = load({ DocumentApp: { getActiveDocument: () => ({ getId: () => 'another-document' }) } });
  const child = { childTabs: [] };
  const parent = { childTabs: [child] };
  assert.deepEqual(Array.from(api.flattenTabs_([parent])), [parent, child]);
  assert.throws(() => api.handbookDocument_(), /restricted/);
  assert.throws(() => api.buildHandbookRequests_({ documentId: 'other' }), /Unexpected document/);
});

test('formatting plan resets explicit borders and heights without content or emphasis mutations', () => {
  const doc = fixture();
  const original = JSON.stringify(doc);
  const plan = load().buildHandbookRequests_(doc);
  assert.equal(JSON.stringify(doc), original);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.counts)), { tabs: 1, tables: 1, rows: 2, cells: 4 });
  const columns = plan.requests.filter(r => r.updateTableColumnProperties);
  assert.deepEqual(Array.from(columns, r => r.updateTableColumnProperties.tableColumnProperties.width.magnitude), [117, 351]);
  const base = plan.requests.find(r => r.updateTableCellStyle?.fields.includes('borderTop')).updateTableCellStyle;
  for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
    const border = base.tableCellStyle['border' + side];
    assert.equal(border.width.magnitude, 0.75);
    assert.equal(border.color.color.rgbColor.red, 224 / 255);
  }
  assert.equal(plan.requests.find(r => r.updateTableRowStyle).updateTableRowStyle.tableRowStyle.minRowHeight.magnitude, 0);
  assert.ok(plan.requests.every(r => Object.keys(r).every(key => ['updateTableCellStyle', 'updateTableColumnProperties', 'updateTableRowStyle', 'updateParagraphStyle'].includes(key))));
  const indentChanges = plan.requests.filter(r => r.updateParagraphStyle?.fields.includes('indent'));
  assert.deepEqual(Array.from(indentChanges, r => r.updateParagraphStyle.range.startIndex), [3, 7]);
  const fills = plan.requests.filter(r => r.updateTableCellStyle?.fields === 'backgroundColor');
  assert.deepEqual(Array.from(fills, r => r.updateTableCellStyle.tableCellStyle.backgroundColor.color.rgbColor.red), [242 / 255, 1]);
});

test('execution uses a revision guard and releases its lock on a rejected write', () => {
  let released = false;
  const doc = fixture();
  const api = load({
    DocumentApp: { getActiveDocument: () => ({ getId: () => documentId }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() { released = true; } }) },
    Docs: { Documents: { get: () => doc, batchUpdate(body, id) {
      assert.equal(id, documentId);
      assert.equal(body.writeControl.requiredRevisionId, 'revision-1');
      throw new Error('Concurrent document edit');
    } } },
  });
  assert.throws(() => api.formatHandbookTables_(), /Concurrent document edit/);
  assert.equal(released, true);
});

test('installation leaves no automatic trigger when Docs API access fails', () => {
  let created = false;
  const api = load({
    DocumentApp: { getActiveDocument: () => ({ getId: () => documentId }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Docs: { Documents: { get() { throw new Error('API authorization required'); } } },
    ScriptApp: { getProjectTriggers: () => [], newTrigger() { created = true; } },
  });
  assert.throws(() => api.installHandbookFormatting(), /API authorization required/);
  assert.equal(created, false);
});

test('editor installation needs no document UI and creates exactly one open trigger', () => {
  const triggers = [];
  const doc = { getId: () => documentId };
  const api = load({
    DocumentApp: { getActiveDocument: () => doc, getUi() {
      throw new Error('Cannot call DocumentApp.getUi() from this context.');
    } },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Docs: { Documents: { get: () => fixture(), batchUpdate() {} } },
    ScriptApp: { EventType: { ON_OPEN: 'OPEN' }, getUserTriggers(target) {
      assert.equal(target, doc);
      return triggers;
    },
      deleteTrigger(trigger) { triggers.splice(triggers.indexOf(trigger), 1); },
      newTrigger(handler) { return { forDocument(target) {
        assert.equal(target, doc);
        return { onOpen() { return { create() {
          triggers.push({ getHandlerFunction: () => handler, getEventType: () => 'OPEN', getTriggerSourceId: () => 'opaque-docs-source-id' });
        } }; } };
      } }; },
    },
  });
  api.installHandbookFormatting();
  api.installHandbookFormatting();
  assert.equal(triggers.length, 1);
  const keeper = triggers[0];
  const unrelated = { getHandlerFunction: () => 'anotherHandler', getEventType: () => 'OPEN' };
  const otherEvent = { getHandlerFunction: () => 'onHandbookOpen', getEventType: () => 'OTHER' };
  triggers.push({ ...keeper }, unrelated, otherEvent);
  api.installHandbookFormatting();
  assert.deepEqual(triggers, [keeper, unrelated, otherEvent]);
});

test('installation does not change triggers while formatting is busy', () => {
  const api = load({
    DocumentApp: { getActiveDocument: () => ({ getId: () => documentId }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => false }) },
    ScriptApp: { getUserTriggers() { assert.fail('Busy installation must not inspect or modify triggers'); } },
  });
  assert.throws(() => api.installHandbookFormatting(), /already running/);
});
