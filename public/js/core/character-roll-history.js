import { ATTR_KEYS } from './character-rules.js';
import { requireRollNumber, resolveRollOutcome, buildDamageBands } from './roll-rules.js';
import { sanitizeText } from './data-sanitization.js';

export const RECENT_CHARACTER_ROLL_LIMIT = 10;
const keys = ['label', 'attributeKey', 'attributeValue', 'skillName', 'skillRank', 'modifierDice',
  'dice', 'coin', 'automaticHits', 'hits', 'targetNumber', 'fullDamage', 'onHitDamageBonus', 'normalCritical'];

/** Narrow activity validation, independent of CharacterCodec and character revisions. */
export function validateCharacterRollData(data) {
  const fail = () => { throw new Error('Invalid character roll history record.'); };
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== keys.length || keys.some(key => !Object.hasOwn(data, key))) fail();
  for (const [key, max] of [['label', 240], ['skillName', 96]]) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > max) fail();
  }
  if (!ATTR_KEYS.includes(data.attributeKey) || typeof data.normalCritical !== 'boolean') fail();
  requireRollNumber(data.attributeValue, 'Attribute'); requireRollNumber(data.skillRank, 'Skill rank');
  requireRollNumber(data.modifierDice, 'Dice modifier', { min: -1000, max: 1000, half: true });
  requireRollNumber(data.automaticHits, 'Automatic Hits', { max: 100000 });
  requireRollNumber(data.hits, 'Hits', { max: 100000 });
  if (!Array.isArray(data.dice) || data.dice.length > 10) fail();
  data.dice.forEach(face => requireRollNumber(face, 'Die face', { min: 1, max: 6 }));
  if (![null, 0, 1].includes(data.coin)) fail();
  if (data.hits !== data.dice.reduce((sum, face) => sum + Math.floor((face - 1) / 2), 0) + (data.coin ?? 0) + data.automaticHits) fail();
  if (data.targetNumber !== null) requireRollNumber(data.targetNumber, 'Target number', { max: 100000 });
  if (data.fullDamage !== null) requireRollNumber(data.fullDamage, 'Damage', { max: 1000000 });
  requireRollNumber(data.onHitDamageBonus, 'On-hit damage bonus', { max: 1000000 });
  return { ...data, dice: [...data.dice] };
}

export function characterRollDataFromResult(record) {
  const { config, roll, damage, tn } = record;
  const label = config.source?.startsWith(config.title) ? config.source : [config.title, config.source].filter(Boolean).join(' · ');
  return validateCharacterRollData({
    label: sanitizeText(label, { maxLen: 240, collapse: true }), attributeKey: config.attributeKey,
    attributeValue: roll.pool.attribute, skillName: sanitizeText(config.skill.name, { maxLen: 96, collapse: true }),
    skillRank: config.skill.rank, modifierDice: roll.pool.adjustment, dice: roll.dice.map(die => die.face),
    coin: roll.coin, automaticHits: roll.pool.automaticHits, hits: roll.hits, targetNumber: tn ?? null,
    fullDamage: damage?.ok ? damage.total : null, onHitDamageBonus: config.styles?.rollEffects?.damageBonus || 0,
    normalCritical: !!config.normalCritical,
  });
}

export function characterRollOutcome(data) {
  const outcome = resolveRollOutcome(data.hits, data.targetNumber);
  const band = outcome && data.fullDamage !== null ? buildDamageBands(data.fullDamage, data.hits, {
    normalCritical: data.normalCritical, onHitDamageBonus: data.onHitDamageBonus,
  }).find(item => item.key === outcome.key && (item.key !== 'criticalSuccess' || item.tier === outcome.criticals)) : null;
  return { outcome, damage: band?.damage ?? null };
}
