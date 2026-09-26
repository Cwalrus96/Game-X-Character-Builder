import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
  NATURAL_WEAPON_TAG_PATTERN, buildWeaponDisplayFormulas, weaponCatalogueFilterFormula,
  weaponCatalogueFormula, weaponDisplayNativeFixtures, weaponRankExcerptFormula,
} from '../scripts/display/weapon-display-formulas.mjs';
import {DISPLAY_COLUMNS, projectDisplayTable} from '../scripts/display/schema-display-adapters.mjs';

test('the handbook filter recognizes the Natural tag without hiding similar names or other weapon tags', () => {
  const naturalTag = new RegExp(NATURAL_WEAPON_TAG_PATTERN, 'i');
  for (const tags of ['Natural', 'Natural; Sharp', 'Melee, Natural, Heavy', 'Sharp; natural ', 'Ranged 6\nNatural']) {
    assert.equal(naturalTag.test(tags), true, tags);
  }
  for (const tags of ['', 'Melee; Heavy', 'Unnatural', 'Naturalist', 'Natural Weapon', 'Supernatural']) {
    assert.equal(naturalTag.test(tags), false, tags);
  }
  assert.ok(weaponCatalogueFilterFormula().includes(`"(?i)${NATURAL_WEAPON_TAG_PATTERN}"`));
  const headers = DISPLAY_COLUMNS.WeaponBases;
  const records = [{weaponKey: 'claw', name: 'Claw', minRank: 1, tags: 'Natural; Sharp'},
    {weaponKey: 'club', name: 'Club', minRank: 1, tags: 'Blunt'}];
  const raw = [headers, ...records.map(record => headers.map(header => record[header] ?? ''))];
  const before = structuredClone(raw);
  assert.equal(projectDisplayTable('WeaponBases', raw).length, 3, 'full import remains available for Trait and Technique references');
  assert.deepEqual(raw, before);
});

test('catalogue, all rank excerpts and reference coverage share the same Natural filter', () => {
  const {cells} = buildWeaponDisplayFormulas();
  const filteredCells = ['WeaponBases_Display!A1', ...['C', 'E', 'G', 'I', 'K', 'M'].map(column => `WeaponBases_Display!${column}1`), 'Function_Tests!B29', 'Function_Tests!C29'];
  for (const address of filteredCells) assert.ok(cells[address].includes(weaponCatalogueFilterFormula()), address);
  assert.equal(cells['WeaponBases_Display!A1'], weaponCatalogueFormula());
  for (const [rank, column] of ['C', 'E', 'G', 'I', 'K', 'M'].entries()) {
    assert.equal(cells[`WeaponBases_Display!${column}1`], weaponRankExcerptFormula(rank));
    assert.match(cells[`WeaponBases_Display!${column}1`], /allkeys,FILTER\(keys,populated\),allranks,FILTER\(ranks,populated\)/);
  }
  assert.ok(Object.keys(cells).every(address => /^(WeaponBases_Display|Function_Tests)!/.test(address)), 'does not filter Trait or Technique catalogues');
  assert.match(cells['Function_Tests!C13'], /DATA_IMPORT_SHEET\("WeaponBases"\)/);
  assert.match(cells['Function_Tests!C13'], /XMATCH\("weaponKey",INDEX\(source,1,0\),0\)/);
  assert.doesNotMatch(cells['Function_Tests!C13'], /Natural|WeaponBases_Display|\b31\b|\b39\b/, 'expected import count includes all canonical keys and grows with the source');
  const native = weaponDisplayNativeFixtures();
  assert.equal(native[0].expected, 'club,stick,unnatural');
  assert.equal(native[1].expected, 'Club,Unnatural Blade');
  assert.ok(native[1].formula.includes(weaponRankExcerptFormula(1, {
    source: '{"weaponKey","minRank","tags";"claw",0,"Natural; Sharp";"club",1,"Blunt";"web",1,"Web, natural";"stick",0,"";"unnatural",1,"Unnatural"}',
    cards: '{"Club";"Stick";"Unnatural Blade"}',
  }).slice(1)), 'native rank fixture executes the same production formula');
});

test('generated Weapons formulas stay balanced and the operational manifest contains each exact update', () => {
  const manifest = JSON.parse(readFileSync(new URL('../scripts/display/authoring-formulas.json', import.meta.url), 'utf8'));
  const patch = buildWeaponDisplayFormulas();
  for (const [address, formula] of Object.entries(patch.cells)) {
    assert.equal(manifest.cells[address], formula, address);
    assert.ok(formula.length < 50000);
    const tokens = formula.match(/"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[^\s]/g);
    const stack = [];
    for (let position = 0; position < tokens.length; position++) {
      const token = tokens[position];
      if (token === '(' || token === '{') stack.push({delimiter: token, name: tokens[position - 1], arguments: 1});
      else if (token === ',' && stack.length) stack.at(-1).arguments++;
      else if (token === ')' || token === '}') {
        const frame = stack.pop();
        assert.equal(frame?.delimiter, token === ')' ? '(' : '{', address);
        if (frame.name === 'LET') assert.equal(frame.arguments % 2, 1, `${address}: LET argument count`);
        if (frame.name === 'IF') assert.ok([2, 3].includes(frame.arguments), `${address}: IF argument count`);
      }
    }
    assert.equal(stack.length, 0, address);
  }
  for (const [address, value] of Object.entries(patch.values)) assert.equal(manifest.values[address], value, address);
});
