import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_DATA_DIRECTORY = fileURLToPath(
  new URL("../public/data/game-x/", import.meta.url),
);

export const PRODUCTION_EXPORT_STATUS = "frozen";

function isSameOrNestedPath(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertGameDataExportTargetAllowed(outDir, {
  productionDataDirectory = PRODUCTION_DATA_DIRECTORY,
} = {}) {
  if (!outDir) throw new Error("An export output directory is required.");
  if (PRODUCTION_EXPORT_STATUS !== "frozen") return;
  if (!isSameOrNestedPath(outDir, productionDataDirectory)) return;

  throw new Error(
    "Production game-data export is frozen until Work Package B adds full workbook validation. "
    + "Export to a staging directory for inspection; do not overwrite public/data/game-x.",
  );
}
