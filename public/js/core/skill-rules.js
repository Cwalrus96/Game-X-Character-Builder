// Pure skill rules and allocation projections shared by graph and UI consumers.
// This module is the sole owner of skill progression, rank-cap, point-budget,
// grant-rank, and class-utility-choice policy.

import {
  CORE_SKILL_FIELDS,
  DEFENSE_SKILL_FIELDS,
  getSkillPointCostForRank,
  getSpendableSkillPoints,
  getStandardSkillRankCap,
  normalizeSkillRank,
} from "./character-rules.js";
import {
  sanitizeNamedSkillList,
  sanitizeStringArray,
  sanitizeText,
} from "./data-sanitization.js";
import {
  createCharacterGrantCollection,
  getGameXClasses,
  getGameXClassFeatures,
  getGameXFeats,
} from "./game-data.js";
import { getGrantName, getGrantNotes, normalizeSkillProgression } from "./grants.js";
import { collectSelectedEntries } from "./option-groups.js";

export const CLASS_UTILITY_SKILL_CHOICE_COUNT = 2;

const DEFENSE_FIELD_BY_NAME = new Map([
  ["Physical Defense", "rank_physdef"],
  ["Mental Defense", "rank_mentdef"],
  ["Spiritual Defense", "rank_spiritdef"],
]);
const CORE_FIELD_BY_SKILL_KEY = new Map(CORE_SKILL_FIELDS.map(({ key, label }) => [slug(label), key]));
const CORE_LABEL_BY_FIELD = new Map(CORE_SKILL_FIELDS.map(({ key, label }) => [key, label]));

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return value && typeof value === "object" ? Object.freeze(value) : value;
}

function slug(value) {
  return sanitizeText(value, { maxLen: 96, collapse: true })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function numericRank(value) {
  const rank = normalizeSkillRank(value, { allowBlank: true });
  return rank === "" ? 0 : Number(rank);
}

function descriptionBundle(...parts) {
  return parts.map((part) => sanitizeText(part, { maxLen: 4000, collapse: true })).filter(Boolean).join(" ");
}

function grantSourceText(entry) {
  return descriptionBundle(entry?.description, getGrantNotes(entry), entry?.name);
}

function extractSkillProgressionFromText(value) {
  const match = sanitizeText(value, { maxLen: 4000, collapse: true })
    .match(/\b(fast|medium|slow)\b(?:\s+skill\s+progression)?/i);
  return match ? normalizeSkillProgression(match[1]) : "";
}

function extractGrantedSkillRankFromText(value) {
  const source = sanitizeText(value, { maxLen: 4000, collapse: true }).toLowerCase();
  if (/\badvanced training\b/.test(source)) return "2";
  if (/\bbeginner training\b/.test(source) || /\brank\s*1\b/.test(source)) return "1";
  if (/\buntrained\b/.test(source) || /\brank\s*0\b/.test(source)) return "0";
  return "";
}

export function getSkillProgressionRank(progression, level) {
  const normalized = normalizeSkillProgression(progression);
  const currentLevel = Math.max(1, Math.min(12, Number.parseInt(String(level ?? 1), 10) || 1));
  if (!normalized) return "";
  let rank = normalized === "slow" ? 0 : 1;
  const breakpoints = normalized === "fast"
    ? [3, 5, 7, 9, 11]
    : normalized === "medium" ? [4, 7, 9, 11] : [3, 6, 9, 11];
  for (const breakpoint of breakpoints) if (currentLevel >= breakpoint) rank += 1;
  return String(Math.max(0, Math.min(6, rank)));
}

function normalizeCombatSkillName(raw) {
  const source = sanitizeText(raw, { maxLen: 96, collapse: true });
  const value = sanitizeText(source.split(":")[0].split("(")[0], { maxLen: 96, collapse: true });
  return /^(?:fast|medium|slow)$/i.test(value) ? "" : value;
}

function splitCombatSkillNames(raw) {
  return sanitizeText(raw, { maxLen: 200, collapse: true }).split(",")
    .map(normalizeCombatSkillName).filter(Boolean);
}

function matchesPrimaryCondition(value, primaryAttribute) {
  const source = sanitizeText(value, { maxLen: 200, collapse: true }).toLowerCase();
  if (!/primary/.test(source)) return true;
  const primary = sanitizeText(primaryAttribute, { maxLen: 32, collapse: true }).toLowerCase();
  return Boolean(primary && source.includes(primary));
}

function resolveClassCombatSkillEntries(cls, primaryAttribute) {
  const output = [];
  let pendingSkillName = "";
  for (const entry of Array.isArray(cls?.combatSkills) ? cls.combatSkills : []) {
    const rawName = sanitizeText(entry?.name, { maxLen: 160, collapse: true });
    const explicitProgression = normalizeSkillProgression(entry?.progression);
    if (!rawName && !explicitProgression) continue;
    const skillName = normalizeCombatSkillName(rawName);
    const progression = explicitProgression || extractSkillProgressionFromText(rawName);
    if (skillName) {
      pendingSkillName = skillName;
      if (matchesPrimaryCondition(rawName, primaryAttribute)) output.push({ skillName, progression });
    } else if (pendingSkillName && progression && matchesPrimaryCondition(rawName, primaryAttribute)) {
      output.push({ skillName: pendingSkillName, progression });
    }
  }
  return output;
}

function pushGrantedSkill(target, skillName, rank, source) {
  const skill = sanitizeText(skillName, { maxLen: 96, collapse: true });
  if (!skill) return;
  const next = { skill, rank: sanitizeText(rank, { maxLen: 8, collapse: true }), source: sanitizeText(source, { maxLen: 96, collapse: true }) || "Granted" };
  const previous = target.get(skill);
  if (!previous || numericRank(next.rank) > numericRank(previous.rank)) target.set(skill, next);
}

function skillGrantCollection(gameData, builder) {
  try {
    return createCharacterGrantCollection(gameData, builder);
  } catch {
    // Graph registries may intentionally exercise extension grant types. An
    // unrelated custom grant must not make the shared skill projection throw.
    return { skillGrants: [], techniqueGrants: [], techniqueChoiceGrants: [] };
  }
}

export function computeKnownCombatSkillsAndGrants(gameData, builder) {
  const data = gameData && typeof gameData === "object" ? gameData : {};
  const state = builder && typeof builder === "object" ? builder : {};
  const collection = skillGrantCollection(data, state);
  const knownCombatSkills = new Set(["Martial Arts", "Melee Weapons", "Targeting"]);
  const grantedTechniqueNames = new Set();
  const cls = getGameXClasses(data).find((entry) => entry?.classKey === state.classKey);
  if (cls) {
    splitCombatSkillNames(cls.combatTechniqueSkill).forEach((name) => knownCombatSkills.add(name));
    resolveClassCombatSkillEntries(cls, state.primaryAttribute).forEach(({ skillName }) => knownCombatSkills.add(skillName));
  }
  collection.skillGrants.forEach((grant) => knownCombatSkills.add(normalizeCombatSkillName(getGrantName(grant))));
  collection.techniqueGrants.forEach((grant) => grantedTechniqueNames.add(getGrantName(grant)));
  knownCombatSkills.delete("");
  grantedTechniqueNames.delete("");
  return { knownCombatSkills, grantedTechniqueNames, techniqueChoiceGrants: collection.techniqueChoiceGrants };
}

export function computeGrantedSkillsState(gameData, builder) {
  const data = gameData && typeof gameData === "object" ? gameData : {};
  const state = builder && typeof builder === "object" ? builder : {};
  const level = Math.max(1, Math.min(12, Number.parseInt(String(state.level ?? 1), 10) || 1));
  const fixedRanks = { rank_physdef: "", rank_mentdef: "", rank_spiritdef: "" };
  const grantedSkillNames = new Set();
  const grantedCombatSkills = new Map();
  ["Martial Arts", "Melee Weapons", "Targeting"].forEach((name) => pushGrantedSkill(grantedCombatSkills, name, "0", "Common"));

  const cls = getGameXClasses(data).find((entry) => entry?.classKey === state.classKey);
  if (cls) {
    for (const entry of resolveClassCombatSkillEntries(cls, state.primaryAttribute)) {
      const rank = getSkillProgressionRank(entry.progression, level);
      grantedSkillNames.add(entry.skillName);
      const defenseField = DEFENSE_FIELD_BY_NAME.get(entry.skillName);
      if (defenseField) fixedRanks[defenseField] = rank;
      else pushGrantedSkill(grantedCombatSkills, entry.skillName, rank, "Class");
    }
    for (const skillName of splitCombatSkillNames(cls.combatTechniqueSkill)) {
      grantedSkillNames.add(skillName);
      if (!DEFENSE_FIELD_BY_NAME.has(skillName)) pushGrantedSkill(grantedCombatSkills, skillName, "", "Class");
    }
  }

  for (const grant of skillGrantCollection(data, state).skillGrants) {
    const skillName = normalizeCombatSkillName(getGrantName(grant));
    if (!skillName) continue;
    const source = grant?.source || {};
    const ranks = [
      Number.parseInt(String(grant?.rank ?? ""), 10),
      Number.parseInt(getSkillProgressionRank(grant?.progression, level)
        || getSkillProgressionRank(extractSkillProgressionFromText(grantSourceText(source)), level) || "", 10),
      Number.parseInt(extractGrantedSkillRankFromText(grantSourceText(source)), 10),
    ].filter(Number.isFinite);
    const rank = ranks.length ? String(Math.max(0, Math.min(6, Math.max(...ranks)))) : "";
    const sourceName = sanitizeText(source?.name || source?.featureName, { maxLen: 96, collapse: true }) || "Granted";
    grantedSkillNames.add(skillName);
    const defenseField = DEFENSE_FIELD_BY_NAME.get(skillName);
    if (defenseField) fixedRanks[defenseField] = rank;
    else pushGrantedSkill(grantedCombatSkills, skillName, rank, sourceName);
  }
  return { fixedRanks, grantedSkillNames, grantedCombatSkills: [...grantedCombatSkills.values()].sort((a, b) => a.skill.localeCompare(b.skill)) };
}

export function getClassUtilitySkillState(gameData, builder) {
  const state = builder && typeof builder === "object" ? builder : {};
  const classKey = sanitizeText(state.classKey, { maxLen: 64, collapse: true });
  let options = (Array.isArray(gameData?.classSkills) ? gameData.classSkills : [])
    .filter((entry) => entry?.classKey === classKey && entry?.role === "utility-option" && entry?.skillKey)
    .map((entry) => ({ key: sanitizeText(entry.skillKey, { maxLen: 128, collapse: true }), label: sanitizeText(entry.skillName || entry.skillKey, { maxLen: 96, collapse: true }) }));
  if (!options.length) {
    const cls = getGameXClasses(gameData).find((entry) => entry?.classKey === classKey);
    options = sanitizeStringArray(cls?.utilitySkillOptions, { maxItems: 100, maxLen: 96 })
      .map((label) => ({ key: slug(label), label }));
  }
  const optionByKey = new Map(options.map((option) => [option.key, option]));
  const selected = [];
  const seen = new Set();
  for (const value of sanitizeStringArray(state.selectedClassUtilitySkills, { maxItems: 50, maxLen: 96 })) {
    const key = optionByKey.has(value) ? value : slug(value);
    if (!optionByKey.has(key) || seen.has(key)) continue;
    seen.add(key);
    selected.push(key);
  }
  const expectedCount = Math.min(CLASS_UTILITY_SKILL_CHOICE_COUNT, options.length);
  return freeze({ classKey, options, selected, expectedCount, remaining: Math.max(0, expectedCount - selected.length), overCapacity: Math.max(0, selected.length - expectedCount) });
}

function extractSkillCapBonusesFromText(value, target) {
  const source = sanitizeText(value, { maxLen: 4000, collapse: true });
  const regex = /train the\s+(.+?)\s+skill up to\s+(\d+)\s+rank higher than the standard skill rank cap/gi;
  for (let match = regex.exec(source); match; match = regex.exec(source)) {
    const name = sanitizeText(match[1], { maxLen: 96, collapse: true }).toLowerCase();
    const bonus = Number.parseInt(match[2], 10);
    if (name && bonus > 0) target.set(name, Math.max(target.get(name) || 0, bonus));
  }
}

export function getSkillCapBonuses(gameData, builder) {
  const state = builder && typeof builder === "object" ? builder : {};
  const output = new Map();
  const level = Math.max(1, Math.min(12, Number.parseInt(String(state.level ?? 1), 10) || 1));
  const selectedClassOptions = new Set(sanitizeStringArray(state.selectedClassFeatureOptions, { maxItems: 500, maxLen: 200 }));
  for (const feature of getGameXClassFeatures(gameData, state.classKey)) {
    if ((Number.parseInt(String(feature?.level ?? 1), 10) || 1) > level) continue;
    extractSkillCapBonusesFromText(descriptionBundle(feature?.name, feature?.description, getGrantNotes(feature)), output);
    for (const option of collectSelectedEntries([feature], selectedClassOptions)) {
      extractSkillCapBonusesFromText(descriptionBundle(option?.name, option?.description, getGrantNotes(option)), output);
    }
  }
  const selectedFeats = new Set(sanitizeStringArray(state.selectedFeats, { maxItems: 200, maxLen: 160 }));
  const selectedFeatOptions = new Set(sanitizeStringArray(state.selectedFeatOptions, { maxItems: 500, maxLen: 200 }));
  for (const feat of getGameXFeats(gameData)) {
    if (!selectedFeats.has(feat?.featKey) || (Number.parseInt(String(feat?.minLevel ?? 0), 10) || 0) > level) continue;
    extractSkillCapBonusesFromText(descriptionBundle(feat?.name, feat?.description, getGrantNotes(feat)), output);
    for (const option of collectSelectedEntries([feat], selectedFeatOptions)) {
      extractSkillCapBonusesFromText(descriptionBundle(option?.name, option?.description, getGrantNotes(option)), output);
    }
  }
  return output;
}

function allocationRecords(gameData, builder) {
  const fields = builder?.sheet?.fields && typeof builder.sheet.fields === "object" ? builder.sheet.fields : {};
  const repeatables = builder?.sheet?.repeatables && typeof builder.sheet.repeatables === "object" ? builder.sheet.repeatables : {};
  const utility = getClassUtilitySkillState(gameData, builder);
  const utilitySet = new Set(utility.selected);
  const capBonuses = getSkillCapBonuses(gameData, builder);
  const baseCap = getStandardSkillRankCap(builder?.level);
  const capFor = (name) => Math.min(6, baseCap + (capBonuses.get(String(name || "").toLowerCase()) || 0));
  const fixed = CORE_SKILL_FIELDS.map(({ key, label }) => {
    const grantedRank = utilitySet.has(slug(label)) ? 1 : 0;
    const rank = Math.max(grantedRank, numericRank(fields[key]));
    return { domain: "fixed", key, name: label, rank, storedRank: normalizeSkillRank(fields[key], { allowBlank: true }), grantedRank, editable: true, cap: capFor(label), path: `builder.sheet.fields.${key}` };
  });
  const combat = sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 }).map((row, index) => ({ domain: "combat", key: row.skill.toLowerCase(), name: row.skill, rank: numericRank(row.rank), storedRank: normalizeSkillRank(row.rank, { allowBlank: true }), grantedRank: 0, editable: true, cap: capFor(row.skill), path: `builder.sheet.repeatables.combatSkillsExtra.${index}.rank`, index }));
  const utilityOptionByKey = new Map(utility.options.map((option) => [option.key, option]));
  const nonCoreUtilityKeys = new Set(utility.selected.filter((key) => !CORE_FIELD_BY_SKILL_KEY.has(key)));
  const representedUtilityKeys = new Set();
  const setting = sanitizeNamedSkillList(repeatables.settingSkills, { maxItems: 50 }).map((row, index) => {
    const utilityKey = slug(row.skill);
    const grantedRank = nonCoreUtilityKeys.has(utilityKey) ? 1 : 0;
    if (grantedRank) representedUtilityKeys.add(utilityKey);
    return { domain: "setting", key: row.skill.toLowerCase(), name: utilityOptionByKey.get(utilityKey)?.label || row.skill, rank: Math.max(grantedRank, numericRank(row.rank)), storedRank: normalizeSkillRank(row.rank, { allowBlank: true }), grantedRank, editable: true, cap: capFor(row.skill), path: `builder.sheet.repeatables.settingSkills.${index}.rank`, index, virtual: false };
  });
  for (const utilityKey of nonCoreUtilityKeys) {
    if (representedUtilityKeys.has(utilityKey)) continue;
    const name = utilityOptionByKey.get(utilityKey)?.label || utilityKey;
    setting.push({ domain: "setting", key: name.toLowerCase(), name, rank: 1, storedRank: "", grantedRank: 1, editable: true, cap: capFor(name), path: "builder.sheet.repeatables.settingSkills", index: -1, virtual: true });
  }
  return { fixed, combat, setting, utility, baseCap };
}

export function getSkillAllocationState(gameData, builder) {
  const records = allocationRecords(gameData, builder);
  const total = getSpendableSkillPoints(builder?.level, builder?.attributes?.intellect);
  const spent = [...records.fixed, ...records.combat, ...records.setting]
    .reduce((sum, record) => sum + getSkillPointCostForRank(record.rank, { grantedRank: record.grantedRank }), 0);
  const remaining = total - spent;
  const withMaximum = (record) => ({ ...record, minimumAssignable: record.grantedRank, maximumAssignable: record.editable ? Math.min(record.cap, record.rank + Math.max(0, remaining)) : record.rank });
  const granted = computeGrantedSkillsState(gameData, builder);
  return freeze({
    level: Math.max(1, Math.min(12, Number.parseInt(String(builder?.level ?? 1), 10) || 1)),
    intellect: Number.parseInt(String(builder?.attributes?.intellect ?? 0), 10) || 0,
    total,
    spent,
    remaining,
    baseRankCap: records.baseCap,
    utility: records.utility,
    fixed: records.fixed.map(withMaximum),
    combat: records.combat.map(withMaximum),
    setting: records.setting.map(withMaximum),
    defense: DEFENSE_SKILL_FIELDS.map(({ key, label }) => ({ key, name: label, rank: normalizeSkillRank(granted.fixedRanks[key], { allowBlank: true }) })),
    grantedCombatSkills: granted.grantedCombatSkills,
    grantedSettingSkills: [],
  });
}

export function fitSkillsToRules(gameData, builder) {
  const fields = { ...(builder?.sheet?.fields || {}) };
  const combatSkillsExtra = sanitizeNamedSkillList(builder?.sheet?.repeatables?.combatSkillsExtra, { maxItems: 50 }).map((row) => ({ ...row }));
  const settingSkills = sanitizeNamedSkillList(builder?.sheet?.repeatables?.settingSkills, { maxItems: 50 }).map((row) => ({ ...row }));
  const working = { ...builder, sheet: { ...(builder?.sheet || {}), fields, repeatables: { ...(builder?.sheet?.repeatables || {}), combatSkillsExtra, settingSkills } } };
  const changes = [];
  let allocation = getSkillAllocationState(gameData, working);
  const setRank = (record, rank, code) => {
    const before = record.storedRank;
    const after = String(rank);
    if (record.domain === "fixed") fields[record.key] = after;
    else if (record.domain === "combat") combatSkillsExtra[record.index].rank = after;
    else settingSkills[record.index].rank = after;
    changes.push({ code, domain: record.domain, key: record.key, name: record.name, path: record.path, before, after });
  };
  for (const record of [...allocation.fixed, ...allocation.combat, ...allocation.setting]) {
    if (record.editable && record.rank > record.cap) setRank(record, record.cap, "skill-rank-cap-applied");
  }
  allocation = getSkillAllocationState(gameData, working);
  let excess = Math.max(0, allocation.spent - allocation.total);
  const candidates = [...allocation.setting].reverse().concat([...allocation.combat].reverse(), [...allocation.fixed].reverse());
  for (const record of candidates) {
    const paidRanks = Math.max(0, record.rank - record.grantedRank);
    if (!record.editable || excess <= 0 || paidRanks <= 0) continue;
    const reduction = Math.min(excess, paidRanks);
    setRank(record, record.rank - reduction, "skill-point-budget-applied");
    excess -= reduction;
  }
  const finalAllocation = getSkillAllocationState(gameData, working);
  return freeze({ fields, combatSkillsExtra, settingSkills, allocation: finalAllocation, changes });
}
