import assert from "node:assert/strict";
import test from "node:test";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { validateAdaptedGameData, validateGameDataModel } from "../scripts/game-data/model-validator.mjs";
import { buildSchemaV5Workbook, VALID_SCHEMA_V5_RECORDS } from "./fixtures/game-data-schema-v5.mjs";

const adapted = () => adaptGameDataWorkbook(buildSchemaV5Workbook());
const model = () => structuredClone(adapted().model);

test("v5 preserves incomplete content and explicitly defers unimplemented ownership", () => {
  const input = adapted();
  const before = JSON.stringify(input.model);
  const result = validateAdaptedGameData(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(JSON.stringify(input.model), before);
  assert.equal(result.runtimeSupportBySource["Techniques:4"].status, "deferred");
  assert.equal(result.runtimeSupportBySource["Traits:2"].status, "deferred");
  assert.equal(result.runtimeSupportBySource["OriginFeatures:3"].status, "deferred");
  assert.equal(result.runtimeSupportBySource["ClassFeatures:2"].status, "deferred");
  assert.equal(result.featureInvocations[0].ownership, "fresh-invocation");
  assert.equal(result.featureInvocations[0].inheritTargetPlacement, false);
});

test("v5 malformed stable references stay errors at the actual reordered source cell", () => {
  const records = structuredClone(VALID_SCHEMA_V5_RECORDS);
  records.Traits[0].prerequisites = "trait | traitKey=missing";
  records.Traits[0].techniqueKeys = "missing-attack";
  const original = buildSchemaV5Workbook();
  const headers = { Traits: ["prerequisites", ...original.sheets.Traits.headers.filter((field) => field !== "prerequisites")] };
  const result = validateAdaptedGameData(adaptGameDataWorkbook(buildSchemaV5Workbook({ records, headers })));
  assert.equal(result.ok, false);
  assert(result.diagnostics.some((item) => item.code === "unresolved-reference" && item.cell === "A2" && item.sheet === "Traits"));
  assert(result.diagnostics.some((item) => item.code === "unresolved-reference" && item.column === "techniqueKeys"));
});

test("v5 validates feature scope, fresh invocation identity, and indirect cycles", () => {
  const input = model();
  const first = input.classFeatures[0], repeated = input.classFeatures[1];
  repeated.grants.push({ type: "feature", key: first.featureKey });
  const valid = validateGameDataModel(input);
  assert.equal(new Set(valid.featureInvocations.map((item) => item.invocationId)).size, 2);
  first.grants = [{ type: "feature", key: repeated.featureKey }];
  assert(validateGameDataModel(input).diagnostics.some((item) => item.code === "feature-reference-cycle"));
  first.grants = [];
  first.classKey = "unfinished";
  assert(validateGameDataModel(input).diagnostics.some((item) => item.code === "feature-scope-mismatch"));
});

test("recipient references must resolve to an owner-local bond, never to character skills", () => {
  const input = model();
  input.originFeatures[1].grants[0].recipientRef = "missing";
  assert(validateGameDataModel(input).diagnostics.some((item) => item.code === "unresolved-recipient-reference"));
  input.originFeatures[1].grants[0].recipientRef = "artifact";
  input.originFeatures[0].grants[0].type = "skill";
  assert(validateGameDataModel(input).diagnostics.some((item) => item.code === "recipient-scope-mismatch"));
});

test("basic attacks reject missing references, cycles, unknown overrides, and duplicate own-roll fields", () => {
  const input = model();
  const row = input.techniques[0];
  row.basicAttack = [{ type: "technique", key: "missing", defense: "Imaginary" }];
  let result = validateGameDataModel(input);
  assert(result.diagnostics.some((item) => item.code === "unresolved-reference" && item.column === "basicAttack"));
  assert(result.diagnostics.some((item) => item.code === "invalid-basic-attack-override"));
  row.basicAttack = [{ type: "technique", key: row.techniqueKey }];
  row.action.attribute = "Agility";
  result = validateGameDataModel(input);
  assert(result.diagnostics.some((item) => item.code === "basic-attack-reference-cycle"));
  assert(result.diagnostics.some((item) => item.code === "conflicting-basic-attack-roll"));
});

test("blank costs remain unknown warnings while invalid enums and duplicate keys remain errors", () => {
  const input = model();
  input.techniques[0].action.energyCost = { kind: null, value: null, options: [] };
  let result = validateGameDataModel(input);
  assert.equal(result.ok, true);
  assert(result.diagnostics.some((item) => item.code === "record-unready" && item.column === "energyCostKind"));
  input.techniques[0].action.energyCost.kind = "free-ish";
  input.traits.push(structuredClone(input.traits[0]));
  result = validateGameDataModel(input);
  assert.equal(result.ok, false);
  assert(result.diagnostics.some((item) => item.code === "invalid-energy-cost-kind"));
  assert(result.diagnostics.some((item) => item.code === "duplicate-stable-id" && item.sheet === "Traits"));
});

test("archetype and known-option prerequisites validate actual membership and group capacity", () => {
  const input = model();
  const feature = input.classFeatures[0];
  feature.kind = "optionGroup"; feature.chooseCount = 1;
  input.feats[0].prerequisites = [{ type: "archetype", key: "missing", numFeats: 1 }, { type: "option", groupKey: feature.featureKey, count: 2 }];
  const result = validateGameDataModel(input);
  assert(result.diagnostics.some((item) => item.code === "unresolved-reference" && item.details?.kind === "archetype"));
  assert(result.diagnostics.some((item) => item.code === "impossible-option-count"));
});

test("unsupported equipment state defers a sole prerequisite but preserves a supported OR route", () => {
  const input = model();
  let result = validateGameDataModel(input);
  assert.equal(result.runtimeSupportBySource["Techniques:2"].status, "supported");
  assert(result.diagnostics.some((item) => item.code === "prerequisite-alternative-deferred" && item.deferred === false));
  input.techniques[0].prerequisites = [{ type: "weapon", tag: "Melee", wielded: true }];
  result = validateGameDataModel(input);
  assert.equal(result.runtimeSupportBySource["Techniques:2"].status, "deferred");
});

test("parent cycles and invocations through an option group are rejected", () => {
  const input = model();
  const [group, child] = input.classFeatures;
  group.kind = "optionGroup"; group.chooseCount = 1;
  child.kind = "option"; child.parentKey = group.featureKey;
  assert(validateGameDataModel(input).diagnostics.some((item) => item.code === "feature-reference-cycle"));
  child.kind = "optionGroup"; child.chooseCount = 1; child.grants = [];
  group.parentKey = child.featureKey;
  assert(validateGameDataModel(input).diagnostics.some((item) => item.code === "parent-reference-cycle"));
});
