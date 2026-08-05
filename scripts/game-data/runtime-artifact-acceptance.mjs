import {
  buildTechniqueIndexes,
  createCharacterGrantCollection,
  getEntryGrants,
  getGameXClasses,
  getGameXClassFeatures,
  getGameXFeats,
  getGameXOrigins,
  getGameXTechniques,
  getGameXWeaponBases,
  getGameXWeaponEnhancements,
} from "../../public/js/core/game-data.js";
import { RUNTIME_ARTIFACT_SCHEMA_VERSION } from "./artifact-builder.mjs";

const SPLIT_COLLECTIONS = Object.freeze({
  "classes.json": "classes",
  "class-skills.json": "classSkills",
  "class-features.json": "classFeatures",
  "feats.json": "feats",
  "techniques.json": "techniques",
  "origins.json": "origins",
  "weapon-bases.json": "weaponBases",
  "weapon-enhancements.json": "weaponEnhancements",
});

function visitEntries(entries, callback) {
  for (const entry of entries || []) {
    callback(entry);
    visitEntries(entry.options, callback);
  }
}

export function validateRuntimeArtifacts(artifactSet) {
  const diagnostics = [];
  const files = new Map((artifactSet?.files || []).map((file) => [file.name, file]));
  const combinedFile = files.get("game-x-data.json");
  if (!combinedFile) diagnostics.push({ code: "missing-runtime-artifact", message: "game-x-data.json is missing." });
  let data = null;
  try {
    data = combinedFile ? JSON.parse(combinedFile.text) : null;
  } catch (error) {
    diagnostics.push({ code: "invalid-runtime-json", message: `game-x-data.json cannot be parsed: ${error.message}` });
  }
  if (data?.schemaVersion !== RUNTIME_ARTIFACT_SCHEMA_VERSION) {
    diagnostics.push({ code: "runtime-schema-version", message: `Expected runtime artifact schema ${RUNTIME_ARTIFACT_SCHEMA_VERSION}.` });
  }

  for (const [fileName, field] of Object.entries(SPLIT_COLLECTIONS)) {
    const file = files.get(fileName);
    if (!file) {
      diagnostics.push({ code: "missing-runtime-artifact", message: `${fileName} is missing.` });
      continue;
    }
    try {
      if (JSON.stringify(JSON.parse(file.text)) !== JSON.stringify(data?.[field])) {
        diagnostics.push({ code: "split-artifact-mismatch", message: `${fileName} does not match game-x-data.json field ${field}.` });
      }
    } catch (error) {
      diagnostics.push({ code: "invalid-runtime-json", message: `${fileName} cannot be parsed: ${error.message}` });
    }
  }

  if (data) {
    const collections = [
      ["classes", getGameXClasses(data)],
      ["feats", getGameXFeats(data)],
      ["techniques", getGameXTechniques(data)],
      ["origins", getGameXOrigins(data)],
      ["weaponBases", getGameXWeaponBases(data)],
      ["weaponEnhancements", getGameXWeaponEnhancements(data)],
    ];
    for (const [field, value] of collections) {
      if (!Array.isArray(value)) diagnostics.push({ code: "runtime-collection-shape", message: `${field} is not runtime-readable.` });
    }
    const indexes = buildTechniqueIndexes(data.techniques);
    if (indexes.byName.size !== data.techniques?.length) {
      diagnostics.push({ code: "runtime-technique-index", message: "Not every technique has a unique runtime-readable techniqueName." });
    }
    try {
      for (const cls of data.classes || []) {
        visitEntries(getGameXClassFeatures(data, cls.classKey), getEntryGrants);
      }
      visitEntries(data.feats, getEntryGrants);
      for (const origin of data.origins || []) visitEntries(origin.features, getEntryGrants);
      const cls = data.classes?.[0];
      const origin = data.origins?.[0];
      createCharacterGrantCollection(data, {
        classKey: cls?.classKey,
        originKey: origin?.originKey,
        level: 12,
        selectedClassFeatureOptions: [],
        selectedFeats: [],
        selectedFeatOptions: [],
      });
    } catch (error) {
      diagnostics.push({ code: "runtime-grant-load", message: `Runtime grant loading failed: ${error.message}` });
    }
  }

  return Object.freeze({
    ok: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze({ severity: "error", ...item }))),
  });
}
