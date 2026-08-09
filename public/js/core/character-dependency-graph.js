import { computeTechniqueSlots } from "./character-rules.js";
import { getExpectedSelectionIssue } from "./choice-capacity.js";
import {
  buildGrantChoiceNodeId,
  grantCreatesChoice,
  normalizeChoiceId,
  resolveGrantChoiceAliases,
  resolveGrantChoiceIds,
  resolveGrantChoiceRef,
} from "./choice-identity.js";
import { reconcileSelectedOptionKeys, selectedSet, removeSelection } from "./choice-reconciliation.js";
import { buildOptionKey, sanitizeStringArray, sanitizeText, sanitizeWeaponList } from "./data-sanitization.js";
import {
  buildTechniqueIndexes,
  computeGrantedSkillsState,
  computeKnownCombatSkillsAndGrants,
  getEntryGrants,
  getGameXClassFeatures,
  getGameXFeatsForClass,
  getGameXTechniques,
  isGameDataRecordSelectable,
  resolveTechniqueRef,
} from "./game-data.js";
import { buildGeneratedWeaponsFromGrantChoices, isSourceOwnedWeapon } from "./grants.js";
import { checkPrerequisites, meetsPrerequisites } from "./prerequisites.js";
import {
  deleteSelectedDescendants,
  getEntryRequiredLevel,
  isOptionGroup,
  selectedCountForGroup,
} from "./option-groups.js";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clonePlainObject(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlainObject(item));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = clonePlainObject(child);
  return out;
}

function makeChange({
  type = "invalid",
  severity = "warning",
  storagePath = "",
  nodeId = "",
  label = "",
  reason = "",
  previousValue = undefined,
  nextValue = undefined,
} = {}) {
  return {
    type,
    severity,
    storagePath,
    nodeId,
    label: sanitizeText(label, { maxLen: 240, collapse: true }),
    reason: sanitizeText(reason, { maxLen: 500, collapse: true }),
    previousValue,
    nextValue,
  };
}

function entryLabel(entry, fallback = "Choice") {
  return sanitizeText(entry?.name || entry?.techniqueName || entry?.featureName || entry?.featKey || entry?.key || fallback, {
    maxLen: 240,
    collapse: true,
  }) || fallback;
}

function entryKey(entry, fallback = "") {
  return sanitizeText(entry?.featureKey || entry?.featKey || entry?.techniqueName || entry?.name || entry?.key || fallback, {
    maxLen: 240,
    collapse: true,
  }) || fallback;
}

function formatChoiceProvider(entry, fallback = "This feature") {
  return entryLabel(entry, fallback);
}

function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function createGraph() {
  const nodes = new Map();
  const edges = new Map();
  const reverseEdges = new Map();

  const addNode = (node) => {
    const id = sanitizeText(node?.id || "", { maxLen: 260, collapse: true });
    if (!id) return null;
    const previous = nodes.get(id) || {};
    const next = { ...previous, ...node, id };
    nodes.set(id, next);
    return next;
  };

  const addEdge = (from, to, kind = "depends") => {
    const source = sanitizeText(from || "", { maxLen: 260, collapse: true });
    const target = sanitizeText(to || "", { maxLen: 260, collapse: true });
    if (!source || !target) return;
    addToMapSet(edges, source, target);
    addToMapSet(reverseEdges, target, source);
    addNode({ id: source });
    addNode({ id: target });
    const edgeList = nodes.get(source)?.edgeKinds || {};
    const nextKinds = { ...edgeList, [target]: kind };
    nodes.set(source, { ...nodes.get(source), edgeKinds: nextKinds });
  };

  return { nodes, edges, reverseEdges, addNode, addEdge };
}

function classFeatureEntries(gameData, builder) {
  const classKey = sanitizeText(builder?.classKey || "", { maxLen: 64, collapse: true });
  const level = Number.parseInt(String(builder?.level ?? 1), 10);
  const currentLevel = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;
  return getGameXClassFeatures(gameData, classKey)
    .filter((entry) => getEntryRequiredLevel(entry) <= currentLevel);
}

function availableFeatEntries(gameData, builder) {
  const classKey = sanitizeText(builder?.classKey || "", { maxLen: 64, collapse: true });
  const level = Number.parseInt(String(builder?.level ?? 1), 10);
  const currentLevel = Number.isFinite(level) ? Math.max(1, Math.min(12, level)) : 1;
  return getGameXFeatsForClass(gameData, classKey)
    .filter((feat) => getEntryRequiredLevel(feat) <= currentLevel);
}

function addEntryGraphNodes(graph, entries, {
  sourceId = "",
  storagePath = "",
  kind = "entry",
  selectedKeys = new Set(),
  activeEntries = [],
} = {}) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isOptionGroup(entry)) {
      const groupId = `choice-group:${storagePath}:${entryKey(entry, entryLabel(entry))}`;
      graph.addNode({
        id: groupId,
        kind: "choiceGroup",
        key: entryKey(entry),
        label: entryLabel(entry, "Option group"),
        sourceId,
        storagePath,
        entry,
        prerequisites: entry?.prerequisites || [],
        grants: entry?.grants || [],
      });
      if (sourceId) graph.addEdge(sourceId, groupId, "offers");

      for (const option of Array.isArray(entry?.options) ? entry.options : []) {
        const optionKey = buildOptionKey(entry, option);
        const optionId = `choice:${storagePath}:${optionKey}`;
        const selected = selectedKeys.has(optionKey);
        graph.addNode({
          id: optionId,
          kind: "choice",
          key: optionKey,
          label: entryLabel(option, optionKey),
          sourceId: groupId,
          storagePath,
          entry: option,
          choiceGroupId: groupId,
          selected,
          active: selected,
          prerequisites: option?.prerequisites || [],
          grants: option?.grants || [],
        });
        graph.addEdge(groupId, optionId, "option");
        if (selected) {
          activeEntries.push({ entry: option, sourceId: optionId });
          if (isOptionGroup(option)) {
            addEntryGraphNodes(graph, [option], {
              sourceId: optionId,
              storagePath,
              kind,
              selectedKeys,
              activeEntries,
            });
          }
        }
      }
      continue;
    }

    const id = `${kind}:${entryKey(entry, entryLabel(entry))}`;
    graph.addNode({
      id,
      kind,
      key: entryKey(entry),
      label: entryLabel(entry, kind),
      sourceId,
      storagePath,
      entry,
      active: true,
      prerequisites: entry?.prerequisites || [],
      grants: entry?.grants || [],
    });
    if (sourceId) graph.addEdge(sourceId, id, "contains");
    activeEntries.push({ entry, sourceId: id });
  }
}

function grantChoiceAnswerLabel(choice) {
  return sanitizeText(
    choice?.techniqueName
      || choice?.value
      || choice?.name
      || choice?.weaponKey
      || choice?.customName
      || "",
    { maxLen: 200, collapse: true },
  );
}

function addGrantChoiceAnswerNode(graph, choiceId, choice) {
  const label = grantChoiceAnswerLabel(choice);
  if (!label) return;
  const answerId = `grant-choice-answer:${choiceId}:${label}`;
  graph.addNode({
    id: answerId,
    kind: "grantChoiceAnswer",
    key: label,
    label,
    storagePath: "builder.grantChoices",
    choiceId,
    choice,
    active: true,
  });
  graph.addEdge(buildGrantChoiceNodeId(choiceId), answerId, "selects");
  if (choice?.type === "technique") {
    const techniqueId = `technique:${label}`;
    graph.addNode({
      id: techniqueId,
      kind: "technique",
      key: label,
      label,
      storagePath: "builder.grantChoices",
      selected: true,
      active: true,
    });
    graph.addEdge(answerId, techniqueId, "selects-technique");
  }
}

function addGrantChoiceNode(graph, {
  grant,
  grantId,
  sourceId,
  choiceId,
  choice,
  aliases = [],
  sourceLabel = "",
  activeGrantChoices,
} = {}) {
  const nodeId = buildGrantChoiceNodeId(choiceId);
  if (!nodeId) return;

  activeGrantChoices.set(choiceId, { grant, grantId, sourceId, choiceId, aliases, sourceLabel });
  graph.addNode({
    id: nodeId,
    kind: "grantChoice",
    key: choiceId,
    label: sourceLabel || choiceId,
    sourceId: grantId || sourceId,
    storagePath: "builder.grantChoices",
    choiceId,
    choice: choice || null,
    grant,
    selected: !!choice,
    active: true,
  });
  if (grantId) graph.addEdge(grantId, nodeId, "creates-choice");
  if (choice) addGrantChoiceAnswerNode(graph, choiceId, choice);
}

function addGrantNodes(graph, activeEntries, { builder = {} } = {}) {
  const activeGrantChoices = new Map();
  const grantChoices = isPlainObject(builder?.grantChoices) ? builder.grantChoices : {};

  for (const record of activeEntries) {
    const entry = record?.entry || record;
    const sourceId = sanitizeText(record?.sourceId || "", { maxLen: 260, collapse: true })
      || (graph.nodes.has(`classFeature:${entryKey(entry)}`)
      ? `classFeature:${entryKey(entry)}`
      : graph.nodes.has(`feat:${entryKey(entry)}`)
        ? `feat:${entryKey(entry)}`
        : "");
    const sourceLabel = entryLabel(entry);
    for (const [index, grant] of getEntryGrants(entry).entries()) {
      const grantName = sanitizeText(grant.name || grant.key || grant.skill || grant.enhancement || grant.choiceId || grant.choiceRef || grant.type, {
        maxLen: 200,
        collapse: true,
      });
      const grantIdentity = sanitizeText(
        grant.key || grant.skillKey || grant.enhancementKey || grant.choiceId || grant.choiceRef || grantName,
        { maxLen: 200, collapse: true },
      ).toLowerCase();
      const grantId = `grant:${grant.type}:${sourceLabel}:${grantIdentity}:${index}`;
      graph.addNode({
        id: grantId,
        kind: "grant",
        key: grantName,
        label: grantName || grant.type,
        sourceId,
        grant,
        grantType: grant.type,
        active: true,
      });
      if (sourceId) graph.addEdge(sourceId, grantId, "grants");

      if (grantCreatesChoice(grant)) {
        for (const choiceId of resolveGrantChoiceIds(grant, { sourceId, index })) {
          const aliases = resolveGrantChoiceAliases(grant, { sourceId, index });
          const choice = grantChoices[choiceId] || aliases.map((alias) => grantChoices[alias]).find(Boolean) || null;
          addGrantChoiceNode(graph, {
            grant,
            grantId,
            sourceId,
            choiceId,
            choice,
            aliases,
            sourceLabel,
            activeGrantChoices,
          });
        }
      }

      const choiceRef = resolveGrantChoiceRef(grant);
      const choiceRefNodeId = buildGrantChoiceNodeId(choiceRef);
      if (choiceRefNodeId) graph.addEdge(grantId, choiceRefNodeId, "references-choice");
    }
  }

  return activeGrantChoices;
}

function reconcileGrantChoices(builder, activeGrantChoices, changes) {
  const grantChoices = isPlainObject(builder?.grantChoices) ? builder.grantChoices : {};
  const next = {};
  const aliasToCanonical = new Map();
  for (const [canonicalId, record] of activeGrantChoices || []) {
    aliasToCanonical.set(canonicalId, canonicalId);
    for (const alias of record?.aliases || []) aliasToCanonical.set(alias, canonicalId);
  }

  for (const [rawChoiceId, rawChoice] of Object.entries(grantChoices)) {
    const choiceId = normalizeChoiceId(rawChoice?.choiceId || rawChoiceId);
    if (!choiceId) continue;
    const canonicalId = aliasToCanonical.get(choiceId);
    if (!canonicalId) {
      const label = grantChoiceAnswerLabel(rawChoice) || choiceId;
      const sourceLabel = sanitizeText(rawChoice?.sourceLabel || "", { maxLen: 200, collapse: true });
      changes.push(makeChange({
        type: "remove",
        storagePath: "builder.grantChoices",
        nodeId: buildGrantChoiceNodeId(choiceId),
        label,
        reason: sourceLabel
          ? `${label} was chosen from ${sourceLabel}, which is no longer selected.`
          : `${label} was chosen from a feature that is no longer selected.`,
        previousValue: rawChoice,
        nextValue: undefined,
      }));
      continue;
    }
    if (!next[canonicalId]) next[canonicalId] = clonePlainObject({ ...rawChoice, choiceId: canonicalId });
  }

  builder.grantChoices = next;
}

function reconcileSourceOwnedWeapons(builder, graph, changes) {
  const previousWeapons = sanitizeWeaponList(builder?.weapons, { maxItems: 20 });
  const previousOwnedWeapons = previousWeapons.filter(isSourceOwnedWeapon);
  const nextWeapons = buildGeneratedWeaponsFromGrantChoices(builder?.grantChoices, previousWeapons);
  const nextOwnedChoiceIds = new Set(
    nextWeapons
      .filter(isSourceOwnedWeapon)
      .map((weapon) => normalizeChoiceId(weapon.sourceChoiceId || weapon.choiceId))
      .filter(Boolean),
  );

  for (const weapon of previousOwnedWeapons) {
    const choiceId = normalizeChoiceId(weapon.sourceChoiceId || weapon.choiceId);
    if (choiceId && nextOwnedChoiceIds.has(choiceId)) continue;
    const label = sanitizeText(weapon.customName || weapon.weaponKey || "Granted weapon", { maxLen: 200, collapse: true });
    changes.push(makeChange({
      type: "remove",
      storagePath: "builder.weapons",
      nodeId: `weapon:${weapon.id || choiceId || label}`,
      label,
      reason: `${label} was created by a source-owned choice that is no longer active.`,
      previousValue: weapon,
      nextValue: undefined,
    }));
  }

  for (const weapon of nextWeapons.filter(isSourceOwnedWeapon)) {
    const choiceId = normalizeChoiceId(weapon.sourceChoiceId || weapon.choiceId);
    const label = sanitizeText(weapon.customName || weapon.weaponKey || "Granted weapon", { maxLen: 200, collapse: true });
    const weaponNodeId = `weapon:${weapon.id || choiceId || label}`;
    graph.addNode({
      id: weaponNodeId,
      kind: "weapon",
      key: weapon.weaponKey,
      label,
      storagePath: "builder.weapons",
      choiceId,
      weapon,
      selected: true,
      active: true,
    });
    const choiceNodeId = buildGrantChoiceNodeId(choiceId);
    if (choiceNodeId) graph.addEdge(choiceNodeId, weaponNodeId, "materializes-weapon");
  }

  builder.weapons = nextWeapons;
}

function validateSelectionCount(changes, {
  storagePath = "",
  nodeId = "",
  label = "Choices",
  selectedCount = 0,
  expectedCount = 0,
  noun = "choice",
} = {}) {
  const issue = getExpectedSelectionIssue({ selectedCount, expectedCount, noun });
  if (!issue) return;
  changes.push(makeChange({
    type: "incomplete",
    storagePath,
    nodeId,
    label,
    ...issue,
  }));
}

function validateChoiceGroups(graph, entries, selectedKeys, storagePath, changes) {
  for (const group of Array.isArray(entries) ? entries : []) {
    if (!isOptionGroup(group)) continue;
    const chooseCount = Number(group?.chooseCount || 0);
    if (chooseCount) {
      validateSelectionCount(changes, {
        storagePath,
        nodeId: `choice-group:${storagePath}:${entryKey(group, entryLabel(group))}`,
        label: entryLabel(group, "Option group"),
        selectedCount: selectedCountForGroup(group, selectedKeys),
        expectedCount: chooseCount,
      });
    }

    for (const option of Array.isArray(group?.options) ? group.options : []) {
      const optionKey = buildOptionKey(group, option);
      if (!selectedKeys.has(optionKey)) continue;
      validateChoiceGroups(graph, [option], selectedKeys, storagePath, changes);
    }
  }
}

function reconcileClassFeatureSelections(gameData, builder, graph, changes) {
  const entries = classFeatureEntries(gameData, builder);
  const selected = selectedSet(builder.selectedClassFeatureOptions, { maxItems: 1000, maxLen: 200 });
  reconcileSelectedOptionKeys({
    entries,
    previousEntries: entries,
    selectedKeys: selected,
    changes,
    storagePath: "builder.selectedClassFeatureOptions",
    nodePrefix: "choice:classFeatureOption",
    unavailableReason: "This option is no longer available for the current class and level.",
    getPrerequisiteContext: (selectedKeys) => ({
      gameData,
      builder: { ...builder, selectedClassFeatureOptions: Array.from(selectedKeys) },
      deferUnresolvedChoices: true,
    }),
  });
  validateChoiceGroups(graph, entries, selected, "builder.selectedClassFeatureOptions", changes);
  builder.selectedClassFeatureOptions = Array.from(selected);
  return entries;
}

function reconcileFeatSelections(gameData, builder, changes) {
  const visibleFeats = availableFeatEntries(gameData, builder);
  const visibleFeatByName = new Map(
    visibleFeats
      .map((feat) => [sanitizeText(feat?.name || "", { maxLen: 160, collapse: true }), feat])
      .filter(([name]) => !!name),
  );
  const selectedFeats = selectedSet(builder.selectedFeats, { maxItems: 200, maxLen: 160 });
  const selectedFeatOptions = selectedSet(builder.selectedFeatOptions, { maxItems: 500, maxLen: 200 });
  const prereqContext = { gameData, builder, deferUnresolvedChoices: true };

  for (const name of Array.from(selectedFeats)) {
    const feat = visibleFeatByName.get(name);
    if (!feat) {
      removeSelection(selectedFeats, name, changes, {
        storagePath: "builder.selectedFeats",
        nodeId: `choice:feat:${name}`,
        label: name,
        reason: "This feat is no longer available for the current class and level.",
      });
      continue;
    }
    const check = checkPrerequisites(feat?.prerequisites, prereqContext);
    if (!check.ok) {
      removeSelection(selectedFeats, name, changes, {
        storagePath: "builder.selectedFeats",
        nodeId: `choice:feat:${name}`,
        label: name,
        reason: check.failureReasons.join(" ") || "Prerequisites are no longer met.",
      });
      deleteSelectedDescendants(feat, selectedFeatOptions);
    }
  }

  const maxSlots = Math.floor(Math.max(1, Math.min(12, Number(builder.level || 1))) / 2);
  if (selectedFeats.size > maxSlots) {
    for (const name of Array.from(selectedFeats).slice(maxSlots)) {
      const feat = visibleFeatByName.get(name);
      removeSelection(selectedFeats, name, changes, {
        storagePath: "builder.selectedFeats",
        nodeId: `choice:feat:${name}`,
        label: name,
        reason: `Only ${maxSlots} feat slot${maxSlots === 1 ? "" : "s"} available at level ${builder.level}.`,
      });
      if (feat) deleteSelectedDescendants(feat, selectedFeatOptions);
    }
  }
  validateSelectionCount(changes, {
    storagePath: "builder.selectedFeats",
    nodeId: "choice-group:builder.selectedFeats",
    label: "Feats",
    selectedCount: selectedFeats.size,
    expectedCount: maxSlots,
    noun: "feat",
  });

  const selectedFeatEntries = Array.from(selectedFeats)
    .map((name) => visibleFeatByName.get(name))
    .filter(Boolean);
  reconcileSelectedOptionKeys({
    entries: selectedFeatEntries,
    selectedKeys: selectedFeatOptions,
    changes,
    storagePath: "builder.selectedFeatOptions",
    nodePrefix: "choice:featOption",
    unavailableReason: "This option is no longer available from the current selected feats.",
    getPrerequisiteContext: () => ({
      gameData,
      builder: { ...builder, selectedFeats: Array.from(selectedFeats) },
      deferUnresolvedChoices: true,
    }),
  });
  validateChoiceGroups(null, selectedFeatEntries, selectedFeatOptions, "builder.selectedFeatOptions", changes);
  builder.selectedFeats = Array.from(selectedFeats);
  builder.selectedFeatOptions = Array.from(selectedFeatOptions);
  return { visibleFeats, selectedFeatEntries };
}

function techniqueName(technique) {
  return sanitizeText(technique?.techniqueName || "", { maxLen: 200, collapse: true });
}

function techniqueRank(technique) {
  const rank = Number.parseInt(String(technique?.rank ?? 0), 10);
  return Number.isFinite(rank) ? rank : 0;
}

function techniqueSkill(technique) {
  return sanitizeText(technique?.skill, { maxLen: 96, collapse: true });
}

function techniqueSkillRank(technique, context) {
  const skillName = techniqueSkill(technique);
  if (!skillName) return techniqueRank(technique);
  let rank = 0;
  const grantedCombat = Array.isArray(context.grantedSkillState?.grantedCombatSkills) ? context.grantedSkillState.grantedCombatSkills : [];
  for (const row of grantedCombat) {
    if (sanitizeText(row?.skill, { maxLen: 96, collapse: true }) !== skillName) continue;
    const value = Number.parseInt(String(row?.rank || "0"), 10);
    if (Number.isFinite(value)) rank = Math.max(rank, value);
  }
  const extra = Array.isArray(context.builder?.sheet?.repeatables?.combatSkillsExtra)
    ? context.builder.sheet.repeatables.combatSkillsExtra
    : [];
  for (const row of extra) {
    if (sanitizeText(row?.skill, { maxLen: 96, collapse: true }) !== skillName) continue;
    const value = Number.parseInt(String(row?.rank || "0"), 10);
    if (Number.isFinite(value)) rank = Math.max(rank, value);
  }
  return rank;
}

function techniqueChoiceGrantCount(context) {
  return context.techniqueChoiceGrants.reduce((total, grant) => {
    const count = Number.parseInt(String(grant?.count ?? 1), 10);
    return total + (Number.isFinite(count) ? Math.max(0, count) : 1);
  }, 0);
}

function countForGrant(grant) {
  const count = Number.parseInt(String(grant?.count ?? 1), 10);
  return Number.isFinite(count) ? Math.max(0, count) : 1;
}

function grantMatchesTechniqueChoice(grant, technique, context) {
  const grantSkill = sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true }).toLowerCase();
  if (!grantSkill) return false;
  if (grantSkill !== techniqueSkill(technique).toLowerCase()) return false;
  return techniqueSkillRank(technique, context) >= techniqueRank(technique);
}

function countExtraTechniqueAssignments(refs, indexes, context) {
  const remainingBySkill = new Map();
  for (const grant of context.techniqueChoiceGrants) {
    const skill = sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true }).toLowerCase();
    if (!skill) continue;
    const count = Number.parseInt(String(grant?.count ?? 1), 10);
    remainingBySkill.set(skill, (remainingBySkill.get(skill) || 0) + (Number.isFinite(count) ? Math.max(0, count) : 1));
  }
  let assigned = 0;
  for (const ref of refs || []) {
    const technique = resolveTechniqueRef(ref, indexes)?.technique;
    if (!technique) continue;
    const skill = techniqueSkill(technique).toLowerCase();
    const remaining = remainingBySkill.get(skill) || 0;
    if (remaining <= 0) continue;
    if (!context.techniqueChoiceGrants.some((grant) => grantMatchesTechniqueChoice(grant, technique, context))) continue;
    remainingBySkill.set(skill, remaining - 1);
    assigned += 1;
  }
  return assigned;
}

function selectedTechniquesFitSlots(refs, indexes, context) {
  const selected = refs instanceof Set ? refs : new Set(refs || []);
  if (selected.size <= context.slots) return true;
  const extraNeeded = selected.size - Math.max(0, context.slots);
  return countExtraTechniqueAssignments(selected, indexes, context) >= extraNeeded;
}

function getRemainingTechniqueChoiceGrants(grants, sourceOwnedAnswerCounts = new Map()) {
  const answeredBySkill = new Map(sourceOwnedAnswerCounts || []);
  const out = [];

  for (const grant of Array.isArray(grants) ? grants : []) {
    const skill = sanitizeText(grant?.skill || grant?.name || grant?.key, { maxLen: 96, collapse: true }).toLowerCase();
    const total = countForGrant(grant);
    if (!skill || total <= 0) continue;

    const answered = Math.max(0, answeredBySkill.get(skill) || 0);
    const consumed = Math.min(total, answered);
    const remaining = total - consumed;
    answeredBySkill.set(skill, answered - consumed);
    if (remaining > 0) out.push({ ...grant, count: remaining });
  }

  return out;
}

function reconcileTechniqueGrantChoices(gameData, builder, activeGrantChoices, changes) {
  const indexes = buildTechniqueIndexes(getGameXTechniques(gameData));
  const grantChoices = isPlainObject(builder?.grantChoices) ? { ...builder.grantChoices } : {};
  const context = {
    builder,
    grantedSkillState: computeGrantedSkillsState(gameData, builder),
  };
  const answerCounts = new Map();
  const answerNames = new Set();

  for (const [choiceId, record] of activeGrantChoices || []) {
    const grant = record?.grant || {};
    if (grant?.type !== "technique-choice") continue;

    const choice = grantChoices[choiceId] || null;
    const sourceLabel = sanitizeText(record?.sourceLabel || "", { maxLen: 200, collapse: true });
    const skillLabel = sanitizeText(grant?.skill || grant?.name || "technique", { maxLen: 96, collapse: true });
    const label = sourceLabel || sanitizeText(grant?.name || grant?.skill || choiceId, { maxLen: 200, collapse: true }) || "Technique choice";
    const selectedTechnique = sanitizeText(choice?.techniqueName || choice?.value, { maxLen: 200, collapse: true });

    if (!selectedTechnique) {
      changes.push(makeChange({
        type: "incomplete",
        storagePath: "builder.grantChoices",
        nodeId: buildGrantChoiceNodeId(choiceId),
        label,
        reason: `${sourceLabel || "This feature"} grants a ${skillLabel} technique. Choose 1 technique.`,
        previousValue: 0,
        nextValue: 1,
      }));
      continue;
    }

    const technique = resolveTechniqueRef(selectedTechnique, indexes)?.technique;
    let reason = "";
    if (!technique) {
      reason = "This selected technique no longer exists in the JSON.";
    } else if (!isGameDataRecordSelectable(technique, { allowGrantedOnly: true })) {
      reason = "This selected technique is not available from grants.";
    } else if (!grantMatchesTechniqueChoice(grant, technique, context)) {
      reason = "This selected technique no longer matches the granting choice.";
    } else if (!meetsPrerequisites(technique?.prerequisites, {
      gameData,
      builder,
      grantedSkillState: context.grantedSkillState,
      deferUnresolvedChoices: true,
    })) {
      reason = "Prerequisites are no longer met.";
    }

    if (reason) {
      changes.push(makeChange({
        type: "remove",
        storagePath: "builder.grantChoices",
        nodeId: buildGrantChoiceNodeId(choiceId),
        label: selectedTechnique,
        reason,
        previousValue: choice,
        nextValue: undefined,
      }));
      delete grantChoices[choiceId];
      continue;
    }

    const skill = sanitizeText(grant?.skill || techniqueSkill(technique), { maxLen: 96, collapse: true }).toLowerCase();
    if (skill) answerCounts.set(skill, (answerCounts.get(skill) || 0) + 1);
    answerNames.add(selectedTechnique);
  }

  builder.grantChoices = grantChoices;
  return { answerCounts, answerNames };
}

function sortedTechniqueRefs(refs, indexes) {
  return Array.from(refs || [])
    .map((ref) => {
      const technique = resolveTechniqueRef(ref, indexes)?.technique;
      return {
        ref,
        rank: technique ? techniqueRank(technique) : 9999,
        name: technique ? techniqueName(technique) : ref,
      };
    })
    .sort((a, b) => a.rank === b.rank ? a.name.localeCompare(b.name) : a.rank - b.rank)
    .map((entry) => entry.ref);
}

function reconcileTechniqueSelections(gameData, builder, changes, {
  sourceOwnedTechniqueAnswerCounts = new Map(),
  sourceOwnedTechniqueNames = new Set(),
} = {}) {
  const indexes = buildTechniqueIndexes(getGameXTechniques(gameData));
  const selected = selectedSet(builder.selectedTechniques, { maxItems: 500, maxLen: 200 });
  const { primaryAttrKey, slots } = computeTechniqueSlots(builder.primaryAttribute, builder.attributes);
  const knownAndGrants = computeKnownCombatSkillsAndGrants(gameData, builder);
  const remainingTechniqueChoiceGrants = getRemainingTechniqueChoiceGrants(
    Array.isArray(knownAndGrants.techniqueChoiceGrants) ? knownAndGrants.techniqueChoiceGrants : [],
    sourceOwnedTechniqueAnswerCounts,
  );
  const context = {
    builder,
    primaryAttrKey,
    slots,
    knownCombatSkills: knownAndGrants.knownCombatSkills || new Set(),
    grantedTechniqueNames: knownAndGrants.grantedTechniqueNames || new Set(),
    techniqueChoiceGrants: remainingTechniqueChoiceGrants,
    grantedSkillState: computeGrantedSkillsState(gameData, builder),
  };

  for (const ref of Array.from(selected)) {
    const technique = resolveTechniqueRef(ref, indexes)?.technique;
    if (!technique) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "This technique no longer exists in the JSON.",
      });
      continue;
    }
    if (!isGameDataRecordSelectable(technique)) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "This technique is not available for normal selection.",
      });
      continue;
    }
    if (context.grantedTechniqueNames.has(ref)) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "This technique is now granted automatically.",
      });
      continue;
    }
    if (sourceOwnedTechniqueNames.has(ref)) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "This technique is now chosen by a feature-owned choice.",
      });
      continue;
    }
    const skill = techniqueSkill(technique);
    if (skill && !context.knownCombatSkills.has(skill)) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "This technique's combat skill is no longer known for the current class/features.",
      });
      continue;
    }
    if (techniqueSkillRank(technique, context) < techniqueRank(technique)) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "This technique's required combat skill rank is no longer met.",
      });
      continue;
    }
    if (!meetsPrerequisites(technique?.prerequisites, {
      gameData,
      builder,
      grantedSkillState: context.grantedSkillState,
      deferUnresolvedChoices: true,
    })) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "Prerequisites are no longer met.",
      });
    }
  }

  if (context.slots <= 0) {
    for (const ref of Array.from(selected)) {
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "There are currently 0 technique slots.",
      });
    }
  } else if (!selectedTechniquesFitSlots(selected, indexes, context)) {
    const keep = new Set();
    for (const ref of sortedTechniqueRefs(selected, indexes)) {
      const next = new Set(keep);
      next.add(ref);
      if (selectedTechniquesFitSlots(next, indexes, context)) keep.add(ref);
    }
    for (const ref of Array.from(selected)) {
      if (keep.has(ref)) continue;
      removeSelection(selected, ref, changes, {
        storagePath: "builder.selectedTechniques",
        nodeId: `choice:technique:${ref}`,
        label: ref,
        reason: "Selected techniques exceed available technique picks.",
      });
    }
  }

  const maxTotal = context.slots + techniqueChoiceGrantCount(context);
  if (context.primaryAttrKey && maxTotal > 0 && selected.size < maxTotal) {
    validateSelectionCount(changes, {
      storagePath: "builder.selectedTechniques",
      nodeId: "choice-group:builder.selectedTechniques",
      label: "Techniques",
      selectedCount: selected.size,
      expectedCount: maxTotal,
      noun: "technique",
    });
  }

  builder.selectedTechniques = sortedTechniqueRefs(selected, indexes);
}

export function buildCharacterDependencyGraph(gameData, builder = {}) {
  const b = clonePlainObject(isPlainObject(builder) ? builder : {});
  const graph = createGraph();
  const changes = [];

  graph.addNode({ id: "root:character", kind: "root", label: "Character", active: true });
  if (b.classKey) {
    graph.addNode({
      id: `class:${b.classKey}`,
      kind: "class",
      key: b.classKey,
      label: b.classKey,
      storagePath: "builder.classKey",
      selected: true,
      active: true,
    });
    graph.addEdge("root:character", `class:${b.classKey}`, "selected");
  }
  graph.addNode({ id: `level:${b.level || 1}`, kind: "level", key: b.level || 1, label: `Level ${b.level || 1}`, storagePath: "builder.level", active: true });
  graph.addEdge("root:character", `level:${b.level || 1}`, "selected");

  const featureEntries = reconcileClassFeatureSelections(gameData, b, graph, changes);
  const featureOptionKeys = new Set(sanitizeStringArray(b.selectedClassFeatureOptions, { maxItems: 1000, maxLen: 200 }));
  const activeEntries = [];
  addEntryGraphNodes(graph, featureEntries, {
    sourceId: b.classKey ? `class:${b.classKey}` : "root:character",
    storagePath: "builder.selectedClassFeatureOptions",
    kind: "classFeature",
    selectedKeys: featureOptionKeys,
    activeEntries,
  });

  const { visibleFeats, selectedFeatEntries } = reconcileFeatSelections(gameData, b, changes);
  const selectedFeatNames = new Set(sanitizeStringArray(b.selectedFeats, { maxItems: 200, maxLen: 160 }));
  for (const feat of visibleFeats) {
    const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
    if (!name) continue;
    const selected = selectedFeatNames.has(name);
    graph.addNode({
      id: `feat:${name}`,
      kind: "feat",
      key: name,
      label: name,
      storagePath: "builder.selectedFeats",
      entry: feat,
      selected,
      active: selected,
      prerequisites: feat?.prerequisites || [],
      grants: feat?.grants || [],
    });
    if (b.classKey) graph.addEdge(`class:${b.classKey}`, `feat:${name}`, "offers");
    if (selected) activeEntries.push({ entry: feat, sourceId: `feat:${name}` });
  }
  const selectedFeatOptionKeys = new Set(sanitizeStringArray(b.selectedFeatOptions, { maxItems: 500, maxLen: 200 }));
  for (const feat of selectedFeatEntries) {
    const name = sanitizeText(feat?.name || "", { maxLen: 160, collapse: true });
    addEntryGraphNodes(graph, [feat], {
      sourceId: name ? `feat:${name}` : "root:character",
      storagePath: "builder.selectedFeatOptions",
      kind: "featOption",
      selectedKeys: selectedFeatOptionKeys,
      activeEntries,
    });
  }

  const activeGrantChoices = addGrantNodes(graph, activeEntries, { builder: b });
  reconcileGrantChoices(b, activeGrantChoices, changes);
  const sourceOwnedTechniqueAnswers = reconcileTechniqueGrantChoices(gameData, b, activeGrantChoices, changes);
  reconcileSourceOwnedWeapons(b, graph, changes);

  reconcileTechniqueSelections(gameData, b, changes, {
    sourceOwnedTechniqueAnswerCounts: sourceOwnedTechniqueAnswers.answerCounts,
    sourceOwnedTechniqueNames: sourceOwnedTechniqueAnswers.answerNames,
  });
  for (const ref of sanitizeStringArray(b.selectedTechniques, { maxItems: 500, maxLen: 200 })) {
    graph.addNode({
      id: `technique:${ref}`,
      kind: "technique",
      key: ref,
      label: ref,
      storagePath: "builder.selectedTechniques",
      selected: true,
      active: true,
    });
    graph.addEdge("root:character", `technique:${ref}`, "selected");
  }

  return {
    builder: b,
    changes,
    nodes: graph.nodes,
    edges: graph.edges,
    reverseEdges: graph.reverseEdges,
  };
}
