import assert from "node:assert/strict";
import test from "node:test";
import { traitData, traitCharacter } from "./fixtures/traits.mjs";
import { projectCharacterTraits } from "../public/js/core/trait-rules.js";
import { createTraitOptionAnswer, traitOptionIdentity } from "../public/js/core/trait-option-rules.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { reconcileCharacterGraph, createCharacterSessionGraphReconciler } from "../public/js/core/graph-reconciler.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { SetTraitChoice, SetGrantChoices, SetOrigin } from "../public/js/core/character-commands.js";
import { decodeCharacter } from "../public/js/core/character-codec.js";
import { getTechniqueSelectionState, getTechniquePerformance } from "../public/js/core/technique-rules.js";
import { projectSheetTechniques } from "../public/js/core/sheet-technique-projection.js";
import { renderTraitProjectionHtml } from "../public/js/core/trait-display.js";
import { collectAffectedNodeIds } from "../public/js/core/graph-core.js";
import { TraitWidget } from "../public/js/builder/widgets/trait-widget.js";
import { InteractiveWidget } from "../public/js/builder/widgets/interactive-widget.js";
import { buildSchemaV5Workbook, VALID_SCHEMA_V5_RECORDS } from "./fixtures/game-data-schema-v5.mjs";
import { adaptGameDataWorkbook } from "../scripts/game-data/source-adapters.mjs";
import { validateAdaptedGameData } from "../scripts/game-data/model-validator.mjs";

function fixture(traitKey = "mech-elemental-blaster", count = 2) {
  const gameData = traitData(), character = traitCharacter({ traitKey });
  const template = gameData.traits[0], ready = { expressionSyntaxVersion: 3, status: "playable", runtimeSupport: { status: "supported", reasons: [] } };
  const origin = gameData.origins[0].features[0];
  origin.grants[0] = { type: "trait", tag: "Body", choiceId: "body", skill: "Metamorphosis", count };
  origin.grants.push({ type: "skill", name: "Metamorphosis", rank: 2 });
  gameData.traits.push({ ...template, traitKey: "mech-elemental-blaster", name: "Elemental Blaster", repeatable: true,
    techniqueKeys: ["elemental-blast"], grants: [{ type: "choice", choiceId: "element", filterType: "element", count: 1 }] },
  { ...template, traitKey: "integrated-weapon", name: "Integrated Weapon", repeatable: true, techniqueKeys: [],
    grants: [{ type: "weapon", choiceId: "trait:integrated-weapon:base", tag: ["One-Handed", "Versatile"], count: 1 }] },
  { ...template, traitKey: "combat-training", name: "Combat Training", repeatable: true, techniqueKeys: [],
    grants: [{ type: "choice", choiceId: "discipline", filterType: "skill", count: 1 }] });
  gameData.techniques.push(...[
    ["elemental-blast", "Elementalism", 1, []], ["fire-wave", "Elementalism", 2, ["Fire"]], ["water-wave", "Elementalism", 2, ["Water"]],
    ["cut", "Melee Weapons", 1, []], ["advanced-cut", "Melee Weapons", 2, []], ["shoot", "Ranged Weapons", 1, []],
  ].map(([techniqueKey, skill, rank, tags]) => ({ ...ready, techniqueKey, techniqueName: techniqueKey, rank, tags,
    selectionRoutes: [{ type: "skill", name: skill }], prerequisites: [], skill, description: "An attack." })));
  gameData.techniques.find(row => row.techniqueKey === "advanced-cut").prerequisites = [{ type: "weapon", tag: "Sharp" }];
  gameData.weaponBases = [
    { ...ready, weaponKey: "blade", name: "Blade", minRank: 1, tags: ["One-Handed", "Melee", "Sharp"], techniqueKeys: ["cut"], techniqueSkills: ["Melee Weapons"] },
    { ...ready, weaponKey: "bow", name: "Bow", minRank: 1, tags: ["Versatile", "Ranged"], techniqueKeys: ["shoot"], techniqueSkills: ["Ranged Weapons"] },
    { ...ready, weaponKey: "great-blade", name: "Great Blade", minRank: 1, tags: ["Two-Handed"] },
    { ...ready, weaponKey: "elite", name: "Elite Blade", minRank: 3, tags: ["One-Handed"] },
  ];
  const first = Object.values(character.builder.traitChoices)[0];
  for (let slot = 2; slot <= count; slot++) { const choiceId = first.choiceId.replace(/:1$/, `:${slot}`); character.builder.traitChoices[choiceId] = { ...first, choiceId }; }
  return { gameData, character, origin };
}
function answer(character, gameData, slot, value, kind = null) {
  const choice = projectCharacterTraits(character, gameData).optionChoices.filter(choice => !kind || choice.kind === kind)[slot];
  assert(choice, "An owned option must be offered");
  character.builder.grantChoices[choice.choiceId] = createTraitOptionAnswer(choice, value);
  return choice;
}
function sessionFor(character, gameData) {
  return new CharacterSession({ character, revision: 1, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData }) });
}

test("repeatable source Y/N/blank imports, historical headers work, invalid declarations fail", () => {
  for (const [value, expected] of [["Y", true], ["N", false], ["", false]]) {
    const records = structuredClone(VALID_SCHEMA_V5_RECORDS); records.Traits[0].repeatable = value;
    records.Traits[0].grants = "choice | choiceId=element | type=element | count=1";
    const result = adaptGameDataWorkbook(buildSchemaV5Workbook({ records }));
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); assert.equal(result.model.traits[0].repeatable, expected);
    assert.equal(validateAdaptedGameData(result).ok, true);
  }
  const records = structuredClone(VALID_SCHEMA_V5_RECORDS); records.Traits[0].repeatable = "yes";
  assert(adaptGameDataWorkbook(buildSchemaV5Workbook({ records })).diagnostics.some(row => row.code === "invalid-repeatable"));
  records.Traits[0].repeatable = "Y";
  assert(validateAdaptedGameData(adaptGameDataWorkbook(buildSchemaV5Workbook({ records }))).diagnostics.some(row => row.code === "repeatable-trait-options-missing"));
  delete records.Traits[0].repeatable; records.Schema = records.Schema.filter(row => !(row.tab === "Traits" && row.field === "repeatable"));
  const old = structuredClone(buildSchemaV5Workbook({ records })); old.sheets.Traits.headers.pop(); old.sheets.Traits.rows.forEach(row => row.values.pop());
  assert.equal(adaptGameDataWorkbook(old).ok, true);
});

test("two elemental instances retain independent answers, one known Technique, free slots and both sheet labels", () => {
  const { character, gameData } = fixture();
  assert.equal(projectCharacterTraits(character, gameData).techniques.some(row => row.active), false);
  const fire = answer(character, gameData, 0, "fire"); answer(character, gameData, 1, "water");
  const before = structuredClone(character), projection = projectCharacterTraits(character, gameData);
  assert.equal(projection.traits.filter(row => row.active).length, 2);
  assert.equal(new Set(projection.optionChoices.map(row => row.choiceId)).size, 2);
  const result = reconcileCharacterGraph({ character, gameData }); assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.grantChoices, character.builder.grantChoices);
  assert.deepEqual(result.character.builder.selectedTechniques, []);
  const items = projectSheetTechniques({ character, gameData }); assert.equal(items.length, 1);
  assert.match(items[0].source, /Elemental Blaster \(Fire\).*Elemental Blaster \(Water\)/);
  assert.equal(items[0].performance.skillName, "Metamorphosis"); assert.equal(items[0].performance.rank, 2);
  assert.match(renderTraitProjectionHtml(projection, { gameData }), /Elemental Blaster \(Fire\)/);
  const decoded = decodeCharacter(JSON.parse(JSON.stringify(result.character))); assert.equal(decoded.ok, true);
  assert.deepEqual(projectCharacterTraits(decoded.value, gameData).optionChoices.map(row => row.value), ["fire", "water"]);
  assert.equal(character.builder.grantChoices[fire.choiceId].type, "trait-option"); assert.deepEqual(character, before);
});

test("duplicate options and wrong instance ownership cannot be confirmed away", () => {
  const { character, gameData } = fixture(); answer(character, gameData, 0, "fire"); const second = answer(character, gameData, 1, "water");
  const session = sessionFor(character, gameData);
  for (const alteration of [{ value: "fire" }, { sourceId: "trait:someone-else" }]) {
    const values = structuredClone(character.builder.grantChoices); Object.assign(values[second.choiceId], alteration);
    const proposal = session.propose(SetGrantChoices(values)); assert.equal(proposal.ok, false, JSON.stringify(proposal));
    session.cancelProposal(proposal.proposalId); assert.deepEqual(session.getState().working.builder.grantChoices, character.builder.grantChoices);
  }
});

test("distinct options are enforced across granting sources without consuming extra slots", () => {
  const { character, gameData, origin } = fixture();
  const other = { ...structuredClone(origin), featureKey: "other", grants: [{ type: "trait", key: "mech-elemental-blaster", rank: 2 }] };
  gameData.origins[0].features.push(other);
  answer(character, gameData, 0, "fire"); answer(character, gameData, 1, "water");
  const third = projectCharacterTraits(character, gameData).optionChoices.find(choice => choice.parentSourceId.endsWith(":other"));
  assert(third); assert.equal(third.options.find(option => option.key === "fire").eligible, false);
  assert.equal(third.options.find(option => option.key === "earth").eligible, true);
  character.builder.grantChoices[third.choiceId] = createTraitOptionAnswer(third, "earth");
  assert.equal(compileCharacterGraph({ character, gameData }).ok, true);
  assert.equal(projectCharacterTraits(character, gameData).choices.length, 2);
});

test("nonrepeatable duplication remains rejected and exhausting options closes additional selections", () => {
  const { character, gameData } = fixture("wings");
  assert(projectCharacterTraits(character, gameData).issues.some(issue => issue.code === "invalid-trait-choice"));
  const five = fixture("mech-elemental-blaster", 5);
  ["fire", "water", "earth", "wind"].forEach((value, index) => answer(five.character, five.gameData, index, value));
  const fifthId = Object.keys(five.character.builder.traitChoices)[4]; delete five.character.builder.traitChoices[fifthId];
  assert.equal(projectCharacterTraits(five.character, five.gameData).choices[4].options.find(option => option.traitKey === "mech-elemental-blaster").eligible, false);
});

test("Integrated Weapon filters bases, derives separate weapons and grants their attacks with provider rank", () => {
  const { character, gameData } = fixture("integrated-weapon");
  assert.deepEqual(projectCharacterTraits(character, gameData).optionChoices[0].options.map(row => row.key), ["blade", "bow"]);
  answer(character, gameData, 0, "blade"); answer(character, gameData, 1, "bow");
  const projection = projectCharacterTraits(character, gameData); assert.equal(projection.weapons.length, 2);
  assert(projection.weapons.every(weapon => weapon.rank === 2 && weapon.associatedSkill === "Metamorphosis" && weapon.tags.includes("Natural")));
  assert.deepEqual(projection.techniques.filter(row => row.active).map(row => row.techniqueKey).sort(), ["cut", "shoot"]);
  const selected = gameData.techniques.find(row => row.techniqueKey === "advanced-cut");
  const input = { builder: character.builder, gameData };
  assert.equal(getTechniqueSelectionState(selected, input).eligible, true); assert.equal(getTechniquePerformance(selected, input).skillName, "Metamorphosis");
  const result = reconcileCharacterGraph({ character, gameData }); assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.deepEqual(result.character.builder.weapons, []);
  assert.equal(projectSheetTechniques({ character: result.character, gameData }).length, 2);
});

test("changing/removing one instance reviews only its own answers and dependent techniques; Cancel is exact", () => {
  const { character, gameData } = fixture(); answer(character, gameData, 0, "fire"); answer(character, gameData, 1, "water");
  character.builder.selectedTechniques = ["fire-wave", "water-wave"];
  const input = { builder: character.builder, gameData };
  assert.equal(getTechniqueSelectionState(gameData.techniques.find(row => row.techniqueKey === "fire-wave"), input).eligible, true);
  const settled = reconcileCharacterGraph({ character, gameData }); assert.equal(settled.ok, true, JSON.stringify(settled.impacts));
  const session = sessionFor(settled.character, gameData), first = Object.values(character.builder.traitChoices)[0];
  const proposal = session.propose(SetTraitChoice({ ...first, traitKey: "liquid" }));
  assert.equal(proposal.ok, true, JSON.stringify(proposal)); assert.equal(proposal.requiresConfirmation, true);
  assert.equal(Object.keys(proposal.reconciled.builder.grantChoices).length, 1);
  assert.deepEqual(proposal.reconciled.builder.selectedTechniques, ["water-wave"]);
  session.cancelProposal(proposal.proposalId); assert.deepEqual(session.getState().working, settled.character);
  const accepted = session.propose(SetTraitChoice({ ...first, traitKey: "liquid" })); session.acceptProposal(accepted.proposalId, { confirm: true });
  assert.match(projectSheetTechniques({ character: session.getState().working, gameData }).find(row => row.tech.techniqueKey === "elemental-blast").source, /Water/);
  const gone = session.propose(SetOrigin("")); assert.equal(Object.keys(gone.reconciled.builder.grantChoices).length, 0);
});

test("rank loss rechecks weapon choices, dependent access and retained unrelated instances", () => {
  const { character, gameData, origin } = fixture("integrated-weapon"); gameData.weaponBases[0].minRank = 2;
  const first = answer(character, gameData, 0, "blade"); answer(character, gameData, 1, "bow");
  character.builder.selectedTechniques = ["advanced-cut"];
  const graph = compileCharacterGraph({ character, gameData });
  assert(collectAffectedNodeIds(graph, [`grant-answer:${first.choiceId}`]).includes("technique-selection:advanced-cut"));
  origin.grants.find(grant => grant.type === "skill").rank = 1;
  const result = reconcileCharacterGraph({ character, gameData }); assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.equal(Object.keys(result.character.builder.grantChoices).length, 1); assert.deepEqual(result.character.builder.selectedTechniques, []);
  assert.equal(projectCharacterTraits(result.character, gameData).weapons[0].weaponKey, "bow");
});

test("Combat Training owns distinct disciplines and one eligible Technique per completed instance", () => {
  const { character, gameData } = fixture("combat-training");
  answer(character, gameData, 0, "melee-weapons", "discipline"); answer(character, gameData, 1, "ranged-weapons", "discipline");
  answer(character, gameData, 0, "cut", "technique"); answer(character, gameData, 1, "shoot", "technique");
  const projection = projectCharacterTraits(character, gameData);
  assert.equal(projection.traits.filter(trait => trait.active).length, 2);
  assert.deepEqual(projection.techniques.filter(row => row.active).map(row => row.techniqueKey).sort(), ["cut", "shoot"]);
  assert.equal(reconcileCharacterGraph({ character, gameData }).ok, true);
  gameData.origins[0].features[0].grants[0].recipientRef = "familiar";
  assert.equal(projectCharacterTraits(character, gameData).traits.length, 0, "repeatability does not grant a Familiar's benefits to its owner");
});

test("Trait follow-up fields remain visible while compact and submit isolated typed commands", () => {
  const { character, gameData } = fixture(); answer(character, gameData, 0, "fire"); answer(character, gameData, 1, "water");
  const commands = [], mount = { innerHTML: "", addEventListener() {}, removeEventListener() {}, setAttribute() {} };
  const page = { getCharacter: () => character, registerWidget() {}, unregisterWidget() {}, requestCharacterCommand(widget, command) { commands.push(command); return { ok: true }; } };
  const widget = new TraitWidget(page, { mount, gameData, sourceId: "origin-feature:test-origin:adaptation", expandedChoices: new Set() });
  assert.equal((mount.innerHTML.match(/data-choice-field=/g) || []).length, 2);
  assert.match(mount.innerHTML, /value="fire" selected/); assert.match(mount.innerHTML, /value="water" selected/);
  const first = widget.getProjection().optionChoices[0], before = structuredClone(character);
  widget.chooseOption(first.choiceId, "water"); assert.equal(commands.length, 0);
  widget.chooseOption(first.choiceId, "earth"); assert.equal(commands.length, 1);
  assert.equal(commands[0].type, "SetGrantChoices"); assert.equal(commands[0].grantChoices[first.choiceId].value, "earth");
  assert.equal(Object.values(commands[0].grantChoices).find(row => row.choiceId !== first.choiceId).value, "water"); assert.deepEqual(character, before);
  widget.destroy();
});

test("long instance identities remain bounded, stable and distinct across owners and definitions", () => {
  const trait = { id: `trait:${"a".repeat(230)}`, traitKey: "blaster" };
  const id = traitOptionIdentity(trait, "element".repeat(30));
  assert(id.length <= 260); assert.equal(id, traitOptionIdentity(trait, "element".repeat(30)));
  assert.notEqual(id, traitOptionIdentity({ ...trait, id: `${trait.id}b` }, "element".repeat(30)));
  assert.notEqual(id, traitOptionIdentity({ ...trait, traitKey: "weapon" }, "element".repeat(30)));
});

test("queued catalogue changes ignore repeated input and cannot run after their widget is destroyed", async () => {
  const previous = globalThis.requestAnimationFrame;
  let frame, calls = 0;
  globalThis.requestAnimationFrame = callback => { frame = callback; };
  try {
    const widget = new InteractiveWidget(null);
    const pending = widget.submitChange(() => { calls++; return { ok: true }; });
    assert.equal(widget.busy, true); assert.equal(calls, 0);
    assert.equal((await widget.submitChange(() => { calls++; })).reason, "busy");
    widget.destroy(); frame();
    assert.equal((await pending).reason, "cancelled"); assert.equal(calls, 0); assert.equal(widget.busy, false);
    const live = new InteractiveWidget(null);
    const accepted = live.submitChange(() => { calls++; return { ok: true }; });
    frame(); assert.equal((await accepted).ok, true); assert.equal(calls, 1); assert.equal(live.busy, false);
  } finally {
    if (previous === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previous;
  }
});
