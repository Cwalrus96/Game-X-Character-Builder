import { getCharacterGrantSources, getActiveCharacterGrantSources, grantSourceIdentity } from "./grant-source-rules.js";
import { getTraitGrantDeferredReasons } from "./game-data-contract.js";
import { createPrerequisiteContext, evaluatePrerequisite } from "./prerequisite-rules.js";
import { computeGrantedSkillsState, getCombatSkillRanks } from "./skill-rules.js";
import { canonicalSkillKey } from "./skill-identity.js";
import { isGameDataRecordExecutable, isGameDataRecordSelectable } from "./selection-rules.js";
import { projectTraitWeapons } from "./weapon-grant-rules.js";
import { projectTraitOptions, traitGrantsTechnique, traitOptionLabel } from "./trait-option-rules.js";

const list = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const text = (value) => typeof value === "string" ? value.trim() : "";
const tagId = (value) => text(value).toLowerCase();
const sorted = (values) => [...new Set(values)].sort();
function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutable(child)])));
  return value;
}
const DEFERRED_MESSAGES = Object.freeze({
  "trait-choice-id-missing": "Trait choices need a stable choice identity.",
  "trait-recipient-deferred": "This recipient's Trait rules are not implemented.",
});

/** Stable ownership never uses display names or row positions. */
export const traitSourceIdentity = grantSourceIdentity;

export function normalizeTraitProvider(grant, entry, index = 0, { sourceId = traitSourceIdentity(entry) } = {}) {
  if (grant?.type !== "trait") return null;
  const keys = list(grant.key), filters = list(grant.tag);
  const choice = Boolean(grant.choiceId || filters.length || keys.length !== 1 || Number(grant.count || 1) > 1);
  let reason = !sourceId ? "Provider needs a stable source identity."
    : !isGameDataRecordExecutable(entry) ? "The provider's mechanics are incomplete or deferred."
      : getTraitGrantDeferredReasons(grant).map((code) => DEFERRED_MESSAGES[code] || code).join(" ");
  if (!reason && grant.rank != null && (text(grant.skill) || !Number.isInteger(grant.rank) || grant.rank < 1)) reason = "Provider must specify a positive rank or an associated skill, never both.";
  return {
    id: `${sourceId}:trait:${grant.choiceId || keys.join("+") || index}`, sourceId,
    sourceLabel: entry.name || entry.featureKey || entry.featKey,
    description: entry.description || "", traitKeys: keys, filters, choice,
    choiceId: grant.choiceId || "", count: grant.count || 1, recipientId: "character",
    rank: grant.rank ?? (grant.skill ? null : 1), skill: grant.skill || "",
    implemented: !reason, reason, entry,
  };
}

function rankFor(provider, ranks) {
  if (Number.isInteger(provider.rank)) return provider.rank;
  for (const [key, value] of ranks) if (canonicalSkillKey(key) === canonicalSkillKey(provider.skill)) return Number(value) || 0;
  return 0;
}

function grantedTags(traits, definitions) {
  return sorted(traits.filter(trait => trait.optionsComplete !== false).flatMap((trait) => (definitions.get(trait.traitKey)?.grants || [])
    .filter((grant) => grant.type === "tag" && trait.rank >= (grant.minRank ?? 1)).flatMap((grant) => list(grant.tag))));
}

function acquiredContext(context, traits, definitions) {
  const weapons = projectTraitWeapons(traits.map(trait => ({ ...definitions.get(trait.traitKey), ...trait,
    active: trait.optionsComplete !== false, recipientId: "character", associatedSkill: trait.provider?.skill || "" })), context.gameData);
  return { ...context, weapons: [...context.weapons, ...weapons], selectedTraits: traits.filter(trait => trait.optionsComplete !== false), tags: grantedTags(traits, definitions) };
}

function requirementsMet(prerequisites, context, traits, definitions) {
  if (!list(prerequisites).length) return true;
  const next = acquiredContext(context, traits, definitions);
  return list(prerequisites).every((prerequisite) => evaluatePrerequisite(prerequisite, next).ok);
}

function offered(definition, provider) {
  return (!provider.traitKeys.length || provider.traitKeys.includes(definition.traitKey))
    && (!provider.filters.length || (definition.tags || []).some((tag) => provider.filters.some((filter) => tagId(tag) === tagId(filter))));
}

function candidateReason(definition, provider, rank) {
  if (!definition) return "Trait no longer exists.";
  if (!isGameDataRecordExecutable(definition) || !text(definition.description)) return "Trait mechanics are incomplete or deferred.";
  if (!Number.isInteger(definition.rank) || definition.rank < 1) return "Trait minimum rank is not defined.";
  if (!Number.isInteger(rank) || rank < definition.rank) return `Requires rank ${definition.rank}.`;
  if (!offered(definition, provider)) return "This provider does not offer that Trait.";
  return "";
}

function isAutomaticTraitTechnique(technique) {
  // A tag route unlocks a normal choice, even when also listed as an
  // associated Technique. Only explicitly granted-only links are automatic.
  return technique?.selectionRoutes?.some((route) => route.type === "granted")
    || (!technique?.selectionRoutes?.length && technique?.selectionMode === "granted-only");
}

function readyTechniqueKeys(traits, definitions, context) {
  const keys = new Set(context.selectedTechniqueKeys);
  const links = traits.filter(trait => trait.optionsComplete !== false).flatMap((trait) => [
    ...(definitions.get(trait.traitKey)?.techniqueKeys || []).filter(key => traitGrantsTechnique(trait, context.gameData.techniques?.find(row => row.techniqueKey === key))),
    ...(trait.optionChoices || []).filter(choice => choice.kind === "technique" && choice.valid).map(choice => choice.value),
  ].map((key) => ({ key, rank: trait.rank, trait })));
  const weapons = projectTraitWeapons(traits.map(trait => ({ ...definitions.get(trait.traitKey), ...trait,
    active: trait.optionsComplete !== false, recipientId: "character", associatedSkill: trait.provider?.skill || "" })), context.gameData);
  links.push(...weapons.flatMap(weapon => weapon.techniqueKeys.map(key => ({ key, rank: weapon.rank, weapon }))));
  for (let pass = 0; pass <= links.length; pass += 1) {
    const before = keys.size;
    for (const link of links) {
      const technique = (context.gameData.techniques || []).find((item) => item.techniqueKey === link.key);
      if (technique && (link.weapon || link.trait || isAutomaticTraitTechnique(technique)) && isGameDataRecordSelectable(technique, { allowGrantedOnly: true }) && Number.isInteger(technique.rank)
        && link.rank >= technique.rank && requirementsMet(technique.prerequisites, { ...context, selectedTechniqueKeys: [...keys] }, traits, definitions)) keys.add(link.key);
    }
    if (keys.size === before) break;
  }
  return [...keys];
}

/** Only source-owned choices persist; static rank, tags and access derive. */
export function projectCharacterTraits(character, gameData = {}, { selectedTechniqueKeys } = {}) {
  const builder = character?.builder || character || {};
  const definitions = new Map((gameData.traits || []).map((trait) => [trait.traitKey, trait]));
  const providers = [], references = [], issues = [], choices = [];
  const seenSources = new Set();
  for (const source of getCharacterGrantSources(gameData, builder)) {
    if (!source.levelEligible) continue;
    const { entry, sourceId } = source;
    if (!sourceId || seenSources.has(sourceId)) continue;
    seenSources.add(sourceId);
    const grants = list(entry.grants).filter((grant) => grant.type === "trait");
    const providerEntry = { ...entry, prerequisites: source.prerequisites,
      ...(!source.available ? { runtimeSupport: { status: "deferred", reasons: ["parent-deferred"] } } : {}) };
    grants.forEach((grant, index) => providers.push(normalizeTraitProvider(grant, providerEntry, index, { sourceId })));
    const referencedKeys = list(entry.traitKeys).filter((key) => !grants.some((grant) => list(grant.key).includes(key)));
    if (referencedKeys.length) {
      providers.push({ id: `${sourceId}:references`, sourceId, sourceLabel: entry.name, description: entry.description || "", traitKeys: referencedKeys, implemented: false, reason: "The provider's formal Trait grant is not defined." });
      for (const key of referencedKeys) {
        const definition = definitions.get(key);
        if (definition) references.push({ ...definition, id: `${sourceId}:reference:${key}`, sourceId, sourceLabel: entry.name,
          recipientId: "", rank: null, minimumRank: definition.rank, active: false, referenceOnly: true,
          sourceDescription: entry.description || "", tags: [] });
      }
    }
  }
  const providerIds = new Set();
  for (const provider of providers) {
    if (providerIds.has(provider.id)) issues.push({ severity: "error", code: "duplicate-trait-provider", path: provider.sourceId, message: "A source has conflicting Trait grants with the same identity." });
    providerIds.add(provider.id);
  }
  const context = createPrerequisiteContext({ builder, gameData, syntaxVersion: 3, selectedTechniqueKeys,
    grantedSkillState: computeGrantedSkillsState(gameData, builder), skillRanks: getCombatSkillRanks(gameData, builder) });
  const candidates = [], desiredChoices = new Set();
  for (const provider of providers.filter((provider) => provider.implemented)) {
    const rank = rankFor(provider, context.skillRanks);
    const addCandidate = (key, choiceId = "") => {
      const definition = definitions.get(key);
      const candidate = { ...definition, id: choiceId ? `trait:${choiceId}` : `${provider.id}:${key}`, provider, definition, traitKey: key,
        sourceId: provider.sourceId, recipientId: provider.recipientId, rank, choiceId, reason: candidateReason(definition, provider, rank) };
      candidate.optionChoices = projectTraitOptions(candidate, builder, gameData, [], context);
      candidate.optionsComplete = candidate.optionChoices.every(choice => choice.valid);
      candidates.push(candidate);
    };
    if (!provider.choice) addCandidate(provider.traitKeys[0]);
    else for (let index = 0; index < provider.count; index += 1) {
      const choiceId = `${provider.sourceId}:${provider.choiceId}:${index + 1}`;
      desiredChoices.add(choiceId);
      const answer = builder.traitChoices?.[choiceId];
      const ownerValid = !answer || (answer.sourceId === provider.sourceId && answer.recipientId === provider.recipientId);
      choices.push({ choiceId, sourceId: provider.sourceId, recipientId: provider.recipientId,
        label: `${provider.sourceLabel}${provider.filters.length ? ` — ${provider.filters.join(" or ")}` : ""}${provider.count > 1 ? ` ${index + 1}` : ""}`, traitKey: answer?.traitKey || "", options: [], provider, rank });
      if (answer && ownerValid) addCandidate(answer.traitKey, choiceId);
      if (answer && !ownerValid) issues.push({ severity: "error", code: "trait-choice-owner-mismatch", path: `builder.traitChoices.${choiceId}`, message: "Trait answer belongs to a different source or recipient." });
    }
  }
  // Starting empty prevents circular prerequisites from authorizing themselves.
  const acquired = [], pending = candidates.filter((candidate) => !candidate.reason);
  for (let pass = 0; pass <= candidates.length * 2 + 1; pass += 1) {
    let progress = false;
    const activeSources = new Set(getActiveCharacterGrantSources(gameData, builder, acquiredContext(context, acquired, definitions)).map(source => source.sourceId));
    for (let index = 0; index < pending.length;) {
      const candidate = pending[index], { provider, definition } = candidate;
      if (!activeSources.has(provider.sourceId) || !requirementsMet(provider.entry.prerequisites, context, acquired, definitions)
        || !requirementsMet(definition.prerequisites, context, acquired, definitions)) { index += 1; continue; }
      if (candidate.choiceId && !definition.repeatable && acquired.some((trait) => trait.provider.id === provider.id && trait.traitKey === candidate.traitKey)) candidate.reason = "This provider already grants that Trait.";
      else acquired.push(candidate);
      pending.splice(index, 1); progress = true;
    }
    context.selectedTechniqueKeys = readyTechniqueKeys(acquired, definitions, context);
    if (!progress) break;
  }
  for (const candidate of pending) candidate.reason = "Trait or provider prerequisites are not met.";
  for (const candidate of candidates) if (candidate.reason) issues.push({ severity: "warning", code: "invalid-trait-choice",
    path: candidate.choiceId ? `builder.traitChoices.${candidate.choiceId}` : candidate.id,
    choiceId: candidate.choiceId, message: candidate.reason, remove: Boolean(candidate.choiceId) });
  for (const choice of choices) {
    const others = acquired.filter((trait) => trait.choiceId !== choice.choiceId);
    const sourceActive = getActiveCharacterGrantSources(gameData, builder, acquiredContext(context, others, definitions)).some(source => source.sourceId === choice.provider.sourceId);
    const providerReady = sourceActive && requirementsMet(choice.provider.entry.prerequisites, context, others, definitions);
    choice.options = [...definitions.values()].filter((definition) => offered(definition, choice.provider)).map((definition) => {
      let reason = candidateReason(definition, choice.provider, choice.rank);
      if (!reason && !definition.repeatable && others.some((trait) => trait.provider.id === choice.provider.id && trait.traitKey === definition.traitKey)) reason = "Already selected for this provider.";
      if (!reason && definition.repeatable) {
        const probe = { ...definition, id: `trait:${choice.choiceId}`, rank: choice.rank, sourceId: choice.sourceId, recipientId: choice.recipientId };
        if (projectTraitOptions(probe, builder, gameData, others).some(option => !option.options.some(value => value.eligible))) reason = "Every eligible option for this Trait has already been chosen.";
      }
      if (!reason && (!providerReady || !requirementsMet(definition.prerequisites, context, others, definitions))) reason = "Prerequisites are not met.";
      return { traitKey: definition.traitKey, name: definition.name, rank: definition.rank, eligible: !reason, reason };
    }).sort((a, b) => a.name.localeCompare(b.name));
    delete choice.provider;
  }
  for (const choiceId of Object.keys(builder.traitChoices || {})) if (!desiredChoices.has(choiceId)) issues.push({ severity: "warning", code: "orphaned-trait-choice", path: `builder.traitChoices.${choiceId}`, choiceId, remove: true, message: "The Trait's source no longer offers this choice." });
  const techniques = [];
  for (const candidate of acquired) {
    candidate.optionChoices = projectTraitOptions(candidate, builder, gameData, acquired, acquiredContext(context, acquired, definitions));
    candidate.optionsComplete = candidate.optionChoices.every(choice => choice.valid);
  }
  const traits = acquired.map((candidate) => {
    const { provider, definition } = candidate;
    const explicitChoices = candidate.optionChoices.filter(choice => choice.kind === "technique" && choice.valid).map(choice => choice.value);
    for (const techniqueKey of [...(definition.techniqueKeys || []), ...explicitChoices]) {
      const technique = (gameData.techniques || []).find((item) => item.techniqueKey === techniqueKey);
      if (!traitGrantsTechnique(candidate, technique) && !explicitChoices.includes(techniqueKey)) continue;
      const eligible = Boolean(candidate.optionsComplete && technique && isGameDataRecordSelectable(technique, { allowGrantedOnly: true })
        && Number.isInteger(technique.rank) && candidate.rank >= technique.rank
        && requirementsMet(technique.prerequisites, context, acquired, definitions));
      techniques.push({ techniqueKey, traitId: candidate.id, sourceId: provider.sourceId, recipientId: provider.recipientId,
        rank: candidate.rank, active: eligible, eligible, reason: eligible ? "" : "Technique is unfinished, above this rank, or has unmet prerequisites." });
    }
    return { ...definition, id: candidate.id, sourceId: provider.sourceId, sourceLabel: provider.sourceLabel, associatedSkill: provider.skill,
      providerId: provider.id,
      recipientId: provider.recipientId, choiceId: candidate.choiceId, rank: candidate.rank, minimumRank: definition.rank,
      active: candidate.optionsComplete, referenceOnly: false, sourceDescription: provider.description,
      optionChoices: candidate.optionChoices, optionsComplete: candidate.optionsComplete,
      classificationTags: definition.tags || [], tags: grantedTags([candidate], definitions) };
  });
  const weapons = projectTraitWeapons(traits, gameData);
  for (const weapon of weapons) for (const techniqueKey of weapon.techniqueKeys) {
    const technique = (gameData.techniques || []).find(item => item.techniqueKey === techniqueKey);
    const eligible = Boolean(technique && isGameDataRecordSelectable(technique, { allowGrantedOnly: true })
      && Number.isInteger(technique.rank) && weapon.rank >= technique.rank
      && list(technique.prerequisites).every(prerequisite => evaluatePrerequisite(prerequisite,
        { ...context, selectedTraits: traits, tags: grantedTags(acquired, definitions), weapons: [weapon] }).ok));
    techniques.push({ techniqueKey, traitId: weapon.traitId, weaponId: weapon.id, sourceId: weapon.sourceId,
      recipientId: "character", rank: weapon.rank, active: eligible, eligible });
  }
  return immutable({ providers: providers.map(({ entry, ...provider }) => provider), traits: [...traits, ...references].sort((a, b) => a.id.localeCompare(b.id)),
    choices, optionChoices: traits.flatMap(trait => trait.optionChoices || []), tags: grantedTags(acquired, definitions), techniques, weapons, issues,
    deferred: providers.filter((provider) => !provider.implemented).map(({ entry, ...provider }) => provider) });
}

/** One display/access record per Technique, retaining the strongest active grant. */
export function getActiveTraitTechniqueDetails(projection) {
  const details = new Map();
  for (const technique of projection.techniques || []) {
    if (!technique.active || !technique.eligible || technique.recipientId !== "character") continue;
    const trait = projection.traits.find((item) => item.id === technique.traitId);
    if (!trait) continue;
    const previous = details.get(technique.techniqueKey);
    if (previous && previous.rank >= technique.rank) continue;
    details.set(technique.techniqueKey, { rank: technique.rank, sourceLabel: trait.sourceLabel,
      traitName: traitOptionLabel(trait), sourceId: trait.sourceId, skillName: trait.associatedSkill || "", weaponId: technique.weaponId || "" });
  }
  return details;
}

export function getTraitPrerequisiteEvidence(prerequisite, projection) {
  if (prerequisite.type === "any") return sorted(prerequisite.alternatives.flatMap((item) => getTraitPrerequisiteEvidence(item, projection)));
  if (prerequisite.type === "technique") return sorted(projection.techniques.filter((technique) => technique.active
    && list(prerequisite.key).includes(technique.techniqueKey)).map((technique) => technique.traitId));
  if (!["trait", "tag"].includes(prerequisite.type)) return [];
  return projection.traits.filter((trait) => trait.active && !trait.referenceOnly && evaluatePrerequisite(prerequisite,
    createPrerequisiteContext({ syntaxVersion: 3, selectedTraits: [trait], tags: trait.tags })).ok).map((trait) => trait.id);
}
