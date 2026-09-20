/** Source-owned handbook tables. The display spreadsheet remains the typography authority. */
const HANDBOOK_DISPLAY_ID = '106wXA3w52aubp0zCYqieHJME02C0bu4jdho9b_eBA8U';
const HANDBOOK_TABLES = (() => {
  const basic = 't.0', classes = 't.j3zbc5i2oiby', catalogue = 't.yz4ctfxm1pnu';
  const entries = [];
  const add = (key, tabId, sheet, column, legacy, label, extra) =>
    entries.push({key, tabId, sheet, column, legacy, label, ...extra});
  ['Ninja', 'Magical Guardian', 'Monster Tamer', 'Spirit Warrior', 'Elementalist',
    'Mech Pilot', 'Weapon Master', 'Henshin Hero', 'Psychic', 'Metamorph'].forEach((name, i) =>
    add('class-' + i, classes, 'Classes_Formatted', i + 1, name, name));
  add('feats-magical-2', classes, 'Feats_Formatted', 2, 'Dazzling Transformation', 'Magical Guardian feats — Level 2',
    {startRow: 2, level: 2, retire: ['Energy Storing Relic']});
  add('feats-magical-4', classes, 'Feats_Formatted', 2, 'Instant Transformation', 'Magical Guardian feats — Level 4 and above',
    {startRow: 2, minLevel: 4});
  [[3, 'Combined Attack', 'Monster Tamer'], [4, 'Split Focus', 'Spirit Warrior'],
    [5, 'Weaponsmith', 'Weapon Master'], [6, 'Explosive Transformation', 'Henshin Hero']].forEach(([col, first, name]) =>
    add('feats-' + col, classes, 'Feats_Formatted', col, first, name + ' feats', {startRow: 2}));
  [[1, 'Dragoon Multiclass Initiate', 'Multiclass archetypes'], [2, 'Clone School', 'Ninja archetypes'],
    [3, 'Celestial Knight Path Initiate', 'Magical Guardian archetypes'], [4, 'Dizzy Fist Initiate', 'Spirit Warrior archetypes'],
    [5, 'Commander Path Initiate', 'Weapon Master archetypes'], [6, 'Chroma Ranger Initiate', 'Henshin Hero archetypes'],
    [7, 'Titan Shifter Path Initiate', 'Metamorph archetypes']].forEach(([col, first, label]) =>
    add('archetypes-' + col, classes, 'Archetypes_Formatted', col, first, label,
      col === 3 ? {retire: ['Shining Protector Path Initiate']} : {}));
  [[3, 'Baseball Bat (Rank 0)', 0], [5, 'Longsword (Rank 1)', 1], [7, 'Gunblade (Rank 2)', 2],
    [9, 'Rocket Launcher (Rank 3)', 3], [11, 'Beam Cannon (Rank 4)', 4], [13, 'Disintegration Beam (Rank 5)', 5]]
    .forEach(([col, first, rank]) => add('weapons-' + rank, basic, 'WeaponBases_Formatted', col, first, 'Rank ' + rank + ' weapon bases'));
  [[4, basic, 'Unarmed Strike ( Rank 0)', 'Martial Arts Rank 0'],
    [6, classes, 'Telepathic Link ( Rank 1)', 'Rank 1 spell excerpt'],
    [8, classes, 'Misty Step ( Rank 2)', 'Rank 2 spell excerpt'],
    [10, classes, 'Disrupt Energy ( Rank 3)', 'Rank 3 spell excerpt'],
    [12, basic, 'Blade beam ( Rank 2)', 'Weapon technique excerpt']].forEach(([col, tab, first, label]) =>
    add('techniques-' + col, tab, 'Techniques_Formatted', col, first, label));
  add('techniques-all', catalogue, 'Techniques_Formatted', 1, '"Now\'s Your Chance!" ( Rank 1)', 'General techniques');
  add('traits-all', catalogue, 'Traits_Formatted', 1, 'Flight - Rank 1', 'Traits');
  return Object.freeze(entries);
})();

function selectHandbookRows_(rows, spec) {
  return rows.filter(row => {
    if (!row.text.trim()) return false;
    if (/^#(REF!|ERROR!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!)/.test(row.text.trim())) {
      throw new Error('Display formula error in ' + spec.sheet + ', row ' + row.row + '. Refresh the display spreadsheet first.');
    }
    const level = Number((row.text.match(/^.*?, Level (\d+)\s*$/m) || [])[1]);
    return (spec.level === undefined || level === spec.level) &&
      (spec.minLevel === undefined || level >= spec.minLevel);
  });
}

function handbookCellRuns_(cell, text) {
  if (!text) return [];
  const base = (cell.effectiveFormat && cell.effectiveFormat.textFormat) || {};
  const runs = (cell.textFormatRuns || []).slice();
  if (!runs.length || runs[0].startIndex > 0) runs.unshift({startIndex: 0, format: {}});
  return runs.map((run, i) => {
    const style = {...base, ...run.format};
    const color = (style.foregroundColorStyle && style.foregroundColorStyle.rgbColor) || style.foregroundColor || {};
    const hex = '#' + ['red', 'green', 'blue'].map(key => Math.round((color[key] || 0) * 255).toString(16).padStart(2, '0')).join('');
    return {start: run.startIndex || 0, end: i + 1 < runs.length ? runs[i + 1].startIndex : text.length, style: {
      fontFamily: style.fontFamily || 'Calibri', fontSize: style.fontSize || 10,
      bold: style.bold === true, italic: style.italic === true,
      underline: style.underline === true, strikethrough: style.strikethrough === true,
      color: hex, link: style.link ? style.link.uri : null,
    }};
  });
}

function readHandbookSources_() {
  // SpreadsheetApp.openById requires write access even for reads. This API accepts the read-only scope.
  const titles = [...new Set(HANDBOOK_TABLES.map(spec => spec.sheet))];
  const columnName = column => String.fromCharCode(64 + column);
  const workbook = Sheets.Spreadsheets.get(HANDBOOK_DISPLAY_ID, {
    ranges: titles.map(title => "'" + title + "'!A:" + columnName(Math.max(...HANDBOOK_TABLES.filter(s => s.sheet === title).map(s => s.column)))),
    fields: 'sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(formattedValue,effectiveValue,effectiveFormat(textFormat),textFormatRuns))))',
  });
  const sources = {};
  for (const title of titles) {
    const sheet = (workbook.sheets || []).find(sheet => sheet.properties.title === title);
    if (!sheet) throw new Error('Missing display tab: ' + title);
    const specs = HANDBOOK_TABLES.filter(spec => spec.sheet === title);
    const grid = (sheet.data || [])[0] || {};
    const cells = grid.rowData || [];
    for (const spec of specs) {
      const rows = cells.map((row, i) => {
        const cell = (row.values || [])[spec.column - 1 - (grid.startColumn || 0)] || {};
        if (cell.effectiveValue && cell.effectiveValue.errorValue) throw new Error('Display formula error in ' + title + ', row ' + (i + 1));
        const text = cell.formattedValue || '';
        return {row: i + 1 + (grid.startRow || 0), text, runs: handbookCellRuns_(cell, text)};
      }).filter(row => row.row >= (spec.startRow || 1));
      sources[spec.key] = {rows: selectHandbookRows_(rows, spec),
        url: 'https://docs.google.com/spreadsheets/d/' + HANDBOOK_DISPLAY_ID + '/edit#gid=' + sheet.properties.sheetId + '&range=' +
          encodeURIComponent(columnName(spec.column) + ':' + columnName(spec.column))};
    }
  }
  if (!Object.values(sources).some(source => source.rows.length)) throw new Error('Display outputs are empty. Refresh the display spreadsheet first.');
  return sources;
}

function handbookMarker_(spec) { return 'Source: ' + spec.label; }

function previewHandbookRefresh() {
  handbookDocument_();
  const sources = readHandbookSources_();
  console.log(JSON.stringify(HANDBOOK_TABLES.map(spec => ({table: spec.label, rows: sources[spec.key].rows.length}))));
}

function refreshHandbookTables() {
  const result = refreshHandbookTables_();
  DocumentApp.getUi().alert('Handbook tables', result.busy ? 'Table refresh is already running.' :
    'Refreshed ' + result.managedTables + ' source tables (' + result.sourceRows + ' populated rows) and formatted ' + result.tables + ' tables.',
  DocumentApp.getUi().ButtonSet.OK);
}

function refreshHandbookTables_() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) return {busy: true};
  try {
    const sources = readHandbookSources_();
    const doc = handbookDocument_();
    // Resolve every source and destination before the first document mutation.
    const targets = HANDBOOK_TABLES.map(spec => {
      const tab = doc.getTab(spec.tabId).asDocumentTab();
      const body = tab.getBody();
      const ranges = tab.getNamedRanges('game_x_table_' + spec.key);
      if (ranges.length > 1) throw new Error('Duplicate handbook anchor: ' + spec.key);
      let anchor = ranges.length ? ranges[0].getRange().getRangeElements()[0].getElement() : null;
      if (anchor && anchor.getType() === DocumentApp.ElementType.TEXT) anchor = anchor.getParent();
      if (anchor && (anchor.getType() !== DocumentApp.ElementType.PARAGRAPH || anchor.getText() !== handbookMarker_(spec))) {
        throw new Error('Changed handbook anchor: ' + spec.key);
      }
      const tables = body.getTables();
      const find = first => tables.filter(table => table.getNumRows() && table.getCell(0, 0).getText().split('\n')[0] === first);
      let old = null;
      if (anchor) {
        const index = body.getChildIndex(anchor) + 1;
        if (index < body.getNumChildren() && body.getChild(index).getType() === DocumentApp.ElementType.TABLE) old = body.getChild(index).asTable();
      } else {
        const matches = find(spec.legacy);
        if (matches.length !== 1) throw new Error('Cannot uniquely locate handbook table: ' + spec.label);
        old = matches[0];
      }
      const retired = (spec.retire || []).flatMap(first => {
        const matches = find(first);
        if (matches.length > 1 || (!anchor && matches.length !== 1)) throw new Error('Cannot uniquely locate former split table: ' + first);
        return matches;
      });
      return {spec, tab, body, anchor, old, retired};
    });
    let sourceRows = 0;
    for (const target of targets) {
      const {spec, tab, body, old, retired} = target;
      const source = sources[spec.key];
      let anchor = target.anchor;
      if (!anchor) {
        anchor = body.insertParagraph(body.getChildIndex(old), handbookMarker_(spec));
        tab.addNamedRange('game_x_table_' + spec.key, tab.newRange().addElement(anchor).build());
      }
      anchor.setHeading(DocumentApp.ParagraphHeading.NORMAL).setAlignment(DocumentApp.HorizontalAlignment.LEFT)
        .setIndentStart(0).setIndentEnd(0).setIndentFirstLine(0).setSpacingBefore(0).setSpacingAfter(2);
      anchor.editAsText().setFontFamily('Calibri').setFontSize(8).setBold(false).setItalic(false).setLinkUrl(source.url);
      // Recreate only registered source-owned tables, so native alignment and import overrides cannot persist.
      // Insert successfully before removing the previous table; non-source prose is never replaced.
      if (source.rows.length) body.insertTable(body.getChildIndex(anchor) + 1, source.rows.map(row => [row.text]));
      if (old) old.removeFromParent();
      retired.forEach(table => table.removeFromParent());
      sourceRows += source.rows.length;
    }
    doc.saveAndClose();
    const result = formatHandbookTablesWithRetry_(HANDBOOK_STYLE.documentId, sources);
    return {...result, managedTables: targets.length, sourceRows};
  } finally {
    lock.releaseLock();
  }
}

function buildSourceTypographyRequests_(doc, sources) {
  const requests = [];
  const byMarker = Object.fromEntries(HANDBOOK_TABLES.map(spec => [handbookMarker_(spec), spec]));
  const matched = new Set();
  const rgb = hex => ({red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255});
  for (const tab of flattenTabs_(doc.tabs || [])) {
    const tabId = (tab.tabProperties && tab.tabProperties.tabId) || tab.tabId;
    const body = (tab.documentTab && tab.documentTab.body) || tab.body;
    const content = (body && body.content) || [];
    for (let i = 0; i < content.length; i++) {
      const paragraph = content[i].paragraph;
      if (!paragraph) continue;
      const marker = (paragraph.elements || []).map(e => e.textRun ? e.textRun.content : '').join('').trimEnd();
      const spec = byMarker[marker];
      if (!spec || spec.tabId !== tabId) continue;
      if (matched.has(spec.key)) throw new Error('Duplicate handbook source marker: ' + spec.key);
      matched.add(spec.key);
      const rows = sources[spec.key].rows;
      if (!rows.length) continue;
      const table = content[i + 1] && content[i + 1].table;
      if (!table || table.columns !== 1 || table.tableRows.length !== rows.length) throw new Error('Handbook table changed during refresh: ' + spec.label);
      table.tableRows.forEach((row, ri) => {
        const cell = row.tableCells[0];
        const elements = cell.content || [];
        const text = elements.map(p => p.paragraph ? p.paragraph.elements.map(e => e.textRun ? e.textRun.content : '').join('') : '').join('');
        // DocumentApp imports carriage returns as soft line breaks, preserving UTF-16 offsets.
        if (text !== rows[ri].text.replace(/\r/g, '\u000b') + '\n') throw new Error('Handbook cell changed during refresh: ' + spec.label + ', row ' + (ri + 1));
        const start = elements[0].startIndex;
        const range = {tabId, startIndex: start, endIndex: start + text.length};
        requests.push({updateParagraphStyle: {range, paragraphStyle: {
          namedStyleType: 'NORMAL_TEXT', alignment: 'START', lineSpacing: 100,
          spaceAbove: {magnitude: 0, unit: 'PT'}, spaceBelow: {magnitude: 0, unit: 'PT'},
          indentStart: {magnitude: 0, unit: 'PT'}, indentEnd: {magnitude: 0, unit: 'PT'}, indentFirstLine: {magnitude: 0, unit: 'PT'},
          keepWithNext: false, avoidWidowAndOrphan: false,
        }, fields: 'namedStyleType,alignment,lineSpacing,spaceAbove,spaceBelow,indentStart,indentEnd,indentFirstLine,keepWithNext,avoidWidowAndOrphan'}});
        requests.push({updateTextStyle: {range, textStyle: {bold: false, italic: false, underline: false, strikethrough: false,
          fontSize: {magnitude: 10, unit: 'PT'}, weightedFontFamily: {fontFamily: 'Calibri'},
          foregroundColor: {color: {rgbColor: rgb('#000000')}}, baselineOffset: 'NONE'},
        fields: 'bold,italic,underline,strikethrough,fontSize,weightedFontFamily,foregroundColor,backgroundColor,baselineOffset,link'}});
        for (const run of rows[ri].runs) {
          if (run.end <= run.start) continue;
          const style = run.style;
          const textStyle = {bold: style.bold, italic: style.italic, underline: style.underline, strikethrough: style.strikethrough,
            fontSize: {magnitude: style.fontSize, unit: 'PT'}, weightedFontFamily: {fontFamily: style.fontFamily},
            foregroundColor: {color: {rgbColor: rgb(style.color)}}};
          if (style.link) textStyle.link = {url: style.link};
          requests.push({updateTextStyle: {range: {tabId, startIndex: start + run.start, endIndex: start + run.end},
            textStyle, fields: Object.keys(textStyle).join(',')}});
        }
      });
    }
  }
  if (matched.size !== HANDBOOK_TABLES.length) throw new Error('A managed handbook anchor is missing. No typography changes applied.');
  return requests;
}
