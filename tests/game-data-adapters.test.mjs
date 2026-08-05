import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx/xlsx.mjs";

import { adaptGameDataWorkbook, SOURCE_TAB_HEADERS } from "../scripts/game-data/source-adapters.mjs";
import { readWorkbookBytes } from "../scripts/game-data/workbook-reader.mjs";
import {
  buildSchemaV4Workbook,
  VALID_SCHEMA_V4_RECORDS,
} from "./fixtures/game-data-schema-v4.mjs";

test("domain-neutral workbook reader preserves headers, raw values, and source row numbers", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["stableKey", "count", "enabled"],
    ["fixture", 2, "Y"],
    [null, null, null],
    ["second", 3, "N"],
  ]), "Example");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

  const result = readWorkbookBytes(bytes);
  assert.deepEqual(result.sheetNames, ["Example"]);
  assert.deepEqual(result.sheets.Example.headers, ["stableKey", "count", "enabled"]);
  assert.deepEqual(result.sheets.Example.rows.map((row) => row.rowNumber), [2, 4]);
  assert.deepEqual(result.sheets.Example.rows[0].values, ["fixture", 2, "Y"]);
});

test("schema-v4 adapters produce a canonical model for every source tab", () => {
  const result = adaptGameDataWorkbook(buildSchemaV4Workbook());
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));

  const expectedCollections = {
    classes: "Classes",
    classSkills: "ClassSkills",
    classFeatures: "ClassFeatures",
    techniques: "Techniques",
    feats: "Feats",
    origins: "Origins",
    originFeatures: "OriginFeatures",
    weaponBases: "WeaponBases",
    weaponProfiles: "WeaponProfiles",
    weaponEnhancements: "WeaponEnhancements",
  };
  for (const [modelKey, tab] of Object.entries(expectedCollections)) {
    assert.equal(result.model[modelKey].length, VALID_SCHEMA_V4_RECORDS[tab].length, tab);
  }

  assert.equal(result.model.metadata.sourceSchemaVersion, 4);
  assert.equal(result.model.classes[0].classKey, "ninja");
  assert.equal(result.model.classes[0].selectable, true);
  assert.deepEqual(result.model.classes[0].primaryAttributes, ["Agility", "Mind"]);
  assert.equal(result.model.classSkills[0].classKey, "ninja");
  assert.equal(result.model.classFeatures[0].kind, "feature");
  assert.equal(result.model.classFeatures[0].grants[0].key, "stalk-prey");
  assert.equal(result.model.techniques[0].techniqueKey, "stalk-prey");
  assert.deepEqual(result.model.techniques[0].tagKeys, ["focus", "utility"]);
  assert.deepEqual(result.model.techniques[0].action.energyCost, { kind: "fixed", value: 2, options: [] });
  assert.deepEqual(result.model.techniques[0].damageByRank, { 0: "1 + Hits", 1: "2 + Hits" });
  assert.equal(result.model.origins[0].questions.length, 2);
  assert.equal(result.model.weaponBases[0].weaponKey, "long_blade");
  assert.equal(result.model.weaponEnhancements[0].selectable, true);
});

test("an in-memory schema-v4 XLSX flows through the reader into the adapters", () => {
  const source = buildSchemaV4Workbook();
  const xlsx = XLSX.utils.book_new();
  for (const name of source.sheetNames) {
    const sheet = source.sheets[name];
    XLSX.utils.book_append_sheet(
      xlsx,
      XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows.map((row) => row.values)]),
      name,
    );
  }
  const bytes = XLSX.write(xlsx, { type: "array", bookType: "xlsx" });
  const result = adaptGameDataWorkbook(readWorkbookBytes(bytes));

  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.model.schema.length, 152);
  assert.equal(result.model.techniques[0].techniqueKey, "stalk-prey");
  assert.equal(result.model.weaponProfiles[0].weaponKey, "long_blade");
});

test("nested rows retain explicit owners and parents without row-order inference", () => {
  const option = {
    classKey: "ninja", level: 2, rowType: "OPTION", featureKey: "silent-step", name: "Silent Step",
    parentKey: "shadow-path", description: "Move without sound.",
  };
  const group = {
    classKey: "ninja", level: 2, rowType: "OPTION_GROUP", featureKey: "shadow-path", name: "Shadow Path",
    description: "Choose a path.", chooseCount: 1,
  };
  const records = { ...VALID_SCHEMA_V4_RECORDS, ClassFeatures: [option, group] };
  const result = adaptGameDataWorkbook(buildSchemaV4Workbook({ records }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.model.classFeatures.map((row) => row.featureKey), ["silent-step", "shadow-path"]);
  assert.equal(result.model.classFeatures[0].classKey, "ninja");
  assert.equal(result.model.classFeatures[0].parentKey, "shadow-path");
  assert.equal(result.model.classFeatures[0].kind, "option");
  assert.equal(result.model.classFeatures[1].kind, "optionGroup");
});

test("strict headers and malformed populated rows produce source-located diagnostics without dropping rows", () => {
  const malformedTechnique = {
    ...VALID_SCHEMA_V4_RECORDS.Techniques[0],
    techniqueKey: "",
    rank: "first",
    prerequisites: "class | mystery=value",
    damageByRank: "not-a-map",
  };
  const records = { ...VALID_SCHEMA_V4_RECORDS, Techniques: [malformedTechnique] };
  const malformed = adaptGameDataWorkbook(buildSchemaV4Workbook({ records }));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.model.techniques.length, 1);
  assert.equal(malformed.model.techniques[0].source.row, 2);
  assert(malformed.diagnostics.some((item) => item.code === "required-cell" && item.column === "techniqueKey"));
  assert(malformed.diagnostics.some((item) => item.code === "invalid-integer" && item.column === "rank"));
  assert(malformed.diagnostics.some((item) => item.code === "expression-unknown-field" && item.column === "prerequisites"));
  assert(malformed.diagnostics.some((item) => item.code === "invalid-rank-map" && item.cell === "Y2"));

  const wrongHeaders = [...SOURCE_TAB_HEADERS.Classes];
  wrongHeaders[0] = "className";
  const headerResult = adaptGameDataWorkbook(buildSchemaV4Workbook({ headers: { Classes: wrongHeaders } }));
  assert.equal(headerResult.ok, false);
  assert.equal(headerResult.model.classes.length, 0);
  assert(headerResult.diagnostics.some((item) => item.code === "header-mismatch" && item.sheet === "Classes"));
});

test("missing contract tabs and schema declarations are reported deterministically", () => {
  const missingSheet = adaptGameDataWorkbook(buildSchemaV4Workbook({ omit: ["WeaponProfiles"] }));
  assert.equal(missingSheet.ok, false);
  assert.deepEqual(missingSheet.diagnostics.filter((item) => item.code === "missing-sheet").map((item) => item.sheet), ["WeaponProfiles"]);

  const records = {
    ...VALID_SCHEMA_V4_RECORDS,
    Schema: VALID_SCHEMA_V4_RECORDS.Schema.filter((row) => !(row.tab === "Classes" && row.field === "classKey")),
  };
  const missingDeclaration = adaptGameDataWorkbook(buildSchemaV4Workbook({ records }));
  assert(missingDeclaration.diagnostics.some((item) => item.code === "missing-schema-declaration" && /Classes\.classKey/.test(item.message)));
});

test("reader and adapters stay pure and separate from artifact writing", () => {
  const reader = fs.readFileSync(new URL("../scripts/game-data/workbook-reader.mjs", import.meta.url), "utf8");
  const adapters = fs.readFileSync(new URL("../scripts/game-data/source-adapters.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(reader, /node:fs|process\.exit|game-data-expressions/);
  assert.doesNotMatch(adapters, /node:fs|process\.exit|xlsx/);
});
