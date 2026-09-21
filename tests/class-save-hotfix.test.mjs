import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import { prepareClassSaveHotfix } from "../scripts/prepare-class-save-hotfix.mjs";
import { sanitizeUpdatePatch } from "../public/js/core/database-writer.js";
import { getGameXFeatsForClass } from "../public/js/core/game-data.js";
import { getEntryRequiredLevel } from "../public/js/core/option-groups.js";
import { clampLevel } from "../public/js/core/character-rules.js";

// Synthetic controller excerpt with the exact defective production statements.
// The release generator additionally requires the captured full file's fixed hash.
const controller = `import { sanitizeText } from "../core/data-sanitization.js";
import {
  collectSelectedEntries,
} from "../core/option-groups.js";
function computeVisibleFeats(classKey, level) {
  const all = getGameXFeats(gameData);
  const L = clampLevel(level);
  return all
    .filter((f) => String(f?.classKey || "") === String(classKey))
    .filter((f) => Number(f?.minLevel || 0) <= L);
}
function availableFeats(classKey, level) {
  const L = clampLevel(level);
  return getGameXFeatsForClass(gameData, classKey)
    .filter((feat) => Number(feat?.minLevel || 0) <= L);
}
function buildAutoAbilities(classKey, level, selectedFeatNames) {
  const visibleFeats = computeVisibleFeats(classKey, level);
  const featByName = new Map(visibleFeats.map((f) => [String(f?.name || "").trim(), f]));
  const out = [];
  for (const name of selectedFeatNames) {
    const feat = featByName.get(name);
    if (!feat) continue;
    out.push({name: "Feat - " + name, text: String(feat.description || "").trim()});
  }
  return out;
}
async function saveClassStep() {
  const patch = { ...reconciliation.patch, ...staticPatch };
  return patch;
}
`;
const hash = (value) => createHash("sha256").update(value).digest("hex");
function preparedContext(gameData = {}) {
  const prepared = prepareClassSaveHotfix(controller, { expectedSha256: hash(controller) });
  const context = vm.createContext({ gameData, sanitizeUpdatePatch, getGameXFeatsForClass, getEntryRequiredLevel, clampLevel });
  vm.runInContext(prepared.code.replace(/^import [\s\S]*?;\n/gm, ""), context);
  return context;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("the production hotfix rejects an unreviewed or already patched controller", () => {
  assert.throws(() => prepareClassSaveHotfix(controller), /unreviewed Class controller/);
  const result = prepareClassSaveHotfix(controller, { expectedSha256: hash(controller) });
  assert.equal(result.sourceSha256, hash(controller));
  assert.equal(result.outputSha256, hash(result.code));
  assert.throws(() => prepareClassSaveHotfix(result.code, { expectedSha256: hash(controller) }), /unreviewed Class controller/);
});

test("Class save uses the imported class-feat lookup and retains selected structured feat abilities at the required level", () => {
  const context = preparedContext({ feats: [
    { featKey: "endurance", featType: "class", category: "spirit-warrior", level: 2, name: "Endurance", description: "Retained mechanical text." },
    { featKey: "later-training", featType: "class", category: "spirit-warrior", level: 4, name: "Later Training" },
    { featKey: "other-class", featType: "class", category: "ninja", level: 1, name: "Other Class" },
  ] });
  assert.deepEqual(plain(context.computeVisibleFeats("spirit-warrior", 1)), []);
  assert.deepEqual(plain(context.availableFeats("spirit-warrior", 1)), []);
  assert.deepEqual(plain(context.computeVisibleFeats("spirit-warrior", 2)).map((feat) => feat.featKey), ["endurance"]);
  assert.deepEqual(plain(context.buildAutoAbilities("spirit-warrior", 2, ["Endurance"])), [
    { name: "Feat - Endurance", text: "Retained mechanical text." },
  ]);
});

test("Class save sanitizes and writes only owned skill and ability leaves, preserving newer play state", () => {
  const context = preparedContext();
  const input = {
    "builder.level": 2,
    "builder.sheet.fields": {rank_athletics: " 2 ", rank_medicine: "", rank_defense: "0", hpcur: "stale", strain: "stale", overstrained: false, notes: "stale notes", customPlayState: "stale"},
    "builder.sheet.repeatables": {combatSkillsExtra: [], settingSkills: [{skill: "History", rank: " 1 "}], abilities: [{name: "Feat - Endurance", text: "Retained mechanical text."}], conditions: [{name: "Stale condition"}], customPlayState: ["stale"]},
  };
  const before = structuredClone(input);
  const patch = plain(context.buildClassSavePatch(input));
  assert.deepEqual(input, before);
  assert.deepEqual(patch, {
    "builder.level": 2,
    "builder.sheet.fields.rank_athletics": "2",
    "builder.sheet.fields.rank_medicine": "",
    "builder.sheet.fields.rank_defense": "0",
    "builder.sheet.repeatables.combatSkillsExtra": [],
    "builder.sheet.repeatables.settingSkills": [{skill: "History", rank: "1"}],
    "builder.sheet.repeatables.abilities": [{name: "Feat - Endurance", text: "Retained mechanical text."}],
  });
  assert.deepEqual(sanitizeUpdatePatch(patch), patch, "the deployed writer's second sanitation preserves the leaf patch");
  const stored = {builder: {sheet: {fields: {rank_athletics: "1", rank_medicine: "3", rank_other: "4", hpcur: "8", strain: "5", overstrained: true, notes: "Latest notes", customPlayState: "latest"}, repeatables: {combatSkillsExtra: [{skill: "Old skill", rank: "1"}], conditions: [{name: "Latest condition"}], customPlayState: ["latest"]}}}};
  const playFields = Object.fromEntries(Object.entries(stored.builder.sheet.fields).filter(([key]) => !key.startsWith("rank_")));
  const conditions = structuredClone(stored.builder.sheet.repeatables.conditions);
  for (const [field, value] of Object.entries(patch)) {
    const parts = field.split(".");
    let cursor = stored;
    for (const key of parts.slice(0, -1)) cursor = cursor[key] ??= {};
    cursor[parts.at(-1)] = value;
  }
  assert.deepEqual(Object.fromEntries(Object.entries(stored.builder.sheet.fields).filter(([key]) => !key.startsWith("rank_"))), playFields);
  assert.deepEqual(stored.builder.sheet.repeatables.conditions, conditions);
  assert.deepEqual(stored.builder.sheet.repeatables.customPlayState, ["latest"]);
  assert.equal(stored.builder.sheet.fields.rank_medicine, "", "an explicit skill removal is still applied");
  assert.equal(stored.builder.sheet.fields.rank_other, "4", "unmentioned authored skill leaves survive");
  assert.deepEqual(stored.builder.sheet.repeatables.combatSkillsExtra, [], "an explicit list removal is still applied");
});
