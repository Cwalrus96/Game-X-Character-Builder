import { decodeCharacter } from "./character-codec.js?v=wpe1";
import {
  coerceAttrKey,
  computeTechniqueSlots,
  getAttributeAllocationState,
} from "./character-rules.js?v=wpe1";
import {
  allocateFeatsToExplicitSlots,
  createFeatGrantSlots,
} from "./feat-rules.js?v=wpe10";
import { resolveGrantChoiceIds } from "./choice-identity.js";
import {
  getBondAllocationState,
  isSourceOwnedBondId,
  makeSourceBondId,
  sourceBondTargetName,
} from "./bond-rules.js?v=wpe5";
import { RUNTIME_PREREQUISITE_TYPES, SUPPORTED_GRANT_TYPES, getExpressionDefinition } from "./game-data-contract.js";
import {
  createCharacterGrantCollection,
} from "./game-data.js?v=wpe1";
import { getTechniqueSelectionState, isGameDataRecordExecutable, isGameDataGrantExecutable, isGameDataRecordSelectable } from "./selection-rules.js";
import { canonicalSkillName, canonicalSkillKey } from "./skill-identity.js";
import {
  computeGrantedSkillsState,
  computeKnownCombatSkillsAndGrants,
  getCombatSkillRanks,
  getClassUtilitySkillState,
  getSkillAllocationState,
} from "./skill-rules.js?v=wpe13";
import { createPrerequisiteContext, evaluatePrerequisite } from "./prerequisites.js";
import { initializeGrantedResource } from "./grants.js";
import { getOriginSelectionState } from "./origin-rules.js";
import { registerDefaultGraphExtensions } from "./graph-extensions.js";
import {
  CharacterGraphBuilder,
  GraphHandlerRegistry,
  cloneGraphValue,
  frozenGraphClone,
} from "./graph-core.js";
import { isSourceOwnedWeapon } from "./grants.js";
import {
  MAX_WEAPON_SLOTS,
  computeEnhancementCapacity,
  computeTotalWeaponSlots,
  countPurchasedEnhancements,
  getEnhancementSelectionSpecs,
  getWeaponSkillRankCap,
  getWeaponSkillNames,
  getWeaponSkillRanks,
  isEnhancementCompatible,
} from "./weapon-utils.js";

const DEFAULT_NODE_TYPES = Object.freeze([
  "root",
  "fact",
  "class",
  "origin",
  "resource",
  "class-feature",
  "choice-group",
  "class-option",
  "feat-selection",
  "feat-slot",
  "feat-choice-group",
  "feat-option",
  "class-utility-skill",
  "origin-feature",
  "skill",
  "grant",
  "automatic-technique",
  "grant-choice",
  "grant-answer",
  "technique-selection",
  "weapon",
  "weapon-enhancement",
  "requirement",
  "unsupported-answer",
  "deferred-grant-effect",
  "grant-resource",
  "grant-bond",
  "bond",
  "keystone",
]);

const STABLE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,127})$/;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stableKey(value) {
  const key = text(value);
  return STABLE_KEY_PATTERN.test(key) ? key : "";
}

function values(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const item = text(value);
  return item ? [item] : [];
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "value";
}

function sourceLabel(entry, fallback) {
  return text(entry?.name || entry?.techniqueName || entry?.featureKey || entry?.key) || fallback;
}

function defaultNodeHandler({ graph, node, path }) {
  return graph.addNode(node, { path });
}

function defaultPrerequisiteHandler({ prerequisite, character, gameData }) {
  return evaluatePrerequisite(prerequisite, {
    builder: character.builder,
    gameData,
    ...(gameData.schemaVersion === 3 ? { grantedSkillState: computeGrantedSkillsState(gameData, character.builder) } : {}),
  });
}

function directTechniqueKeys(grant) {
  const keys = values(grant?.key).map(stableKey).filter(Boolean);
  if (keys.length === 1 && !text(grant?.choiceId)) return keys;
  return [];
}

function techniqueChoiceGrant(grant) {
  if (grant?.type === "technique-choice") return true;
  return directTechniqueKeys(grant).length === 0;
}

function defaultTechniqueGrantHandler(context) {
  const {
    grant,
    grantIndex,
    grantNodeId,
    sourceNodeId,
    sourceOwnerId,
    sourceName,
    techniquesByKey,
    addTypedNode,
    graph,
    activeChoices,
    automaticTechniqueKeys,
    addDiagnostic,
    character,
    path,
  } = context;

  const rawGrantKeys = values(grant?.key);
  const stableGrantKeys = rawGrantKeys.map(stableKey).filter(Boolean);
  if (rawGrantKeys.length !== stableGrantKeys.length) {
    addDiagnostic({
      code: "invalid-technique-grant-identity",
      path,
      nodeId: grantNodeId,
      message: "Technique grant keys must use canonical stable identities.",
    });
    return;
  }
  if (!rawGrantKeys.length && values(grant?.name).length && !values(grant?.skill).length && !values(grant?.tag).length) {
    addDiagnostic({
      code: "display-name-technique-grant",
      path,
      nodeId: grantNodeId,
      message: "Technique grants cannot use display names as selection identity.",
    });
    return;
  }

  const directKeys = directTechniqueKeys(grant);
  if (directKeys.length) {
    const techniqueKey = directKeys[0];
    const technique = techniquesByKey.get(techniqueKey);
    if (!technique) {
      addDiagnostic({
        code: "dangling-technique-grant",
        path,
        nodeId: grantNodeId,
        message: `Technique grant references missing technique "${techniqueKey}".`,
      });
      return;
    }
    if (!isGameDataRecordSelectable(technique, { allowGrantedOnly: true })) {
      addDiagnostic({
        code: "unavailable-granted-technique",
        path,
        nodeId: grantNodeId,
        message: `Technique "${techniqueKey}" is unavailable even to a source-owned grant.`,
      });
      return;
    }
    const nodeId = `automatic-technique:${sourceNodeId}:${techniqueKey}:${grantIndex}`;
    addTypedNode("automatic-technique", {
      id: nodeId,
      key: techniqueKey,
      label: sourceLabel(technique, techniqueKey),
      state: "automatic",
      sourceOwnerId,
      storageBinding: null,
      metadata: { techniqueKey, sourceNodeId, grantNodeId },
    }, path);
    graph.addEdge({ kind: "grants", from: grantNodeId, to: nodeId }, { path });
    automaticTechniqueKeys.add(techniqueKey);
    return;
  }

  if (!techniqueChoiceGrant(grant)) return;
  const choiceGrant = { ...grant, type: "technique-choice" };
  const choiceIds = resolveGrantChoiceIds(choiceGrant, { sourceId: sourceNodeId, index: grantIndex });
  if (!choiceIds.length) {
    addDiagnostic({
      code: "missing-grant-choice-identity",
      path,
      nodeId: grantNodeId,
      message: "A source-owned technique choice could not derive a stable choice identity.",
    });
    return;
  }

  for (const choiceId of choiceIds) {
    const previous = activeChoices.get(choiceId);
    if (previous) {
      addDiagnostic({
        code: "duplicate-choice-identity",
        path,
        nodeId: `grant-choice:${choiceId}`,
        message: `Choice identity "${choiceId}" is owned by more than one active grant.`,
      });
      continue;
    }
    const choiceNodeId = `grant-choice:${choiceId}`;
    const answered = Object.prototype.hasOwnProperty.call(character.builder.grantChoices, choiceId);
    addTypedNode("grant-choice", {
      id: choiceNodeId,
      key: choiceId,
      label: sourceName || choiceId,
      state: answered ? "selected" : "incomplete",
      sourceOwnerId,
      storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choiceId },
      metadata: {
        choiceId,
        answered,
        answerType: "technique",
        sourceNodeId,
        grantNodeId,
        filters: {
          skill: values(grant?.skill),
          tag: values(grant?.tag),
        },
      },
    }, path);
    graph.addEdge({ kind: "grants", from: grantNodeId, to: choiceNodeId }, { path });
    activeChoices.set(choiceId, {
      choiceId,
      choiceNodeId,
      sourceNodeId,
      sourceOwnerId,
      sourceName,
      grant,
      answerType: "technique",
      path,
    });
  }
}

function defaultWeaponGrantHandler(context) {
  const {
    grant,
    grantIndex,
    grantNodeId,
    sourceNodeId,
    sourceOwnerId,
    sourceName,
    addTypedNode,
    graph,
    activeChoices,
    character,
    path,
  } = context;
  const choiceIds = resolveGrantChoiceIds(grant, { sourceId: sourceNodeId, index: grantIndex });
  for (const choiceId of choiceIds) {
    if (activeChoices.has(choiceId)) {
      context.addDiagnostic({
        code: "duplicate-choice-identity",
        path,
        nodeId: `grant-choice:${choiceId}`,
        message: `Choice identity "${choiceId}" is owned by more than one active grant.`,
      });
      continue;
    }
    const choiceNodeId = `grant-choice:${choiceId}`;
    const answered = Object.prototype.hasOwnProperty.call(character.builder.grantChoices, choiceId);
    addTypedNode("grant-choice", {
      id: choiceNodeId,
      key: choiceId,
      label: sourceName || choiceId,
      state: answered ? "selected" : "incomplete",
      sourceOwnerId,
      storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choiceId },
      metadata: {
        choiceId,
        answered,
        answerType: "weapon",
        sourceNodeId,
        grantNodeId,
        rank: Number.parseInt(String(grant?.rank ?? 1), 10) || 1,
        enhancement: stableKey(grant?.enhancement),
      },
    }, path);
    graph.addEdge({ kind: "grants", from: grantNodeId, to: choiceNodeId }, { path });
    activeChoices.set(choiceId, {
      choiceId,
      choiceNodeId,
      sourceNodeId,
      sourceOwnerId,
      sourceName,
      grant,
      answerType: "weapon",
      path,
    });
  }
}

function defaultResourceGrantHandler(context) {
  const {
    grant,
    grantIndex,
    grantNodeId,
    sourceOwnerId,
    addTypedNode,
    graph,
    character,
    path,
  } = context;
  const primaryKey = character.builder.primaryAttribute;
  let resource;
  try {
    resource = initializeGrantedResource(grant, {
      source: grant.source,
      primaryAttribute: primaryKey ? character.builder.attributes[primaryKey] : 0,
      values: character.builder.attributes,
    });
  } catch (error) {
    context.addDiagnostic({
      code: "invalid-resource-grant",
      path,
      nodeId: grantNodeId,
      message: error?.message || "Resource grant capacity could not be resolved.",
    });
    return;
  }
  const nodeId = `grant-resource:${grantNodeId}:${resource.resourceKey}:${grantIndex}`;
  addTypedNode("grant-resource", {
    id: nodeId,
    key: resource.resourceKey,
    label: resource.name,
    state: "automatic",
    sourceOwnerId,
    storageBinding: { path: "builder.resources", kind: "keyed-record", key: resource.resourceKey },
    metadata: {
      resourceKey: resource.resourceKey,
      name: resource.name,
      capacity: resource.capacity,
    },
  }, path);
  graph.addEdge({ kind: "materializes", from: grantNodeId, to: nodeId }, { path });
}

function defaultBondGrantHandler(context) {
  const {
    grant,
    grantIndex,
    grantNodeId,
    sourceOwnerId,
    addTypedNode,
    graph,
    activeBondGrants,
    path,
  } = context;
  const count = Math.max(1, Math.min(20, Number.parseInt(String(grant?.count ?? 1), 10) || 1));
  const rank = Math.max(1, Math.min(6, Number.parseInt(String(grant?.rank ?? 1), 10) || 1));
  const choiceId = stableKey(grant?.choiceId) || `bond-${grantIndex + 1}`;
  for (let index = 0; index < count; index += 1) {
    const bondId = makeSourceBondId(sourceOwnerId, choiceId, index);
    if (activeBondGrants.has(bondId)) {
      context.addDiagnostic({
        code: "duplicate-bond-grant-identity",
        path,
        nodeId: `grant-bond:${bondId}`,
        message: `Bond grant identity "${bondId}" is owned by more than one active source.`,
      });
      continue;
    }
    const targetName = sourceBondTargetName(choiceId);
    const nodeId = `grant-bond:${bondId}`;
    const spec = { bondId, choiceId, targetName, rank, sourceOwnerId, grantNodeId };
    activeBondGrants.set(bondId, spec);
    addTypedNode("grant-bond", {
      id: nodeId,
      key: bondId,
      label: targetName,
      state: "automatic",
      sourceOwnerId,
      storageBinding: { path: "builder.bonds", kind: "keyed-record", key: bondId },
      metadata: spec,
    }, path);
    graph.addEdge({ kind: "materializes", from: grantNodeId, to: nodeId }, { path });
  }
}

function deferredGrantHandler({
  grant,
  grantIndex,
  grantNodeId,
  sourceOwnerId,
  addTypedNode,
  addDiagnostic,
  path,
}) {
  const type = text(grant?.type) || "unknown";
  const nodeId = `deferred-grant-effect:${grantNodeId}:${grantIndex}`;
  addTypedNode("deferred-grant-effect", {
    id: nodeId,
    key: type,
    label: sourceLabel(grant, type),
    state: "incomplete",
    sourceOwnerId,
    storageBinding: null,
    metadata: {
      grantType: type,
      runtimeStatus: "deferred-domain",
    },
  }, path);
  addDiagnostic({
    severity: "warning",
    code: "deferred-grant-domain",
    path,
    nodeId,
    message: `Grant type "${type}" belongs to a later domain slice and is preserved without materialization here.`,
  });
}

function defaultFeatGrantHandler({
  grant,
  grantIndex,
  grantNodeId,
  sourceOwnerId,
  sourceName,
  addTypedNode,
  activeFeatSlots,
  graph,
  path,
}) {
  const slots = createFeatGrantSlots(grant, {
    sourceId: sourceOwnerId,
    sourceLabel: sourceName,
    grantId: grantNodeId,
    grantIndex,
  });
  for (const slot of slots) {
    activeFeatSlots.push(slot);
    addTypedNode("feat-slot", {
      id: slot.slotId,
      key: `${slot.grantId}:${slot.slotIndex}`,
      label: slot.sourceLabel,
      state: "available",
      sourceOwnerId,
      storageBinding: { path: "builder.selectedFeats", kind: "ordered-key-array" },
      metadata: cloneGraphValue(slot),
    }, path);
    graph.addEdge({ kind: "materializes", from: grantNodeId, to: slot.slotId }, { path });
  }
}

export function createDefaultGraphHandlerRegistry() {
  const registry = new GraphHandlerRegistry();
  for (const type of DEFAULT_NODE_TYPES) registry.registerNode(type, defaultNodeHandler);
  registry.registerGrant("technique", defaultTechniqueGrantHandler);
  registry.registerGrant("technique-choice", defaultTechniqueGrantHandler);
  registry.registerGrant("weapon", defaultWeaponGrantHandler);
  registry.registerGrant("resource", defaultResourceGrantHandler);
  registry.registerGrant("bond", defaultBondGrantHandler);
  registry.registerGrant("feat", defaultFeatGrantHandler);
  for (const type of SUPPORTED_GRANT_TYPES) {
    if (!registry.getGrant(type)) registry.registerGrant(type, deferredGrantHandler);
  }
  for (const type of RUNTIME_PREREQUISITE_TYPES) {
    registry.registerPrerequisite(type, defaultPrerequisiteHandler);
  }
  return registerDefaultGraphExtensions(registry);
}

function graphWithCharacter(graph, character) {
  return frozenGraphClone({ ...graph, character: character ? cloneGraphValue(character) : null });
}

function invalidCharacterGraph(decoded) {
  const graph = new CharacterGraphBuilder();
  for (const diagnostic of decoded.diagnostics || []) {
    graph.addDiagnostic({
      severity: "error",
      code: diagnostic.code || "invalid-character",
      path: diagnostic.path || "character",
      message: diagnostic.message || "Graph compilation requires an exact schema-v5 character.",
    });
  }
  return graphWithCharacter(graph.finalize({ metadata: { compilerVersion: 1 } }), null);
}

function indexRecords(records, keyField, label, graph, path) {
  const index = new Map();
  const source = Array.isArray(records) ? records : [];
  if (!Array.isArray(records)) {
    graph.addDiagnostic({
      code: "invalid-game-data-collection",
      path,
      message: `${label} collection must be an array.`,
    });
  }
  source.forEach((record, recordIndex) => {
    const key = stableKey(record?.[keyField]);
    const recordPath = `${path}.${recordIndex}.${keyField}`;
    if (!key) {
      graph.addDiagnostic({
        code: "invalid-game-data-identity",
        path: recordPath,
        message: `${label} records require a canonical stable ${keyField}.`,
      });
      return;
    }
    if (index.has(key)) {
      graph.addDiagnostic({
        code: "duplicate-game-data-identity",
        path: recordPath,
        nodeId: `${label.toLowerCase()}:${key}`,
        message: `Duplicate ${label.toLowerCase()} identity "${key}".`,
      });
      return;
    }
    index.set(key, record);
  });
  return index;
}

function compileEquipment(context, character, weaponBasesByKey, weaponEnhancementsByKey, graph) {
  const { builder } = character;
  if (builder.weapons.length === 0) return;
  const grantedSkillState = computeGrantedSkillsState(context.gameData, builder);
  const skillRanks = getWeaponSkillRanks(builder, grantedSkillState);
  const grantCollection = createCharacterGrantCollection(context.gameData, builder);
  const grantedEnhancementSlots = (grantCollection.weaponEnhancementGrants || []).reduce((total, grant) => {
    const count = Number.parseInt(String(grant?.count ?? 1), 10);
    return total + (Number.isFinite(count) ? Math.max(0, count) : 1);
  }, 0);
  const weaponBases = Array.from(weaponBasesByKey.values());

  for (const [weaponIndex, weapon] of builder.weapons.entries()) {
    const path = `character.builder.weapons.${weaponIndex}`;
    const nodeId = `weapon:${weapon.id}`;
    const definition = weaponBasesByKey.get(weapon.weaponKey);
    const sourceOwned = isSourceOwnedWeapon(weapon);
    const selectable = !!definition && isGameDataRecordSelectable(definition, { allowGrantedOnly: sourceOwned });
    const sourceOwnerId = sourceOwned ? `grant-answer:${weapon.sourceChoiceId || weapon.choiceId}` : "root:character";
    const sourceActive = !sourceOwned || context.activeChoices.has(weapon.sourceChoiceId || weapon.choiceId);
    const skillRankCap = definition ? getWeaponSkillRankCap(definition, skillRanks) : 0;
    const hasRankedSkill = definition ? getWeaponSkillNames(definition).some((skill) => Object.prototype.hasOwnProperty.call(skillRanks, skill)) : false;
    const minimumRank = Number(definition?.minRank || 0);
    let valid = !!definition && selectable;
    let issue = definition ? (selectable ? "" : "unavailable-definition") : "missing-definition";
    let reason = definition
      ? (selectable ? "" : `Weapon "${weapon.weaponKey}" is unavailable for this selection.`)
      : `Weapon "${weapon.weaponKey}" does not exist in normalized game data.`;
    if (valid && weapon.rank < minimumRank) {
      valid = false;
      issue = "below-minimum-rank";
      reason = `Weapon "${weapon.weaponKey}" requires rank ${minimumRank} or higher.`;
    } else if (valid && !sourceOwned && hasRankedSkill && weapon.rank > skillRankCap) {
      valid = false;
      issue = "above-skill-rank";
      reason = `Weapon "${weapon.weaponKey}" exceeds its governing skill rank of ${skillRankCap}.`;
    }
    context.addTypedNode("weapon", {
      id: nodeId,
      key: weapon.weaponKey,
      label: text(weapon.customName || definition?.name) || weapon.weaponKey,
      state: valid && sourceActive ? (sourceOwned ? "automatic" : "selected") : "invalid",
      sourceOwnerId,
      storageBinding: { path: "builder.weapons", kind: "keyed-record", key: weapon.id },
      metadata: { weaponId: weapon.id, weaponIndex, sourceOwned, sourceActive, valid, issue, reason, minimumRank, skillRankCap },
    }, path);
    if (sourceActive) {
      graph.addEdge({ kind: sourceOwned ? "materializes" : "owns", from: sourceOwnerId, to: nodeId }, { path });
    }
    if (!valid && !["above-skill-rank", "unavailable-definition"].includes(issue)) {
      context.addDiagnostic({ code: "invalid-weapon", path, nodeId, message: reason });
    }

    for (const [enhancementIndex, enhancement] of weapon.enhancements.entries()) {
      const enhancementPath = `${path}.enhancements.${enhancementIndex}`;
      const enhancementNodeId = `weapon-enhancement:${weapon.id}:${enhancement.id}`;
      const enhancementDefinition = weaponEnhancementsByKey.get(enhancement.enhancementKey);
      const enhancementSelectable = !!enhancementDefinition
        && isGameDataRecordSelectable(enhancementDefinition, { allowGrantedOnly: sourceOwned });
      const minimumEnhancementRank = Number(enhancementDefinition?.minRank || 0);
      let enhancementValid = !!enhancementDefinition && enhancementSelectable;
      let enhancementIssue = enhancementDefinition
        ? (enhancementSelectable ? "" : "unavailable-definition")
        : "missing-definition";
      let enhancementReason = enhancementDefinition
        ? (enhancementSelectable ? "" : `Enhancement "${enhancement.enhancementKey}" is unavailable for this selection.`)
        : `Enhancement "${enhancement.enhancementKey}" does not exist in normalized game data.`;
      if (enhancementValid && enhancement.rank < minimumEnhancementRank) {
        enhancementValid = false;
        enhancementIssue = "below-minimum-rank";
        enhancementReason = `Enhancement "${enhancement.enhancementKey}" requires rank ${minimumEnhancementRank} or higher.`;
      } else if (enhancementValid && enhancement.rank > weapon.rank) {
        enhancementValid = false;
        enhancementIssue = "above-weapon-rank";
        enhancementReason = `Enhancement "${enhancement.enhancementKey}" exceeds weapon rank ${weapon.rank}.`;
      } else if (enhancementValid && !isEnhancementCompatible(
        enhancementDefinition,
        weapon,
        weaponBases,
        { gameData: context.gameData, builder, grantedSkillState },
      )) {
        enhancementValid = false;
        enhancementIssue = "incompatible";
        enhancementReason = `Enhancement "${enhancement.enhancementKey}" is incompatible with this weapon.`;
      } else if (enhancementValid && enhancement.granted === true && !sourceOwned) {
        enhancementValid = false;
        enhancementIssue = "invalid-granted-owner";
        enhancementReason = "A user-owned weapon cannot mark an enhancement as source-granted.";
      }
      context.addTypedNode("weapon-enhancement", {
        id: enhancementNodeId,
        key: enhancement.enhancementKey,
        label: text(enhancementDefinition?.name) || enhancement.enhancementKey,
        state: enhancementValid ? (enhancement.granted ? "automatic" : "selected") : "invalid",
        sourceOwnerId: nodeId,
        storageBinding: { path: `${path}.enhancements`, kind: "keyed-record", key: enhancement.id },
        metadata: {
          weaponId: weapon.id,
          enhancementId: enhancement.id,
          weaponIndex,
          enhancementIndex,
          granted: enhancement.granted,
          valid: enhancementValid,
          issue: enhancementIssue,
          minimumRank: minimumEnhancementRank,
          reason: enhancementReason,
        },
      }, enhancementPath);
      graph.addEdge({ kind: "owns", from: nodeId, to: enhancementNodeId }, { path: enhancementPath });
      if (!enhancementValid && (sourceOwned || !["above-weapon-rank", "incompatible", "unavailable-definition"].includes(enhancementIssue))) {
        context.addDiagnostic({ code: "invalid-weapon-enhancement", path: enhancementPath, nodeId: enhancementNodeId, message: enhancementReason });
      }
      for (const selection of getEnhancementSelectionSpecs(enhancement.enhancementKey)) {
        if (text(enhancement.selections?.[selection.key])) continue;
        context.addDiagnostic({
          severity: "warning",
          code: "weapon-enhancement-selection-incomplete",
          path: `${enhancementPath}.selections.${selection.key}`,
          nodeId: enhancementNodeId,
          message: `${text(enhancementDefinition?.name) || enhancement.enhancementKey} still needs ${selection.label.toLowerCase()}.`,
        });
      }
    }
  }

  const slotUsage = computeTotalWeaponSlots(builder.weapons, weaponBases);
  if (slotUsage > MAX_WEAPON_SLOTS) {
    context.addDiagnostic({
      code: "weapon-slot-capacity-exceeded",
      path: "character.builder.weapons",
      nodeId: "root:character",
      message: `Weapons use ${slotUsage} slots, exceeding the capacity of ${MAX_WEAPON_SLOTS}.`,
    });
  }
  const enhancementUsage = countPurchasedEnhancements(builder.weapons);
  const enhancementCapacity = computeEnhancementCapacity(builder.weapons, grantedEnhancementSlots);
  if (enhancementUsage > enhancementCapacity) {
    context.addDiagnostic({
      code: "weapon-enhancement-capacity-exceeded",
      path: "character.builder.weapons",
      nodeId: "root:character",
      message: `Purchased enhancements use ${enhancementUsage} slots, exceeding the capacity of ${enhancementCapacity}.`,
    });
  }
}

function compileClassUtilitySkills(context, character, gameData, graph) {
  const { builder } = character;
  const utility = getClassUtilitySkillState(gameData, builder);
  const classKey = utility.classKey;
  const normalizedOptions = new Map(utility.options.map((option) => [option.key, option]));
  builder.selectedClassUtilitySkills.forEach((skillKey, index) => {
    const nodeId = `class-utility-skill:${skillKey}`;
    const allowed = normalizedOptions.has(skillKey);
    const withinCapacity = index < utility.expectedCount;
    context.addTypedNode("class-utility-skill", {
      id: nodeId,
      key: skillKey,
      label: skillKey,
      state: allowed && withinCapacity ? "selected" : "invalid",
      sourceOwnerId: classKey ? `class:${classKey}` : "root:character",
      storageBinding: { path: "builder.selectedClassUtilitySkills", kind: "ordered-key-array" },
      metadata: { classKey, skillKey, index, allowed, withinCapacity, expectedCount: utility.expectedCount },
    }, `character.builder.selectedClassUtilitySkills.${index}`);
    graph.addEdge({
      kind: classKey ? "offers" : "owns",
      from: classKey ? `class:${classKey}` : "root:character",
      to: nodeId,
    }, { path: `character.builder.selectedClassUtilitySkills.${index}` });
  });
}

function skillNodeId(domain, key) {
  return `skill:${domain}:${encodeURIComponent(String(key || "").toLowerCase())}`;
}

function compileSkills(context, character, gameData, graph) {
  const allocation = getSkillAllocationState(gameData, character.builder);
  const add = (record) => {
    const id = skillNodeId(record.domain, record.key);
    context.addTypedNode("skill", {
      id,
      key: record.key,
      label: record.name,
      state: record.rank <= record.cap ? (record.editable ? "selected" : "automatic") : "invalid",
      sourceOwnerId: record.editable ? "root:character" : `class:${character.builder.classKey}`,
      storageBinding: record.domain === "fixed"
        ? { path: record.path, kind: "scalar" }
        : { path: record.domain === "combat" ? "builder.sheet.repeatables.combatSkillsExtra" : "builder.sheet.repeatables.settingSkills", kind: "keyed-record", key: record.key },
      metadata: { ...record, valid: record.rank <= record.cap },
    }, `character.${record.path}`);
    graph.addEdge({ kind: "owns", from: record.editable ? "root:character" : `class:${character.builder.classKey}`, to: id }, { path: `character.${record.path}` });
  };
  [...allocation.fixed, ...allocation.combat, ...allocation.setting].forEach(add);
  for (const record of allocation.defense) {
    const id = skillNodeId("defense", record.key);
    context.addTypedNode("skill", {
      id, key: record.key, label: record.name, state: "automatic",
      sourceOwnerId: character.builder.classKey ? `class:${character.builder.classKey}` : "root:character",
      storageBinding: { path: `builder.sheet.fields.${record.key}`, kind: "scalar" },
      metadata: { domain: "defense", ...record, editable: false, valid: true },
    }, `character.builder.sheet.fields.${record.key}`);
  }
  for (const record of [...allocation.grantedCombatSkills, ...allocation.grantedSettingSkills]) {
    const name = record.skill;
    const id = skillNodeId("granted", record.skillKey || name);
    if (graph.hasNode(id)) continue;
    context.addTypedNode("skill", {
      id, key: record.skillKey || slug(name), label: name, state: "automatic",
      sourceOwnerId: "root:character", storageBinding: null,
      metadata: { domain: "granted", name, rank: Number(record.rank || 0), editable: false, valid: true, source: record.source },
    }, "character.builder");
  }
  return allocation;
}

function compileBondsAndKeystones(context, character, graph) {
  const specs = Array.from(context.activeBondGrants.values()).sort((left, right) => left.bondId.localeCompare(right.bondId));
  const allocation = getBondAllocationState(character.builder, { sourceBondSpecs: specs });
  const activeSpecs = new Map(specs.map((spec) => [spec.bondId, spec]));
  for (const record of allocation.bonds) {
    const sourceSpec = activeSpecs.get(record.bondId) || null;
    const orphanedSource = record.sourceOwned && !sourceSpec;
    const nodeId = `bond:${record.bondId}`;
    const valid = !orphanedSource && record.withinCapacity && record.rankValid;
    context.addTypedNode("bond", {
      id: nodeId,
      key: record.bondId,
      label: record.name || sourceSpec?.targetName || "Bond",
      state: valid ? (record.sourceOwned ? "automatic" : "selected") : "invalid",
      sourceOwnerId: sourceSpec?.sourceOwnerId || "root:character",
      storageBinding: { path: "builder.bonds", kind: "keyed-record", key: record.bondId },
      metadata: {
        sourceOwned: record.sourceOwned,
        orphanedSource,
        withinCapacity: record.withinCapacity,
        rank: record.rank,
        rankValid: record.rankValid,
        rankCap: record.maximumRank,
        grantedMinimum: record.grantedMinimum,
        complete: record.complete,
        index: record.index,
      },
    }, `character.builder.bonds.${record.index}`);
    graph.addEdge({
      kind: "owns",
      from: sourceSpec?.sourceOwnerId || "root:character",
      to: nodeId,
    }, { path: `character.builder.bonds.${record.index}` });
    if (sourceSpec) {
      graph.addEdge({ kind: "materializes", from: `grant-bond:${record.bondId}`, to: nodeId }, { path: `character.builder.bonds.${record.index}` });
    }
    if (record.keystone) {
      const keystoneId = `keystone:bond:${record.bondId}`;
      context.addTypedNode("keystone", {
        id: keystoneId,
        key: record.bondId,
        label: `${record.name || sourceSpec?.targetName || "Bond"} Keystone`,
        state: "selected",
        sourceOwnerId: nodeId,
        storageBinding: { path: "builder.bonds", kind: "keyed-record", key: record.bondId },
        metadata: { keystoneType: "bond", bondId: record.bondId },
      }, `character.builder.bonds.${record.index}.keystone`);
      graph.addEdge({ kind: "owns", from: nodeId, to: keystoneId }, { path: `character.builder.bonds.${record.index}.keystone` });
    }
  }
  character.builder.backgroundKeystones.forEach((keystone, index) => {
    const nodeId = `keystone:background:${index === 0 ? "first" : "second"}`;
    context.addTypedNode("keystone", {
      id: nodeId,
      key: index === 0 ? "first" : "second",
      label: `Background Keystone ${index + 1}`,
      state: "selected",
      sourceOwnerId: "root:character",
      storageBinding: { path: `builder.backgroundKeystones.${index}`, kind: "scalar" },
      metadata: { keystoneType: "background", slot: index + 1 },
    }, `character.builder.backgroundKeystones.${index}`);
    graph.addEdge({ kind: "owns", from: "root:character", to: nodeId }, { path: `character.builder.backgroundKeystones.${index}` });
  });
  return allocation;
}

function evidenceNodeId(prerequisite, character) {
  const type = text(prerequisite?.type) || "unknown";
  if (type === "class" && character.builder.classKey) return `class:${character.builder.classKey}`;
  if (type === "origin" && character.builder.originKey) return `origin:${character.builder.originKey}`;
  if (type === "attribute") {
    const key = values(prerequisite?.key || prerequisite?.name)[0];
    return key ? `fact:attribute:${slug(key)}` : "";
  }
  if (type === "resource") return `resource:${slug(prerequisite?.resourceKey)}`;
  if (type === "feat") {
    const key = values(prerequisite?.key || prerequisite?.name)[0];
    return key ? `feat-selection:${stableKey(key) || slug(key)}` : "";
  }
  return `fact:prerequisite:${type}:${slug(
    prerequisite?.choiceRef
      || prerequisite?.key
      || prerequisite?.name
      || prerequisite?.tag
      || prerequisite?.text,
  )}`;
}

function createCompilerContext({ character, gameData, registry, graph, classesByKey, techniquesByKey, weaponBasesByKey }) {
  const activeChoices = new Map();
  const activeBondGrants = new Map();
  const automaticTechniqueKeys = new Set();
  const selectedClassOptionKeys = new Set(character.builder.selectedClassFeatureOptions);
  const selectedFeatKeys = new Set(character.builder.selectedFeats);
  const selectedFeatOptionKeys = new Set(character.builder.selectedFeatOptions);
  const offeredClassOptionKeys = new Set();
  const offeredFeatOptionKeys = new Set();
  const classOptionNodeIds = new Map();
  const activeSources = [];
  const activeFeatSlots = [];

  const addDiagnostic = (diagnostic) => graph.addDiagnostic(diagnostic);

  const addTypedNode = (type, node, path = "graph.nodes") => {
    const handler = registry.getNode(type);
    if (!handler) {
      addDiagnostic({
        code: "missing-node-handler",
        path,
        nodeId: node?.id || "",
        message: `No graph node handler is registered for "${type}".`,
      });
      return null;
    }
    try {
      return handler({ graph, node: { ...node, type }, path, character, gameData, registry });
    } catch (error) {
      addDiagnostic({
        code: "node-handler-failed",
        path,
        nodeId: node?.id || "",
        message: `Graph node handler "${type}" failed: ${error?.message || "unknown error"}`,
      });
      return null;
    }
  };

  const compileRequirements = (sourceNodeId, prerequisites, path) => {
    const results = [];
    const list = Array.isArray(prerequisites) ? prerequisites : [];
    list.forEach((prerequisite, index) => {
      const type = text(prerequisite?.type);
      const requirementNodeId = `requirement:${sourceNodeId}:${index}:${type || "unknown"}`;
      const handler = registry.getPrerequisite(type) || (gameData.schemaVersion === 3
        && (type === "any" || getExpressionDefinition("prerequisite", type, { syntaxVersion: 3 })) ? defaultPrerequisiteHandler : null);
      if (!handler) {
        addDiagnostic({
          code: "missing-prerequisite-handler",
          path: `${path}.${index}`,
          nodeId: requirementNodeId,
          message: `No prerequisite handler is registered for "${type || "unknown"}".`,
        });
        results.push({ ok: false, manual: false, requirementNodeId, type });
        return;
      }
      let result;
      try {
        result = handler({ prerequisite, character, gameData, sourceNodeId, path: `${path}.${index}` });
      } catch (error) {
        addDiagnostic({
          code: "invalid-prerequisite",
          path: `${path}.${index}`,
          nodeId: requirementNodeId,
          message: `Prerequisite handler "${type}" failed: ${error?.message || "unknown error"}`,
        });
        results.push({ ok: false, manual: false, requirementNodeId, type });
        return;
      }
      const ok = result?.ok === true;
      const manual = result?.manual === true;
      addTypedNode("requirement", {
        id: requirementNodeId,
        key: type,
        label: text(result?.label) || type,
        state: manual ? "incomplete" : ok ? "available" : "invalid",
        sourceOwnerId: sourceNodeId,
        storageBinding: null,
        metadata: {
          prerequisite: cloneGraphValue(prerequisite),
          met: ok,
          manual,
          reason: text(result?.reason),
        },
      }, `${path}.${index}`);
      graph.addEdge({ kind: "requires", from: sourceNodeId, to: requirementNodeId }, { path: `${path}.${index}` });
      if (ok) {
        const evidenceId = evidenceNodeId(prerequisite, character);
        if (evidenceId && !graph.hasNode(evidenceId)) {
          addTypedNode("fact", {
            id: evidenceId,
            key: type,
            label: text(result?.label) || type,
            state: "automatic",
            sourceOwnerId: "root:character",
            storageBinding: null,
            metadata: { prerequisiteType: type },
          }, `${path}.${index}`);
        }
        if (evidenceId) graph.addEdge({ kind: "satisfies", from: evidenceId, to: requirementNodeId }, { path: `${path}.${index}` });
      }
      if (manual) {
        addDiagnostic({
          severity: "warning",
          code: "manual-prerequisite",
          path: `${path}.${index}`,
          nodeId: requirementNodeId,
          message: text(result?.reason) || "This prerequisite requires manual review.",
        });
      }
      results.push({ ok, manual, requirementNodeId, type, reason: text(result?.reason) });
    });
    return results;
  };

  const compileGrants = (source) => {
    const grants = Array.isArray(source.entry?.grants) ? source.entry.grants : [];
    if (!isGameDataRecordExecutable(source.entry)) {
      addDiagnostic({
        severity: "warning", code: "deferred-source-mechanics", path: source.path, nodeId: source.nodeId,
        message: `Mechanics from "${source.label}" are preserved but unavailable: ${(source.entry.runtimeSupport?.reasons || [source.entry.status]).filter(Boolean).join(", ")}.`,
      });
    }
    grants.forEach((grant, grantIndex) => {
      const type = text(grant?.type);
      const grantNodeId = `grant:${source.nodeId}:${grantIndex}:${type || "unknown"}`;
      const path = `${source.path}.grants.${grantIndex}`;
      addTypedNode("grant", {
        id: grantNodeId,
        key: type,
        label: type || "Unknown grant",
        state: "automatic",
        sourceOwnerId: source.nodeId,
        storageBinding: null,
        metadata: { grant: cloneGraphValue(grant), sourceNodeId: source.nodeId },
      }, path);
      graph.addEdge({ kind: "grants", from: source.nodeId, to: grantNodeId }, { path });
      if (!isGameDataGrantExecutable(grant, { source: source.entry })) {
        deferredGrantHandler({ grant, grantIndex, grantNodeId, sourceOwnerId: source.nodeId, addTypedNode, addDiagnostic, path });
        return;
      }
      const handler = registry.getGrant(type);
      if (!handler) {
        addDiagnostic({
          code: "missing-grant-handler",
          path,
          nodeId: grantNodeId,
          message: `No graph grant handler is registered for "${type || "unknown"}".`,
        });
        return;
      }
      try {
        handler({
          grant,
          grantIndex,
          grantNodeId,
          sourceNodeId: source.nodeId,
          sourceOwnerId: source.nodeId,
          sourceName: source.label,
          techniquesByKey,
          weaponBasesByKey,
          classesByKey,
          character,
          gameData,
          registry,
          graph,
          addTypedNode,
          addDiagnostic,
          compileRequirements,
          activeChoices,
          activeBondGrants,
          automaticTechniqueKeys,
          activeFeatSlots,
          path,
        });
      } catch (error) {
        addDiagnostic({
          code: "grant-handler-failed",
          path,
          nodeId: grantNodeId,
          message: `Graph grant handler "${type}" failed: ${error?.message || "unknown error"}`,
        });
      }
    });
  };

  return {
    gameData,
    activeChoices,
    activeBondGrants,
    automaticTechniqueKeys,
    selectedClassOptionKeys,
    selectedFeatKeys,
    selectedFeatOptionKeys,
    offeredClassOptionKeys,
    offeredFeatOptionKeys,
    classOptionNodeIds,
    activeSources,
    activeFeatSlots,
    addDiagnostic,
    addTypedNode,
    compileRequirements,
    compileGrants,
  };
}

function compileRootFacts(context, character) {
  const { addTypedNode } = context;
  const builder = character.builder;
  const attributeAllocation = getAttributeAllocationState({
    level: builder.level,
    primaryAttribute: builder.primaryAttribute,
    attributes: builder.attributes,
  });
  addTypedNode("root", {
    id: "root:character",
    key: character.ownerUid,
    label: builder.name || "Character",
    state: "automatic",
    sourceOwnerId: "",
    storageBinding: null,
    metadata: { schemaVersion: character.schemaVersion },
  }, "character");
  addTypedNode("fact", {
    id: `fact:level:${builder.level}`,
    key: String(builder.level),
    label: `Level ${builder.level}`,
    state: "automatic",
    sourceOwnerId: "root:character",
    storageBinding: { path: "builder.level", kind: "scalar" },
    metadata: { value: builder.level },
  }, "character.builder.level");
  for (const [attributeKey, value] of Object.entries(builder.attributes)) {
    const { minimum, cap: maximum } = attributeAllocation.limits[attributeKey];
    addTypedNode("fact", {
      id: `fact:attribute:${attributeKey}`,
      key: attributeKey,
      label: attributeKey,
      state: "automatic",
      sourceOwnerId: "root:character",
      storageBinding: { path: `builder.attributes.${attributeKey}`, kind: "scalar" },
      metadata: { value, minimum, maximum, valid: value >= minimum && value <= maximum },
    }, `character.builder.attributes.${attributeKey}`);
  }
  for (const [resourceKey, resource] of Object.entries(builder.resources)) {
    addTypedNode("resource", {
      id: `resource:${resourceKey}`,
      key: resourceKey,
      label: resource.name || resourceKey,
      state: "selected",
      sourceOwnerId: "root:character",
      storageBinding: { path: "builder.resources", kind: "keyed-record", key: resourceKey },
      metadata: { capacity: resource.capacity, current: resource.current },
    }, `character.builder.resources.${resourceKey}`);
  }
}

function compileClassAndOrigin(context, character, classesByKey, originsByKey, graph) {
  const builder = character.builder;
  if (builder.classKey) {
    const cls = classesByKey.get(builder.classKey);
    const allowedPrimaryAttributes = cls
      ? [coerceAttrKey(cls.primaryAttributeA), coerceAttrKey(cls.primaryAttributeB)].filter(Boolean)
      : [];
    context.addTypedNode("class", {
      id: `class:${builder.classKey}`,
      key: builder.classKey,
      label: sourceLabel(cls, builder.classKey),
      state: cls ? "selected" : "invalid",
      sourceOwnerId: "root:character",
      storageBinding: { path: "builder.classKey", kind: "scalar" },
      metadata: {
        exists: !!cls,
        selectable: cls ? isGameDataRecordSelectable(cls) : false,
        allowedPrimaryAttributes,
        primaryAttributeValid: !builder.primaryAttribute || allowedPrimaryAttributes.includes(builder.primaryAttribute),
      },
    }, "character.builder.classKey");
    graph.addEdge({ kind: "owns", from: "root:character", to: `class:${builder.classKey}` }, { path: "character.builder.classKey" });
    if (!cls) {
      context.addDiagnostic({
        code: "dangling-class-reference",
        path: "character.builder.classKey",
        nodeId: `class:${builder.classKey}`,
        message: `Selected class "${builder.classKey}" does not exist in normalized game data.`,
      });
    } else if (cls.selectable === false || text(cls.status).toLowerCase() === "draft" || text(cls.status).toLowerCase() === "incomplete") {
      context.addDiagnostic({
        code: "unavailable-selected-class",
        path: "character.builder.classKey",
        nodeId: `class:${builder.classKey}`,
        message: `Selected class "${builder.classKey}" is not available for selection.`,
      });
    }
  }
  if (builder.originKey) {
    const origin = originsByKey.get(builder.originKey);
    const selectable = getOriginSelectionState(context.gameData, builder).selected?.selectable === true;
    context.addTypedNode("origin", {
      id: `origin:${builder.originKey}`,
      key: builder.originKey,
      label: sourceLabel(origin, builder.originKey),
      state: selectable ? "selected" : "invalid",
      sourceOwnerId: "root:character",
      storageBinding: { path: "builder.originKey", kind: "scalar" },
      metadata: { exists: !!origin, selectable },
    }, "character.builder.originKey");
    graph.addEdge({ kind: "owns", from: "root:character", to: `origin:${builder.originKey}` }, { path: "character.builder.originKey" });
    if (selectable) context.activeSources.push({ nodeId: `origin:${builder.originKey}`, entry: origin, label: sourceLabel(origin, builder.originKey), path: `gameData.origins.${builder.originKey}` });
  }
  if (builder.originKeystone) {
    context.addTypedNode("fact", {
      id: "fact:origin-keystone", key: "origin-keystone", label: "Origin Keystone", state: "selected",
      sourceOwnerId: builder.originKey ? `origin:${builder.originKey}` : "root:character",
      storageBinding: { path: "builder.originKeystone", kind: "scalar" },
      metadata: { value: builder.originKeystone },
    }, "character.builder.originKeystone");
  }
}

function compileOriginFeatures(context, character, originsByKey, graph) {
  const originKey = character.builder.originKey;
  const origin = originsByKey.get(originKey);
  if (!origin || getOriginSelectionState(context.gameData, character.builder).selected?.selectable !== true) return;
  (Array.isArray(origin.features) ? origin.features : []).forEach((feature, index) => {
    const featureKey = `${index}:${slug(feature?.name || "feature")}`;
    const nodeId = `origin-feature:${originKey}:${featureKey}`;
    const path = `gameData.origins.${originKey}.features.${index}`;
    context.addTypedNode("origin-feature", {
      id: nodeId, key: featureKey, label: sourceLabel(feature, featureKey), state: "automatic",
      sourceOwnerId: `origin:${originKey}`, storageBinding: null,
      metadata: { originKey, featureKey, description: text(feature?.description), abilityName: `Origin Feature - ${sourceLabel(feature, featureKey)}` },
    }, path);
    graph.addEdge({ kind: "owns", from: `origin:${originKey}`, to: nodeId }, { path });
    context.activeSources.push({ nodeId, entry: feature, label: sourceLabel(feature, featureKey), path });
  });
}

function featureKind(entry) {
  const kind = text(entry?.type || entry?.kind).toLowerCase();
  if (kind === "optiongroup" || kind === "option-group") return "optionGroup";
  if (kind === "option") return "option";
  return "feature";
}

function entryLevel(entry) {
  const level = Number.parseInt(String(entry?.level ?? 1), 10);
  return Number.isSafeInteger(level) && level > 0 ? level : 1;
}

function compileClassFeatures(context, character, gameData, graph) {
  const classKey = character.builder.classKey;
  if (!classKey) return;
  const entriesByClass = isPlainObject(gameData?.classFeatures) ? gameData.classFeatures : {};
  const entries = Array.isArray(entriesByClass[classKey]) ? entriesByClass[classKey] : [];
  const featureKeys = new Set();

  const recordIdentity = (entry, path) => {
    const key = gameData.schemaVersion === 3 ? text(entry?.featureKey) : stableKey(entry?.featureKey);
    if (!key) {
      context.addDiagnostic({
        code: "invalid-feature-identity",
        path: `${path}.featureKey`,
        message: "Class feature entries require stable featureKey identities.",
      });
      return "";
    }
    if (featureKeys.has(key)) {
      context.addDiagnostic({
        code: "duplicate-feature-identity",
        path: `${path}.featureKey`,
        nodeId: `class-feature:${classKey}:${key}`,
        message: `Duplicate class feature identity "${classKey}:${key}".`,
      });
      return "";
    }
    featureKeys.add(key);
    return key;
  };

  const compileSelectedOption = (entry, groupNodeId, path) => {
    const key = recordIdentity(entry, path);
    if (!key) return;
    context.offeredClassOptionKeys.add(key);
    const selected = context.selectedClassOptionKeys.has(key);
    const executable = isGameDataRecordExecutable(entry);
    const nodeId = `class-option:${classKey}:${key}`;
    context.classOptionNodeIds.set(key, nodeId);
    context.addTypedNode("class-option", {
      id: nodeId,
      key,
      label: sourceLabel(entry, key),
      state: !executable ? "incomplete" : selected ? "selected" : "available",
      sourceOwnerId: groupNodeId,
      storageBinding: { path: "builder.selectedClassFeatureOptions", kind: "ordered-key-array" },
      metadata: {
        selected, classKey, featureKey: key,
        description: text(entry?.description),
        abilityName: `Class Feature - ${sourceLabel(entry, key)}`,
      },
    }, path);
    graph.addEdge({ kind: "offers", from: groupNodeId, to: nodeId }, { path });
    if (!selected) return;
    if (!executable) {
      context.addDiagnostic({ code: "unavailable-feature-option", path, nodeId, message: `Option "${sourceLabel(entry, key)}" has incomplete or deferred mechanics.` });
      return;
    }
    graph.addEdge({ kind: "owns", from: groupNodeId, to: nodeId }, { path });
    const requirements = context.compileRequirements(nodeId, entry?.prerequisites, `${path}.prerequisites`);
    const active = requirements.every((result) => result.ok || result.manual);
    if (active) context.activeSources.push({ nodeId, entry, label: sourceLabel(entry, key), path });

    if (featureKind(entry) === "optionGroup") {
      compileGroup(entry, nodeId, `${path}.options`);
    }
  };

  const compileGroup = (group, ownerNodeId, path) => {
    const key = stableKey(group?.featureKey) || slug(path);
    const groupNodeId = `choice-group:${classKey}:${key}:${slug(ownerNodeId)}`;
    const options = Array.isArray(group?.options) ? group.options : [];
    const selectedCount = options.filter((option) => context.selectedClassOptionKeys.has(stableKey(option?.featureKey))).length;
    const expectedCount = Math.max(1, Number.parseInt(String(group?.chooseCount ?? 1), 10) || 1);
    context.addTypedNode("choice-group", {
      id: groupNodeId,
      key,
      label: sourceLabel(group, key),
      state: selectedCount === expectedCount ? "available" : "incomplete",
      sourceOwnerId: ownerNodeId,
      storageBinding: { path: "builder.selectedClassFeatureOptions", kind: "ordered-key-array" },
      metadata: { selectedCount, expectedCount, classKey, featureKey: key },
    }, path);
    graph.addEdge({ kind: "offers", from: ownerNodeId, to: groupNodeId }, { path });
    if (!isGameDataRecordExecutable(group)) {
      context.addDiagnostic({ severity: "warning", code: "deferred-source-mechanics", path, nodeId: groupNodeId, message: `Choices from "${sourceLabel(group, key)}" require deferred mechanics.` });
      return;
    }
    options.forEach((option, index) => compileSelectedOption(option, groupNodeId, `${path}.${index}`));
  };

  entries.forEach((entry, index) => {
    const path = `gameData.classFeatures.${classKey}.${index}`;
    if (entryLevel(entry) > character.builder.level) return;
    const kind = featureKind(entry);
    if (kind === "optionGroup") {
      const key = recordIdentity(entry, path);
      if (!key) return;
      compileGroup(entry, `class:${classKey}`, path);
      return;
    }
    if (kind === "option") {
      context.addDiagnostic({
        code: "orphan-feature-option",
        path,
        message: `Top-level class option "${entry?.featureKey || "unknown"}" has no owning option group.`,
      });
      return;
    }
    const key = recordIdentity(entry, path);
    if (!key) return;
    const nodeId = `class-feature:${classKey}:${key}`;
    context.addTypedNode("class-feature", {
      id: nodeId,
      key,
      label: sourceLabel(entry, key),
      state: "automatic",
      sourceOwnerId: `class:${classKey}`,
      storageBinding: null,
      metadata: {
        classKey, featureKey: key, level: entryLevel(entry),
        description: text(entry?.description),
        abilityName: `Class Feature - ${sourceLabel(entry, key)}`,
      },
    }, path);
    graph.addEdge({ kind: "owns", from: `class:${classKey}`, to: nodeId }, { path });
    const requirements = context.compileRequirements(nodeId, entry?.prerequisites, `${path}.prerequisites`);
    if (requirements.every((result) => result.ok || result.manual)) {
      context.activeSources.push({ nodeId, entry, label: sourceLabel(entry, key), path });
    }
  });

  for (const selectedKey of context.selectedClassOptionKeys) {
    if (context.offeredClassOptionKeys.has(selectedKey)) continue;
    const nodeId = `class-option:${classKey}:${selectedKey}`;
    context.addTypedNode("class-option", {
      id: nodeId,
      key: selectedKey,
      label: selectedKey,
      state: "invalid",
      sourceOwnerId: `class:${classKey}`,
      storageBinding: { path: "builder.selectedClassFeatureOptions", kind: "ordered-key-array" },
      metadata: {
        selected: true,
        orphaned: true,
        classKey,
        featureKey: selectedKey,
      },
    }, "character.builder.selectedClassFeatureOptions");
  }
}

function compileFeats(context, character, featsByKey, graph) {
  const builder = character.builder;
  const optionOwners = new Map();
  const allocation = allocateFeatsToExplicitSlots({
    slots: context.activeFeatSlots,
    feats: Array.from(featsByKey.values()),
    selectedFeatKeys: builder.selectedFeats,
  });
  const assignmentByFeatKey = new Map(
    allocation.assignments.map((assignment) => [assignment.featKey, assignment]),
  );

  for (const feat of featsByKey.values()) {
    const featKey = stableKey(feat?.featKey);
    const options = Array.isArray(feat?.options) ? feat.options : [];
    for (const option of options) {
      const optionKey = stableKey(option?.featKey);
      if (!optionKey) continue;
      if (optionOwners.has(optionKey)) {
        context.addDiagnostic({
          code: "duplicate-feat-option-identity",
          path: `gameData.feats.${featKey}.options`,
          nodeId: `feat-option:${optionKey}`,
          message: `Feat option identity "${optionKey}" is owned by more than one feat.`,
        });
      } else {
        optionOwners.set(optionKey, { feat, featKey, option });
      }
    }
  }

  for (const [index, featKey] of builder.selectedFeats.entries()) {
    const feat = featsByKey.get(featKey);
    const nodeId = `feat-selection:${featKey}`;
    const path = `character.builder.selectedFeats.${index}`;
    if (!feat) {
      context.addTypedNode("feat-selection", {
        id: nodeId,
        key: featKey,
        label: featKey,
        state: "invalid",
        sourceOwnerId: "root:character",
        storageBinding: { path: "builder.selectedFeats", kind: "ordered-key-array" },
        metadata: { featKey, index, exists: false, selected: true },
      }, path);
      graph.addEdge({ kind: "owns", from: "root:character", to: nodeId }, { path });
      context.addDiagnostic({
        code: "dangling-feat-reference",
        path,
        nodeId,
        message: `Selected feat "${featKey}" does not exist in normalized game data.`,
      });
      continue;
    }

    const assignment = assignmentByFeatKey.get(featKey);
    const featOwnerId = assignment?.slotId || "root:character";
    context.addTypedNode("feat-selection", {
      id: nodeId,
      key: featKey,
      label: sourceLabel(feat, featKey),
      state: assignment ? "selected" : "invalid",
      sourceOwnerId: featOwnerId,
      storageBinding: { path: "builder.selectedFeats", kind: "ordered-key-array" },
      metadata: {
        featKey, index, exists: true, selected: true,
        slotMatched: Boolean(assignment),
        featSlotId: assignment?.slotId || "",
        featSlotSourceId: assignment?.slot?.sourceId || "",
        featSlotSourceLabel: assignment?.slot?.sourceLabel || "",
        description: text(feat?.description),
        abilityName: `Feat - ${sourceLabel(feat, featKey)}`,
      },
    }, path);
    graph.addEdge({ kind: "owns", from: featOwnerId, to: nodeId }, { path });
    const requirements = context.compileRequirements(nodeId, feat.prerequisites, `gameData.feats.${featKey}.prerequisites`);
    if (assignment && requirements.every((result) => result.ok || result.manual)) {
      context.activeSources.push({
        nodeId,
        entry: feat,
        label: sourceLabel(feat, featKey),
        path: `gameData.feats.${featKey}`,
      });
    }

    // V3 option answers only exist while their selected parent is eligible.
    if (feat.expressionSyntaxVersion === 3 && (!assignment || !isGameDataRecordExecutable(feat)
      || !requirements.every((result) => result.ok || result.manual))) continue;

    const options = Array.isArray(feat.options) ? feat.options : [];
    if (!options.length) continue;
    const expectedCount = Math.max(1, Number.parseInt(String(feat.chooseCount ?? 1), 10) || 1);
    const selectedCount = options.filter((option) => (
      context.selectedFeatOptionKeys.has(stableKey(option?.featKey))
    )).length;
    const groupNodeId = `feat-choice-group:${featKey}`;
    context.addTypedNode("feat-choice-group", {
      id: groupNodeId,
      key: featKey,
      label: sourceLabel(feat, featKey),
      state: selectedCount === expectedCount ? "available" : "incomplete",
      sourceOwnerId: nodeId,
      storageBinding: { path: "builder.selectedFeatOptions", kind: "ordered-key-array" },
      metadata: { featKey, selectedCount, expectedCount },
    }, `gameData.feats.${featKey}.options`);
    graph.addEdge({ kind: "offers", from: nodeId, to: groupNodeId }, { path: `gameData.feats.${featKey}.options` });

    for (const option of options) {
      const optionKey = stableKey(option?.featKey);
      if (!optionKey) {
        context.addDiagnostic({
          code: "invalid-feat-option-identity",
          path: `gameData.feats.${featKey}.options`,
          message: `Feat "${featKey}" has an option without a stable featKey.`,
        });
        continue;
      }
      context.offeredFeatOptionKeys.add(optionKey);
      const selected = context.selectedFeatOptionKeys.has(optionKey);
      const executable = isGameDataRecordExecutable(option);
      const optionNodeId = `feat-option:${optionKey}`;
      context.addTypedNode("feat-option", {
        id: optionNodeId,
        key: optionKey,
        label: sourceLabel(option, optionKey),
        state: !executable ? "incomplete" : selected ? "selected" : "available",
        sourceOwnerId: nodeId,
        storageBinding: { path: "builder.selectedFeatOptions", kind: "ordered-key-array" },
        metadata: {
          featKey, optionKey, selected, orphaned: false,
          description: text(option?.description),
          abilityName: `Feat Option - ${sourceLabel(option, optionKey)}`,
        },
      }, `gameData.feats.${featKey}.options`);
      graph.addEdge({ kind: "offers", from: groupNodeId, to: optionNodeId }, { path: `gameData.feats.${featKey}.options` });
      if (!selected) continue;
      if (!executable) {
        context.addDiagnostic({ code: "unavailable-feat-option", path: `gameData.feats.${featKey}.options.${optionKey}`, nodeId: optionNodeId, message: `Option "${sourceLabel(option, optionKey)}" has incomplete or deferred mechanics.` });
        continue;
      }
      graph.addEdge({ kind: "owns", from: nodeId, to: optionNodeId }, { path: `character.builder.selectedFeatOptions` });
      const optionRequirements = context.compileRequirements(
        optionNodeId,
        option.prerequisites,
        `gameData.feats.${featKey}.options.${optionKey}.prerequisites`,
      );
      if (optionRequirements.every((result) => result.ok || result.manual)) {
        context.activeSources.push({
          nodeId: optionNodeId,
          entry: option,
          label: sourceLabel(option, optionKey),
          path: `gameData.feats.${featKey}.options.${optionKey}`,
        });
      }
    }
  }

  for (const selectedOptionKey of context.selectedFeatOptionKeys) {
    if (context.offeredFeatOptionKeys.has(selectedOptionKey)) continue;
    const owner = optionOwners.get(selectedOptionKey);
    const ownerId = owner ? `feat-selection:${owner.featKey}` : "root:character";
    context.addTypedNode("feat-option", {
      id: `feat-option:${selectedOptionKey}`,
      key: selectedOptionKey,
      label: sourceLabel(owner?.option, selectedOptionKey),
      state: "invalid",
      sourceOwnerId: ownerId,
      storageBinding: { path: "builder.selectedFeatOptions", kind: "ordered-key-array" },
      metadata: {
        featKey: owner?.featKey || "",
        optionKey: selectedOptionKey,
        selected: true,
        orphaned: true,
      },
    }, "character.builder.selectedFeatOptions");
  }
  return allocation;
}

function compileGrantAnswers(context, character, techniquesByKey, weaponBasesByKey, graph) {
  const answers = character.builder.grantChoices;
  const claimed = new Set();

  for (const [choiceId, choiceSpec] of Array.from(context.activeChoices.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    const answer = answers[choiceId];
    if (!answer) continue;
    claimed.add(choiceId);
    const answerNodeId = `grant-answer:${choiceId}`;
    if (choiceSpec.answerType === "weapon") {
      const weaponKey = stableKey(answer.weaponKey);
      const weapon = weaponKey ? weaponBasesByKey.get(weaponKey) : null;
      const ownerMatches = answer.sourceId === choiceSpec.sourceOwnerId;
      const requiredRank = Number.parseInt(String(choiceSpec.grant?.rank ?? 1), 10) || 1;
      let valid = true;
      let reason = "";
      if (answer.type !== "weapon") {
        valid = false;
        reason = `Weapon choice "${choiceId}" contains unsupported answer type "${answer.type}".`;
      } else if (!ownerMatches) {
        valid = false;
        reason = `Answer owner "${answer.sourceId}" does not match active source "${choiceSpec.sourceOwnerId}".`;
      } else if (!weaponKey) {
        valid = false;
        reason = "The source-owned weapon answer is incomplete.";
      } else if (!weapon) {
        context.addDiagnostic({
          code: "dangling-grant-answer-reference",
          path: `character.builder.grantChoices.${choiceId}.weaponKey`,
          nodeId: answerNodeId,
          message: `Source-owned answer references missing weapon "${weaponKey}".`,
        });
        valid = false;
        reason = `Weapon "${weaponKey}" does not exist.`;
      } else if (!isGameDataRecordSelectable(weapon, { allowGrantedOnly: true })) {
        valid = false;
        reason = `Weapon "${weaponKey}" is unavailable to grants.`;
      } else if (Number(answer.rank) !== requiredRank) {
        valid = false;
        reason = `Weapon choice "${choiceId}" requires rank ${requiredRank}.`;
      }
      context.addTypedNode("grant-answer", {
        id: answerNodeId,
        key: choiceId,
        label: sourceLabel(weapon, weaponKey || choiceId),
        state: valid ? "selected" : weaponKey ? "invalid" : "incomplete",
        sourceOwnerId: choiceSpec.sourceOwnerId,
        storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choiceId },
        metadata: {
          choiceId,
          answerType: "weapon",
          weaponKey,
          valid,
          reason,
          orphaned: false,
        },
      }, `character.builder.grantChoices.${choiceId}`);
      graph.addEdge({ kind: "owns", from: choiceSpec.sourceOwnerId, to: answerNodeId }, { path: `character.builder.grantChoices.${choiceId}` });
      graph.addEdge({ kind: "satisfies", from: answerNodeId, to: choiceSpec.choiceNodeId }, { path: `character.builder.grantChoices.${choiceId}` });
      continue;
    }
    const techniqueKey = stableKey(answer.techniqueKey);
    const technique = techniqueKey ? techniquesByKey.get(techniqueKey) : null;
    const ownerMatches = answer.sourceId === choiceSpec.sourceOwnerId;
    let valid = true;
    let reason = "";
    if (answer.type !== "technique") {
      valid = false;
      reason = `Technique choice "${choiceId}" contains unsupported answer type "${answer.type}".`;
    } else if (!ownerMatches) {
      valid = false;
      reason = `Answer owner "${answer.sourceId}" does not match active source "${choiceSpec.sourceOwnerId}".`;
    } else if (!techniqueKey) {
      valid = false;
      reason = "The source-owned technique answer is incomplete.";
    } else if (!technique) {
      context.addDiagnostic({
        code: "dangling-grant-answer-reference",
        path: `character.builder.grantChoices.${choiceId}.techniqueKey`,
        nodeId: answerNodeId,
        message: `Source-owned answer references missing technique "${techniqueKey}".`,
      });
      valid = false;
      reason = `Technique "${techniqueKey}" does not exist.`;
    } else if (!isGameDataRecordSelectable(technique, { allowGrantedOnly: true })) {
      valid = false;
      reason = `Technique "${techniqueKey}" is unavailable to grants.`;
    } else {
      const skillFilters = choiceSpec.choiceNodeId ? values(choiceSpec.grant?.skill).map(canonicalSkillKey) : [];
      const tagFilters = choiceSpec.choiceNodeId ? values(choiceSpec.grant?.tag) : [];
      const keyFilters = choiceSpec.choiceNodeId ? values(choiceSpec.grant?.key) : [];
      const techniqueSkills = values(technique.skillKeys || technique.skill).map(canonicalSkillKey);
      const techniqueTags = values(technique.tagKeys || technique.tags);
      if (keyFilters.length && !keyFilters.includes(techniqueKey)) {
        valid = false;
        reason = `Technique "${techniqueKey}" no longer matches the granting identity filter.`;
      } else if (skillFilters.length && !skillFilters.some((value) => techniqueSkills.includes(value))) {
        valid = false;
        reason = `Technique "${techniqueKey}" no longer matches the granting skill filter.`;
      } else if (tagFilters.length && !tagFilters.some((value) => techniqueTags.includes(value))) {
        valid = false;
        reason = `Technique "${techniqueKey}" no longer matches the granting tag filter.`;
      }
    }

    context.addTypedNode("grant-answer", {
      id: answerNodeId,
      key: choiceId,
      label: sourceLabel(technique, techniqueKey || choiceId),
      state: valid ? "selected" : techniqueKey ? "invalid" : "incomplete",
      sourceOwnerId: choiceSpec.sourceOwnerId,
      storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choiceId },
      metadata: {
        choiceId,
        techniqueKey,
        valid,
        reason,
        orphaned: false,
      },
    }, `character.builder.grantChoices.${choiceId}`);
    graph.addEdge({ kind: "owns", from: choiceSpec.sourceOwnerId, to: answerNodeId }, { path: `character.builder.grantChoices.${choiceId}` });
    graph.addEdge({ kind: "satisfies", from: answerNodeId, to: choiceSpec.choiceNodeId }, { path: `character.builder.grantChoices.${choiceId}` });
    if (technique && valid) {
      context.compileRequirements(answerNodeId, technique.prerequisites, `gameData.techniques.${techniqueKey}.prerequisites`);
    }
  }

  for (const [choiceId, answer] of Object.entries(answers).sort(([left], [right]) => left.localeCompare(right))) {
    if (claimed.has(choiceId)) continue;
    const answerNodeId = `grant-answer:${choiceId}`;
    context.addTypedNode(answer.type === "technique" ? "grant-answer" : "unsupported-answer", {
      id: answerNodeId,
      key: choiceId,
      label: answer.sourceLabel || choiceId,
      state: "invalid",
      sourceOwnerId: answer.sourceId,
      storageBinding: { path: "builder.grantChoices", kind: "keyed-record", key: choiceId },
      metadata: {
        choiceId,
        techniqueKey: answer.techniqueKey,
        valid: false,
        orphaned: true,
        reason: "The source-owned answer no longer has an active granting source.",
      },
    }, `character.builder.grantChoices.${choiceId}`);
  }
}

function unmetRequirementNodeIds(graphResult, sourceNodeId) {
  const requirementIds = new Set(
    graphResult.edges
      .filter((edge) => edge.kind === "requires" && edge.from === sourceNodeId)
      .map((edge) => edge.to),
  );
  return graphResult.nodes
    .filter((node) => requirementIds.has(node.id) && node.metadata.met === false && node.metadata.manual !== true)
    .map((node) => node.id)
    .sort();
}

function compileSelectedTechniques(context, character, techniquesByKey, graph) {
  if (character.builder.selectedTechniques.length === 0) return;
  const known = computeKnownCombatSkillsAndGrants(context.gameData, character.builder);
  const rankBySkill = getCombatSkillRanks(context.gameData, character.builder);
  for (const [index, techniqueKey] of character.builder.selectedTechniques.entries()) {
    const nodeId = `technique-selection:${techniqueKey}`;
    const technique = techniquesByKey.get(techniqueKey);
    if (!technique) {
      context.addTypedNode("technique-selection", {
        id: nodeId,
        key: techniqueKey,
        label: techniqueKey,
        state: "invalid",
        sourceOwnerId: "root:character",
        storageBinding: { path: "builder.selectedTechniques", kind: "ordered-key-array" },
        metadata: { techniqueKey, index, exists: false },
      }, `character.builder.selectedTechniques.${index}`);
      graph.addEdge({ kind: "owns", from: "root:character", to: nodeId }, { path: `character.builder.selectedTechniques.${index}` });
      context.addDiagnostic({
        code: "dangling-technique-reference",
        path: `character.builder.selectedTechniques.${index}`,
        nodeId,
        message: `Selected technique "${techniqueKey}" does not exist in normalized game data.`,
      });
      continue;
    }
    const access = getTechniqueSelectionState(technique, {
      ...createPrerequisiteContext({ gameData: context.gameData, builder: character.builder }),
      knownCombatSkills: known.knownCombatSkills,
      skillRanks: rankBySkill,
    });
    const selectable = access.selectable && (technique.expressionSyntaxVersion !== 3 || access.knownSkill);
    const automatic = context.automaticTechniqueKeys.has(techniqueKey);
    const { skillName, knownSkill, requiredRank, skillRank } = access;
    context.addTypedNode("technique-selection", {
      id: nodeId,
      key: techniqueKey,
      label: sourceLabel(technique, techniqueKey),
      state: selectable && !automatic ? "selected" : "invalid",
      sourceOwnerId: "root:character",
      storageBinding: { path: "builder.selectedTechniques", kind: "ordered-key-array" },
      metadata: {
        techniqueKey,
        index,
        exists: true,
        selectable,
        duplicateAutomatic: automatic,
        skillName,
        knownSkill,
        requiredRank,
        skillRank,
      },
    }, `character.builder.selectedTechniques.${index}`);
    graph.addEdge({ kind: "owns", from: "root:character", to: nodeId }, { path: `character.builder.selectedTechniques.${index}` });
    context.compileRequirements(nodeId, technique.prerequisites, `gameData.techniques.${techniqueKey}.prerequisites`);
  }
}

export function compileCharacterGraph({ character, gameData, registry = createDefaultGraphHandlerRegistry() } = {}) {
  const decoded = decodeCharacter(character);
  if (!decoded.ok) return invalidCharacterGraph(decoded);

  const graph = new CharacterGraphBuilder();
  if (!(registry instanceof GraphHandlerRegistry)) {
    graph.addDiagnostic({
      code: "invalid-handler-registry",
      path: "registry",
      message: "Graph compilation requires a GraphHandlerRegistry.",
    });
  }
  if (!isPlainObject(gameData)) {
    graph.addDiagnostic({
      code: "invalid-game-data",
      path: "gameData",
      message: "Graph compilation requires normalized runtime game data.",
    });
  } else if (![2, 3].includes(gameData.schemaVersion)) {
    graph.addDiagnostic({
      code: "unsupported-game-data-schema",
      path: "gameData.schemaVersion",
      message: "Graph compilation requires normalized runtime artifact schema 2 or 3.",
    });
  }

  const activeRegistry = registry instanceof GraphHandlerRegistry ? registry : new GraphHandlerRegistry();
  const classesByKey = indexRecords(gameData?.classes, "classKey", "Class", graph, "gameData.classes");
  const originsByKey = indexRecords(gameData?.origins, "originKey", "Origin", graph, "gameData.origins");
  const featsByKey = indexRecords(gameData?.feats, "featKey", "Feat", graph, "gameData.feats");
  const techniquesByKey = indexRecords(gameData?.techniques, "techniqueKey", "Technique", graph, "gameData.techniques");
  const weaponBasesByKey = indexRecords(gameData?.weaponBases, "weaponKey", "Weapon", graph, "gameData.weaponBases");
  const weaponEnhancementsByKey = indexRecords(
    gameData?.weaponEnhancements,
    "enhancementKey",
    "Weapon enhancement",
    graph,
    "gameData.weaponEnhancements",
  );
  const context = createCompilerContext({
    character: decoded.value,
    gameData: isPlainObject(gameData) ? gameData : {},
    registry: activeRegistry,
    graph,
    classesByKey,
    techniquesByKey,
    weaponBasesByKey,
  });

  compileRootFacts(context, decoded.value);
  compileClassAndOrigin(context, decoded.value, classesByKey, originsByKey, graph);
  compileOriginFeatures(context, decoded.value, originsByKey, graph);
  compileClassUtilitySkills(context, decoded.value, gameData, graph);
  const skillAllocation = compileSkills(context, decoded.value, gameData, graph);
  compileClassFeatures(context, decoded.value, gameData, graph);
  const compiledGrantSourceIds = new Set();
  for (const source of context.activeSources.slice().sort((left, right) => left.nodeId.localeCompare(right.nodeId))) {
    context.compileGrants(source);
    compiledGrantSourceIds.add(source.nodeId);
  }
  const featAllocation = compileFeats(context, decoded.value, featsByKey, graph);
  for (const source of context.activeSources.slice().sort((left, right) => left.nodeId.localeCompare(right.nodeId))) {
    if (compiledGrantSourceIds.has(source.nodeId)) continue;
    context.compileGrants(source);
    compiledGrantSourceIds.add(source.nodeId);
  }
  const bondAllocation = compileBondsAndKeystones(context, decoded.value, graph);
  compileGrantAnswers(context, decoded.value, techniquesByKey, weaponBasesByKey, graph);
  compileEquipment(context, decoded.value, weaponBasesByKey, weaponEnhancementsByKey, graph);
  compileSelectedTechniques(context, decoded.value, techniquesByKey, graph);

  const { primaryAttrKey, slots } = computeTechniqueSlots(
    decoded.value.builder.primaryAttribute,
    decoded.value.builder.attributes,
  );
  const attributeAllocation = getAttributeAllocationState({
    level: decoded.value.builder.level,
    primaryAttribute: decoded.value.builder.primaryAttribute,
    attributes: decoded.value.builder.attributes,
  });
  const finalized = graph.finalize({
    metadata: {
      compilerVersion: 1,
      registry: activeRegistry.describe(),
      primaryAttribute: primaryAttrKey,
      attributePointCapacity: attributeAllocation.capacity,
      attributePointUsage: attributeAllocation.usage,
      skillPointCapacity: skillAllocation.total,
      skillPointUsage: skillAllocation.spent,
      skillRankCap: skillAllocation.baseRankCap,
      classUtilitySkillExpectedCount: skillAllocation.utility.expectedCount,
      techniqueCapacity: slots,
      featCapacity: context.activeFeatSlots.length,
      featSlotIds: context.activeFeatSlots.map((slot) => slot.slotId),
      unmatchedFeatKeys: featAllocation.unmatchedFeatKeys,
      unfilledFeatSlotIds: featAllocation.unfilledSlots.map((slot) => slot.slotId),
      weaponSlotCapacity: MAX_WEAPON_SLOTS,
      weaponSlotUsage: computeTotalWeaponSlots(decoded.value.builder.weapons, Array.from(weaponBasesByKey.values())),
      automaticTechniqueKeys: Array.from(context.automaticTechniqueKeys).sort(),
      activeChoiceIds: Array.from(context.activeChoices.keys()).sort(),
      bondRankCap: bondAllocation.rankCap,
      userBondCapacity: bondAllocation.userBondCapacity,
      userBondUsage: bondAllocation.userBondCount,
      sourceBondCount: bondAllocation.sourceBondCount,
      backgroundKeystoneCapacity: bondAllocation.backgroundKeystoneCapacity,
    },
  });

  return graphWithCharacter(finalized, decoded.value);
}

export class GraphCompiler {
  constructor({ gameData, registry = createDefaultGraphHandlerRegistry() } = {}) {
    this.gameData = gameData;
    this.registry = registry;
  }

  compile(character, { gameData = this.gameData } = {}) {
    return compileCharacterGraph({ character, gameData, registry: this.registry });
  }
}

export function getUnmetRequirementNodeIds(graph, sourceNodeId) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return Object.freeze([]);
  return Object.freeze(unmetRequirementNodeIds(graph, sourceNodeId));
}
