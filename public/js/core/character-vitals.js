import { ATTR_KEYS, clampLevel, coerceAttrKey, normalizeAttributes, getAttributeEffectiveCap,
  computeMaxHPFromProgression, computeSpeed, computePhysicalDefense, computeMentalDefense, computeSpiritDefense } from './character-rules.js?v=campaign-overview1';
import { getSkillDisplayState } from './skill-rules.js';
import { toInt } from './data-sanitization.js';

/** Shared read projection, including granted defense training. Never uses saved derived fields. */
export function projectCharacterVitals({ builder = {}, gameData = {} } = {}) {
  const level = clampLevel(builder.level ?? 1);
  const primary = coerceAttrKey(builder.primaryAttribute);
  const attributes = normalizeAttributes(builder.attributes || {});
  for (const key of ATTR_KEYS) attributes[key] = toInt(attributes[key], {
    min: key === primary ? 1 : 0, max: getAttributeEffectiveCap(level, key, primary),
  });
  const skills = getSkillDisplayState(gameData, { ...builder, level, attributes }).fields;
  const classRecord = (gameData.classes || []).find(item => item.classKey === builder.classKey);
  return {
    level, className: classRecord?.name || builder.classKey || 'N/A / Other', attributes,
    maxHP: computeMaxHPFromProgression({ level, attributes, hpProgression: classRecord?.hpProgression }),
    physicalDefense: computePhysicalDefense({ attributes, trainingRank: skills.rank_physdef }),
    mentalDefense: computeMentalDefense({ attributes, trainingRank: skills.rank_mentdef }),
    spiritualDefense: computeSpiritDefense({ attributes, trainingRank: skills.rank_spiritdef }),
    speed: computeSpeed(attributes),
  };
}
