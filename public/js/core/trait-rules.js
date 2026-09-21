import { getActiveGrantEntries } from "./game-data.js";
import { getTraitGrantDeferredReasons } from "./game-data-contract.js";
import { createPrerequisiteContext, evaluatePrerequisite } from "./prerequisite-rules.js";
import { computeGrantedSkillsState, getCombatSkillRanks } from "./skill-rules.js";
import { canonicalSkillKey } from "./skill-identity.js";
import { isGameDataRecordExecutable, isGameDataRecordSelectable } from "./selection-rules.js";

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
export function traitSourceIdentity(entry) {
  if (entry.originKey && entry.featureKey) return `origin-feature:${entry.originKey}:${entry.featureKey}`;
  if (entry.classKey && entry.featureKey) return `${entry.type === "option" ? "class-option" : "class-feature"}:${entry.classKey}:${entry.featureKey}`;
  if (entry.featKey) return `${entry.type === "option" ? "feat-option" : "feat-selection"}:${entry.featKey}`;
  return entry.originKey ? `origin:${entry.originKey}` : "";
}

export function normalizeTraitProvider(grant, entry, index = 0) {
  if (grant?.type !== "trait") return null;
  const sourceId = traitSourceIdentity(entry);
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
  return sorted(traits.flatMap((trait) => (definitions.get(trait.traitKey)?.grants || [])
    .filter((grant) => grant.type === "tag" && trait.rank >= (grant.minRank ?? 1)).flatMap((grant) => list(grant.tag))));
}

function requirementsMet(prerequisites, context, traits, definitions) {
  const next = { ...context, selectedTraits: traits, tags: grantedTags(traits, definitions) };
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
  const links = traits.flatMap((trait) => (definitions.get(trait.traitKey)?.techniqueKeys || []).map((key) => ({ key, rank: trait.rank })));
  for (let pass = 0; pass <= links.length; pass += 1) {
    const before = keys.size;
    for (const link of links) {
      const technique = (context.gameData.techniques || []).find((item) => item.techniqueKey === link.key);
      if (technique && isAutomaticTraitTechnique(technique) && isGameDataRecordSelectable(technique, { allowGrantedOnly: true }) && Number.isInteger(technique.rank)
        && link.rank >= technique.rank && requirementsMet(technique.prerequisites, { ...context, selectedTechniqueKeys: [...keys] }, traits, definitions)) keys.add(link.key);
    }
    if (keys.size === before) break;
  }
  return [...keys];
}

/** Only source-owned choices persist; static rank, tags and access derive. */
export function projectCharacterTraits(character, gameData = {}) {
  const builder = character?.builder || character || {};
  const definitions = new Map((gameData.traits || []).map((trait) => [trait.traitKey, trait]));
  const ancestry = new Map();
  function remember(rows, parents = []) {
    for (const entry of rows || []) {
      ancestry.set(entry, parents);
      remember(entry.options, [...parents, entry]);
      remember(entry.features, [...parents, entry]);
    }
  }
  const selectedClass = (gameData.classes || []).find((entry) => entry.classKey === builder.classKey);
  const classRows = Array.isArray(gameData.classFeatures) ? gameData.classFeatures.filter((entry) => entry.classKey === builder.classKey) : gameData.classFeatures?.[builder.classKey] || [];
  remember(classRows, selectedClass ? [selectedClass] : []);
  remember(gameData.origins);
  remember(gameData.feats);
  const providers = [], references = [], issues = [], choices = [];
  const seenSources = new Set();
  for (const entry of getActiveGrantEntries(gameData, builder)) {
    const parents = ancestry.get(entry) || [];
    if ([entry, ...parents].some((ancestor) => Number(ancestor.level || 1) > Number(builder.level || 1))) continue;
    const sourceId = traitSourceIdentity(entry);
    if (!sourceId || seenSources.has(sourceId)) continue;
    seenSources.add(sourceId);
    const grants = list(entry.grants).filter((grant) => grant.type === "trait");
    const providerEntry = { ...entry, prerequisites: [...parents.flatMap((parent) => list(parent.prerequisites)), ...list(entry.prerequisites)],
      ...(!parents.every(isGameDataRecordExecutable) ? { runtimeSupport: { status: "deferred", reasons: ["parent-deferred"] } } : {}) };
    grants.forEach((grant, index) => providers.push(normalizeTraitProvider(grant, providerEntry, index)));
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
  const context = createPrerequisiteContext({ builder, gameData, syntaxVersion: 3,
    grantedSkillState: computeGrantedSkillsState(gameData, builder), skillRanks: getCombatSkillRanks(gameData, builder) });
  const candidates = [], desiredChoices = new Set();
  for (const provider of providers.filter((provider) => provider.implemented)) {
    const rank = rankFor(provider, context.skillRanks);
    const addCandidate = (key, choiceId = "") => {
      const definition = definitions.get(key);
      candidates.push({ id: choiceId ? `trait:${choiceId}` : `${provider.id}:${key}`, provider, definition, traitKey: key,
        rank, choiceId, reason: candidateReason(definition, provider, rank) });
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
    for (let index = 0; index < pending.length;) {
      const candidate = pending[index], { provider, definition } = candidate;
      if (!requirementsMet(provider.entry.prerequisites, context, acquired, definitions)
        || !requirementsMet(definition.prerequisites, context, acquired, definitions)) { index += 1; continue; }
      if (candidate.choiceId && acquired.some((trait) => trait.provider.id === provider.id && trait.traitKey === candidate.traitKey)) candidate.reason = "This provider already grants that Trait.";
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
    choice.options = [...definitions.values()].filter((definition) => offered(definition, choice.provider)).map((definition) => {
      const others = acquired.filter((trait) => trait.choiceId !== choice.choiceId);
      let reason = candidateReason(definition, choice.provider, choice.rank);
      if (!reason && others.some((trait) => trait.provider.id === choice.provider.id && trait.traitKey === definition.traitKey)) reason = "Already selected for this provider.";
      if (!reason && (!requirementsMet(definition.prerequisites, context, others, definitions)
        || !requirementsMet(choice.provider.entry.prerequisites, context, others, definitions))) reason = "Prerequisites are not met.";
      return { traitKey: definition.traitKey, name: definition.name, rank: definition.rank, eligible: !reason, reason };
    }).sort((a, b) => a.name.localeCompare(b.name));
    delete choice.provider;
  }
  for (const choiceId of Object.keys(builder.traitChoices || {})) if (!desiredChoices.has(choiceId)) issues.push({ severity: "warning", code: "orphaned-trait-choice", path: `builder.traitChoices.${choiceId}`, choiceId, remove: true, message: "The Trait's source no longer offers this choice." });
  const techniques = [];
  const traits = acquired.map((candidate) => {
    const { provider, definition } = candidate;
    for (const techniqueKey of definition.techniqueKeys || []) {
      const technique = (gameData.techniques || []).find((item) => item.techniqueKey === techniqueKey);
      if (!isAutomaticTraitTechnique(technique)) continue;
      const eligible = Boolean(technique && isGameDataRecordSelectable(technique, { allowGrantedOnly: true })
        && Number.isInteger(technique.rank) && candidate.rank >= technique.rank
        && requirementsMet(technique.prerequisites, context, acquired, definitions));
      techniques.push({ techniqueKey, traitId: candidate.id, sourceId: provider.sourceId, recipientId: provider.recipientId,
        rank: candidate.rank, active: eligible, eligible, reason: eligible ? "" : "Technique is unfinished, above this rank, or has unmet prerequisites." });
    }
    return { ...definition, id: candidate.id, sourceId: provider.sourceId, sourceLabel: provider.sourceLabel,
      providerId: provider.id,
      recipientId: provider.recipientId, choiceId: candidate.choiceId, rank: candidate.rank, minimumRank: definition.rank,
      active: true, referenceOnly: false, sourceDescription: provider.description,
      classificationTags: definition.tags || [], tags: grantedTags([candidate], definitions) };
  });
  return immutable({ providers: providers.map(({ entry, ...provider }) => provider), traits: [...traits, ...references].sort((a, b) => a.id.localeCompare(b.id)),
    choices, tags: grantedTags(acquired, definitions), techniques, issues,
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
      traitName: trait.name, sourceId: trait.sourceId });
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
