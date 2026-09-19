import { CORE_SKILL_FIELDS, DEFENSE_SKILL_FIELDS } from "./character-rules.js";
import {
  sanitizeNamedSkillList,
  sanitizeSkillFields,
  sanitizeStringArray,
  sanitizeText,
} from "./data-sanitization.js";
import { computeGrantedSkillsState, getClassUtilitySkillState } from "./skill-rules.js?v=wpe13";
import { canonicalSkillName, canonicalStoredSkillKey } from "./skill-identity.js";

const DEFENSE_FIELD_KEYS = new Set(DEFENSE_SKILL_FIELDS.map(({ key }) => key));
const CORE_FIELD_BY_SKILL_KEY = new Map(CORE_SKILL_FIELDS.map(({ key, label }) => [
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  key,
]));

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSkillName(value) {
  return canonicalSkillName(sanitizeText(value, { maxLen: 96, collapse: true }));
}

function sanitizeSelectedClassUtilitySkills(gameData, builder, { preserveLegacyLabels = false } = {}) {
  const utility = getClassUtilitySkillState(gameData, builder);
  if (!preserveLegacyLabels) return [...utility.selected];
  const labelByKey = new Map(utility.options.map((option) => [option.key, option.label]));
  return utility.selected.map((key) => labelByKey.get(key) || key);
}

function classUtilityCoreFieldKeys(selectedClassUtilitySkills) {
  const output = new Set();
  for (const skillKey of sanitizeStringArray(selectedClassUtilitySkills, { maxItems: 50, maxLen: 96 })) {
    const normalizedKey = normalizeSkillName(skillKey).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const fieldKey = CORE_FIELD_BY_SKILL_KEY.get(normalizedKey);
    if (fieldKey) output.add(fieldKey);
  }
  return output;
}

function sheetRepeatables(builder) {
  const repeatables = isPlainObject(builder?.sheet?.repeatables) ? builder.sheet.repeatables : {};
  return {
    ...repeatables,
    combatSkillsExtra: sanitizeNamedSkillList(repeatables.combatSkillsExtra, { maxItems: 50 }),
    settingSkills: sanitizeNamedSkillList(repeatables.settingSkills, { maxItems: 50 }),
  };
}

function prunePreviouslyGrantedRows(rows, grantedBefore, grantedNow) {
  const before = new Set(Array.from(grantedBefore || []).map((name) => normalizeSkillName(name).toLowerCase()).filter(Boolean));
  const now = new Set(Array.from(grantedNow || []).map((name) => normalizeSkillName(name).toLowerCase()).filter(Boolean));
  return sanitizeNamedSkillList(rows, { maxItems: 50 }).filter((row) => {
    const key = normalizeSkillName(row?.skill).toLowerCase();
    return !key || !before.has(key) || now.has(key);
  });
}

function stableSkillKey(gameData, skillName) {
  const normalizedName = normalizeSkillName(skillName).toLowerCase();
  const match = (Array.isArray(gameData?.classSkills) ? gameData.classSkills : [])
    .find((entry) => normalizeSkillName(entry?.skillName).toLowerCase() === normalizedName);
  if (match?.skillKey) return canonicalStoredSkillKey(match.skillKey);
  return normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildCharacterSkillProjection(gameData, builder = {}, {
  previousBuilder = {},
  preserveLegacyLabels = false,
} = {}) {
  const current = isPlainObject(builder) ? builder : {};
  const previous = isPlainObject(previousBuilder) ? previousBuilder : {};
  const granted = computeGrantedSkillsState(gameData, current);
  const previouslyGranted = computeGrantedSkillsState(gameData, previous);
  const fields = {
    ...(isPlainObject(current?.sheet?.fields) ? current.sheet.fields : {}),
    ...sanitizeSkillFields(current?.sheet?.fields),
  };

  for (const fieldKey of DEFENSE_FIELD_KEYS) {
    const nextRank = sanitizeText(granted?.fixedRanks?.[fieldKey], { maxLen: 8, collapse: true });
    const wasGranted = sanitizeText(previouslyGranted?.fixedRanks?.[fieldKey], { maxLen: 8, collapse: true }) !== "";
    if (nextRank !== "") fields[fieldKey] = nextRank;
    else if (wasGranted) fields[fieldKey] = "";
  }

  const selectedClassUtilitySkills = sanitizeSelectedClassUtilitySkills(gameData, current, { preserveLegacyLabels });
  const nextUtilityFields = classUtilityCoreFieldKeys(selectedClassUtilitySkills);

  const repeatables = sheetRepeatables(current);
  const grantedSkillNames = granted?.grantedSkillNames instanceof Set ? granted.grantedSkillNames : new Set();
  const previousGrantedSkillNames = previouslyGranted?.grantedSkillNames instanceof Set
    ? previouslyGranted.grantedSkillNames
    : new Set();
  repeatables.combatSkillsExtra = prunePreviouslyGrantedRows(
    repeatables.combatSkillsExtra,
    previousGrantedSkillNames,
    grantedSkillNames,
  );

  return {
    fields,
    repeatables,
    selectedClassUtilitySkills,
    grantedCoreSkillSnapshot: preserveLegacyLabels
      ? Array.from(nextUtilityFields)
      : selectedClassUtilitySkills.filter((skillKey) => CORE_FIELD_BY_SKILL_KEY.has(skillKey)),
    grantedSkillSnapshot: preserveLegacyLabels
      ? Array.from(grantedSkillNames)
      : Array.from(grantedSkillNames).map((name) => stableSkillKey(gameData, name)).filter(Boolean),
  };
}
