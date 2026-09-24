import assert from "node:assert/strict";
import test from "node:test";
import { CharacterSessionPage } from "../public/js/builder/character-session-page.js";
import { SetCombatSkills, SetLevel } from "../public/js/core/character-commands.js";
import { reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";
import { GRAPH_GAME_DATA, makeGraphCharacter, makeWeaponGrantAnswer } from "./fixtures/graph-core.mjs";

function fixture({ rank = 1, minRank = 1, enhancements = [] } = {}) {
  const gameData = structuredClone(GRAPH_GAME_DATA);
  gameData.weaponBases = [{ weaponKey: "throwing-blade", name: "Throwing Blade", status: "playable", selectable: true,
    minRank, tags: ["Concealed"], profiles: [{ profileType: "basicAttack", skill: "Ranged Weapons" }] }];
  gameData.weaponEnhancements = ["first", "second"].map(enhancementKey => ({ enhancementKey, name: enhancementKey, minRank: 1, prerequisites: [] }));
  const character = makeGraphCharacter({ level: 3 });
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Ranged Weapons", rank: String(rank) }];
  character.builder.weapons = [{ id: "blade-1", weaponKey: "throwing-blade", rank, customName: "", generated: false,
    choiceId: "", sourceChoiceId: "", enhancements: enhancements.map((value, index) => ({ id: `enh-${index}`, enhancementKey: index ? "second" : "first", rank: value, selections: {}, granted: false })) }];
  return { gameData, character };
}

async function reviewBothDecisions({ gameData, character }, command, verify) {
  const before = structuredClone(character);
  let accept = false;
  const reviews = [], rejections = [];
  const page = new CharacterSessionPage({ character, gameData, revision: 7,
    confirmImpacts: review => { reviews.push(review); return accept; },
    onCommandRejected: rejection => rejections.push(rejection),
  });
  const cancelled = await page.requestCharacterCommand(null, command);
  assert.equal(cancelled.reason, "cancelled", JSON.stringify(cancelled.errors));
  assert.equal(reviews.length, 1);
  assert.deepEqual(page.getCharacter(), before);
  verify(reviews[0].proposal, reviews[0].summary);
  accept = true;
  const accepted = await page.requestCharacterCommand(null, command);
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors));
  assert.equal(reviews.length, 2);
  assert.deepEqual(rejections, []);
  assert.deepEqual(page.getCharacter(), reviews[1].proposal.reconciled);
  const snapshot = page.session.createSaveSnapshot();
  assert.deepEqual(snapshot.character, page.getCharacter());
  assert.equal(snapshot.expectedRevision, 7);
  const repeated = reconcileCharacterGraph({ character: snapshot.character, gameData });
  assert.equal(repeated.ok, true, JSON.stringify(repeated.impacts));
  assert.deepEqual(repeated.character, snapshot.character);
  assert.equal(repeated.impacts.some(item => item.category === "confirmation-required"), false);
  assert.deepEqual(character, before);
}

test("skill loss reviews weapon, enhancement, feat, option and Technique consequences together", async () => {
  const state = fixture({ enhancements: [1] });
  const weaponRequirement = { type: "weapon", key: "throwing-blade" };
  state.gameData.feats[0].prerequisites = [weaponRequirement];
  state.gameData.classFeatures.ninja[2].options[1].prerequisites = [weaponRequirement];
  state.gameData.techniques.find(item => item.techniqueKey === "shadow-step").prerequisites = [weaponRequirement];
  state.character.builder.selectedFeats = ["shadow-adept"];
  state.character.builder.selectedClassFeatureOptions = ["master-path"];
  state.character.builder.selectedTechniques = ["shadow-step"];
  const hydrated = reconcileCharacterGraph(state);
  assert.equal(hydrated.ok, true, JSON.stringify(hydrated.impacts));
  state.character = hydrated.character;
  await reviewBothDecisions(state, SetCombatSkills([]), (proposal, summary) => {
    assert.deepEqual(proposal.reconciled.builder.weapons, []);
    assert.deepEqual(proposal.reconciled.builder.selectedFeats, []);
    assert.deepEqual(proposal.reconciled.builder.selectedClassFeatureOptions, []);
    assert.deepEqual(proposal.reconciled.builder.selectedTechniques, []);
    assert(summary.messages.includes("Weapon: Throwing Blade"));
    assert(summary.messages.includes("Feat: Shadow Adept"));
    assert(summary.messages.includes("Class feature: Master Path"));
    assert(summary.messages.includes("Technique: Shadow Step"));
    assert.equal(proposal.impacts.some(item => item.category === "error"), false);
  });
});

test("a legal lower weapon rank is retained and excess enhancement slots are reviewed", async () => {
  await reviewBothDecisions(fixture({ rank: 2, enhancements: [1, 1] }), SetCombatSkills([{ skill: "Ranged Weapons", rank: "1" }]), proposal => {
    const [weapon] = proposal.reconciled.builder.weapons;
    assert.equal(weapon.rank, 1);
    assert.deepEqual(weapon.enhancements.map(item => item.id), ["enh-0"]);
    assert(proposal.impacts.some(item => item.code === "weapon-enhancement-capacity-removed"));
  });
});

test("level-driven skill reduction uses the same reviewed dependency removal", async () => {
  await reviewBothDecisions(fixture({ rank: 2, minRank: 2 }), SetLevel(1), proposal => {
    assert.deepEqual(proposal.reconciled.builder.weapons, []);
    assert(proposal.impacts.some(item => item.code === "skill-rank-cap-applied"));
  });
});

test("missing catalogue references still identify a blocking data error instead of deleting unknown data", async () => {
  const { character, gameData } = fixture();
  character.builder.weapons[0].weaponKey = "missing";
  let confirmations = 0;
  const page = new CharacterSessionPage({ character, gameData, confirmImpacts: () => { confirmations += 1; return true; } });
  const result = await page.requestCharacterCommand(null, SetCombatSkills([]));
  assert.equal(result.reason, "validation-error");
  assert(result.errors.some(message => /does not exist/.test(message)));
  assert.equal(confirmations, 0);
  assert.deepEqual(page.getCharacter(), character);
});

test("a rank-zero weapon stays while an enhancement that needs rank one is reviewed for removal", async () => {
  await reviewBothDecisions(fixture({ minRank: 0, enhancements: [1] }), SetCombatSkills([]), proposal => {
    assert.equal(proposal.reconciled.builder.weapons[0].rank, 0);
    assert.deepEqual(proposal.reconciled.builder.weapons[0].enhancements, []);
    assert(proposal.impacts.some(item => item.code === "incompatible-weapon-enhancement-removed"));
  });
});

test("another governing skill preserves the weapon without a removal prompt", async () => {
  const { character, gameData } = fixture();
  gameData.weaponBases[0].profiles.push({ profileType: "basicAttack", skill: "Melee Weapons" });
  character.builder.sheet.repeatables.combatSkillsExtra.push({ skill: "Melee Weapons", rank: "1" });
  const page = new CharacterSessionPage({ character, gameData, confirmImpacts: () => assert.fail("Still eligible") });
  const result = await page.requestCharacterCommand(null, SetCombatSkills([{ skill: "Melee Weapons", rank: "1" }]));
  assert.equal(result.ok, true);
  assert.deepEqual(page.getCharacter().builder.weapons, character.builder.weapons);
});

test("capacity loss reconciles purchased enhancements through their source answer and preserves free enhancements", async () => {
  const state = fixture();
  state.character.builder.classKey = "guardian";
  state.character.builder.primaryAttribute = "willpower";
  state.character.builder.attributes.willpower = 1;
  const answer = makeWeaponGrantAnswer({ weaponKey: "throwing-blade" });
  answer.enhancements = [
    { id: "paid-first", enhancementKey: "first", rank: 1, selections: {}, granted: false },
    { id: "paid-second", enhancementKey: "second", rank: 1, selections: {}, granted: false },
    { id: "free", enhancementKey: "first", rank: 1, selections: {}, granted: true },
  ];
  state.character.builder.grantChoices[answer.choiceId] = answer;
  const hydrated = reconcileCharacterGraph(state);
  assert.equal(hydrated.ok, true, JSON.stringify(hydrated.impacts));
  state.character = hydrated.character;
  await reviewBothDecisions(state, SetCombatSkills([]), proposal => {
    const [weapon] = proposal.reconciled.builder.weapons;
    assert.equal(weapon.generated, true);
    assert.equal(weapon.rank, 1);
    assert.deepEqual(weapon.enhancements.map(item => item.id), ["paid-first", "free"]);
    assert.deepEqual(proposal.reconciled.builder.grantChoices[answer.choiceId].enhancements, weapon.enhancements);
  });
});

test("enhancement prerequisite loss on a granted weapon reviews paid and free answers without removing their provider", async () => {
  const state = fixture();
  state.character.builder.weapons = [];
  state.character.builder.classKey = "guardian";
  state.character.builder.primaryAttribute = "willpower";
  state.character.builder.attributes.willpower = 1;
  for (const enhancement of state.gameData.weaponEnhancements) {
    enhancement.prerequisites = [{ type: "skill", name: "Ranged Weapons", rank: 1 }];
  }
  const answer = makeWeaponGrantAnswer({ weaponKey: "throwing-blade" });
  answer.enhancements = [
    { id: "paid", enhancementKey: "first", rank: 1, selections: {}, granted: false },
    { id: "free", enhancementKey: "second", rank: 1, selections: {}, granted: true },
  ];
  state.character.builder.grantChoices[answer.choiceId] = answer;
  const hydrated = reconcileCharacterGraph(state);
  assert.equal(hydrated.ok, true, JSON.stringify(hydrated.impacts));
  state.character = hydrated.character;
  assert.equal(state.character.builder.weapons[0].enhancements.length, 2);
  await reviewBothDecisions(state, SetCombatSkills([]), proposal => {
    const [weapon] = proposal.reconciled.builder.weapons;
    assert.equal(weapon.generated, true);
    assert.equal(weapon.rank, 1);
    assert.deepEqual(weapon.enhancements, []);
    assert.deepEqual(proposal.reconciled.builder.grantChoices[answer.choiceId].enhancements, []);
    assert.equal(proposal.reconciled.builder.classKey, "guardian");
    assert.equal(proposal.impacts.filter(item => item.code === "incompatible-weapon-enhancement-removed").length, 2);
  });
});
