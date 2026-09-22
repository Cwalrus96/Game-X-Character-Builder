import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { SetSettingSkills } from "../public/js/core/character-commands.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { GraphCompiler } from "../public/js/core/graph-compiler.js";
import { createCharacterSessionGraphReconciler, reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";

const GAME_DATA = Object.freeze({
  schemaVersion: 2,
  classes: Object.freeze([{ classKey: "ninja", name: "Ninja", status: "playable", selectable: true, primaryAttributeA: "Agility", primaryAttributeB: "Intellect" }]),
  classSkills: Object.freeze([
    { classKey: "ninja", role: "utility-option", skillKey: "athletics", skillName: "Athletics" },
    { classKey: "ninja", role: "utility-option", skillKey: "nature", skillName: "Nature" },
    { classKey: "ninja", role: "utility-option", skillKey: "society", skillName: "Society" },
  ]),
  classFeatures: Object.freeze({ ninja: Object.freeze([]) }),
  origins: Object.freeze([
    { originKey: "artifact", name: "Artifact", status: "playable", selectable: true, grants: [], features: [{ name: "Living Archive", description: "You remember what came before.", grants: [] }] },
    { originKey: "unfinished", name: "Unfinished", status: "draft", selectable: false, grants: [], features: [] },
  ]),
  feats: Object.freeze([]), techniques: Object.freeze([]), weaponBases: Object.freeze([]), weaponEnhancements: Object.freeze([]),
});

function character() {
  const value = createDefaultCharacter({ ownerUid: "graph_skill_user" });
  value.builder.classKey = "ninja";
  value.builder.primaryAttribute = "agility";
  value.builder.attributes.agility = 1;
  value.builder.originKey = "artifact";
  value.builder.originKeystone = "I carry a forgotten age.";
  return value;
}

test("origin and skill graph nodes retain source ownership and exact storage bindings", () => {
  const value = character();
  value.builder.sheet.fields.rank_nature = "1";
  value.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Swordplay", rank: "1" }];
  const graph = new GraphCompiler({ gameData: GAME_DATA }).compile(value);
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  assert.ok(graph.nodes.some((node) => node.id === "origin-feature:artifact:0:living-archive" && node.sourceOwnerId === "origin:artifact"));
  assert.ok(graph.nodes.some((node) => node.id === "skill:fixed:rank_nature" && node.storageBinding.path === "builder.sheet.fields.rank_nature"));
  assert.ok(graph.nodes.some((node) => node.id === "skill:combat:swordplay" && node.storageBinding.key === "swordplay"));
  assert.equal(graph.metadata.skillPointCapacity, 2);
  assert.equal(graph.metadata.skillPointUsage, 2);
});

test("unavailable origins and excess utility choices reconcile through graph policy", () => {
  const value = character();
  value.builder.originKey = "unfinished";
  value.builder.selectedClassUtilitySkills = ["athletics", "nature", "society"];
  const result = reconcileCharacterGraph({ character: value, previousCharacter: value, gameData: GAME_DATA });
  assert.equal(result.ok, true);
  assert.equal(result.character.builder.originKey, "");
  assert.deepEqual(result.character.builder.selectedClassUtilitySkills, ["athletics", "nature"]);
  assert.ok(result.impacts.some((item) => item.code === "unavailable-origin-removed"));
  assert.ok(result.impacts.some((item) => item.code === "class-utility-skill-capacity-removed"));
});

test("reconciliation preserves paid ranks above and after a class-granted utility floor", () => {
  const value = character();
  value.builder.level = 3;
  value.builder.selectedClassUtilitySkills = ["athletics"];
  value.builder.sheet.fields.rank_athletics = "2";
  const granted = reconcileCharacterGraph({ character: value, previousCharacter: value, gameData: GAME_DATA });
  assert.equal(granted.character.builder.sheet.fields.rank_athletics, "2");
  assert.equal(granted.graph.metadata.skillPointUsage, 1);

  const withoutGrant = structuredClone(granted.character);
  withoutGrant.builder.selectedClassUtilitySkills = [];
  const removed = reconcileCharacterGraph({ character: withoutGrant, previousCharacter: granted.character, gameData: GAME_DATA });
  assert.equal(removed.character.builder.sheet.fields.rank_athletics, "2");
  assert.equal(removed.graph.metadata.skillPointUsage, 2);
});

test("removing a named skill grant keeps paid rows and reviews any newly owed points", () => {
  const data = structuredClone(GAME_DATA);
  data.origins[0].features[0].grants = [{ type: "skill", name: "Swordplay", rank: 1 }];
  const value = character();
  value.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Swordplay", rank: "1" }];
  const granted = reconcileCharacterGraph({ character: value, gameData: data });
  assert.equal(granted.graph.metadata.skillPointUsage, 0);
  const withoutGrant = structuredClone(granted.character);
  withoutGrant.builder.originKey = "";
  const retained = reconcileCharacterGraph({ character: withoutGrant, previousCharacter: granted.character, gameData: data });
  assert.deepEqual(retained.character.builder.sheet.repeatables.combatSkillsExtra, [{ skill: "Swordplay", rank: "1" }]);
  assert.equal(retained.graph.metadata.skillPointUsage, 1);
  withoutGrant.builder.sheet.fields.rank_athletics = "1";
  withoutGrant.builder.sheet.fields.rank_nature = "1";
  const overBudget = reconcileCharacterGraph({ character: withoutGrant, previousCharacter: granted.character, gameData: data });
  assert.equal(overBudget.ok, true);
  assert.deepEqual(overBudget.character.builder.sheet.repeatables.combatSkillsExtra, [{ skill: "Swordplay", rank: "0" }]);
  assert.ok(overBudget.impacts.some((impact) => impact.code === "skill-point-budget-applied" && impact.category === "confirmation-required"));
  assert.deepEqual(granted.character.builder.sheet.repeatables.combatSkillsExtra, [{ skill: "Swordplay", rank: "1" }]);
});

test("skill overspend requires confirmation and cancellation is side-effect free", () => {
  const value = character();
  value.builder.sheet.fields.rank_academics = "1";
  value.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Swordplay", rank: "1" }];
  const session = new CharacterSession({ character: value, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GAME_DATA }) });
  const before = session.getState();
  const proposal = session.propose(SetSettingSkills([{ skill: "Cosmology", rank: "1" }]));
  assert.equal(proposal.requiresConfirmation, true);
  assert.ok(proposal.impacts.some((item) => item.code === "skill-point-budget-applied"));
  session.cancelProposal(proposal.proposalId);
  assert.deepEqual(session.getState().working, before.working);

  const accepted = session.propose(SetSettingSkills([{ skill: "Cosmology", rank: "1" }]));
  session.acceptProposal(accepted.proposalId, { confirm: true });
  assert.deepEqual(session.getState().working.builder.sheet.repeatables.settingSkills, [{ skill: "Cosmology", rank: "0" }]);
});

test("origin feature removal is reported before its derived ability disappears", () => {
  const value = character();
  const hydrated = reconcileCharacterGraph({ character: value, previousCharacter: value, gameData: GAME_DATA }).character;
  assert.ok(hydrated.builder.autoAbilityNames.includes("Origin Feature - Living Archive"));
  const changed = structuredClone(hydrated);
  changed.builder.originKey = "";
  const result = reconcileCharacterGraph({ character: changed, previousCharacter: hydrated, gameData: GAME_DATA });
  assert.ok(result.impacts.some((item) => item.code === "source-owned-ability-removed"));
  assert.ok(!result.character.builder.autoAbilityNames.includes("Origin Feature - Living Archive"));
});
