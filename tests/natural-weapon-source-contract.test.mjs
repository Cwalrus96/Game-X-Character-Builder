import assert from "node:assert/strict";
import test from "node:test";
import { parseGrantExpression, normalizeExpressionObject, serializeExpression } from "../public/js/core/game-data-expressions.js";
import { getExpressionRuntimeStatus } from "../public/js/core/game-data-contract.js";
import { getEntryGrants } from "../public/js/core/grants.js";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";
import { buildSchemaV5Workbook, VALID_SCHEMA_V5_RECORDS } from "./fixtures/game-data-schema-v5.mjs";

const v3 = { syntaxVersion: 3 };
const access = "technique | access=Melee Weapons OR Ranged Weapons | weaponTag=Natural";
const substitution = "skill-substitution | fromSkill=Melee Weapons OR Ranged Weapons | toSkill=Metamorphosis | weaponTag=Natural";
const martial = "skill-substitution | fromSkill=Martial Arts | toSkill=Metamorphosis";

function sourceRecords() {
  const records = structuredClone(VALID_SCHEMA_V5_RECORDS);
  records.Classes[0].combatTechniqueSkill += ", Metamorphosis";
  records.Classes[0].combatSkills += "; Metamorphosis:Fast";
  records.ClassFeatures[0].grants = [access, substitution, martial].join("\n");
  records.ClassFeatures[1].grants = "";
  records.ClassFeatures[1].description = "An unrelated complete feature.";
  records.WeaponBases[0].description = "An ordinary blade.";
  records.Techniques.push({ techniqueKey: "open-palm", techniqueName: "Open Palm", selection: "Martial Arts",
    status: "playable", rank: 0, actionType: "Action", actions: 1, energyCostKind: "fixed", energyCost: 0, description: "An open-handed attack." });
  records.WeaponBases.push({ weaponKey: "crushing-limbs", name: "Crushing Limbs", minRank: 1,
    description: "The granting Trait supplies its rank and associated skill.", tags: "Natural; Blunt; Melee; Heavy", techniqueKeys: "shared-strike" });
  records.Traits.push({ traitKey: "crushing-limbs", name: "Crushing Limbs", rank: 1, tags: "Anatomy; Natural Weapon",
    description: "Designate up to two limbs as weapons.", grants: "weapon | weaponKey=crushing-limbs | count=2" });
  return records;
}

const adapt = (records, headers) => adaptGameDataWorkbook(buildSchemaV5Workbook({ records, headers }));

test("access and substitution round-trip as separate implemented grants without awarding free choices", () => {
  for (const text of [access, substitution, martial]) {
    const parsed = parseGrantExpression(text, v3);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
    assert.equal(getExpressionRuntimeStatus("grant", parsed.value, v3), "implemented");
    assert.equal(Object.hasOwn(parsed.value, "count"), false);
    assert.deepEqual(parseGrantExpression(serializeExpression("grant", parsed.value, v3).value, v3).value, parsed.value);
    assert.equal(parseGrantExpression(text).ok, false, "v2 remains unchanged");
    assert.equal(getEntryGrants({ expressionSyntaxVersion: 3, grants: [parsed.value] }).length, 1);
  }
  assert.equal(parseGrantExpression(access, v3).value.type, "technique");
  assert.deepEqual(parseGrantExpression(martial, v3).value, { type: "skill-substitution", fromSkill: "Martial Arts", toSkill: "Metamorphosis" });
  assert.deepEqual(parseGrantExpression("weapon | weaponKey=crushing-limbs | count=2", v3).value,
    { type: "weapon", key: "crushing-limbs", count: 2 });
  assert.deepEqual(parseGrantExpression("technique | skill=Martial Arts", v3).value,
    { type: "technique-choice", skill: "Martial Arts", count: 1 });
});

test("access rejects ambiguous award fields and malformed substitution fields with source locations", () => {
  const context = { sheet: "ClassFeatures", row: 12, column: "grants" };
  const invalid = [
    ...["key=one", "name=One", "skill=Martial Arts", "tag=Focus", "count=1", "choiceId=one", "choiceRef=one"].map(field => `${access} | ${field}`),
    "technique | key=one | weaponTag=Natural", "technique | weaponTag=Natural",
    `${access} | associatedSkill=Metamorphosis`, `${access} | rankSkill=Metamorphosis`,
    "skill-substitution | fromSkill=Martial Arts", "skill-substitution | toSkill=Metamorphosis",
    "skill-substitution | fromSkill=Martial Arts | toSkill=Metamorphosis OR Ranged Weapons",
    `${martial} | count=1`, `${martial} | from=Martial Arts`, `${martial} | maxTechniqueRank=0`,
  ];
  for (const input of invalid) {
    const result = parseGrantExpression(input, { ...v3, context, line: 2 });
    assert.equal(result.ok, false, input);
    assert.equal(result.value, null, input);
    assert(result.diagnostics.every(item => item.context === context && item.line === 2));
  }
  for (const input of [{ type: "technique", access: [] }, { type: "skill-substitution", fromSkill: [], toSkill: "Metamorphosis" },
    { type: "skill-substitution", fromSkill: "Martial Arts", toSkill: ["Metamorphosis", "Ranged Weapons"] }]) {
    assert.equal(normalizeExpressionObject("grant", input, v3).ok, false);
  }
});

test("natural weapon source relationships validate with runtime support", () => {
  const input = adapt(sourceRecords());
  const before = JSON.stringify(input.model);
  const result = validateAdaptedGameData(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(JSON.stringify(input.model), before);
  assert.equal(result.runtimeSupportBySource["ClassFeatures:2"].status, "supported");
  assert.deepEqual(result.runtimeSupportBySource["Traits:3"].reasons, []);
  assert.deepEqual(result.runtimeSupportBySource["WeaponBases:3"].reasons, []);
  assert.equal(result.runtimeSupportBySource["Traits:2"].status, "supported", "existing body tags and Technique links remain supported");
  assert.equal(result.runtimeSupportBySource["WeaponBases:2"].status, "supported", "ordinary weapons remain supported");
  assert.equal(input.model.traits[1].sourceValues.grants, "weapon | weaponKey=crushing-limbs | count=2");
  assert.equal(input.model.traits[1].grants[0].rank, undefined, "no fixed provider rank is invented");
  assert(result.diagnostics.filter(item => /projection-deferred$/.test(item.code)).every(item => item.deferred && item.severity === "warning"));
});

test("access skill, substitution skills and weapon tags resolve in the right source namespace", () => {
  for (const [grant, code, field] of [
    ["technique | access=Missing Skill | weaponTag=Natural", "unresolved-skill-reference", "access"],
    ["skill-substitution | fromSkill=Missing Skill | toSkill=Metamorphosis", "unresolved-skill-reference", "fromSkill"],
    ["skill-substitution | fromSkill=Martial Arts | toSkill=Missing Skill", "unresolved-skill-reference", "toSkill"],
    ["technique | access=Melee Weapons | weaponTag=Wings", "unresolved-weapon-tag-reference", "weaponTag"],
    ["skill-substitution | fromSkill=Martial Arts | toSkill=Metamorphosis | weaponTag=Wings", "unresolved-weapon-tag-reference", "weaponTag"],
  ]) {
    const records = sourceRecords();
    records.ClassFeatures[0].grants = grant;
    const defaultHeaders = buildSchemaV5Workbook().sheets.ClassFeatures.headers;
    const headers = { ClassFeatures: ["grants", ...defaultHeaders.filter(item => item !== "grants")] };
    const result = validateAdaptedGameData(adapt(records, headers));
    assert.equal(result.ok, false, grant);
    assert(result.diagnostics.some(item => item.code === code && item.cell === "A2" && item.details.field === field && item.details.expressionIndex === 0));
  }
  const records = sourceRecords();
  records.ClassFeatures[0].grants = "technique | access=Targeting | weaponTag=Natural";
  assert.equal(validateAdaptedGameData(adapt(records)).ok, true, "renamed skill identity remains compatible");
});

test("Trait weapon grants keep missing weapon and linked Technique references blocking", () => {
  const records = sourceRecords();
  records.Traits[1].grants = "weapon | weaponKey=missing-base";
  records.WeaponBases[1].techniqueKeys = "missing-technique";
  const result = validateAdaptedGameData(adapt(records));
  assert.equal(result.ok, false);
  assert(result.diagnostics.some(item => item.code === "unresolved-reference" && item.sheet === "Traits" && item.column === "grants"));
  assert(result.diagnostics.some(item => item.code === "unresolved-reference" && item.sheet === "WeaponBases" && item.column === "techniqueKeys"));
});

test("dynamic Reach stays authored evidence with a precise unsupported execution finding", () => {
  const records = sourceRecords();
  records.WeaponBases[1].tags += "; Reach N";
  records.WeaponBases[1].traitsText = "N equals 1 + the granting Trait's associated skill rank.";
  const input = adapt(records);
  const result = validateAdaptedGameData(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(input.model.weaponBases[1].tags.at(-1), "Reach N");
  assert.equal(input.model.weaponBases[1].traitsText, records.WeaponBases[1].traitsText);
  assert(result.diagnostics.some(item => item.code === "dynamic-weapon-tag-deferred" && item.cell === "E3" && item.details.tag === "Reach N" && item.deferred));
  assert.equal(result.diagnostics.some(item => item.code === "dynamic-weapon-tag-deferred" && item.row === 2), false, "numeric Reach 2 still works");
});

test("explicit Reach N equations normalize by rank without guessing unknown formulas", () => {
  for (const offset of [0, 1]) {
    const records = sourceRecords();
    records.WeaponBases[1].tags += "; Reach N";
    records.WeaponBases[1].traitsText = `Reach N: N equals ${offset ? "1 + " : ""}the associated skill rank.`;
    const input = adapt(records), result = validateAdaptedGameData(input);
    assert.equal(input.model.weaponBases[1].reachByRank[2], 2 + offset);
    assert.equal(result.diagnostics.some(item => item.code === "dynamic-weapon-tag-deferred"), false);
  }
});

test("the additive enum is optional for old snapshots and mandatory when its grant is used", () => {
  const old = structuredClone(VALID_SCHEMA_V5_RECORDS);
  old.Enums = old.Enums.filter(row => !(row.domain === "grantType" && row.value === "skill-substitution"));
  assert.equal(adapt(old).diagnostics.some(item => item.code === "missing-enum-value"), false);
  const current = sourceRecords();
  current.Enums = old.Enums;
  assert(adapt(current).diagnostics.some(item => item.code === "missing-enum-value" && item.message.includes("skill-substitution")));
  current.Enums.push({ domain: "grantType", value: "skill-substitution", meaning: "" });
  assert(adapt(current).diagnostics.some(item => item.code === "missing-enum-meaning"));
});
