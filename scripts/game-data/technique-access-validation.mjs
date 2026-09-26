import { canonicalSkillKey } from "../../public/js/core/skill-identity.js";
import { canonicalTagKey } from "./source-v5-values.mjs";

const list = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const tagIdentity = (value) => canonicalTagKey(value).split("=")[0];

/** Resolve names against existing source declarations, never against the new rule itself. */
export function createTechniqueAccessReferences(model) {
  const skills = new Set((model.classSkills || []).map((row) => canonicalSkillKey(row.skillName || row.skillKey)));
  for (const technique of model.techniques || []) {
    for (const route of technique.selectionRoutes || []) if (route.type === "skill") skills.add(canonicalSkillKey(route.name));
    if (technique.associatedSkill && !/^(provider|none)$/i.test(technique.associatedSkill)) skills.add(canonicalSkillKey(technique.associatedSkill));
  }
  const weaponTags = new Set((model.weaponBases || []).flatMap((weapon) => weapon.tags || []).map(tagIdentity));
  return { skills, weaponTags };
}

export function validateTechniqueAccessReferences(grant, row, index, references, add) {
  const fields = grant.type === "technique" && grant.access ? ["access"]
    : grant.type === "skill-substitution" ? ["fromSkill", "toSkill"] : [];
  if (!fields.length) return;
  for (const field of fields) for (const value of list(grant[field])) {
    if (!references.skills.has(canonicalSkillKey(value))) add("error", "unresolved-skill-reference",
      `Grant field "${field}" references undeclared skill "${value}".`, row, "grants", { field, value, expressionIndex: index });
  }
  for (const value of list(grant.weaponTag)) if (!references.weaponTags.has(tagIdentity(value))) add("error", "unresolved-weapon-tag-reference",
    `Grant weaponTag "${value}" does not occur on a WeaponBase.`, row, "grants", { field: "weaponTag", value, expressionIndex: index });
}

export function validateDeferredNaturalWeapon(weapon, add) {
  if ((weapon.tags || []).some((tag) => tagIdentity(tag) === "natural")) add("warning", "natural-weapon-projection-deferred",
    "Natural weapon acquisition and provider rank/skill projection are retained but not implemented.", weapon, "tags");
  for (const tag of weapon.tags || []) {
    const reach = String(tag).trim().match(/^reach(?:\s*[=+]\s*|\s+)(.+)$/i);
    if (reach && !/^\d+$/.test(reach[1])) add("warning", "dynamic-weapon-tag-deferred",
      `Weapon tag "${tag}" is preserved; its dynamic reach cannot yet be evaluated.`, weapon, "tags", { tag });
  }
}
