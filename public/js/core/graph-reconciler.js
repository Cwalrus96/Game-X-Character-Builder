import { decodeCharacter } from "./character-codec.js";
import { getExpectedSelectionIssue } from "./choice-capacity.js";
import {
  cloneGraphValue,
  collectAffectedNodeIds,
  frozenGraphClone,
} from "./graph-core.js";
import {
  GraphCompiler,
  createDefaultGraphHandlerRegistry,
  getUnmetRequirementNodeIds,
} from "./graph-compiler.js";

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

function removeGrantAnswer(next, choiceId) {
  if (!Object.prototype.hasOwnProperty.call(next.builder.grantChoices, choiceId)) return false;
  delete next.builder.grantChoices[choiceId];
  return true;
}

function applyRemovalPolicies(character, graph, impacts) {
  const next = cloneGraphValue(character);
  let changed = false;

  for (const node of graph.nodes) {
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
    }
  }

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

    const result = applyRemovalPolicies(current, graph, impacts);
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

  const previousDecoded = previousCharacter ? decodeCharacter(previousCharacter) : { ok: false };
  const previousGraph = previousDecoded.ok ? compiler.compile(previousDecoded.value) : null;
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
