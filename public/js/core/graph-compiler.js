import { decodeCharacter } from "./character-codec.js";
import { computeTechniqueSlots } from "./character-rules.js";
import { resolveGrantChoiceIds } from "./choice-identity.js";
import { RUNTIME_PREREQUISITE_TYPES } from "./game-data-contract.js";
import { isGameDataRecordSelectable } from "./game-data.js";
import { evaluatePrerequisite } from "./prerequisites.js";
import {
  CharacterGraphBuilder,
  GraphHandlerRegistry,
  cloneGraphValue,
  frozenGraphClone,
} from "./graph-core.js";

const DEFAULT_NODE_TYPES = Object.freeze([
  "root",
  "fact",
  "class",
  "origin",
  "resource",
  "class-feature",
  "choice-group",
  "class-option",
  "grant",
  "automatic-technique",
  "grant-choice",
  "grant-answer",
  "technique-selection",
  "requirement",
  "unsupported-answer",
]);

const STABLE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
      path,
    });
  }
}

export function createDefaultGraphHandlerRegistry() {
  const registry = new GraphHandlerRegistry();
  for (const type of DEFAULT_NODE_TYPES) registry.registerNode(type, defaultNodeHandler);
  registry.registerGrant("technique", defaultTechniqueGrantHandler);
  registry.registerGrant("technique-choice", defaultTechniqueGrantHandler);
  for (const type of RUNTIME_PREREQUISITE_TYPES) {
    registry.registerPrerequisite(type, defaultPrerequisiteHandler);
  }
  return registry;
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

function unsupportedCharacterDomains(character, graph) {
  const builder = character.builder;
  const domains = [
    ["selectedClassUtilitySkills", "builder.selectedClassUtilitySkills"],
    ["selectedFeats", "builder.selectedFeats"],
    ["selectedFeatOptions", "builder.selectedFeatOptions"],
    ["bonds", "builder.bonds"],
    ["weapons", "builder.weapons"],
  ];
  for (const [field, path] of domains) {
    if (!Array.isArray(builder[field]) || builder[field].length === 0) continue;
    graph.addDiagnostic({
      code: "unhandled-character-domain",
      path,
      message: `The initial graph-core slice does not yet register the ${field} domain.`,
    });
  }
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
    return key ? `fact:selected-feat:${slug(key)}` : "";
  }
  return `fact:prerequisite:${type}:${slug(
    prerequisite?.choiceRef
      || prerequisite?.key
      || prerequisite?.name
      || prerequisite?.tag
      || prerequisite?.text,
  )}`;
}

function createCompilerContext({ character, gameData, registry, graph, classesByKey, techniquesByKey }) {
  const activeChoices = new Map();
  const automaticTechniqueKeys = new Set();
  const selectedClassOptionKeys = new Set(character.builder.selectedClassFeatureOptions);
  const offeredClassOptionKeys = new Set();
  const classOptionNodeIds = new Map();
  const activeSources = [];

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
      const handler = registry.getPrerequisite(type);
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
          classesByKey,
          character,
          gameData,
          registry,
          graph,
          addTypedNode,
          addDiagnostic,
          compileRequirements,
          activeChoices,
          automaticTechniqueKeys,
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
    activeChoices,
    automaticTechniqueKeys,
    selectedClassOptionKeys,
    offeredClassOptionKeys,
    classOptionNodeIds,
    activeSources,
    addDiagnostic,
    addTypedNode,
    compileRequirements,
    compileGrants,
  };
}

function compileRootFacts(context, character) {
  const { addTypedNode } = context;
  const builder = character.builder;
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
    addTypedNode("fact", {
      id: `fact:attribute:${attributeKey}`,
      key: attributeKey,
      label: attributeKey,
      state: "automatic",
      sourceOwnerId: "root:character",
      storageBinding: { path: `builder.attributes.${attributeKey}`, kind: "scalar" },
      metadata: { value },
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
    context.addTypedNode("class", {
      id: `class:${builder.classKey}`,
      key: builder.classKey,
      label: sourceLabel(cls, builder.classKey),
      state: cls ? "selected" : "invalid",
      sourceOwnerId: "root:character",
      storageBinding: { path: "builder.classKey", kind: "scalar" },
      metadata: { exists: !!cls, selectable: cls ? cls.selectable !== false : false },
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
    context.addTypedNode("origin", {
      id: `origin:${builder.originKey}`,
      key: builder.originKey,
      label: sourceLabel(origin, builder.originKey),
      state: origin ? "selected" : "invalid",
      sourceOwnerId: "root:character",
      storageBinding: { path: "builder.originKey", kind: "scalar" },
      metadata: { exists: !!origin },
    }, "character.builder.originKey");
    graph.addEdge({ kind: "owns", from: "root:character", to: `origin:${builder.originKey}` }, { path: "character.builder.originKey" });
    if (!origin) {
      context.addDiagnostic({
        code: "dangling-origin-reference",
        path: "character.builder.originKey",
        nodeId: `origin:${builder.originKey}`,
        message: `Selected origin "${builder.originKey}" does not exist in normalized game data.`,
      });
    }
  }
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
    const key = stableKey(entry?.featureKey);
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
    const nodeId = `class-option:${classKey}:${key}`;
    context.classOptionNodeIds.set(key, nodeId);
    context.addTypedNode("class-option", {
      id: nodeId,
      key,
      label: sourceLabel(entry, key),
      state: selected ? "selected" : "available",
      sourceOwnerId: groupNodeId,
      storageBinding: { path: "builder.selectedClassFeatureOptions", kind: "ordered-key-array" },
      metadata: { selected, classKey, featureKey: key },
    }, path);
    graph.addEdge({ kind: "offers", from: groupNodeId, to: nodeId }, { path });
    if (!selected) return;
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
      metadata: { classKey, featureKey: key, level: entryLevel(entry) },
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

function compileGrantAnswers(context, character, techniquesByKey, graph) {
  const answers = character.builder.grantChoices;
  const claimed = new Set();

  for (const [choiceId, choiceSpec] of Array.from(context.activeChoices.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    const answer = answers[choiceId];
    if (!answer) continue;
    claimed.add(choiceId);
    const answerNodeId = `grant-answer:${choiceId}`;
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
      const skillFilters = choiceSpec.choiceNodeId ? values(choiceSpec.grant?.skill) : [];
      const tagFilters = choiceSpec.choiceNodeId ? values(choiceSpec.grant?.tag) : [];
      const keyFilters = choiceSpec.choiceNodeId ? values(choiceSpec.grant?.key) : [];
      const techniqueSkills = values(technique.skillKeys || technique.skill);
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
    const selectable = isGameDataRecordSelectable(technique);
    const automatic = context.automaticTechniqueKeys.has(techniqueKey);
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
  } else if (gameData.schemaVersion !== 2) {
    graph.addDiagnostic({
      code: "unsupported-game-data-schema",
      path: "gameData.schemaVersion",
      message: "Graph core fixture integration requires normalized runtime artifact schema 2.",
    });
  }

  const activeRegistry = registry instanceof GraphHandlerRegistry ? registry : new GraphHandlerRegistry();
  const classesByKey = indexRecords(gameData?.classes, "classKey", "Class", graph, "gameData.classes");
  const originsByKey = indexRecords(gameData?.origins, "originKey", "Origin", graph, "gameData.origins");
  const techniquesByKey = indexRecords(gameData?.techniques, "techniqueKey", "Technique", graph, "gameData.techniques");
  const context = createCompilerContext({
    character: decoded.value,
    gameData: isPlainObject(gameData) ? gameData : {},
    registry: activeRegistry,
    graph,
    classesByKey,
    techniquesByKey,
  });

  unsupportedCharacterDomains(decoded.value, graph);
  compileRootFacts(context, decoded.value);
  compileClassAndOrigin(context, decoded.value, classesByKey, originsByKey, graph);
  compileClassFeatures(context, decoded.value, gameData, graph);
  for (const source of context.activeSources.sort((left, right) => left.nodeId.localeCompare(right.nodeId))) {
    context.compileGrants(source);
  }
  compileGrantAnswers(context, decoded.value, techniquesByKey, graph);
  compileSelectedTechniques(context, decoded.value, techniquesByKey, graph);

  const { primaryAttrKey, slots } = computeTechniqueSlots(
    decoded.value.builder.primaryAttribute,
    decoded.value.builder.attributes,
  );
  const finalized = graph.finalize({
    metadata: {
      compilerVersion: 1,
      registry: activeRegistry.describe(),
      primaryAttribute: primaryAttrKey,
      techniqueCapacity: slots,
      automaticTechniqueKeys: Array.from(context.automaticTechniqueKeys).sort(),
      activeChoiceIds: Array.from(context.activeChoices.keys()).sort(),
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
