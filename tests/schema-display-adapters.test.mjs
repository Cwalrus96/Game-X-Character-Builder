import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISPLAY_COLUMNS, OPTIONAL_DISPLAY_COLUMNS, DISPLAY_NAMED_FUNCTIONS,
  buildSchemaDisplayAdapters, diagnoseDisplayIdentities, displayProjectionFormula,
  featureDescriptionFormula, projectDisplayTable, schemaDisplayNativeFixtures, traitCatalogueFormula,
} from '../scripts/display/schema-display-adapters.mjs';

function sourceTable(sheet, records, omit = []) {
  const headers = DISPLAY_COLUMNS[sheet].filter(name => !omit.includes(name));
  return [headers, ...records.map(record => headers.map(name => record[name] ?? ''))];
}

function recordAt(table, index = 1) {
  return Object.fromEntries(table[0].map((name, column) => [name, table[index][column]]));
}

test('removed optional source columns keep compatibility positions and equally sized blank values', () => {
  for (const name of ['ClassFeatures', 'OriginFeatures', 'Feats', 'WeaponBases', 'WeaponEnhancements']) {
    const optional = OPTIONAL_DISPLAY_COLUMNS[name];
    const headers = DISPLAY_COLUMNS[name].filter(header => !optional.includes(header)).reverse();
    const raw = [headers, headers.map(header => header === 'parentKey' ? 'stable-parent' : `one:${header}`), headers.map(header => `two:${header}`)];
    const projected = projectDisplayTable(name, raw);
    assert.deepEqual(projected[0], DISPLAY_COLUMNS[name]);
    assert.equal(projected.length, 3);
    assert.ok(projected.every(row => row.length === projected[0].length));
    for (const field of optional) assert.equal(recordAt(projected)[field], '');
    if (headers.includes('parentKey')) assert.equal(recordAt(projected).parentKey, 'stable-parent');
  }
});

test('class display retains the three authoritative skill columns when levelUp disappears', () => {
  const source = sourceTable('Classes', [{classKey: 'ninja', name: 'Ninja', combatTechniqueSkill: 'Ninjutsu', combatSkills: 'Ninjutsu:Fast; Mental Defense:Medium', utilitySkillOptions: 'Athletics; Medicine'}], ['levelUp']);
  const displayed = recordAt(projectDisplayTable('Classes', source));
  assert.equal(displayed.combatTechniqueSkill, 'Ninjutsu');
  assert.equal(displayed.combatSkills, 'Ninjutsu:Fast; Mental Defense:Medium');
  assert.equal(displayed.utilitySkillOptions, 'Athletics; Medicine');
  assert.equal(displayed.levelUp, '');
  assert.equal(DISPLAY_COLUMNS.Classes.indexOf('levelUp'), 10);
  assert.doesNotMatch(displayProjectionFormula('Classes'), /ClassSkills/);
});

test('parent identity survives colliding names and retired grant summaries cannot mask formal grants', () => {
  const source = sourceTable('Feats', [
    {category: 'a', featKey: 'first', name: 'Same name', grants: 'skill | name=Arcana | rank=1', grantText: 'Gain Arcana Rank 1.'},
    {category: 'b', featKey: 'second', name: 'Same name'},
    {category: 'a', featKey: 'child', name: 'Option', parentKey: 'first', grants: 'skill | name=Arcana | rank=1'},
  ], ['grantNotes']);
  const projected = projectDisplayTable('Feats', source);
  assert.equal(recordAt(projected, 1).grants, 'skill | name=Arcana | rank=1');
  assert.equal(recordAt(projected, 1).grantText, '');
  assert.equal(recordAt(projected, 3).grants, 'skill | name=Arcana | rank=1');
  assert.equal(recordAt(projected, 3).parentKey, 'first');
  assert.deepEqual(diagnoseDisplayIdentities(source, {sheetName: 'Feats', keyColumn: 'featKey'}), []);
});

test('optional metadata never masks a missing required identity header', () => {
  const source = sourceTable('Feats', [{name: 'Fixture'}], ['featKey', 'grantNotes']);
  assert.throws(() => projectDisplayTable('Feats', source), /missing required header featKey/);
  assert.throws(() => diagnoseDisplayIdentities(source, {sheetName: 'Feats', keyColumn: 'featKey'}), /identity headers are missing/);
});

test('incomplete identities are reported by original source row without altering placeholders', () => {
  const source = sourceTable('Feats', [
    {category: 'metamorph', featKey: 'mimic', name: 'Mimic Path Initiate'},
    {category: 'metamorph', featKey: 'chimaera', name: 'Mimic Path Initiate'},
    {category: 'metamorph', rowType: 'FEATURE', featType: 'archetype', archetypeKey: 'chimaera'},
    {},
    {category: 'metamorph', rowType: 'FEATURE', featType: 'archetype', archetypeKey: 'chimaera'},
  ]);
  const before = structuredClone(source);
  const diagnostics = diagnoseDisplayIdentities(source, {sheetName: 'Feats', keyColumn: 'featKey'});
  assert.deepEqual(diagnostics.map(({row, code, message}) => ({row, code, message})), [
    {row: 4, code: 'incomplete-identity', message: 'Missing featKey; Missing name'},
    {row: 6, code: 'incomplete-identity', message: 'Missing featKey; Missing name'},
  ]);
  assert.deepEqual(source, before);
});

test('duplicate stable keys and unresolved parents remain actionable diagnostics', () => {
  const source = sourceTable('ClassFeatures', [
    {featureKey: 'collision', name: 'One'},
    {featureKey: 'collision', name: 'Two'},
    {featureKey: 'child', name: 'Child', parentKey: 'missing'},
  ]);
  assert.deepEqual(diagnoseDisplayIdentities(source, {sheetName: 'ClassFeatures', keyColumn: 'featureKey'}).map(({row, code}) => ({row, code})), [
    {row: 2, code: 'duplicate-key'}, {row: 3, code: 'duplicate-key'}, {row: 4, code: 'missing-parent'},
  ]);
});

test('retired WeaponProfiles no longer imports a deleted source tab', () => {
  const formula = displayProjectionFormula('WeaponProfiles');
  assert.doesNotMatch(formula, /IMPORT|INDIRECT/);
  assert.deepEqual(projectDisplayTable('WeaponProfiles', []), [DISPLAY_COLUMNS.WeaponProfiles]);
});

test('native renderers resolve blocks and child membership by stable key', () => {
  const {cells, namedFunctions} = buildSchemaDisplayAdapters();
  for (const [cell, formula] of Object.entries(cells).filter(([cell]) => /^(Archetypes|Feats)_Display!/.test(cell))) {
    assert.match(formula, /FEAT_BLOCK\(key\)/, cell);
    assert.doesNotMatch(formula, /FEAT_MATRIX|blockNames|XLOOKUP\(name,/, cell);
  }
  assert.match(namedFunctions.FEAT_OPTION_GROUP_BLOCK.formula, /"parentKey"\)=feat_key/);
  assert.match(namedFunctions.CLASS_OPTION_GROUP_BLOCKS.formula, /MAP\(FILTER\(DATA_GET_COLUMN_BY_NAME\(cf,"featureKey"\)/);
  assert.match(namedFunctions.OPTION_GROUP_BLOCK.formula, /DATA_GET_FIELD_BY_KEY\("ClassFeatures","featureKey",group_name,"name"\)/);
  assert.match(cells['_ArchetypeFeats!A1'], /fk<>"",names<>""/);
  assert.match(cells['Function_Tests!F2'], /ROW\('_Feats'!A2:A1000\)/);
  assert.equal(cells['WeaponBases!A1'], displayProjectionFormula('WeaponBases'));
});

test('shared helpers distinguish an optional absent field from an invalid identity', () => {
  assert.match(DISPLAY_NAMED_FUNCTIONS.DATA_GET_COLUMN_BY_NAME.formula, /MAKEARRAY\(ROWS\(table\),1/);
  assert.match(DISPLAY_NAMED_FUNCTIONS.DATA_GET_FIELD_BY_KEY.formula, /OR\(key_value="",matches<>1\),NA\(\)/);
  assert.deepEqual(DISPLAY_NAMED_FUNCTIONS.OPTION_GROUP_BLOCK.argumentPlaceholders, ['class_key', 'lvl', 'group_name', 'group_desc', 'group_grants']);
});

test('Class and Origin projections preserve feature rows when optional prerequisites are absent', () => {
  for (const sheet of ['ClassFeatures', 'OriginFeatures']) {
    const source = sourceTable(sheet, [
      {featureKey: 'first', name: 'Repeated name', description: 'First benefit'},
      {featureKey: 'second', name: 'Repeated name', description: 'Second benefit'},
    ], ['prerequisites']);
    const projected = projectDisplayTable(sheet, source);
    assert.equal(recordAt(projected, 1).featureKey, 'first');
    assert.equal(recordAt(projected, 2).featureKey, 'second');
    assert.equal(recordAt(projected, 1).prerequisites, '');
    assert.equal(recordAt(projected, 2).prerequisites, '');
    assert.equal(recordAt(projected, 2).description, 'Second benefit');
    assert.match(displayProjectionFormula(sheet), /optional\("prerequisites"\)/);
  }
});

test('feature and option helpers add the same prerequisite section once using each stable key', () => {
  const description = featureDescriptionFormula('get("prerequisites")', 'get("description")');
  for (const helper of ['CLASS_FEATURE_BLOCKS', 'ORIGIN_FEATURE_BLOCKS', 'OPTION_LINE']) {
    const formula = DISPLAY_NAMED_FUNCTIONS[helper].formula;
    assert.ok(formula.includes(description), helper);
    assert.equal(formula.match(/PREREQ_BLOCK\(/g)?.length, 1, helper);
    assert.match(formula, /DATA_GET_FIELD_BY_KEY/);
  }
  const group = DISPLAY_NAMED_FUNCTIONS.OPTION_GROUP_BLOCK.formula;
  assert.equal(group.match(/PREREQ_BLOCK\(/g)?.length, 1);
  assert.match(group, /DATA_GET_FIELD_BY_KEY\("ClassFeatures","featureKey",group_name,"prerequisites"\)/);
  assert.match(group, /MAP\(FILTER\(DATA_GET_COLUMN_BY_NAME\(cf,"featureKey"\),full_filter\),LAMBDA\(option_key,OPTION_LINE\(cf,"featureKey",option_key\)\)\)/);
  assert.doesNotMatch(group, /OPTION_LINE_FROM_FIELDS/);
});

test('native prerequisite fixtures verify OR wording, multiple clauses, keyed options, and missing headers', () => {
  const fixtures = schemaDisplayNativeFixtures();
  assert.equal(fixtures.length, 8);
  assert.equal(fixtures[3].expected, '**Fixture**\nPrerequisites:\nSoulbound Weapon with the "Ranged OR Thrown" tag\n\nBenefit');
  assert.equal(fixtures[4].expected.match(/Prerequisites:/g).length, 1);
  assert.equal(fixtures[4].expected.match(/"Reach"/g).length, 1);
  assert.equal(fixtures[4].expected.match(/"Ranged OR Thrown"/g).length, 1);
  assert.match(fixtures[5].formula, /OPTION_LINE\("ClassFeatures","featureKey","sentinel-style"\)/);
  assert.match(fixtures[6].formula, /OPTION_LINE\("ClassFeatures","featureKey","skirmisher-style"\)/);
  assert.match(fixtures[7].formula, /actual=expected/);
  const {cells, values} = buildSchemaDisplayAdapters();
  for (const [index, fixture] of fixtures.entries()) {
    assert.equal(cells[`Function_Tests!L${index + 18}`], fixture.formula);
    assert.equal(values[`Function_Tests!M${index + 18}`], fixture.expected);
  }
});

test('Trait renderer derives prerequisites, permits absent optional fields, and preserves authored body ownership', () => {
  const formula = traitCatalogueFormula();
  assert.match(formula, /optional\("rank"\)/);
  assert.match(formula, /optional\("techniqueKeys"\)/);
  assert.match(formula, /Unresolved Trait key/);
  assert.match(formula, /rankmissing,LEN\(TO_TEXT\(rank\)\)=0/);
  assert.doesNotMatch(formula, /optional\("grants"\)|"Grants:"/);
  const {cells} = buildSchemaDisplayAdapters();
  for (const row of [41, 42, 43]) assert.match(cells[`Function_Tests!B${row}`], /optional\("rank"\)/);
});

function assertBalanced(formula, label) {
  const stack = [];
  let quoted = false;
  for (let i = 0; i < formula.length; i++) {
    const character = formula[i];
    if (character === '"') {
      if (quoted && formula[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted) {
      if (character === '(' || character === '{') stack.push(character);
      if (character === ')' || character === '}') assert.equal(stack.pop(), character === ')' ? '(' : '{', `${label}: unmatched closing delimiter at ${i}`);
    }
  }
  assert.equal(quoted, false, `${label}: unterminated string`);
  assert.deepEqual(stack, [], `${label}: unclosed delimiters`);
  assert.ok(formula.length < 50000, `${label}: exceeds native formula cell size`);
}

test('every generated native formula is syntactically balanced and fits one Sheets cell', () => {
  const {cells, namedFunctions} = buildSchemaDisplayAdapters();
  for (const [label, formula] of Object.entries(cells)) assertBalanced(formula, label);
  for (const [label, {formula}] of Object.entries(namedFunctions)) assertBalanced(formula, label);
});
