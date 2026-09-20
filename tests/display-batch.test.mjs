import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/display/DisplayBatch.gs', import.meta.url), 'utf8');
function harness(entries, failure) {
  const events = [];
  const sheets = entries.map(([name, values, hidden = false]) => makeSheet(name, values, hidden));
  let active = sheets[0];
  let nextId = 100;
  function makeSheet(name, values, hidden) {
    const sheet = {
      id: name, values, hidden,
      getName: () => name, getFrozenRows: () => 0, getFrozenColumns: () => 0,
      isSheetHidden: () => sheet.hidden,
      hideSheet() { sheet.hidden = true; },
      getDataRange: () => range(1, 1, values.length, Math.max(...values.map(r => r.length))),
      getRange: (row, col, rows, cols) => range(row, col, rows, cols),
      clear() { events.push(['clear', name]); sheet.values = []; if (name === failure) throw new Error('Write rejected'); },
      setFrozenRows() {}, setFrozenColumns() {}, autoResizeRows() {},
    };
    function range(row, col, rows, cols) {
      return {
        getRow: () => row, getColumn: () => col, getDisplayValues: () => values,
        copyFormatToRange() {},
        setRichTextValues(grid) { sheet.values = grid; return this; }, setWrap() { return this; },
      };
    }
    return sheet;
  }
  const ss = {
    getSheets: () => sheets, getActiveSheet: () => active,
    setActiveSheet(sheet) { active = sheet; },
    insertSheet(name) { const sheet = makeSheet(name, [], false); sheet.id = nextId++; sheets.push(sheet); active = sheet; return sheet; },
    toast() {},
  };
  const ui = {ButtonSet: {OK: 'OK'}, alert(...args) { events.push(['alert', ...args]); }};
  const api = runInNewContext(source + '\n({generateAllFormattedOutputTabs, prepareDisplayFormatting_});', {
    SpreadsheetApp: {getActiveSpreadsheet: () => ss, getUi: () => ui, flush() {}},
    LockService: {getDocumentLock: () => ({tryLock: () => true, releaseLock() { events.push(['unlock']); }})},
    FORMAT_CONFIG: {rangeA1: null}, buildMarkdownRichTextGrid_: values => values,
    ensureSheetSize_() {}, copyColumnWidths_() {}, console: {log() {}, error() {}},
  });
  return {api, events, ss, sheets};
}

test('bulk conversion includes hidden/case-insensitive sources, preserves IDs and excerpt columns, and restores the active tab', () => {
  const techniqueRow = Array.from({length: 14}, (_, column) => column === 0 ? 'Main' : column === 13 ? 'Weapon attack excerpt' : '');
  const techniqueBlock = '**Rifle Basic Attack ( Rank 1)**\n*Access: Ranged Weapons*\nDamage: Canonical damage text\nCritical Success: Canonical rider';
  const weaponCard = '**Rifle (Rank 1)**\n*Tags: Ranged*\n\n**Weapon techniques:**\n\n' + techniqueBlock;
  const weaponRow = Array.from({length: 13}, (_, column) => column === 0 || column === 4 ? weaponCard : column % 2 === 0 ? `Rank ${column / 2 - 1} excerpt` : '');
  const traitCards = [
    ['**Amphibious - Rank 1**\n**Prerequisites:** None\n**Tags:** Movement\n\nYou can breathe air and water.\nRank 3+: You gain the Dive technique.'],
    ['**Flight - Rank ?**\n**Prerequisites:** Wings\n**Tags:** —\n\nYou can fly.\n*Possible duplicate: flight*\n*Mech source variant; rank awaits review.*\n*Incomplete Trait*'],
  ];
  const h = harness([
    ['README', [['Read me']]],
    ['Techniques_Display', [techniqueRow, Array(14).fill('')]],
    ['Techniques_Formatted', [['Old']]],
    ['Hidden_display', [['Hidden content']], true],
    ['WeaponBases_Display', [weaponRow]],
    ['_TechniqueBlocks', [['rifle-basic-attack', 'rifle', techniqueBlock]], true],
    ['Traits', [['traitKey', 'name'], ['amphibious', 'Amphibious']], true],
    ['Traits_Display', [...traitCards, ['']]],
    ['Traits_Formatted', [['Old Trait']]],
  ]);
  const original = h.ss.getActiveSheet();
  const existing = h.sheets[2];
  h.api.generateAllFormattedOutputTabs();
  assert.equal(h.sheets[2], existing);
  assert.deepEqual(JSON.parse(JSON.stringify(existing.values)), [techniqueRow]);
  const weaponOutput = h.sheets.find(s => s.getName() === 'WeaponBases_Formatted');
  assert.deepEqual(JSON.parse(JSON.stringify(weaponOutput.values)), [weaponRow]);
  const traitOutput = h.sheets.find(s => s.getName() === 'Traits_Formatted');
  assert.equal(traitOutput.id, 'Traits_Formatted');
  assert.deepEqual(JSON.parse(JSON.stringify(traitOutput.values)), traitCards);
  assert.equal(h.sheets.some(s => s.getName() === 'Traits_Formatted_Formatted'), false);
  assert.equal(h.sheets.some(s => s.getName() === '_TechniqueBlocks_Formatted'), false);
  assert.equal(h.sheets.find(s => s.getName() === 'Hidden_Formatted').hidden, true);
  assert.equal(h.ss.getActiveSheet(), original);
  h.api.generateAllFormattedOutputTabs();
  assert.equal(h.sheets.filter(s => /_formatted$/i.test(s.getName())).length, 4);
  assert.equal(h.sheets.find(s => s.getName() === 'WeaponBases_Formatted'), weaponOutput);
  assert.equal(h.sheets.find(s => s.getName() === 'Traits_Formatted'), traitOutput);
  assert.equal(h.events.filter(e => e[0] === 'unlock').length, 2);
});

test('a formula error in any source stops the whole run before clearing an output', () => {
  for (const [name, error] of [['Other_Display', '#REF!'], ['Traits_Display', '#N/A']]) {
    const h = harness([['Techniques_Display', [['Good']]], ['Techniques_Formatted', [['Keep']]], [name, [[error]]]]);
    h.api.generateAllFormattedOutputTabs();
    assert.equal(h.events.filter(e => e[0] === 'clear').length, 0);
    assert.equal(h.sheets.length, 3);
    assert.equal(h.sheets[1].values[0][0], 'Keep');
    const message = h.events.find(e => e[0] === 'alert')[2];
    assert.equal(message.includes(name), true);
    assert.equal(message.includes(error), true);
    assert.equal(h.events.some(e => e[0] === 'unlock'), true);
  }
});

test('a write failure reports the incomplete destination and releases the lock', () => {
  const h = harness([['First_Display', [['Good']]], ['First_Formatted', [['Keep']]]], 'First_Formatted');
  h.api.generateAllFormattedOutputTabs();
  const message = h.events.find(e => e[0] === 'alert')[2];
  assert.match(message, /First_Formatted; its update may be incomplete/);
  assert.doesNotMatch(message, /No formatted tabs were changed/);
  assert.equal(h.events.some(e => e[0] === 'unlock'), true);
});
