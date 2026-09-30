import { campaignName, createInviteCode, normalizeInviteCode, publicMemberName } from './campaign-model.js';

/** Campaign relationships only. Canonical character reads/saves remain in database-reader/writer. */
export function createCampaignStore({ db, api, readCharacter }) {
  const { collection, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch,
    runTransaction, serverTimestamp, arrayUnion, arrayRemove } = api;
  const campaignRef = id => doc(db, 'campaigns', id);
  const linkRef = (uid, id) => doc(db, 'users', uid, 'characterCampaigns', id);
  const rosterRef = (id, rosterId) => doc(db, 'campaigns', id, 'characters', rosterId);
  const snapshotRows = snap => snap.docs.map(item => ({ ...item.data(), id: item.id }));

  return {
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
    async create({ uid, name, displayName }) {
      const ref = doc(collection(db, 'campaigns'));
      const code = createInviteCode();
      const batch = writeBatch(db);
      batch.set(ref, { name: campaignName(name), ownerUid: uid, gmUid: uid, memberUids: [uid], inviteCode: code,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    async setInvite(id, enabled) {
      const next = enabled ? createInviteCode() : '';
      await runTransaction(db, async transaction => {
        const ref = campaignRef(id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Campaign no longer exists.');
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
      return onSnapshot(collection(db, 'campaigns', id, 'characters'), snap => onChange(snapshotRows(snap)), onError);
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
        if (previous.exists()) transaction.delete(rosterRef(previous.data().campaignId, previous.data().rosterId));
        if (newRoster) {
          transaction.set(ref, { campaignId, rosterId: newRoster.id });
          transaction.set(newRoster, { ownerUid: uid, characterId });
        } else if (previous.exists()) transaction.delete(ref);
      });
    },
  };
}
