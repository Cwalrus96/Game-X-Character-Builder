const STEP_OWNED_PATHS = Object.freeze({
  class: Object.freeze([
    "builder.classKey",
    "builder.level",
    "builder.primaryAttribute",
    "builder.selectedClassFeatureOptions",
    "builder.selectedFeats",
    "builder.selectedFeatOptions",
    "builder.grantChoices",
    "builder.traitChoices",
    "builder.traitActivations",
  ]),
  attributes: Object.freeze([
    "builder.attributes",
  ]),
  origin: Object.freeze([
    "builder.originKey",
    "builder.originKeystone",
    "builder.traitChoices",
    "builder.traitActivations",
  ]),
  skills: Object.freeze([
    "builder.selectedClassUtilitySkills",
    "builder.sheet.fields",
    "builder.sheet.repeatables",
  ]),
  equipment: Object.freeze([
    "builder.weapons",
  ]),
  techniques: Object.freeze([
    "builder.selectedTechniques",
  ]),
  "bonds-keystones": Object.freeze([
    "builder.bonds",
    "builder.backgroundKeystones",
  ]),
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pathIsWithin(path, ownedPath) {
  return path === ownedPath || path.startsWith(`${ownedPath}.`);
}

export function getBuilderStepOwnedPaths(stepId) {
  return STEP_OWNED_PATHS[text(stepId)] || Object.freeze([]);
}

export function impactBelongsToBuilderStep(impact, stepId) {
  const path = text(impact?.path);
  if (!path) return false;
  return getBuilderStepOwnedPaths(stepId).some((ownedPath) => pathIsWithin(path, ownedPath));
}

export function getBuilderStepInformationalMessages(reconciliation, stepId) {
  const impacts = Array.isArray(reconciliation?.impacts) ? reconciliation.impacts : [];
  const nodes = new Map((reconciliation?.graph?.nodes || []).map((node) => [node.id, node]));
  return Object.freeze([...new Set(
    impacts
      .filter((impact) => impact?.category === "informational")
      .filter((impact) => {
        if (text(impact.path).startsWith("builder.grantChoices.")) {
          const sourceId = nodes.get(impact.nodeId)?.sourceOwnerId || "";
          if (/^origin(?:-feature)?:/.test(sourceId)) return stepId === "origin";
        }
        return impactBelongsToBuilderStep(impact, stepId);
      })
      .map((impact) => text(impact?.message || impact?.code))
      .filter(Boolean),
  )]);
}
