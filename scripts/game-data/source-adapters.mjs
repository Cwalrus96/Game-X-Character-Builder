import { adaptGameDataWorkbook as adaptV4, SOURCE_TAB_HEADERS } from "./source-v4.mjs";
import { adaptSchemaV5Workbook } from "./source-v5.mjs";

export { SOURCE_TAB_HEADERS };
export { SOURCE_V5_TAB_HEADERS } from "./source-v5-schema.mjs";

/** Select a declared contract before interpreting source-specific fields. */
export function adaptGameDataWorkbook(workbook) {
  const metadata = workbook?.sheets?.Metadata;
  const keyColumn = metadata?.headers?.indexOf("key") ?? -1;
  const valueColumn = metadata?.headers?.indexOf("value") ?? -1;
  const versions = (metadata?.rows || [])
    .filter((row) => row.values[keyColumn] === "sourceSchemaVersion")
    .map((row) => String(row.values[valueColumn] ?? "").trim());
  if (versions.length === 1 && versions[0] === "5") return adaptSchemaV5Workbook(workbook);
  const result = adaptV4(workbook);
  if (!versions.length || versions.every((version) => version === "4")) return result;
  return Object.freeze({
    ...result,
    ok: false,
    diagnostics: Object.freeze([...result.diagnostics, Object.freeze({
      severity: "error", code: "unsupported-source-version",
      message: `Source schema version must resolve uniquely to 4 or 5; received ${versions.join(", ")}.`,
      sheet: "Metadata", row: null, column: "value", cell: null,
    })]),
  });
}
