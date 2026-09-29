import assert from "node:assert/strict";
import test from "node:test";
import { renderSelectedChoiceHtml } from "../public/js/builder/widgets/selected-choice-display.js";
import { TechniqueChoiceWidget } from "../public/js/builder/widgets/technique-choice-widget.js";
import { WeaponChoiceWidget } from "../public/js/builder/widgets/weapon-choice-widget.js";
import { WeaponEnhancementChoiceWidget } from "../public/js/builder/widgets/weapon-enhancement-choice-widget.js";
import { EquipmentWidget } from "../public/js/builder/widgets/equipment-widget.js";
import { traitData, traitCharacter } from "./fixtures/traits.mjs";
import { createGrantWidgets } from "../public/js/builder/widgets/grant-widget-factory.js";
import { resolveGrantChoiceIds } from "../public/js/core/choice-identity.js";

function element(tagName = "div") {
  return {
    tagName, children: [], value: "", textContent: "", events: new Map(), classList: { toggle() {} },
    set innerHTML(value) { this.children = [{ outerHTML: value }]; },
    get innerHTML() { return this.children.map((child) => child.outerHTML).join(""); },
    get outerHTML() { return `<${tagName}>${this.textContent}${this.innerHTML}</${tagName}>`; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {},
    insertAdjacentHTML(position, html) { assert.equal(position, "beforeend"); this.children.push({ outerHTML: html }); },
    addEventListener(type, callback) { this.events.set(type, callback); },
    removeEventListener(type) { this.events.delete(type); },
    querySelectorAll() { return []; },
  };
}

function documentFor(t) {
  const previous = globalThis.document;
  globalThis.document = { createElement: element };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
}

function equipmentData() {
  const gameData = traitData();
  gameData.weaponBases = ["blade", "staff"].map((weaponKey) => ({
    weaponKey, name: weaponKey, description: `${weaponKey} description <safe>`, minRank: 1,
    status: "playable", tags: [], profiles: [], expressionSyntaxVersion: 3, techniqueSkills: ["Melee Weapons"],
  }));
  gameData.weaponEnhancements = [{ enhancementKey: "keen", name: "Keen", description: "Keen edge <safe>", minRank: 1, status: "playable", prerequisites: [] }];
  return gameData;
}

test("weapon grants without authored choice IDs render every slot and respect their skill filter", (t) => {
  documentFor(t);
  const gameData = equipmentData();
  gameData.weaponBases.push({ ...gameData.weaponBases[0], weaponKey: "bow", name: "Bow", techniqueSkills: ["Ranged Weapons"] });
  const grant = { type: "weapon", skill: "Ranged Weapons", rank: 1, count: 2 };
  const sourceId = "class-option:guardian:ranged-training";
  const updates = [];
  const widgets = createGrantWidgets({ page: { registerWidget() {} }, entry: { name: "Ranged training", grants: [grant] }, sourceId, ...gameData,
    grantChoiceState: { getChoice() { return null; }, updateChoice(...args) { updates.push(args); } },
  });
  assert.deepEqual(widgets.map(widget => widget.choiceId), resolveGrantChoiceIds(grant, { sourceId, index: 0 }));
  for (const widget of widgets) {
    assert.match(widget.element.innerHTML, /value="bow"/);
    assert.doesNotMatch(widget.element.innerHTML, /value="blade"|value="staff"/);
    widget.onChange({ type: "weapon", weaponKey: "bow", rank: 1 });
  }
  assert.equal(updates.length, 2);
  assert.notEqual(updates[0][0], updates[1][0]);
  assert.equal(updates[0][1].sourceId, sourceId);
});

test("the shared selected-description component is empty without an answer and escapes ownership labels", () => {
  assert.equal(renderSelectedChoiceHtml({ choiceId: "empty", contentHtml: "No selection" }), "");
  const html = renderSelectedChoiceHtml({ choiceId: 'owner"', selectedKey: 'key"', label: '<selected>', contentHtml: '<p>Safe rendered content</p>' });
  assert.match(html, /data-choice-selection="owner&quot;" data-selected-key="key&quot;"/);
  assert.match(html, /aria-label="&lt;selected&gt;"/);
  assert.match(html, /<p>Safe rendered content<\/p>/);
});

test("granted Technique rules appear only within the expanded catalogue and selection remains visible when compact", (t) => {
  documentFor(t);
  const gameData = traitData(), character = traitCharacter();
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Training", rank: 2 }];
  gameData.techniques = ["first", "second"].map((key) => ({ techniqueKey: key, techniqueName: key, description: `${key} technique <safe>`, skill: "Training", rank: 1, status: "playable", prerequisites: [] }));
  const widget = new TechniqueChoiceWidget({ registerWidget() {} }, {
    grant: { skill: "Training", count: 1 }, choice: { techniqueKey: "first" }, choiceId: "technique-one", gameData, getBuilder: () => character.builder,
  });
  assert.match(widget.element.innerHTML, /value="first" selected/);
  assert.doesNotMatch(widget.element.innerHTML, /first technique|second technique|selectedChoiceDetail/);
  widget.expandedChoices.add("technique-one");
  widget.render();
  assert.equal(widget.element.innerHTML.split("first technique &lt;safe&gt;").length, 2);
  assert.equal(widget.element.innerHTML.split("second technique &lt;safe&gt;").length, 2);
  widget.expandedChoices.clear();
  widget.choice = { techniqueKey: "second" };
  assert.match(widget.render().innerHTML, /value="second" selected/);
  assert.doesNotMatch(widget.render().innerHTML, /first technique/);
  widget.choice = null;
  assert.doesNotMatch(widget.render().innerHTML, /selectedChoiceDetail/);
});

test("granted weapons and enhancements reveal rules through expansion without a repeated selected description", (t) => {
  documentFor(t);
  const gameData = equipmentData();
  const page = { registerWidget() {} };
  const choice = { choiceId: "armament", weaponKey: "blade", rank: 1, enhancements: [{ enhancementKey: "keen", rank: 1, granted: false }] };
  const weapon = new WeaponChoiceWidget(page, { grant: { choiceId: "armament", rank: 1 }, choice, ...gameData });
  const enhancement = new WeaponEnhancementChoiceWidget(page, { grant: { choiceRef: "armament", rank: 1 }, choice, ...gameData });
  assert.doesNotMatch(weapon.element.innerHTML, /description|selectedChoiceDetail/);
  assert.doesNotMatch(enhancement.element.innerHTML, /Keen edge|selectedChoiceDetail/);
  weapon.expandedChoices.add("armament"); weapon.render();
  enhancement.expandedChoices.add(enhancement.id); enhancement.render();
  assert.equal(weapon.element.innerHTML.split("blade description &lt;safe&gt;").length, 2);
  assert.equal(enhancement.element.innerHTML.split("Keen edge &lt;safe&gt;").length, 2);
  weapon.expandedChoices.clear(); enhancement.expandedChoices.clear();
  weapon.choice = { ...choice, weaponKey: "staff" };
  assert.match(weapon.render().innerHTML, /value="staff" selected/);
  assert.doesNotMatch(weapon.render().innerHTML, /blade description/);
  enhancement.choice = { ...choice, enhancements: [] };
  assert.doesNotMatch(enhancement.render().innerHTML, /selectedChoiceDetail/);
});

test("Equipment shares expand-only rules and changing an Add Weapon draft never submits a command", async (t) => {
  documentFor(t);
  const gameData = equipmentData(), character = traitCharacter();
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: 1 }];
  character.builder.weapons = [{ id: "owned", weaponKey: "blade", rank: 1, customName: "", enhancements: [{ id: "edge", enhancementKey: "keen", rank: 1, selections: {} }] }];
  const before = structuredClone(character);
  const elements = Object.fromEntries(["addWeaponBtn", "weaponList", "showOutOfRank", "weaponBaseSelect", "weaponBaseDetail", "weaponCountValue", "enhancementCountValue", "slotUsageValue", "slotUsagePill", "meleeSkillRankValue", "rangedWeaponsSkillRankValue", "equipmentStatusHint"].map((key) => [key, element()]));
  const widget = new EquipmentWidget({ getCharacter: () => character, registerWidget() {}, unregisterWidget() {}, requestCharacterCommand() { assert.fail("description preview must not submit commands"); } }, { gameData, elements });
  assert.match(elements.weaponList.innerHTML, /value="blade" selected/);
  assert.match(elements.weaponList.innerHTML, /value="keen" selected/);
  assert.doesNotMatch(elements.weaponList.innerHTML, /blade description|Keen edge|selectedChoiceDetail/);
  const preview = value => elements.weaponBaseSelect.events.get("change")({ target: { dataset: { choiceOwner: widget.id, choiceId: "equipment-new-weapon" }, value } });
  await preview("staff");
  assert.match(elements.weaponBaseSelect.innerHTML, /value="staff" selected/);
  assert.doesNotMatch(elements.weaponBaseSelect.innerHTML, /staff description/);
  assert.doesNotMatch(elements.weaponBaseSelect.innerHTML, /blade description/);
  widget.toggleCatalogue({ target: { dataset: { choiceOwner: widget.id, choiceToggle: "equipment-new-weapon" } } });
  assert.equal(elements.weaponBaseSelect.innerHTML.split("staff description &lt;safe&gt;").length, 2);
  widget.toggleCatalogue({ target: { dataset: { choiceOwner: widget.id, choiceToggle: "equipment-new-weapon" } } });
  await preview("");
  assert.doesNotMatch(elements.weaponBaseSelect.innerHTML, /selectedChoiceDetail/);
  assert.deepEqual(character, before);
  widget.destroy();
  assert.equal(elements.weaponBaseSelect.events.size, 0);
});

test("ordinary and granted Enhancements compose the same follow-up fields and preserve rejected answers", async (t) => {
  documentFor(t);
  const gameData = equipmentData(), character = traitCharacter();
  const enhancementKey = "basic_elemental_infusion";
  gameData.weaponEnhancements = [{ enhancementKey, name: "Elemental Infusion", description: "Choose an element.", status: "playable", minRank: 1, prerequisites: [] }];
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: 1 }];
  const enhancement = { id: "edge", enhancementKey, rank: 1, selections: { element: "Water" }, granted: false };
  character.builder.weapons = [{ id: "owned", weaponKey: "blade", rank: 1, enhancements: [enhancement] }];
  const elements = Object.fromEntries(["addWeaponBtn", "weaponList", "showOutOfRank", "weaponBaseSelect", "weaponCountValue", "enhancementCountValue", "slotUsageValue", "slotUsagePill", "meleeSkillRankValue", "rangedWeaponsSkillRankValue", "equipmentStatusHint"].map(key => [key, element()]));
  const commands = [], changes = [];
  const page = { getCharacter: () => character, registerWidget() {}, async requestCharacterCommand(widget, command) { commands.push(command); return { ok: false, reason: "cancelled" }; } };
  const ordinary = new EquipmentWidget(page, { gameData, elements });
  const granted = new WeaponEnhancementChoiceWidget(page, { grant: { choiceRef: "armament", rank: 1 }, choice: { weaponKey: "blade", rank: 1, enhancements: [enhancement] }, ...gameData,
    onChange: async (...args) => { changes.push(args); return { ok: false, reason: "cancelled" }; },
  });
  const [ordinaryId, ordinaryField] = [...ordinary.detailFields][0];
  const [grantedId, grantedField] = [...granted.detailFields][0];
  const normalized = field => field.field.render({ value: field.value }).replace(/(?:id|for|data-choice-owner|data-choice-field)="[^"]+"/g, 'binding="shared"');
  assert.equal(normalized(ordinaryField), normalized(grantedField));
  assert.doesNotMatch(ordinary.element.innerHTML, /Choose an element\./);
  assert.doesNotMatch(granted.element.innerHTML, /Choose an element\./);
  await granted.changeCatalogue({ target: { dataset: { choiceOwner: granted.id, choiceField: grantedId }, value: "Void" } });
  assert.equal(changes.length, 0, "unknown follow-up options cannot emit commands");
  await granted.changeCatalogue({ target: { dataset: { choiceOwner: granted.id, choiceField: grantedId }, value: "Fire" } });
  await ordinary.changeCatalogue({ target: { dataset: { choiceOwner: ordinary.id, choiceField: ordinaryId }, value: "Fire" } });
  assert.deepEqual(changes, [[enhancementKey, { element: "Fire" }]]);
  assert.equal(commands[0].type, "UpdateWeaponEnhancement");
  assert.deepEqual(commands[0].patch.selections, { element: "Fire" });
  assert.match(granted.element.innerHTML, /value="Water" selected/);
  assert.match(ordinary.element.innerHTML, /value="Water" selected/);
});
