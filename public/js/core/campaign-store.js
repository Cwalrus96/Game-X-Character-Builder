import { campaignName, createInviteCode, normalizeInviteCode, publicMemberName } from './campaign-model.js';
import { normalizeCampaignSettings, campaignCompatibility } from './campaign-settings.js';

/** Campaign relationships only. Canonical character reads/saves remain in database-reader/writer. */
export function createCampaignStore({ db, api, readCharacter }) {
  const { collection, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch,
    runTransaction, serverTimestamp, arrayUnion, arrayRemove, limit, documentId } = api;
  const campaignRef = id => doc(db, 'campaigns', id);
  const linkRef = (uid, id) => doc(db, 'users', uid, 'characterCampaigns', id);
  const rosterRef = (id, rosterId) => doc(db, 'campaigns', id, 'characters', rosterId);
  const snapshotRows = snap => snap.docs.map(item => ({ ...item.data(), id: item.id }));
  const serverRows = api.getDocsFromServer || getDocs;

  async function removeDeletedCampaignLinks(id) {
    // Small paired batches stay inside the Rules access budget. Each query only
    // exposes links to this deleted campaign, never a player's other campaigns.
    while (true) {
      let page = await serverRows(query(collection(db, 'campaigns', id, 'characters'), limit(5)));
      if (page.empty) break;
      for (let attempt = 0; ; attempt++) {
        const batch = writeBatch(db);
        for (const entry of page.docs) {
          const { ownerUid, characterId } = entry.data();
          const links = await serverRows(query(collection(db, 'users', ownerUid, 'characterCampaigns'),
            where('campaignId', '==', id), where(documentId(), '==', characterId), limit(1)));
          const current = links.docs[0];
          if (current?.data().rosterId === entry.id) batch.delete(current.ref);
          batch.delete(entry.ref);
        }
        try { await batch.commit(); break; }
        catch (error) {
          // A player may switch while cleanup is in progress. Refresh filtered
          // links rather than deleting a link that now belongs to another group.
          if (error.code !== 'permission-denied' || attempt >= 2) throw error;
          page = await serverRows(query(collection(db, 'campaigns', id, 'characters'), limit(5)));
          if (page.empty) break;
        }
      }
    }
    while (true) {
      const page = await serverRows(query(collection(db, 'campaigns', id, 'members'), limit(20)));
      if (page.empty) break;
      const batch = writeBatch(db);
      page.docs.forEach(entry => batch.delete(entry.ref));
      await batch.commit();
    }
  }

  return {
    async get(id) {
      const snapshot = await getDoc(campaignRef(id));
      return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
    },
    observeCampaign(id, onChange, onError) {
      return onSnapshot(campaignRef(id), { includeMetadataChanges: true }, snapshot => {
        if (!snapshot.metadata.hasPendingWrites) onChange(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null);
      }, onError);
    },
    observeMine(uid, onChange, onError) {
      return onSnapshot(query(collection(db, 'campaigns'), where('memberUids', 'array-contains', uid)),
        { includeMetadataChanges: true }, snap => {
          // Do not read protected child collections before a local join/create is authorized.
          if (!snap.metadata.hasPendingWrites) onChange(snapshotRows(snap).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)));
        }, onError);
    },
    observeLinks(uid, onChange, onError) {
      return onSnapshot(collection(db, 'users', uid, 'characterCampaigns'),
        { includeMetadataChanges: true }, snap => {
          if (!snap.metadata.hasPendingWrites) onChange(new Map(snapshotRows(snap).map(item => [item.id, item])));
        }, onError);
    },
    async create({ uid, name, displayName, settings = {} }) {
      const ref = doc(collection(db, 'campaigns'));
      const code = createInviteCode();
      const batch = writeBatch(db);
      batch.set(ref, { name: campaignName(name), ownerUid: uid, gmUid: uid, memberUids: [uid], inviteCode: code,
        settings: normalizeCampaignSettings(settings), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(db, 'campaignInvites', code), { campaignId: ref.id });
      batch.set(doc(ref, 'members', uid), { uid, displayName: publicMemberName(displayName), joinCode: code, joinedAt: serverTimestamp() });
      await batch.commit();
      return ref.id;
    },
    async join({ uid, code, displayName }) {
      const normalized = normalizeInviteCode(code);
      const name = publicMemberName(displayName);
      const invite = await getDoc(doc(db, 'campaignInvites', normalized));
      if (!invite.exists()) throw new Error('This invite is unavailable. Ask the creator for a current code.');
      const id = invite.data().campaignId;
      const batch = writeBatch(db);
      batch.update(campaignRef(id), { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() });
      batch.set(doc(db, 'campaigns', id, 'members', uid), {
        uid, displayName: name, joinCode: normalized, joinedAt: serverTimestamp(),
      });
      await batch.commit();
      return id;
    },
    async update({ id, name, gmUid }) {
      const batch = writeBatch(db);
      batch.update(campaignRef(id), { name: campaignName(name), gmUid, updatedAt: serverTimestamp() });
      await batch.commit();
    },
    async deleteCampaign(id) {
      const exists = await runTransaction(db, async transaction => {
        const ref = campaignRef(id);
        const current = await transaction.get(ref);
        if (!current.exists()) return false;
        if (current.data().deletedAt) return true;
        const { ownerUid, inviteCode } = current.data();
        // A minimal, immutable tombstone prevents reuse of this ID from reviving
        // old memberships or character access. No character document is changed.
        transaction.set(ref, { ownerUid, deletedAt: serverTimestamp() });
        if (inviteCode) transaction.delete(doc(db, 'campaignInvites', inviteCode));
        return true;
      });
      if (exists) {
        try { await removeDeletedCampaignLinks(id); }
        catch (cause) {
          const error = new Error('The campaign is deleted, but some links still need to be removed. Use Finish deletion to retry.', { cause });
          error.code = 'campaign-deletion-incomplete';
          throw error;
        }
      }
    },
    async updateSettings(id, settings, { expectedSettings } = {}) {
      const next = normalizeCampaignSettings(settings);
      await runTransaction(db, async transaction => {
        const ref = campaignRef(id);
        const current = await transaction.get(ref);
        if (!current.exists() || current.data().deletedAt) throw new Error('Campaign no longer exists.');
        if (expectedSettings !== undefined && JSON.stringify(normalizeCampaignSettings(current.data().settings)) !== JSON.stringify(normalizeCampaignSettings(expectedSettings))) {
          throw new Error('Campaign settings changed in another tab. Reload before saving again.');
        }
        transaction.update(ref, { settings: next, updatedAt: serverTimestamp() });
      });
    },
    async characterContext({ uid, characterId, fresh = false }) {
      const read = fresh ? (api.getDocFromServer || getDoc) : getDoc;
      const link = await read(linkRef(uid, characterId));
      if (!link.exists()) return null;
      let campaign;
      try { campaign = await read(campaignRef(link.data().campaignId)); }
      catch (error) { if (error.code === 'permission-denied') return null; throw error; }
      if (!campaign.exists() || !campaign.data().memberUids?.includes(uid)) return null;
      return { id: campaign.id, name: campaign.data().name, settings: normalizeCampaignSettings(campaign.data().settings) };
    },
    async setInvite(id, enabled) {
      const next = enabled ? createInviteCode() : '';
      await runTransaction(db, async transaction => {
        const ref = campaignRef(id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists() || snapshot.data().deletedAt) throw new Error('Campaign no longer exists.');
        const previous = snapshot.data().inviteCode;
        transaction.update(ref, { inviteCode: next, updatedAt: serverTimestamp() });
        if (previous) transaction.delete(doc(db, 'campaignInvites', previous));
        if (next) transaction.set(doc(db, 'campaignInvites', next), { campaignId: id });
      });
    },
    async removeMember(id, uid) {
      const batch = writeBatch(db);
      batch.update(campaignRef(id), { memberUids: arrayRemove(uid), updatedAt: serverTimestamp() });
      await batch.commit();
    },
    async members(id) {
      return snapshotRows(await getDocs(collection(db, 'campaigns', id, 'members')));
    },
    observeRoster(id, onChange, onError) {
      return onSnapshot(collection(db, 'campaigns', id, 'characters'), { includeMetadataChanges: true }, snap => {
        if (!snap.metadata.hasPendingWrites) onChange(snapshotRows(snap));
      }, onError);
    },
    async character(entry) {
      return readCharacter({ ownerUid: entry.ownerUid, characterId: entry.characterId });
    },
    async setCharacterCampaign({ uid, characterId, campaignId }) {
      const ref = linkRef(uid, characterId);
      const newRoster = campaignId ? doc(collection(db, 'campaigns', campaignId, 'characters')) : null;
      await runTransaction(db, async transaction => {
        const previous = await transaction.get(ref);
        if (previous.exists() && previous.data().campaignId === campaignId) return;
        if (newRoster) {
          const target = await transaction.get(campaignRef(campaignId));
          const character = await transaction.get(doc(db, 'users', uid, 'characters', characterId));
          if (!target.exists() || target.data().deletedAt || !character.exists()) throw new Error('Campaign or character is unavailable.');
          const conflicts = campaignCompatibility(target.data().settings, character.data().builder);
          if (conflicts.length) throw new Error(`This character’s ${conflicts.join(' and ')} ${conflicts.length > 1 ? 'are' : 'is'} unavailable in ${target.data().name}. Change ${conflicts.length > 1 ? 'them' : 'it'} before adding the character.`);
        }
        if (previous.exists()) transaction.delete(rosterRef(previous.data().campaignId, previous.data().rosterId));
        if (newRoster) {
          transaction.set(ref, { campaignId, rosterId: newRoster.id });
          transaction.set(newRoster, { ownerUid: uid, characterId });
        } else if (previous.exists()) transaction.delete(ref);
      });
    },
  };
}
