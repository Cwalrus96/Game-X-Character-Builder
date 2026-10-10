import { canUseCampaignOverview } from './campaign-model.js?v=campaign-overview1';

/** Page lifecycle only: keep one listener per exact roster character; revoke and dispose promptly. */
export function createCampaignOverviewLive({ campaignId, uid, isSuperGM = false,
  observeCampaign, observeRoster, observeCharacter, observeRolls, onCampaign, onCharacter, onRolls, onRemove, onError }) {
  const entries = new Map();
  let campaign = null, rosterRows = null, stopRoster = null, stopCampaign = null, disposed = false, rosterVersion = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key); entry.active = false;
    entry.stops.forEach(stop => stop()); onRemove(key);
  }
  function clear() { ++rosterVersion; stopRoster?.(); stopRoster = null; rosterRows = null; [...entries.keys()].forEach(remove); }
  async function subscribe(entry, observer, callback) {
    try {
      const stop = await observer({ ownerUid: entry.ownerUid, characterId: entry.characterId,
        onChange: value => { if (entry.active && !disposed) callback(entry.key, value); },
        onError: error => {
          if (!entry.active || disposed) return;
          // A denied activity read must also remove cached vitals and portraits.
          if (error.code === 'permission-denied') remove(entry.key);
          else { entry.characterMissing = true; onRemove(entry.key); }
          onError(error, entry.key);
        },
      });
      if (!entry.active || disposed) stop(); else entry.stops.push(stop);
    } catch (error) { if (entry.active && !disposed) { remove(entry.key); onError(error, entry.key); } }
  }
  function rosterChanged(rows) {
    const active = new Map(rows.filter(row => campaign.memberUids.includes(row.ownerUid))
      .map(row => [JSON.stringify([row.ownerUid, row.characterId]), row]));
    for (const key of entries.keys()) if (!active.has(key)) remove(key);
    for (const [key, row] of active) {
      if (entries.has(key)) continue;
      const entry = { ...row, key, active: true, stops: [] }; entries.set(key, entry);
      void subscribe(entry, observeCharacter, (key, character) => {
        onCharacter(key, character);
        if (entry.characterMissing && entry.rolls) onRolls(key, entry.rolls);
        entry.characterMissing = false;
      });
      void subscribe(entry, observeRolls, (key, rolls) => { entry.rolls = rolls; onRolls(key, rolls); });
    }
  }
  stopCampaign = observeCampaign(campaignId, value => {
    if (disposed) return;
    campaign = value;
    if (!canUseCampaignOverview(value, uid, isSuperGM)) {
      clear(); onCampaign(null); return;
    }
    onCampaign(value);
    // A removed member's links stay dormant. Rejoining changes the campaign,
    // without necessarily changing its roster, so reapply the last confirmed rows.
    if (rosterRows) rosterChanged(rosterRows);
    if (!stopRoster) {
      const version = ++rosterVersion;
      stopRoster = observeRoster(campaignId, rows => {
        if (!disposed && version === rosterVersion) { rosterRows = rows; rosterChanged(rows); }
      }, error => {
        if (disposed || version !== rosterVersion) return;
        clear(); onCampaign(null); onError(error);
      });
    }
  }, error => { if (!disposed) { clear(); onCampaign(null); onError(error); } });
  return { dispose() { disposed = true; stopCampaign?.(); clear(); } };
}
