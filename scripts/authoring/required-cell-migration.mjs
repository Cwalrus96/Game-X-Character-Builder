import { REQUIRED_CELL_POLICY, REQUIRED_CELL_CONTRACTS, REQUIRED_CELL_ENUMS } from "../game-data/required-cell-readiness.mjs";

export const REQUIRED_CELL_README = Object.freeze({
  "Game X canonical structured data": "Authoring schema v5; grant and prerequisite syntax v3. This is the editable game-data source. The importer and Game-X-Data-Display support this format. Source edits do not publish runtime data.",
  "Release behavior": "Export every record. Completeness is derived only from required cells declared in Schema; there is no manually maintained readiness status. Optional descriptions, notes, Energy, and pumping never determine completeness. Acquisition and prerequisites are separate. Validate and review a complete candidate before publishing.",
  Techniques: "TechniqueKey is canonical. Selection accepts skill alternatives separated by comma or OR, granted, tag=Name, or weaponTag=Name. Required cells are techniqueName, techniqueKey, selection, rank, actionType, and actions. Zero is a filled value. Energy fields are optional: blank energyCost means 0 Energy. Pumping exists only when pumpingByRank is explicitly filled. AssociatedSkill is an optional override. Damage owns damage and growth; pumpingByRank preserves every rank and effect. Keep meaningful higher-rank restrictions in rankNotes. Status is retired.",
  "Runtime integration boundary": "The importer accepts source schema v5/syntax v3, including Metadata.readinessPolicy=required-cells-v1, and preserves earlier v5 and v4 compatibility. It derives runtime readiness from Schema required cells without authored status columns. Existing prerequisite, reference, and execution-support checks remain separate. Publication requires a complete validated candidate and explicit approval.",
});
export const REQUIRED_CELL_METADATA = Object.freeze({
  readinessPolicy: REQUIRED_CELL_POLICY,
  exportPolicy: "Retain every record. Derive completeness only from declared required cells; optional cells never determine completeness. Preserve source values and report missing required cells by location. Publication remains a separate reviewed operation.",
  classStatusPolicy: "Classes require classKey, name, hpProgression, primaryAttributeA, and primaryAttributeB. Readiness is derived; no authored status column.",
  originStatusPolicy: "Origins require originKey and name. Readiness is derived; optional narrative and future upgrades never gate selection.",
  compatibility: "Display adapters retain established output positions while authoring status columns are removed. Runtime schema 3 carries derived readiness and execution support. Earlier v5/v4 snapshots remain compatible. Blank Energy defaults to zero; pumping is never inferred.",
});

/** Pure migration of native source rows; no acquisition, writes, or publication. */
export function migrateRequiredCellWorkbook(workbook) {
  const sheets = {};
  for (const [name, sheet] of Object.entries(workbook.sheets)) {
    const headers = sheet.headers.filter((field) => field !== "status");
    const rows = [];
    for (const source of sheet.rows) {
      const row = Object.fromEntries(sheet.headers.map((field, index) => [field, source.values[index] ?? null]));
      if (name === "Schema") {
        if (row.field === "status") continue;
        const key = `${row.tab}.${row.field}`, contract = REQUIRED_CELL_CONTRACTS[key];
        if (contract) {
          row.required = contract.requirement;
          if (contract.type === "enum") row.valuesOrFormat = REQUIRED_CELL_ENUMS[row.field].join("|");
        }
        if (key === "Techniques.energyCost") { row.default = "0"; row.description = "Optional base Energy cost. Blank means 0 Energy; it never blocks playability."; }
        if (key === "Techniques.energyCostKind") { row.default = "fixed"; row.description = "Optional cost shape: fixed, variable, or conditional. Blank uses conditional when explicit alternatives exist, otherwise fixed. Missing Energy is zero; no pumping is inferred."; }
        if (key === "Techniques.energyCostOptions") row.description = "Optional named cost alternatives. Omit when none are authored; blank never blocks playability.";
        if (key === "Techniques.pumpingByRank") row.description = "Optional explicit rank=effect per Energy entries. Blank means no pumping. Preserve every rank, gap, and multi-effect value; missing pumping never blocks playability.";
        if (key === "WeaponEnhancements.selectionMode") row.description = "Acquisition route only: selectable or granted-only. Completeness is derived from required cells; no draft/readiness state.";
      }
      if (name === "Enums") {
        if (row.domain === "status" || (row.domain === "selectionMode" && row.value === "draft") || (row.domain === "energyCostKind" && ["unassigned", "unspecified"].includes(row.value))) continue;
        if (row.domain === "selectionMode") row.meaning = row.value === "selectable" ? "May appear in a normal picker when acquisition and prerequisites pass; no authored readiness state." : "Available through a source-owned grant only; no authored readiness state.";
        if (row.domain === "energyCostKind" && row.value === "fixed") row.meaning = "Exact nonnegative Energy cost; blank energyCost means zero.";
        if (row.domain === "energyCostKind" && row.value === "variable") row.meaning = "Explicit variable cost rule. Blank base Energy means zero; pumping exists only when pumpingByRank is authored.";
        if (row.domain === "energyCostKind" && row.value === "conditional") row.meaning = "Named cost alternatives in energyCostOptions; blank base Energy means zero. No pumping is inferred.";
      }
      if (name === "Techniques" && ["unassigned", "unspecified"].includes(row.energyCostKind)) row.energyCostKind = null;
      if (name === "WeaponEnhancements" && row.selectionMode === "draft") row.selectionMode = "selectable";
      if (name === "README" && REQUIRED_CELL_README[row.section]) row.details = REQUIRED_CELL_README[row.section];
      if (name === "Metadata" && REQUIRED_CELL_METADATA[row.key]) row.value = REQUIRED_CELL_METADATA[row.key];
      rows.push({ rowNumber: source.rowNumber, values: headers.map((field) => row[field] ?? null) });
    }
    if (name === "Metadata" && !rows.some((r) => r.values[0] === "readinessPolicy")) rows.push({ rowNumber: Math.max(1, ...rows.map((r) => r.rowNumber)) + 1, values: ["readinessPolicy", REQUIRED_CELL_POLICY] });
    sheets[name] = { ...sheet, headers, rows };
  }
  return { ...workbook, sheets };
}
