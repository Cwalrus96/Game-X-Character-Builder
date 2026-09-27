import assert from "node:assert/strict";
import test from "node:test";
import { naturalFixture } from "./fixtures/natural-weapons.mjs";
import { projectCharacterTraits, getActiveTraitTechniqueDetails } from "../public/js/core/trait-rules.js";
import { getTechniqueSelectionState, getTechniquePerformance } from "../public/js/core/technique-rules.js";
import { meetsPrerequisites } from "../public/js/core/prerequisites.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { reconcileCharacterGraph, createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { collectAffectedNodeIds } from "../public/js/core/graph-core.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { SetTraitChoice } from "../public/js/core/character-commands.js";
import { computeEnhancementCapacity, computeTotalWeaponSlots } from "../public/js/core/weapon-utils.js";
import { isGameDataRecordSelectable } from "../public/js/core/selection-rules.js";
import { createCharacterGrantCollection } from "../public/js/core/game-data.js";
import { renderGrantedWeaponHtml } from "../public/js/core/weapon-grant-display.js";
import { renderTechniqueProfileHtml } from "../public/js/core/technique-utils.js";
import { decodeCharacter } from "../public/js/core/character-codec.js";
import { describeCharacterChange } from "../public/js/builder/character-impact-display.js";

test("Trait weapons inherit rank, retain distinct identities and attacks, and cost no equipment capacity", () => {
  const { character, data } = naturalFixture(), before = structuredClone(character);
  const projection = projectCharacterTraits(character, data);
  assert.equal(projection.weapons.length, 2);
  assert.equal(new Set(projection.weapons.map(weapon => weapon.id)).size, 2);
  assert(projection.weapons.every(weapon => weapon.rank === 2 && weapon.associatedSkill === "Metamorphosis"));
  assert.equal(getActiveTraitTechniqueDetails(projection).get("crush").rank, 2);
  assert.deepEqual(projection.tags, []);
  assert.equal(meetsPrerequisites([{ type: "weapon-set", count: 2, tag: "Heavy" }], { builder: character.builder, gameData: data }), true);
  assert.equal(meetsPrerequisites([{ type: "tag", tag: "Heavy" }], { builder: character.builder, gameData: data }), false);
  assert.equal(computeTotalWeaponSlots(projection.weapons, data.weaponBases), 0);
  assert.equal(computeEnhancementCapacity(projection.weapons), 0);
  assert.deepEqual(data.weaponBases.filter(row => isGameDataRecordSelectable(row, { allowGrantedOnly: true })).map(row => row.weaponKey), ["blade"]);
  assert.equal(createCharacterGrantCollection(data, character.builder).getAll("skill-substitution").length, 2);
  assert.deepEqual(character, before);
});

test("explicit access uses substitution rank but the same Natural weapons must meet the prerequisites", () => {
  const { input, get, character, feature } = naturalFixture();
  assert.equal(getTechniqueSelectionState(get("heavy"), input).eligible, true);
  assert.equal(getTechniqueSelectionState(get("dual"), input).eligible, true);
  assert.equal(getTechniqueSelectionState(get("high"), input).eligible, false);
  character.builder.weapons = [{ id: "blade1", weaponKey: "blade", rank: 2, tags: ["Sharp", "Melee"], enhancements: [] }];
  assert.equal(getTechniqueSelectionState(get("sharp"), input).eligible, false, "a carried blade cannot supply the missing Natural tag combination");
  feature.grants = feature.grants.filter(grant => grant.type !== "technique");
  assert.equal(getTechniqueSelectionState(get("heavy"), input).eligible, false, "substitution alone supplies no acquisition");
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: "1" }];
  assert.equal(getTechniqueSelectionState(get("sharp"), input).eligible, true, "ordinary trained acquisition remains valid");
});

test("Martial Arts substitutions affect rolls and scaling without unlocking higher ranks", () => {
  const { input, get, character } = naturalFixture();
  assert.equal(getTechniqueSelectionState(get("basic"), input).eligible, true);
  assert.equal(getTechniqueSelectionState(get("martial"), input).eligible, false);
  assert.equal(getTechniquePerformance(get("basic"), input).skillName, "Metamorphosis");
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Martial Arts", rank: "1" }];
  assert.equal(getTechniqueSelectionState(get("martial"), input).eligible, true);
  const performance = getTechniquePerformance(get("martial"), input);
  assert.equal(performance.rank, 2);
  const html = renderTechniqueProfileHtml({ ...get("martial"), pumpingByRank: { 1: "one", 2: "two" } }, { performance });
  assert.match(html, /Metamorphosis/); assert.match(html, /Pumping:<\/strong> two/);
});

test("Web weapon routes inherit their provider's skill and stay distinct from body tags", () => {
  const { character, data, input, get } = naturalFixture();
  Object.values(character.builder.traitChoices)[0].traitKey = "webs";
  assert.equal(getTechniqueSelectionState(get("web-area"), input).eligible, true);
  assert.equal(getTechniqueSelectionState(get("heavy"), input).eligible, false);
  assert.equal(getTechniquePerformance(get("web-area"), input).skillName, "Metamorphosis");
  const projection = projectCharacterTraits(character, data);
  assert.deepEqual(projection.tags, []);
  assert(getActiveTraitTechniqueDetails(projection).has("shoot"));
  assert.match(renderGrantedWeaponHtml(projection.weapons[0], { gameData: data, builder: character.builder }), /Metamorphosis/);
});

test("rank changes and dynamic Reach use the current Trait provider without adding skill training", () => {
  const { data, input, character, get, feature } = naturalFixture();
  data.weaponBases[0].tags.push("Reach N"); data.weaponBases[0].reachByRank = { 1: 2, 2: 3 };
  assert.equal(meetsPrerequisites([{ type: "weapon", minReach: 3 }], input), true);
  feature.grants.find(grant => grant.type === "skill").rank = 1;
  assert.equal(meetsPrerequisites([{ type: "weapon", minReach: 3 }], input), false);
  get("heavy").rank = 2;
  assert.equal(getTechniqueSelectionState(get("heavy"), input).eligible, false);
  assert.equal(getTechniqueSelectionState(get("martial"), input).eligible, false);
  assert.equal(projectCharacterTraits(character, data).weapons[0].rank, 1);
});

test("additional prerequisites and inactive parent features cannot be bypassed by access grants", () => {
  const { data, input, get } = naturalFixture();
  get("heavy").prerequisites.push({ type: "attribute", key: "body", minValue: 6 });
  assert.equal(getTechniqueSelectionState(get("heavy"), input).eligible, false);
  get("heavy").prerequisites.pop();
  data.origins[0].prerequisites = [{ type: "skill", name: "Martial Arts", rank: 4 }];
  assert.equal(getTechniqueSelectionState(get("heavy"), input).eligible, false);
  assert.equal(getTechniquePerformance(get("basic"), input).skillName, "Martial Arts");
});

test("changing a Trait reviews dependent Techniques, preserves cancellation and round-trips without storing derived weapons", () => {
  const { character, data } = naturalFixture();
  character.builder.selectedTechniques = ["heavy", "dual", "crush"];
  const settled = reconcileCharacterGraph({ character, gameData: data });
  assert.equal(settled.ok, true, JSON.stringify(settled.impacts));
  assert.deepEqual(settled.character.builder.selectedTechniques, ["heavy", "dual"]);
  assert.equal(settled.character.builder.weapons.length, 0);
  const graph = compileCharacterGraph({ character: settled.character, gameData: data });
  assert.equal(graph.ok, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.filter(node => node.type === "grant-choice").length, 0, "access creates no free answers");
  const answer = Object.values(settled.character.builder.traitChoices)[0];
  assert(collectAffectedNodeIds(graph, [`trait-choice:${answer.choiceId}`]).includes("technique-selection:heavy"));
  const session = new CharacterSession({ character: settled.character, revision: 1, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: data }) });
  const command = SetTraitChoice({ ...answer, traitKey: "webs" });
  const proposal = session.propose(command);
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  assert(proposal.impacts.some(impact => impact.code === "derived-weapon-removed"));
  assert.deepEqual(describeCharacterChange(proposal, { gameData: data }).messages.filter(message => message.startsWith("Weapon:")),
    ["Weapon: Crushing Limbs (weapon 1)", "Weapon: Crushing Limbs (weapon 2)"]);
  assert.deepEqual(proposal.reconciled.builder.selectedTechniques, []);
  session.cancelProposal(proposal.proposalId);
  assert.deepEqual(session.getState().working, settled.character);
  const second = session.propose(command); session.acceptProposal(second.proposalId, { confirm: true });
  const decoded = decodeCharacter(JSON.parse(JSON.stringify(session.getState().working)));
  assert.equal(decoded.ok, true);
  assert.equal(projectCharacterTraits(decoded.value, data).weapons[0].weaponKey, "webs");
  assert.equal(reconcileCharacterGraph({ character: decoded.value, gameData: data }).impacts.some(impact => impact.category === "confirmation-required"), false);
});
