import { canonicalSkillKey, canonicalSkillName } from './skill-identity.js';

export function normalizeCampaignSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['unavailableClassKeys', 'unavailableOriginKeys', 'settingSkills'].includes(key))) {
    throw new Error('Invalid campaign settings.');
  }
  function list(key, limit) {
    const values = value[key] ?? [];
    if (!Array.isArray(values) || values.length > 50) throw new Error('Use at most 50 entries per campaign setting.');
    const seen = new Set();
    return values.map(raw => {
      if (typeof raw !== 'string') throw new Error('Campaign settings must contain text entries.');
      const text = raw.trim();
      if (!text || text.length > limit || !/^[a-zA-Z0-9_-]+$/.test(text)) throw new Error('Invalid catalogue key.');
      if (seen.has(text)) throw new Error(`Duplicate campaign setting: ${text}.`);
      seen.add(text);
      return text;
    }).sort((a, b) => a.localeCompare(b));
  }
  const skills = value.settingSkills ?? [];
  if (!Array.isArray(skills) || skills.length > 10) throw new Error('Use at most 10 Setting Skills.');
  const seen = new Set();
  const settingSkills = skills.map(skill => {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)
      || Object.keys(skill).some(key => !['name', 'description'].includes(key))
      || typeof skill.name !== 'string' || typeof skill.description !== 'string') throw new Error('Each Setting Skill needs a name and description.');
    const name = canonicalSkillName(skill.name.trim().replace(/\s+/g, ' '));
    const description = skill.description.trim();
    const key = canonicalSkillKey(name);
    if (!key || !name || name.length > 96 || /[<>\u0000-\u001f]/.test(name) || description.length > 1000) throw new Error('Use a skill name of 1–96 characters and description of at most 1,000 characters.');
    if (seen.has(key)) throw new Error(`Duplicate Setting Skill: ${name}.`);
    seen.add(key);
    return { name, description };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { unavailableClassKeys: list('unavailableClassKeys', 64), unavailableOriginKeys: list('unavailableOriginKeys', 64), settingSkills };
}

export function campaignCompatibility(settings, builder = {}) {
  const current = normalizeCampaignSettings(settings);
  return [current.unavailableClassKeys.includes(builder.classKey) ? 'class' : '',
    current.unavailableOriginKeys.includes(builder.originKey) ? 'origin' : ''].filter(Boolean);
}

export function campaignChoiceUnavailable(gameData, field, key) {
  const list = field === 'classKey' ? 'unavailableClassKeys' : 'unavailableOriginKeys';
  return !!key && (gameData?.campaignContext?.settings?.[list] || []).includes(key);
}

export function campaignChoiceImpacts(gameData, builder, previousBuilder = builder) {
  return ['classKey', 'originKey'].filter(field => campaignChoiceUnavailable(gameData, field, builder?.[field])).map(field => {
    const retained = builder[field] === previousBuilder?.[field];
    const type = field === 'classKey' ? 'class' : 'origin';
    return { category: retained ? 'informational' : 'error', type: retained ? 'incomplete' : 'invalid',
      code: `campaign-${type}-unavailable`, path: `builder.${field}`,
      message: `This ${type} is unavailable in ${gameData.campaignContext.name}.${retained ? ' Your existing choice is preserved; discuss it with your GM.' : ' Choose another option.'}` };
  });
}

export function campaignSettingsFingerprint(context) {
  return JSON.stringify(context ? { id: context.id, settings: normalizeCampaignSettings(context.settings) } : null);
}
