import assert from "node:assert/strict";
import test from "node:test";
import { renderSelectedChoiceHtml } from "../public/js/builder/widgets/selected-choice-display.js";
import { TechniqueChoiceWidget } from "../public/js/builder/widgets/technique-choice-widget.js";
import { WeaponChoiceWidget } from "../public/js/builder/widgets/weapon-choice-widget.js";
import { WeaponEnhancementChoiceWidget } from "../public/js/builder/widgets/weapon-enhancement-choice-widget.js";
import { EquipmentWidget } from "../public/js/builder/widgets/equipment-widget.js";
import { traitData, traitCharacter } from "./fixtures/traits.mjs";

function element(tagName = "div") {
  return {
    tagName, children: [], value: "", textContent: "", events: new Map(), classList: { toggle() {} },
    set innerHTML(value) { this.children = [{ outerHTML: value }]; },
    get innerHTML() { return this.children.map((child) => child.outerHTML).join(""); },
    get outerHTML() { return `<${tagName}>${this.textContent}${this.innerHTML}</${tagName}>`; },
    append(...children) { this.children.push(...children); },
    insertAdjacentHTML(position, html) { assert.equal(position, "beforeend"); this.children.push({ outerHTML: html }); },
    addEventListener(type, callback) { this.events.set(type, callback); },
    removeEventListener(type) { this.events.delete(type); },
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
    status: "playable", tags: [], profiles: [], skill: "Melee Weapons",
  }));
  gameData.weaponEnhancements = [{ enhancementKey: "keen", name: "Keen", description: "Keen edge <safe>", minRank: 1, status: "playable", prerequisites: [] }];
  return gameData;
}

test("the shared selected-description component is empty without an answer and escapes ownership labels", () => {
  assert.equal(renderSelectedChoiceHtml({ choiceId: "empty", contentHtml: "No selection" }), "");
  const html = renderSelectedChoiceHtml({ choiceId: 'owner"', selectedKey: 'key"', label: '<selected>', contentHtml: '<p>Safe rendered content</p>' });
  assert.match(html, /data-choice-selection="owner&quot;" data-selected-key="key&quot;"/);
  assert.match(html, /aria-label="&lt;selected&gt;"/);
  assert.match(html, /<p>Safe rendered content<\/p>/);
});

test("granted Technique text is directly after its own selector and changes or clears with its answer", (t) => {
  documentFor(t);
  const gameData = traitData(), character = traitCharacter();
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Training", rank: 2 }];
  gameData.techniques = ["first", "second"].map((key) => ({ techniqueKey: key, techniqueName: key, description: `${key} technique <safe>`, skill: "Training", rank: 1, status: "playable", prerequisites: [] }));
  const widget = new TechniqueChoiceWidget({ registerWidget() {} }, {
    grant: { skill: "Training", count: 1 }, choice: { techniqueKey: "first" }, choiceId: "technique-one", gameData, getBuilder: () => character.builder,
  });
  assert.match(widget.element.innerHTML, /<\/select><div class="selectedChoiceDetail" data-choice-selection="technique-one"/);
  assert.match(widget.element.innerHTML, /first technique &lt;safe&gt;/);
  assert.doesNotMatch(widget.element.innerHTML, /second technique/);
  widget.choice = { techniqueKey: "second" };
  assert.match(widget.render().innerHTML, /second technique &lt;safe&gt;/);
  assert.doesNotMatch(widget.render().innerHTML, /first technique/);
  widget.choice = null;
  assert.doesNotMatch(widget.render().innerHTML, /selectedChoiceDetail/);
});

test("granted weapon and enhancement descriptions belong directly to their own selectors", (t) => {
  documentFor(t);
  const gameData = equipmentData();
  const page = { registerWidget() {} };
  const choice = { choiceId: "armament", weaponKey: "blade", rank: 1, enhancements: [{ enhancementKey: "keen", rank: 1, granted: false }] };
  const weapon = new WeaponChoiceWidget(page, { grant: { choiceId: "armament", rank: 1 }, choice, ...gameData });
  const enhancement = new WeaponEnhancementChoiceWidget(page, { grant: { choiceRef: "armament", rank: 1 }, choice, ...gameData });
  assert.match(weapon.element.innerHTML, /<\/select><div class="selectedChoiceDetail" data-choice-selection="armament"/);
  assert.match(weapon.element.innerHTML, /blade description &lt;safe&gt;/);
  assert.doesNotMatch(weapon.element.innerHTML, /staff description|Keen edge/);
  assert.match(enhancement.element.innerHTML, /<\/select><div class="selectedChoiceDetail"/);
  assert.match(enhancement.element.innerHTML, /Keen edge &lt;safe&gt;/);
  weapon.choice = { ...choice, weaponKey: "staff" };
  assert.match(weapon.render().innerHTML, /staff description/);
  assert.doesNotMatch(weapon.render().innerHTML, /blade description/);
  enhancement.choice = { ...choice, enhancements: [] };
  assert.doesNotMatch(enhancement.render().innerHTML, /selectedChoiceDetail/);
});

test("Equipment uses the same per-item descriptions and previews the Add Weapon choice without commands", async (t) => {
  documentFor(t);
  const gameData = equipmentData(), character = traitCharacter();
  character.builder.sheet.repeatables.combatSkillsExtra = [{ skill: "Melee Weapons", rank: 1 }];
  character.builder.weapons = [{ id: "owned", weaponKey: "blade", rank: 1, customName: "", enhancements: [{ id: "edge", enhancementKey: "keen", rank: 1, selections: {} }] }];
  const before = structuredClone(character);
  const elements = Object.fromEntries(["addWeaponBtn", "weaponList", "showOutOfRank", "weaponBaseSelect", "weaponBaseDetail", "weaponCountValue", "enhancementCountValue", "slotUsageValue", "slotUsagePill", "meleeSkillRankValue", "rangedWeaponsSkillRankValue", "equipmentStatusHint"].map((key) => [key, element()]));
  const widget = new EquipmentWidget({ getCharacter: () => character, registerWidget() {}, unregisterWidget() {}, requestCharacterCommand() { assert.fail("description preview must not submit commands"); } }, { gameData, elements });
  assert.match(elements.weaponList.innerHTML, /data-choice-selection="owned" data-selected-key="blade"/);
  assert.match(elements.weaponList.innerHTML, /data-choice-selection="owned:edge" data-selected-key="keen"/);
  assert.match(elements.weaponList.innerHTML, /blade description &lt;safe&gt;/);
  elements.weaponBaseSelect.value = "staff";
  await elements.weaponBaseSelect.events.get("change")({ target: elements.weaponBaseSelect });
  assert.match(elements.weaponBaseDetail.innerHTML, /staff description &lt;safe&gt;/);
  assert.doesNotMatch(elements.weaponBaseDetail.innerHTML, /blade description/);
  elements.weaponBaseSelect.value = "";
  await elements.weaponBaseSelect.events.get("change")({ target: elements.weaponBaseSelect });
  assert.equal(elements.weaponBaseDetail.innerHTML, "");
  assert.deepEqual(character, before);
  widget.destroy();
  assert.equal(elements.weaponBaseSelect.events.size, 0);
});
