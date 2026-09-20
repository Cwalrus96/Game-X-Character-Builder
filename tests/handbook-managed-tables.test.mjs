import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = ['HandbookFormatter.gs', 'ManagedTables.gs'].map(file =>
  readFileSync(new URL('../scripts/handbook/' + file, import.meta.url), 'utf8')).join('\n');
function load() {
  return runInNewContext(source + '\n({HANDBOOK_TABLES, selectHandbookRows_, buildSourceTypographyRequests_, handbookMarker_, handbookCellRuns_});');
}
const row = (text, n = 1) => ({text, row: n, runs: []});

test('read-only Sheets rich text inherits cell styles and explicitly resets title emphasis', () => {
  const {handbookCellRuns_} = load();
  const runs = handbookCellRuns_({effectiveFormat: {textFormat: {fontFamily: 'Calibri', fontSize: 10}},
    textFormatRuns: [{startIndex: 0, format: {bold: true, fontSize: 16}},
      {startIndex: 5, format: {bold: false, italic: true, link: {uri: 'https://example.com'}}}]}, 'Title\nBody');
  assert.equal(runs[0].style.bold, true);
  assert.equal(runs[0].end, 5);
  assert.equal(runs[1].style.fontSize, 10);
  assert.equal(runs[1].style.bold, false);
  assert.equal(runs[1].style.link, 'https://example.com');
  assert.equal(runs[1].style.color, '#000000');
  assert.equal(handbookCellRuns_({}, '').length, 0);
  const manifest = JSON.parse(readFileSync(new URL('../scripts/handbook/appsscript.json', import.meta.url)));
  assert.ok(manifest.dependencies.enabledAdvancedServices.some(s => s.userSymbol === 'Sheets'));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly'));
  assert.ok(!manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
  assert.ok(!source.includes('SpreadsheetApp.openById('));
});

test('managed sources include complete catalogues and compact blanks without limiting growth', () => {
  const {HANDBOOK_TABLES, selectHandbookRows_} = load();
  assert.equal(new Set(HANDBOOK_TABLES.map(s => s.key)).size, HANDBOOK_TABLES.length);
  assert.ok(HANDBOOK_TABLES.some(s => s.key === 'traits-all'));
  assert.ok(HANDBOOK_TABLES.some(s => s.key === 'techniques-all'));
  const spec = HANDBOOK_TABLES.find(s => s.key === 'archetypes-6');
  const input = [row(''), ...Array.from({length: 105}, (_, i) => row('Feat ' + i)), row('  ')];
  assert.equal(selectHandbookRows_(input, spec).length, 105);
  assert.equal(selectHandbookRows_([], spec).length, 0);
  assert.throws(() => selectHandbookRows_([row('#REF!', 15)], spec), /formula error.*row 15/);
});

test('level sections grow by prerequisite level and keep unrelated future feats in the all-level sections', () => {
  const {selectHandbookRows_} = load();
  const rows = [2, 4, 6].map(level => row('Name\n\nPrerequisites:\nMagical Guardian, Level ' + level));
  assert.equal(selectHandbookRows_(rows, {level: 2}).length, 1);
  assert.equal(selectHandbookRows_(rows, {minLevel: 4}).length, 2);
  assert.equal(selectHandbookRows_(rows, {}).length, 3);
});

function typographyFixture(api) {
  const sources = Object.fromEntries(api.HANDBOOK_TABLES.map(s => [s.key, {rows: []}]));
  const byTab = new Map();
  for (const spec of api.HANDBOOK_TABLES) {
    if (!byTab.has(spec.tabId)) byTab.set(spec.tabId, []);
    byTab.get(spec.tabId).push({paragraph: {elements: [{textRun: {content: api.handbookMarker_(spec) + '\n'}}]}});
  }
  const spec = api.HANDBOOK_TABLES[0];
  const text = 'Title\nPlain body';
  sources[spec.key].rows.push({text, runs: [
    {start: 0, end: 5, style: {bold: true, italic: false, underline: false, strikethrough: false, fontFamily: 'Calibri', fontSize: 16, color: '#123456', link: null}},
    {start: 5, end: text.length, style: {bold: false, italic: true, underline: false, strikethrough: false, fontFamily: 'Calibri', fontSize: 10, color: '#000000', link: 'https://example.com/rule'}},
  ]});
  byTab.get(spec.tabId).splice(1, 0, {table: {columns: 1, tableRows: [{tableCells: [{content: [
    {startIndex: 100, paragraph: {elements: [{textRun: {content: text + '\n'}}]}},
  ]}]}]}});
  return {sources, doc: {tabs: [...byTab].map(([tabId, content]) => ({tabId, body: {content}}))}};
}

test('source typography explicitly clears inherited headings and bold, then applies exact rich-text runs', () => {
  const api = load();
  const {doc, sources} = typographyFixture(api);
  const requests = api.buildSourceTypographyRequests_(doc, sources);
  assert.equal(requests[0].updateParagraphStyle.paragraphStyle.namedStyleType, 'NORMAL_TEXT');
  assert.equal(requests[0].updateParagraphStyle.paragraphStyle.keepWithNext, false);
  assert.equal(requests[1].updateTextStyle.textStyle.bold, false);
  assert.equal(requests[1].updateTextStyle.textStyle.baselineOffset, 'NONE');
  assert.ok(requests[1].updateTextStyle.fields.includes('link'));
  assert.equal(requests[2].updateTextStyle.range.endIndex, 105);
  assert.equal(requests[2].updateTextStyle.textStyle.fontSize.magnitude, 16);
  assert.equal(requests[3].updateTextStyle.textStyle.bold, false);
  assert.equal(requests[3].updateTextStyle.textStyle.italic, true);
  assert.equal(requests[3].updateTextStyle.textStyle.link.url, 'https://example.com/rule');
  assert.ok(requests.every(r => Object.keys(r).every(k => ['updateParagraphStyle', 'updateTextStyle'].includes(k))));
});

test('missing anchors, duplicated anchors, and changed cells fail before any typography write', () => {
  const api = load();
  for (const kind of ['missing', 'duplicate', 'changed']) {
    const {doc, sources} = typographyFixture(api);
    if (kind === 'missing') doc.tabs[0].body.content.pop();
    if (kind === 'duplicate') doc.tabs[0].body.content.push(doc.tabs[0].body.content[0]);
    if (kind === 'changed') doc.tabs[0].body.content[1].table.tableRows[0].tableCells[0].content[0].paragraph.elements[0].textRun.content = 'User edit\n';
    assert.throws(() => api.buildSourceTypographyRequests_(doc, sources), /missing|Duplicate|changed/);
  }
});

test('Docs carriage-return conversion preserves source formatting offsets', () => {
  const api = load();
  const {doc, sources} = typographyFixture(api);
  sources[api.HANDBOOK_TABLES[0].key].rows[0].text = 'Title\rPlain body';
  doc.tabs[0].body.content[1].table.tableRows[0].tableCells[0].content[0].paragraph.elements[0].textRun.content = 'Title\u000bPlain body\n';
  const requests = api.buildSourceTypographyRequests_(doc, sources);
  assert.equal(requests[2].updateTextStyle.range.endIndex, 105);
  assert.equal(requests[3].updateTextStyle.range.startIndex, 105);
});
