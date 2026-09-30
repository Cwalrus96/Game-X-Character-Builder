import assert from "node:assert/strict";
import test from "node:test";
import { TechniquesWidget } from "../public/js/builder/widgets/techniques-widget.js";
import { TechniqueChoiceWidget } from "../public/js/builder/widgets/technique-choice-widget.js";
import { createPrerequisiteContext, meetsPrerequisites } from "../public/js/core/prerequisites.js";
import { getCombatSkillRanks } from "../public/js/core/skill-rules.js";
import { getTechniqueSelectionState } from "../public/js/core/technique-rules.js";
import { getTechniqueGrantSelectionState } from "../public/js/core/technique-grant-rules.js";

function fixture() {
  const ready = { expressionSyntaxVersion: 3, status: "playable" };
  const technique = (key, prerequisites = [], extra = {}) => ({ ...ready, techniqueKey: key, techniqueName: key,
    rank: 1, skill: "Spellcasting", selectionRoutes: [{ type: "skill", name: "Spellcasting" }], prerequisites, ...extra });
  const gameData = { schemaVersion: 3, expressionSyntaxVersion: 3,
    classes: [{ ...ready, classKey: "mage", name: "Mage", combatTechniqueSkill: "Spellcasting" }],
    origins: [{ ...ready, originKey: "gift", name: "Gift", grants: [{ type: "technique", key: "gifted" }, { type: "trait", key: "wings", rank: 2 }] }],
    traits: [{ ...ready, traitKey: "wings", name: "Wings", rank: 1, description: "You can fly.",
      grants: [{ type: "tag", tag: "Flying", minRank: 1 }] }],
    weaponBases: [{ weaponKey: "wand", name: "Wand", tags: ["Arcane"] }],
    techniques: [technique("basic"), technique("gifted", [], { selectionRoutes: [{ type: "granted" }] }),
      technique("follow-up", [{ type: "technique", key: "gifted" }]),
      technique("flight", [{ type: "tag", name: "Flying" }]),
      technique("weapon", [{ type: "weapon", tag: "Arcane" }]),
      technique("choice", [{ type: "choice", choiceRef: "missing", rank: 1 }]),
      technique("advanced", [], { rank: 2 }), technique("unfinished", [], { status: "incomplete" })] };
  const builder = { classKey: "mage", originKey: "gift", level: 2, primaryAttribute: "heart", attributes: { heart: 3 },
    selectedTechniques: [], sheet: { fields: {}, repeatables: { combatSkillsExtra: [{ skill: "Spellcasting", rank: "1" }] } },
    weapons: [{ id: "wand-1", weaponKey: "wand", rank: 1, tags: ["Arcane"] }] };
  const ordinary = Object.assign(Object.create(TechniquesWidget.prototype), {
    getBuilder: () => builder, getGameData: () => gameData, getTechniqueIndexes: () => null,
    getSelectedTechniques: () => new Set(builder.selectedTechniques), filterKnownSkills: true,
  });
  const granted = Object.assign(Object.create(TechniqueChoiceWidget.prototype), {
    getBuilder: () => builder, gameData, grant: { type: "technique-choice", skill: "Spellcasting" },
  });
  return { gameData, builder, ordinary, granted };
}

test("prepared ordinary catalogue facts preserve per-record prerequisites and acquisition results", () => {
  const { gameData, builder, ordinary } = fixture();
  const before = structuredClone({ gameData, builder });
  const context = ordinary.getTechniqueContext();
  for (const technique of gameData.techniques) {
    assert.equal(ordinary.passesTechniquePrerequisites(technique, context), meetsPrerequisites(technique.prerequisites, {
      gameData, builder, grantedSkillState: context.grantedSkillState, deferUnresolvedChoices: true,
    }), technique.techniqueKey);
    assert.deepEqual(ordinary.getTechniqueAccess(technique, context), getTechniqueSelectionState(technique, {
      ...context.rulesContext, knownCombatSkills: context.knownCombatSkills,
      skillRanks: getCombatSkillRanks(gameData, builder), allowGrantedOnly: ordinary.isFreeTechniqueName(technique.techniqueKey, context),
    }), technique.techniqueKey);
  }
  assert.deepEqual({ gameData, builder }, before);
});

test("ordinary refreshes observe changes to ranks, weapons, providers and catalogue prerequisites", () => {
  const { gameData, builder, ordinary } = fixture();
  const available = () => {
    const context = ordinary.getTechniqueContext();
    return gameData.techniques.filter(technique => ordinary.passesKnownSkillFilter(technique, context)).map(technique => technique.techniqueKey);
  };
  assert(available().includes("follow-up"));
  assert(available().includes("flight"));
  assert(available().includes("weapon"));
  builder.originKey = ""; builder.weapons = [];
  assert(!available().includes("follow-up"));
  assert(!available().includes("flight"));
  assert(!available().includes("weapon"));
  builder.sheet.repeatables.combatSkillsExtra[0].rank = "2";
  assert(available().includes("advanced"));
  builder.sheet.repeatables.combatSkillsExtra[0].rank = "1";
  assert(!available().includes("advanced"));
  gameData.techniques[0].prerequisites = [{ type: "attribute", name: "Heart", minValue: 4 }];
  assert(!available().includes("basic"));
  builder.attributes.heart = 4;
  assert(available().includes("basic"));
});

test("prepared granted catalogue preserves strict prerequisites, rank filters and source-owned knowledge", () => {
  const { gameData, builder, granted } = fixture();
  const context = granted.getContext();
  const oldContext = createPrerequisiteContext({ gameData, builder, grantedSkillState: context.grantedSkillState,
    skillRanks: getCombatSkillRanks(gameData, builder) });
  const expected = gameData.techniques.filter(technique => getTechniqueGrantSelectionState(technique, granted.grant, oldContext).eligible
    && meetsPrerequisites(technique.prerequisites, oldContext)).map(technique => technique.techniqueKey).sort();
  assert.deepEqual(granted.getAvailableTechniques(context).map(technique => technique.techniqueKey).sort(), expected);
  assert(expected.includes("follow-up"));
  assert(!expected.includes("choice"), "granted pickers must not defer unanswered prerequisites");
  assert(!expected.includes("advanced"));
  assert(!expected.includes("unfinished"));
});

test("granted refreshes pick up accepted edits and restored state without retaining old character facts", () => {
  const { gameData, builder, granted } = fixture();
  const before = structuredClone(builder);
  const original = granted.getAvailableTechniques().map(technique => technique.techniqueKey);
  builder.originKey = ""; builder.weapons = [];
  builder.sheet.repeatables.combatSkillsExtra[0].rank = "2";
  const changed = granted.getAvailableTechniques().map(technique => technique.techniqueKey);
  assert(changed.includes("advanced"));
  assert(!changed.includes("follow-up"));
  assert(!changed.includes("flight"));
  assert(!changed.includes("weapon"));
  assert.equal(granted.getTechniqueSkillRank(gameData.techniques[0], granted.getContext()), 2);
  Object.assign(builder, before);
  assert.deepEqual(granted.getAvailableTechniques().map(technique => technique.techniqueKey), original);
  assert.equal(granted.getTechniqueSkillRank(gameData.techniques[0], granted.getContext()), 1);
});

test("legacy unresolved-choice deferral remains limited to the ordinary picker", () => {
  const { gameData, ordinary, granted } = fixture();
  gameData.expressionSyntaxVersion = 2;
  const technique = { techniqueKey: "legacy", techniqueName: "Legacy", rank: 1, skill: "Spellcasting",
    prerequisites: [{ type: "choice", choiceRef: "unanswered", rank: 1 }] };
  gameData.techniques = [technique];
  assert.equal(ordinary.passesTechniquePrerequisites(technique, ordinary.getTechniqueContext()), true);
  assert.deepEqual(granted.getAvailableTechniques(), []);
});
