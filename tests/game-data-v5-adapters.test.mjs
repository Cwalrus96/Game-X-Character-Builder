import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx/xlsx.mjs";
import { adaptGameDataWorkbook, SOURCE_V5_TAB_HEADERS } from "../scripts/game-data/source-adapters.mjs";
import { readWorkbookBytes } from "../scripts/game-data/workbook-reader.mjs";
import { canonicalTagKey } from "../scripts/game-data/source-v5-values.mjs";
import { buildSchemaV5Workbook, VALID_SCHEMA_V5_RECORDS } from "./fixtures/game-data-schema-v5.mjs";
import { buildSchemaV4Workbook } from "./fixtures/game-data-schema-v4.mjs";

const adapt = (records = VALID_SCHEMA_V5_RECORDS, options = {}) => adaptGameDataWorkbook(buildSchemaV5Workbook({ records, ...options }));
const assertOk = (result) => assert.equal(result.ok, true, JSON.stringify(result.diagnostics));

test("v5 preserves the 13-tab contract and v4 retains its existing normalized model", () => {
  const result = adapt();
  assertOk(result);
  assert.equal(result.model.schema.length, 115);
  assert.equal(Object.keys(result.model.sourceSheets).length, 13);
  assert.equal(result.model.weaponProfiles.length, 0);
  assert.equal(result.model.traits[0].traitKey, "wings");
  const old = adaptGameDataWorkbook(buildSchemaV4Workbook());
  assertOk(old);
  assert.equal(old.model.metadata.sourceSchemaVersion, 4);
  assert.equal(old.model.schema.length, 152);
  assert.equal(old.model.weaponProfiles.length, 1);
  assert.equal(Object.hasOwn(old.model, "traits"), false);
});

test("v5 survives reordered headers and the native XLSX reader", () => {
  const source = buildSchemaV5Workbook({ headers: { Techniques: [...SOURCE_V5_TAB_HEADERS.Techniques].reverse() } });
  const workbook = XLSX.utils.book_new();
  for (const [name, sheet] of Object.entries(source.sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows.map((row) => row.values)]), name);
  }
  const result = adaptGameDataWorkbook(readWorkbookBytes(XLSX.write(workbook, { type: "array", bookType: "xlsx" })));
  assertOk(result);
  assert.equal(result.model.techniques[0].techniqueKey, "shared-strike");
  assert.equal(result.model.techniques[0].action.strainCost, 1);
  assert.deepEqual(result.model.techniques[0].source.headers, [...SOURCE_V5_TAB_HEADERS.Techniques].reverse());
});

test("all three class fields produce distinct ordered roles and preserve conditional progression", () => {
  const result = adapt();
  assertOk(result);
  const rows = result.model.classSkills;
  assert.deepEqual(rows.filter((row) => row.role === "combat-technique").map((row) => [row.skillKey, row.progression, row.whenPrimaryAttribute]), [
    ["melee-weapons", "fast", "Strength"], ["melee-weapons", "medium", "Agility"],
    ["ranged-weapons", "medium", "Strength"], ["ranged-weapons", "fast", "Agility"],
  ]);
  assert.deepEqual(rows.filter((row) => row.role === "combat-defense").map((row) => row.skillKey), ["mental-defense", "physical-defense", "spiritual-defense"]);
  assert.deepEqual(rows.filter((row) => row.role === "utility-option").map((row) => [row.skillName, row.choiceGroup, row.displayOrder]), [
    ["Athletics", "starting-utility", 8], ["Society", "starting-utility", 9],
  ]);
  assert.equal(result.model.classes[1].status, "incomplete");
  assert.equal(result.model.classes[1].hpProgression, null);
  assert.equal(result.model.classes[0].authoringSkills.combatSkills, VALID_SCHEMA_V5_RECORDS.Classes[0].combatSkills);
});

test("readiness, acquisition, roll overrides, effects and legacy skill identity remain independent", () => {
  const result = adapt();
  assertOk(result);
  const [strike, wing, unfinished] = result.model.techniques;
  assert.deepEqual(strike.selectionRoutes, [
    { type: "skill", name: "Melee Weapons", skillKey: "melee-weapons" },
    { type: "skill", name: "Ranged Weapons", skillKey: "ranged-weapons" },
  ]);
  assert.equal(strike.prerequisites[0].type, "any");
  assert.equal(strike.basicAttack[0].type, "weapon");
  assert.equal(strike.basicAttack[0].attribute, "Primary");
  assert.equal(strike.action.rollRequired, false);
  assert.equal(strike.action.onCriticalFailure, "Lose your footing.");
  assert.equal(strike.action.energyCost.value, 2);
  assert.deepEqual(strike.pumpingByRank, { 1: "+1 damage per Energy", 3: "+2 ward per Energy", 4: "+2 ward per Energy" });
  assert.equal(strike.sourceValues.pumpingByRank, VALID_SCHEMA_V5_RECORDS.Techniques[0].pumpingByRank);
  assert.equal(wing.selectable, false);
  assert.equal(wing.selectionMode, "granted-only");
  assert.equal(wing.associatedSkill, "Targeting");
  assert.equal(wing.associatedSkillKey, "ranged-weapons");
  assert.equal(unfinished.status, "incomplete");
  assert.equal(unfinished.selectable, false);
  assert.equal(unfinished.rank, null);
  assert.equal(unfinished.action.energyCost.value, null);
});

test("provider relations preserve explicit recipient grants and classification tags do not become acquired tags", () => {
  const result = adapt();
  assertOk(result);
  assert.deepEqual(result.model.classFeatures[0].traitKeys, ["wings"]);
  assert.deepEqual(result.model.classFeatures[1].grants[0], { type: "feature", key: "canonical-rule" });
  assert.equal(result.model.originFeatures[1].grants[0].recipientRef, "artifact");
  assert.equal(result.model.originFeatures[1].grants[0].rank, 1);
  assert.deepEqual(result.model.traits[0].tagKeys, ["anatomy", "natural-weapon"]);
  assert.deepEqual(result.model.traits[0].grants.map((grant) => [grant.tag, grant.minRank]), [["Wings", 1], ["Flight", 2]]);
  assert.equal(result.model.feats[0].archetypeKey, "weapon-path");
  assert.equal(result.model.weaponBases[0].traitsText, "Retain a special weapon trait.");
  assert.deepEqual(result.model.weaponBases[0].techniqueKeys, ["shared-strike"]);
  assert.equal(canonicalTagKey("Reach 2"), "reach=2");
});

test("invalid v5 cells retain rows and exact authored values with physical cell diagnostics", () => {
  const records = { ...VALID_SCHEMA_V5_RECORDS, Techniques: [{
    ...VALID_SCHEMA_V5_RECORDS.Techniques[0], techniqueKey: "", rank: "first",
    pumpingByRank: "1=+1 ward per Energy;1=+2 ward per Energy;bad",
    selection: "tag= | unusual=value", basicAttack: "technique | mystery=missing",
  }] };
  const result = adapt(records);
  assert.equal(result.ok, false);
  assert.equal(result.model.techniques.length, 1);
  assert.equal(result.model.techniques[0].sourceValues.rank, "first");
  assert.equal(result.model.techniques[0].pumpingByRankRaw, records.Techniques[0].pumpingByRank);
  assert(result.diagnostics.some((item) => item.code === "required-cell" && item.cell === "B2"));
  assert(result.diagnostics.some((item) => item.code === "invalid-integer" && item.cell === "E2"));
  assert(result.diagnostics.some((item) => item.code === "duplicate-rank" && item.cell === "Y2"));
  assert(result.diagnostics.some((item) => item.column === "basicAttack" && item.cell === "AE2"));
});

test("unknown readiness and symbolic cost stay unavailable and are preserved without defaults", () => {
  const records = { ...VALID_SCHEMA_V5_RECORDS, Techniques: [{
    ...VALID_SCHEMA_V5_RECORDS.Techniques[2], status: "", selection: "", energyCost: "X",
  }] };
  const result = adapt(records);
  assertOk(result);
  const row = result.model.techniques[0];
  assert.equal(row.status, null);
  assert.equal(row.selectable, false);
  assert.deepEqual(row.selectionRoutes, []);
  assert.equal(row.action.energyCost.value, null);
  assert.equal(row.sourceValues.energyCost, "X");
  assert(result.diagnostics.some((item) => item.code === "unresolved-number" && item.severity === "warning"));
  assert(result.diagnostics.some((item) => item.code === "unresolved-readiness" && item.cell === "AA2"));
});

test("unknown versions, undeclared columns and missing schema declarations fail without losing source evidence", () => {
  const versioned = { ...VALID_SCHEMA_V5_RECORDS, Metadata: [{ key: "sourceSchemaVersion", value: 9 }] };
  assert(adapt(versioned).diagnostics.some((item) => item.code === "unsupported-source-version"));
  const records = { ...VALID_SCHEMA_V5_RECORDS, Schema: VALID_SCHEMA_V5_RECORDS.Schema.filter((row) => row.field !== "basicAttack") };
  assert(adapt(records).diagnostics.some((item) => item.code === "missing-schema-declaration" && /basicAttack/.test(item.message)));
  const headers = { Techniques: [...SOURCE_V5_TAB_HEADERS.Techniques, "unknownMechanic"] };
  const extra = { ...VALID_SCHEMA_V5_RECORDS, Techniques: [{ ...VALID_SCHEMA_V5_RECORDS.Techniques[0], unknownMechanic: "Keep this value" }] };
  const result = adapt(extra, { headers });
  assert.equal(result.ok, false);
  assert.equal(result.model.techniques[0].sourceValues.unknownMechanic, "Keep this value");
  assert(result.diagnostics.some((item) => item.code === "unknown-header" && item.cell === "AF1"));
});

test("Schema types, required conditions, enum formats/defaults and Enums must agree with implemented v5", () => {
  const records = {
    ...VALID_SCHEMA_V5_RECORDS,
    Schema: VALID_SCHEMA_V5_RECORDS.Schema.map((row) => row.tab === "Techniques" && row.field === "status"
      ? { ...row, type: "enum", required: "no", valuesOrFormat: "playable|maybe", default: "maybe" }
      : row.tab === "Traits" && row.field === "rank" ? { ...row, type: "text" } : row),
    Enums: [
      ...VALID_SCHEMA_V5_RECORDS.Enums.filter((row) => !(row.domain === "selection" && row.value === "weaponTag=Name")),
      { domain: "status", value: "playable", meaning: "" },
      { domain: "status", value: "maybe", meaning: "Unsupported." },
    ],
  };
  const result = adapt(records);
  assert.equal(result.ok, false);
  for (const code of ["schema-type-mismatch", "schema-requirement-mismatch", "schema-enum-mismatch", "schema-default-mismatch",
    "missing-enum-value", "duplicate-enum-value", "unknown-enum-value", "missing-enum-meaning"]) {
    assert(result.diagnostics.some((entry) => entry.code === code), code);
  }
  assert.equal(result.model.techniques.length, 3);
  assert.equal(result.model.schema.find((row) => row.tab === "Traits" && row.field === "rank").type, "text");
});

test("v5 declares the Trait grant enum and preserves its complete normalized provider fields", () => {
  const records = structuredClone(VALID_SCHEMA_V5_RECORDS);
  records.OriginFeatures[0].grants = "trait | traitKey=wings | rank=1";
  const result = adapt(records);
  assertOk(result);
  assert.equal(result.model.originFeatures[0].grants[0].type, "trait");
  assert.deepEqual(result.model.originFeatures[0].grants[0], { type: "trait", key: "wings", rank: 1, count: 1 });
  records.Enums = records.Enums.filter(row => !(row.domain === "grantType" && row.value === "trait"));
  const missing = adapt(records);
  assert.equal(missing.ok, false);
  assert(missing.diagnostics.some(item => item.code === "missing-enum-value" && /trait/.test(item.message)));
  assert.equal(missing.model.originFeatures[0].grants[0].type, "trait");
});
