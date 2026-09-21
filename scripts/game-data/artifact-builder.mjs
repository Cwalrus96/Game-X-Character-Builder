import { createHash } from "node:crypto";

export const RUNTIME_ARTIFACT_SCHEMA_VERSION = 2;
export const EXPORTER_VERSION = "2.0.1-wpb-staging";
export const AUTHORING_V5_ARTIFACT_SCHEMA_VERSION = 3;
export const AUTHORING_V5_EXPORTER_VERSION = "3.0.0-wpb-schema-v5";

export function artifactVersionsForModel(model) {
  return Number(model?.metadata?.sourceSchemaVersion) === 5
    ? { schemaVersion: AUTHORING_V5_ARTIFACT_SCHEMA_VERSION, exporterVersion: AUTHORING_V5_EXPORTER_VERSION }
    : { schemaVersion: RUNTIME_ARTIFACT_SCHEMA_VERSION, exporterVersion: EXPORTER_VERSION };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => key !== "source" && item !== undefined)
    .map(([key, item]) => [key, cleanObject(item)]));
}

function actionFields(action = {}) {
  return {
    actionType: action.actionType,
    actions: action.actions,
    trigger: action.trigger,
    energyCost: action.energyCost?.value ?? null,
    energyCostKind: action.energyCost?.kind ?? null,
    energyCostOptions: cleanObject(action.energyCost?.options || []),
    pumpable: action.energyCost?.kind === "variable",
    strainCost: action.strainCost,
    sustained: action.sustained,
    rollRequired: action.rollRequired,
    attribute: action.attribute,
    skill: action.skill,
    defense: action.defense,
    range: action.range,
    targets: action.targets,
    damage: action.damage,
    onSuccess: action.onSuccess,
    onCriticalSuccess: action.onCriticalSuccess,
    onFailure: action.onFailure,
    onCriticalFailure: action.onCriticalFailure,
    bondEffect: action.bondEffect,
  };
}

function authoringFields(row, version) {
  if (version !== 3) return {};
  return {
    expressionSyntaxVersion: 3,
    sourceValues: row.sourceValues,
    sourceLocation: row.source,
    runtimeSupport: row.runtimeSupport,
    status: row.status,
    selectable: row.selectable,
    traitKeys: row.traitKeys,
  };
}

function featureEntry(row, ownerField, version) {
  return cleanObject({
    ...authoringFields(row, version),
    type: row.kind,
    [ownerField]: row[ownerField],
    level: row.level,
    featureKey: row.featureKey,
    name: row.name,
    description: row.description,
    chooseCount: row.chooseCount,
    grants: row.grants,
    grantsRaw: row.grantsRaw,
    grantText: row.grantText,
    grantNotes: row.grantText,
    prerequisites: row.prerequisites,
    prerequisitesRaw: row.prerequisitesRaw,
    notes: row.notes,
  });
}

function nestOwnedFeatures(rows, ownerField, version) {
  const byOwner = {};
  const parentEntries = new Map();
  for (const row of rows) {
    const entry = featureEntry(row, ownerField, version);
    if (row.kind === "optionGroup") entry.options = [];
    parentEntries.set(`${row[ownerField]}\u0000${row.featureKey}`, entry);
  }
  for (const row of rows) {
    const entry = parentEntries.get(`${row[ownerField]}\u0000${row.featureKey}`);
    if (row.parentKey) {
      const parent = parentEntries.get(`${row[ownerField]}\u0000${row.parentKey}`);
      parent.options.push(entry);
    } else {
      (byOwner[row[ownerField]] ||= []).push(entry);
    }
  }
  return byOwner;
}

function nestFeats(rows, version) {
  const topLevel = [];
  const parents = new Map();
  for (const row of rows) {
    const entry = cleanObject({
      ...authoringFields(row, version),
      ...(version === 3 ? { archetypeKey: row.archetypeKey, archetypeName: row.archetypeName } : {}),
      type: row.kind,
      category: row.category,
      featKey: row.featKey,
      name: row.name,
      description: row.description,
      featType: row.featType,
      chooseCount: row.chooseCount,
      grants: row.grants,
      grantsRaw: row.grantsRaw,
      grantText: row.grantText,
      grantNotes: row.grantText,
      prerequisites: row.prerequisites,
      prerequisitesRaw: row.prerequisitesRaw,
      notes: row.notes,
    });
    if (row.kind === "optionGroup") entry.options = [];
    parents.set(row.featKey, entry);
  }
  for (const row of rows) {
    const entry = parents.get(row.featKey);
    if (row.parentKey) parents.get(row.parentKey).options.push(entry);
    else topLevel.push(entry);
  }
  return topLevel;
}

function buildClasses(model, version) {
  return model.classes.map((row) => {
    const skills = model.classSkills.filter((skill) => skill.classKey === row.classKey);
    const combat = skills.filter((skill) => skill.role !== "utility-option");
    const technique = skills.find((skill) => skill.role === "combat-technique");
    return cleanObject({
      ...authoringFields(row, version),
      ...(version === 3 ? { authoringSkills: row.authoringSkills } : {}),
      classKey: row.classKey,
      name: row.name,
      pitch: row.pitch,
      examples: row.examples,
      hpProgression: row.hpProgression,
      primaryAttributes: row.primaryAttributes,
      primaryAttributeA: row.primaryAttributes[0] || null,
      primaryAttributeB: row.primaryAttributes[1] || null,
      combatTechniqueSkill: version === 3
        ? [...new Set(skills.filter((skill) => skill.role === "combat-technique").map((skill) => skill.skillName))].join(", ")
        : technique?.skillName || row.compatibilitySkills.combatTechniqueSkill,
      combatSkills: combat.map((skill) => ({
        skillKey: skill.skillKey,
        name: skill.skillName,
        role: skill.role,
        progression: skill.progression,
        whenPrimaryAttribute: skill.whenPrimaryAttribute,
      })),
      utilitySkillOptions: skills.filter((skill) => skill.role === "utility-option").map((skill) => skill.skillName),
      status: row.status,
      selectable: row.selectable,
      notes: row.notes,
    });
  });
}

function buildTechniques(model, version) {
  return model.techniques.map((row) => cleanObject({
    ...authoringFields(row, version),
    ...(version === 3 ? {
      selection: row.selection,
      selectionRoutes: row.selectionRoutes,
      associatedSkill: row.associatedSkill,
      associatedSkillKey: row.associatedSkillKey,
      basicAttack: row.basicAttack,
      basicAttackRaw: row.basicAttackRaw,
      pumpingByRank: row.pumpingByRank,
      pumpingByRankRaw: row.pumpingByRankRaw,
    } : {}),
    techniqueKey: row.techniqueKey,
    techniqueName: row.name,
    description: row.description,
    skillKeys: row.skillKeys,
    skill: row.legacySkill,
    rank: row.rank,
    tags: row.tags,
    tagKeys: row.tagKeys,
    prerequisites: row.prerequisites,
    prerequisitesRaw: row.prerequisitesRaw,
    prerequisiteText: row.prerequisiteText,
    ...actionFields(row.action),
    ...(version === 3 ? { skill: row.associatedSkill || row.legacySkill } : {}),
    damageByRank: row.damageByRank,
    pumpDamageByRank: row.pumpDamageByRank,
    rankNotes: row.rankNotes,
    selectionMode: row.selectionMode,
    selectable: row.selectable,
    notes: row.notes,
    sourceNote: row.sourceNote,
  }));
}

function buildOrigins(model, version) {
  const features = nestOwnedFeatures(model.originFeatures, "originKey", version);
  return model.origins.map((row) => cleanObject({
    ...authoringFields(row, version),
    originKey: row.originKey,
    name: row.name,
    status: row.status,
    selectable: row.selectable,
    summary: row.summary,
    description: row.description,
    originKeystone: row.originKeystone,
    questions: row.questions,
    futureUpgrades: row.futureUpgrades,
    examples: row.examples,
    notes: row.notes,
    features: features[row.originKey] || [],
  }));
}

function buildWeaponBases(model, version) {
  const techniqueByKey = version === 3 ? new Map(buildTechniques(model, version).map((row) => [row.techniqueKey, row])) : null;
  return model.weaponBases.map((row) => cleanObject({
    ...authoringFields(row, version),
    ...(version === 3 ? { techniqueKeys: row.techniqueKeys, traitsText: row.traitsText } : {}),
    weaponKey: row.weaponKey,
    name: row.name,
    description: row.description,
    minRank: row.minRank,
    tags: row.tags,
    tagKeys: row.tagKeys,
    notes: row.notes,
    sourceNote: row.sourceNote,
    ...(version === 3 ? { techniqueSkills: [...new Set((row.techniqueKeys || []).flatMap((key) => {
      const technique = techniqueByKey.get(key);
      return technique?.associatedSkill ? [technique.associatedSkill]
        : (technique?.selectionRoutes || []).filter((route) => route.type === "skill").map((route) => route.name);
    }))] } : {}),
    profiles: version === 3 ? (row.techniqueKeys || []).map((key) => ({
      ...techniqueByKey.get(key), profileType: "technique", profileName: techniqueByKey.get(key)?.techniqueName,
    })) : model.weaponProfiles.filter((profile) => profile.weaponKey === row.weaponKey).map((profile) => ({
      profileType: profile.profileType,
      profileName: profile.profileName,
      description: profile.description,
      rank: profile.rank,
      tags: profile.tags,
      ...actionFields(profile.action),
      damageTier: profile.damageTier,
      damageByRank: profile.damageByRank,
      pumpDamageByRank: profile.pumpDamageByRank,
      rankNotes: profile.rankNotes,
      prerequisites: profile.prerequisites,
      prerequisitesRaw: profile.prerequisitesRaw,
      notes: profile.notes,
      sourceNote: profile.sourceNote,
    })),
  }));
}

function sourceRevision(provenance, modelSha256) {
  return cleanObject({
    fileId: provenance.fileId,
    driveVersion: provenance.driveVersion,
    modifiedTime: provenance.modifiedTime,
    modelSha256,
  });
}

export function buildGameDataArtifacts({ model, validation, provenance }) {
  if (!model || !validation?.ok) {
    throw new Error("Artifact construction requires a canonical model with successful whole-model validation.");
  }
  const { schemaVersion: version, exporterVersion } = artifactVersionsForModel(model);
  const modelSha256 = sha256(canonicalJson(model));
  if (version === 3) {
    const support = validation.runtimeSupportBySource || {};
    model = Object.fromEntries(Object.entries(model).map(([field, value]) => [field,
      Array.isArray(value) ? value.map((row) => {
        if (!row || typeof row !== "object" || !row.source) return row;
        const runtimeSupport = support[`${row.source.sheet}:${row.source.row}`] || row.runtimeSupport || { status: "supported", reasons: [] };
        return { ...row, runtimeSupport, ...(runtimeSupport.status === "deferred" ? { selectable: false } : {}) };
      }) : value,
    ]));
  }
  const classFeatures = nestOwnedFeatures(model.classFeatures, "classKey", version);
  const collections = {
    classes: buildClasses(model, version),
    classSkills: cleanObject(model.classSkills),
    classFeatures,
    feats: nestFeats(model.feats, version),
    techniques: buildTechniques(model, version),
    origins: buildOrigins(model, version),
    weaponBases: buildWeaponBases(model, version),
    weaponEnhancements: cleanObject(model.weaponEnhancements.map((row) => ({ ...row, ...authoringFields(row, version) }))),
    ...(version === 3 ? { traits: cleanObject((model.traits || []).map((row) => ({ ...row, ...authoringFields(row, version) }))) } : {}),
  };
  const combined = {
    schemaVersion: version,
    sourceSchemaVersion: Number(model.metadata.sourceSchemaVersion),
    exporterVersion,
    ...(version === 3 ? { expressionSyntaxVersion: 3, diagnostics: cleanObject(validation.diagnostics || []) } : {}),
    sourceRevision: sourceRevision(provenance, modelSha256),
    ...collections,
  };
  const values = {
    "classes.json": collections.classes,
    "class-skills.json": collections.classSkills,
    "class-features.json": collections.classFeatures,
    "feats.json": collections.feats,
    "techniques.json": collections.techniques,
    "origins.json": collections.origins,
    "weapon-bases.json": collections.weaponBases,
    "weapon-enhancements.json": collections.weaponEnhancements,
    ...(version === 3 ? { "traits.json": collections.traits } : {}),
    "game-x-data.json": combined,
  };
  const files = Object.entries(values).map(([name, value]) => {
    const text = canonicalJson(value);
    return Object.freeze({ name, value, text, byteLength: Buffer.byteLength(text), sha256: sha256(text) });
  });
  return Object.freeze({
    schemaVersion: version,
    exporterVersion,
    modelSha256,
    combined,
    files: Object.freeze(files),
  });
}
