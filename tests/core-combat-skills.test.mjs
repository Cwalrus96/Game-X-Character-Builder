import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCharacter, CharacterCodec } from "../public/js/core/character-codec.js";
import { SetCombatSkills, SetClass, SetTechniqueSelection } from "../public/js/core/character-commands.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { CORE_COMBAT_SKILLS, computeKnownCombatSkillsAndGrants, getSkillAllocationState, getSkillDisplayState, fitSkillsToRules, getCombatSkillRanks, isCoreCombatSkill } from "../public/js/core/skill-rules.js";
import { SkillsWidget } from "../public/js/builder/widgets/skills-widget.js";

const data = {
  schemaVersion: 2,
  classes: [{ classKey: "scholar", name: "Scholar", status: "playable", selectable: true,
    primaryAttributeA: "Intellect", primaryAttributeB: "Heart", combatTechniqueSkill: "Spellcasting" },
  { classKey: "fighter", name: "Fighter", status: "playable", selectable: true,
    primaryAttributeA: "Intellect", primaryAttributeB: "Heart", combatSkills: [{ name: "Martial Arts", progression: "slow" }] }],
  classFeatures: { scholar: [], fighter: [] }, classSkills: [], origins: [], feats: [],
  techniques: [{ techniqueKey: "precise-strike", techniqueName: "Precise Strike", selectionMode: "selectable", selectable: true,
    skillKeys: ["martial-arts"], prerequisites: [{ type: "skill", name: "Martial Arts", rank: 2 }] }],
  weaponBases: [], weaponEnhancements: [],
};
function character() {
  const value = createDefaultCharacter({ ownerUid: "core_combat_test" });
  Object.assign(value.builder, { classKey: "scholar", primaryAttribute: "intellect", level: 3 });
  value.builder.attributes.intellect = 1;
  return value;
}
function sessionFor(value = character()) {
  return new CharacterSession({ character: value, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: data }) });
}
function accept(session, command) {
  const proposal = session.propose(command);
  assert.equal(proposal.ok, true, JSON.stringify(proposal.impacts));
  session.acceptProposal(proposal.proposalId, { confirm: true });
  return proposal;
}

test("every class and a classless character can train exactly the three Core Combat Skills", () => {
  for (const classKey of ["", "scholar", "fighter"]) {
    const value = character();
    value.builder.classKey = classKey;
    const before = structuredClone(value);
    const allocation = getSkillAllocationState(data, value.builder);
    assert.deepEqual(allocation.coreCombat.map((row) => row.name), CORE_COMBAT_SKILLS);
    assert.equal(allocation.coreCombat.every((row) => row.editable && row.maximumAssignable === 2), true);
    assert.deepEqual(allocation.combat, [], "unbought controls do not invent paid storage or graph answers");
    assert.equal(allocation.spent, 0);
    assert.equal(Object.isFrozen(allocation.coreCombat), true);
    const known = computeKnownCombatSkillsAndGrants(data, value.builder).knownCombatSkills;
    for (const skill of CORE_COMBAT_SKILLS) assert(known.has(skill));
    assert.equal(known.has("Ninjutsu"), false);
    assert.deepEqual(value, before);
  }
  assert.equal(isCoreCombatSkill("Targeting"), true);
  assert.equal(isCoreCombatSkill("Spellcasting"), false);
});

test("all three purchases use one point budget, grant floors and existing Combat storage", () => {
  const value = character();
  value.builder.sheet.repeatables.combatSkillsExtra = CORE_COMBAT_SKILLS.map((skill) => ({ skill, rank: "2" }));
  const allocation = getSkillAllocationState(data, value.builder);
  assert.equal(allocation.spent, 6);
  assert.deepEqual(allocation.coreCombat.map((row) => row.rank), [2, 2, 2]);
  assert.deepEqual([...getCombatSkillRanks(data, value.builder).values()].filter((rank) => rank === 2), [2, 2, 2]);
  value.builder.classKey = "fighter";
  const granted = getSkillAllocationState(data, value.builder);
  assert.equal(granted.coreCombat[0].grantedRank, 1);
  assert.equal(granted.spent, 5);
  value.builder.level = 1;
  value.builder.attributes.intellect = 0;
  const fitted = fitSkillsToRules(data, value.builder);
  assert.equal(fitted.allocation.spent, 2);
  assert.deepEqual(fitted.combatSkillsExtra.map((row) => row.rank), ["1", "1", "0"]);
});

test("Core purchases and class-grant removal round trip without a schema migration", () => {
  const value = character();
  value.builder.classKey = "fighter";
  const session = sessionFor(value);
  accept(session, SetCombatSkills(CORE_COMBAT_SKILLS.map((skill) => ({ skill, rank: "2" }))));
  accept(session, SetClass("scholar"));
  const snapshot = session.createSaveSnapshot();
  const decoded = CharacterCodec.decode(CharacterCodec.encode(snapshot.character).value);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value, snapshot.character);
  assert.equal(getSkillAllocationState(data, decoded.value.builder).spent, 6);
  const display = getSkillDisplayState(data, decoded.value.builder);
  assert.deepEqual(display.coreCombatSkills, CORE_COMBAT_SKILLS.map((skill) => ({ skill, rank: "2" })));
  assert.deepEqual(sessionFor(decoded.value).getState().working, decoded.value);
});

test("lowering a Core Combat rank reviews dependent Techniques and cancellation preserves both", () => {
  const session = sessionFor();
  accept(session, SetCombatSkills([{ skill: "Martial Arts", rank: "2" }]));
  accept(session, SetTechniqueSelection(["precise-strike"]));
  assert.deepEqual(session.getState().working.builder.selectedTechniques, ["precise-strike"]);
  const before = session.getState().working;
  const cancelled = session.propose(SetCombatSkills([{ skill: "Martial Arts", rank: "1" }]));
  assert.equal(cancelled.requiresConfirmation, true);
  session.cancelProposal(cancelled.proposalId);
  assert.deepEqual(session.getState().working, before);
  accept(session, SetCombatSkills([{ skill: "Martial Arts", rank: "1" }]));
  assert.deepEqual(session.getState().working.builder.selectedTechniques, []);
});

test("historical Ranged aliases and higher free ranks produce a single Core control without storage changes", () => {
  const value = character();
  value.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "2" }];
  const currentData = structuredClone(data);
  currentData.classFeatures.scholar = [{ type: "feature", featureKey: "training", classKey: "scholar", level: 1,
    grants: [{ type: "skill", name: "Ranged Weapons", rank: 4 }] }];
  const before = structuredClone(value);
  const allocation = getSkillAllocationState(currentData, value.builder);
  assert.equal(allocation.coreCombat.length, 3);
  const ranged = allocation.coreCombat.find((row) => row.name === "Ranged Weapons");
  assert.deepEqual([ranged.rank, ranged.minimumAssignable, ranged.maximumAssignable, allocation.spent], [4, 4, 4, 0]);
  assert.deepEqual(getSkillDisplayState(currentData, value.builder).coreCombatSkills[2], { skill: "Ranged Weapons", rank: "4" });
  assert.deepEqual(value, before);
});

// Small DOM boundary double: exercise actual widget events and command payloads.
function element() {
  return { innerHTML: "", style: {}, dataset: {}, events: new Map(), children: [], controls: [],
    classList: { toggle() {} }, addEventListener(type, fn) { this.events.set(type, fn); },
    removeEventListener(type) { this.events.delete(type); }, appendChild(node) { this.children.push(node.firstElementChild); },
    querySelectorAll(selector) {
      if (selector === "select[data-core-combat-key]") {
        this.controls = [...this.innerHTML.matchAll(/data-core-combat-key="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
          .map((match) => Object.assign(element(), { dataset: { coreCombatKey: match[1] }, value: /value="([^"]*)" selected/.exec(match[2])?.[1] || "" }));
        return this.controls;
      }
      if (selector === "input, select, button") return this.controls;
      if (selector === "[data-editable-skill-row]") return this.children;
      return [];
    },
  };
}
function widgetHarness(value = character()) {
  const elements = Object.fromEntries(["classUtilitySkillOptions", "classUtilitySkillsCard", "classUtilitySkillsMeta", "coreSkillGrid", "coreCombatSkillGrid", "defenseSkillGrid", "combatSkillGrid", "settingSkillGrid", "skillPointsTotal", "skillPointsSpent", "skillPointsRemaining", "skillRankCap", "skillPointsRemainingPill"].map((key) => [key, element()]));
  const commands = [];
  const page = { getCharacter: () => value, registerWidget() {}, async requestCharacterCommand(widget, command) { commands.push(command); return { ok: false, reason: "cancelled" }; } };
  const widget = new SkillsWidget(page, { gameData: data, elements });
  return { elements, commands, widget, value };
}
test("Core widget replaces an aliased paid rank and restores the accepted selection after cancellation", async () => {
  const value = character();
  value.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Targeting", rank: "1" }];
  const before = structuredClone(value);
  const h = widgetHarness(value);
  assert.doesNotMatch(h.elements.combatSkillGrid.innerHTML, /Martial Arts|Melee Weapons|Ranged Weapons/);
  assert.match(h.elements.combatSkillGrid.innerHTML, /Spellcasting/);
  const control = h.elements.coreCombatSkillGrid.controls[2];
  control.value = "2";
  await control.events.get("change")({ currentTarget: control });
  assert.deepEqual(h.commands, [SetCombatSkills([{ skill: "Ranged Weapons", rank: "2" }])]);
  assert.equal(h.elements.coreCombatSkillGrid.controls[2].value, "1");
  assert.deepEqual(value, before);
});
test("Core widget reset to the free floor removes only that paid overlay", async () => {
  const value = character();
  value.builder.classKey = "fighter";
  value.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Martial Arts", rank: "2" }, { skill: "Melee Weapons", rank: "2" }];
  const h = widgetHarness(value);
  const control = h.elements.coreCombatSkillGrid.controls[0];
  control.value = "1";
  await control.events.get("change")({ currentTarget: control });
  assert.deepEqual(h.commands, [SetCombatSkills([{ skill: "Melee Weapons", rank: "2" }])]);
});
