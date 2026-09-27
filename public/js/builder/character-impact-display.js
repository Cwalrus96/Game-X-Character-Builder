// Presentation of reviewed consequences; the session/graph still decides what changes.
const text = value => typeof value === "string" ? value.trim() : "";
const titleCase = value => text(value).replace(/(^|[ -])\w/g, letter => letter.toUpperCase());

const CHANGE_SUBJECTS = Object.freeze({
  SetClass: "your class", SetLevel: "your level", SetPrimaryAttribute: "your primary attribute",
  SetOrigin: "your origin", SetOriginKeystone: "your origin keystone", SetAttributeValue: "this attribute",
  SetClassUtilitySkills: "your utility skills", SetSkillRank: "this skill", SetCombatSkills: "your combat skills",
  SetSettingSkills: "your utility skills", SetFeatSelection: "your feats", SetFeatOptions: "this feat option",
  SetClassFeatureOptions: "this class feature choice", SetGrantChoices: "this granted choice",
  SetTraitChoice: "this Trait choice", RemoveTraitChoice: "this Trait choice",
  SetTechniqueSelection: "your techniques", AddWeapon: "your equipment", RemoveWeapon: "your equipment",
  UpdateWeapon: "this weapon", AddWeaponEnhancement: "this weapon enhancement",
  RemoveWeaponEnhancement: "this weapon enhancement", UpdateWeaponEnhancement: "this weapon enhancement",
  AddBond: "your Bonds", RemoveBond: "your Bonds", UpdateBond: "this Bond",
  SetBackgroundKeystones: "your background keystones",
});

function flatten(entries = []) {
  return entries.flatMap(entry => [entry, ...flatten(entry.options || [])]);
}

function recordName(entries, field, key, fallback) {
  const record = key ? entries?.find(entry => entry[field] === key) : null;
  return text(record?.name || record?.techniqueName) || text(fallback) || text(key);
}

function describeImpact(impact, gameData, character) {
  const before = impact.before;
  const nodeId = text(impact.nodeId);
  const path = text(impact.path);
  const sourceId = text(before?.sourceId) || nodeId;
  const sourceType = sourceId.split(":")[0];
  const key = typeof before === "string" ? before : nodeId.split(":").at(-1);
  let identity = nodeId || path || impact.impactId;
  let kind = "Choice";
  let name = text(impact.label);
  let detail = "";

  if (nodeId.startsWith("trait-weapon:")) {
    kind = "Weapon"; detail = `weapon ${nodeId.split(":").at(-1)}`;
  } else if (impact.code === "source-owned-ability-removed") {
    const kinds = { "class-feature": "Class feature", "class-option": "Class feature", "feat-selection": "Feat", "feat-option": "Feat option", "origin-feature": "Origin feature" };
    kind = kinds[sourceType] || "Ability";
    name = text(before?.name || name).replace(/^(?:Class Feature|Feat Option|Feat|Origin Feature)\s*-\s*/i, "");
    identity = sourceId;
  } else if (path === "builder.primaryAttribute") {
    kind = "Primary attribute"; name = titleCase(before || name); identity = path;
  } else if (path === "builder.originKey") {
    kind = "Origin"; name = recordName(gameData.origins, "originKey", key, name);
  } else if (path.startsWith("builder.attributes.")) {
    kind = "Attribute"; name = titleCase(name || path.split(".").at(-1));
  } else if (path === "builder.selectedFeats") {
    kind = "Feat"; name = recordName(gameData.feats, "featKey", key, name);
  } else if (path === "builder.selectedFeatOptions") {
    kind = "Feat option"; name = recordName(flatten(gameData.feats || []), "featKey", key, name);
  } else if (path === "builder.selectedClassFeatureOptions") {
    kind = "Class feature";
    const classKey = character?.builder?.classKey || nodeId.split(":")[1];
    name = recordName(flatten(gameData.classFeatures?.[classKey] || []), "featureKey", key, name);
    identity = `class-option:${classKey}:${key}`;
  } else if (path === "builder.selectedTechniques") {
    kind = "Technique"; name = recordName(gameData.techniques, "techniqueKey", key, name);
  } else if (path.startsWith("builder.traitChoices.")) {
    kind = "Trait"; name = recordName(gameData.traits, "traitKey", before?.traitKey, name);
  } else if (path.startsWith("builder.grantChoices.")) {
    identity = `grant-answer:${before?.choiceId || path.slice("builder.grantChoices.".length)}`;
    if (before?.type === "weapon") {
      kind = "Weapon"; name = text(before.customName) || recordName(gameData.weaponBases, "weaponKey", before.weaponKey, name);
    } else if (before?.type === "technique") {
      kind = "Technique"; name = recordName(gameData.techniques, "techniqueKey", before.techniqueKey, name);
    } else if (before?.type === "keystone") {
      kind = "Keystone"; name = text(before.sourceLabel) || name;
    } else {
      name = text(before?.value) || name;
    }
  } else if (path === "builder.weapons") {
    const enhancement = nodeId.startsWith("weapon-enhancement:");
    kind = enhancement ? "Weapon enhancement" : "Weapon";
    name = text(before?.customName) || recordName(enhancement ? gameData.weaponEnhancements : gameData.weaponBases,
      enhancement ? "enhancementKey" : "weaponKey", enhancement ? before?.enhancementKey : before?.weaponKey, name);
    if (!enhancement && (before?.sourceChoiceId || before?.choiceId)) identity = `grant-answer:${before.sourceChoiceId || before.choiceId}`;
  } else if (path.startsWith("builder.resources.")) {
    kind = "Resource"; name = text(before?.name) || name;
  } else if (path === "builder.bonds") {
    kind = "Bond"; name = text(before?.name) || name;
  } else if (path === "builder.selectedClassUtilitySkills" || nodeId.startsWith("skill:")) {
    kind = "Skill"; name = titleCase(name);
  }

  if (sourceType === "class-feature" && impact.code === "source-owned-ability-removed") {
    const [, classKey, featureKey] = sourceId.split(":");
    const record = flatten(gameData.classFeatures?.[classKey] || []).find(entry => entry.featureKey === featureKey);
    if (record?.level) detail = `level ${record.level}`;
  }
  return { identity, label: `${kind}: ${name || "Unnamed choice"}`, detail };
}

function scalarAt(character, path) {
  const value = text(path).split(".").reduce((parent, field) => parent?.[field], character);
  return ["string", "number", "boolean"].includes(typeof value) ? value : undefined;
}

/** Convert only confirmation impacts to a readable list, retaining machine identities. */
export function describeCharacterChange(proposal, { gameData = {}, character } = {}) {
  const removals = new Map();
  const changes = new Map();
  for (const impact of proposal?.impacts || []) {
    if (impact.category !== "confirmation-required") continue;
    const item = describeImpact(impact, gameData, character);
    if (impact.code === "automatic-technique-removed-from-normal-slots") {
      changes.set(item.identity, { ...item, label: `${item.label} — now granted automatically` });
    } else if (impact.type === "remove") {
      if (!removals.has(item.identity)) removals.set(item.identity, item);
    } else {
      const before = scalarAt(proposal.proposed, impact.path) ?? impact.before;
      const after = scalarAt(proposal.reconciled, impact.path) ?? impact.after;
      const scalar = value => ["string", "number", "boolean"].includes(typeof value);
      // Unrecognized effects keep their explanation instead of silently disappearing.
      const label = scalar(before) && scalar(after)
        ? `${item.label} — ${before || 0} → ${after || 0}`
        : text(impact.message) || `${item.label} will change.`;
      changes.set(item.identity, { ...item, label });
    }
  }
  // The same feat/choice may appear both as an answer and its derived sheet ability.
  // Only shared identities are combined; equal display names alone are never duplicates.
  const removed = [...removals.values()].map(item => {
    const repeatedName = [...removals.values()].filter(other => other.label === item.label).length > 1;
    return repeatedName && item.detail ? `${item.label} (${item.detail})` : item.label;
  });
  const adjusted = [...changes.values()].map(item => item.label);
  const subject = CHANGE_SUBJECTS[proposal?.command?.type];
  const action = subject ? `Changing ${subject}` : "This change";
  return {
    title: "Apply this change?",
    message: removed.length
      ? `${action} will remove the following choices and features:`
      : `${action} will make the following adjustments:`,
    messages: removed.length ? removed : adjusted,
    sections: removed.length && adjusted.length ? [{ message: "It will also make these adjustments:", messages: adjusted }] : [],
  };
}
