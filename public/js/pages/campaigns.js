import { campaigns } from '../core/campaign-client.js?v=campaign-flow1';
import { confirmCampaignChange } from '../core/confirmation-dialog.js?v=campaign-delete1';
import { campaignRole, campaignSheetUrl, campaignInviteUrl, campaignDetailUrl, campaignJoinUrl, formatInviteCode } from '../core/campaign-model.js';
import { loadGameXData } from '../core/game-data.js';
import { createCampaignSettingsEditor } from './campaign-settings-editor.js';
import { createCampaignPage, element } from './campaign-page-ui.js';

const $ = id => document.getElementById(id);
const { status, showError, act, button, start } = createCampaignPage();
const detailPage = location.pathname === '/campaign.html';
let user = null;
let mine = [];
const selectedId = new URLSearchParams(location.search).get('campaignId');
let stopMine = null;
let stopRoster = null;
let detailVersion = 0;
let gameData = null;
let createSettings = null;
function renderMine() {
  const list = $('campaignList');
  list.replaceChildren();
  $('campaignEmpty').hidden = mine.length > 0;
  for (const campaign of mine) {
    const row = element('li');
    const role = campaignRole(campaign, user.uid);
    const open = element('a', campaign.name, 'btn secondary');
    open.href = campaignDetailUrl(campaign.id);
    row.append(open, element('span', ` ${role.creator ? 'Creator · ' : ''}${role.gm ? 'GM' : 'Player'}`, 'sub'));
    list.append(row);
  }
}
async function renderDetail(campaign) {
  const version = ++detailVersion;
  stopRoster?.(); stopRoster = null;
  const root = $('campaignDetail');
  root.replaceChildren();
  root.hidden = !campaign;
  if (!campaign) { status.textContent = 'Campaign unavailable.'; return; }
  status.textContent = '';
  if (campaign.deletedAt) {
    root.append(element('h2', 'Campaign deleted'), element('p', 'Sharing has ended. Finish removing any remaining campaign links; characters and learned skills are preserved.'),
      button('Finish deletion', async () => {
        await campaigns.deleteCampaign(campaign.id);
        return { navigateTo: '/campaigns.html', message: 'Campaign links removed.' };
      }));
    return;
  }
  document.title = `${campaign.name} – Game X`;
  root.append(element('h2', campaign.name), element('p', 'Loading members…', 'muted'));
  try {
    const members = (await campaigns.members(campaign.id)).filter(member => campaign.memberUids.includes(member.uid));
    if (version !== detailVersion) return;
    const memberName = uid => members.find(member => member.uid === uid)?.displayName || 'Player';
    const role = campaignRole(campaign, user.uid);
    root.replaceChildren(element('h2', campaign.name), element('p', `GM: ${memberName(campaign.gmUid)}${role.gm ? ' (you)' : ''}`));
    const settingsForm = element('form');
    const settingsEditor = createCampaignSettingsEditor({ gameData, settings: campaign.settings, readOnly: !role.creator && !role.gm });
    settingsForm.append(settingsEditor.element);
    if (role.creator || role.gm) {
      const saveSettings = element('button', 'Save settings', 'btn'); saveSettings.type = 'submit';
      settingsEditor.element.append(saveSettings);
      settingsForm.addEventListener('submit', event => { event.preventDefault(); void act(saveSettings, async () => {
        const settings = settingsEditor.read();
        if (!await confirmCampaignChange('Save these campaign settings? New character additions must be compatible. Existing characters keep their class, origin and learned skills; newly unavailable choices show a warning.')) return 'No settings changed.';
        await campaigns.updateSettings(campaign.id, settings, { expectedSettings: campaign.settings || {} }); return 'Campaign settings saved.';
      }); });
    }
    root.append(settingsForm);
    if (role.creator) {
      const form = element('form');
      const nameLabel = element('label', 'Campaign name', 'field-block');
      const name = element('input'); name.className = 'input'; name.value = campaign.name; name.maxLength = 80; name.required = true;
      nameLabel.append(name);
      const gmLabel = element('label', 'Game Master', 'field-block');
      const gm = element('select'); gm.className = 'input';
      for (const uid of campaign.memberUids) {
        const option = element('option', `${memberName(uid)}${uid === user.uid ? ' (you)' : ''}`);
        option.value = uid; gm.append(option);
      }
      gm.value = campaign.gmUid;
      gmLabel.append(gm);
      const save = element('button', 'Save campaign', 'btn'); save.type = 'submit';
      form.append(nameLabel, gmLabel, element('p', 'The GM can view all linked character sheets. Only you can change the GM.', 'sub'), save);
      form.addEventListener('submit', event => { event.preventDefault(); void act(save, async () => {
        await campaigns.update({ id: campaign.id, name: name.value, gmUid: gm.value });
        return 'Campaign updated.';
      }); });
      root.append(form);
      const invite = element('div', undefined, 'campaign-invite');
      invite.append(element('h3', 'Invite players'));
      if (campaign.inviteCode) {
        const link = campaignInviteUrl(campaign.inviteCode, location.origin);
        invite.append(element('code', formatInviteCode(campaign.inviteCode)));
        const linkLabel = element('label', 'Invite link', 'field-block');
        const input = element('input'); input.className = 'input'; input.readOnly = true; input.value = link;
        linkLabel.append(input); invite.append(linkLabel);
        const copy = element('div', undefined, 'campaign-actions');
        copy.append(button('Copy invite link', async () => { await navigator.clipboard.writeText(link); return 'Invite link copied.'; }),
          button('Copy code', async () => { await navigator.clipboard.writeText(formatInviteCode(campaign.inviteCode)); return 'Invite code copied.'; }));
        invite.append(copy);
      } else invite.append(element('p', 'Invitations are disabled. Existing members keep access.'));
      const actions = element('div', undefined, 'campaign-actions');
      actions.append(button(campaign.inviteCode ? 'Replace invite' : 'Enable invitations', async () => {
        if (campaign.inviteCode && !await confirmCampaignChange('Replace this invite? The old link and code will stop working. Existing members will stay.')) return 'No changes made.';
        await campaigns.setInvite(campaign.id, true); return 'New invite ready.';
      }));
      if (campaign.inviteCode) actions.append(button('Disable invitations', async () => {
        if (!await confirmCampaignChange('Disable this invite? Existing members will stay.')) return 'No changes made.';
        await campaigns.setInvite(campaign.id, false); return 'Invitations disabled.';
      }));
      invite.append(actions, element('p', 'Anyone with this code can join. Share it privately.', 'sub'));
      root.append(invite);
    }
    root.append(element('h3', 'Players'));
    const playerList = element('ul', undefined, 'list');
    for (const uid of campaign.memberUids) {
      const row = element('li', undefined, 'campaign-member');
      row.append(element('span', `${memberName(uid)}${uid === campaign.ownerUid ? ' · Creator' : ''}${uid === campaign.gmUid ? ' · GM' : ''}`));
      if (role.creator && uid !== campaign.ownerUid && uid !== campaign.gmUid) row.append(button(`Remove ${memberName(uid)}`, async () => {
        if (!await confirmCampaignChange(`Remove ${memberName(uid)}? Their linked sheets will stop being shared. Joining again restores their links; replace the invite to prevent rejoining with the old code.`)) return 'No changes made.';
        await campaigns.removeMember(campaign.id, uid); return 'Player removed.';
      }));
      playerList.append(row);
    }
    root.append(playerList);
    if (!role.creator && !role.gm) root.append(button('Leave campaign', async () => {
      if (!await confirmCampaignChange('Leave this campaign? Your linked sheets will stop being shared. Joining again restores your links; you can detach them on Characters.')) return 'No changes made.';
      await campaigns.removeMember(campaign.id, user.uid); return 'You left the campaign.';
    }));
    if (role.gm && !role.creator) root.append(element('p', 'Ask the creator to assign another GM before leaving.', 'sub'));
    root.append(element('h3', 'Characters'));
    const add = element('a', 'Add your character', 'btn secondary');
    add.href = campaignJoinUrl({ campaignId: campaign.id }); root.append(add);
    if (!role.gm) root.append(element('p', 'Only the GM can open other players’ sheets.', 'sub'));
    const roster = element('ul', undefined, 'list'); root.append(roster);
    if (role.creator) {
      const deletion = element('section', undefined, 'campaign-delete');
      deletion.append(element('h3', 'Delete campaign'),
        element('p', 'Only the creator can delete this campaign. Players keep their characters and learned skills.', 'sub'),
        button('Delete campaign', async () => {
          if (!await confirmCampaignChange(`Are you sure you want to delete “${campaign.name}”? Everyone will lose access to this campaign and its invitation will stop working. Players keep their characters and learned skills. This cannot be undone.`, {
            title: 'Delete campaign?', confirmText: 'Delete campaign',
          })) return 'Campaign not deleted.';
          stopRoster?.(); stopRoster = null;
          try { await campaigns.deleteCampaign(campaign.id); }
          catch (cause) { void renderDetail(await campaigns.get(campaign.id)); throw cause; }
          return { navigateTo: '/campaigns.html', message: 'Campaign deleted. Players’ characters have been preserved.' };
        }));
      root.append(deletion);
    }
    let rosterVersion = 0;
    stopRoster = campaigns.observeRoster(campaign.id, async entries => {
      const current = ++rosterVersion;
      const active = entries.filter(entry => campaign.memberUids.includes(entry.ownerUid));
      const rows = await Promise.all(active.map(async entry => {
        const row = element('li');
        if (role.gm || entry.ownerUid === user.uid) {
          try {
            const result = await campaigns.character(entry);
            const link = element('a', result.character.builder.name || '(Unnamed character)', 'btn secondary');
            link.href = campaignSheetUrl({ ...entry, campaignId: campaign.id });
            row.append(link, element('span', ` · ${memberName(entry.ownerUid)}`, 'sub'));
          } catch (cause) {
            console.warn('Campaign character could not be opened:', cause);
            const note = element('span', `Character unavailable · ${memberName(entry.ownerUid)}`, 'sub');
            note.title = cause?.message || 'The character may have been deleted or unshared.';
            row.append(note);
          }
        } else row.append(element('span', `Character shared by ${memberName(entry.ownerUid)}`, 'sub'));
        return row;
      }));
      if (version !== detailVersion || current !== rosterVersion) return;
      roster.replaceChildren(...(rows.length ? rows : [element('li', 'No characters linked yet.', 'muted')]));
    }, cause => {
      if (version !== detailVersion) return;
      // Membership/deletion snapshots also remove this view. Do not flash an
      // error if child authorization is revoked just before that snapshot arrives.
      if (cause?.code !== 'permission-denied') showError(cause);
    });
  } catch (cause) { if (version === detailVersion) showError(cause); }
}

const pendingCode = new URLSearchParams(location.hash.slice(1)).get('join');
// Retain previously shared/bookmarked routes without keeping inline details.
if (!detailPage && pendingCode) location.replace(`${campaignJoinUrl()}${location.hash}`);
else if (!detailPage && selectedId) location.replace(campaignDetailUrl(selectedId));
$('createCampaignForm')?.addEventListener('submit', event => {
  event.preventDefault();
  void act(event.submitter, async () => {
    if (!createSettings) throw new Error('Campaign settings are still loading.');
    const id = await campaigns.create({ uid: user.uid, name: $('campaignName').value, displayName: $('memberName').value, settings: createSettings.read() });
    return { navigateTo: campaignDetailUrl(id), message: 'Campaign created.' };
  });
});
await start(async (signedIn, displayName) => {
  user = signedIn;
  gameData = await loadGameXData();
  if (detailPage) {
    if (!selectedId) { status.textContent = 'Choose a campaign from Your campaigns.'; return; }
    stopMine = campaigns.observeCampaign(selectedId, campaign => { void renderDetail(campaign); }, cause => {
      stopRoster?.(); stopRoster = null; ++detailVersion;
      $('campaignDetail').hidden = true; status.textContent = ''; showError(cause);
    });
  } else {
    createSettings = createCampaignSettingsEditor({ gameData });
    $('createCampaignSettings').replaceChildren(createSettings.element);
    $('memberName').value = displayName;
    stopMine = campaigns.observeMine(user.uid, list => {
      mine = list;
      if (status.textContent === 'Loading campaigns…') status.textContent = '';
      renderMine();
    }, showError);
  }
}, () => { stopMine?.(); stopRoster?.(); ++detailVersion; });
