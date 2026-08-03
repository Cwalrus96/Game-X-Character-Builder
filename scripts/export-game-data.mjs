#!/usr/bin/env node
/**
 * Game X Data Exporter
 * --------------------
 * Converts the "seed" XLSX workbook (edited in Google Sheets) into JSON files your site can load.
 *
 * SINGLE SOURCE OF TRUTH:
 * - The XLSX workbook is treated as the canonical structured data source.
 * - This script produces deterministic JSON from it and performs basic validation.
 *
 * Usage:
 *   node scripts/export-game-data.mjs path/to/seed.xlsx public/data/game-x
 *
 * Output:
 *   - game-x-data.json (combined)
 *   - classes.json
 *   - class-features.json
 *   - feats.json
 *   - techniques.json
 *   - origins.json
 *   - weapon-bases.json
 *   - weapon-enhancements.json
 *   - export-report.json (warnings + counts)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx/xlsx.mjs"; // SheetJS ESM build (use XLSX.read with a Buffer)
import { assertGameDataExportTargetAllowed } from "./game-data-export-policy.mjs";

const REQUIRED_SHEETS = ["Classes", "ClassFeatures", "Feats", "Techniques"];
const OPTIONAL_ORIGIN_SHEETS = ["Origins", "OriginFeatures"];
const OPTIONAL_WEAPON_SHEETS = ["WeaponBases", "WeaponProfiles", "WeaponEnhancements"];
const VALID_ORIGIN_STATUSES = new Set(["playable", "draft", "incomplete"]);
const LEGACY_GRANT_COLUMNS = ["grantsSkills", "grantsTechniques", "grantsNotes"];
const VALID_GRANT_TYPES = new Set(["skill", "technique", "technique-choice", "feat", "weapon", "weapon-enhancement", "equipment", "specialization"]);
const VALID_GRANT_FIELDS = new Set(["name", "key", "skill", "progression", "rank", "count", "note", "enhancement", "choiceId", "choiceRef"]);
const VALID_PREREQUISITE_TYPES = new Set(["class", "feat", "origin", "attribute", "skill", "tag", "choice"]);
const VALID_PREREQUISITE_FIELDS = new Set(["name", "key", "level", "rank", "minRank", "value", "minValue", "choiceRef", "tag", "enhancement"]);

function die(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function toIntOrNull(v) {
  const s = toStr(v);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toBoolOrNull(v) {
  const s = toStr(v).toLowerCase();
  if (!s) return null;
  if (["y", "yes", "true", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
  return null;
}

function splitList(v) {
  // Accept ";" or "," lists. Keeps order, trims entries, drops empties.
  const s = toStr(v);
  if (!s) return [];
  return s
    .split(/[;,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitGrantLines(v) {
  const s = toStr(v).replace(/\r\n/g, "\n");
  if (!s) return [];
  return s
    .split(/\n+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function assertNoLegacyGrantColumns(rows, sheetName) {
  const headers = new Set(rows.flatMap((row) => Object.keys(row)));
  const legacy = LEGACY_GRANT_COLUMNS.filter((column) => headers.has(column));
  if (legacy.length) {
    die(`${sheetName}: remove legacy grant column(s): ${legacy.join(", ")}. Use "grants" and "grantNotes" only.`);
  }
}

function parseGrantType(value, context) {
  const type = toStr(value);
  if (!/^[a-z][a-z-]*$/.test(type)) {
    die(`${context}: grant type "${value}" must be lowercase letters/hyphens only.`);
  }
  if (!VALID_GRANT_TYPES.has(type)) {
    die(`${context}: unknown grant type "${type}". Add it to VALID_GRANT_TYPES if this is a new supported grant type.`);
  }
  return type;
}

function parseGrantLine(line, context) {
  const parts = String(line ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  let type = parseGrantType(parts.shift(), context);

  const grant = { type };
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      die(`${context}: grant field "${part}" must use key=value syntax.`);
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key || !value) die(`${context}: grant field "${part}" must include both key and value.`);
    if (!/^[a-z][a-zA-Z]*$/.test(key)) {
      die(`${context}: grant field key "${key}" must be lower camelCase.`);
    }
    if (!VALID_GRANT_FIELDS.has(key)) {
      die(`${context}: unknown grant field "${key}". Add it to VALID_GRANT_FIELDS if this is intentional.`);
    }
    if (Object.hasOwn(grant, key)) {
      die(`${context}: duplicate grant field "${key}".`);
    }
    if (key === "rank" || key === "count") {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || String(n) !== value) die(`${context}: ${key} must be an integer, got "${value}".`);
      grant[key] = n;
    } else if (key === "progression") {
      const progression = value.toLowerCase();
      if (!["fast", "medium", "slow", "weapon skill"].includes(progression)) {
        die(`${context}: progression must be fast, medium, slow, or weapon skill, got "${value}".`);
      }
      grant[key] = progression;
    } else {
      grant[key] = value;
    }
  }

  if (type === "technique" && grant.skill && !grant.name && !grant.key) {
    type = "technique-choice";
    grant.type = type;
    if (!Object.hasOwn(grant, "count")) grant.count = 1;
  }
  if (type === "technique-choice") {
    if (!grant.skill) die(`${context}: technique-choice grants must include skill=Skill Name.`);
    if (!Object.hasOwn(grant, "count")) grant.count = 1;
  }
  if (type === "technique" && !grant.name && !grant.key) {
    die(`${context}: technique grants must include name=Technique Name or key=technique-key.`);
  }

  return grant;
}

function parseGrants(v, context) {
  return splitGrantLines(v).map((line, index) => parseGrantLine(line, `${context} grant ${index + 1}`)).filter(Boolean);
}

function parsePrerequisiteType(value, context) {
  const type = toStr(value);
  if (!/^[a-z][a-z-]*$/.test(type)) {
    die(`${context}: prerequisite type "${value}" must be lowercase letters/hyphens only.`);
  }
  if (!VALID_PREREQUISITE_TYPES.has(type)) {
    die(`${context}: unknown prerequisite type "${type}". Add it to VALID_PREREQUISITE_TYPES if this is a new supported prerequisite type.`);
  }
  return type;
}

function parseMaybeOrValue(value) {
  const parts = String(value ?? "")
    .split(/\s+OR\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : value;
}

function parsePrerequisiteLine(line, context) {
  const raw = toStr(line);
  if (!raw) return null;

  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return { type: "text", text: raw };
  }

  const prereq = { type: parsePrerequisiteType(parts.shift(), context) };
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      die(`${context}: prerequisite field "${part}" must use key=value syntax.`);
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key || !value) die(`${context}: prerequisite field "${part}" must include both key and value.`);
    if (!/^[a-z][a-zA-Z]*$/.test(key)) {
      die(`${context}: prerequisite field key "${key}" must be lower camelCase.`);
    }
    if (!VALID_PREREQUISITE_FIELDS.has(key)) {
      die(`${context}: unknown prerequisite field "${key}". Add it to VALID_PREREQUISITE_FIELDS if this is intentional.`);
    }
    if (Object.hasOwn(prereq, key)) {
      die(`${context}: duplicate prerequisite field "${key}".`);
    }

    if (key === "level" || key === "rank" || key === "minRank" || key === "value" || key === "minValue") {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || String(n) !== value) die(`${context}: ${key} must be an integer, got "${value}".`);
      prereq[key] = n;
    } else {
      prereq[key] = parseMaybeOrValue(value);
    }
  }

  if (prereq.type === "choice" && !prereq.choiceRef) {
    die(`${context}: choice prerequisites must include choiceRef=choice-id.`);
  }

  return prereq;
}

function parsePrerequisites(v, context) {
  return splitGrantLines(v).map((line, index) => parsePrerequisiteLine(line, `${context} prerequisite ${index + 1}`)).filter(Boolean);
}

function describeRow(r) {
  return toStr(r.featureKey) || toStr(r.featKey) || toStr(r.originKey) || toStr(r.name) || toStr(r.featureName) || "(unnamed)";
}

function getRowGrants(r, sheetName) {
  return parseGrants(r.grants, `${sheetName} "${describeRow(r)}"`);
}

function getRowGrantNotes(r, sheetName) {
  if (Object.hasOwn(r, "grantsNotes")) {
    die(`${sheetName} "${describeRow(r)}": use grantNotes, not grantsNotes.`);
  }
  return toStr(r.grantNotes) || null;
}

function getRowPrerequisites(r, sheetName) {
  const value = toStr(r.prerequisites) || toStr(r.prereqs);
  if (!value) return null;
  return parsePrerequisites(value, `${sheetName} "${describeRow(r)}"`);
}

function normalizeLookupKey(value) {
  return toStr(value).toLowerCase();
}

function indexNestedRow(index, scopeKey, node, sheetName) {
  const bucket = index.get(scopeKey) || new Map();
  const idKeys = [node.featureKey, node.featKey].map(normalizeLookupKey).filter(Boolean);
  for (const key of idKeys) {
    const existing = bucket.get(key);
    if (existing && existing !== null) {
      die(`${sheetName}: duplicate row key "${key}" in scope "${scopeKey}" (${existing.name || "(unnamed)"} / ${node.name || "(unnamed)"}).`);
    }
    bucket.set(key, node);
  }
  const nameKey = normalizeLookupKey(node.name);
  if (nameKey) {
    if (bucket.has(nameKey) && bucket.get(nameKey) !== node) {
      bucket.set(nameKey, null);
    } else {
      bucket.set(nameKey, node);
    }
  }
  index.set(scopeKey, bucket);
}

function findNestedParent(index, scopeKey, parentKey) {
  const bucket = index.get(scopeKey);
  if (!bucket) return null;
  return bucket.get(normalizeLookupKey(parentKey)) || null;
}

function pruneExportInternals(node) {
  delete node.parentKey;
  delete node._scopeKey;
  return node;
}

function cleanBulletPrefix(v) {
  return String(v ?? "")
    .replace(/^\s*(?:[-*•▪◦‣]+|\d+[.)])\s*/, "")
    .trim();
}

function parseTextBlockList(v, { dropIntroLineWhenBulleted = true } = {}) {
  const s = String(v ?? "").replace(/\r\n/g, "\n").trim();
  if (!s) return [];

  const lines = s
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const hasBulletedLines = lines.some((line) => /^\s*(?:[-*•▪◦‣]+|\d+[.)])\s*/.test(line));
  if (hasBulletedLines) {
    const items = lines.filter((line, index) => {
      if (/^\s*(?:[-*•▪◦‣]+|\d+[.)])\s*/.test(line)) return true;
      return !dropIntroLineWhenBulleted && index === 0;
    });
    return items.map(cleanBulletPrefix).filter(Boolean);
  }

  return splitList(s);
}

function parseSkillProgressionList(v) {
  // Parses strings like: "Targeting:Fast; Melee Weapons:Medium"
  // Returns [{ name, progression }] (progression is optional if missing).
  const items = splitList(v);
  return items.map((item) => {
    const m = item.match(/^(.+?)(?::\s*(fast|medium|slow))?$/i);
    if (!m) return { name: item, progression: null };
    const name = m[1].trim();
    const progression = m[2] ? m[2].toLowerCase() : null;
    return { name, progression };
  });
}

function parseRankMap(v) {
  // Parses "1=2 + Hits;2=4 + Hits;3=6 + Hits" into { "1": "...", "2": "...", ... }
  const s = toStr(v);
  if (!s) return null;

  const out = {};
  const parts = s.split(/[;]+/g).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      // allow bare text as a fallback
      out["_"] = (out["_"] ? out["_"] + "; " : "") + part;
      continue;
    }
    const k = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = val;
  }
  return Object.keys(out).length ? out : null;
}

function readSheetAsObjects(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) die(`Missing required sheet "${sheetName}"`);
  // defval ensures blank cells become "" so our normalizers can handle consistently.
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }); // headers from first row
  // Drop fully empty rows
  return rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ""));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function assertUnique(values, label) {
  const seen = new Map();
  const dups = new Set();
  for (const v of values) {
    const s = toStr(v);
    if (!s) continue;
    if (seen.has(s)) dups.add(s);
    else seen.set(s, true);
  }
  if (dups.size) {
    const list = Array.from(dups).sort();
    die(`${label} must be unique. Duplicates found: ${list.join(", ")}`);
  }
}

function main() {
  const [,, inputXlsx, outDir] = process.argv;
  if (!inputXlsx || !outDir) {
    die("Usage: node scripts/export-game-data.mjs path/to/seed.xlsx path/to/outputDir");
  }
  try {
    assertGameDataExportTargetAllowed(outDir);
  } catch (error) {
    die(error?.message || "This export target is not allowed.");
  }
  if (!fs.existsSync(inputXlsx)) die(`Input XLSX not found: ${inputXlsx}`);

  const wb = XLSX.read(fs.readFileSync(inputXlsx), { cellDates: false });
  for (const s of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(s)) die(`Workbook is missing required sheet: ${s}`);
  }

  const hasOriginsSheet = wb.SheetNames.includes("Origins");
  const hasOriginFeaturesSheet = wb.SheetNames.includes("OriginFeatures");
  if (hasOriginsSheet !== hasOriginFeaturesSheet) {
    die(`Workbook must include both optional origin sheets together: ${OPTIONAL_ORIGIN_SHEETS.join(", ")}`);
  }
  const hasOriginData = hasOriginsSheet && hasOriginFeaturesSheet;

  const hasWeaponBasesSheet = wb.SheetNames.includes("WeaponBases");
  const hasWeaponProfilesSheet = wb.SheetNames.includes("WeaponProfiles");
  const hasWeaponEnhancementsSheet = wb.SheetNames.includes("WeaponEnhancements");
  const hasAnyWeaponSheet = hasWeaponBasesSheet || hasWeaponProfilesSheet || hasWeaponEnhancementsSheet;
  const hasAllWeaponSheets = hasWeaponBasesSheet && hasWeaponProfilesSheet && hasWeaponEnhancementsSheet;
  if (hasAnyWeaponSheet && !hasAllWeaponSheets) {
    die(`Workbook must include all optional weapon sheets together: ${OPTIONAL_WEAPON_SHEETS.join(", ")}`);
  }
  const hasWeaponData = hasAllWeaponSheets;

  const report = {
    input: path.resolve(inputXlsx),
    generatedAt: new Date().toISOString(),
    warnings: [],
    counts: {},
  };

  // --- Classes ---
  const classesRows = readSheetAsObjects(wb, "Classes");
  assertUnique(classesRows.map((r) => r.classKey), "Classes.classKey");

  const classes = classesRows.map((r) => {
    const classKey = toStr(r.classKey);
    if (!classKey) die("Classes: classKey is required");
    return {
      classKey,
      name: toStr(r.name),
      pitch: toStr(r.pitch),
      examples: toStr(r.examples),
      hpProgression: toStr(r.hpProgression),
      primaryAttributeA: toStr(r.primaryAttributeA),
      primaryAttributeB: toStr(r.primaryAttributeB),
      combatTechniqueSkill: toStr(r.combatTechniqueSkill),
      combatSkills: parseSkillProgressionList(r.combatSkills),
      utilitySkillOptions: splitList(r.utilitySkillOptions),
      notes: toStr(r.notes),
    };
  });

  // --- Techniques ---
  const techRows = readSheetAsObjects(wb, "Techniques");
  assertUnique(techRows.map((r) => r.techniqueName), "Techniques.techniqueName");

  const techniques = techRows.map((r) => {
    const techniqueName = toStr(r.techniqueName);
    if (!techniqueName) die("Techniques: techniqueName is required");

    const energyCost = toIntOrNull(r.energyCost);
    const pumpable = energyCost === -1;

    const rollRequired = toBoolOrNull(r.rollRequired);
    if (rollRequired === null && toStr(r.rollRequired)) {
      report.warnings.push(`Techniques "${techniqueName}": rollRequired value "${toStr(r.rollRequired)}" not recognized (use Y/N).`);
    }

    const actionType = toStr(r.actionType);
    const trigger = toStr(r.trigger);
    if ((actionType === "Reaction" || actionType === "ActionOrReaction") && !trigger) {
      report.warnings.push(`Techniques "${techniqueName}": actionType=${actionType} but trigger is blank.`);
    }

    return {
      techniqueName,
      description: toStr(r.description),
      rank: toIntOrNull(r.rank),
      tags: splitList(r.tags),

      actionType: actionType || null,
      actions: toIntOrNull(r.actions),
      trigger: trigger || null,

      energyCost,
      pumpable,
      strainCost: toIntOrNull(r.strainCost),
      sustained: toBoolOrNull(r.sustained),

      rollRequired,
      attribute: toStr(r.attribute) || null,
      skill: toStr(r.skill) || null,
      defense: toStr(r.defense) || null,

      range: toStr(r.range) || null,
      targets: toStr(r.targets) || null,

      damage: toStr(r.damage) || null,
      onSuccess: toStr(r.onSuccess) || null,
      onCriticalSuccess: toStr(r.onCriticalSuccess) || null,
      onFailure: toStr(r.onFailure) || null,
      onCriticalFailure: toStr(r.onCriticalFailure) || null,
      bondEffect: toStr(r.bondEffect) || null,
      notes: toStr(r.notes) || null,

      damageByRank: parseRankMap(r.damageByRank),
      pumpDamageByRank: parseRankMap(r.pumpDamageByRank),
      rankNotes: parseRankMap(r.rankNotes),

      prerequisites: getRowPrerequisites(r, "Feats"),
      sourceNote: toStr(r.sourceNote) || null,
    };
  });

  // Basic validation: pumpable cantrips should usually have damageByRank, but don't fail hard.
  for (const t of techniques) {
    if (t.pumpable && !t.damageByRank && !t.damage) {
      report.warnings.push(`Techniques "${t.techniqueName}": pumpable (energyCost=-1) but neither damage nor damageByRank is set.`);
    }
    if (t.rank === null) {
      report.warnings.push(`Techniques "${t.techniqueName}": rank is missing (required).`);
    }
  }

  // --- Feats ---
  const featRows = readSheetAsObjects(wb, "Feats");
  assertNoLegacyGrantColumns(featRows, "Feats");
  // Feat names are not necessarily globally unique across types, but usually should be.
  // We warn instead of failing.
  const featNameCounts = new Map();
  for (const r of featRows) {
    const n = toStr(r.name);
    if (!n) continue;
    featNameCounts.set(n, (featNameCounts.get(n) || 0) + 1);
  }
  const dupFeatNames = Array.from(featNameCounts.entries()).filter(([,c]) => c > 1).map(([n]) => n);
  if (dupFeatNames.length) {
    report.warnings.push(`Duplicate feat names detected (allowed but risky): ${dupFeatNames.sort().join(", ")}`);
  }

  const featNodes = featRows.map((r) => {
    const rowType = toStr(r.rowType) || "FEATURE";
    const type = rowType === "OPTION_GROUP" ? "optionGroup" : rowType === "OPTION" ? "option" : "feature";
    const node = {
      type,
      featType: toStr(r.featType),
      classKey: toStr(r.classKey) || null,
      minLevel: toIntOrNull(r.minLevel),
      featKey: toStr(r.featKey) || null,
      name: toStr(r.name),
      parentKey: toStr(r.parentKey) || null,
      prerequisites: getRowPrerequisites(r, "Techniques"),
      description: toStr(r.description) || null,
      grants: getRowGrants(r, "Feats"),
      grantNotes: getRowGrantNotes(r, "Feats"),
      review: toStr(r.review) || null,
      _scopeKey: `${toStr(r.featType)}|${toStr(r.classKey)}`,
    };
    if (type === "optionGroup") {
      node.chooseCount = toIntOrNull(r.chooseCount) ?? 1;
      node.options = [];
    }
    return node;
  });
  const featIndex = new Map();
  for (const node of featNodes) indexNestedRow(featIndex, node._scopeKey, node, "Feats");
  const feats = [];
  for (const node of featNodes) {
    if (node.parentKey) {
      const parent = findNestedParent(featIndex, node._scopeKey, node.parentKey);
      if (!parent) {
        report.warnings.push(`Feats: "${node.name || "(unnamed)"}" parentKey "${node.parentKey}" was not found; exported as top-level.`);
        feats.push(pruneExportInternals(node));
        continue;
      }
      if (!Array.isArray(parent.options)) parent.options = [];
      parent.options.push(pruneExportInternals(node));
      continue;
    }
    feats.push(pruneExportInternals(node));
  }

  // --- Class Features (with parentKey option trees) ---
  const cfRows = readSheetAsObjects(wb, "ClassFeatures");
  assertNoLegacyGrantColumns(cfRows, "ClassFeatures");
  const featuresByClass = {};

  function ensureClassBucket(classKey) {
    if (!featuresByClass[classKey]) featuresByClass[classKey] = [];
    return featuresByClass[classKey];
  }

  const cfNodes = [];
  for (const r of cfRows) {
    const classKey = toStr(r.classKey);
    const level = toIntOrNull(r.level);
    const rowType = toStr(r.rowType);

    if (!classKey) {
      report.warnings.push(`ClassFeatures: row missing classKey (skipped)`);
      continue;
    }
    if (level === null) {
      report.warnings.push(`ClassFeatures: ${classKey} row missing level (skipped)`);
      continue;
    }

    const base = {
      type: rowType === "OPTION_GROUP" ? "optionGroup" : rowType === "OPTION" ? "option" : "feature",
      classKey,
      level,
      featureKey: toStr(r.featureKey) || null,
      name: toStr(r.name) || null,
      parentKey: toStr(r.parentKey) || null,
      description: toStr(r.description) || null,
      prerequisites: getRowPrerequisites(r, "ClassFeatures"),
      grants: getRowGrants(r, "ClassFeatures"),
      grantNotes: getRowGrantNotes(r, "ClassFeatures"),
      _scopeKey: classKey,
    };

    if (rowType === "OPTION_GROUP") {
      base.chooseCount = toIntOrNull(r.chooseCount) ?? 1;
      base.options = [];
    }
    cfNodes.push(base);
  }

  const cfIndex = new Map();
  for (const node of cfNodes) indexNestedRow(cfIndex, node._scopeKey, node, "ClassFeatures");

  for (const node of cfNodes) {
    const bucket = ensureClassBucket(node.classKey);
    if (node.parentKey) {
      const parent = findNestedParent(cfIndex, node._scopeKey, node.parentKey);
      if (!parent) {
        report.warnings.push(`ClassFeatures: "${node.name || "(unnamed)"}" parentKey "${node.parentKey}" was not found; exported as top-level.`);
        bucket.push(pruneExportInternals(node));
        continue;
      }
      if (parent.classKey !== node.classKey || parent.level !== node.level) {
        report.warnings.push(`ClassFeatures: "${node.name || "(unnamed)"}" parent "${parent.name || "(unnamed)"}" is ${parent.classKey} L${parent.level}, child is ${node.classKey} L${node.level}.`);
      }
      if (!Array.isArray(parent.options)) parent.options = [];
      parent.options.push(pruneExportInternals(node));
      continue;
    }
    bucket.push(pruneExportInternals(node));
  }

  // Warn about missing skill progression in class feature skill-choice rows
  // (User requested progression tracking, but sheet may not encode it yet.)
  for (const [classKey, entries] of Object.entries(featuresByClass)) {
    for (const entry of entries) {
      const checkEntry = (e) => {
        const skillGrants = Array.isArray(e.grants) ? e.grants.filter((grant) => grant?.type === "skill") : [];
        if (skillGrants.length) {
          const hasProg = skillGrants.some((grant) => toStr(grant.progression));
          if (!hasProg) {
            report.warnings.push(`ClassFeatures: ${classKey} L${e.level} "${e.name || "(unnamed)"}" grants has skill entries with no progression.`);
          }
        }
      };
      checkEntry(entry);
      if (entry.type === "optionGroup") {
        for (const opt of entry.options) checkEntry(opt);
      }
    }
  }

  // --- Origins ---
  let origins = [];
  if (hasOriginData) {
    const originRows = readSheetAsObjects(wb, "Origins");
    const originFeatureRows = readSheetAsObjects(wb, "OriginFeatures");
    assertNoLegacyGrantColumns(originRows, "Origins");
    assertNoLegacyGrantColumns(originFeatureRows, "OriginFeatures");

    assertUnique(originRows.map((r) => r.originKey), "Origins.originKey");

    const originRowMap = new Map();
    for (const r of originRows) {
      const originKey = toStr(r.originKey);
      if (!originKey) die("Origins: originKey is required");
      originRowMap.set(originKey, r);

      const status = toStr(r.status).toLowerCase();
      if (status && !VALID_ORIGIN_STATUSES.has(status)) {
        report.warnings.push(`Origins: ${originKey} has unrecognized status \"${toStr(r.status)}\" (expected playable, draft, or incomplete).`);
      }
    }

    const featuresByOrigin = new Map();
    for (const r of originFeatureRows) {
      const originKey = toStr(r.originKey);
      if (!originKey) {
        report.warnings.push("OriginFeatures: row missing originKey (skipped)");
        continue;
      }
      if (!originRowMap.has(originKey)) {
        report.warnings.push(`OriginFeatures: row references unknown originKey \"${originKey}\" (skipped).`);
        continue;
      }

      const featureName = toStr(r.featureName);
      const featureText = toStr(r.featureText);
      if (!featureName || !featureText) {
        report.warnings.push(`OriginFeatures: ${originKey} row missing featureName or featureText (skipped).`);
        continue;
      }

      if (!featuresByOrigin.has(originKey)) featuresByOrigin.set(originKey, []);
      featuresByOrigin.get(originKey).push({
        featureOrder: toIntOrNull(r.featureOrder) ?? Number.MAX_SAFE_INTEGER,
        featureKey: toStr(r.featureKey) || null,
        name: featureName,
        description: featureText,
        grants: getRowGrants(r, "OriginFeatures"),
        grantNotes: getRowGrantNotes(r, "OriginFeatures"),
      });
    }

    origins = originRows
      .map((r, index) => {
        const originKey = toStr(r.originKey);
        const status = toStr(r.status).toLowerCase() || "draft";
        const features = (featuresByOrigin.get(originKey) || [])
          .sort((a, b) => a.featureOrder - b.featureOrder || a.name.localeCompare(b.name))
          .map(({ featureOrder, ...feature }) => feature);

        if (!features.length) {
          report.warnings.push(`Origins: ${originKey} has no OriginFeatures rows.`);
        }

        return {
          originKey,
          name: toStr(r.name),
          status,
          summary: toStr(r.summary),
          description: toStr(r.description),
          grants: getRowGrants(r, "Origins"),
          grantNotes: getRowGrantNotes(r, "Origins"),
          features,
          originKeystone: toStr(r.originKeystone),
          roleplayQuestions: parseTextBlockList(r.roleplayQuestionsText),
          higherLevelUpgrades: parseTextBlockList(r.futureUpgradesText),
          examples: parseTextBlockList(r.examplesText),
          _sortOrder: toIntOrNull(r.sortOrder) ?? (index + 1),
        };
      })
      .sort((a, b) => a._sortOrder - b._sortOrder || a.name.localeCompare(b.name))
      .map(({ _sortOrder, ...origin }) => origin);
  } else {
    report.warnings.push("Origins export skipped: workbook does not include Origins + OriginFeatures sheets yet.");
  }


  // --- Weapons ---
  let weaponBases = [];
  let weaponEnhancements = [];
  if (hasWeaponData) {
    const weaponBaseRows = readSheetAsObjects(wb, "WeaponBases");
    const weaponProfileRows = readSheetAsObjects(wb, "WeaponProfiles");
    const weaponEnhancementRows = readSheetAsObjects(wb, "WeaponEnhancements");

    assertUnique(weaponBaseRows.map((r) => r.weaponKey), "WeaponBases.weaponKey");
    assertUnique(weaponEnhancementRows.map((r) => r.enhancementKey), "WeaponEnhancements.enhancementKey");

    const weaponKeySet = new Set(weaponBaseRows.map((r) => toStr(r.weaponKey)).filter(Boolean));

    const weaponProfilesByKey = new Map();

    weaponProfileRows.forEach((r, index) => {
      const weaponKey = toStr(r.weaponKey);
      if (!weaponKey) die(`WeaponProfiles: weaponKey is required on row ${index + 2}`);
      if (!weaponKeySet.has(weaponKey)) {
        report.warnings.push(`WeaponProfiles: row ${index + 2} references unknown weaponKey "${weaponKey}".`);
      }

      const profileName = toStr(r.profileName);
      if (!profileName) {
        report.warnings.push(`WeaponProfiles: ${weaponKey} row ${index + 2} is missing profileName.`);
      }

      const actionType = toStr(r.actionType);
      const trigger = toStr(r.trigger);
      if ((actionType === "Reaction" || actionType === "ActionOrReaction") && !trigger) {
        report.warnings.push(`WeaponProfiles "${weaponKey}" / "${profileName || "(unnamed)"}": actionType=${actionType} but trigger is blank.`);
      }

      const rollRequired = toBoolOrNull(r.rollRequired);
      if (rollRequired === null && toStr(r.rollRequired)) {
        report.warnings.push(`WeaponProfiles "${weaponKey}" / "${profileName || "(unnamed)"}": rollRequired value "${toStr(r.rollRequired)}" not recognized (use Y/N).`);
      }

      const sustained = toBoolOrNull(r.sustained);
      if (sustained === null && toStr(r.sustained)) {
        report.warnings.push(`WeaponProfiles "${weaponKey}" / "${profileName || "(unnamed)"}": sustained value "${toStr(r.sustained)}" not recognized (use Y/N).`);
      }

      const profile = {
        profileType: toStr(r.profileType) || null,
        profileName: profileName || null,
        description: toStr(r.description) || null,
        rank: toIntOrNull(r.rank),
        tags: splitList(r.tags),

        actionType: actionType || null,
        actions: toIntOrNull(r.actions),
        trigger: trigger || null,

        energyCost: toIntOrNull(r.energyCost),
        strainCost: toIntOrNull(r.strainCost),
        sustained,

        rollRequired,
        attribute: toStr(r.attribute) || null,
        skill: toStr(r.skill) || null,
        defense: toStr(r.defense) || null,

        range: toStr(r.range) || null,
        targets: toStr(r.targets) || null,

        damage: toStr(r.damage) || null,
        damageTier: toStr(r.damageTier) || null,
        onSuccess: toStr(r.onSuccess) || null,
        onCriticalSuccess: toStr(r.onCriticalSuccess) || null,
        onFailure: toStr(r.onFailure) || null,
        onCriticalFailure: toStr(r.onCriticalFailure) || null,
        bondEffect: toStr(r.bondEffect) || null,
        notes: toStr(r.notes) || null,

        damageByRank: parseRankMap(r.damageByRank),
        pumpDamageByRank: parseRankMap(r.pumpDamageByRank),
        rankNotes: parseRankMap(r.rankNotes),

        prerequisites: getRowPrerequisites(r, "WeaponProfiles"),
        sourceNote: toStr(r.sourceNote) || null,
      };

      if (!weaponProfilesByKey.has(weaponKey)) weaponProfilesByKey.set(weaponKey, []);
      weaponProfilesByKey.get(weaponKey).push(profile);
    });

    weaponBases = weaponBaseRows.map((r) => {
      const weaponKey = toStr(r.weaponKey);
      if (!weaponKey) die("WeaponBases: weaponKey is required");
      const minRank = toIntOrNull(r.minRank);
      if (minRank === null) {
        report.warnings.push(`WeaponBases "${weaponKey}": minRank is missing.`);
      }

      return {
        weaponKey,
        name: toStr(r.name),
        description: toStr(r.description) || null,
        minRank,
        tags: splitList(r.tags),
        profiles: weaponProfilesByKey.get(weaponKey) || [],
        notes: toStr(r.notes) || null,
        sourceNote: toStr(r.sourceNote) || null,
      };
    });

    weaponEnhancements = weaponEnhancementRows.map((r) => {
      const enhancementKey = toStr(r.enhancementKey);
      if (!enhancementKey) die("WeaponEnhancements: enhancementKey is required");

      return {
        enhancementKey,
        name: toStr(r.name),
        description: toStr(r.description) || null,
        minRank: toIntOrNull(r.minRank),
        prerequisites: getRowPrerequisites(r, "WeaponEnhancements"),
        notes: toStr(r.notes) || null,
        sourceNote: toStr(r.sourceNote) || null,
      };
    });
  } else {
    report.warnings.push("Weapons export skipped: workbook does not include WeaponBases + WeaponProfiles + WeaponEnhancements sheets yet.");
  }

  // Sort for stable output
  classes.sort((a, b) => a.classKey.localeCompare(b.classKey));
  techniques.sort((a, b) => a.techniqueName.localeCompare(b.techniqueName));
  feats.sort((a, b) => (a.featType || "").localeCompare(b.featType || "") || (a.classKey || "").localeCompare(b.classKey || "") || (a.minLevel ?? 0) - (b.minLevel ?? 0) || a.name.localeCompare(b.name));

  // Counts
  report.counts = {
    classes: classes.length,
    classFeaturesClasses: Object.keys(featuresByClass).length,
    feats: feats.length,
    techniques: techniques.length,
    origins: origins.length,
    weaponBases: weaponBases.length,
    weaponProfiles: weaponBases.reduce((sum, weapon) => sum + weapon.profiles.length, 0),
    weaponEnhancements: weaponEnhancements.length,
    warnings: report.warnings.length,
  };

  // Write files
  ensureDir(outDir);

  const combined = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    classes,
    classFeatures: featuresByClass,
    feats,
    techniques,
    origins,
    weaponBases,
    weaponEnhancements,
  };

  writeJson(path.join(outDir, "game-x-data.json"), combined);
  writeJson(path.join(outDir, "classes.json"), classes);
  writeJson(path.join(outDir, "class-features.json"), featuresByClass);
  writeJson(path.join(outDir, "feats.json"), feats);
  writeJson(path.join(outDir, "techniques.json"), techniques);
  writeJson(path.join(outDir, "origins.json"), origins);
  writeJson(path.join(outDir, "weapon-bases.json"), weaponBases);
  writeJson(path.join(outDir, "weapon-enhancements.json"), weaponEnhancements);
  writeJson(path.join(outDir, "export-report.json"), report);

  console.log(`\n✅ Export complete`);
  console.log(`Input:  ${report.input}`);
  console.log(`Output: ${path.resolve(outDir)}`);
  console.log(`Classes: ${report.counts.classes}`);
  console.log(`Techniques: ${report.counts.techniques}`);
  console.log(`Feats: ${report.counts.feats}`);
  console.log(`Origins: ${report.counts.origins}`);
  console.log(`Weapon Bases: ${report.counts.weaponBases}`);
  console.log(`Weapon Profiles: ${report.counts.weaponProfiles}`);
  console.log(`Weapon Enhancements: ${report.counts.weaponEnhancements}`);
  if (report.warnings.length) {
    console.log(`\n⚠️  Warnings (${report.warnings.length}):`);
    for (const w of report.warnings.slice(0, 25)) console.log(` - ${w}`);
    if (report.warnings.length > 25) console.log(` ... ${report.warnings.length - 25} more (see export-report.json)`);
  }
  console.log("");
}

main();
