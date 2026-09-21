import test from "node:test";
import assert from "node:assert/strict";
import { readSheetSnapshot, migratePumping, buildSchemaCleanupPlan, compareClassSkillRelationships, verifySchemaCleanupPlan } from "../scripts/authoring/schema-cleanup.mjs";

function snapshot(title, headers, records, sheetId = 12) {
  const cell = (value) => ({ userEnteredValue: typeof value === "number" ? { numberValue: value } : typeof value === "boolean" ? { boolValue: value } : { stringValue: value ?? "" }, userEnteredFormat: { textFormat: { italic: true } }, note: "existing note" });
  return { spreadsheetId: "source", sheets: [{ properties: { title, sheetId, gridProperties: { rowCount: 50, columnCount: headers.length } }, data: [{ rowData: [headers, ...records.map((row) => headers.map((field) => row[field] ?? ""))].map((row) => ({ values: row.map(cell) })) }] }] };
}

const techniqueHeaders = ["techniqueKey", "techniqueName", "skill", "selectionMode", "pumpDamageByRank", "skillKeys", "tagKeys", "sourceNote", "notes", "prerequisiteText", "damageByRank", "description", "prerequisites", "rankNotes", "strainCost", "onCriticalFailure", "energyCostKind"];
const techniques = (rows) => snapshot("Techniques", techniqueHeaders, rows);

test("snapshot decoding preserves zero, false, rich metadata and actual coordinates", () => {
  const raw = snapshot("Techniques", ["key", "zero", "false"], [{ key: "a", zero: 0, false: false }]);
  raw.sheets[0].data[0].rowData.push({ values: [{ userEnteredFormat: { wrapStrategy: "WRAP" } }] });
  const before = structuredClone(raw);
  const result = readSheetSnapshot(raw);
  assert.deepEqual(result.values, [["key", "zero", "false"], ["a", 0, false]]);
  assert.equal(result.records[0].rowIndex, 1);
  assert.deepEqual(result.cells[1][0].userEnteredFormat, { textFormat: { italic: true } });
  assert.deepEqual(raw, before);
});

test("pumping preserves gaps and distinct effect units and refuses implicit mechanics", () => {
  assert.equal(migratePumping("0=+0;1=+1 per energy;3=+2 ward per energy", "damage"), "0=+0 damage per Energy;1=+1 damage per Energy;3=+2 ward per Energy");
  assert.equal(migratePumping("1=+1 healing per Energy;2=+1 armor per energy"), "1=+1 healing per Energy;2=+1 armor per Energy");
  assert.throws(() => migratePumping("1=+2 per Energy"), /explicitly reviewed/);
  assert.throws(() => migratePumping("1=+1 damage per Energy;1=+2 damage per Energy"), /unique/);
});

test("reviewed migration keeps gameplay and metadata, emits descending column deletion", () => {
  const source = { Techniques: techniques([{ techniqueKey: "spray", techniqueName: "Spray", skill: "Ranged Weapons", skillKeys: "ranged-weapons", selectionMode: "granted-only", notes: "Reload after use.", sourceNote: "Original handbook", description: "Spray bullets.", prerequisiteText: "Wielding Pistol.", prerequisites: "weapon | key=pistol", pumpDamageByRank: "1=+1 per Energy;3=+2 per Energy", strainCost: 0, onCriticalFailure: "Jammed.", rankNotes: "Rank 4+: Extra target." }]) };
  const before = structuredClone(source);
  const plan = buildSchemaCleanupPlan(source, { techniques: { spray: { notesReviewed: true, prerequisiteTextReviewed: true, pumpingEffect: "damage", values: { description: "Spray bullets.\nReload after use.", prerequisites: "weapon | key=pistol | wielded=true" } } } });
  assert.equal(plan.ok, true);
  const after = plan.expectedAfter.Techniques;
  const row = Object.fromEntries(after.headers.map((field, column) => [field, after.values[1][column]]));
  assert.equal(row.selection, "granted");
  assert.equal(row.status, "playable");
  assert.equal(row.associatedSkill, "Ranged Weapons");
  assert.equal(row.strainCost, 0);
  assert.equal(row.onCriticalFailure, "Jammed.");
  assert.equal(row.rankNotes, "Rank 4+: Extra target.");
  assert.equal(row.description, "Spray bullets.\nReload after use.");
  assert.equal(row.pumpingByRank, "1=+1 damage per Energy;3=+2 damage per Energy");
  assert.equal(after.headers.includes("sourceNote"), false);
  const deletions = plan.requests.filter((request) => request.deleteDimension).map((request) => request.deleteDimension.range.startIndex);
  assert.deepEqual(deletions, [10, 9, 8, 7, 6]);
  assert.ok(plan.requests.every((request) => !request.updateCells || ["userEnteredValue", "note"].includes(request.updateCells.fields)));
  const replay = structuredClone(before.Techniques.sheets[0].data[0].rowData);
  for (const request of plan.requests) {
    if (request.updateCells) {
      const update = request.updateCells;
      const cell = replay[update.range.startRowIndex].values[update.range.startColumnIndex];
      if (update.fields === "userEnteredValue") {
        delete cell.userEnteredValue;
        Object.assign(cell, update.rows[0].values[0]);
      } else cell.note = update.rows[0].values[0].note;
    }
    if (request.deleteDimension) {
      const range = request.deleteDimension.range;
      for (const row of replay) row.values.splice(range.startIndex, range.endIndex - range.startIndex);
    }
  }
  const replaySnapshot = structuredClone(before.Techniques);
  replaySnapshot.sheets[0].data[0].rowData = replay;
  assert.deepEqual(readSheetSnapshot(replaySnapshot).values, after.values);
  const failureColumn = after.headers.indexOf("onCriticalFailure");
  assert.deepEqual(replay[1].values[failureColumn], before.Techniques.sheets[0].data[0].rowData[1].values[15]);
  assert.deepEqual(source, before);
});

test("missing review, nonblank retired damage and stale decisions prevent executable requests", () => {
  const source = { Techniques: techniques([{ techniqueKey: "a", notes: "Mechanic.", prerequisiteText: "Beam", damageByRank: "1=8", selectionMode: "selectable" }]) };
  const plan = buildSchemaCleanupPlan(source, { techniques: { a: { expect: { notes: "Older mechanic." } } } });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.requests, []);
  assert.deepEqual(new Set(plan.diagnostics.map((entry) => entry.code)), new Set(["stale-decision", "unreviewed-notes", "unreviewed-prerequisite-text", "nonempty-removal"]));
});

test("unknown readiness stays incomplete and known draft remains draft", () => {
  const plan = buildSchemaCleanupPlan({ Techniques: techniques([{ techniqueKey: "unknown" }, { techniqueKey: "draft", selectionMode: "draft", skill: "Ninjutsu" }]) });
  const status = plan.expectedAfter.Techniques.headers.indexOf("status");
  assert.equal(plan.expectedAfter.Techniques.values[1][status], "incomplete");
  assert.equal(plan.expectedAfter.Techniques.values[2][status], "draft");
});

test("class derivation preserves all three columns, conditions and authoritative additions", () => {
  const classSnapshot = snapshot("Classes", ["classKey", "combatTechniqueSkill", "combatSkills", "utilitySkillOptions", "levelUp"], [{ classKey: "weapon-master", combatTechniqueSkill: "Melee Weapons, Ranged Weapons", combatSkills: "Melee Weapons:Fast (Strength Primary), Medium (Agility Primary); Ranged Weapons:Medium (Strength Primary), Fast (Agility Primary); Physical Defense:Fast", utilitySkillOptions: "Athletics; Society" }], 13);
  const old = snapshot("ClassSkills", ["classKey", "skillName", "role", "progression", "whenPrimaryAttribute", "choiceGroup"], [{ classKey: "weapon-master", skillName: "Targeting", role: "combat-technique", progression: "fast", whenPrimaryAttribute: "agility" }], 14);
  const parity = compareClassSkillRelationships(readSheetSnapshot(classSnapshot), readSheetSnapshot(old));
  assert.equal(parity.preserved, true);
  assert.equal(parity.relationships.length, 7);
  assert.equal(parity.newlyAuthored.length, 6);
  const plan = buildSchemaCleanupPlan({ Techniques: techniques([]), Classes: classSnapshot, ClassSkills: old });
  assert.deepEqual(plan.expectedAfter.Classes.values[1], ["weapon-master", "Melee Weapons, Ranged Weapons", "Melee Weapons:Fast (Strength Primary), Medium (Agility Primary); Ranged Weapons:Medium (Strength Primary), Fast (Agility Primary); Physical Defense:Fast", "Athletics; Society"]);
  assert.deepEqual(plan.retirement.requests, [{ deleteSheet: { sheetId: 14 } }]);
  assert.ok(!plan.requests.some((request) => request.deleteSheet));
});

test("retirement blocks unique ClassSkills mechanics and populated WeaponProfiles", () => {
  const classes = snapshot("Classes", ["classKey", "combatTechniqueSkill", "combatSkills", "utilitySkillOptions"], [{ classKey: "a", combatTechniqueSkill: "Ninjutsu", combatSkills: "Ninjutsu:Slow" }]);
  const classSkills = snapshot("ClassSkills", ["classKey", "skillName", "role", "progression"], [{ classKey: "a", skillName: "Ninjutsu", role: "combat-technique", progression: "fast" }]);
  const plan = buildSchemaCleanupPlan({ Techniques: techniques([]), Classes: classes, ClassSkills: classSkills, WeaponProfiles: snapshot("WeaponProfiles", ["weaponKey"], [{ weaponKey: "bow" }]) });
  assert.equal(plan.retirement.blocked.length, 2);
  assert.deepEqual(plan.retirement.requests, []);
});

test("formula-valued edits and unexpected populated columns fail before planning", () => {
  const source = techniques([{ techniqueKey: "a", selectionMode: "selectable" }]);
  source.sheets[0].data[0].rowData[1].values[3].userEnteredValue = { formulaValue: '=IF(TRUE,"selectable","")' };
  assert.throws(() => buildSchemaCleanupPlan({ Techniques: source }), /refusing to replace a formula/);
  const unnamed = snapshot("A", ["name"], [{ name: "a" }]);
  unnamed.sheets[0].data[0].rowData[1].values.push({ userEnteredValue: { stringValue: "Do not drop" } });
  assert.throws(() => readSheetSnapshot(unnamed), /populated unnamed/);
});

test("reviewed generic sheet additions retain classification tags and use a narrow value write", () => {
  const traits = snapshot("Traits", ["traitKey", "name", "tags", "description", "techniqueKeys"], [{ traitKey: "wings", name: "Wings", tags: "Anatomy", description: 'Gain the "Wing" tag.' }], 18);
  const plan = buildSchemaCleanupPlan({ Techniques: techniques([]), Traits: traits }, {
    sheets: { Traits: { keyField: "traitKey", appendColumns: [{ name: "grants", note: "Acquired character tags, not classification." }], rows: { wings: { expect: { description: 'Gain the "Wing" tag.' }, values: { description: 'Gain the "Wings" tag.', grants: "tag | tag=Wings | minRank=1\ntag | tag=Flight | minRank=2" } } } } },
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.expectedAfter.Traits.values[1], ["wings", "Wings", "Anatomy", 'Gain the "Wings" tag.', "", "tag | tag=Wings | minRank=1\ntag | tag=Flight | minRank=2"]);
  const relevant = plan.requests.filter((request) => request.appendDimension?.sheetId === 18 || request.updateCells?.range.sheetId === 18);
  assert.deepEqual(relevant[0], { appendDimension: { sheetId: 18, dimension: "COLUMNS", length: 1 } });
  assert.ok(relevant.slice(1).every((request) => request.updateCells && ["userEnteredValue", "note"].includes(request.updateCells.fields)));
});

test("metadata and declarations describe the new headers and keep cost/failure fields", () => {
  const schemaHeaders = ["tab", "field", "type", "required", "valuesOrFormat", "default", "description"];
  const source = {
    Techniques: techniques([]),
    Metadata: snapshot("Metadata", ["key", "value"], [{ key: "sourceSchemaVersion", value: 4 }, { key: "grantSyntaxVersion", value: 2 }, { key: "prerequisiteSyntaxVersion", value: 2 }], 16),
    Schema: snapshot("Schema", schemaHeaders, techniqueHeaders.map((field) => ({ tab: "Techniques", field, type: "text", required: "no", description: `Original ${field}` })), 17),
  };
  const selection = { description: "Reviewed weaponTag and recipient-tag semantics.", valuesOrFormat: "comma or OR skill names; granted; tag=Name; weaponTag=Name" };
  const plan = buildSchemaCleanupPlan(source, { schema: { "Techniques.selection": selection } });
  assert.equal(plan.ok, true);
  assert.equal(plan.expectedAfter.Metadata.values[1][1], 5);
  assert.equal(plan.expectedAfter.Metadata.values[2][1], 3);
  assert.equal(plan.expectedAfter.Metadata.values[3][1], 3);
  assert.match(plan.expectedAfter.Metadata.values[4][1], /runtime importer.*deferred/);
  const schemaRows = plan.expectedAfter.Schema.values.slice(1).filter((row) => row[0]);
  assert.deepEqual(schemaRows.map((row) => row[1]), plan.expectedAfter.Techniques.headers);
  assert.equal(schemaRows.find((row) => row[1] === "status")[4], "playable|draft|incomplete");
  assert.equal(schemaRows.find((row) => row[1] === "selection")[4], selection.valuesOrFormat);
  assert.equal(schemaRows.find((row) => row[1] === "selection")[6], selection.description);
  for (const field of ["strainCost", "onCriticalFailure", "energyCostKind", "rankNotes"]) assert.equal(schemaRows.find((row) => row[1] === field)[6], `Original ${field}`);
});

test("independent verifier detects value and native-format drift without mutating snapshots", () => {
  const before = { Techniques: snapshot("Techniques", ["techniqueKey", "status", "pumpingByRank"], [{ techniqueKey: "beam", status: "playable", pumpingByRank: "1=+1 ward per Energy" }]) };
  const plan = { ok: true, source: {}, requests: [], expectedAfter: { Techniques: { values: readSheetSnapshot(before.Techniques).values } } };
  const after = structuredClone(before);
  const preserved = structuredClone(before);
  let report = verifySchemaCleanupPlan(before, after, plan);
  assert.equal(report.ok, true);
  assert.equal(report.totals.techniqueRows, 1);
  assert.equal(report.totals.pumpingRecords, 1);
  after.Techniques.sheets[0].data[0].rowData[1].values[0].userEnteredFormat.textFormat.italic = false;
  after.Techniques.sheets[0].data[0].rowData[1].values[2].userEnteredValue.stringValue = "1=+1 per Energy";
  report = verifySchemaCleanupPlan(before, after, plan);
  assert.equal(report.ok, false);
  assert.deepEqual(new Set(report.mismatches.map((entry) => entry.code)), new Set(["native-property", "cell-value", "expected-table-values", "implicit-pumping-effect"]));
  assert.deepEqual(before, preserved);
});

test("reviewed README, Metadata and Enums guidance stays scoped and checks stale text", () => {
  const source = {
    Techniques: techniques([]),
    README: snapshot("README", ["section", "details"], [{ section: "Source", details: "Old contract." }], 19),
    Metadata: snapshot("Metadata", ["key", "value"], [{ key: "compatibility", value: "Old compatibility." }], 20),
    Enums: snapshot("Enums", ["domain", "value", "meaning"], [{ domain: "prerequisiteType", value: "tag", meaning: "Old meaning." }], 21),
  };
  const decisions = {
    sheets: { README: { keyField: "section", rows: { Source: { expect: { details: "Old contract." }, values: { details: "Authoring schema 5." } } } } },
    metadata: { compatibility: { expect: "Old compatibility.", value: "Runtime integration deferred." } },
    enums: [{ domain: "prerequisiteType", value: "tag", expectMeaning: "Old meaning.", meaning: "Requires a recipient tag." }],
  };
  const plan = buildSchemaCleanupPlan(source, decisions);
  assert.equal(plan.ok, true);
  assert.equal(plan.expectedAfter.README.values[1][1], "Authoring schema 5.");
  assert.equal(plan.expectedAfter.Metadata.values[1][1], "Runtime integration deferred.");
  assert.equal(plan.expectedAfter.Enums.values[1][2], "Requires a recipient tag.");
  decisions.metadata.compatibility.expect = "Stale value.";
  assert.equal(buildSchemaCleanupPlan(source, decisions).diagnostics[0].code, "stale-decision");
});
