// Read-only CPU baseline. Run from the repository root; no Firebase imports.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { CharacterSession } from '../../public/js/core/character-session.js';
import { createCharacterSessionGraphReconciler, reconcileCharacterGraph } from '../../public/js/core/graph-reconciler.js';
import { SetAttributeValue, SetSkillRank, SetFeatSelection, SetTechniqueSelection, VisitBuilderStep } from '../../public/js/core/character-commands.js';
import { projectTechniqueOwnership } from '../../public/js/core/technique-ownership.js';
import { projectSheetTechniques } from '../../public/js/core/sheet-technique-projection.js';
import { assertCanonicalCharacter } from '../../public/js/core/character-codec.js';
import { projectSkillNames } from '../../public/js/core/skill-identity.js';
import { createCharacterMigrationReferences } from '../../public/js/core/character-migrations.js';
import { decodeStoredCharacter } from '../../public/js/core/character-persistence.js';

const fixturePath = process.argv[2] || 'scripts/performance/fixtures/typical.json';
const output = process.argv[3] || '.staging/performance-baseline/core.json';
const fixtureBytes = await fs.readFile(fixturePath);
const catalogueBytes = await fs.readFile('public/data/game-x/game-x-data.json');
const gameData = projectSkillNames(JSON.parse(catalogueBytes));
const decoded = decodeStoredCharacter({...JSON.parse(fixtureBytes),revision:1},{references:createCharacterMigrationReferences(gameData)});
assert.equal(decoded.ok,true,'Stored benchmark fixture must load through the app migration boundary');
const character = assertCanonicalCharacter(decoded.character);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const samples = 20;
const summary = values => {
  const sorted = [...values].sort((a,b) => a-b);
  return { n: values.length, medianMs: (sorted[9]+sorted[10])/2,
    p95Ms: sorted[Math.ceil(values.length*.95)-1], minMs: sorted[0], maxMs: sorted.at(-1) };
};
const freshSession = () => new CharacterSession({character, reconcileCharacter:createCharacterSessionGraphReconciler({gameData})});
const commandCases = [
  ['attribute-change', () => SetAttributeValue('agility', 3)],
  ['skill-change', () => SetSkillRank('rank_society', '')],
  ['remove-feat', () => SetFeatSelection(character.builder.selectedFeats.slice(0,-1))],
  ['remove-technique', () => SetTechniqueSelection(character.builder.selectedTechniques.slice(0,-1))],
];
const cases = commandCases.map(([id, command]) => ({id, prepare: freshSession, run: session => {
  const proposal = session.propose(command());
  assert.equal(proposal.ok, true, `${id}: proposal must be valid`);
  // Model the decision without human think time, never persist the result.
  session.acceptProposal(proposal.proposalId, {confirm:true});
  assert.equal(session.getState().dirty, true, `${id}: command must change the fixture`);
}}));
cases.push(
  {id:'initial-reconciliation',run:()=>reconcileCharacterGraph({character,previousCharacter:character,gameData})},
  {id:'technique-ownership',run:()=>projectTechniqueOwnership({builder:character.builder,gameData})},
  {id:'sheet-techniques',run:()=>projectSheetTechniques({character,gameData})},
  {id:'save-snapshot-only',prepare:freshSession,run:s=>s.createSaveSnapshot()},
  {id:'attributes-save-checks-only',prepare:freshSession,run:s=>{
    const p=s.propose(VisitBuilderStep('attributes')); s.acceptProposal(p.proposalId,{confirm:true});
    reconcileCharacterGraph({character:s.getState().working,previousCharacter:s.getState().working,gameData});
    s.createSaveSnapshot();
  }},
  {id:'techniques-save-checks-only',prepare:freshSession,run:s=>{
    let p=s.propose(SetTechniqueSelection(character.builder.selectedTechniques)); s.acceptProposal(p.proposalId,{confirm:true});
    reconcileCharacterGraph({character:s.getState().working,previousCharacter:s.getState().working,gameData});
    p=s.propose(VisitBuilderStep('techniques')); s.acceptProposal(p.proposalId,{confirm:true});
    s.createSaveSnapshot();
  }},
);
const report = {
  schemaVersion:1, capturedAt:new Date().toISOString(), commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  environment:{node:process.version,platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},
  fixtureSha256:hash(fixtureBytes),catalogueSha256:hash(catalogueBytes),catalogueBytes:catalogueBytes.length,
  method:'Serial Node CPU samples. Two discarded warmups per case; preparation outside timer. No DOM, network, or human confirmation time. Save-check cases include page-level repeated reconciliation, but exclude widget refresh and persistence.',
  results:[],
};
for(const test of cases){
  const values=[];
  for(let i=-2;i<samples;i++){
    const prepared=test.prepare?.(); const start=performance.now(); test.run(prepared);
    if(i>=0) values.push(+(performance.now()-start).toFixed(3));
  }
  const result={id:test.id,samplesMs:values,...summary(values)}; report.results.push(result);
  console.log(JSON.stringify({id:result.id,medianMs:result.medianMs,p95Ms:result.p95Ms}));
}
assert.equal(hash(await fs.readFile(fixturePath)),report.fixtureSha256);
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(`Saved ${output}`);
