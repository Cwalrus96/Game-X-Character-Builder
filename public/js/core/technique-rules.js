import { getTechniqueSelectionState as ordinarySelection } from "./selection-rules.js";
import { getActiveCharacterGrantSources } from "./grant-source-rules.js";
import { createPrerequisiteContext } from "./prerequisites.js";
import { evaluatePrerequisite } from "./prerequisite-rules.js";
import { computeKnownCombatSkillsAndGrants, getCombatSkillRanks, computeGrantedSkillsState } from "./skill-rules.js";
import { canonicalSkillKey, canonicalSkillName } from "./skill-identity.js";

const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const sameSkill = (left, right) => canonicalSkillKey(left) === canonicalSkillKey(right);
const hasTag = (weapon, tag) => (weapon.tags || []).some(value => String(value).toLowerCase() === String(tag).toLowerCase());
const filterWeapons = (weapons, tags) => !tags ? weapons : weapons.filter(weapon => list(tags).some(tag => hasTag(weapon, tag)));
const rankFor = (name, ranks) => Math.max(0, ...[...ranks].filter(([key]) => sameSkill(key, name)).map(([, rank]) => Number(rank) || 0));
const requirementsMet = (technique, context) => list(technique.prerequisites).every(rule => evaluatePrerequisite(rule, context).ok);

const uniqueSkills = names => [...new Map(names.filter(Boolean).map(name => [canonicalSkillKey(name), canonicalSkillName(name)])).values()];

/** Acquisition labels come from parsed routes, never the combined compatibility text. */
export function getTechniqueSkillNames(technique) {
  return uniqueSkills(technique?.expressionSyntaxVersion === 3
    ? (technique.selectionRoutes || []).filter(route => route.type === "skill").map(route => route.name)
    : [technique?.skill]);
}

/** Project each qualifying route separately without changing access or roll/scaling rules. */
export function getTechniqueCatalogueSkills(technique, input = {}) {
  if (technique?.expressionSyntaxVersion !== 3) return getTechniqueSkillNames(technique);
  const context = createTechniqueContext(input);
  const names = (technique.selectionRoutes || []).filter(route => {
    if (route.type !== "skill") return false;
    const state = getTechniqueSelectionState({ ...technique, selectionRoutes: [route] }, context);
    return state.eligible && state.prerequisitesMet;
  }).map(route => route.name);
  if (names.length) return uniqueSkills(names);
  // Tag/granted routes may have an explicit skill; otherwise the UI uses Other.
  const state = getTechniqueSelectionState(technique, context);
  return state.eligible && state.prerequisitesMet ? uniqueSkills([state.skillName]) : [];
}

/** The same context supplies acquisition, performance and dependency evidence. */
export function createTechniqueContext(input = {}) {
  if (input.techniqueRules) return input;
  const gameData = input.gameData || {}, builder = input.builder || {};
  const context = createPrerequisiteContext({ ...input, grantedSkillState: input.grantedSkillState || computeGrantedSkillsState(gameData, builder) });
  const rules = getActiveCharacterGrantSources(gameData, builder, context).flatMap(source => {
    return (source.entry.grants || []).filter(grant => grant.type === "skill-substitution" || (grant.type === "technique" && grant.access))
      .map(grant => ({ ...grant, sourceId: source.sourceId, sourceLabel: source.sourceLabel }));
  });
  return { ...context, techniqueRules: rules,
    knownCombatSkills: input.knownCombatSkills || computeKnownCombatSkillsAndGrants(gameData, builder).knownCombatSkills,
    skillRanks: input.skillRanks || getCombatSkillRanks(gameData, builder), allowGrantedOnly: input.allowGrantedOnly || false };
}

function substituteContexts(skill, weapons, context) {
  return context.techniqueRules.filter(rule => rule.type === "skill-substitution" && list(rule.fromSkill).some(name => sameSkill(name, skill)))
    .map(rule => ({ skillName: canonicalSkillName(rule.toSkill), rank: rankFor(rule.toSkill, context.skillRanks),
      weapons: filterWeapons(weapons, rule.weaponTag), rule }))
    .filter(candidate => !candidate.rule.weaponTag || candidate.weapons.length);
}

/** A substitution alone never creates acquisition. Added access is an ordinary paid route. */
export function getTechniqueSelectionState(technique, input = {}) {
  if (technique?.expressionSyntaxVersion !== 3) return ordinarySelection(technique, input);
  const context = createTechniqueContext(input);
  const ordinary = ordinarySelection(technique, { ...context, ...input });
  const candidates = [{ ...ordinary, prerequisitesMet: requirementsMet(technique, context), evidence: [] }];
  for (const route of technique.selectionRoutes || []) {
    if (route.type !== "skill") continue;
    for (const rule of context.techniqueRules.filter(rule => rule.type === "technique" && list(rule.access).some(name => sameSkill(name, route.name)))) {
      const weapons = filterWeapons(context.weapons, rule.weaponTag);
      if (rule.weaponTag && !weapons.length) continue;
      const performances = [{ skillName: route.name, rank: rankFor(route.name, context.skillRanks), weapons }, ...substituteContexts(route.name, weapons, context)];
      for (const candidate of performances) {
        if (!requirementsMet(technique, { ...context, weapons: candidate.weapons })) continue;
        candidates.push({ ...ordinary, knownSkill: true, skillName: candidate.skillName, skillRank: candidate.rank,
          eligible: ordinary.selectable && candidate.rank >= ordinary.requiredRank, prerequisitesMet: true,
          route: { type: "access", name: route.name },
          evidence: [rule.sourceId, candidate.rule?.sourceId, ...candidate.weapons.filter(weapon => weapon.derived).map(weapon => weapon.id)].filter(Boolean) });
      }
    }
  }
  return candidates.sort((a, b) => Number(b.eligible && b.prerequisitesMet) - Number(a.eligible && a.prerequisitesMet) || b.skillRank - a.skillRank)[0];
}

/** Available techniques may use any qualifying performance context; no saved choice is invented. */
export function getTechniquePerformance(technique, input = {}, provider = null) {
  const context = createTechniqueContext(input);
  const names = technique.associatedSkill && !/^(provider|none)$/i.test(technique.associatedSkill)
    ? [technique.associatedSkill] : (technique.selectionRoutes || []).filter(route => route.type === "skill").map(route => route.name);
  if (!names.length && technique.skill && !/^(provider|none)$/i.test(technique.skill)) names.push(technique.skill);
  const candidates = names.map(skillName => ({ skillName, rank: rankFor(skillName, context.skillRanks), weaponIds: [], sourceLabel: "" }));
  if (provider) candidates.push({ skillName: provider.skillName || names[0] || "Associated skill", rank: provider.rank,
    weaponIds: provider.weaponId ? [provider.weaponId] : [], sourceLabel: provider.traitName || provider.sourceLabel || "" });
  for (const route of technique.selectionRoutes || []) if (route.type === "weaponTag") {
    for (const weapon of filterWeapons(context.weapons, route.name)) {
      if (!requirementsMet(technique, { ...context, weapons: [weapon] })) continue;
      const base = (context.gameData.weaponBases || []).find(row => row.weaponKey === weapon.weaponKey);
      for (const skillName of weapon.associatedSkill ? [weapon.associatedSkill] : base?.techniqueSkills || []) {
        candidates.push({ skillName, rank: weapon.derived ? weapon.rank : rankFor(skillName, context.skillRanks), weaponIds: [weapon.id], sourceLabel: weapon.name || base.name });
      }
    }
  }
  for (const name of names) for (const substitute of substituteContexts(name, context.weapons, context)) {
    if (!requirementsMet(technique, { ...context, weapons: substitute.weapons })) continue;
    candidates.push({ skillName: substitute.skillName, rank: substitute.rank,
      weaponIds: substitute.rule.weaponTag ? substitute.weapons.map(weapon => weapon.id) : [],
      sourceLabel: substitute.rule.weaponTag ? `with a ${list(substitute.rule.weaponTag).join(" or ")} weapon` : "" });
  }
  const unique = candidates.filter((value, index) => candidates.findIndex(other => sameSkill(other.skillName, value.skillName)
    && other.rank === value.rank && other.sourceLabel === value.sourceLabel) === index);
  unique.sort((a, b) => b.rank - a.rank);
  return { ...(unique[0] || { skillName: technique.skill || "", rank: Number(technique.rank) || 0 }), alternatives: unique };
}
