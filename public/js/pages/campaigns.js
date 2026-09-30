import { db } from '../core/firebase.js';
import { doc, getDoc } from '/vendor/firebase/firebase-firestore.js';
import { onAuth, getClaims, signOutNow, initAuthRedirectHandling } from '../core/auth-ui.js';
import { ensureAppTopNav } from '../core/app-nav.js?v=campaigns1';
import { campaigns } from '../core/campaign-client.js';
import { confirmCampaignChange } from '../core/confirmation-dialog.js';
import { createNavigationGuard, installNavigationGuard } from '../core/navigation-guard.js';
import { campaignRole, campaignSheetUrl, campaignInviteUrl, formatInviteCode } from '../core/campaign-model.js';

const $ = id => document.getElementById(id);
const status = $('campaignStatus');
const error = $('campaignError');
let user = null;
let mine = [];
let selectedId = new URLSearchParams(location.search).get('campaignId');
let stopMine = null;
let stopRoster = null;
let detailVersion = 0;
let busy = false;
let pendingAction = null;
const navigation = createNavigationGuard({
  getState: () => ({ saving: !!pendingAction }),
  flush: async () => { await pendingAction; return true; },
  navigate: href => location.assign(href),
});
installNavigationGuard({ guard: navigation });

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(label, action, secondary = true) {
  const node = element('button', label, `btn${secondary ? ' secondary' : ''}`);
  node.type = 'button';
  node.addEventListener('click', () => act(node, action));
  return node;
}
function showError(cause) {
  console.error(cause);
  error.textContent = cause?.code === 'permission-denied'
    ? 'Access changed or this invite is no longer valid. Refresh your campaigns or ask the creator for a current code.'
    : cause?.message || 'Could not complete the campaign request. Please try again.';
  error.hidden = false;
}
async function act(control, action) {
  if (busy) return;
  busy = true;
  control.disabled = true;
  error.hidden = true;
  status.textContent = 'Saving…';
  try {
    pendingAction = Promise.resolve().then(action);
    const message = await pendingAction;
    status.textContent = message || 'Saved.';
  } catch (cause) { status.textContent = ''; showError(cause); }
  finally { pendingAction = null; busy = false; control.disabled = false; if (control.isConnected) control.focus({ preventScroll: true }); }
}
function selectCampaign(id) {
  selectedId = id;
  const url = new URL(location.href);
  url.searchParams.set('campaignId', id);
  history.replaceState(null, '', url);
  renderMine();
}
function renderMine() {
  const list = $('campaignList');
  list.replaceChildren();
  $('campaignEmpty').hidden = mine.length > 0;
  for (const campaign of mine) {
    const row = element('li');
    const role = campaignRole(campaign, user.uid);
    const open = element('button', campaign.name, 'btn secondary');
    open.type = 'button';
    open.addEventListener('click', () => selectCampaign(campaign.id));
    open.setAttribute('aria-pressed', String(campaign.id === selectedId));
    row.append(open, element('span', ` ${role.creator ? 'Creator · ' : ''}${role.gm ? 'GM' : 'Player'}`, 'sub'));
    list.append(row);
  }
  void renderDetail(mine.find(item => item.id === selectedId));
}
async function renderDetail(campaign) {
  const version = ++detailVersion;
  stopRoster?.(); stopRoster = null;
  const root = $('campaignDetail');
  root.replaceChildren();
  root.hidden = !campaign;
  if (!campaign) return;
  root.append(element('h2', campaign.name), element('p', 'Loading members…', 'muted'));
  try {
    const members = (await campaigns.members(campaign.id)).filter(member => campaign.memberUids.includes(member.uid));
    if (version !== detailVersion) return;
    const memberName = uid => members.find(member => member.uid === uid)?.displayName || 'Player';
    const role = campaignRole(campaign, user.uid);
    root.replaceChildren(element('h2', campaign.name), element('p', `GM: ${memberName(campaign.gmUid)}${role.gm ? ' (you)' : ''}`));
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
    const add = element('a', 'Add your character from Characters', 'btn secondary');
    add.href = `/characters.html?campaignId=${encodeURIComponent(campaign.id)}`; root.append(add);
    if (!role.gm) root.append(element('p', 'Only the GM can open other players’ sheets.', 'sub'));
    const roster = element('ul', undefined, 'list'); root.append(roster);
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
    }, showError);
  } catch (cause) { if (version === detailVersion) showError(cause); }
}

const pendingCode = new URLSearchParams(location.hash.slice(1)).get('join');
if (pendingCode) $('inviteCode').value = pendingCode;
$('createCampaignForm').addEventListener('submit', event => {
  event.preventDefault();
  void act(event.submitter, async () => {
    const id = await campaigns.create({ uid: user.uid, name: $('campaignName').value, displayName: $('memberName').value });
    $('campaignName').value = ''; selectCampaign(id); return 'Campaign created. Share its invite with your players.';
  });
});
$('joinCampaignForm').addEventListener('submit', event => {
  event.preventDefault();
  void act(event.submitter, async () => {
    const id = await campaigns.join({ uid: user.uid, code: $('inviteCode').value, displayName: $('memberName').value });
    $('inviteCode').value = '';
    history.replaceState(null, '', location.pathname + location.search);
    selectCampaign(id); return 'Campaign joined. Add a character from Characters when you’re ready.';
  });
});
await initAuthRedirectHandling();
onAuth(async signedIn => {
  stopMine?.(); stopRoster?.();
  user = signedIn;
  if (!user) {
    // Keep invitation secrets in the fragment, including across sign-in.
    location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search)}${location.hash}`);
    return;
  }
  try {
    const claims = await getClaims(user);
    const nav = ensureAppTopNav({ active: 'campaigns', isGM: claims.gm, onSignOut: async () => {
      if (await navigation.flush()) await signOutNow();
    } });
    nav.signOut.style.display = '';
    const profile = await getDoc(doc(db, 'users', user.uid));
    $('memberName').value = profile.data()?.displayName || user.displayName || '';
    stopMine = campaigns.observeMine(user.uid, list => {
      mine = list;
      if (!selectedId && list.length) selectedId = list[0].id;
      if (status.textContent === 'Loading campaigns…') status.textContent = pendingCode && $('inviteCode').value ? 'Your invite is ready. Choose Join campaign to accept it.' : '';
      renderMine();
    }, showError);
  } catch (cause) { showError(cause); }
});
