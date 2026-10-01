import { campaigns } from './campaign-client.js';
import { loadGameXData } from './game-data.js';
import { campaignSettingsFingerprint } from './campaign-settings.js';

const contexts = new WeakMap();

/** Page orchestration: shared catalogue stays immutable and free of Firebase. */
export async function loadCharacterGameData({ ownerUid, characterId, cache = 'default' }) {
  const [data, campaignContext] = await Promise.all([
    loadGameXData({ cache }), campaigns.characterContext({ uid: ownerUid, characterId }),
  ]);
  const result = { ...data, campaignContext };
  contexts.set(result, { uid: ownerUid, characterId, fingerprint: campaignSettingsFingerprint(campaignContext) });
  return result;
}

export async function assertCharacterCampaignCurrent(gameData) {
  const loaded = contexts.get(gameData);
  if (!loaded) return;
  const current = await campaigns.characterContext({ ...loaded, fresh: true });
  if (campaignSettingsFingerprint(current) !== loaded.fingerprint) {
    const error = new Error('Campaign settings or membership changed. Reload this page before saving; your pending edits have not been saved.');
    error.code = 'campaign-context-changed';
    throw error;
  }
}
