import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNIQUE_COMPATIBILITY_HEADERS,
  techniqueCompatibilityFormula,
  techniqueBlocksFormula,
  techniqueNativeFixtures,
  techniqueDecisionNativeFixtures,
  techniqueNamedFunctionPatches,
  basicAttackTextFormula,
  prerequisiteTextFormula,
} from '../scripts/display/technique-display-formulas.mjs';

// This checks the generator's syntax, not spreadsheet calculation. The exported
// cases must also run in native Sheets before a display migration is accepted.
function validateFormula(formula, label) {
  assert.ok(formula.startsWith('='), label);
  assert.ok(formula.length < 50_000, `${label}: Sheets cell length`);
  const tokens = formula.match(/"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[^\s]/g);
  const stack = [];
  for (let position = 0; position < tokens.length; position += 1) {
    const token = tokens[position];
    if (token === '(' || token === '{') {
      stack.push({ delimiter: token, type: tokens[position - 1], arguments: 1 });
    } else if (token === ',') {
      if (stack.length) stack.at(-1).arguments += 1;
    } else if (token === ')' || token === '}') {
      const current = stack.pop();
      assert.equal(current?.delimiter, token === ')' ? '(' : '{', `${label}: balanced delimiters`);
      if (current.type === 'LET') assert.equal(current.arguments % 2, 1, `${label}: odd LET argument count`);
      if (current.type === 'IF') assert.ok([2, 3].includes(current.arguments), `${label}: IF has 2–3 arguments, got ${current.arguments}`);
      if (current.type === 'IFNA') assert.equal(current.arguments, 2, `${label}: IFNA has two arguments`);
    }
  }
  assert.equal(stack.length, 0, `${label}: all delimiters closed`);
  assert.doesNotMatch(formula, /\bDROP\(/, `${label}: uses Google Sheets functions`);
}

test('Technique display generation produces valid formula structure including successful-record branches', () => {
  const formulas = {
    adapter: techniqueCompatibilityFormula(),
    blocks: techniqueBlocksFormula(),
    ...techniqueNamedFunctionPatches(),
    ...Object.fromEntries(techniqueNativeFixtures().map(fixture => [fixture.name, fixture.formula])),
    ...Object.fromEntries(techniqueDecisionNativeFixtures().map(fixture => [fixture.name, fixture.formula])),
  };
  for (const [name, formula] of Object.entries(formulas)) validateFormula(formula, name);
});

test('Technique adapter keeps downstream bindings while optional authoring fields are not required', () => {
  assert.equal(TECHNIQUE_COMPATIBILITY_HEADERS[28], 'techniqueKey');
  assert.equal(TECHNIQUE_COMPATIBILITY_HEADERS[26], 'rankNotes');
  assert.equal(TECHNIQUE_COMPATIBILITY_HEADERS[35], 'associatedSkill');
  assert.equal(TECHNIQUE_COMPATIBILITY_HEADERS[36], 'basicAttack');
  const formula = techniqueCompatibilityFormula();
  assert.match(formula, /MAKEARRAY\(ROWS\(body\),1,LAMBDA\(rowindex,columnindex,""\)\)/);
  assert.match(formula, /VSTACK\("skill",column\("selection"\)\)/);
  assert.match(formula, /VSTACK\("selectionMode",blank\)/);
  assert.match(formula, /VSTACK\("pumpDamageByRank",column\("pumpingByRank"\)\)/);
  assert.match(formula, /VSTACK\("basicAttack",column\("basicAttack"\)\)/);
  for (const header of ['notes', 'damageByRank', 'sourceNote', 'prerequisiteText', 'skillKeys', 'tagKeys']) {
    assert.ok(formula.includes(`VSTACK("${header}",blank)`), `${header} is an empty compatibility slot`);
  }
});

test('basic-attack references preserve key identity and modifiers without declaring a second roll', () => {
  const formula = basicAttackTextFormula('reference');
  assert.match(formula, /XMATCH\("techniqueKey",referencehead,0\)/);
  assert.match(formula, /field\("techniqueKey"\)/);
  assert.match(formula, /Unresolved basic attack key/);
  assert.match(formula, /field\("attribute"\)/);
  assert.match(formula, /field\("defense"\)/);
  assert.match(formula, /Additional basic-attack requirement/);
  const fixtures = techniqueDecisionNativeFixtures();
  const wrapper = fixtures.find(fixture => fixture.name.startsWith('Wrapper'));
  assert.ok(wrapper.expected.includes('Basic attack: Weapon basic attack (vs Spiritual Defense)'));
  assert.ok(!wrapper.expected.includes('(Martial Arts)'));
  assert.ok(fixtures.some(fixture => fixture.expected === '[Unresolved basic attack key: missing]'));
  assert.ok(fixtures.some(fixture => fixture.expected.includes('attribute: Agility; vs Spiritual Defense')));
  assert.ok(fixtures.some(fixture => fixture.expected.includes('1 Action or Free Reaction + 3 Energy')));
});

test('typed prerequisite alternatives remain distinct from alternatives inside tag values', () => {
  const formula = prerequisiteTextFormula('requirement');
  assert.ok(formula.includes('(?i)\\s+OR\\s+([a-z-]+\\s*\\|)'));
  assert.match(formula, /CHAR\(9830\)/);
  assert.doesNotMatch(formula, /CHAR\(29\)/, 'Sheets strips the ASCII control separator to an empty SPLIT delimiter');
  assert.match(formula, /"skill","name\|minRank"/);
  const fixtures = techniqueDecisionNativeFixtures();
  assert.ok(fixtures.some(fixture => fixture.expected === 'Wielding Melee weapon or Martial Arts Rank 1+'));
  assert.ok(fixtures.some(fixture => fixture.expected === 'Heavy OR Two-handed weapon'));
});

test('Technique main renderer and compatibility helpers keep stable identity through rendering', () => {
  const formula = techniqueBlocksFormula();
  assert.doesNotMatch(formula, /\bTECHNIQUE_[A-Z_]+\(/, 'pool has no legacy name-based helper dependency');
  assert.match(formula, /record,CHOOSEROWS\(source,XMATCH\(key,sourcekeys,0\)\)/);
  assert.match(formula, /IF\(matches<>1,"\[Unresolved technique key: "/);
  const named = techniqueNamedFunctionPatches();
  assert.match(named.TECHNIQUE_GET_FIELD, /XMATCH\("techniqueKey",head,0\)/);
  assert.doesNotMatch(named.TECHNIQUE_GET_FIELD, /"techniqueName"/);
  assert.match(named.TECHNIQUE_BLOCK, /XLOOKUP\(name,'_TechniqueBlocks'!A1:A1000,'_TechniqueBlocks'!C1:C1000\)/);
  assert.match(named.TECHNIQUE_BLOCKS_BY_SKILL, /DATA_GET_COLUMN_BY_NAME\("Techniques","techniqueKey"\)/);
  assert.doesNotMatch(named.TECHNIQUE_BLOCKS_BY_SKILL, /"techniqueName"/);
  for (const helper of ['TECHNIQUE_COST_LINE', 'TECHNIQUE_METADATA_BLOCK', 'TECHNIQUE_CANTRIP_BLOCK']) {
    assert.match(named[helper], /block,TECHNIQUE_BLOCK\(name\)/, `${helper} shares canonical rendering`);
    assert.match(named[helper], /\[Unresolved technique key:/, `${helper} preserves reference diagnostics`);
    assert.ok(named[helper].length < 700, `${helper} remains a compact compatibility wrapper`);
  }
});

test('Native fixtures cover key failures, generic effects, missing mechanics and preserved optional mechanics', () => {
  const fixtures = techniqueNativeFixtures();
  assert.equal(new Set(fixtures.map(fixture => fixture.name)).size, fixtures.length);
  assert.ok(fixtures.some(fixture => fixture.name.includes('duplicate display names')));
  assert.ok(fixtures.some(fixture => fixture.expected === '[Unresolved technique key: duplicate]'));
  assert.ok(fixtures.some(fixture => fixture.expected.includes?.('rank 4; +1 ward')));
  assert.ok(fixtures.some(fixture => fixture.expected.includes?.('+1 healing and +2 wards')));
  assert.ok(fixtures.some(fixture => fixture.expected.includes?.('Character has Wing tag; Wing weapon')));
  assert.ok(fixtures.some(fixture => fixture.expected.includes?.('Critical Failure: Lose your grip')));
  assert.ok(fixtures.some(fixture => fixture.expected.includes?.('Actions: Unassigned + 0 Energy')));
  assert.ok(fixtures.some(fixture => fixture.expected === 'Beam'));
  assert.ok(fixtures.some(fixture => fixture.expected === 'Wielding 2 Melee weapons one in each hand'));
  const newlineCase = fixtures.find(fixture => fixture.name.includes('character tag'));
  assert.match(newlineCase.formula, /"tag \| tag=Wing"&CHAR\(10\)&"weapon \| tag=Wing"/);
});
