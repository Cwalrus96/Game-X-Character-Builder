import { ATTR_KEYS, CORE_SKILL_FIELDS, DEFENSE_SKILL_FIELDS } from "./character-rules.js";
import { getSkillDisplayState } from "./skill-rules.js";
import { canonicalSkillKey, canonicalSkillName } from "./skill-identity.js";
import { createTechniqueContext, getTechniquePerformance } from "./technique-rules.js";
import { evaluatePrerequisite } from "./prerequisite-rules.js";
import { isGameDataRecordExecutable } from "./selection-rules.js";
import { getEffectiveTags } from "./weapon-utils.js";
import { parseDamageFormula } from "./damage-rules.js";

const DEFENSE_ATTRIBUTES = Object.freeze({ rank_physdef: ["strength", "agility"], rank_mentdef: ["intellect", "willpower"], rank_spiritdef: ["attunement", "heart"] });
const sameSkill = (a, b) => canonicalSkillKey(a) === canonicalSkillKey(b);
const splitSkills = value => String(value || "").split(/\s*,\s*/).filter(name => name && !/^(provider|none)$/i.test(name));

export function getRollSkills(gameData, builder) {
  const state = getSkillDisplayState(gameData, builder);
  const skills = new Map();
  const add = (name, rank, attributes = ATTR_KEYS) => {
    const key = canonicalSkillKey(name), previous = skills.get(key);
    skills.set(key, { key, name: canonicalSkillName(name), rank: Math.max(previous?.rank || 0, Number(rank || 0)), attributes });
  };
  for (const field of CORE_SKILL_FIELDS) add(field.label, state.fields[field.key]);
  for (const field of DEFENSE_SKILL_FIELDS) add(field.label.replace(/ Training$/, ""), state.fields[field.key], DEFENSE_ATTRIBUTES[field.key]);
  for (const row of [...state.coreCombatSkills, ...state.repeatables.combatSkillsExtra, ...state.repeatables.settingSkills]) add(row.skill, row.rank);
  return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getRollAttribute(profile, skill, builder, gameData) {
  const raw = String(profile?.attribute || "").toLowerCase();
  if (ATTR_KEYS.includes(raw)) return { key: raw, fixed: true, note: "" };
  if (skill?.attributes?.length === 2) {
    const key = [...skill.attributes].sort((a, b) => Number(builder.attributes?.[b] || 0) - Number(builder.attributes?.[a] || 0))[0];
    return { key, fixed: false, note: "Using the higher defense attribute; you can choose the other attribute." };
  }
  const cls = (gameData.classes || []).find(row => row.classKey === builder.classKey);
  if (raw === "primary" && sameSkill(cls?.combatTechniqueSkill, skill?.name) && ATTR_KEYS.includes(builder.primaryAttribute)) {
    return { key: builder.primaryAttribute, fixed: false, note: "Using your class's primary attribute." };
  }
  return { key: "", fixed: false, note: raw === "primary" ? "Choose the attribute your character uses with this skill." : "Choose the attribute for this check." };
}

function hasWeaponRequirement(rule) {
  return ["weapon", "weapon-set"].includes(rule?.type) || (rule?.alternatives || []).some(hasWeaponRequirement);
}

function fitsWeapon(rule, weapon, context) {
  // A set requirement still checks the full set; the selected attack must also
  // use a member matching that set's weapon constraints.
  if (rule.type === "weapon-set") {
    const { count, separateHands, ...memberRule } = rule;
    return evaluatePrerequisite(rule, context).ok
      && evaluatePrerequisite({ ...memberRule, type: "weapon" }, { ...context, weapons: [weapon] }).ok;
  }
  if (rule.type === "any") return rule.alternatives.some(part => fitsWeapon(part, weapon, context));
  return evaluatePrerequisite(rule, { ...context, weapons: [weapon] }).ok;
}

function performances(profile, context, provider, skills) {
  const names = splitSkills(profile.associatedSkill);
  const results = names.length
    ? names.flatMap(name => getTechniquePerformance({ ...profile, associatedSkill: name }, context, provider).alternatives)
    : getTechniquePerformance(profile, context, provider).alternatives;
  const options = results.filter(option => option.skillName && (provider && sameSkill(option.skillName, provider.skillName)
    || skills.some(skill => sameSkill(skill.name, option.skillName))));
  return options.filter((option, i) => options.findIndex(other => sameSkill(other.skillName, option.skillName)
    && other.rank === option.rank && other.sourceLabel === option.sourceLabel) === i)
    .map(option => ({ ...option, name: canonicalSkillName(option.skillName), key: canonicalSkillKey(option.skillName), attributes: ATTR_KEYS }));
}

// These are exact, source-backed mechanical phrases, not guesses based on names.
export function getTechniqueRollAdjustments(profiles) {
  let dice = 0, hitsMultiplier = 1;
  for (const profile of profiles) {
    const text = String(profile.description || "");
    const penalty = /You take a -(\d+)D? penalty to the attack roll\./i.exec(text);
    if (penalty) dice -= Number(penalty[1]);
    if (/Double the [“"']?Hits[”"']? for the purpose of calculating the attack[’']s damage\./i.test(text)) hitsMultiplier *= 2;
  }
  return { dice, hitsMultiplier };
}

/** Resolve one attack at a time; retain wrapper effects without inventing extra rolls. */
export function getTechniqueRollChoices({ technique, gameData, builder, weaponId = "", provider = null }) {
  const skills = getRollSkills(gameData, builder);
  const initial = createTechniqueContext({ gameData, builder });
  const weapons = initial.weapons.map((weapon, index) => ({ ...weapon,
    id: weapon.id || `sheet-weapon-${index}`,
    tags: getEffectiveTags(weapon, gameData.weaponBases),
    name: weapon.customName || weapon.name || (gameData.weaponBases || []).find(base => base.weaponKey === weapon.weaponKey)?.name || weapon.weaponKey,
  }));
  const context = { ...initial, weapons, skillRanks: new Map([...initial.skillRanks, ...skills.map(skill => [skill.name, skill.rank])]) };
  const choices = [], diagnostics = [];
  const byKey = new Map((gameData.techniques || []).map(row => [row.techniqueKey, row]));
  const rootWeaponId = weaponId || provider?.weaponId || "";
  const basicOptions = weapon => {
    const base = (gameData.weaponBases || []).find(row => row.weaponKey === weapon.weaponKey);
    const keys = weapon.techniqueKeys || base?.techniqueKeys || [];
    // Offer direct damaging attacks explicitly linked to this weapon. If more
    // than one qualifies, the player chooses; source ordering is not a rule.
    return keys.map(key => byKey.get(key)).filter(row => row && row.rollRequired === true && !row.basicAttack?.length && row.damage);
  };

  function visit(profile, selectedWeapon, overrides = {}, ancestors = []) {
    if (!profile) { diagnostics.push("An underlying attack could not be found."); return; }
    if (ancestors.some(row => row.techniqueKey === profile.techniqueKey) || ancestors.length >= 12) {
      diagnostics.push("This attack contains a circular or excessively nested reference."); return;
    }
    if (!isGameDataRecordExecutable(profile)) { diagnostics.push(`${profile.techniqueName}: incomplete mechanics.`); return; }
    const chain = [...ancestors, profile];
    if (profile.basicAttack?.length) {
      if (profile.rollRequired !== false) { diagnostics.push("This technique needs separate attack and technique rolls; resolve them individually."); return; }
      function follow(clause) {
        if (clause.type === "any") { clause.alternatives.forEach(follow); return; }
        const nextOverrides = { ...overrides, ...(clause.attribute ? { attribute: clause.attribute } : {}), ...(clause.defense ? { defense: clause.defense } : {}) };
        if (clause.type === "technique") visit(byKey.get(clause.key), selectedWeapon, nextOverrides, chain);
        else if (clause.type === "weapon") {
          for (const weapon of selectedWeapon ? [selectedWeapon] : weapons) {
            if (rootWeaponId && weapon.id !== rootWeaponId) continue;
            if (!chain.every(row => (row.prerequisites || []).every(rule => fitsWeapon(rule, weapon, context)))) continue;
            for (const attack of basicOptions(weapon)) visit(attack, weapon, nextOverrides, chain);
          }
        } else diagnostics.push("This underlying attack type is not supported yet.");
      }
      profile.basicAttack.forEach(follow);
      return;
    }

    const needsWeapon = rootWeaponId || selectedWeapon || parseDamageFormula(profile.damage).rankBasis === "weapon"
      || profile.attribute === "Weapon Attribute" || chain.some(row => (row.prerequisites || []).some(hasWeaponRequirement));
    for (const weapon of selectedWeapon ? [selectedWeapon] : needsWeapon ? weapons : [null]) {
      if (rootWeaponId && weapon?.id !== rootWeaponId) continue;
      if (weapon && !chain.every(row => (row.prerequisites || []).every(rule => fitsWeapon(rule, weapon, context)))) continue;
      if (!weapon && !chain.every(row => (row.prerequisites || []).every(rule => evaluatePrerequisite(rule, context).ok))) continue;
      const scoped = weapon ? { ...context, weapons: [weapon] } : context;
      const supplied = weapon?.derived ? { skillName: weapon.associatedSkill, rank: weapon.rank, weaponId: weapon.id, sourceLabel: weapon.sourceLabel }
        : provider && (!provider.weaponId || provider.weaponId === weapon?.id) ? provider : null;
      const options = performances(profile, scoped, supplied, skills);
      let resolved = { ...profile, ...overrides };
      if (resolved.attribute === "Weapon Attribute" && weapon) {
        const attributes = [...new Set(basicOptions(weapon).map(row => row.attribute).filter(Boolean))];
        if (attributes.length === 1) resolved.attribute = attributes[0];
      }
      choices.push({ id: `${choices.length}`, profile: resolved, profiles: chain, weapon,
        label: [profile.techniqueName, weapon?.name].filter(Boolean).join(" · "),
        skills: options.length ? options : skills, manualSkill: !options.length,
        noRoll: profile.rollRequired === false,
        adjustments: getTechniqueRollAdjustments(chain),
      });
    }
  }
  visit(technique, null);
  if (!choices.length && !diagnostics.length) {
    const unmet = (technique.prerequisites || []).map(rule => evaluatePrerequisite(rule, context)).filter(result => !result.ok);
    diagnostics.push(...unmet.map(result => `Requires ${result.label}.`));
    if (!unmet.length) diagnostics.push("No eligible attack or weapon could be resolved for this technique.");
  }
  return { choices, diagnostics: [...new Set(diagnostics)] };
}
