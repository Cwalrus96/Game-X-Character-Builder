import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { canonicalSkillKey, canonicalSkillName } from "../../public/js/core/skill-identity.js";

const clone = (value) => structuredClone(value);
const text = (value) => String(value ?? "").trim();
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const nonblank = (value) => value !== "" && value !== null && value !== undefined;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const own = (value, key) => Object.hasOwn(value || {}, key);

export function cellValue(cell = {}) {
  const value = cell.userEnteredValue || {};
  return value.formulaValue ?? value.stringValue ?? value.numberValue ?? value.boolValue ?? "";
}

function enteredValue(value) {
  if (!nonblank(value)) return {};
  return { userEnteredValue: typeof value === "number" ? { numberValue: value }
    : typeof value === "boolean" ? { boolValue: value } : { stringValue: String(value) } };
}

/** Decode a full Google Sheets cell snapshot without dropping zero or false. */
export function readSheetSnapshot(snapshot, title) {
  const source = snapshot.structuredContent || snapshot;
  const sheet = source.sheets?.find((entry) => !title || entry.properties?.title === title);
  if (!sheet) throw new Error(`Snapshot has no sheet ${title || ""}.`);
  const cells = [];
  for (const block of sheet.data || []) {
    for (const [offset, row] of (block.rowData || []).entries()) {
      const rowIndex = (block.startRow || 0) + offset;
      cells[rowIndex] ||= [];
      for (const [columnOffset, cell] of (row.values || []).entries()) {
        cells[rowIndex][(block.startColumn || 0) + columnOffset] = clone(cell);
      }
    }
  }
  const rawHeaders = (cells[0] || []).map(cellValue);
  let width = rawHeaders.length;
  while (width && !nonblank(rawHeaders[width - 1])) width -= 1;
  const headers = rawHeaders.slice(0, width).map(text);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error(`${sheet.properties.title}: blank or duplicate column header.`);
  }
  for (const [rowIndex, row] of cells.entries()) {
    if ((row || []).slice(width).some((cell) => nonblank(cellValue(cell)))) {
      throw new Error(`${sheet.properties.title}: populated unnamed column at row ${rowIndex + 1}.`);
    }
  }
  let height = cells.length;
  while (height > 1 && !(cells[height - 1] || []).some((cell) => nonblank(cellValue(cell)))) height -= 1;
  const values = Array.from({ length: height }, (_, row) => headers.map((_, column) => cellValue(cells[row]?.[column])));
  return {
    spreadsheetId: source.spreadsheetId,
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
    grid: clone(sheet.properties.gridProperties),
    headers, cells, values,
    records: values.slice(1).map((row, index) => ({ rowIndex: index + 1, ...Object.fromEntries(headers.map((field, column) => [field, row[column]])) })),
    snapshotHash: hash(source),
  };
}

/** Preserve rank entries and explicit effects; never silently assume damage. */
export function migratePumping(value, implicitEffect) {
  if (!text(value)) return "";
  const seen = new Set();
  return String(value).split(";").map((part) => {
    const match = part.trim().match(/^(\d+)\s*=\s*(.+)$/);
    if (!match || seen.has(match[1])) throw new Error("Pumping requires unique rank=value entries.");
    seen.add(match[1]);
    let effect = match[2].trim();
    const bare = effect.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:per\s+energy)?$/i);
    if (bare) {
      if (!text(implicitEffect)) throw new Error("Unitless pumping needs an explicitly reviewed effect.");
      effect = `${bare[1]} ${text(implicitEffect)} per Energy`;
    } else if (!/\bper\s+energy\b/i.test(effect)) {
      throw new Error(`Pumping effect has no explicit per-Energy basis: ${effect}`);
    }
    return `${match[1]}=${effect.replace(/\bper\s+energy\b/gi, "per Energy")}`;
  }).join(";");
}

const skillNames = (value) => text(value).split(/\s+(?:or|and)\s+|[,;]/i).map(text).filter(Boolean);
const relationshipIdentity = (row) => [row.classKey, canonicalSkillKey(row.skillName || row.skillKey), row.role, text(row.progression).toLowerCase(), text(row.whenPrimaryAttribute).toLowerCase(), text(row.choiceGroup)].join("|");

/** Derive the old normalized relationship meaning from the three authored fields. */
export function deriveClassSkillRelationships(classes) {
  const relationships = [];
  const diagnostics = [];
  for (const row of classes.records.filter((record) => text(record.classKey))) {
    const techniqueSkills = new Set(skillNames(row.combatTechniqueSkill).map(canonicalSkillKey));
    let displayOrder = 0;
    for (const entry of text(row.combatSkills).split(";").map(text).filter(Boolean)) {
      const colon = entry.indexOf(":");
      if (colon < 1) { diagnostics.push(`${row.classKey}: unrecognized combat skill entry ${entry}`); continue; }
      const skillName = canonicalSkillName(entry.slice(0, colon).trim());
      for (const progressionText of entry.slice(colon + 1).split(",").map(text)) {
        const match = progressionText.match(/^(fast|medium|slow)(?:\s*\((\w+)\s+Primary\))?$/i);
        if (!match) { diagnostics.push(`${row.classKey}: unrecognized progression ${progressionText}`); continue; }
        relationships.push({ classKey: row.classKey, skillKey: canonicalSkillKey(skillName), skillName,
          role: techniqueSkills.has(canonicalSkillKey(skillName)) ? "combat-technique" : "combat-defense",
          progression: match[1].toLowerCase(), whenPrimaryAttribute: match[2]?.toLowerCase() || "", choiceGroup: "", displayOrder: ++displayOrder });
      }
    }
    for (const skillName of skillNames(row.utilitySkillOptions)) relationships.push({
      classKey: row.classKey, skillKey: canonicalSkillKey(skillName), skillName,
      role: "utility-option", progression: "", whenPrimaryAttribute: "", choiceGroup: "starting-utility", displayOrder: ++displayOrder,
    });
    for (const skill of techniqueSkills) {
      if (!relationships.some((record) => record.classKey === row.classKey && record.role === "combat-technique" && record.skillKey === skill)) {
        diagnostics.push(`${row.classKey}: technique skill ${skill} has no authored combat progression.`);
      }
    }
  }
  return { relationships, diagnostics };
}

export function compareClassSkillRelationships(classes, classSkills) {
  const derived = deriveClassSkillRelationships(classes);
  const old = classSkills.records.filter((row) => text(row.classKey));
  const oldIdentities = new Set(old.map(relationshipIdentity));
  const derivedIdentities = new Set(derived.relationships.map(relationshipIdentity));
  const missingFromClasses = old.filter((row) => !derivedIdentities.has(relationshipIdentity(row)));
  const newlyAuthored = derived.relationships.filter((row) => !oldIdentities.has(relationshipIdentity(row)));
  return { ...derived, missingFromClasses, newlyAuthored, preserved: !derived.diagnostics.length && !missingFromClasses.length };
}

function sheetEditor(sheet, changes, diagnostics) {
  const values = clone(sheet.values);
  const columns = [...sheet.headers];
  const deletedColumns = new Set();
  const requests = [];
  const dimensionRequests = [];
  const notes = [];
  function set(row, field, after, reason) {
    const column = typeof field === "number" ? field : columns.indexOf(field);
    if (column < 0) throw new Error(`${sheet.title}: missing ${field}.`);
    values[row] ||= Array(columns.length).fill("");
    const before = values[row][column] ?? "";
    if (same(before, after)) return;
    if (sheet.cells[row]?.[column]?.userEnteredValue?.formulaValue) throw new Error(`${sheet.title}: refusing to replace a formula at row ${row + 1}, column ${column + 1}.`);
    values[row][column] = after;
    requests.push({ updateCells: { range: { sheetId: sheet.sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: column, endColumnIndex: column + 1 }, rows: [{ values: [enteredValue(after)] }], fields: "userEnteredValue" } });
    changes.push({ tab: sheet.title, row: row + 1, column: column + 1, field: columns[column], before, after, reason });
  }
  function remove(field, requireBlank = false) {
    const column = sheet.headers.indexOf(field);
    if (column < 0) return;
    const populated = sheet.records.filter((row) => nonblank(row[field]));
    if (requireBlank && populated.length) { diagnostics.push({ code: "nonempty-removal", tab: sheet.title, field, rows: populated.map((row) => row.rowIndex + 1) }); return; }
    deletedColumns.add(column);
    changes.push({ tab: sheet.title, field, action: "remove-column", populatedCellsArchived: populated.length });
  }
  function headerNote(field, note) {
    const column = columns.indexOf(field);
    if (column < 0) throw new Error(`${sheet.title}: missing note column ${field}.`);
    if (sheet.cells[0]?.[column]?.note === note) return;
    notes.push({ updateCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: column, endColumnIndex: column + 1 }, rows: [{ values: [{ note }] }], fields: "note" } });
  }
  function append(field, note) {
    if (!text(field) || columns.includes(field)) throw new Error(`${sheet.title}: invalid or existing appended column ${field}.`);
    const column = columns.length;
    columns.push(field);
    if (columns.length > sheet.grid.columnCount) dimensionRequests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: 1 } });
    set(0, column, field, "append-column");
    if (note) headerNote(field, note);
  }
  return { sheet, values, requests, notes, deletedColumns, set, remove, headerNote, append,
    finish() {
      const keep = columns.map((_, index) => index).filter((index) => !deletedColumns.has(index));
      return { title: sheet.title, sheetId: sheet.sheetId, headers: keep.map((index) => values[0][index]), values: values.map((row) => keep.map((index) => row[index] ?? "")), requests: [...dimensionRequests, ...requests, ...notes, ...[...deletedColumns].sort((a, b) => b - a).map((index) => ({ deleteDimension: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 } } }))] };
    },
  };
}

const descriptions = {
  "Techniques.selection": "Access routes: skill names separated by comma or OR, granted, tag=Tag Name, or weaponTag=Tag Name. Skills are alternative routes; tag and weaponTag test recipient and weapon tags respectively. Formal prerequisites remain additional AND requirements. Blank means unresolved.",
  "Techniques.associatedSkill": "Optional roll/associated skill override. Blank with skill selection uses the chosen access skill. Blank with granted/tag access uses the provider-defined skill; unresolved if absent. Weapon-provided scaling uses weapon rank.",
  "Techniques.status": "Readiness only: playable, draft, or incomplete. Draft/incomplete records cannot be selected or granted. Selection separately defines acquisition.",
  "Techniques.pumpingByRank": "Semicolon-delimited rank=effect per Energy entries; include explicit effect units (damage, healing, ward, armor, etc.). Preserve every rank, gap, and distinct effect.",
  "Techniques.prerequisites": "Formal additional requirements; newline-separated conditions mean AND. Render text from this field using canonical entity names. Explicit text conditions remain manual/unresolved.",
  "Classes.combatTechniqueSkill": "Authoritative skills that provide technique selection access; multiple skill names are alternatives, not duplicated relationship rows.",
  "Classes.combatSkills": "Authoritative combat/defense skill progressions. Entries use Skill:Fast/Medium/Slow, optionally qualified by (Attribute Primary). Preserve conditional progressions.",
  "Classes.utilitySkillOptions": "Authoritative ordered starting utility skill options. Internal relationship rows and identities are derived from these authored names.",
};

/** Produce a reviewable plan only. No API, authentication, or live writes occur here. */
export function buildSchemaCleanupPlan(snapshots, decisions = {}) {
  const sheets = Object.fromEntries(Object.entries(snapshots).map(([title, value]) => [title, readSheetSnapshot(value, title)]));
  const changes = [];
  const diagnostics = [];
  const editors = Object.fromEntries(Object.entries(sheets).map(([title, sheet]) => [title, sheetEditor(sheet, changes, diagnostics)]));
  const technique = editors.Techniques;
  if (!technique) throw new Error("Techniques snapshot is required.");
  const reviewed = decisions.techniques || {};
  const editable = new Set(["description", "prerequisites", "selection", "status", "associatedSkill", "pumpingByRank", "rankNotes", "energyCostKind"]);
  for (const row of technique.sheet.records.filter((record) => text(record.techniqueKey))) {
    const decision = reviewed[row.techniqueKey] || {};
    for (const [field, expected] of Object.entries(decision.expect || {})) {
      if (!same(row[field], expected)) diagnostics.push({ code: "stale-decision", key: row.techniqueKey, field, expected, actual: row[field] });
    }
    if (text(row.notes) && decision.notesReviewed !== true) diagnostics.push({ code: "unreviewed-notes", key: row.techniqueKey, value: row.notes });
    if (text(row.prerequisiteText) && decision.prerequisiteTextReviewed !== true) diagnostics.push({ code: "unreviewed-prerequisite-text", key: row.techniqueKey, value: row.prerequisiteText });
    let selection = row.selectionMode === "granted-only" ? "granted" : row.skill;
    selection = own(decision.values, "selection") ? decision.values.selection : selection;
    const status = row.selectionMode === "draft" ? "draft" : ["selectable", "granted-only"].includes(row.selectionMode) ? "playable" : "incomplete";
    const nonSkillRoute = /(?:^|\s+OR\s+)(?:granted|tag=|weaponTag=)/i.test(text(selection));
    const associatedSkill = nonSkillRoute ? row.skill : "";
    const defaults = { selection, status, associatedSkill };
    try { defaults.pumpingByRank = migratePumping(row.pumpDamageByRank, decision.pumpingEffect); }
    catch (error) { diagnostics.push({ code: "unreviewed-pumping-effect", key: row.techniqueKey, message: error.message }); defaults.pumpingByRank = row.pumpDamageByRank; }
    const values = { ...defaults, ...decision.values };
    for (const [field, after] of Object.entries(values)) {
      if (!editable.has(field)) throw new Error(`Unsupported technique override ${field}.`);
      const sourceField = ({ selection: "skill", status: "selectionMode", associatedSkill: "skillKeys", pumpingByRank: "pumpDamageByRank" })[field] || field;
      technique.set(row.rowIndex, sourceField, after, own(decision.values, field) ? "reviewed-content-migration" : "schema-cleanup");
    }
  }
  for (const [before, after] of [["skill", "selection"], ["selectionMode", "status"], ["pumpDamageByRank", "pumpingByRank"], ["skillKeys", "associatedSkill"]]) {
    technique.set(0, before, after, "rename-column");
    technique.headerNote(before, decisions.schema?.[`Techniques.${after}`]?.description || descriptions[`Techniques.${after}`]);
  }
  for (const field of ["damageByRank", "sourceNote", "notes", "prerequisiteText", "tagKeys"]) technique.remove(field, field === "damageByRank");
  technique.headerNote("prerequisites", descriptions["Techniques.prerequisites"]);
  const statusColumn = technique.sheet.headers.indexOf("selectionMode");
  technique.requests.unshift({ setDataValidation: { range: { sheetId: technique.sheet.sheetId, startRowIndex: 1, endRowIndex: technique.sheet.grid.rowCount, startColumnIndex: statusColumn, endColumnIndex: statusColumn + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: ["playable", "draft", "incomplete"].map((userEnteredValue) => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } });
  editors.Classes?.remove("levelUp", true);
  for (const tab of ["ClassFeatures", "OriginFeatures", "Feats"]) editors[tab]?.remove("grantNotes", true);
  for (const field of ["tagKeys", "sourceNote"]) editors.WeaponBases?.remove(field);
  if (editors.Classes) for (const field of ["combatTechniqueSkill", "combatSkills", "utilitySkillOptions"]) editors.Classes.headerNote(field, descriptions[`Classes.${field}`]);

  for (const [tab, instruction] of Object.entries(decisions.sheets || {})) {
    if (["Techniques", "Schema", "Metadata", "Enums", "ClassSkills", "WeaponProfiles"].includes(tab)) throw new Error(`Use the dedicated migration/review path for ${tab}.`);
    const editor = editors[tab];
    if (!editor) throw new Error(`Missing override snapshot ${tab}.`);
    for (const column of instruction.appendColumns || []) editor.append(column.name, column.note);
    for (const [key, decision] of Object.entries(instruction.rows || {})) {
      const matches = editor.sheet.records.filter((row) => row[instruction.keyField] === key);
      if (matches.length !== 1) throw new Error(`${tab}: override key ${key} must resolve exactly once.`);
      const row = matches[0];
      for (const [field, expected] of Object.entries(decision.expect || {})) {
        if (!same(row[field], expected)) diagnostics.push({ code: "stale-decision", tab, key, field, expected, actual: row[field] });
      }
      for (const [field, after] of Object.entries(decision.values || {})) editor.set(row.rowIndex, field, after, "reviewed-content-migration");
    }
  }

  const parity = sheets.ClassSkills && sheets.Classes ? compareClassSkillRelationships(sheets.Classes, sheets.ClassSkills) : null;
  const retirement = { classSkills: parity, requests: [], blocked: [] };
  if (sheets.ClassSkills) {
    if (parity?.preserved) retirement.requests.push({ deleteSheet: { sheetId: sheets.ClassSkills.sheetId } });
    else retirement.blocked.push("ClassSkills contains unresolved relationship differences; preserve it until reviewed.");
  }
  if (sheets.WeaponProfiles) {
    if (!sheets.WeaponProfiles.records.some((row) => sheets.WeaponProfiles.headers.some((field) => nonblank(row[field])))) retirement.requests.push({ deleteSheet: { sheetId: sheets.WeaponProfiles.sheetId } });
    else retirement.blocked.push("WeaponProfiles still contains authored values.");
  }

  const meta = editors.Metadata;
  if (meta) {
    const updates = {
      sourceSchemaVersion: 5,
      grantSyntaxVersion: 3,
      prerequisiteSyntaxVersion: 3,
      exportPolicy: "Export every record. Readiness status and acquisition selection are separate; incomplete/draft records cannot be selected or granted. Runtime integration remains deferred.",
      legacyClassFields: "Classes.combatTechniqueSkill, combatSkills, and utilitySkillOptions are the authoritative authoring fields. Software derives normalized skill relationships; ClassSkills is retired after preservation verification.",
      keyPolicy: "Stable keys identify entities and references. Skill/tag names are authored once; internal identities are derived centrally with saved-state compatibility. Existing weapon/enhancement snake_case keys remain unchanged.",
    };
    for (const row of meta.sheet.records) if (own(updates, row.key)) meta.set(row.rowIndex, "value", updates[row.key], "source-schema-v5");
    const syntaxPolicy = "Authoring syntax v3 adds explicit recipient tag grants with minRank, Trait and Technique prerequisite references, and weapon-set separateHands. Selection supports skill lists, granted, recipient tag, and weaponTag routes. These source/display contracts are not supported by the accepted v4/v2 runtime importer; integration, validation, staging and publishing remain deferred.";
    const syntaxRow = meta.sheet.records.find((row) => row.key === "authoringSyntaxPolicy")?.rowIndex ?? meta.values.length;
    meta.set(syntaxRow, "key", "authoringSyntaxPolicy", "source-syntax-v3");
    meta.set(syntaxRow, "value", syntaxPolicy, "source-syntax-v3");
    for (const [key, decision] of Object.entries(decisions.metadata || {})) {
      const row = meta.sheet.records.find((entry) => entry.key === key);
      if (!row) throw new Error(`Metadata: unknown reviewed key ${key}.`);
      if (own(decision, "expect") && !same(row.value, decision.expect)) diagnostics.push({ code: "stale-decision", tab: "Metadata", key, expected: decision.expect, actual: row.value });
      meta.set(row.rowIndex, "value", decision.value, "reviewed-authoring-guidance");
    }
  }

  const schema = editors.Schema;
  if (schema) {
    const sourceByField = new Map(schema.sheet.records.map((row) => [`${row.tab}.${row.field}`, row]));
    const reverse = { "Techniques.selection": "Techniques.skill", "Techniques.status": "Techniques.selectionMode", "Techniques.pumpingByRank": "Techniques.pumpDamageByRank", "Techniques.associatedSkill": "Techniques.skillKeys" };
    const desired = [];
    for (const [tab, editor] of Object.entries(editors)) {
      if (["README", "Metadata", "Schema", "Enums", "ClassSkills", "WeaponProfiles"].includes(tab)) continue;
      for (const field of editor.finish().headers) {
        const key = `${tab}.${field}`;
        const source = sourceByField.get(reverse[key] || key);
        if (!source && !decisions.schema?.[key]) { diagnostics.push({ code: "missing-schema-description", tab, field }); continue; }
        const declaration = { ...source, tab, field };
        if (descriptions[key]) declaration.description = descriptions[key];
        if (key === "Techniques.status") Object.assign(declaration, { type: "enum", required: "yes", valuesOrFormat: "playable|draft|incomplete", default: "" });
        if (key === "Techniques.selection") Object.assign(declaration, { type: "text", required: "conditional", valuesOrFormat: "skill names separated by comma or OR; granted; tag=Name; weaponTag=Name", default: "" });
        if (key === "Techniques.associatedSkill") Object.assign(declaration, { type: "text", required: "no", valuesOrFormat: "skill name or provider-defined when blank", default: "" });
        if (key === "Techniques.pumpingByRank") Object.assign(declaration, { type: "text", required: "no", valuesOrFormat: "rank=effect per Energy;...", default: "" });
        Object.assign(declaration, decisions.schema?.[key] || {});
        desired.push(schema.sheet.headers.map((header) => declaration[header] ?? ""));
      }
    }
    for (let row = 1; row <= Math.max(desired.length, schema.values.length - 1); row += 1) for (let column = 0; column < schema.sheet.headers.length; column += 1) schema.set(row, column, desired[row - 1]?.[column] ?? "", "source-schema-v5-declarations");
  }
  const enums = editors.Enums;
  if (enums) {
    for (const row of enums.sheet.records) {
      if (row.domain === "status" && row.value === "playable") enums.set(row.rowIndex, "meaning", "Complete/readiness-approved. Technique selection routes independently determine normal selection or granted access.", "separate-readiness-access");
      if (row.domain === "tagKeys") for (const field of enums.sheet.headers) enums.set(row.rowIndex, field, "", "retire-authored-tag-keys");
    }
    const additions = [
      ["grantType", "tag", "Authoring syntax v3: grants the named recipient tag at minRank; Trait classification and weapon tags do not transfer automatically. Runtime integration is deferred."],
      ["prerequisiteType", "trait", "Authoring syntax v3: requires the canonical Trait referenced by traitKey. Runtime integration is deferred."],
      ["prerequisiteType", "technique", "Authoring syntax v3: requires the canonical Technique referenced by techniqueKey. Runtime integration is deferred."],
      ["selection", "skill names", "Comma or OR separates alternative skill-access routes."],
      ["selection", "granted", "Provider-owned access; never offer solely as an ordinary learned selection."],
      ["selection", "tag=Name", "A recipient tag unlocks ordinary selection; it does not automatically grant the technique."],
      ["selection", "weaponTag=Name", "A weapon tag unlocks ordinary selection; it does not automatically grant the technique."],
    ];
    for (const [domain, value, meaning] of additions) {
      const rowIndex = enums.sheet.records.find((row) => row.domain === domain && row.value === value)?.rowIndex ?? enums.values.length;
      for (const [field, after] of Object.entries({ domain, value, meaning })) enums.set(rowIndex, field, after, "source-syntax-v3");
    }
    for (const entry of decisions.enums || []) {
      const original = enums.sheet.records.find((row) => row.domain === entry.domain && row.value === entry.value);
      if (own(entry, "expectMeaning") && !same(original?.meaning ?? "", entry.expectMeaning)) diagnostics.push({ code: "stale-decision", tab: "Enums", domain: entry.domain, value: entry.value, expected: entry.expectMeaning, actual: original?.meaning ?? "" });
      const domainColumn = enums.sheet.headers.indexOf("domain");
      const valueColumn = enums.sheet.headers.indexOf("value");
      const existingIndex = enums.values.findIndex((row) => row[domainColumn] === entry.domain && row[valueColumn] === entry.value);
      const rowIndex = existingIndex >= 0 ? existingIndex : enums.values.length;
      for (const field of ["domain", "value", "meaning"]) enums.set(rowIndex, field, entry[field], "reviewed-authoring-guidance");
    }
  }
  const expectedAfter = Object.fromEntries(Object.entries(editors).filter(([tab]) => !["ClassSkills", "WeaponProfiles"].includes(tab)).map(([tab, editor]) => { const { requests: ignored, ...expected } = editor.finish(); return [tab, expected]; }));
  const proposedRequests = Object.values(editors).filter((editor) => !["ClassSkills", "WeaponProfiles"].includes(editor.sheet.title)).flatMap((editor) => editor.finish().requests);
  return {
    ok: !diagnostics.length, sourceSchemaVersion: 5, grantSyntaxVersion: 3, prerequisiteSyntaxVersion: 3,
    source: Object.fromEntries(Object.entries(sheets).map(([title, sheet]) => [title, { sheetId: sheet.sheetId, snapshotHash: sheet.snapshotHash, authoredRows: sheet.records.filter((row) => sheet.headers.some((field) => nonblank(row[field]))).length }])),
    diagnostics, changes, expectedAfter, requests: diagnostics.length ? [] : proposedRequests, proposedRequests,
    retirement,
    boundary: "Plan only. Re-read and compare source snapshots before any write. Runtime importer/publishing remain deferred. Execute retirement only after the primary plan, schema, display dependencies, and relationship preservation are verified.",
  };
}

function snapshotGrid(snapshot) {
  const source = snapshot.structuredContent || snapshot;
  const sheet = source.sheets[0];
  const cells = [];
  for (const block of sheet.data || []) for (const [rowOffset, row] of (block.rowData || []).entries()) {
    const rowIndex = (block.startRow || 0) + rowOffset;
    cells[rowIndex] ||= [];
    for (const [columnOffset, cell] of (row.values || []).entries()) cells[rowIndex][(block.startColumn || 0) + columnOffset] = clone(cell);
  }
  return { title: sheet.properties.title, sheetId: sheet.properties.sheetId, grid: clone(sheet.properties.gridProperties), cells, capturedRows: cells.length };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  return value;
}

/** Replay an approved plan and verify native readback without writing anywhere. */
export function verifySchemaCleanupPlan(beforeSnapshots, afterSnapshots, plan) {
  const expected = new Map(Object.values(beforeSnapshots).map((snapshot) => { const grid = snapshotGrid(snapshot); return [grid.sheetId, grid]; }));
  const mismatches = [];
  const afterByTitle = Object.fromEntries(Object.values(afterSnapshots).map((snapshot) => { const grid = snapshotGrid(snapshot); return [grid.title, grid]; }));
  const comparison = {};
  const nativeFields = ["userEnteredFormat", "dataValidation", "textFormatRuns", "note"];
  const ensureCell = (grid, row, column) => { grid.cells[row] ||= []; return grid.cells[row][column] ||= {}; };
  if (!plan.ok) mismatches.push({ code: "unapproved-plan", message: "Plan contains unresolved diagnostics." });
  for (const [title, provenance] of Object.entries(plan.source || {})) {
    const snapshot = beforeSnapshots[title];
    if (!snapshot || hash(snapshot.structuredContent || snapshot) !== provenance.snapshotHash) mismatches.push({ code: "source-snapshot-mismatch", tab: title });
  }
  for (const request of plan.requests) {
    if (request.updateCells) {
      const update = request.updateCells;
      const grid = expected.get(update.range.sheetId);
      if (!["userEnteredValue", "note"].includes(update.fields)) throw new Error(`Unsupported verification field mask ${update.fields}.`);
      for (const [rowOffset, row] of update.rows.entries()) for (const [columnOffset, source] of row.values.entries()) {
        const target = ensureCell(grid, update.range.startRowIndex + rowOffset, update.range.startColumnIndex + columnOffset);
        delete target[update.fields];
        if (own(source, update.fields)) target[update.fields] = clone(source[update.fields]);
      }
    } else if (request.setDataValidation) {
      const { range, rule } = request.setDataValidation;
      const grid = expected.get(range.sheetId);
      // Validate the complete captured range; beyond it the snapshot supplies no evidence.
      for (let row = range.startRowIndex; row < Math.min(range.endRowIndex, grid.capturedRows); row += 1) for (let column = range.startColumnIndex; column < range.endColumnIndex; column += 1) {
        const cell = ensureCell(grid, row, column);
        if (rule) cell.dataValidation = clone(rule); else delete cell.dataValidation;
      }
    } else if (request.deleteDimension) {
      const range = request.deleteDimension.range;
      if (range.dimension !== "COLUMNS") throw new Error("Verifier only supports planned column deletions.");
      const grid = expected.get(range.sheetId);
      for (const row of grid.cells) row?.splice(range.startIndex, range.endIndex - range.startIndex);
      grid.grid.columnCount -= range.endIndex - range.startIndex;
    } else if (request.appendDimension) {
      const append = request.appendDimension;
      if (append.dimension !== "COLUMNS") throw new Error("Verifier only supports planned column appends.");
      expected.get(append.sheetId).grid.columnCount += append.length;
    } else throw new Error(`Unsupported verification request ${Object.keys(request)[0]}.`);
  }
  for (const grid of expected.values()) {
    const actual = afterByTitle[grid.title];
    if (!actual) { mismatches.push({ code: "missing-after-snapshot", tab: grid.title }); continue; }
    if (!same(canonicalJson(grid.grid), canonicalJson(actual.grid))) mismatches.push({ code: "grid-properties", tab: grid.title, expected: grid.grid, actual: actual.grid });
    const count = { capturedBeforeRows: grid.capturedRows, capturedAfterRows: actual.capturedRows, valueCells: 0, nativePropertyChecks: 0 };
    for (let row = 0; row < Math.max(grid.cells.length, actual.cells.length); row += 1) {
      const width = Math.max(grid.cells[row]?.length || 0, actual.cells[row]?.length || 0);
      for (let column = 0; column < width; column += 1) {
        const wanted = grid.cells[row]?.[column] || {};
        const found = actual.cells[row]?.[column] || {};
        count.valueCells += 1;
        if (!same(canonicalJson(wanted.userEnteredValue ?? null), canonicalJson(found.userEnteredValue ?? null))) mismatches.push({ code: "cell-value", tab: grid.title, row: row + 1, column: column + 1, expected: wanted.userEnteredValue ?? null, actual: found.userEnteredValue ?? null });
        for (const property of nativeFields) {
          count.nativePropertyChecks += 1;
          if (!same(canonicalJson(wanted[property] ?? null), canonicalJson(found[property] ?? null))) mismatches.push({ code: "native-property", tab: grid.title, row: row + 1, column: column + 1, property, expected: wanted[property] ?? null, actual: found[property] ?? null });
        }
      }
    }
    comparison[grid.title] = count;
  }
  const tables = {};
  for (const [title, wanted] of Object.entries(plan.expectedAfter)) {
    if (!afterSnapshots[title]) continue;
    const found = readSheetSnapshot(afterSnapshots[title], title);
    tables[title] = found;
    const wantedValues = clone(wanted.values);
    while (wantedValues.length > 1 && !wantedValues.at(-1).some(nonblank)) wantedValues.pop();
    if (!same(wantedValues, found.values)) mismatches.push({ code: "expected-table-values", tab: title });
  }
  const techniques = tables.Techniques?.records.filter((row) => text(row.techniqueKey)) || [];
  const pumping = techniques.filter((row) => text(row.pumpingByRank));
  for (const row of pumping) try {
    migratePumping(row.pumpingByRank);
  } catch (error) { mismatches.push({ code: "implicit-pumping-effect", key: row.techniqueKey, message: error.message }); }
  const relationshipParity = tables.Classes && beforeSnapshots.ClassSkills ? compareClassSkillRelationships(tables.Classes, readSheetSnapshot(beforeSnapshots.ClassSkills, "ClassSkills")) : null;
  if (relationshipParity && !relationshipParity.preserved) mismatches.push({ code: "lost-class-skill-relationships", details: relationshipParity });
  return {
    ok: !mismatches.length,
    totals: { tables: Object.keys(comparison).length, valueCells: Object.values(comparison).reduce((sum, value) => sum + value.valueCells, 0), nativePropertyChecks: Object.values(comparison).reduce((sum, value) => sum + value.nativePropertyChecks, 0), techniqueRows: techniques.length, pumpingRecords: pumping.length, classRelationships: relationshipParity?.relationships.length || 0 },
    comparison, mismatches,
    semantic: { implicitPumpingEffects: mismatches.filter((entry) => entry.code === "implicit-pumping-effect").length, classRelationshipsPreserved: relationshipParity?.preserved ?? null, readiness: Object.fromEntries(["playable", "draft", "incomplete"].map((status) => [status, techniques.filter((row) => row.status === status).length])) },
    coverage: "Every captured source/readback cell, including captured blank styled cells and physically remapped columns. Native properties outside captured ranges are not asserted. Retirement is deliberately excluded.",
  };
}

export async function runSchemaCleanupCli(args) {
  const [snapshotDirectory, decisionsPath, outputPath] = args;
  if (!snapshotDirectory || !decisionsPath || !outputPath) throw new Error("Usage: node scripts/authoring/schema-cleanup.mjs <snapshot-directory> <decisions.json> <plan.json>");
  const snapshots = {};
  for (const filename of (await readdir(snapshotDirectory)).filter((name) => /^source-[A-Z].*\.json$/.test(name)).sort()) {
    const title = filename.slice(7, -5);
    snapshots[title] = JSON.parse(await readFile(resolve(snapshotDirectory, filename), "utf8"));
  }
  const decisions = JSON.parse(await readFile(decisionsPath, "utf8"));
  const plan = buildSchemaCleanupPlan(snapshots, decisions);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSchemaCleanupCli(process.argv.slice(2)).then((plan) => {
    console.log(JSON.stringify({ ok: plan.ok, diagnostics: plan.diagnostics.length, changes: plan.changes.length, requests: plan.requests.length, retirementBlocked: plan.retirement.blocked }, null, 2));
    if (!plan.ok) process.exitCode = 1;
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
