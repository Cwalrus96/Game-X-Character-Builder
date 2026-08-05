import * as XLSX from "xlsx/xlsx.mjs";

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function isBlankRow(values) {
  return values.every((value) => text(value) === "");
}

/**
 * Opens XLSX bytes into a domain-neutral row model. This function performs no
 * file I/O and deliberately leaves header meaning to downstream adapters.
 */
export function readWorkbookBytes(bytes) {
  const input = bytes instanceof Uint8Array
    ? bytes
    : bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : null;
  if (!input || input.byteLength === 0) {
    throw new TypeError("Workbook input must be a non-empty Uint8Array or ArrayBuffer.");
  }

  let workbook;
  try {
    workbook = XLSX.read(input.slice(), {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      dense: true,
    });
  } catch (error) {
    throw new Error("Workbook bytes are not a readable XLSX workbook.", { cause: error });
  }

  const sheetNames = Array.isArray(workbook.SheetNames) ? [...workbook.SheetNames] : [];
  if (!sheetNames.length) throw new Error("Workbook contains no readable sheets.");

  const sheets = {};
  for (const name of sheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const headers = (matrix[0] || []).map(text);
    const rows = [];
    for (let index = 1; index < matrix.length; index += 1) {
      const values = Array.from({ length: Math.max(headers.length, matrix[index]?.length || 0) }, (_, column) => (
        matrix[index]?.[column] ?? null
      ));
      if (isBlankRow(values)) continue;
      rows.push(Object.freeze({ rowNumber: index + 1, values: Object.freeze(values) }));
    }
    sheets[name] = Object.freeze({ name, headers: Object.freeze(headers), rows: Object.freeze(rows) });
  }

  return Object.freeze({ sheetNames: Object.freeze(sheetNames), sheets: Object.freeze(sheets) });
}
