import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDicePool, resolveDicePool } from '../public/js/core/roll-rules.js';
import { characterRollDataFromResult, validateCharacterRollData, characterRollOutcome } from '../public/js/core/character-roll-history.js';
import { createRollHistoryRecorder } from '../public/js/core/roll-history-recorder.js';
import { saveCharacterRoll } from '../public/js/core/database-writer.js';

function result(id = 'roll-one', tn = null) {
  return { historyId: id, tn, config: { title: 'Strike', source: 'Strike · Sword', attributeKey: 'agility', skill: { name: 'Melee Weapons', rank: 2 },
    styles: { rollEffects: { damageBonus: 2 } }, normalCritical: false },
  roll: resolveDicePool(buildDicePool({ attribute: 2, skillRank: 2, modifiers: [0.5] }), () => 2), damage: { ok: true, total: 10 } };
}
test('activity preserves exact dice, half-die coin, modifiers, hits and optional TN', () => {
  const record = result(); const value = characterRollDataFromResult(record);
  assert.equal(value.label, 'Strike · Sword'); assert.deepEqual(value.dice, [2, 2, 2, 2]);
  assert.equal(value.coin, 1); assert.equal(value.hits, 1); assert.equal(value.modifierDice, 0.5);
  assert.equal(value.targetNumber, null);
  for (const patch of [{ hits: 9 }, { dice: [7] }, { dice: Array(11).fill(1) }, { coin: 2 }, { targetNumber: -1 },
    { modifierDice: 0.25 }, { attributeKey: 'other' }, { skillName: '' }, { extra: true }, { automaticHits: -1 }]) {
    assert.throws(() => validateCharacterRollData({ ...value, ...patch }));
  }
  assert.equal(characterRollOutcome({ ...value, targetNumber: 2 }).damage, 5, 'on-hit bonus excluded from failure');
  assert.equal(characterRollOutcome({ ...value, targetNumber: 1 }).damage, 12);
  assert.equal(characterRollOutcome({ ...value, dice: [6, 6, 6, 6], hits: 9, targetNumber: 0 }).damage, 48);
  assert.equal(characterRollOutcome({ ...value, hits: 9, targetNumber: 0, normalCritical: true }).damage, 12);
});
test('failed activity retries the same identity and coalesces TN while retaining other rolls', async () => {
  let fail = true; const saved = [];
  const recorder = createRollHistoryRecorder({ setTimer: () => 1, clearTimer() {}, saveRoll: async entry => {
    saved.push(structuredClone(entry)); if (fail) throw new Error('Offline');
  } });
  recorder.record({ ownerUid: 'one', characterId: 'hero', record: result() });
  assert.equal(await recorder.flush(), false); assert.equal(recorder.getState().dirty, true);
  recorder.record({ ownerUid: 'one', characterId: 'hero', record: result('roll-one', 4) });
  recorder.record({ ownerUid: 'two', characterId: 'other', record: result('roll-two') });
  fail = false; assert.equal(await recorder.retry(), true);
  assert.deepEqual(saved.map(item => [item.ownerUid, item.rollId, item.data.targetNumber]), [['one', 'roll-one', null], ['one', 'roll-one', 4], ['two', 'roll-two', null]]);
  assert.equal(recorder.getState().dirty, false);
});
test('an in-flight TN correction gets its own acknowledged save without dropping a new roll', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }); const saved = [];
  const recorder = createRollHistoryRecorder({ setTimer: () => 1, clearTimer() {}, saveRoll: async entry => { saved.push(entry); if (saved.length === 1) await gate; } });
  recorder.record({ ownerUid: 'one', characterId: 'hero', record: result() }); const flush = recorder.flush();
  recorder.record({ ownerUid: 'one', characterId: 'hero', record: result('roll-one', 5) });
  recorder.record({ ownerUid: 'one', characterId: 'hero', record: result('roll-two') }); release();
  assert.equal(await flush, true); assert.equal(saved.length, 3);
  assert.equal(saved[0].data.targetNumber, null); assert.equal(saved[1].data.targetNumber, 5);
  assert.equal(recorder.getState().dirty, false);
});
test('activity writer is idempotent and permits only TN correction, never parent-character writes', async () => {
  let raw; const writes = [];
  const transaction = { get: async () => ({ exists: () => !!raw, data: () => raw }),
    set: (path, value) => { raw = value; writes.push(path); }, update: (path, value) => { Object.assign(raw, value); writes.push(path); } };
  const api = { doc: (...parts) => parts, runTransaction: (db, action) => action(transaction), serverTimestamp: () => 'timestamp' };
  const request = { ownerUid: 'one', characterId: 'hero', rollId: 'roll-one', data: characterRollDataFromResult(result()), firestore: {}, firestoreApi: api };
  await saveCharacterRoll(request); await saveCharacterRoll(request); assert.equal(writes.length, 1);
  await saveCharacterRoll({ ...request, data: { ...request.data, targetNumber: 4 } }); assert.equal(raw.targetNumber, 4);
  assert.equal(raw.createdAt, 'timestamp'); assert.equal(raw.actorUid, 'one');
  assert.deepEqual(writes[0].slice(1), ['users', 'one', 'characters', 'hero', 'rolls', 'roll-one']);
  await assert.rejects(saveCharacterRoll({ ...request, data: { ...request.data, label: 'Forged' } }), /cannot be replaced/);
  await assert.rejects(saveCharacterRoll({ ...request, rollId: '../hero' }));
});
