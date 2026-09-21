import { canonicalSkillKey, canonicalSkillName } from "./skill-identity.js";
import { getExpressionRuntimeStatus } from "./game-data-contract.js";

// Shared pure availability policy for normalized and reviewed-legacy records.
export function isGameDataRecordExecutable(record) {
  if (record?.expressionSyntaxVersion !== 3) return true;
  const status = String(record?.status || "").trim().toLowerCase();
  return (!status || status === "playable") && record?.runtimeSupport?.status !== "deferred";
}

export function isGameDataGrantExecutable(grant, { source = grant?.source, syntaxVersion = source?.expressionSyntaxVersion ?? 2 } = {}) {
  if (syntaxVersion !== 3) return true;
  if (!isGameDataRecordExecutable(source)) return false;
  const status = getExpressionRuntimeStatus("grant", grant, { syntaxVersion });
  return status === "implemented" || status === "compatibility";
}

export function isGameDataRecordSelectable(record, { allowGrantedOnly = false } = {}) {
  if (!isGameDataRecordExecutable(record)) return false;
  if (record?.expressionSyntaxVersion === 3 && Array.isArray(record.selectionRoutes)) {
    if (record.status !== "playable" || !record.selectionRoutes.length) return false;
    return record.selectionRoutes.some((route) => route.type === "granted"
      ? allowGrantedOnly
      : ["skill", "tag", "weaponTag"].includes(route.type));
  }
  const mode = String(record?.selectionMode || "").trim().toLowerCase();
  if (mode === "draft") return false;
  if (mode === "granted-only") return Boolean(allowGrantedOnly);
  if (mode === "selectable") return true;
  if (mode) return false;
  return record?.selectable !== false;
}

function identity(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "-");
}

function skillRankFor(name, ranks) {
  const pairs = ranks instanceof Map ? ranks : new Map(Object.entries(ranks || {}));
  for (const [key, rank] of pairs) {
    if (canonicalSkillKey(key) === canonicalSkillKey(name)) return Number(rank) || 0;
  }
  return 0;
}

/** Resolve acquisition routes only. Formal prerequisites remain a separate AND check. */
export function getTechniqueSelectionState(technique, {
  knownCombatSkills = new Set(), skillRanks = new Map(), tags = [], weapons = [],
  allowGrantedOnly = false, associatedSkill = "",
} = {}) {
  const requiredRank = Number(technique?.rank ?? 0);
  const selectable = isGameDataRecordSelectable(technique, { allowGrantedOnly });
  if (technique?.expressionSyntaxVersion !== 3) {
    const skillName = canonicalSkillName(technique?.skill || "");
    const knownSkill = !skillName || knownCombatSkills.has(skillName);
    const skillRank = skillName ? skillRankFor(skillName, skillRanks) : requiredRank;
    return { selectable, knownSkill, skillName, skillRank, requiredRank, eligible: selectable && knownSkill && skillRank >= requiredRank };
  }
  const knownKeys = new Set(Array.from(knownCombatSkills, canonicalSkillKey));
  const tagKeys = new Set(Array.from(tags, identity));
  const candidates = (technique.selectionRoutes || []).map((route) => {
    const name = canonicalSkillName(route.name || "");
    const override = canonicalSkillName(associatedSkill || technique.associatedSkill || "");
    const skillName = override && !/^(provider|none)$/i.test(override) ? override : route.type === "skill" ? name : "";
    if (route.type === "granted") return { route, known: allowGrantedOnly, skillName, rank: allowGrantedOnly ? requiredRank : 0 };
    if (route.type === "skill") return { route, known: knownKeys.has(canonicalSkillKey(name)), skillName, rank: skillRankFor(skillName, skillRanks) };
    if (route.type === "tag") return { route, known: tagKeys.has(identity(route.name)), skillName, rank: skillName ? skillRankFor(skillName, skillRanks) : 0 };
    if (route.type === "weaponTag") {
      const matching = weapons.filter((weapon) => (weapon.tags || []).some((tag) => identity(tag) === identity(route.name)));
      return { route, known: matching.length > 0, skillName, rank: skillName ? skillRankFor(skillName, skillRanks) : Math.max(0, ...matching.map((weapon) => Number(weapon.rank) || 0)) };
    }
    return { route, known: false, skillName: "", rank: 0 };
  });
  const selected = candidates.filter((candidate) => candidate.known).sort((a, b) => b.rank - a.rank)[0];
  const knownSkill = Boolean(selected);
  const skillRank = selected?.rank ?? 0;
  return {
    selectable, knownSkill, skillName: selected?.skillName || "", skillRank, requiredRank,
    route: selected?.route || null,
    eligible: selectable && knownSkill && technique.rank !== null && technique.rank !== undefined && technique.rank !== "" && Number.isInteger(requiredRank) && skillRank >= requiredRank,
  };
}
