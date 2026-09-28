import { canonicalSkillKey, canonicalSkillName } from "./skill-identity.js";
import { getTechniqueSelectionState, isGameDataRecordSelectable } from "./selection-rules.js";

const values = value => (Array.isArray(value) ? value : [value]).filter(Boolean);

export function getDirectTechniqueGrantKeys(grant) {
  return grant?.type === "technique" && !grant.access && !grant.choiceId && values(grant.key).length === 1 ? values(grant.key) : [];
}

export function isTechniqueChoiceGrant(grant) {
  return !grant?.access && (grant?.type === "technique-choice"
    || (grant?.type === "technique" && !getDirectTechniqueGrantKeys(grant).length));
}

/** The same offer/filter/rank policy serves every granting source and its graph answer. */
export function getTechniqueGrantSelectionState(technique, grant, context = {}) {
  if (!technique) return { eligible: false, reason: "This technique no longer exists." };
  if (!isGameDataRecordSelectable(technique, { allowGrantedOnly: true })) return { eligible: false, reason: "This technique is unavailable to grants." };
  const skillFilters = values(grant?.skill).map(canonicalSkillKey);
  const skills = technique.expressionSyntaxVersion === 3
    ? (technique.selectionRoutes || []).filter(route => route.type === "skill").map(route => route.name)
    : values(technique.skillKeys || technique.skill);
  const tags = values(technique.tagKeys || technique.tags);
  if (values(grant?.key).length && !values(grant.key).includes(technique.techniqueKey)) return { eligible: false, reason: "This technique does not match the granting identity filter." };
  if (skillFilters.length && !skills.some(skill => skillFilters.includes(canonicalSkillKey(skill)))) return { eligible: false, reason: "This technique does not match the granting skill filter." };
  if (values(grant?.tag).length && !values(grant.tag).some(tag => tags.includes(tag))) return { eligible: false, reason: "This technique does not match the granting tag filter." };
  // Explicit skill choices use that skill's training. Unfiltered/tag/key grants
  // retain their authored free acquisition route, without inventing training.
  if (skillFilters.length) {
    const filtered = technique.expressionSyntaxVersion === 3 ? { ...technique,
      selectionRoutes: technique.selectionRoutes.filter(route => route.type === "skill" && skillFilters.includes(canonicalSkillKey(route.name))) } : technique;
    const state = getTechniqueSelectionState(filtered, { ...context,
      knownCombatSkills: new Set(values(grant.skill).map(canonicalSkillName)), allowGrantedOnly: true });
    if (state.skillRank < state.requiredRank) return { ...state, eligible: false, reason: `Requires ${state.skillName || values(grant.skill).join(" or ")} rank ${state.requiredRank}.` };
    return { ...state, eligible: true, reason: "" };
  }
  return { eligible: true, skillRank: Number(technique.rank) || 0, reason: "" };
}
