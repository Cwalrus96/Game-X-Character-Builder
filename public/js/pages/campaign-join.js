import { campaigns } from '../core/campaign-client.js?v=campaign-flow1';
import { campaignDetailUrl } from '../core/campaign-model.js';
import { campaignCompatibility } from '../core/campaign-settings.js';
import { confirmCampaignChange } from '../core/confirmation-dialog.js';
import { observeCharacters } from '../core/database-reader.js';
import { loadGameXData } from '../core/game-data.js';
import { createCampaignPage, element } from './campaign-page-ui.js';

const $ = id => document.getElementById(id);
const { status, showError, act, start } = createCampaignPage();
const params = new URLSearchParams(location.search);
const requestedCharacter = params.get('charId');
const pendingCode = new URLSearchParams(location.hash.slice(1)).get('join');
let user;
let target = null;
let characters = [];
let links = new Map();
let linksReady = false;
let stopCharacters, stopLinks, stopCampaign;
let chosenCharacter = requestedCharacter;
let saved = false;

function renderChoiceState() {
  const character = characters.find(item => item.characterId === $('characterChoice').value);
  const current = character && links.get(character.characterId);
  const conflicts = target && character ? campaignCompatibility(target.settings, character.character.builder) : [];
  const alreadyAdded = current?.campaignId === target?.id && !!target;
  $('addCharacterButton').disabled = !target || !character || !linksReady || conflicts.length > 0 || alreadyAdded;
  $('addCharacterButton').textContent = current && !alreadyAdded ? 'Move to this Campaign' : 'Add to Campaign';
  $('characterCompatibility').textContent = conflicts.length
    ? `This character’s ${conflicts.join(' and ')} ${conflicts.length > 1 ? 'are' : 'is'} unavailable in this campaign. Edit the character before adding it.`
    : alreadyAdded ? 'This character is already in this campaign.'
    : current ? 'Adding this character will remove it from its previous campaign. The previous GM will lose access.'
    : character ? 'The GM will be able to view this character’s sheet.' : '';
}
function renderCharacters() {
  const select = $('characterChoice');
  const selection = select.value || chosenCharacter;
  select.replaceChildren();
  for (const item of characters) {
    const option = element('option', item.character.builder.name || '(Unnamed character)');
    option.value = item.characterId; select.append(option);
  }
  if (characters.some(item => item.characterId === selection)) select.value = selection;
  else if (selection) {
    const placeholder = element('option', 'Choose a character');
    placeholder.value = ''; placeholder.disabled = true;
    select.prepend(placeholder); select.value = '';
    showError(new Error('The selected character is unavailable. Choose another owned character or review it on Characters.'));
  }
  $('noCharacters').hidden = characters.length > 0;
  $('addCharacterForm').hidden = characters.length === 0;
  renderChoiceState();
}
function watchCampaign(id) {
  stopCampaign?.();
  stopCampaign = campaigns.observeCampaign(id, campaign => {
    target = campaign && !campaign.deletedAt && campaign.memberUids?.includes(user.uid) ? campaign : null;
    $('addCharacterPanel').hidden = !target;
    $('joinCampaignForm').hidden = !!target;
    if (!target) { status.textContent = 'Campaign unavailable. Enter a current invite code to join.'; renderChoiceState(); return; }
    $('joinCampaignTitle').textContent = target.name;
    $('openCampaign').href = campaignDetailUrl(target.id);
    renderChoiceState();
    if (!saved) status.textContent = 'Choose your character to add to this campaign.';
  }, cause => {
    target = null; $('addCharacterPanel').hidden = true; $('joinCampaignForm').hidden = false;
    status.textContent = ''; showError(cause);
  });
}
if (pendingCode) $('inviteCode').value = pendingCode;
$('characterChoice').addEventListener('change', () => { chosenCharacter = $('characterChoice').value; saved = false; renderChoiceState(); });
$('joinCampaignForm').addEventListener('submit', event => {
  event.preventDefault();
  void act(event.submitter, async () => {
    const id = await campaigns.join({ uid: user.uid, code: $('inviteCode').value, displayName: $('memberName').value });
    const url = new URL(location.href); url.searchParams.set('campaignId', id); url.hash = '';
    history.replaceState(null, '', url);
    $('inviteCode').value = ''; saved = false; watchCampaign(id);
    return 'Campaign joined. Choose your character below.';
  });
});
$('addCharacterForm').addEventListener('submit', event => {
  event.preventDefault();
  const characterId = $('characterChoice').value;
  const campaignId = target?.id;
  void act(event.submitter, async () => {
    if (!campaignId || !characters.some(item => item.characterId === characterId)) throw new Error('Choose one of your characters and a valid invitation.');
    const previous = links.get(characterId);
    if (previous && previous.campaignId !== campaignId && !await confirmCampaignChange('Move this character to this campaign? The previous GM will lose access to its sheet.')) return 'Character not moved.';
    await campaigns.setCharacterCampaign({ uid: user.uid, characterId, campaignId });
    saved = true;
    return 'Character added. Your GM can now view its sheet.';
  }).finally(renderChoiceState);
});
await start(async (signedIn, displayName) => {
  user = signedIn;
  $('memberName').value = displayName;
  const gameData = await loadGameXData();
  stopCharacters = await observeCharacters({ ownerUid: user.uid, gameData, onChange: result => {
    characters = result.characters; renderCharacters();
    if (result.invalid.length) showError(new Error('Some characters could not be loaded. Open Characters to review them.'));
  }, onError: showError });
  stopLinks = campaigns.observeLinks(user.uid, value => { links = value; linksReady = true; renderChoiceState(); }, showError);
  if (params.get('campaignId')) watchCampaign(params.get('campaignId'));
  else status.textContent = pendingCode ? 'Your invitation is ready. Join the campaign to choose a character.' : 'Enter the private code your campaign creator shared.';
}, () => { stopCharacters?.(); stopLinks?.(); stopCampaign?.(); linksReady = false; });
