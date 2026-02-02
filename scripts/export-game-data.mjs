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
 *   - export-report.json (warnings + counts)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx/xlsx.mjs"; // SheetJS ESM build (use XLSX.read with a Buffer)

const REQUIRED_SHEETS = ["Classes", "ClassFeatures", "Feats", "Techniques"];

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
  if (!fs.existsSync(inputXlsx)) die(`Input XLSX not found: ${inputXlsx}`);

  const wb = XLSX.read(fs.readFileSync(inputXlsx), { cellDates: false });
  for (const s of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(s)) die(`Workbook is missing required sheet: ${s}`);
  }

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

      prerequisites: toStr(r.prerequisites) || null,
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

  const feats = featRows.map((r) => ({
    featType: toStr(r.featType),
    classKey: toStr(r.classKey) || null,
    minLevel: toIntOrNull(r.minLevel),
    name: toStr(r.name),
    prerequisites: toStr(r.prerequisites) || null,
    description: toStr(r.description) || null,
    grantsSkills: splitList(r.grantsSkills),
    grantsTechniques: splitList(r.grantsTechniques),
    grantsNotes: toStr(r.grantsNotes) || null,
    review: toStr(r.review) || null,
  }));

  // --- Class Features (with contiguous option groups) ---
  const cfRows = readSheetAsObjects(wb, "ClassFeatures");
  const featuresByClass = {};

  function ensureClassBucket(classKey) {
    if (!featuresByClass[classKey]) featuresByClass[classKey] = [];
    return featuresByClass[classKey];
  }

  let currentGroup = null;

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

    const bucket = ensureClassBucket(classKey);

    const base = {
      classKey,
      level,
      name: toStr(r.name) || null,
      description: toStr(r.description) || null,
      prereqs: toStr(r.prereqs) || null,
      grantsSkills: splitList(r.grantsSkills),
      grantsTechniques: splitList(r.grantsTechniques),
      grantsNotes: toStr(r.grantsNotes) || null,
    };

    if (rowType === "OPTION_GROUP") {
      currentGroup = {
        type: "optionGroup",
        ...base,
        chooseCount: toIntOrNull(r.chooseCount) ?? 1,
        options: [],
      };
      bucket.push(currentGroup);
      continue;
    }

    if (rowType === "OPTION") {
      if (!currentGroup) {
        report.warnings.push(`ClassFeatures: OPTION row "${base.name || "(unnamed)"}" has no preceding OPTION_GROUP (classKey=${classKey}, level=${level}).`);
        // Treat as standalone feature so you don't lose data
        bucket.push({ type: "feature", ...base });
        continue;
      }
      // Validate same classKey/level as group (warn, then still attach)
      if (currentGroup.classKey !== classKey || currentGroup.level !== level) {
        report.warnings.push(`ClassFeatures: OPTION row "${base.name || "(unnamed)"}" classKey/level differs from current group "${currentGroup.name}". Expected ${currentGroup.classKey} L${currentGroup.level}, got ${classKey} L${level}.`);
      }
      currentGroup.options.push({
        ...base,
        type: "option",
      });
      continue;
    }

    // Any non-option row closes the current group
    currentGroup = null;

    // Default: treat as automatic feature
    bucket.push({
      type: "feature",
      ...base,
    });
  }

  // Warn about missing skill progression in class feature skill-choice rows
  // (User requested progression tracking, but sheet may not encode it yet.)
  for (const [classKey, entries] of Object.entries(featuresByClass)) {
    for (const entry of entries) {
      const checkEntry = (e) => {
        // If a row grants skills but none have ":fast/medium/slow" syntax, warn.
        if (e.grantsSkills && e.grantsSkills.length) {
          const hasProg = e.grantsSkills.some((s) => /:\s*(fast|medium|slow)$/i.test(s));
          if (!hasProg) {
            report.warnings.push(`ClassFeatures: ${classKey} L${e.level} "${e.name || "(unnamed)"}" grantsSkills has no progression (consider "Skill:Fast").`);
          }
        }
      };
      checkEntry(entry);
      if (entry.type === "optionGroup") {
        for (const opt of entry.options) checkEntry(opt);
      }
    }
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
  };

  writeJson(path.join(outDir, "game-x-data.json"), combined);
  writeJson(path.join(outDir, "classes.json"), classes);
  writeJson(path.join(outDir, "class-features.json"), featuresByClass);
  writeJson(path.join(outDir, "feats.json"), feats);
  writeJson(path.join(outDir, "techniques.json"), techniques);
  writeJson(path.join(outDir, "export-report.json"), report);

  console.log(`\n✅ Export complete`);
  console.log(`Input:  ${report.input}`);
  console.log(`Output: ${path.resolve(outDir)}`);
  console.log(`Classes: ${report.counts.classes}`);
  console.log(`Techniques: ${report.counts.techniques}`);
  console.log(`Feats: ${report.counts.feats}`);
  if (report.warnings.length) {
    console.log(`\n⚠️  Warnings (${report.warnings.length}):`);
    for (const w of report.warnings.slice(0, 25)) console.log(` - ${w}`);
    if (report.warnings.length > 25) console.log(` ... ${report.warnings.length - 25} more (see export-report.json)`);
  }
  console.log("");
}

main();
