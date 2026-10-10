import { campaigns } from '../core/campaign-client.js?v=campaign-overview1';
import { campaignDetailUrl, campaignSheetUrl } from '../core/campaign-model.js?v=campaign-overview1';
import { createCampaignOverviewLive } from '../core/campaign-overview-live.js?v=campaign-overview4';
import { observeCharacter, observeCharacterRolls } from '../core/database-reader.js?v=campaign-overview1';
import { projectCharacterVitals } from '../core/character-vitals.js';
import { projectCharacterKeystones } from '../core/keystone-projection.js';
import { characterRollOutcome } from '../core/character-roll-history.js';
import { labelForAttrKey } from '../core/character-rules.js';
import { loadGameXData } from '../core/game-data.js';
import { storage } from '../core/firebase.js';
import { ref, getBlob } from '/vendor/firebase/firebase-storage.js';
import { createCampaignPage, element } from './campaign-page-ui.js?v=campaign-overview1';

const $ = id => document.getElementById(id);
const page = createCampaignPage();
const campaignId = new URLSearchParams(location.search).get('campaignId');
const cards = new Map();
const failures = new Map();
let live, gameData, campaign, generation = 0;
const value = item => item === '' || item === undefined || item === null ? '—' : String(item);
function updateEmpty() { $('overviewEmpty').hidden = !campaign || cards.size > 0; }
function remove(key) {
  const card = cards.get(key); if (!card) return;
  cards.delete(key); card.element.remove(); if (card.portraitUrl) URL.revokeObjectURL(card.portraitUrl);
  updateEmpty();
}
function reset() {
  ++generation; live?.dispose(); live = null; [...cards.keys()].forEach(remove); campaign = null;
  failures.clear(); $('campaignError').hidden = true;
  $('campaignSettingsLink').hidden = true; $('overviewEmpty').hidden = true;
}
function cardFor(key) {
  if (cards.has(key)) return cards.get(key);
  const root = element('article', undefined, 'card overview-character');
  const heading = element('div', undefined, 'overview-character-heading');
  const icon = element('div', '?', 'overview-icon');
  const identity = element('div');
  const name = element('h2', 'Loading character…'), subtitle = element('p', '', 'sub');
  identity.append(name, subtitle); heading.append(icon, identity);
  const sheet = element('a', 'Open full sheet', 'btn secondary');
  const body = element('div'), rolls = element('div');
  root.append(heading, sheet, body, element('h3', 'Recent rolls'), rolls);
  const card = { element: root, icon, name, subtitle, sheet, body, rolls, portraitPath: null, portraitUrl: '' };
  cards.set(key, card); $('overviewCharacters').append(root); updateEmpty();
  return card;
}
async function portrait(key, path, version) {
  const card = cards.get(key);
  const signature = JSON.stringify([path, version]);
  if (card.portraitSignature === signature) return;
  const changedPath = card.portraitPath !== path;
  card.portraitSignature = signature;
  card.portraitPath = path;
  if (changedPath || !path) {
    if (card.portraitUrl) { URL.revokeObjectURL(card.portraitUrl); card.portraitUrl = ''; }
    card.icon.replaceChildren(element('span', card.name.textContent.slice(0, 1).toUpperCase() || '?'));
  }
  if (!path) return;
  try {
    const blob = await getBlob(ref(storage, path), 5 * 1024 * 1024);
    if (cards.get(key) !== card || card.portraitSignature !== signature) return;
    if (card.portraitUrl) URL.revokeObjectURL(card.portraitUrl);
    card.portraitUrl = URL.createObjectURL(blob);
    const img = element('img'); img.src = card.portraitUrl; img.alt = `${card.name.textContent} portrait`; card.icon.replaceChildren(img);
  } catch (error) { if (cards.get(key) === card) card.icon.title = 'Portrait unavailable'; }
}
function showCharacter(key, result) {
  failures.delete(key);
  const error = failures.values().next().value;
  if (error) page.showError(error); else $('campaignError').hidden = true;
  const card = cardFor(key), builder = result.character.builder;
  card.builder = builder;
  const data = { ...gameData, campaignContext: campaign };
  const vitals = projectCharacterVitals({ builder, gameData: data });
  card.name.textContent = builder.name || '(Unnamed character)';
  card.subtitle.textContent = `Level ${vitals.level} · ${vitals.className}`;
  card.sheet.href = campaignSheetUrl({ ownerUid: result.ownerUid, characterId: result.characterId, campaignId });
  const fields = builder.sheet?.fields || {};
  const stats = element('dl', undefined, 'overview-stats');
  for (const [label, number] of [['HP · Current / Max', `${value(fields.hpcur)} / ${vitals.maxHP}`],
    ['Strain', `${value(fields.strain)}${fields.overstrained ? ' · Overstrained' : ''}`],
    ['Physical Defense', vitals.physicalDefense], ['Mental Defense', vitals.mentalDefense], ['Spiritual Defense', vitals.spiritualDefense]]) {
    const stat = element('div'); stat.append(element('dt', label), element('dd', String(number))); stats.append(stat);
  }
  const conditions = element('ul', undefined, 'overview-list');
  for (const condition of builder.sheet?.repeatables?.conditions || []) {
    if (!condition.name && !condition.notes && !condition.n) continue;
    const row = element('li', `${condition.name || 'Condition'}${condition.n !== '' ? ` ${condition.n}` : ''}`);
    if (condition.notes) row.append(element('p', condition.notes, 'sub')); conditions.append(row);
  }
  if (!conditions.children.length) conditions.append(element('li', 'None recorded.', 'muted'));
  const keystones = element('ul', undefined, 'overview-list');
  for (const keystone of projectCharacterKeystones({ builder, gameData: data })) {
    const row = element('li'); row.append(element('strong', keystone.title), element('p', keystone.text)); keystones.append(row);
  }
  if (!keystones.children.length) keystones.append(element('li', 'None recorded.', 'muted'));
  card.body.replaceChildren(stats, element('h3', 'Conditions'), conditions, element('h3', 'Keystones · Compels'), keystones);
  // Profile uploads reuse a stable Storage path. Refresh on confirmed document
  // updates too, so replacing the image at that path reaches the live overview.
  if (result.metadata) card.portraitVersion = result.metadata.updatedAt;
  void portrait(key, builder.portraitPath || '', card.portraitVersion);
}
function showRolls(key, { rolls, invalid }) {
  const card = cardFor(key);
  const list = element('ol', undefined, 'overview-rolls');
  for (const { data, createdAt } of rolls) {
    const row = element('li');
    const time = element('time', new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    time.dateTime = new Date(createdAt).toISOString(); time.title = new Date(createdAt).toLocaleString();
    row.append(element('strong', data.label), time,
      element('p', `${data.hits} Hits · ${labelForAttrKey(data.attributeKey)} ${data.attributeValue} + ${data.skillName} ${data.skillRank}${data.modifierDice ? ` · modifier ${data.modifierDice}` : ''}`));
    row.append(element('p', `Dice: ${data.dice.join(', ') || 'none'}${data.coin !== null ? ` · coin ${data.coin}` : ''}${data.automaticHits ? ` · ${data.automaticHits} automatic Hits` : ''}`, 'sub'));
    const { outcome, damage } = characterRollOutcome(data);
    if (outcome) row.append(element('p', `TN ${data.targetNumber} · ${outcome.label} (${outcome.margin >= 0 ? '+' : ''}${outcome.margin})${damage !== null ? ` · damage ${damage} before armor / resistance` : ''}`, 'sub'));
    list.append(row);
  }
  card.rolls.replaceChildren(rolls.length ? list : element('p', 'No saved rolls yet.', 'muted'));
  if (invalid.length) card.rolls.append(element('p', 'Some roll records could not be read.', 'error'));
}
await page.start(async (user, displayName, claims) => {
  const version = generation;
  if (!campaignId) { page.status.textContent = 'Choose a campaign first.'; return; }
  gameData = await loadGameXData();
  if (version !== generation) return;
  $('campaignBack').href = campaignDetailUrl(campaignId);
  $('campaignSettingsLink').href = `${campaignDetailUrl(campaignId)}#campaignSettings`;
  live = createCampaignOverviewLive({ campaignId, uid: user.uid, isSuperGM: !!claims.gm,
    observeCampaign: campaigns.observeCampaign, observeRoster: campaigns.observeRoster,
    observeCharacter: options => observeCharacter({ ...options, gameData }), observeRolls: observeCharacterRolls,
    onCampaign: next => {
      campaign = next;
      $('campaignSettingsLink').hidden = !next;
      $('overviewTitle').textContent = next ? `${next.name} · GM Overview` : 'GM Overview';
      page.status.textContent = next ? 'Live · Updates when players save their sheets or roll.' : 'Overview unavailable. Only the campaign’s GM or Super GM can view it.';
      document.title = next ? `${next.name} · GM Overview – Game X` : 'Game X – GM Overview';
      if (next) for (const [key, card] of cards) if (card.builder) {
        const [ownerUid, characterId] = JSON.parse(key);
        showCharacter(key, { character: { builder: card.builder }, ownerUid, characterId });
      }
      updateEmpty();
    }, onCharacter: showCharacter, onRolls: showRolls, onRemove: remove,
    onError: (error, key = 'campaign') => {
      if (error.code !== 'permission-denied') { failures.set(key, error); page.showError(error); }
    },
  });
}, reset);
window.addEventListener('pagehide', reset);
