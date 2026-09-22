import test from "node:test";
import assert from "node:assert/strict";
import { VALID_SCHEMA_V5_RECORDS, buildSchemaV5Workbook } from "./fixtures/game-data-schema-v5.mjs";
import { REQUIRED_CELL_POLICY, REQUIRED_CELL_HEADERS, REQUIRED_CELL_CONTRACTS, REQUIRED_CELL_ENUMS, requiredCellReadiness } from "../scripts/game-data/required-cell-readiness.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";
import { buildGameDataArtifacts } from "../scripts/game-data/artifact-builder.mjs";
import { isGameDataRecordExecutable as isRecordRuntimeReady, getTechniqueSelectionState } from "../public/js/core/selection-rules.js";
import { migrateRequiredCellWorkbook } from "../scripts/authoring/required-cell-migration.mjs";

function fixture(change = () => {}) {
  const records = structuredClone(VALID_SCHEMA_V5_RECORDS);
  records.Metadata.push({ key: "readinessPolicy", value: REQUIRED_CELL_POLICY });
  records.Schema = Object.entries(REQUIRED_CELL_CONTRACTS).map(([key, contract]) => ({
    tab: key.split(".")[0], field: key.split(".")[1], type: contract.type, required: contract.requirement,
    valuesOrFormat: contract.type === "enum" ? "see Enums" : "", description: key,
  }));
  records.Enums = Object.entries(REQUIRED_CELL_ENUMS).flatMap(([domain, values]) => values.map((value) => ({ domain, value, meaning: value })));
  change(records);
  const adapted = adaptGameDataWorkbook(buildSchemaV5Workbook({ records, headers: REQUIRED_CELL_HEADERS }));
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics.filter((x) => x.severity === "error")));
  return { adapted, validation, artifacts: buildGameDataArtifacts({ model: adapted.model, validation, provenance: {} }) };
}

test("required-cell policy derives readiness with no authored status and retains incomplete rows", () => {
  const { adapted, artifacts } = fixture();
  assert.equal(adapted.model.classes[0].status, "playable");
  assert.equal(adapted.model.classes[1].status, "incomplete");
  assert.deepEqual(adapted.model.classes[1].readiness.missingFields, ["hpProgression", "primaryAttributeA", "primaryAttributeB"]);
  assert.equal(artifacts.combined.techniques[2].status, "incomplete");
  assert.equal(Object.hasOwn(adapted.model.techniques[0].sourceValues, "status"), false);
});

test("blank optional content and editorial TODO wording never determine readiness", () => {
  const { artifacts } = fixture((r) => {
    r.Techniques[0].description = "TODO: revise wording";
    r.Techniques[0].damage = "";
    r.Feats[0].description = "";
    r.Feats[0].grants = "";
    r.Traits[0].description = "";
    r.Traits[0].grants = "";
    r.Traits[0].techniqueKeys = "";
    r.Traits[0].rank = "";
  });
  for (const record of [artifacts.combined.techniques[0], artifacts.combined.feats[0], artifacts.combined.traits[0]]) {
    assert.equal(isRecordRuntimeReady(record), true);
  }
});

test("blank Energy defaults to zero and absent pumping never invents pumping", () => {
  for (const kind of ["", "fixed", "variable", "conditional"]) {
    const { adapted, artifacts } = fixture((r) => {
      Object.assign(r.Techniques[0], { energyCostKind: kind, energyCost: "", pumpingByRank: "", prerequisites: "" });
    });
    const technique = artifacts.combined.techniques[0];
    assert.equal(technique.energyCost, 0);
    assert.equal(technique.pumpable, false);
    assert.equal(isRecordRuntimeReady(technique), true);
    assert.equal(adapted.model.techniques[0].sourceValues.energyCost, "");
    assert.equal(getTechniqueSelectionState(technique, { knownCombatSkills: new Set(["Melee Weapons"]), skillRanks: { "Melee Weapons": 1 } }).eligible, true);
  }
});

test("explicit Energy and pumping maps survive independently, including gaps and multiple effects", () => {
  const { artifacts } = fixture();
  const t = artifacts.combined.techniques[0];
  assert.equal(t.energyCost, 2);
  assert.equal(t.pumpable, true);
  assert.deepEqual(t.pumpingByRank, { 1: "+1 damage per Energy", 3: "+2 ward per Energy", 4: "+2 ward per Energy" });
});

test("required zero-valued actions/rank are present; blank required fields block readiness", () => {
  const row = { techniqueKey: "reaction", techniqueName: "Reaction", selection: "granted", rank: 0, actionType: "Reaction", actions: 0 };
  assert.equal(requiredCellReadiness("Techniques", row).complete, true);
  for (const field of ["techniqueKey", "techniqueName", "selection", "rank", "actionType", "actions"]) {
    assert.deepEqual(requiredCellReadiness("Techniques", { ...row, [field]: " " }).missingFields, [field]);
  }
  assert.deepEqual(requiredCellReadiness("ClassFeatures", { classKey: "test", featureKey: "group", name: "Group", rowType: "OPTION_GROUP" }).missingFields, ["chooseCount"]);
});

test("grant-only acquisition and unsupported execution remain separate from cell completeness", () => {
  const { artifacts, validation } = fixture((r) => { r.WeaponEnhancements[0].selectionMode = "granted-only"; });
  assert.equal(artifacts.combined.weaponEnhancements[0].selectable, false);
  assert.equal(artifacts.combined.weaponEnhancements[0].status, "playable");
  assert.equal(validation.runtimeSupportBySource["ClassFeatures:2"].status, "deferred");
});

test("historical v5 snapshots retain explicit-status compatibility", () => {
  const result = adaptGameDataWorkbook(buildSchemaV5Workbook());
  assert.equal(result.ok, true);
  assert.equal(result.model.techniques[2].status, "incomplete");
  assert.equal(result.model.techniques[2].readiness, undefined);
});

test("source migration removes readiness fields while preserving mechanics and acquisition", () => {
  const original = buildSchemaV5Workbook();
  const snapshot = structuredClone(original);
  const migrated = migrateRequiredCellWorkbook(original);
  const adapted = adaptGameDataWorkbook(migrated);
  const validation = validateAdaptedGameData(adapted);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  assert.deepEqual(original, snapshot);
  for (const tab of ["Classes", "Techniques", "Origins"]) assert.equal(migrated.sheets[tab].headers.includes("status"), false);
  assert.equal(adapted.model.techniques[0].action.energyCost.value, 2);
  assert.equal(adapted.model.techniques[1].selectionMode, "granted-only");
  assert.deepEqual(adapted.model.techniques[0].pumpingByRank, { 1: "+1 damage per Energy", 3: "+2 ward per Energy", 4: "+2 ward per Energy" });
});

test("required-cell policy and Schema cannot silently disagree", () => {
  const migrated = structuredClone(migrateRequiredCellWorkbook(buildSchemaV5Workbook()));
  const schema = migrated.sheets.Schema;
  const entry = schema.rows.find(r => r.values[0] === "Techniques" && r.values[1] === "energyCost");
  entry.values[schema.headers.indexOf("required")] = "yes";
  assert.equal(adaptGameDataWorkbook(migrated).ok, false);
  assert.ok(adaptGameDataWorkbook(migrated).diagnostics.some(d => d.code === "schema-requirement-mismatch"));
});

test("explicit conditional costs retain their named alternatives with a zero default base", () => {
  for (const kind of ["conditional", ""]) {
    const { artifacts } = fixture(r => Object.assign(r.Techniques[0], {
      energyCost: "", energyCostKind: kind, energyCostOptions: "guard=0; strike=3", pumpingByRank: "",
    }));
    const t = artifacts.combined.techniques[0];
    assert.equal(t.energyCost, 0);
    assert.equal(t.energyCostKind, "conditional");
    assert.deepEqual(t.energyCostOptions, [{ key: "guard", value: 0 }, { key: "strike", value: 3 }]);
    assert.equal(t.pumpable, false);
  }
});

test("invalid populated optional costs remain diagnostics rather than becoming free", () => {
  const migrated = structuredClone(migrateRequiredCellWorkbook(buildSchemaV5Workbook()));
  const sheet = migrated.sheets.Techniques;
  sheet.rows[0].values[sheet.headers.indexOf("energyCost")] = "not a cost";
  const result = adaptGameDataWorkbook(migrated);
  assert.equal(result.ok, false);
  assert.equal(result.model.techniques[0].action.energyCost.value, null);
});
