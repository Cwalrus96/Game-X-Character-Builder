import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import {
  fitSkillsToRules,
  getClassUtilitySkillState,
  getSkillAllocationState,
  getSkillDisplayState,
  getSkillProgressionRank,
} from "../public/js/core/skill-rules.js";

const GAME_DATA = Object.freeze({
  schemaVersion: 2,
  classes: Object.freeze([{ classKey: "ninja", utilitySkillOptions: ["Athletics", "Nature", "Society"] }]),
  classSkills: Object.freeze([
    { classKey: "ninja", role: "utility-option", skillKey: "athletics", skillName: "Athletics" },
    { classKey: "ninja", role: "utility-option", skillKey: "nature", skillName: "Nature" },
    { classKey: "ninja", role: "utility-option", skillKey: "society", skillName: "Society" },
    { classKey: "ninja", role: "utility-option", skillKey: "science", skillName: "Science" },
  ]),
  classFeatures: Object.freeze({ ninja: Object.freeze([]) }),
  origins: Object.freeze([]),
  feats: Object.freeze([]),
});

function builder() {
  const character = createDefaultCharacter({ ownerUid: "skill_user" });
  character.builder.classKey = "ninja";
  character.builder.level = 5;
  character.builder.attributes.intellect = 2;
  return character.builder;
}

test("skill progression breakpoints live in the pure Rules module", () => {
  assert.deepEqual([1, 3, 5, 7, 9, 11].map((level) => getSkillProgressionRank("fast", level)), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual([1, 4, 7, 9, 11].map((level) => getSkillProgressionRank("medium", level)), ["1", "2", "3", "4", "5"]);
  assert.deepEqual([1, 3, 6, 9, 11].map((level) => getSkillProgressionRank("slow", level)), ["0", "1", "2", "3", "4"]);
});

test("class utility options, point usage, caps, and assignable maxima share one projection", () => {
  const state = builder();
  state.selectedClassUtilitySkills = ["athletics", "nature"];
  state.sheet.fields.rank_athletics = "3";
  state.sheet.fields.rank_society = "3";
  state.sheet.repeatables.combatSkillsExtra = [{ skill: "Swordplay", rank: "2" }];
  state.sheet.repeatables.settingSkills = [{ skill: "Cosmology", rank: "1" }];
  const utility = getClassUtilitySkillState(GAME_DATA, state);
  const allocation = getSkillAllocationState(GAME_DATA, state);

  assert.deepEqual(utility.selected, ["athletics", "nature"]);
  assert.equal(utility.expectedCount, 2);
  assert.deepEqual({ total: allocation.total, spent: allocation.spent, remaining: allocation.remaining, cap: allocation.baseRankCap }, { total: 14, spent: 8, remaining: 6, cap: 3 });
  assert.deepEqual(
    allocation.fixed.find((record) => record.key === "rank_athletics"),
    {
      domain: "fixed", key: "rank_athletics", name: "Athletics", rank: 3, storedRank: "3",
      grantedRank: 1, editable: true, cap: 3, path: "builder.sheet.fields.rank_athletics",
      minimumAssignable: 1, maximumAssignable: 3,
    },
  );
  assert.equal(allocation.fixed.find((record) => record.key === "rank_society").maximumAssignable, 3);
  assert.equal(Object.isFrozen(allocation), true);
});

test("class-granted utility ranks are a free floor rather than a locked final rank", () => {
  const state = builder();
  state.selectedClassUtilitySkills = ["athletics"];
  let allocation = getSkillAllocationState(GAME_DATA, state);
  let athletics = allocation.fixed.find((record) => record.key === "rank_athletics");
  assert.deepEqual({ rank: athletics.rank, grantedRank: athletics.grantedRank, spent: allocation.spent }, { rank: 1, grantedRank: 1, spent: 0 });

  state.sheet.fields.rank_athletics = "3";
  allocation = getSkillAllocationState(GAME_DATA, state);
  athletics = allocation.fixed.find((record) => record.key === "rank_athletics");
  assert.deepEqual({ rank: athletics.rank, minimum: athletics.minimumAssignable, maximum: athletics.maximumAssignable, spent: allocation.spent }, { rank: 3, minimum: 1, maximum: 3, spent: 2 });
});

test("non-core class utility skills use the same free floor and paid-rank overlay", () => {
  const state = builder();
  state.selectedClassUtilitySkills = ["science"];
  let allocation = getSkillAllocationState(GAME_DATA, state);
  let science = allocation.setting.find((record) => record.name === "Science");
  assert.deepEqual({ rank: science.rank, storedRank: science.storedRank, grantedRank: science.grantedRank, virtual: science.virtual, spent: allocation.spent }, { rank: 1, storedRank: "", grantedRank: 1, virtual: true, spent: 0 });

  state.sheet.repeatables.settingSkills = [{ skill: "Science", rank: "3" }];
  allocation = getSkillAllocationState(GAME_DATA, state);
  science = allocation.setting.find((record) => record.name === "Science");
  assert.deepEqual({ rank: science.rank, storedRank: science.storedRank, grantedRank: science.grantedRank, virtual: science.virtual, spent: allocation.spent }, { rank: 3, storedRank: "3", grantedRank: 1, virtual: false, spent: 2 });
  assert.deepEqual(allocation.grantedSettingSkills, []);
});

test("skill fitting applies caps then a stable point-budget reduction without mutating input", () => {
  const state = builder();
  state.level = 1;
  state.attributes.intellect = 0;
  state.sheet.fields.rank_academics = "1";
  state.sheet.repeatables.combatSkillsExtra = [{ skill: "Swordplay", rank: "2" }];
  state.sheet.repeatables.settingSkills = [{ skill: "Cosmology", rank: "2" }];
  const original = structuredClone(state);
  const result = fitSkillsToRules(GAME_DATA, state);

  assert.deepEqual(state, original);
  assert.equal(result.combatSkillsExtra[0].rank, "1");
  assert.equal(result.settingSkills[0].rank, "0");
  assert.equal(result.allocation.spent, 2);
  assert.deepEqual(result.changes.map((change) => change.code), [
    "skill-rank-cap-applied",
    "skill-rank-cap-applied",
    "skill-point-budget-applied",
  ]);
  assert.deepEqual(fitSkillsToRules(GAME_DATA, { ...state, sheet: { ...state.sheet, fields: result.fields, repeatables: { ...state.sheet.repeatables, combatSkillsExtra: result.combatSkillsExtra, settingSkills: result.settingSkills } } }).changes, []);
});

test("a saved row that repeats a granted combat skill does not spend points or lose the grant", () => {
  const data = structuredClone(GAME_DATA);
  data.classFeatures.ninja = [{ type: "feature", featureKey: "training", classKey: "ninja", level: 1,
    grants: [{ type: "skill", name: "Ranged Weapons", rank: 4 }] }];
  const state = builder();
  state.level = 1;
  state.attributes.intellect = 0;
  state.sheet.fields.rank_athletics = "1";
  state.sheet.fields.rank_nature = "1";
  state.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "1" }];
  const before = structuredClone(state);
  const allocation = getSkillAllocationState(data, state);
  assert.equal(allocation.spent, 2, "the granted rank is free even through the historical Targeting alias");
  assert.equal(allocation.combat[0].rank, 4);
  assert.equal(allocation.combat[0].minimumAssignable, 4);
  assert.equal(allocation.combat[0].maximumAssignable, 4);
  assert.deepEqual(fitSkillsToRules(data, state).changes, []);
  assert.deepEqual(state, before);
  data.classFeatures.ninja = [];
  assert.equal(getSkillAllocationState(data, state).spent, 3, "removing the grant restores the stored rank's normal cost");
  assert.equal(fitSkillsToRules(data, state).changes[0].code, "skill-point-budget-applied");
});

test("paid ranks above a named grant remain paid and survive removal when within budget", () => {
  const data = structuredClone(GAME_DATA);
  data.classFeatures.ninja = [{ type: "feature", featureKey: "training", classKey: "ninja", level: 1,
    grants: [{ type: "skill", name: "Swordplay", rank: 1 }, { type: "skill", name: "Science", rank: 2 }, { type: "skill", name: "Athletics", rank: 2 }] }];
  const state = builder();
  state.selectedClassUtilitySkills = ["athletics"];
  state.sheet.fields.rank_athletics = "3";
  state.sheet.repeatables.combatSkillsExtra = [{ skill: "swordplay", rank: "3" }];
  state.sheet.repeatables.settingSkills = [{ skill: "Science", rank: "3" }];
  assert.equal(getSkillAllocationState(data, state).spent, 4);
  assert.deepEqual(fitSkillsToRules(data, state).changes, []);
  data.classFeatures.ninja = [];
  assert.equal(getSkillAllocationState(data, state).spent, 8);
  assert.deepEqual(fitSkillsToRules(data, state).changes, []);
});

test("sheet skill display resolves utility keys and preserves higher paid ranks without changing storage", () => {
  const state = builder();
  state.selectedClassUtilitySkills = ["nature", "science"];
  state.sheet.fields.rank_nature = "3";
  state.sheet.repeatables.settingSkills = [{ skill: "Science", rank: "2" }];
  const before = structuredClone(state);
  const display = getSkillDisplayState(GAME_DATA, state);
  assert.equal(display.fields.rank_nature, "3");
  assert.equal(display.fields.rank_athletics, "", "an unanswered core rank stays blank");
  assert.deepEqual(display.repeatables.settingSkills, [{ skill: "Science", rank: "2" }]);
  assert.deepEqual(state, before);
  state.sheet.fields.rank_nature = "";
  state.sheet.repeatables.settingSkills = [];
  const free = getSkillDisplayState(GAME_DATA, state);
  assert.equal(free.fields.rank_nature, "1");
  assert.deepEqual(free.repeatables.settingSkills, [{ skill: "Science", rank: "1" }]);
  assert.equal(Object.isFrozen(free.fields), true);
});

test("sheet skill display merges granted aliases with paid overlays and keeps unknown ranks blank", () => {
  const data = structuredClone(GAME_DATA);
  data.classes[0].combatTechniqueSkill = "Mystery Skill";
  data.classFeatures.ninja = [{ type: "feature", featureKey: "training", classKey: "ninja", level: 1,
    grants: [{ type: "skill", name: "Ranged Weapons", rank: 1 }, { type: "skill", name: "Athletics", rank: 2 }] }];
  const state = builder();
  state.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "3" }];
  const display = getSkillDisplayState(data, state);
  assert.equal(display.fields.rank_athletics, "2");
  assert.equal(display.repeatables.combatSkillsExtra.some((row) => row.skill === "Athletics"), false);
  assert.equal(display.repeatables.combatSkillsExtra.filter((row) => row.skill === "Ranged Weapons").length, 1);
  assert.equal(display.repeatables.combatSkillsExtra.find((row) => row.skill === "Ranged Weapons").rank, "3");
  assert.equal(display.repeatables.combatSkillsExtra.find((row) => row.skill === "Mystery Skill").rank, "");
});
