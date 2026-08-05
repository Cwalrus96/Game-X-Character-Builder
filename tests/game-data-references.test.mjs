import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  validateAdaptedGameData,
  validateGameDataModel,
  VALIDATION_SEVERITY_POLICY,
} from "../scripts/game-data/model-validator.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { INVALID_REFERENCE_RECORDS } from "./fixtures/game-data-references.mjs";
import {
  buildSchemaV4Workbook,
  VALID_SCHEMA_V4_RECORDS,
} from "./fixtures/game-data-schema-v4.mjs";

function adapt(records = VALID_SCHEMA_V4_RECORDS) {
  const adapted = adaptGameDataWorkbook(buildSchemaV4Workbook({ records }));
  assert.equal(adapted.ok, true, adapted.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
  return adapted;
}

test("valid whole-workbook fixture passes reference and domain validation", () => {
  const adapted = adapt();
  const result = validateAdaptedGameData(adapted);
  assert.deepEqual(result, { ok: true, diagnostics: [], counts: { errors: 0, warnings: 0 } });
});

test("invalid whole-workbook fixture reports all reference classes in deterministic source order", () => {
  const adapted = adapt(INVALID_REFERENCE_RECORDS);
  const first = validateGameDataModel(adapted.model);
  const second = validateGameDataModel(adapted.model);
  assert.deepEqual(first, second);
  assert.equal(first.ok, false);
  assert.deepEqual(first.counts, { errors: 37, warnings: 1 });

  const codes = new Set(first.diagnostics.map((item) => item.code));
  for (const code of [
    "duplicate-stable-id",
    "invalid-stable-id",
    "unresolved-reference",
    "parent-scope-mismatch",
    "unresolved-parent",
    "invalid-choose-count",
    "invalid-selection-mode",
    "invalid-energy-cost",
    "record-unready",
    "invalid-class-skill-role",
    "invalid-skill-progression",
    "invalid-status",
    "unresolved-choice-reference",
    "display-name-reference",
    "runtime-subsystem-stubbed",
  ]) assert(codes.has(code), code);

  const sheetOrder = [
    "Metadata", "Schema", "Enums", "Classes", "ClassSkills", "ClassFeatures", "Techniques", "Feats",
    "Origins", "OriginFeatures", "WeaponBases", "WeaponProfiles", "WeaponEnhancements",
  ];
  const locations = first.diagnostics.map((item) => [sheetOrder.indexOf(item.sheet), item.row ?? 0]);
  assert.deepEqual(locations, [...locations].sort((left, right) => left[0] - right[0] || left[1] - right[1]));
  assert(first.diagnostics.some((item) => item.sheet === "ClassFeatures" && item.column === "grants" && item.cell));
});

test("blank identities and duplicate composite identities block validation", () => {
  const model = structuredClone(adapt().model);
  model.classes[0].classKey = "";
  model.weaponProfiles.push(structuredClone(model.weaponProfiles[0]));
  const result = validateGameDataModel(model);
  assert.equal(result.ok, false);
  assert(result.diagnostics.some((item) => item.code === "blank-stable-id" && item.sheet === "Classes"));
  assert(result.diagnostics.some((item) => item.code === "duplicate-stable-id" && item.sheet === "WeaponProfiles"));
});

test("owner scope and parent kind are validated without relying on row order", () => {
  const records = {
    ...VALID_SCHEMA_V4_RECORDS,
    ClassFeatures: [
      {
        classKey: "ninja", level: 2, rowType: "OPTION", featureKey: "early-option", name: "Early Option",
        parentKey: "later-group", description: "Appears before its parent.",
      },
      {
        classKey: "ninja", level: 2, rowType: "OPTION_GROUP", featureKey: "later-group", name: "Later Group",
        description: "Appears later.", chooseCount: 1,
      },
      {
        classKey: "ninja", level: 2, rowType: "FEATURE", featureKey: "not-a-group", name: "Not A Group",
        description: "Cannot own options.",
      },
      {
        classKey: "ninja", level: 2, rowType: "OPTION_GROUP", featureKey: "nested-group", name: "Nested Group",
        parentKey: "later-group", description: "A group nested beneath another group.", chooseCount: 1,
      },
      {
        classKey: "ninja", level: 2, rowType: "OPTION", featureKey: "bad-parent-kind", name: "Bad Parent",
        parentKey: "not-a-group", description: "Points to a feature.",
      },
    ],
  };
  const result = validateGameDataModel(adapt(records).model);
  assert.equal(result.diagnostics.some((item) => item.code === "unresolved-parent" && /later-group/.test(item.message)), false);
  assert.equal(result.diagnostics.some((item) => item.code === "unexpected-parent" && /Nested Group/.test(item.message)), false);
  assert(result.diagnostics.some((item) => item.code === "invalid-parent-kind" && /not-a-group/.test(item.message)));
});

test("optional composite fields may be blank and primary-attribute conditions compare case-insensitively", () => {
  const model = structuredClone(adapt().model);
  model.classSkills[0].whenPrimaryAttribute = "agility";
  model.classSkills[0].choiceGroup = null;
  const result = validateGameDataModel(model);
  assert.equal(result.diagnostics.some((item) => item.code === "blank-stable-id" && item.sheet === "ClassSkills"), false);
  assert.equal(result.diagnostics.some((item) => item.code === "invalid-primary-attribute-condition"), false);
});

test("cost, status, class-skill, and selection readiness invariants are enforced", () => {
  const model = structuredClone(adapt().model);
  model.classes[0].hpProgression = null;
  model.classSkills[0].progression = null;
  model.techniques[0].action.energyCost = { kind: "conditional", value: 0, options: [] };
  model.weaponEnhancements[0].selectionMode = "manual";
  model.originFeatures[0].grants.push({ type: "technique-choice", skill: "martial-arts", count: 1 });
  const result = validateGameDataModel(model);
  assert.equal(result.ok, false);
  assert(result.diagnostics.some((item) => item.code === "playable-record-incomplete"));
  assert(result.diagnostics.some((item) => item.code === "missing-skill-progression"));
  assert(result.diagnostics.some((item) => item.code === "invalid-energy-cost-options"));
  assert(result.diagnostics.some((item) => item.code === "invalid-selection-mode"));
  assert.equal(result.diagnostics.some((item) => item.code === "missing-choice-id"), false);
});

test("descriptions are optional and draft techniques preserve incomplete mechanics without becoming selectable", () => {
  const records = structuredClone(VALID_SCHEMA_V4_RECORDS);
  for (const collection of [
    records.ClassFeatures, records.Techniques, records.Feats, records.Origins,
    records.OriginFeatures, records.WeaponBases, records.WeaponProfiles, records.WeaponEnhancements,
  ]) {
    for (const record of collection) record.description = "";
  }
  records.Techniques.push({
    ...records.Techniques[0],
    techniqueKey: "unfinished-technique",
    techniqueName: "Unfinished Technique",
    description: "",
    selectionMode: "draft",
    energyCostKind: "unassigned",
    energyCost: "",
  });

  const adapted = adapt(records);
  assert.equal(adapted.diagnostics.some((item) => item.code === "required-cell" && item.column === "description"), false);
  assert.equal(adapted.model.techniques.at(-1).selectable, false);
  const result = validateGameDataModel(adapted.model);
  assert.equal(result.ok, true);
  assert(result.diagnostics.some((item) => item.code === "record-unready" && item.severity === "warning"));
});

test("draft techniques cannot be targeted by grants", () => {
  const model = structuredClone(adapt().model);
  model.techniques[0].selectionMode = "draft";
  model.techniques[0].selectable = false;
  model.classFeatures[0].grants.push({ type: "technique", key: model.techniques[0].techniqueKey });

  const result = validateGameDataModel(model);
  assert.equal(result.ok, false);
  assert(result.diagnostics.some((item) => item.code === "draft-record-granted"));
});

test("representable runtime stubs are warnings and do not block an otherwise valid model", () => {
  const model = structuredClone(adapt().model);
  model.originFeatures[0].grants.push(
    { type: "familiar", count: 1 },
    { type: "weapon", choiceId: "base-weapon", count: 1 },
    { type: "rank", choiceRef: "base-weapon", operation: "increase", value: 1 },
    { type: "choice-rebind", choiceRef: "base-weapon", answerType: "weapon", count: 1 },
  );
  const result = validateGameDataModel(model);
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { errors: 0, warnings: 3 });
  assert(result.diagnostics.every((item) => item.severity === "warning"));
  assert(result.diagnostics.every((item) => item.code === "runtime-subsystem-stubbed"));
  assert.match(VALIDATION_SEVERITY_POLICY.error, /Blocks artifact construction/);
});

test("whole-model validation is pure and contains no artifact-writing boundary", () => {
  const source = fs.readFileSync(new URL("../scripts/game-data/model-validator.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:fs|writeFile|mkdir|process\.exit/);
});
