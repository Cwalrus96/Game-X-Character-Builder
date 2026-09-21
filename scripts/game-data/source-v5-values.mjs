import { canonicalSkillKey, canonicalSkillName } from "../../public/js/core/skill-identity.js";
import { clean, diagnostic, nullable } from "./source-v4.mjs";

export { canonicalSkillKey, canonicalSkillName };

// Tag spelling is authored once. Numeric tag values remain separate from identity.
export function canonicalTagKey(value) {
  const text = clean(value);
  const valued = text.match(/^(.*?)\s*(?:=|\s)\s*(\d+)$/);
  const name = valued ? valued[1] : text;
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return valued ? `${key}=${valued[2]}` : key;
}

export const namedList = (value) => clean(value).split(/\s+(?:OR|AND)\s+|[,;]/i).map(clean).filter(Boolean);

export function numericValue(row, field, context, diagnostics, { integer = false, min = null } = {}) {
  const raw = clean(row[field]);
  if (!raw) return null;
  if (/^(?:X|TBD|unknown|unassigned|unspecified|\?)$/i.test(raw)) {
    diagnostics.push(diagnostic("unresolved-number", `Field "${field}" retains an unresolved authored value "${raw}".`, { ...context, column: field, severity: "warning" }));
    return null;
  }
  const valid = integer ? /^-?\d+$/.test(raw) : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw);
  const number = Number(raw);
  if (!valid || !Number.isFinite(number) || (integer && !Number.isInteger(number)) || (min !== null && number < min)) {
    diagnostics.push(diagnostic(integer ? "invalid-integer" : "invalid-number", `Field "${field}" must be ${integer ? "an integer" : "numeric"}${min === null ? "" : ` of at least ${min}`}; authored value is preserved.`, { ...context, column: field }));
    return null;
  }
  return number;
}

export function selectionRoutes(value, context, diagnostics) {
  const raw = nullable(value);
  if (!raw) return Object.freeze([]);
  return Object.freeze(raw.split(/\s+OR\s+|,/i).map(clean).map((part) => {
    if (!part) {
      diagnostics.push(diagnostic("invalid-selection", "Selection contains an empty alternative.", { ...context, column: "selection" }));
      return Object.freeze({ type: "unresolved", raw: part });
    }
    if (/^granted$/i.test(part)) return Object.freeze({ type: "granted" });
    const match = part.match(/^(tag|weaponTag)=(.+)$/i);
    if (match) return Object.freeze({
      type: match[1].toLowerCase() === "tag" ? "tag" : "weaponTag",
      name: clean(match[2]), tagKey: canonicalTagKey(match[2]),
    });
    if (/[=|;]/.test(part)) {
      diagnostics.push(diagnostic("invalid-selection", `Unsupported selection route "${part}".`, { ...context, column: "selection" }));
      return Object.freeze({ type: "unresolved", raw: part });
    }
    return Object.freeze({ type: "skill", name: canonicalSkillName(part), skillKey: canonicalSkillKey(part) });
  }));
}

export function pumpingMap(value, context, diagnostics) {
  const raw = clean(value);
  if (!raw) return null;
  const map = {};
  for (const part of raw.split(";")) {
    const match = part.trim().match(/^(0|[1-9]\d*)\s*=\s*(.+)$/);
    if (!match) {
      diagnostics.push(diagnostic("invalid-rank-map", "Pumping entries require nonnegative rank=effect syntax; the original map is preserved.", { ...context, column: "pumpingByRank" }));
      continue;
    }
    if (Object.hasOwn(map, match[1])) {
      diagnostics.push(diagnostic("duplicate-rank", `Pumping repeats rank "${match[1]}"; the original map is preserved.`, { ...context, column: "pumpingByRank" }));
      continue;
    }
    map[match[1]] = match[2];
  }
  return Object.freeze(map);
}

export function energyOptions(value, context, diagnostics) {
  if (!clean(value)) return Object.freeze([]);
  const options = [];
  for (const part of clean(value).split(";")) {
    const match = part.match(/^\s*([^=]+?)\s*=\s*(.+?)\s*$/);
    if (!match) {
      diagnostics.push(diagnostic("invalid-cost-option", "Energy-cost options require mode=value syntax; the source is preserved.", { ...context, column: "energyCostOptions" }));
      continue;
    }
    options.push(Object.freeze({ key: match[1], value: /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(match[2]) ? Number(match[2]) : match[2] }));
  }
  return Object.freeze(options);
}

/** Derive roles and every conditional progression without another authored table. */
export function deriveV5ClassSkills(classes, diagnostics) {
  const result = [];
  for (const record of classes) {
    const source = record.sourceValues;
    const context = { ...record.source };
    const techniques = namedList(source.combatTechniqueSkill);
    const techniqueKeys = new Set(techniques.map(canonicalSkillKey));
    const represented = new Set();
    let displayOrder = 0;
    const add = (name, role, progression, whenPrimaryAttribute, column) => {
      result.push(Object.freeze({
        classKey: record.classKey, skillKey: canonicalSkillKey(name), skillName: canonicalSkillName(name),
        role, progression, whenPrimaryAttribute, choiceGroup: role === "utility-option" ? "starting-utility" : null,
        displayOrder: ++displayOrder, source: Object.freeze({ ...record.source, column }),
      }));
    };
    for (const part of clean(source.combatSkills).split(";").map(clean).filter(Boolean)) {
      const colon = part.indexOf(":");
      if (colon < 1) {
        diagnostics.push(diagnostic("invalid-class-skill", `Combat skill entry "${part}" lacks name:progression.`, { ...context, column: "combatSkills" }));
        continue;
      }
      const name = part.slice(0, colon).trim();
      const key = canonicalSkillKey(name);
      const role = techniqueKeys.has(key) ? "combat-technique" : "combat-defense";
      for (const progression of part.slice(colon + 1).split(",").map(clean)) {
        const match = progression.match(/^(fast|medium|slow)(?:\s*\(([A-Za-z][A-Za-z ]*)\s+Primary\))?$/i);
        if (!match) {
          diagnostics.push(diagnostic("invalid-class-progression", `Unrecognized progression "${progression}" for ${name}; source meaning is preserved for review.`, { ...context, column: "combatSkills" }));
          add(name, role, null, null, "combatSkills");
          continue;
        }
        represented.add(key);
        add(name, role, match[1].toLowerCase(), match[2]?.trim() || null, "combatSkills");
      }
    }
    for (const name of techniques) {
      if (represented.has(canonicalSkillKey(name))) continue;
      add(name, "combat-technique", null, null, "combatTechniqueSkill");
      diagnostics.push(diagnostic("unresolved-class-progression", `Technique skill "${name}" has no resolved combat progression.`, { ...context, column: "combatTechniqueSkill", severity: "warning" }));
    }
    for (const name of namedList(source.utilitySkillOptions)) add(name, "utility-option", null, null, "utilitySkillOptions");
  }
  return Object.freeze(result);
}
