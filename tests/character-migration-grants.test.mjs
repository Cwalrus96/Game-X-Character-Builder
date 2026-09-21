import assert from "node:assert/strict";
import test from "node:test";
import { createCharacterMigrationReferences, migrateCharacterDocument } from "../public/js/core/character-migrations.js";
import { createCharacterGrantCollection } from "../public/js/core/game-data.js";
import { computeGrantedSkillsState } from "../public/js/core/skill-rules.js";
import { getWeaponSkillRanks } from "../public/js/core/weapon-utils.js";
import { buildOptionKey } from "../public/js/core/data-sanitization.js";
import { MIGRATION_GAME_DATA, makeV4Character } from "./fixtures/character-schemas.mjs";

function gameData() {
  const data = structuredClone(MIGRATION_GAME_DATA);
  data.schemaVersion = 2;
  data.feats.push({
    type: "optionGroup", featKey: "celestial-knight-path-initiate", category: "magical-guardian",
    name: "Celestial Knight Path Initiate", chooseCount: 1, grants: [],
    prerequisites: [{ type: "class", key: "magical-guardian", level: 2 }],
    options: [{
      type: "option", featKey: "celestial-knight-melee-weapons", name: "Melee Weapons",
      grants: [{ type: "skill", name: "Melee Weapons", rank: 1, progression: "slow" }],
    }],
  });
  data.classFeatures.ninja[0].options[0].grants = [{ type: "skill", name: "Martial Arts", rank: 1 }];
  return data;
}

test("a migrated feat option retains granted training against published artifact schema 2", () => {
  const data = gameData();
  const raw = makeV4Character();
  Object.assign(raw.builder, {
    classKey: "magical-guardian", level: 5, selectedClassFeatureOptions: [],
    selectedFeats: ["Celestial Knight Path Initiate"],
    selectedFeatOptions: ["magical-guardian|L2|Celestial Knight Path Initiate::Melee Weapons"],
    grantedSkillSnapshot: ["Melee Weapons"],
  });
  const migrated = migrateCharacterDocument(raw, { references: createCharacterMigrationReferences(data) });
  assert.equal(migrated.ok, true, JSON.stringify(migrated.diagnostics));
  assert.deepEqual(migrated.value.builder.selectedFeatOptions, ["celestial-knight-melee-weapons"]);
  const granted = computeGrantedSkillsState(data, migrated.value.builder);
  assert.equal(granted.grantedCombatSkills.find((skill) => skill.skill === "Melee Weapons").rank, "1");
  assert.equal(getWeaponSkillRanks(migrated.value.builder, granted)["Melee Weapons"], 1);
  assert.deepEqual(migrated.value.builder.weapons.map((weapon) => weapon.rank), raw.builder.weapons.map((weapon) => weapon.rank));
});

test("schema 2 class and feat options accept stable keys and unambiguous legacy labels without duplicate grants", () => {
  const data = gameData();
  const group = data.classFeatures.ninja[0];
  const feat = data.feats.at(-1);
  const builder = {
    classKey: "ninja", level: 5, selectedFeats: [feat.featKey],
    selectedClassFeatureOptions: [buildOptionKey(group, group.options[0])],
    selectedFeatOptions: [buildOptionKey(feat, feat.options[0])],
  };
  const legacy = createCharacterGrantCollection(data, builder).skillGrants;
  assert.deepEqual(legacy.map((grant) => grant.name), ["Martial Arts", "Melee Weapons"]);
  builder.selectedClassFeatureOptions.push(group.options[0].featureKey);
  builder.selectedFeatOptions.push(feat.options[0].featKey);
  assert.deepEqual(createCharacterGrantCollection(data, builder).skillGrants.map((grant) => grant.name), ["Martial Arts", "Melee Weapons"]);
  builder.selectedClassFeatureOptions.shift();
  builder.selectedFeatOptions.shift();
  assert.deepEqual(createCharacterGrantCollection(data, builder).skillGrants.map((grant) => grant.name), ["Martial Arts", "Melee Weapons"]);
});

test("ambiguous legacy option labels grant nothing while stable keys select the intended row", () => {
  const data = gameData();
  const group = data.classFeatures.ninja[0];
  const duplicate = structuredClone(group);
  duplicate.featureKey = "other-training";
  duplicate.options[0].featureKey = "other-step";
  duplicate.options[0].grants[0].name = "Melee Weapons";
  data.classFeatures.ninja.push(duplicate);
  const builder = { classKey: "ninja", level: 5, selectedClassFeatureOptions: [buildOptionKey(group, group.options[0])] };
  assert.deepEqual(createCharacterGrantCollection(data, builder).skillGrants, []);
  builder.selectedClassFeatureOptions.push("shadow-step");
  assert.deepEqual(createCharacterGrantCollection(data, builder).skillGrants.map((grant) => grant.name), ["Martial Arts"]);
});
