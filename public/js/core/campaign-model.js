export function campaignName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 80) throw new Error('Enter a campaign name of 1–80 characters.');
  return name;
}

export function normalizeInviteCode(value) {
  const code = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(code)) throw new Error('Enter the complete invite code from your campaign creator.');
  return code;
}

export function createInviteCode(cryptoProvider = globalThis.crypto) {
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function formatInviteCode(code) {
  return normalizeInviteCode(code).match(/.{8}/g).join('-');
}

export function campaignInviteUrl(code, origin) {
  const url = new URL('/campaigns.html', origin);
  // Fragments are not sent to Hosting or included in HTTP referrers.
  url.hash = new URLSearchParams({ join: normalizeInviteCode(code) }).toString();
  return url.href;
}

export function campaignSheetUrl({ ownerUid, characterId, campaignId }) {
  return `/character-sheet.html?${new URLSearchParams({ uid: ownerUid, charId: characterId, campaignId })}`;
}

export function campaignRole(campaign, uid) {
  const member = !!campaign?.memberUids?.includes(uid);
  return { member, creator: member && campaign.ownerUid === uid, gm: member && campaign.gmUid === uid };
}

export function publicMemberName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 32) throw new Error('Choose a display name of 1–32 characters.');
  return name;
}
