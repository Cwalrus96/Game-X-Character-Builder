import test from 'node:test';
import assert from 'node:assert/strict';
import {GRANT_NAMED_FUNCTIONS, GRANT_NATIVE_FIXTURES, grantBlockFormula} from '../scripts/display/grant-display-formulas.mjs';

test('grant display formulas have balanced syntax and resolve referenced entities by key', () => {
  for (const [name, {formula}] of Object.entries(GRANT_NAMED_FUNCTIONS)) {
    const tokens=formula.match(/"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_]*|[^\s]/g);
    const stack=[];
    for (let i=0;i<tokens.length;i++) {
      const token=tokens[i];
      if(token==='(') stack.push({name:tokens[i-1],args:1});
      else if(token===','&&stack.length) stack.at(-1).args++;
      else if(token===')') {
        const frame=stack.pop(); assert.ok(frame, name);
        if(frame.name==='LET') assert.equal(frame.args%2,1,`${name}: LET arguments`);
        if(frame.name==='IF') assert.ok([2,3].includes(frame.args),`${name}: IF arguments`);
      }
    }
    assert.equal(stack.length,0,name);
  }
  const formula=grantBlockFormula();
  assert.match(formula,/field\("techniqueKey"\)/);
  assert.match(formula,/"featureKey",field\("featureKey"\)/);
  assert.match(formula,/recipientRef/);
  assert.doesNotMatch(formula,/grantText/);
});

test('grant display retains ownership, conditional ranks, and readable capacity semantics', () => {
  const formula=grantBlockFormula();
  assert.match(formula,/refname,LAMBDA\(key,LET\(found,IFERROR\(CHOICE_NAME\(key\),""\),IF\(found<>"",found/);
  assert.match(formula,/DATA_GET_FIELD_BY_KEY\("Origins","originKey",key,"name"\)/);
  assert.match(formula,/"techniqueKey",field\("techniqueKey"\),"techniqueName"/);
  assert.match(formula,/field\("minRank"\)&" or higher"/);
  assert.match(formula,/SWITCH\(field\("operation"\),"set","Set "/);
  assert.match(formula,/"increase","Increase "/);
  assert.match(formula,/with capacity equal to/);
  assert.match(formula,/already have at least Rank/);
});

test('native grant fixtures cover source ownership and the new reference vocabulary', () => {
  assert.equal(GRANT_NATIVE_FIXTURES.length,11);
  for (const fixture of GRANT_NATIVE_FIXTURES) {
    assert.ok(fixture.name);
    assert.match(fixture.formula,/^=(GRANT_BLOCK|PREREQ_LINE)\(/);
    assert.ok(fixture.expected);
  }
  for (const expected of ['Artifact','Monster Evolution','Explosive Transformation','keystone','Stances','Flight']) {
    assert.ok(GRANT_NATIVE_FIXTURES.some(fixture=>fixture.expected.includes(expected)),expected);
  }
});
