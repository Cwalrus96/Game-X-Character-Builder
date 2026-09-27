import assert from "node:assert/strict";
import test from "node:test";
import { getTechniqueCatalogueSkills, getTechniqueSkillNames } from "../public/js/core/technique-rules.js";
import { TechniquesWidget } from "../public/js/builder/widgets/techniques-widget.js";

const technique = (key, skills, extra = {}) => ({
  techniqueKey: key, techniqueName: key, expressionSyntaxVersion: 3, status: "playable", rank: 1,
  skill: skills.join(", "), selectionRoutes: skills.map(name => ({ type: "skill", name })), prerequisites: [], ...extra,
});
const context = (ranks, extra = {}) => ({
  techniqueRules: [], knownCombatSkills: new Set(Object.keys(ranks)), skillRanks: new Map(Object.entries(ranks)),
  tags: [], tagRanks: {}, weapons: [], gameData: {}, builder: {}, ...extra,
});

test("shared Techniques join the individual qualifying skill, regardless of route order or compatibility text", () => {
  const skills = ["Spellcasting", "Psionics", "Henshin Arts", "Martial Arts", "Melee Weapons", "Ranged Weapons"];
  for (const skill of skills) {
    const shared = technique("shared", [...skills].reverse(), { skill: "stale compatibility text" });
    assert.deepEqual(getTechniqueCatalogueSkills(shared, context({ [skill]: 1 })), [skill]);
    assert.deepEqual(getTechniqueCatalogueSkills(technique("exclusive", [skill]), context({ [skill]: 1 })), [skill]);
  }
});

test("groups require a qualifying route and preserve readiness, rank and prerequisites", () => {
  const shared = technique("shared", ["Spellcasting", "Psionics"]);
  const input = context({ Spellcasting: 2, Psionics: 0 });
  const before = structuredClone({ shared, input });
  assert.deepEqual(getTechniqueCatalogueSkills(shared, input), ["Spellcasting"]);
  assert.deepEqual(getTechniqueCatalogueSkills({ ...shared, rank: 3 }, input), []);
  assert.deepEqual(getTechniqueCatalogueSkills({ ...shared, status: "incomplete" }, input), []);
  assert.deepEqual(getTechniqueCatalogueSkills({ ...shared, prerequisites: [{ type: "weapon", tag: "Heavy" }] }, input), []);
  assert.deepEqual({ shared, input }, before);
});

test("skill identities deduplicate aliases; legacy single skills and unskilled routes retain a fallback", () => {
  const shared = technique("shared", ["Targeting", "Ranged Weapons"]);
  assert.deepEqual(getTechniqueSkillNames(shared), ["Ranged Weapons"]);
  assert.deepEqual(getTechniqueCatalogueSkills(shared, context({ "Ranged Weapons": 1 })), ["Ranged Weapons"]);
  assert.deepEqual(getTechniqueCatalogueSkills({ skill: "Targeting" }), ["Ranged Weapons"]);
  assert.deepEqual(getTechniqueCatalogueSkills(technique("granted", [], { selectionRoutes: [{ type: "granted" }] }), context({}, { allowGrantedOnly: true })), []);
  const tagged = technique("tagged", [], { associatedSkill: "Metamorphosis", selectionRoutes: [{ type: "tag", name: "Wings" }] });
  assert.deepEqual(getTechniqueCatalogueSkills(tagged, context({ Metamorphosis: 1 }, { tags: ["Wings"] })), ["Metamorphosis"]);
});

test("access grants can qualify an authored skill group while substitution alone cannot", () => {
  const attack = technique("attack", ["Melee Weapons"], { prerequisites: [{ type: "weapon", tag: "Heavy" }] });
  const substitution = { type: "skill-substitution", fromSkill: "Melee Weapons", toSkill: "Metamorphosis", weaponTag: "Natural" };
  const input = context({ Metamorphosis: 2 }, { techniqueRules: [substitution], weapons: [{ tags: ["Natural", "Heavy"], rank: 2 }] });
  assert.deepEqual(getTechniqueCatalogueSkills(attack, input), []);
  input.techniqueRules.push({ type: "technique", access: "Melee Weapons", weaponTag: "Natural" });
  assert.deepEqual(getTechniqueCatalogueSkills(attack, input), ["Melee Weapons"]);
});

function element() {
  return {
    children: [], style: {}, textContent: "", classList: { add() {} },
    set innerHTML(value) { this.children = []; this.html = value; },
    get innerHTML() { return this.html || ""; },
    append(...children) { this.children.push(...children); },
    addEventListener() {}, setAttribute() {}, querySelectorAll() { return []; },
  };
}

test("the catalogue synchronizes repeated Technique checkmarks and saves/counts one stable selection", async t => {
  const previous = globalThis.document;
  globalThis.document = { createElement: element };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const data = { techniques: [technique("exclusive", ["Spellcasting"]), technique("shared", ["Psionics", "Spellcasting"])] };
  const builder = { selectedTechniques: [] };
  const rulesContext = context({ Spellcasting: 1, Psionics: 1 });
  const displayContext = { builder, rulesContext, slots: 1, knownCombatSkills: rulesContext.knownCombatSkills,
    techniqueChoiceGrants: [], grantedTechniqueNames: new Set(), sourceOwnedTechniqueNames: new Set() };
  const commands = [];
  const widget = new TechniquesWidget({ registerWidget() {}, requestCharacterCommand(owner, command) {
    commands.push(command); builder.selectedTechniques = command.techniqueKeys; return { ok: true };
  } }, { techniqueGroupsEl: element(), getGameData: () => data, getBuilder: () => builder,
    getSelectedTechniques: () => new Set(builder.selectedTechniques) });
  widget.getTechniqueContext = () => displayContext;
  widget.getTechniqueAccessContext = () => rulesContext;
  widget.render();
  const spell = "rank:1:skill:Spellcasting", psi = "rank:1:skill:Psionics";
  assert.deepEqual([...widget.catalogues.keys()], [psi, spell]);
  assert.deepEqual(widget.catalogues.get(spell).options.map(option => option.key), ["exclusive", "shared"]);
  assert.equal(widget.techniqueGroupsEl.children[0].children[0].textContent, "Rank 1 - 2");
  const change = (id, checked) => widget.changeCatalogue({ target: { dataset: { choiceOwner: widget.id, choiceId: id }, value: "shared", checked } });
  await change(spell, true);
  assert.deepEqual(widget.getSavePatch(), { "builder.selectedTechniques": ["shared"] });
  assert.equal(widget.getSelectedCounts().total, 1);
  for (const id of [spell, psi]) assert.equal(widget.catalogues.get(id).isSelected("shared"), true);
  assert.equal(widget.catalogues.get(spell).options.find(option => option.key === "exclusive").disabled, true);
  await change(psi, false);
  for (const id of [spell, psi]) assert.equal(widget.catalogues.get(id).isSelected("shared"), false);
  assert.deepEqual(builder.selectedTechniques, []);
  assert.equal(commands.length, 2);
  rulesContext.knownCombatSkills.delete("Psionics");
  widget.render();
  assert.deepEqual([...widget.catalogues.keys()], [spell]);
});

test("skill summaries and search use individual parsed routes even without compatibility text", () => {
  const widget = Object.create(TechniquesWidget.prototype);
  const shared = technique("shared", ["Spellcasting", "Psionics"], { skill: "" });
  widget.getGameData = () => ({ techniques: [shared] });
  widget.getTechniqueSkillRank = () => 1;
  assert.deepEqual(widget.getKnownCombatSkillRows(context({ Spellcasting: 1 })), [{ skill: "Spellcasting", rank: 1 }]);
  widget.filterText = "spellcasting";
  assert.equal(widget.passesSearch(shared), true);
});
