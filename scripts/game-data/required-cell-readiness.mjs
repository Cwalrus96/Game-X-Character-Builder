import { SOURCE_V5_TAB_HEADERS, SOURCE_V5_FIELD_CONTRACTS, SOURCE_V5_ENUM_VALUES } from "./source-v5-schema.mjs";

// A versioned authoring policy preserves earlier v5 snapshots and v4 exports.
export const REQUIRED_CELL_POLICY = "required-cells-v1";
export const usesRequiredCells = (metadata) => metadata?.readinessPolicy === REQUIRED_CELL_POLICY;
const requiredMechanics = new Set([
  "Classes.hpProgression", "Classes.primaryAttributeA", "Classes.primaryAttributeB",
  "Techniques.selection", "Techniques.rank", "Techniques.actionType", "Techniques.actions",
]);
export const REQUIRED_CELL_HEADERS = Object.freeze(Object.fromEntries(Object.entries(SOURCE_V5_TAB_HEADERS)
  .map(([tab, fields]) => [tab, Object.freeze(fields.filter((field) => field !== "status"))])));
export const REQUIRED_CELL_CONTRACTS = Object.freeze(Object.fromEntries(Object.entries(SOURCE_V5_FIELD_CONTRACTS)
  .filter(([key]) => !key.endsWith(".status"))
  .map(([key, contract]) => [key, Object.freeze({ ...contract, requirement: requiredMechanics.has(key) ? "yes"
    : ["Techniques.energyCostKind", "Techniques.energyCost", "Techniques.energyCostOptions"].includes(key) ? "no"
      : contract.requirement })])));
export const REQUIRED_CELL_ENUMS = Object.freeze(Object.fromEntries(Object.entries(SOURCE_V5_ENUM_VALUES)
  .filter(([domain]) => domain !== "status")
  .map(([domain, values]) => [domain, Object.freeze(values.filter((value) => !(domain === "selectionMode" && value === "draft")
    && !(domain === "energyCostKind" && ["unassigned", "unspecified"].includes(value))))])));

const populated = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/** Only declared required cells determine completeness; zero/false are filled. */
export function requiredCellReadiness(tab, row) {
  const missingFields = Object.entries(REQUIRED_CELL_CONTRACTS).filter(([key, contract]) => {
    if (!key.startsWith(`${tab}.`)) return false;
    const field = key.slice(tab.length + 1);
    const required = contract.requirement === "yes"
      || (field === "parentKey" && row.rowType === "OPTION")
      || (field === "chooseCount" && row.rowType === "OPTION_GROUP")
      || (field === "archetypeKey" && row.featType === "archetype" && row.rowType !== "OPTION");
    return required && !populated(row[field]);
  }).map(([key]) => key.slice(tab.length + 1));
  // Archetype names are group-level labels, not a requirement on every member.
  return Object.freeze({ policy: REQUIRED_CELL_POLICY, complete: missingFields.length === 0, missingFields: Object.freeze(missingFields) });
}

export function sourceV5Contract(metadata) {
  return usesRequiredCells(metadata)
    ? { headers: REQUIRED_CELL_HEADERS, fields: REQUIRED_CELL_CONTRACTS, enums: REQUIRED_CELL_ENUMS }
    : { headers: SOURCE_V5_TAB_HEADERS, fields: SOURCE_V5_FIELD_CONTRACTS, enums: SOURCE_V5_ENUM_VALUES };
}
