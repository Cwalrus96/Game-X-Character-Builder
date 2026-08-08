const GRAPH_NODE_STATES = new Set([
  "available",
  "selected",
  "automatic",
  "incomplete",
  "invalid",
]);

const GRAPH_DIAGNOSTIC_SEVERITIES = new Set(["error", "warning"]);

export const GRAPH_EDGE_KINDS = Object.freeze([
  "owns",
  "offers",
  "grants",
  "requires",
  "satisfies",
  "materializes",
  "excludes",
]);

const AFFECTED_FORWARD_EDGE_KINDS = new Set([
  "owns",
  "offers",
  "grants",
  "satisfies",
  "materializes",
  "excludes",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneGraphValue(value) {
  if (Array.isArray(value)) return value.map(cloneGraphValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneGraphValue(child)]));
  }
  return value;
}

export function freezeGraphValue(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeGraphValue);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach(freezeGraphValue);
    return Object.freeze(value);
  }
  return value;
}

export function frozenGraphClone(value) {
  return freezeGraphValue(cloneGraphValue(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalString(value) {
  return JSON.stringify(canonicalValue(value));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStorageBinding(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return null;
  const path = normalizeText(value.path);
  const kind = normalizeText(value.kind);
  const key = normalizeText(value.key);
  if (!path || !["scalar", "ordered-key-array", "keyed-record"].includes(kind)) return null;
  if (kind === "keyed-record" && !key) return null;
  return { path, kind, ...(key ? { key } : {}) };
}

function normalizeNode(value) {
  if (!isPlainObject(value)) return null;
  const id = normalizeText(value.id);
  const type = normalizeText(value.type);
  const state = normalizeText(value.state) || "available";
  const storageBinding = normalizeStorageBinding(value.storageBinding);
  if (!id || !type || !GRAPH_NODE_STATES.has(state)) return null;
  if (value.storageBinding !== undefined && value.storageBinding !== null && !storageBinding) return null;
  return {
    id,
    type,
    key: normalizeText(value.key),
    label: normalizeText(value.label),
    state,
    sourceOwnerId: normalizeText(value.sourceOwnerId),
    storageBinding,
    metadata: isPlainObject(value.metadata) ? cloneGraphValue(value.metadata) : {},
  };
}

function normalizeEdge(value) {
  if (!isPlainObject(value)) return null;
  const kind = normalizeText(value.kind);
  const from = normalizeText(value.from);
  const to = normalizeText(value.to);
  if (!GRAPH_EDGE_KINDS.includes(kind) || !from || !to) return null;
  return {
    id: `edge:${kind}:${from}:${to}`,
    kind,
    from,
    to,
    metadata: isPlainObject(value.metadata) ? cloneGraphValue(value.metadata) : {},
  };
}

function normalizeDiagnostic(value) {
  const source = isPlainObject(value) ? value : {};
  const severity = GRAPH_DIAGNOSTIC_SEVERITIES.has(source.severity) ? source.severity : "error";
  return {
    severity,
    code: normalizeText(source.code) || "graph-contract-error",
    path: normalizeText(source.path) || "graph",
    nodeId: normalizeText(source.nodeId),
    message: normalizeText(source.message) || "The graph contract is invalid.",
  };
}

const DIAGNOSTIC_SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1 });

function compareDiagnostics(left, right) {
  return DIAGNOSTIC_SEVERITY_ORDER[left.severity] - DIAGNOSTIC_SEVERITY_ORDER[right.severity]
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.nodeId.localeCompare(right.nodeId)
    || left.message.localeCompare(right.message);
}

function compareEdges(left, right) {
  return left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || left.kind.localeCompare(right.kind);
}

function cycleDiagnostics(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  for (const targets of adjacency.values()) targets.sort();

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = new Set();

  const visit = (nodeId) => {
    if (visiting.has(nodeId)) {
      const index = stack.indexOf(nodeId);
      const members = [...stack.slice(index), nodeId];
      cycles.add(members.join(" -> "));
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    stack.push(nodeId);
    for (const target of adjacency.get(nodeId) || []) visit(target);
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of Array.from(adjacency.keys()).sort()) visit(nodeId);
  return Array.from(cycles).sort().map((cycle) => ({
    severity: "error",
    code: "graph-cycle",
    path: "graph.edges",
    nodeId: cycle.split(" -> ")[0],
    message: `Graph dependency cycle detected: ${cycle}.`,
  }));
}

export class GraphContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GraphContractError";
    this.code = code;
  }
}

export class GraphHandlerRegistry {
  #nodeHandlers = new Map();
  #grantHandlers = new Map();
  #prerequisiteHandlers = new Map();

  registerNode(type, handler) {
    return this.#register(this.#nodeHandlers, "node", type, handler);
  }

  registerGrant(type, handler) {
    return this.#register(this.#grantHandlers, "grant", type, handler);
  }

  registerPrerequisite(type, handler) {
    return this.#register(this.#prerequisiteHandlers, "prerequisite", type, handler);
  }

  removeNode(type) {
    this.#nodeHandlers.delete(normalizeText(type));
    return this;
  }

  removeGrant(type) {
    this.#grantHandlers.delete(normalizeText(type));
    return this;
  }

  removePrerequisite(type) {
    this.#prerequisiteHandlers.delete(normalizeText(type));
    return this;
  }

  getNode(type) {
    return this.#nodeHandlers.get(normalizeText(type)) || null;
  }

  getGrant(type) {
    return this.#grantHandlers.get(normalizeText(type)) || null;
  }

  getPrerequisite(type) {
    return this.#prerequisiteHandlers.get(normalizeText(type)) || null;
  }

  clone() {
    const next = new GraphHandlerRegistry();
    for (const [type, handler] of this.#nodeHandlers) next.registerNode(type, handler);
    for (const [type, handler] of this.#grantHandlers) next.registerGrant(type, handler);
    for (const [type, handler] of this.#prerequisiteHandlers) next.registerPrerequisite(type, handler);
    return next;
  }

  describe() {
    return frozenGraphClone({
      nodes: Array.from(this.#nodeHandlers.keys()).sort(),
      grants: Array.from(this.#grantHandlers.keys()).sort(),
      prerequisites: Array.from(this.#prerequisiteHandlers.keys()).sort(),
    });
  }

  #register(map, kind, type, handler) {
    const normalizedType = normalizeText(type);
    if (!normalizedType || typeof handler !== "function") {
      throw new GraphContractError(
        "invalid-graph-handler",
        `A ${kind} handler requires a non-empty type and function.`,
      );
    }
    if (map.has(normalizedType)) {
      throw new GraphContractError(
        "duplicate-graph-handler",
        `A ${kind} handler is already registered for "${normalizedType}".`,
      );
    }
    map.set(normalizedType, handler);
    return this;
  }
}

export class CharacterGraphBuilder {
  #nodes = new Map();
  #edges = new Map();
  #diagnostics = [];

  addNode(value, { path = "graph.nodes" } = {}) {
    const node = normalizeNode(value);
    if (!node) {
      this.addDiagnostic({
        code: "invalid-graph-node",
        path,
        message: "Graph nodes require stable id/type/state fields and a valid storage binding.",
      });
      return null;
    }
    const previous = this.#nodes.get(node.id);
    if (previous) {
      if (canonicalString(previous) !== canonicalString(node)) {
        this.addDiagnostic({
          code: "duplicate-node-identity",
          path,
          nodeId: node.id,
          message: `Graph node identity "${node.id}" resolves to conflicting records.`,
        });
      }
      return previous;
    }
    this.#nodes.set(node.id, node);
    return node;
  }

  addEdge(value, { path = "graph.edges" } = {}) {
    const edge = normalizeEdge(value);
    if (!edge) {
      this.addDiagnostic({
        code: "invalid-graph-edge",
        path,
        message: "Graph edges require a registered kind and stable from/to node identities.",
      });
      return null;
    }
    const previous = this.#edges.get(edge.id);
    if (previous) {
      if (canonicalString(previous) !== canonicalString(edge)) {
        this.addDiagnostic({
          code: "duplicate-edge-identity",
          path,
          nodeId: edge.from,
          message: `Graph edge identity "${edge.id}" resolves to conflicting records.`,
        });
      }
      return previous;
    }
    this.#edges.set(edge.id, edge);
    return edge;
  }

  addDiagnostic(value) {
    this.#diagnostics.push(normalizeDiagnostic(value));
  }

  hasNode(nodeId) {
    return this.#nodes.has(normalizeText(nodeId));
  }

  finalize({ metadata = {} } = {}) {
    const nodes = Array.from(this.#nodes.values()).sort((left, right) => left.id.localeCompare(right.id));
    const edges = Array.from(this.#edges.values()).sort(compareEdges);
    const diagnostics = [...this.#diagnostics];
    const nodeIds = new Set(nodes.map((node) => node.id));

    for (const edge of edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        diagnostics.push(normalizeDiagnostic({
          code: "dangling-graph-edge",
          path: "graph.edges",
          nodeId: !nodeIds.has(edge.from) ? edge.from : edge.to,
          message: `Graph edge "${edge.id}" references a node that does not exist.`,
        }));
      }
    }
    diagnostics.push(...cycleDiagnostics(nodes, edges).map(normalizeDiagnostic));
    diagnostics.sort(compareDiagnostics);

    return frozenGraphClone({
      ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      nodes,
      edges,
      diagnostics,
      metadata: isPlainObject(metadata) ? metadata : {},
    });
  }
}

export function collectAffectedNodeIds(graph, sourceNodeIds = []) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const known = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));

  for (const edge of edges) {
    if (AFFECTED_FORWARD_EDGE_KINDS.has(edge.kind)) adjacency.get(edge.from)?.add(edge.to);
    if (edge.kind === "requires") adjacency.get(edge.to)?.add(edge.from);
  }

  const affected = new Set();
  const queue = Array.from(new Set(sourceNodeIds.map(normalizeText).filter((id) => known.has(id)))).sort();
  while (queue.length) {
    const nodeId = queue.shift();
    if (affected.has(nodeId)) continue;
    affected.add(nodeId);
    for (const next of Array.from(adjacency.get(nodeId) || []).sort()) {
      if (!affected.has(next)) queue.push(next);
    }
  }
  return Object.freeze(Array.from(affected).sort());
}
