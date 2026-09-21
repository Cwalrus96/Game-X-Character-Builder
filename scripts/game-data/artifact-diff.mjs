import { canonicalJson, sha256 } from "./artifact-builder.mjs";

function flattenOptions(rows, identity, output = []) {
  for (const row of rows || []) {
    output.push({ id: identity(row), value: row });
    flattenOptions(row.options, identity, output);
  }
  return output;
}

function semanticRecords(fileName, value, { techniqueNameToKey = new Map() } = {}) {
  if (fileName === "classes.json" && Array.isArray(value)) {
    return value.map((row) => ({ id: row.classKey, value: row }));
  }
  if (fileName === "class-skills.json" && Array.isArray(value)) {
    return value.map((row) => ({ id: [row.classKey, row.skillKey, row.role, row.whenPrimaryAttribute || "", row.choiceGroup || ""].join("/"), value: row }));
  }
  if (fileName === "class-features.json" && value && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([owner, rows]) => flattenOptions(rows, (row) => `${owner}/${row.featureKey}`));
  }
  if (fileName === "feats.json" && Array.isArray(value)) {
    return flattenOptions(value, (row) => row.featKey);
  }
  if (fileName === "techniques.json" && Array.isArray(value)) {
    return value.map((row) => ({
      id: row.techniqueKey || techniqueNameToKey.get(row.techniqueName) || `legacy-name:${row.techniqueName}`,
      value: row,
      legacyIdentityBridge: !row.techniqueKey,
    }));
  }
  if (fileName === "origins.json" && Array.isArray(value)) {
    return value.flatMap((row) => [
      { id: row.originKey, value: row },
      ...flattenOptions(row.features, (feature) => `${row.originKey}/${feature.featureKey}`),
    ]);
  }
  if (fileName === "weapon-bases.json" && Array.isArray(value)) {
    return value.flatMap((row) => [
      { id: row.weaponKey, value: row },
      ...(row.profiles || []).map((profile) => ({
        id: `${row.weaponKey}/${profile.profileType}/${profile.profileName}/${profile.rank}`,
        value: profile,
        compositeIdentity: true,
      })),
    ]);
  }
  if (fileName === "weapon-enhancements.json" && Array.isArray(value)) {
    return value.map((row) => ({ id: row.enhancementKey, value: row }));
  }
  if (fileName === "traits.json" && Array.isArray(value)) {
    return value.map((row) => ({ id: row.traitKey, value: row }));
  }
  return null;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function structuralChanges(left, right, pointer = "") {
  if (same(left, right)) return [];
  const leftObject = left !== null && typeof left === "object";
  const rightObject = right !== null && typeof right === "object";
  if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) {
    return [{ path: pointer || "/", before: left ?? null, after: right ?? null }];
  }
  if (Array.isArray(left)) {
    const result = [];
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      result.push(...structuralChanges(left[index], right[index], `${pointer}/${index}`));
    }
    return result;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) => structuralChanges(left[key], right[key], `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
}

function semanticDiff(fileName, before, after) {
  const techniqueNameToKey = fileName === "techniques.json"
    ? new Map((after || []).filter((row) => row.techniqueKey && row.techniqueName).map((row) => [row.techniqueName, row.techniqueKey]))
    : new Map();
  const beforeRecords = semanticRecords(fileName, before, { techniqueNameToKey });
  const afterRecords = semanticRecords(fileName, after, { techniqueNameToKey });
  if (!beforeRecords || !afterRecords) return null;
  const beforeMap = new Map(beforeRecords.map((record) => [record.id, record.value]));
  const afterMap = new Map(afterRecords.map((record) => [record.id, record.value]));
  const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].filter(Boolean).sort();
  const added = [];
  const removed = [];
  const changed = [];
  for (const id of ids) {
    if (!beforeMap.has(id)) added.push(id);
    else if (!afterMap.has(id)) removed.push(id);
    else {
      const fields = structuralChanges(beforeMap.get(id), afterMap.get(id));
      if (fields.length) changed.push({ id, fields });
    }
  }
  return {
    identityPolicy: fileName === "weapon-bases.json"
      ? "weaponKey; profiles use weaponKey/profileType/profileName/rank composite"
      : "stable source key",
    legacyIdentityBridges: beforeRecords.filter((record) => record.legacyIdentityBridge).length,
    added,
    removed,
    changed,
  };
}

export function buildArtifactDiff(stagedFiles, productionFiles) {
  const staged = new Map(stagedFiles.map((file) => [file.name, file]));
  const production = new Map(productionFiles.map((file) => [file.name, file]));
  const names = [...new Set([...staged.keys(), ...production.keys()])].sort();
  const files = names.map((name) => {
    const next = staged.get(name);
    const prior = production.get(name);
    const status = !prior ? "added" : !next ? "removed" : prior.sha256 === next.sha256 ? "unchanged" : "changed";
    let structural = [];
    let semantic = null;
    if (prior && next && status === "changed") {
      structural = structuralChanges(prior.value, next.value);
      semantic = semanticDiff(name, prior.value, next.value);
    } else if (!prior && next) semantic = semanticDiff(name, [], next.value);
    else if (prior && !next) semantic = semanticDiff(name, prior.value, []);
    return {
      name,
      status,
      beforeSha256: prior?.sha256 || null,
      afterSha256: next?.sha256 || null,
      structural,
      semantic,
    };
  });
  const summary = Object.freeze({
    added: files.filter((file) => file.status === "added").length,
    removed: files.filter((file) => file.status === "removed").length,
    changed: files.filter((file) => file.status === "changed").length,
    unchanged: files.filter((file) => file.status === "unchanged").length,
  });
  return Object.freeze({ diffVersion: 1, summary, files: Object.freeze(files) });
}

export function renderArtifactDiffMarkdown(diff) {
  const lines = [
    "# Game-data artifact diff",
    "",
    `Added: ${diff.summary.added}; removed: ${diff.summary.removed}; changed: ${diff.summary.changed}; unchanged: ${diff.summary.unchanged}.`,
    "",
    "| Artifact | Status | Structural changes | Semantic changes |",
    "| --- | --- | ---: | ---: |",
  ];
  for (const file of diff.files) {
    const semanticCount = file.semantic
      ? file.semantic.added.length + file.semantic.removed.length + file.semantic.changed.length
      : 0;
    lines.push(`| ${file.name} | ${file.status} | ${file.structural.length} | ${semanticCount} |`);
  }
  lines.push("", "The JSON companion contains every changed field path and stable-identity entity change.", "");
  return lines.join("\n");
}

export function parseArtifactFile(name, text) {
  return Object.freeze({
    name,
    text,
    value: JSON.parse(text),
    byteLength: Buffer.byteLength(text),
    sha256: sha256(text),
  });
}
