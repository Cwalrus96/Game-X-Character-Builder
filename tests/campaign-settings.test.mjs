import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCampaignSettings, campaignCompatibility, campaignSettingsFingerprint } from '../public/js/core/campaign-settings.js';
import { getSkillAllocationState, getSkillDisplayState, fitSkillsToRules } from '../public/js/core/skill-rules.js';
import { getRollSkills } from '../public/js/core/sheet-roll-context.js';
import { createDefaultCharacter, decodeCharacter } from '../public/js/core/character-codec.js';
import { CharacterSession } from '../public/js/core/character-session.js';
import { SetClass, SetOrigin, SetSettingSkills } from '../public/js/core/character-commands.js';
import { createCharacterSessionGraphReconciler, reconcileCharacterGraph } from '../public/js/core/graph-reconciler.js';
import { getTechniqueSelectionState } from '../public/js/core/technique-rules.js';
import { CharacterSessionPage } from '../public/js/builder/character-session-page.js';
import { getOriginSelectionState } from '../public/js/core/origin-rules.js';

const settings = normalizeCampaignSettings({ unavailableClassKeys: ['wizard'], unavailableOriginKeys: ['alien'], settingSkills: [{ name: 'Starship Piloting', description: 'Navigate between worlds.' }] });
const data = { schemaVersion: 2, classes: [{ classKey: 'wizard', name: 'Wizard', primaryAttributeA: 'Intellect', primaryAttributeB: 'Willpower', selectable: true }], classFeatures: { wizard: [] }, classSkills: [], feats: [], techniques: [], weaponBases: [], weaponEnhancements: [], origins: [{ originKey: 'alien', name: 'Alien', selectable: true, grants: [], features: [] }], campaignContext: { id: 'test', name: 'Starfall', settings } };

test('settings normalize names, reject malformed input and derive stable duplicate identity', () => {
  assert.deepEqual(normalizeCampaignSettings(), { unavailableClassKeys: [], unavailableOriginKeys: [], settingSkills: [] });
  assert.deepEqual(campaignCompatibility(settings, { classKey: 'wizard', originKey: 'alien' }), ['class', 'origin']);
  for (const invalid of [null, { extra: true }, { unavailableClassKeys: [3] }, { unavailableOriginKeys: ['x', 'x'] }, { settingSkills: [{ name: '', description: '' }] }, { settingSkills: [{ name: 'A', description: 1 }] }, { settingSkills: [{ name: 'Void Sail', description: '' }, { name: 'void-sail', description: '' }] }, { settingSkills: Array.from({ length: 21 }, (_, i) => ({ name: `Skill ${i}`, description: '' })) }]) assert.throws(() => normalizeCampaignSettings(invalid));
  assert.equal(campaignSettingsFingerprint({ id: 'a', settings: {} }), campaignSettingsFingerprint({ id: 'a', settings: normalizeCampaignSettings() }));
});

test('campaign skills are untrained projections and share costs, caps, sheet ranks and rolls', () => {
  const character = createDefaultCharacter({ ownerUid: 'tester' });
  const before = structuredClone(character);
  let allocation = getSkillAllocationState(data, character.builder);
  assert.equal(allocation.setting[0].rank, 0);
  assert.equal(allocation.spent, 0);
  assert.deepEqual(character, before);
  character.builder.sheet.repeatables.settingSkills = [{ skill: 'Starship Piloting', rank: '1' }];
  allocation = getSkillAllocationState(data, character.builder);
  assert.equal(allocation.setting.length, 1);
  assert.equal(allocation.spent, 1);
  assert.equal(allocation.setting[0].cap, allocation.baseRankCap);
  assert.equal(getSkillDisplayState(data, character.builder).repeatables.settingSkills[0].rank, '1');
  assert.equal(getRollSkills(data, character.builder).find(skill => skill.name === 'Starship Piloting').rank, 1);
  assert.equal(decodeCharacter(character).ok, true);
  const withoutCampaign = { ...data, campaignContext: null };
  assert.equal(getSkillAllocationState(withoutCampaign, character.builder).spent, 1);
  assert.equal(getRollSkills(withoutCampaign, character.builder).find(skill => skill.name === 'Starship Piloting').rank, 1);
  character.builder.sheet.repeatables.settingSkills[0].rank = '6';
  const fitted = fitSkillsToRules(data, character.builder);
  assert.equal(fitted.settingSkills[0].rank, String(allocation.baseRankCap));
});

test('campaign catalogue never duplicates a core skill or its paid cost', () => {
  const character = createDefaultCharacter({ ownerUid: 'tester' });
  character.builder.sheet.fields.rank_athletics = '1';
  const catalogue = { ...data, campaignContext: { ...data.campaignContext, settings: normalizeCampaignSettings({ settingSkills: [{ name: 'Athletics', description: 'Setting context' }] }) } };
  const allocation = getSkillAllocationState(catalogue, character.builder);
  assert.equal(allocation.setting.length, 0);
  assert.equal(allocation.spent, 1);
});

test('graph rejects newly banned choices and preserves existing choices with a warning', () => {
  const character = createDefaultCharacter({ ownerUid: 'tester' });
  const originOptions = getOriginSelectionState(data, character.builder);
  assert.equal(originOptions.options[0].campaignUnavailable, true);
  assert.equal(originOptions.options[0].selectable, true, 'Campaign restrictions do not erase the catalogue or existing origin grants');
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: data }) });
  for (const command of [SetClass('wizard'), SetOrigin('alien')]) {
    const proposal = session.propose(command);
    assert.equal(proposal.ok, false);
    assert.ok(proposal.impacts.some(item => item.category === 'error' && item.code.startsWith('campaign-')));
    session.cancelProposal(proposal.proposalId);
    assert.deepEqual(session.getState().working, character);
  }
  character.builder.originKey = 'alien';
  const kept = reconcileCharacterGraph({ character, previousCharacter: character, gameData: data });
  assert.equal(kept.ok, true);
  assert.equal(kept.character.builder.originKey, 'alien');
  assert.ok(kept.impacts.some(item => item.code === 'campaign-origin-unavailable' && item.category === 'informational'));
});

test('campaign skill budget changes use normal proposals, confirmation and cancellation', () => {
  const character = createDefaultCharacter({ ownerUid: 'tester' });
  character.builder.sheet.fields.rank_athletics = '1';
  character.builder.sheet.fields.rank_academics = '1';
  const session = new CharacterSession({ character, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: data }) });
  const proposal = session.propose(SetSettingSkills([{ skill: 'Starship Piloting', rank: '1' }]));
  assert.equal(proposal.requiresConfirmation, true);
  assert.ok(proposal.impacts.some(item => item.code === 'skill-point-budget-applied'));
  session.cancelProposal(proposal.proposalId);
  assert.deepEqual(session.getState().working, character);
});

test('learned Setting Skills supply normal Technique rank and prerequisite evidence', () => {
  const character = createDefaultCharacter({ ownerUid: 'tester' });
  character.builder.sheet.repeatables.settingSkills = [{ skill: 'Starship Piloting', rank: '1' }];
  const technique = { expressionSyntaxVersion: 3, status: 'playable', runtimeSupport: { status: 'supported' }, selectionRoutes: [{ type: 'skill', name: 'Starship Piloting' }], techniqueKey: 'maneuver', techniqueName: 'Maneuver', skill: 'Starship Piloting', rank: 1, selectable: true, prerequisites: [{ type: 'skill', name: 'Starship Piloting', rank: 1 }] };
  assert.equal(getTechniqueSelectionState(technique, { gameData: data, builder: character.builder }).eligible, true);
  character.builder.sheet.repeatables.settingSkills[0].rank = '0';
  assert.equal(getTechniqueSelectionState(technique, { gameData: data, builder: character.builder }).eligible, false);
});

test('a stale campaign guard prevents persistence without losing pending character state', async () => {
  const character = createDefaultCharacter({ ownerUid: 'tester' });
  let writes = 0;
  const page = new CharacterSessionPage({ character, gameData: data, beforeSave: async () => { throw new Error('Campaign changed'); } });
  const saved = await page.save(async () => { writes += 1; return { revision: 1 }; });
  assert.equal(saved.ok, false);
  assert.equal(writes, 0);
  assert.deepEqual(page.getCharacter(), character);
});
