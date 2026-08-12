import { decodeCharacter } from "./character-codec.js?v=wpe1";
import { fitAttributesToPointBudget } from "./character-rules.js?v=wpe3";
import { buildCharacterSkillProjection } from "./character-skill-projection.js?v=wpe13";
import { fitSkillsToRules } from "./skill-rules.js?v=wpe13";
import { fitBondsToRules } from "./bond-rules.js?v=wpe5";
import { getExpectedSelectionIssue } from "./choice-capacity.js";
import { buildGeneratedWeaponsFromGrantChoices, isSourceOwnedWeapon } from "./grants.js";
import {
  cloneGraphValue,
  collectAffectedNodeIds,
  frozenGraphClone,
} from "./graph-core.js";
import {
  GraphCompiler,
  createDefaultGraphHandlerRegistry,
  getUnmetRequirementNodeIds,
} from "./graph-compiler.js?v=wpe13";

const IMPACT_CATEGORY_ORDER = Object.freeze({
  error: 0,
  "confirmation-required": 1,
  informational: 2,
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function impact(value) {
  return {
    category: value.category,
    type: value.type,
    code: value.code,
    path: value.path,
    nodeId: value.nodeId || "",
    label: value.label || "",
    message: value.message || "",
    before: cloneGraphValue(value.before),
    after: cloneGraphValue(value.after),
  };
}

function impactKey(value) {
  return [value.category, value.type, value.code, value.path, value.nodeId].join("\u0000");
}

function compareImpacts(left, right) {
  return IMPACT_CATEGORY_ORDER[left.category] - IMPACT_CATEGORY_ORDER[right.category]
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.nodeId.localeCompare(right.nodeId);
}

function addImpact(target, value) {
  const normalized = impact(value);
  target.set(impactKey(normalized), normalized);
}

function diagnosticsToImpacts(graph, target) {
  for (const diagnostic of graph.diagnostics || []) {
    addImpact(target, {
      category: diagnostic.severity === "error" ? "error" : "informational",
      type: diagnostic.severity === "error" ? "invalid" : "incomplete",
      code: diagnostic.code,
      path: diagnostic.path,
      nodeId: diagnostic.nodeId,
      message: diagnostic.message,
    });
  }
}

function nodeIndex(graph) {
  return new Map((graph.nodes || []).map((node) => [node.id, node]));
}

function removalReasonForTechnique(node, graph) {
  if (node.metadata.selectable === false) {
    return {
      code: "unavailable-technique-removed",
      message: `Technique "${node.key}" is no longer available for normal selection.`,
    };
  }
  if (node.metadata.duplicateAutomatic === true) {
    return {
      code: "automatic-technique-removed-from-normal-slots",
      message: `Technique "${node.key}" is now granted automatically and no longer consumes a normal slot.`,
    };
  }
  if (node.metadata.knownSkill === false) {
    return {
      code: "technique-skill-removed",
      message: `Technique "${node.key}" uses a combat skill this character no longer knows.`,
    };
  }
  if (Number(node.metadata.skillRank) < Number(node.metadata.requiredRank)) {
    return {
      code: "technique-rank-removed",
      message: `Technique "${node.key}" requires ${node.metadata.skillName} rank ${node.metadata.requiredRank}.`,
    };
  }
  const unmet = getUnmetRequirementNodeIds(graph, node.id);
  if (unmet.length) {
    const nodes = nodeIndex(graph);
    const reasons = unmet.map((id) => text(nodes.get(id)?.metadata?.reason)).filter(Boolean);
    return {
      code: "technique-prerequisite-removed",
      message: reasons.join(" ") || `Technique "${node.key}" no longer meets its prerequisites.`,
    };
  }
  return null;
}

function removalReasonForClassOption(node, graph) {
  if (node.metadata.orphaned === true) {
    return {
      code: "orphaned-class-option-removed",
      message: `Class option "${node.key}" is no longer offered by the active class feature graph.`,
    };
  }
  const unmet = getUnmetRequirementNodeIds(graph, node.id);
  if (!unmet.length) return null;
  const nodes = nodeIndex(graph);
  const reasons = unmet.map((id) => text(nodes.get(id)?.metadata?.reason)).filter(Boolean);
  return {
    code: "class-option-prerequisite-removed",
    message: reasons.join(" ") || `Class option "${node.key}" no longer meets its prerequisites.`,
  };
}

function removalReasonForFeat(node, graph) {
  if (node.metadata.slotMatched === false) {
    return {
      code: "feat-slot-removed",
      message: `Feat "${node.label || node.key}" is not owned by any active explicit feat-granting feature.`,
    };
  }
  const unmet = getUnmetRequirementNodeIds(graph, node.id);
  if (!unmet.length) return null;
  const nodes = nodeIndex(graph);
  const reasons = unmet.map((id) => text(nodes.get(id)?.metadata?.reason)).filter(Boolean);
  return {
    code: "feat-prerequisite-removed",
    message: reasons.join(" ") || `Feat "${node.key}" no longer meets its prerequisites.`,
  };
}

function removalReasonForFeatOption(node, graph) {
  if (node.metadata.orphaned === true) {
    return {
      code: "orphaned-feat-option-removed",
      message: `Feat option "${node.key}" is no longer offered by a selected feat.`,
    };
  }
  const unmet = getUnmetRequirementNodeIds(graph, node.id);
  if (!unmet.length) return null;
  const nodes = nodeIndex(graph);
  const reasons = unmet.map((id) => text(nodes.get(id)?.metadata?.reason)).filter(Boolean);
  return {
    code: "feat-option-prerequisite-removed",
    message: reasons.join(" ") || `Feat option "${node.key}" no longer meets its prerequisites.`,
  };
}

function removalReasonForGrantAnswer(node, graph) {
  if (node.metadata.orphaned === true) {
    return {
      code: "orphaned-grant-answer-removed",
      message: node.metadata.reason || "The source-owned answer no longer has an active granting source.",
    };
  }
  if (node.metadata.valid === false) {
    return {
      code: "invalid-grant-answer-removed",
      message: node.metadata.reason || "The source-owned answer is no longer valid for its grant.",
    };
  }
  const unmet = getUnmetRequirementNodeIds(graph, node.id);
  if (!unmet.length) return null;
  const nodes = nodeIndex(graph);
  const reasons = unmet.map((id) => text(nodes.get(id)?.metadata?.reason)).filter(Boolean);
  return {
    code: "grant-answer-prerequisite-removed",
    message: reasons.join(" ") || "The source-owned answer no longer meets its prerequisites.",
  };
}

function removeTechnique(next, techniqueKey) {
  const previous = next.builder.selectedTechniques;
  next.builder.selectedTechniques = previous.filter((key) => key !== techniqueKey);
  return previous.length !== next.builder.selectedTechniques.length;
}

function removeClassOption(next, optionKey) {
  const previous = next.builder.selectedClassFeatureOptions;
  next.builder.selectedClassFeatureOptions = previous.filter((key) => key !== optionKey);
  return previous.length !== next.builder.selectedClassFeatureOptions.length;
}

function removeFeat(next, featKey) {
  const previous = next.builder.selectedFeats;
  next.builder.selectedFeats = previous.filter((key) => key !== featKey);
  return previous.length !== next.builder.selectedFeats.length;
}

function removeFeatOption(next, optionKey) {
  const previous = next.builder.selectedFeatOptions;
  next.builder.selectedFeatOptions = previous.filter((key) => key !== optionKey);
  return previous.length !== next.builder.selectedFeatOptions.length;
}

function removeClassUtilitySkill(next, skillKey) {
  const previous = next.builder.selectedClassUtilitySkills;
  next.builder.selectedClassUtilitySkills = previous.filter((key) => key !== skillKey);
  return previous.length !== next.builder.selectedClassUtilitySkills.length;
}

function removeGrantAnswer(next, choiceId) {
  if (!Object.prototype.hasOwnProperty.call(next.builder.grantChoices, choiceId)) return false;
  delete next.builder.grantChoices[choiceId];
  return true;
}

function removeBond(next, bondId) {
  const index = next.builder.bonds.findIndex((bond) => bond.bondId === bondId);
  if (index < 0) return null;
  return next.builder.bonds.splice(index, 1)[0];
}

function sourceBondSpecs(graph) {
  return (graph?.nodes || [])
    .filter((node) => node.type === "grant-bond")
    .map((node) => ({ ...node.metadata }))
    .sort((left, right) => left.bondId.localeCompare(right.bondId));
}

function synchronizeSourceBonds(next, graph) {
  let changed = false;
  const existingIds = new Set(next.builder.bonds.map((bond) => bond.bondId));
  for (const spec of sourceBondSpecs(graph)) {
    if (existingIds.has(spec.bondId)) continue;
    next.builder.bonds.push({
      bondId: spec.bondId,
      name: spec.targetName,
      rank: String(spec.rank),
      keystone: "",
    });
    existingIds.add(spec.bondId);
    changed = true;
  }
  return changed;
}

function reconcileBondRules(next, graph, impacts) {
  const result = fitBondsToRules(next.builder, { sourceBondSpecs: sourceBondSpecs(graph) });
  if (JSON.stringify(next.builder.bonds) === JSON.stringify(result.bonds)) return false;
  for (const change of result.changes) {
    addImpact(impacts, {
      category: change.code === "source-bond-rank-applied" ? "informational" : "confirmation-required",
      type: change.after === undefined ? "remove" : "adjust",
      code: change.code,
      path: "builder.bonds",
      nodeId: `bond:${change.bondId}`,
      label: change.name || change.bondId,
      message: change.code === "bond-capacity-applied"
        ? `Bond "${change.name || change.bondId}" exceeds the Heart-based starting-bond capacity and will be removed.`
        : change.code === "source-bond-rank-applied"
          ? `Bond "${change.name || change.bondId}" was restored to its source-defined rank ${change.after}.`
          : `Bond "${change.name || change.bondId}" will be reduced to the level-based rank cap of ${change.after}.`,
      before: change.before,
      after: change.after,
    });
  }
  next.builder.bonds = result.bonds.map((bond) => ({ ...bond }));
  return true;
}

function sourceAnswerByChoice(builder, choiceId) {
  const answer = builder?.grantChoices?.[choiceId];
  return answer?.type === "weapon" ? answer : null;
}

function synchronizeGeneratedWeapons(next, previousBuilder, impacts) {
  const previous = next.builder.weapons;
  const generated = buildGeneratedWeaponsFromGrantChoices(next.builder.grantChoices, previous, { canonical: true });
  if (JSON.stringify(previous) === JSON.stringify(generated)) return false;
  const previousBySource = new Map(
    previous.filter(isSourceOwnedWeapon).map((weapon) => [weapon.sourceChoiceId || weapon.choiceId, weapon]),
  );
  const nextBySource = new Map(
    generated.filter(isSourceOwnedWeapon).map((weapon) => [weapon.sourceChoiceId || weapon.choiceId, weapon]),
  );
  const acceptedBySource = new Map(
    (previousBuilder?.weapons || []).filter(isSourceOwnedWeapon)
      .map((weapon) => [weapon.sourceChoiceId || weapon.choiceId, weapon]),
  );
  for (const [choiceId, weapon] of previousBySource) {
    const acceptedWeapon = acceptedBySource.get(choiceId);
    const acceptedAnswer = sourceAnswerByChoice(previousBuilder, choiceId);
    const proposedAnswer = sourceAnswerByChoice(next.builder, choiceId);
    if (!acceptedWeapon || JSON.stringify(acceptedWeapon) === JSON.stringify(weapon)
      || JSON.stringify(acceptedAnswer) !== JSON.stringify(proposedAnswer)) continue;
    addImpact(impacts, {
      category: "error",
      type: "invalid",
      code: "source-owned-weapon-edit-rejected",
      path: "builder.weapons",
      nodeId: `weapon:${weapon.id}`,
      label: weapon.customName || weapon.weaponKey,
      message: `Generated weapon "${weapon.customName || weapon.weaponKey}" must be changed through its granting choice.`,
      before: acceptedWeapon,
      after: weapon,
    });
  }
  for (const [choiceId, weapon] of previousBySource) {
    if (nextBySource.has(choiceId)) continue;
    addImpact(impacts, {
      category: "confirmation-required",
      type: "remove",
      code: "source-owned-weapon-removed",
      path: "builder.weapons",
      nodeId: `weapon:${weapon.id}`,
      label: weapon.customName || weapon.weaponKey,
      message: `The generated weapon for source-owned choice "${choiceId}" was removed with its source.`,
      before: weapon,
      after: undefined,
    });
  }
  next.builder.weapons = generated;
  return true;
}

function grantResources(graph) {
  const resources = new Map();
  for (const node of graph?.nodes || []) {
    if (node.type !== "grant-resource") continue;
    const previous = resources.get(node.key);
    const capacity = Number(node.metadata.capacity) || 0;
    resources.set(node.key, {
      resourceKey: node.key,
      name: node.metadata.name || node.label || node.key,
      capacity: Math.max(previous?.capacity || 0, capacity),
    });
  }
  return resources;
}

function synchronizeGrantResources(next, graph, previousGraph, impacts) {
  const active = grantResources(graph);
  const previous = grantResources(previousGraph);
  let changed = false;
  for (const [resourceKey, spec] of active) {
    const stored = next.builder.resources[resourceKey];
    const value = {
      resourceKey,
      name: spec.name,
      capacity: spec.capacity,
      current: stored ? Math.min(stored.current, spec.capacity) : spec.capacity,
    };
    if (JSON.stringify(stored) === JSON.stringify(value)) continue;
    next.builder.resources[resourceKey] = value;
    changed = true;
  }
  for (const [resourceKey] of previous) {
    if (active.has(resourceKey) || !next.builder.resources[resourceKey]) continue;
    const stored = next.builder.resources[resourceKey];
    delete next.builder.resources[resourceKey];
    changed = true;
    addImpact(impacts, {
      category: "confirmation-required",
      type: "remove",
      code: "source-owned-resource-removed",
      path: `builder.resources.${resourceKey}`,
      nodeId: `resource:${resourceKey}`,
      label: stored.name || resourceKey,
      message: `Resource "${stored.name || resourceKey}" was removed with its granting source.`,
      before: stored,
      after: undefined,
    });
  }
  return changed;
}

function synchronizeDerivedAbilities(next, graph, impacts) {
  const sourceTypes = new Set(["class-feature", "class-option", "feat-selection", "feat-option", "origin-feature"]);
  const sources = graph.nodes
    .filter((node) => sourceTypes.has(node.type))
    .filter((node) => ["class-feature", "origin-feature"].includes(node.type) || node.metadata.selected === true)
    .filter((node) => node.state !== "invalid")
    .filter((node) => node.metadata.abilityName)
    .sort((left, right) => left.id.localeCompare(right.id));
  const autoNames = [...new Set(sources.map((node) => node.metadata.abilityName))];
  const previousNames = new Set(next.builder.autoAbilityNames);
  const abilities = next.builder.sheet.repeatables.abilities.filter((ability) => (
    !sourceTypes.has(String(ability.sourceId || "").split(":")[0])
      && !previousNames.has(ability.name)
  ));
  const nextSourceIds = new Set(sources.map((node) => node.id));
  for (const ability of next.builder.sheet.repeatables.abilities) {
    const sourceType = String(ability.sourceId || "").split(":")[0];
    if (!sourceTypes.has(sourceType) || nextSourceIds.has(ability.sourceId)) continue;
    addImpact(impacts, {
      category: "confirmation-required", type: "remove", code: "source-owned-ability-removed",
      path: "builder.sheet.repeatables.abilities", nodeId: ability.sourceId, label: ability.name,
      message: `Ability "${ability.name}" will be removed with its granting source.`, before: ability, after: undefined,
    });
  }
  abilities.push(...sources.map((node) => ({
    abilityId: `ability:${node.id}`,
    sourceId: node.id,
    name: node.metadata.abilityName,
    text: node.metadata.description || "",
  })));
  if (JSON.stringify(next.builder.autoAbilityNames) === JSON.stringify(autoNames)
    && JSON.stringify(next.builder.sheet.repeatables.abilities) === JSON.stringify(abilities)) return false;
  next.builder.autoAbilityNames = autoNames;
  next.builder.sheet.repeatables.abilities = abilities;
  return true;
}

function synchronizeSkillProjection(next, gameData, previousBuilder) {
  const projection = buildCharacterSkillProjection(gameData, next.builder, { previousBuilder });
  const before = JSON.stringify({
    fields: next.builder.sheet.fields,
    repeatables: next.builder.sheet.repeatables,
    selectedClassUtilitySkills: next.builder.selectedClassUtilitySkills,
    grantedCoreSkillSnapshot: next.builder.grantedCoreSkillSnapshot,
    grantedSkillSnapshot: next.builder.grantedSkillSnapshot,
  });
  const after = JSON.stringify(projection);
  if (before === after) return false;
  next.builder.sheet.fields = projection.fields;
  next.builder.sheet.repeatables = projection.repeatables;
  next.builder.selectedClassUtilitySkills = projection.selectedClassUtilitySkills;
  next.builder.grantedCoreSkillSnapshot = projection.grantedCoreSkillSnapshot;
  next.builder.grantedSkillSnapshot = projection.grantedSkillSnapshot;
  return true;
}

function reconcilePrimaryAttribute(next, node, impacts) {
  if (node.type !== "class" || node.metadata.primaryAttributeValid !== false) return false;
  const previous = next.builder.primaryAttribute;
  if (!previous) return false;
  next.builder.primaryAttribute = "";
  addImpact(impacts, {
    category: "confirmation-required",
    type: "remove",
    code: "incompatible-primary-attribute-removed",
    path: "builder.primaryAttribute",
    nodeId: node.id,
    label: previous,
    message: `Primary attribute "${previous}" is not available for class "${node.key}".`,
    before: previous,
    after: "",
  });
  return true;
}

function reconcileAttributeValue(next, node, impacts) {
  if (node.type !== "fact" || !node.id.startsWith("fact:attribute:") || node.metadata.valid !== false) return false;
  const key = node.key;
  const previous = next.builder.attributes[key];
  const minimum = Number(node.metadata.minimum);
  const maximum = Number(node.metadata.maximum);
  const value = Math.max(minimum, Math.min(maximum, previous));
  if (value === previous) return false;
  next.builder.attributes[key] = value;
  const decreased = value < previous;
  addImpact(impacts, {
    category: decreased ? "confirmation-required" : "informational",
    type: "change",
    code: decreased ? "attribute-cap-applied" : "primary-attribute-minimum-applied",
    path: `builder.attributes.${key}`,
    nodeId: node.id,
    label: key,
    message: decreased
      ? `Attribute "${key}" was reduced to its level-${next.builder.level} cap of ${maximum}.`
      : `Primary attribute "${key}" was raised to its minimum of ${minimum}.`,
    before: previous,
    after: value,
  });
  return true;
}

function reconcileAttributePointBudget(next, impacts) {
  const result = fitAttributesToPointBudget({
    level: next.builder.level,
    primaryAttribute: next.builder.primaryAttribute,
    attributes: next.builder.attributes,
  });
  if (result.reductions.length === 0) return false;
  next.builder.attributes = { ...result.attributes };
  for (const reduction of result.reductions) {
    addImpact(impacts, {
      category: "confirmation-required",
      type: "change",
      code: "attribute-point-budget-applied",
      path: `builder.attributes.${reduction.key}`,
      nodeId: `fact:attribute:${reduction.key}`,
      label: reduction.key,
      message: `Attribute "${reduction.key}" was reduced from ${reduction.before} to ${reduction.after} to fit the level-${next.builder.level} point budget of ${result.capacity}.`,
      before: reduction.before,
      after: reduction.after,
    });
  }
  return true;
}

function reconcileSkillRules(next, gameData, impacts) {
  const result = fitSkillsToRules(gameData, next.builder);
  if (!result.changes.length) return false;
  next.builder.sheet.fields = { ...result.fields };
  next.builder.sheet.repeatables.combatSkillsExtra = result.combatSkillsExtra.map((row) => ({ ...row }));
  next.builder.sheet.repeatables.settingSkills = result.settingSkills.map((row) => ({ ...row }));
  for (const change of result.changes) {
    addImpact(impacts, {
      category: "confirmation-required",
      type: "change",
      code: change.code,
      path: change.path,
      nodeId: `skill:${change.domain}:${encodeURIComponent(String(change.key).toLowerCase())}`,
      label: change.name,
      message: change.code === "skill-rank-cap-applied"
        ? `Skill "${change.name}" was reduced from rank ${change.before || 0} to ${change.after} to fit its current rank cap.`
        : `Skill "${change.name}" was reduced from rank ${change.before || 0} to ${change.after} to fit the ${result.allocation.total}-point skill budget.`,
      before: change.before,
      after: change.after,
    });
  }
  return true;
}

function reconcileOrigin(next, node, impacts) {
  if (node.type !== "origin" || node.metadata.selectable !== false || !next.builder.originKey) return false;
  const previous = next.builder.originKey;
  next.builder.originKey = "";
  addImpact(impacts, {
    category: "confirmation-required", type: "remove", code: node.metadata.exists ? "unavailable-origin-removed" : "unknown-origin-removed",
    path: "builder.originKey", nodeId: node.id, label: node.label,
    message: `Origin "${node.label}" will be removed because it is not available for selection.`, before: previous, after: "",
  });
  return true;
}

function reconcileWeaponRank(next, node, impacts) {
  if (node.type !== "weapon" || node.metadata.issue !== "above-skill-rank" || node.metadata.sourceOwned) return false;
  const weapon = next.builder.weapons.find((entry) => entry.id === node.metadata.weaponId);
  if (!weapon) return false;
  const previous = weapon.rank;
  const rank = Number(node.metadata.skillRankCap);
  if (!Number.isSafeInteger(rank) || rank < 0 || rank === previous) return false;
  weapon.rank = rank;
  addImpact(impacts, {
    category: "confirmation-required",
    type: "change",
    code: "weapon-rank-reduced",
    path: "builder.weapons",
    nodeId: node.id,
    label: node.label,
    message: `Weapon "${node.label}" will be reduced to rank ${rank} because its governing skill rank changed.`,
    before: previous,
    after: rank,
  });
  return true;
}

function reconcileWeaponEnhancement(next, node, impacts) {
  if (node.type !== "weapon-enhancement" || node.metadata.valid !== false) return false;
  if (!["above-weapon-rank", "incompatible", "unavailable-definition"].includes(node.metadata.issue)) return false;
  const weapon = next.builder.weapons.find((entry) => entry.id === node.metadata.weaponId);
  if (!weapon || isSourceOwnedWeapon(weapon)) return false;
  const index = weapon.enhancements.findIndex((entry) => entry.id === node.metadata.enhancementId);
  if (index < 0) return false;
  const enhancement = weapon.enhancements[index];
  if (node.metadata.issue === "above-weapon-rank"
    && weapon.rank >= Number(node.metadata.minimumRank || 0)) {
    const previous = enhancement.rank;
    enhancement.rank = weapon.rank;
    addImpact(impacts, {
      category: "confirmation-required",
      type: "change",
      code: "weapon-enhancement-rank-reduced",
      path: "builder.weapons",
      nodeId: node.id,
      label: node.label,
      message: `Enhancement "${node.label}" will be reduced to weapon rank ${weapon.rank}.`,
      before: previous,
      after: weapon.rank,
    });
    return true;
  }
  weapon.enhancements.splice(index, 1);
  addImpact(impacts, {
    category: "confirmation-required",
    type: "remove",
    code: "incompatible-weapon-enhancement-removed",
    path: "builder.weapons",
    nodeId: node.id,
    label: node.label,
    message: `Enhancement "${node.label}" will be removed because it is no longer compatible with this weapon.`,
    before: enhancement,
    after: undefined,
  });
  return true;
}

function reconcileUnavailableWeapon(next, node, impacts) {
  if (node.type !== "weapon" || node.metadata.issue !== "unavailable-definition" || node.metadata.sourceOwned) return false;
  const index = next.builder.weapons.findIndex((entry) => entry.id === node.metadata.weaponId);
  if (index < 0) return false;
  const [weapon] = next.builder.weapons.splice(index, 1);
  addImpact(impacts, {
    category: "confirmation-required",
    type: "remove",
    code: "unavailable-weapon-removed",
    path: "builder.weapons",
    nodeId: node.id,
    label: node.label,
    message: `Weapon "${node.label}" will be removed because it is no longer available for normal selection.`,
    before: weapon,
    after: undefined,
  });
  return true;
}

function applyRemovalPolicies(character, graph, impacts, {
  gameData,
  previousBuilder,
  previousGraph = null,
} = {}) {
  const next = cloneGraphValue(character);
  let changed = false;

  for (const node of graph.nodes) {
    if (reconcileOrigin(next, node, impacts)) {
      changed = true;
      continue;
    }
    if (reconcileUnavailableWeapon(next, node, impacts)) {
      changed = true;
      continue;
    }
    if (reconcileWeaponRank(next, node, impacts)) {
      changed = true;
      continue;
    }
    if (reconcileWeaponEnhancement(next, node, impacts)) {
      changed = true;
      continue;
    }
    if (reconcilePrimaryAttribute(next, node, impacts)) {
      changed = true;
      continue;
    }
    if (reconcileAttributeValue(next, node, impacts)) {
      changed = true;
      continue;
    }
    if (node.type === "technique-selection") {
      const reason = removalReasonForTechnique(node, graph);
      if (!reason || !removeTechnique(next, node.key)) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: reason.code,
        path: "builder.selectedTechniques",
        nodeId: node.id,
        label: node.label,
        message: reason.message,
        before: node.key,
        after: undefined,
      });
      continue;
    }

    if (node.type === "class-utility-skill" && (node.metadata.allowed === false || node.metadata.withinCapacity === false)) {
      if (!removeClassUtilitySkill(next, node.key)) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: node.metadata.allowed === false ? "class-utility-skill-removed" : "class-utility-skill-capacity-removed",
        path: "builder.selectedClassUtilitySkills",
        nodeId: node.id,
        label: node.label,
        message: node.metadata.allowed === false
          ? `Utility skill "${node.key}" is not available for class "${node.metadata.classKey || "none"}".`
          : `Utility skill "${node.key}" exceeds the class choice capacity of ${node.metadata.expectedCount}.`,
        before: node.key,
        after: undefined,
      });
      continue;
    }

    if (node.type === "class-option" && node.metadata.selected === true) {
      const reason = removalReasonForClassOption(node, graph);
      if (!reason || !removeClassOption(next, node.key)) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: reason.code,
        path: "builder.selectedClassFeatureOptions",
        nodeId: node.id,
        label: node.label,
        message: reason.message,
        before: node.key,
        after: undefined,
      });
      continue;
    }

    if (node.type === "feat-selection") {
      const reason = removalReasonForFeat(node, graph);
      if (!reason || !removeFeat(next, node.key)) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: reason.code,
        path: "builder.selectedFeats",
        nodeId: node.id,
        label: node.label,
        message: reason.message,
        before: node.key,
        after: undefined,
      });
      continue;
    }

    if (node.type === "feat-option" && node.metadata.selected === true) {
      const reason = removalReasonForFeatOption(node, graph);
      if (!reason || !removeFeatOption(next, node.key)) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: reason.code,
        path: "builder.selectedFeatOptions",
        nodeId: node.id,
        label: node.label,
        message: reason.message,
        before: node.key,
        after: undefined,
      });
      continue;
    }

    if (node.type === "grant-answer" || node.type === "unsupported-answer") {
      const reason = removalReasonForGrantAnswer(node, graph);
      const choiceId = node.metadata.choiceId || node.key;
      const previous = next.builder.grantChoices[choiceId];
      if (!reason || !removeGrantAnswer(next, choiceId)) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: reason.code,
        path: `builder.grantChoices.${choiceId}`,
        nodeId: node.id,
        label: node.label,
        message: reason.message,
        before: previous,
        after: undefined,
      });
      continue;
    }

    if (node.type === "bond" && node.metadata.orphanedSource === true) {
      const previous = removeBond(next, node.key);
      if (!previous) continue;
      changed = true;
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: "source-owned-bond-removed",
        path: "builder.bonds",
        nodeId: node.id,
        label: node.label,
        message: `Granted bond "${node.label}" will be removed with its granting source.`,
        before: previous,
        after: undefined,
      });
    }
  }

  if (reconcileAttributePointBudget(next, impacts)) changed = true;

  if (synchronizeGeneratedWeapons(next, previousBuilder, impacts)) changed = true;
  if (synchronizeSourceBonds(next, graph)) changed = true;
  if (reconcileBondRules(next, graph, impacts)) changed = true;
  if (synchronizeGrantResources(next, graph, previousGraph, impacts)) changed = true;
  if (synchronizeDerivedAbilities(next, graph, impacts)) changed = true;
  if (synchronizeSkillProjection(next, gameData, previousBuilder)) changed = true;
  if (reconcileSkillRules(next, gameData, impacts)) changed = true;

  const capacity = Number(graph.metadata?.techniqueCapacity ?? 0);
  if (Number.isSafeInteger(capacity) && capacity >= 0 && next.builder.selectedTechniques.length > capacity) {
    const removed = next.builder.selectedTechniques.slice(capacity);
    next.builder.selectedTechniques = next.builder.selectedTechniques.slice(0, capacity);
    changed = true;
    for (const techniqueKey of removed) {
      addImpact(impacts, {
        category: "confirmation-required",
        type: "remove",
        code: "technique-capacity-removed",
        path: "builder.selectedTechniques",
        nodeId: `technique-selection:${techniqueKey}`,
        label: techniqueKey,
        message: `Technique "${techniqueKey}" exceeds the current capacity of ${capacity}.`,
        before: techniqueKey,
        after: undefined,
      });
    }
  }

  return { character: next, changed };
}

function addInformationalImpacts(character, graph, impacts) {
  const attributeCapacity = Number(graph.metadata?.attributePointCapacity ?? 0);
  const attributeUsage = Number(graph.metadata?.attributePointUsage ?? 0);
  if (!text(character.builder.primaryAttribute)) {
    addImpact(impacts, {
      category: "informational",
      type: "incomplete",
      code: "primary-attribute-incomplete",
      path: "builder.primaryAttribute",
      nodeId: "root:character",
      label: "Primary Attribute",
      message: "Choose a Primary Attribute on the Class step before assigning attributes.",
      before: "",
      after: "selected attribute",
    });
  }
  if (!text(character.builder.originKey)) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "origin-selection-incomplete",
      path: "builder.originKey", nodeId: "root:character", label: "Origin",
      message: "Choose an Origin to establish the source of this character's powers.", before: "", after: "selected origin",
    });
  }
  if (!text(character.builder.originKeystone)) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "origin-keystone-incomplete",
      path: "builder.originKeystone", nodeId: "fact:origin-keystone", label: "Origin Keystone",
      message: "Add the character's Origin Keystone.", before: "", after: "keystone text",
    });
  }
  const skillCapacity = Number(graph.metadata?.skillPointCapacity ?? 0);
  const skillUsage = Number(graph.metadata?.skillPointUsage ?? 0);
  if (Number.isSafeInteger(skillCapacity) && Number.isSafeInteger(skillUsage) && skillUsage < skillCapacity) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "skill-points-unspent",
      path: "builder.sheet", nodeId: "root:character", label: "Skills",
      message: `${skillCapacity - skillUsage} skill point${skillCapacity - skillUsage === 1 ? " is" : "s are"} still unspent.`,
      before: skillUsage, after: skillCapacity,
    });
  }
  const utilityExpected = Number(graph.metadata?.classUtilitySkillExpectedCount ?? 0);
  if (utilityExpected > 0 && character.builder.selectedClassUtilitySkills.length < utilityExpected) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "class-utility-skills-incomplete",
      path: "builder.selectedClassUtilitySkills", nodeId: "root:character", label: "Class Utility Skills",
      message: `Choose ${utilityExpected - character.builder.selectedClassUtilitySkills.length} more class utility skill${utilityExpected - character.builder.selectedClassUtilitySkills.length === 1 ? "" : "s"}.`,
      before: character.builder.selectedClassUtilitySkills.length, after: utilityExpected,
    });
  }
  if (Number.isSafeInteger(attributeCapacity) && Number.isSafeInteger(attributeUsage)
    && attributeUsage < attributeCapacity) {
    addImpact(impacts, {
      category: "informational",
      type: "incomplete",
      code: "attribute-points-unspent",
      path: "builder.attributes",
      nodeId: "root:character",
      label: "Attributes",
      message: `${attributeCapacity - attributeUsage} attribute point${attributeCapacity - attributeUsage === 1 ? " is" : "s are"} still unspent.`,
      before: attributeUsage,
      after: attributeCapacity,
    });
  }
  const userBondCapacity = Number(graph.metadata?.userBondCapacity ?? 0);
  const userBondUsage = Number(graph.metadata?.userBondUsage ?? 0);
  if (userBondCapacity > 0 && userBondUsage === 0) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "bonds-empty",
      path: "builder.bonds", nodeId: "root:character", label: "Bonds",
      message: `This character may create up to ${userBondCapacity} Heart-based bond${userBondCapacity === 1 ? "" : "s"}.`,
      before: 0, after: userBondCapacity,
    });
  }
  const backgroundCapacity = Number(graph.metadata?.backgroundKeystoneCapacity ?? 2);
  if (character.builder.backgroundKeystones.length < backgroundCapacity) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "background-keystones-incomplete",
      path: "builder.backgroundKeystones", nodeId: "root:character", label: "Background Keystones",
      message: `Add ${backgroundCapacity - character.builder.backgroundKeystones.length} more Background Keystone${backgroundCapacity - character.builder.backgroundKeystones.length === 1 ? "" : "s"}.`,
      before: character.builder.backgroundKeystones.length, after: backgroundCapacity,
    });
  }
  for (const node of graph.nodes.filter((item) => item.type === "bond" && item.metadata.complete === false)) {
    addImpact(impacts, {
      category: "informational", type: "incomplete", code: "bond-incomplete",
      path: "builder.bonds", nodeId: node.id, label: node.label,
      message: `Bond "${node.label}" still needs both a relationship name and Bond Keystone.`,
      before: false, after: true,
    });
  }
  const capacity = Number(graph.metadata?.techniqueCapacity ?? 0);
  const primaryAttribute = text(graph.metadata?.primaryAttribute);
  if (primaryAttribute && Number.isSafeInteger(capacity) && capacity > 0) {
    const issue = getExpectedSelectionIssue({
      selectedCount: character.builder.selectedTechniques.length,
      expectedCount: capacity,
      maxCount: capacity,
      noun: "technique",
    });
    if (issue) {
      addImpact(impacts, {
        category: "informational",
        type: "incomplete",
        code: "technique-selection-incomplete",
        path: "builder.selectedTechniques",
        nodeId: "choice-group:builder.selectedTechniques",
        label: "Techniques",
        message: issue.reason,
        before: issue.previousValue,
        after: issue.nextValue,
      });
    }
  }

  const filledFeatSlotIds = new Set(
    graph.edges
      .filter((edge) => edge.kind === "owns" && String(edge.from || "").startsWith("feat-slot:"))
      .map((edge) => edge.from),
  );
  for (const slot of graph.nodes.filter((node) => node.type === "feat-slot" && !filledFeatSlotIds.has(node.id))) {
    const typeLabel = text(slot.metadata.filterType) || "feat";
    const levelLabel = Number(slot.metadata.maxLevel) > 0 ? ` of level ${slot.metadata.maxLevel} or lower` : "";
    addImpact(impacts, {
      category: "informational",
      type: "incomplete",
      code: "explicit-feat-slot-incomplete",
      path: "builder.selectedFeats",
      nodeId: slot.id,
      label: slot.label || "Feat",
      message: `Choose a ${typeLabel} feat${levelLabel} granted by ${slot.label || "this feature"}.`,
      before: 0,
      after: 1,
    });
  }

  const satisfiedChoiceIds = new Set(
    graph.nodes
      .filter((node) => node.type === "grant-answer" && node.metadata.valid === true)
      .map((node) => node.metadata.choiceId),
  );
  for (const node of graph.nodes) {
    if (node.type === "choice-group") {
      const selectedCount = Number(node.metadata.selectedCount || 0);
      const expectedCount = Number(node.metadata.expectedCount || 0);
      if (selectedCount === expectedCount) continue;
      addImpact(impacts, {
        category: "informational",
        type: "incomplete",
        code: "class-option-selection-incomplete",
        path: node.storageBinding?.path || "builder.selectedClassFeatureOptions",
        nodeId: node.id,
        label: node.label,
        message: `Expected ${expectedCount} class option${expectedCount === 1 ? "" : "s"}, but ${selectedCount} selected.`,
        before: selectedCount,
        after: expectedCount,
      });
    }
    if (node.type === "feat-choice-group") {
      const selectedCount = Number(node.metadata.selectedCount || 0);
      const expectedCount = Number(node.metadata.expectedCount || 0);
      if (selectedCount === expectedCount) continue;
      addImpact(impacts, {
        category: "informational",
        type: "incomplete",
        code: "feat-option-selection-incomplete",
        path: "builder.selectedFeatOptions",
        nodeId: node.id,
        label: node.label,
        message: `Expected ${expectedCount} feat option${expectedCount === 1 ? "" : "s"}, but ${selectedCount} selected.`,
        before: selectedCount,
        after: expectedCount,
      });
    }
    if (node.type === "grant-choice" && !satisfiedChoiceIds.has(node.metadata.choiceId)) {
      addImpact(impacts, {
        category: "informational",
        type: "incomplete",
        code: "grant-choice-incomplete",
        path: `builder.grantChoices.${node.metadata.choiceId}`,
        nodeId: node.id,
        label: node.label,
        message: "This source-owned choice still needs an answer.",
        before: 0,
        after: 1,
      });
    }
  }
}

function removedSourceNodeIds(previousGraph, nextGraph) {
  if (!previousGraph?.ok || !nextGraph?.ok) return [];
  const nextIds = new Set(nextGraph.nodes.map((node) => node.id));
  return previousGraph.nodes
    .filter((node) => !nextIds.has(node.id))
    .map((node) => node.id)
    .sort();
}

function finalizedImpacts(impacts) {
  return Object.freeze(Array.from(impacts.values()).sort(compareImpacts).map(frozenGraphClone));
}

export function reconcileCharacterGraph({
  character,
  previousCharacter = null,
  gameData,
  registry = createDefaultGraphHandlerRegistry(),
  maxIterations = 32,
} = {}) {
  const decoded = decodeCharacter(character);
  if (!decoded.ok) {
    const compiler = new GraphCompiler({ gameData, registry });
    const graph = compiler.compile(character);
    const impacts = new Map();
    diagnosticsToImpacts(graph, impacts);
    return frozenGraphClone({
      ok: false,
      converged: false,
      iterations: 0,
      character: null,
      graph,
      previousGraph: null,
      affectedNodeIds: [],
      impacts: finalizedImpacts(impacts),
    });
  }
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 1000) {
    throw new RangeError("Graph reconciliation maxIterations must be an integer from 1 through 1000.");
  }

  const compiler = new GraphCompiler({ gameData, registry });
  const original = cloneGraphValue(decoded.value);
  let current = cloneGraphValue(decoded.value);
  const impacts = new Map();
  let finalGraph = null;
  let iterations = 0;
  const previousDecoded = previousCharacter ? decodeCharacter(previousCharacter) : { ok: false };
  const previousGraph = previousDecoded.ok ? compiler.compile(previousDecoded.value) : null;
  const previousBuilder = previousDecoded.ok ? previousDecoded.value.builder : original.builder;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    iterations = iteration;
    const graph = compiler.compile(current);
    finalGraph = graph;
    if (!graph.ok) {
      diagnosticsToImpacts(graph, impacts);
      return frozenGraphClone({
        ok: false,
        converged: false,
        iterations,
        character: original,
        graph,
        previousGraph: null,
        affectedNodeIds: [],
        impacts: finalizedImpacts(impacts),
      });
    }

    const result = applyRemovalPolicies(current, graph, impacts, {
      gameData,
      previousBuilder,
      previousGraph,
    });
    if (!result.changed) {
      current = result.character;
      addInformationalImpacts(current, graph, impacts);
      diagnosticsToImpacts(graph, impacts);
      finalGraph = graph;
      break;
    }
    current = result.character;
    if (iteration === maxIterations) {
      addImpact(impacts, {
        category: "error",
        type: "invalid",
        code: "graph-non-convergence",
        path: "character",
        nodeId: "root:character",
        message: `Graph reconciliation did not reach a fixed point within ${maxIterations} iteration${maxIterations === 1 ? "" : "s"}.`,
      });
      return frozenGraphClone({
        ok: false,
        converged: false,
        iterations,
        character: original,
        graph: finalGraph,
        previousGraph: null,
        affectedNodeIds: [],
        impacts: finalizedImpacts(impacts),
      });
    }
  }

  const removedSources = removedSourceNodeIds(previousGraph, finalGraph);
  const affectedNodeIds = previousGraph ? collectAffectedNodeIds(previousGraph, removedSources) : [];
  return frozenGraphClone({
    ok: true,
    converged: true,
    iterations,
    character: current,
    graph: finalGraph,
    previousGraph,
    affectedNodeIds,
    impacts: finalizedImpacts(impacts),
  });
}

export class GraphReconciler {
  constructor({ gameData, registry = createDefaultGraphHandlerRegistry(), maxIterations = 32 } = {}) {
    this.gameData = gameData;
    this.registry = registry;
    this.maxIterations = maxIterations;
  }

  reconcile(character, { previousCharacter = null, gameData = this.gameData } = {}) {
    return reconcileCharacterGraph({
      character,
      previousCharacter,
      gameData,
      registry: this.registry,
      maxIterations: this.maxIterations,
    });
  }
}

export function createCharacterSessionGraphReconciler(options = {}) {
  const reconciler = new GraphReconciler(options);
  return ({ working, proposed }) => {
    const result = reconciler.reconcile(proposed, { previousCharacter: working });
    return {
      character: result.character,
      impacts: result.impacts,
      graph: result.graph,
      affectedNodeIds: result.affectedNodeIds,
      iterations: result.iterations,
    };
  };
}
