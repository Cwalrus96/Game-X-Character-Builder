import { normalizeCampaignSettings } from '../core/campaign-settings.js';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

/** A reusable form fragment; persistence and authorization belong to the page. */
export function createCampaignSettingsEditor({ gameData, settings = {}, readOnly = false }) {
  const value = normalizeCampaignSettings(settings);
  const root = node('details', '', 'campaign-settings');
  root.append(node('summary', 'Campaign Settings'));
  root.append(node('p', 'Mark choices unavailable for this setting. Characters must have a compatible class and origin before being added.', 'sub'));
  const controls = {};
  for (const [field, title, entries, keyField] of [
    ['unavailableClassKeys', 'Unavailable classes', gameData.classes || [], 'classKey'],
    ['unavailableOriginKeys', 'Unavailable origins', gameData.origins || [], 'originKey'],
  ]) {
    const fieldset = node('fieldset', '', 'campaign-setting-options'); fieldset.append(node('legend', title));
    controls[field] = [];
    const records = new Map(entries.map(entry => [entry[keyField], entry.name || entry[keyField]]));
    for (const key of value[field]) if (!records.has(key)) records.set(key, `${key} (not in current catalogue)`);
    for (const [key, name] of [...records].sort((a, b) => a[1].localeCompare(b[1]))) {
      if (readOnly && !value[field].includes(key)) continue;
      const label = node('label', '', 'campaign-setting-choice');
      const input = node('input'); input.type = 'checkbox'; input.value = key;
      input.checked = value[field].includes(key); input.disabled = readOnly;
      label.append(input, node('span', name)); fieldset.append(label); controls[field].push(input);
    }
    if (readOnly && !value[field].length) fieldset.append(node('p', 'All available.'));
    root.append(fieldset);
  }
  root.append(node('h3', 'Setting Skills'), node('p', 'Custom skills available to everyone in this campaign. Training uses the usual Skill Points and rank caps. Renaming a skill creates a new choice; previously learned skills keep their ranks.', 'sub'));
  const rows = node('div', '', 'campaign-setting-skills'); root.append(rows);
  const add = node('button', 'Add Setting Skill', 'btn secondary'); add.type = 'button';
  function addSkill(skill = { name: '', description: '' }) {
    const row = node('fieldset', '', 'campaign-setting-skill'); row.append(node('legend', 'Setting Skill'));
    const nameLabel = node('label', 'Skill name', 'field-block');
    const name = node('input'); name.className = 'input'; name.maxLength = 96; name.required = true;
    name.value = skill.name; name.readOnly = readOnly; name.dataset.skillName = '';
    nameLabel.append(name);
    const descriptionLabel = node('label', 'Skill description', 'field-block');
    const description = node('textarea'); description.className = 'input'; description.maxLength = 1000;
    description.rows = 3; description.value = skill.description; description.readOnly = readOnly; description.dataset.skillDescription = '';
    descriptionLabel.append(description); row.append(nameLabel, descriptionLabel);
    if (!readOnly) {
      const remove = node('button', 'Remove skill', 'btn secondary'); remove.type = 'button';
      remove.addEventListener('click', () => { row.remove(); add.disabled = rows.children.length >= 10; add.focus(); });
      row.append(remove);
    }
    rows.append(row); add.disabled = rows.children.length >= 10;
    return name;
  }
  value.settingSkills.forEach(addSkill);
  if (!readOnly) {
    add.addEventListener('click', () => { if (rows.children.length < 10) addSkill().focus(); });
    root.append(add, node('p', 'Up to 10 custom skills per campaign.', 'sub'));
  } else if (!value.settingSkills.length) rows.append(node('p', 'No Setting Skills.'));
  return { element: root, read: () => normalizeCampaignSettings({
    unavailableClassKeys: controls.unavailableClassKeys.filter(input => input.checked).map(input => input.value),
    unavailableOriginKeys: controls.unavailableOriginKeys.filter(input => input.checked).map(input => input.value),
    settingSkills: [...rows.querySelectorAll('.campaign-setting-skill')].map(row => ({
      name: row.querySelector('[data-skill-name]').value, description: row.querySelector('[data-skill-description]').value,
    })),
  }) };
}
