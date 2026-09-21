import { getExpressionRuntimeStatus, getTraitGrantDeferredReasons } from "../../public/js/core/game-data-contract.js";
import { normalizeExpressionObject } from "../../public/js/core/game-data-expressions.js";

const array = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const leaves = (expression) => expression?.type === "any" ? (Array.isArray(expression.alternatives) ? expression.alternatives : []).flatMap(leaves) : [expression];
const identity = (row) => row.featureKey || row.featKey || row.traitKey || row.techniqueKey || row.weaponKey;
const owner = (row) => row.classKey ? `class:${row.classKey}` : row.originKey ? `origin:${row.originKey}` : row.featKey ? `feat-category:${row.category}` : `${row.source?.sheet}:${identity(row)}`;
const nodeId = (row) => `${owner(row)}/${identity(row)}`;
const incomplete = (row) => /(?:^|\b)(?:TBD|TODO|unfinished|not yet designed)(?:\b|$)/i.test(row.description || "") || (row.kind !== "optionGroup" && !row.description && !row.grants?.length && !row.action?.damage && !row.action?.onSuccess);
const needsEquipmentState = (rule) => ["weapon", "weapon-set"].includes(rule.type) && (rule.wielded || rule.separateHands);
const ruleDeferred = (rule) => needsEquipmentState(rule) || !["implemented", "compatibility"].includes(getExpressionRuntimeStatus("prerequisite", rule, { syntaxVersion: 3 }));
const traitDeferralMessages = Object.freeze({
  "trait-rank-context-missing": "Trait grant has neither a fixed rank nor an associated skill; its rank context remains unassigned.",
  "trait-activation-missing": "Trait grant requires an explicit permanent or toggle activation before execution.",
  "trait-choice-id-missing": "Trait choice requires an explicit choiceId for stable source-owned answers.",
  "trait-toggle-id-missing": "Toggle Trait grant requires an explicit activationId.",
  "trait-recipient-deferred": "Trait grant targets a non-character recipient whose execution is not implemented.",
});

/** Additional source-v5 relationships. Validating an invocation never executes it. */
export function validateV5Relationships(model, helpers) {
  const { add, requireReference, identityIndex, techniques, feats, expressionRows, choiceDefinitions, runtimeSupportBySource } = helpers;
  const traits = identityIndex(model.traits || [], { field: "traitKey", label: "Trait" });
  const archetypes = new Map((model.feats || []).filter((row) => row.archetypeKey).map((row) => [row.archetypeKey, row]));
  const featureRows = [...(model.classFeatures || []), ...(model.originFeatures || [])];
  const byFeatureKey = new Map();
  for (const row of featureRows) byFeatureKey.set(row.featureKey, [...(byFeatureKey.get(row.featureKey) || []), row]);
  const invocations = [];
  const adjacency = new Map();
  const parentEdges = new Map();
  for (const row of [...featureRows, ...(model.feats || [])]) {
    if (!row.parentKey) continue;
    const parentId = `${owner(row)}/${row.parentKey}`;
    parentEdges.set(nodeId(row), [{ target: parentId, row }]);
    // Invoking a group also offers its children. Include that containment when
    // rejecting recursive invocation through an option nested in the group.
    adjacency.set(parentId, [...(adjacency.get(parentId) || []), { target: nodeId(row), row }]);
  }

  const requireScopedChoice = (key, row, column, { recipient = false } = {}) => {
    const definition = choiceDefinitions.get(key);
    if (!definition) {
      add("error", recipient ? "unresolved-recipient-reference" : "unresolved-choice-reference", `${recipient ? "Recipient" : "Choice"} reference "${key}" does not resolve.`, row, column, { key });
      return null;
    }
    if (recipient && (owner(row) !== owner(definition.record) || definition.kind !== "grant" || !(definition.record.grants || []).some((grant) => grant.choiceId === key && grant.type === "bond"))) {
      add("error", "recipient-scope-mismatch", `Recipient "${key}" must identify a bond granted in the same owning class or origin.`, row, column, { key, targetSource: definition.record.source });
      return null;
    }
    return definition;
  };

  for (const row of [...expressionRows, ...(model.weaponBases || [])]) {
    const sourceKey = `${row.source?.sheet}:${row.source?.row}`;
    runtimeSupportBySource[sourceKey] ||= { status: "supported", reasons: [] };
    if (row.status && row.status !== "playable") add("warning", "record-unready", `Record status "${row.status}" is retained and excluded from normal selection.`, row, "status");
    if (incomplete(row)) add("warning", "incomplete-content", "Incomplete authored content is retained for review and cannot execute as a complete option.", row, "description");
    for (const key of row.traitKeys || []) requireReference(traits, key, { record: row, column: "traitKeys", kind: "Trait" });
    for (const key of row.techniqueKeys || []) {
      requireReference(techniques, key, { record: row, column: "techniqueKeys", kind: "Technique" });
      const target = techniques.get(key);
      if (target && target.status !== "playable") add("warning", row.traitKey ? "draft-trait-technique-link" : "draft-record-granted", `Related technique "${key}" is unfinished and cannot be granted as complete mechanics.`, row, "techniqueKeys");
    }

    for (const [index, grant] of (row.grants || []).entries()) {
      const normalized = normalizeExpressionObject("grant", grant, { syntaxVersion: 3 });
      for (const diagnostic of normalized.diagnostics) add(diagnostic.severity, diagnostic.code, diagnostic.message, row, "grants", { field: diagnostic.field, expressionIndex: index });
      if (grant.type === "trait") {
        if (grant.key) requireReference(traits, grant.key, { record: row, column: "grants", kind: "Trait" });
        for (const reason of getTraitGrantDeferredReasons(normalized.value || grant)) {
          add("warning", reason, traitDeferralMessages[reason], row, "grants", { expressionIndex: index });
        }
      }
      if (grant.recipientRef && grant.type !== "trait") {
        requireScopedChoice(grant.recipientRef, row, "grants", { recipient: true });
        add("warning", "recipient-execution-deferred", `Grant recipient "${grant.recipientRef}" is retained; recipient-owned skill execution is not implemented.`, row, "grants");
      }
      if (grant.type === "tag" && !row.traitKey) add("warning", "unresolved-rank-context", "Rank-dependent tag grant requires an explicit Trait or Familiar rank context.", row, "grants");
      if (grant.type !== "feature") continue;
      const candidates = byFeatureKey.get(grant.key) || [];
      const local = candidates.filter((candidate) => owner(candidate) === owner(row));
      const target = local.length === 1 ? local[0] : null;
      if (!target) {
        add("error", local.length > 1 ? "ambiguous-feature-reference" : candidates.length ? "feature-scope-mismatch" : "unresolved-feature-reference", `Feature "${grant.key}" must resolve exactly once in its owner's scope.`, row, "grants", { key: grant.key, expressionIndex: index });
        continue;
      }
      const invocation = { invocationId: `${nodeId(row)}/grant:${index}`, source: row.source, sourceKey: identity(row), targetKey: target.featureKey, owner: owner(row), ownership: "fresh-invocation", inheritTargetPlacement: false, runtimeStatus: "deferred" };
      invocations.push(invocation);
      adjacency.set(nodeId(row), [...(adjacency.get(nodeId(row)) || []), { target: nodeId(target), row, index }]);
      add("warning", "feature-invocation-deferred", `Feature "${grant.key}" is a fresh source-owned invocation; conditional feature execution remains deferred.`, row, "grants", invocation);
      add("warning", "feature-invocation-deferred", "This reusable feature contains a rule invoked by other features; its conditional execution remains deferred.", target, "description");
    }

    for (const [index, expression] of (row.prerequisites || []).entries()) {
      const normalized = normalizeExpressionObject("prerequisite", expression, { syntaxVersion: 3 });
      for (const diagnostic of normalized.diagnostics) add(diagnostic.severity, diagnostic.code, diagnostic.message, row, "prerequisites", { field: diagnostic.field, expressionIndex: index });
      const alternatives = leaves(expression);
      const hasSupportedAlternative = expression.type === "any" && alternatives.some((rule) => !ruleDeferred(rule));
      for (const prerequisite of alternatives) {
        const indices = { trait: traits, technique: techniques, archetype: archetypes };
        if (indices[prerequisite.type]) requireReference(indices[prerequisite.type], prerequisite.key, { record: row, column: "prerequisites", kind: prerequisite.type });
        if (prerequisite.type === "option") {
          const target = requireScopedChoice(prerequisite.groupKey, row, "prerequisites");
          if (target && target.kind !== "optionGroup") add("error", "invalid-option-reference", `Known-option prerequisite "${prerequisite.groupKey}" must refer to an option group.`, row, "prerequisites");
          if (target) {
            const children = [...featureRows, ...(model.feats || [])].filter((candidate) => candidate.parentKey === prerequisite.groupKey && owner(candidate) === owner(target.record));
            if (prerequisite.count > children.length) add("error", "impossible-option-count", `Known-option count ${prerequisite.count} exceeds the ${children.length} authored options in "${prerequisite.groupKey}".`, row, "prerequisites");
          }
        }
        const status = getExpressionRuntimeStatus("prerequisite", prerequisite, { syntaxVersion: 3 });
        if (needsEquipmentState(prerequisite)) add("warning", hasSupportedAlternative ? "prerequisite-alternative-deferred" : "runtime-prerequisite-deferred", "This alternative requires equipped-weapon or hand state, which canonical saved characters do not yet represent.", row, "prerequisites");
        if (status === "manual") add("warning", hasSupportedAlternative ? "prerequisite-alternative-deferred" : "manual-prerequisite", "Manual prerequisite text is retained but cannot establish eligibility.", row, "prerequisites");
        else if (!["implemented", "compatibility"].includes(status)) add("warning", hasSupportedAlternative ? "prerequisite-alternative-deferred" : "runtime-prerequisite-deferred", `Prerequisite "${prerequisite.type}" has no executable runtime support.`, row, "prerequisites");
      }
    }
  }

  const basicAdjacency = new Map();
  for (const row of model.techniques || []) {
    if (!row.selectionRoutes?.length) add("warning", "unassigned-selection", "Technique selection is unassigned; the complete source row is retained.", row, "selection");
    if (!Number.isInteger(row.rank) || row.rank < 0) add("warning", "incomplete-technique", "Technique rank is not yet assigned.", row, "rank");
    if (row.status && !["playable", "draft", "incomplete"].includes(row.status)) add("error", "invalid-status", `Technique status "${row.status}" is invalid.`, row, "status");
    for (const [index, expression] of array(row.basicAttack).entries()) {
      const normalized = normalizeExpressionObject("basicAttack", expression, { syntaxVersion: 3 });
      for (const diagnostic of normalized.diagnostics) add(diagnostic.severity, diagnostic.code, diagnostic.message, row, "basicAttack", { field: diagnostic.field, expressionIndex: index });
      for (const attack of leaves(expression)) {
        if (attack.type === "technique") {
          requireReference(techniques, attack.key, { record: row, column: "basicAttack", kind: "Basic attack technique" });
          const target = techniques.get(attack.key);
          if (target && target.status !== "playable") add("warning", "draft-record-granted", `Underlying basic attack "${attack.key}" is unfinished.`, row, "basicAttack");
          basicAdjacency.set(row.techniqueKey, [...(basicAdjacency.get(row.techniqueKey) || []), { target: attack.key, row, index }]);
        }
        if (attack.attribute && !["strength", "agility", "intellect", "willpower", "attunement", "heart", "primary", "weapon attribute"].includes(attack.attribute.toLowerCase())) add("error", "invalid-basic-attack-override", `Unknown basic-attack attribute "${attack.attribute}".`, row, "basicAttack");
        if (attack.defense && !["physical", "mental", "spiritual"].includes(attack.defense.toLowerCase())) add("error", "invalid-basic-attack-override", `Unknown basic-attack defense "${attack.defense}".`, row, "basicAttack");
      }
    }
    if (row.basicAttack?.length && row.action?.rollRequired === false && (row.action?.attribute || row.action?.defense)) add("error", "conflicting-basic-attack-roll", "A wrapper with no independent roll must place attribute/defense overrides inside basicAttack.", row, "basicAttack");
  }

  function rejectCycles(edges, code, column) {
    const visited = new Set(), active = new Set(), path = [];
    function visit(key) {
      if (visited.has(key)) return;
      active.add(key); path.push(key);
      for (const edge of edges.get(key) || []) {
        if (active.has(edge.target)) add("error", code, `Reference cycle: ${[...path.slice(path.indexOf(edge.target)), edge.target].join(" -> ")}.`, edge.row, column, { expressionIndex: edge.index });
        else visit(edge.target);
      }
      path.pop(); active.delete(key); visited.add(key);
    }
    for (const key of edges.keys()) visit(key);
  }
  rejectCycles(adjacency, "feature-reference-cycle", "grants");
  rejectCycles(basicAdjacency, "basic-attack-reference-cycle", "basicAttack");
  rejectCycles(parentEdges, "parent-reference-cycle", "parentKey");
  return invocations;
}
