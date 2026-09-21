#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

export const DEFAULT_GAME_DATA_DIRECTORY = path.join(repositoryRoot, "public", "data", "game-x");
export const DEFAULT_BASELINE_PATH = path.join(repositoryRoot, "contracts", "game-data-release-baseline.json");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function countChoiceNodes(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((count, entry) => (
    count + 1 + countChoiceNodes(entry?.options)
  ), 0);
}

export function summarizeCombinedGameData(gameData = {}) {
  const classes = Array.isArray(gameData.classes) ? gameData.classes : [];
  const classSkills = Array.isArray(gameData.classSkills) ? gameData.classSkills : null;
  const classFeatures = gameData.classFeatures && typeof gameData.classFeatures === "object"
    ? gameData.classFeatures
    : {};
  const feats = Array.isArray(gameData.feats) ? gameData.feats : [];
  const techniques = Array.isArray(gameData.techniques) ? gameData.techniques : [];
  const origins = Array.isArray(gameData.origins) ? gameData.origins : [];
  const weaponBases = Array.isArray(gameData.weaponBases) ? gameData.weaponBases : [];
  const weaponEnhancements = Array.isArray(gameData.weaponEnhancements) ? gameData.weaponEnhancements : [];

  return {
    schemaVersion: gameData.schemaVersion ?? null,
    generatedAt: gameData.generatedAt ?? null,
    classes: classes.length,
    ...(classSkills ? { classSkills: classSkills.length } : {}),
    classFeatureOwners: Object.keys(classFeatures).length,
    classFeatureNodes: Object.values(classFeatures).reduce((count, entries) => count + countChoiceNodes(entries), 0),
    feats: feats.length,
    featNodes: countChoiceNodes(feats),
    techniques: techniques.length,
    ...(Array.isArray(gameData.traits) ? { traits: gameData.traits.length } : {}),
    origins: origins.length,
    originFeatures: origins.reduce((count, origin) => count + (Array.isArray(origin?.features) ? origin.features.length : 0), 0),
    weaponBases: weaponBases.length,
    weaponProfiles: weaponBases.reduce((count, weapon) => count + (Array.isArray(weapon?.profiles) ? weapon.profiles.length : 0), 0),
    weaponEnhancements: weaponEnhancements.length,
  };
}

export function buildReleaseArtifactSnapshot(dataDirectory = DEFAULT_GAME_DATA_DIRECTORY) {
  const files = fs.readdirSync(dataDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const bytes = fs.readFileSync(path.join(dataDirectory, entry.name));
      return { name: entry.name, bytes: bytes.length, sha256: sha256(bytes) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const combined = JSON.parse(fs.readFileSync(path.join(dataDirectory, "game-x-data.json"), "utf8"));

  return {
    directory: "public/data/game-x",
    files,
    counts: summarizeCombinedGameData(combined),
  };
}

export function compareReleaseArtifactSnapshot(expected, actual) {
  const issues = [];
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  };
  const normalize = (snapshot) => canonicalize({
    ...snapshot,
    files: (Array.isArray(snapshot?.files) ? snapshot.files : [])
      .slice()
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""))),
  });
  const expectedJson = JSON.stringify(normalize(expected));
  const actualJson = JSON.stringify(normalize(actual));
  if (expectedJson !== actualJson) {
    issues.push("Checked-in game-data artifacts differ from contracts/game-data-release-baseline.json.");
  }
  return issues;
}

export function verifyReleaseArtifactBaseline({
  baselinePath = DEFAULT_BASELINE_PATH,
  dataDirectory = DEFAULT_GAME_DATA_DIRECTORY,
} = {}) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const actual = buildReleaseArtifactSnapshot(dataDirectory);
  return {
    baseline,
    actual,
    issues: compareReleaseArtifactSnapshot(baseline.releaseArtifact, actual),
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const result = verifyReleaseArtifactBaseline();
  if (result.issues.length) {
    for (const issue of result.issues) console.error(`ERROR: ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`Game-data release baseline verified (${result.actual.files.length} artifacts).`);
  }
}
