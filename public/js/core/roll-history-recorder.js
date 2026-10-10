import { createSaveCoordinator } from './save-coordinator.js';
import { characterRollDataFromResult } from './character-roll-history.js';

/** Capture identities at roll time, serialize writes, retain failed activity for retry. */
export function createRollHistoryRecorder({ saveRoll, onStateChange, ...options }) {
  const pending = new Map();
  const coordinator = createSaveCoordinator({ ...options, onStateChange, save: async () => {
    for (const [key, entry] of [...pending]) {
      await saveRoll(entry);
      if (pending.get(key) === entry) pending.delete(key);
    }
  } });
  return {
    ...coordinator,
    record({ ownerUid, characterId, record }) {
      if (record.config.noRoll) return;
      const entry = { ownerUid, characterId, rollId: record.historyId, data: characterRollDataFromResult(record) };
      const key = JSON.stringify([ownerUid, characterId, entry.rollId]);
      const previous = pending.get(key);
      if (previous && JSON.stringify(previous.data) === JSON.stringify(entry.data)) return;
      pending.set(key, entry);
      coordinator.markDirty();
    },
  };
}
