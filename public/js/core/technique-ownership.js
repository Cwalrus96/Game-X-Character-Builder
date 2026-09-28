import { buildTechniqueIndexes, resolveTechniqueRef } from "./game-data.js";
import { getCharacterGrantSources, getActiveCharacterGrantSources } from "./grant-source-rules.js";
import { resolveGrantChoiceIds } from "./choice-identity.js";
import { getDirectTechniqueGrantKeys, getTechniqueGrantSelectionState, isTechniqueChoiceGrant } from "./technique-grant-rules.js";
import { createPrerequisiteContext, meetsPrerequisites } from "./prerequisite-rules.js";
import { computeGrantedSkillsState, getCombatSkillRanks } from "./skill-rules.js";
import { isGameDataGrantExecutable, isGameDataRecordSelectable } from "./selection-rules.js";
import { projectCharacterTraits } from "./trait-rules.js";

/** One known-Technique view for Rules, the graph, builder and sheet. Source
 * records retain ownership, while every acquired Technique has one identity. */
export function projectTechniqueOwnership({ builder = {}, gameData = {}, projectTraits = true } = {}) {
  const indexes = buildTechniqueIndexes(gameData.techniques || []);
  const owned = new Map();
  const add = (ref, source) => {
    const technique = resolveTechniqueRef(ref, indexes).technique;
    if (!technique) return;
    const key = technique.techniqueKey || technique.techniqueName;
    const item = owned.get(key) || { techniqueKey: key, technique, sources: [] };
    if (!item.sources.some(previous => previous.nodeId === source.nodeId)) item.sources.push(source);
    owned.set(key, item);
  };
  for (const key of builder.selectedTechniques || []) add(key, { kind: "selected", nodeId: `technique-selection:${key}`, sourceId: "root:character", sourceLabel: "Selected" });
  const candidates = [];
  for (const source of getCharacterGrantSources(gameData, builder).filter(source => source.available)) {
    for (const [index, grant] of (source.entry.grants || []).entries()) {
      if (!isGameDataGrantExecutable(grant, { source: source.entry })) continue;
      for (const key of getDirectTechniqueGrantKeys(grant)) candidates.push({ ...source, grant, key, kind: "granted",
        nodeId: `automatic-technique:${source.sourceId}:${key}:${index}` });
      if (!isTechniqueChoiceGrant(grant)) continue;
      for (const choiceId of resolveGrantChoiceIds({ ...grant, type: "technique-choice" }, { sourceId: source.sourceId, index })) {
        const answer = builder.grantChoices?.[choiceId];
        if (answer?.type !== "technique" || answer.sourceId !== source.sourceId || !answer.techniqueKey) continue;
        candidates.push({ ...source, grant, key: answer.techniqueKey, kind: "sourceOwned", choiceId, nodeId: `grant-answer:${choiceId}` });
      }
    }
  }
  const base = createPrerequisiteContext({ builder, gameData,
    grantedSkillState: computeGrantedSkillsState(gameData, builder), skillRanks: getCombatSkillRanks(gameData, builder) });
  let traitProjection = { traits: [], techniques: [], weapons: [], tags: [], choices: [], issues: [], providers: [] };
  let previous = "";
  // Grow from saved ordinary choices. Grant/trait cycles cannot grant themselves.
  for (let pass = 0; pass <= candidates.length + (gameData.traits || []).length + 2; pass++) {
    if (projectTraits) traitProjection = projectCharacterTraits({ builder }, gameData, { selectedTechniqueKeys: [...owned.keys()] });
    for (const link of traitProjection.techniques.filter(link => link.active && link.eligible && link.recipientId === "character")) {
      const trait = traitProjection.traits.find(trait => trait.id === link.traitId);
      if (!trait) continue;
      add(link.techniqueKey, { kind: "trait", nodeId: `automatic-technique:${link.weaponId || link.traitId}:${link.techniqueKey}`,
        sourceId: link.sourceId, sourceLabel: trait.name, provider: { rank: link.rank, traitName: trait.name,
          sourceLabel: trait.sourceLabel, sourceId: trait.sourceId, skillName: trait.associatedSkill || "", weaponId: link.weaponId || "" } });
    }
    const context = { ...base, selectedTechniqueKeys: [...owned.keys()], selectedTraits: traitProjection.traits.filter(trait => trait.active && !trait.referenceOnly),
      tags: traitProjection.tags, weapons: [...base.weapons, ...traitProjection.weapons] };
    const activeSources = new Set(getActiveCharacterGrantSources(gameData, builder, context).map(source => source.sourceId));
    for (const candidate of candidates) {
      const technique = resolveTechniqueRef(candidate.key, indexes).technique;
      if (!activeSources.has(candidate.sourceId) || !technique || !isGameDataRecordSelectable(technique, { allowGrantedOnly: true })
        || !meetsPrerequisites(candidate.prerequisites, context) || !meetsPrerequisites(technique.prerequisites, context)) continue;
      if (candidate.kind === "sourceOwned" && !getTechniqueGrantSelectionState(technique, candidate.grant, context).eligible) continue;
      add(candidate.key, { kind: candidate.kind, nodeId: candidate.nodeId, sourceId: candidate.sourceId,
        sourceLabel: candidate.sourceLabel, ...(candidate.choiceId ? { choiceId: candidate.choiceId } : {}) });
    }
    const signature = JSON.stringify([[...owned.keys()], traitProjection.traits.map(trait => [trait.id, trait.active, trait.rank])]);
    if (signature === previous) break;
    previous = signature;
  }
  return { techniques: [...owned.values()], traitProjection };
}

export function getTechniqueOwnershipDetail(item) {
  const grants = item.sources.filter(source => source.kind !== "selected");
  const provider = grants.filter(source => source.provider).sort((a, b) => b.provider.rank - a.provider.rank)[0]?.provider || null;
  return { free: grants.length > 0, provider,
    label: grants.length ? `Granted by ${[...new Set(grants.map(source => source.sourceLabel))].join(", ")}` : "Selected" };
}
