import test from 'node:test';
import assert from 'node:assert/strict';
import {GRANT_NAMED_FUNCTIONS, GRANT_NATIVE_FIXTURES, TECHNIQUE_ACCESS_GRANT_NATIVE_FIXTURES, grantBlockFormula} from '../scripts/display/grant-display-formulas.mjs';
import {readFileSync} from 'node:fs';

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

test('technique access and skill substitution render distinct readable benefits while ordinary choices survive', () => {
  const formula = grantBlockFormula();
  assert.match(formula, /"technique",IF\(field\("access"\)<>"","May learn "/);
  assert.match(formula, /whose weapon requirements are satisfied by a weapon with the/);
  assert.match(formula, /"skill-substitution","May use "&field\("toSkill"\)&" instead of "&SUBSTITUTE\(field\("fromSkill"\)/);
  assert.match(formula, /for Technique rolls and skill-based effects/);
  assert.match(formula, /IF\(field\("weaponTag"\)="",""," when using a weapon with the/);
  assert.doesNotMatch(formula, /associatedSkill|rankSkill|maxTechniqueRank/);
  assert.match(formula, /IF\(techname<>"","Learn "&techname,"Choose "&count/);
  const fixtures = TECHNIQUE_ACCESS_GRANT_NATIVE_FIXTURES;
  assert.equal(fixtures.length, 8);
  assert.doesNotMatch(fixtures[0].expected, /Choose|Rank|Metamorphosis/);
  assert.match(fixtures[1].expected, /when using a weapon with the Natural tag$/);
  assert.doesNotMatch(fixtures[2].expected, /weapon|Rank|learn|Choose/);
  assert.equal(fixtures[3].expected, 'Grants:   * Choose 2 Martial Arts techniques up to Rank 3');
  const manifest = JSON.parse(readFileSync(new URL('../scripts/display/authoring-formulas.json', import.meta.url), 'utf8'));
  assert.equal(manifest.namedFunctions.GRANT_BLOCK.formula, formula);
  for (const [index, fixture] of fixtures.entries()) {
    const row = index + 62;
    assert.equal(manifest.cells[`Function_Tests!L${row}`], fixture.formula);
    assert.equal(manifest.values[`Function_Tests!M${row}`], fixture.expected);
    assert.equal(manifest.cells[`Function_Tests!N${row}`], `=IF(L${row}=M${row},"PASS","FAIL")`);
  }
});

test('fixed weapon grants resolve canonical keys and aliases without becoming unbound choices', () => {
  const formula = grantBlockFormula();
  assert.match(formula, /"weapon",IF\(OR\(field\("weaponKey"\)<>"",field\("key"\)<>""\),"Gain "&count/);
  assert.match(formula, /LET\(referencekey,IF\(field\("weaponKey"\)<>"",field\("weaponKey"\),field\("key"\)\),reference,WeaponBases!A1:J1000/);
  assert.match(formula, /keys,CHOOSECOLS\(reference,XMATCH\("weaponKey",head,0\)\),names,CHOOSECOLS\(reference,XMATCH\("name",head,0\)\)/);
  assert.match(formula, /matches,COUNTIF\(keys,referencekey\),IF\(matches=1,INDEX\(names,XMATCH\(referencekey,keys,0\)\)/);
  assert.match(formula, /IF\(matches=0,"\[Missing WeaponBases key: "&referencekey&"\]","\[Ambiguous WeaponBases key: "&referencekey&"\]"\)/);
  assert.doesNotMatch(formula, /label\("WeaponBases"|DATA_GET_FIELD_BY_KEY\("WeaponBases"|_WeaponBases!/, 'WeaponBases uses its existing unprefixed import');
  assert.match(formula, /"Choose "&count&IF\(rank="",""," Rank "&rank\)&IF\(field\("skill"\)="",""," "&field\("skill"\)\)/);
  const fixtures = TECHNIQUE_ACCESS_GRANT_NATIVE_FIXTURES.slice(4);
  assert.equal(fixtures[0].expected, 'Grants:   * Gain 2 Crushing Limbs weapons');
  assert.equal(fixtures[1].expected, 'Grants:   * Gain 1 Web Shooters weapon');
  assert.match(fixtures[2].expected, /\[Missing WeaponBases key: missing-natural-weapon-fixture\]/);
  assert.equal(fixtures[3].expected, 'Grants:   * Choose 2 Rank 1 Melee Weapons weapons with Heavy tag');
});
