import test from "node:test";
import assert from "node:assert/strict";
import { createSheetRolls } from "../public/js/pages/sheet-rolls.js";

function fixture() {
  const calls = [], buttons = [{ disabled: true }];
  let click, closes = 0;
  const root = { querySelectorAll: () => buttons, addEventListener(type, handler) { if (type === "click") click = handler; } };
  const controls = createSheetRolls({ root, createDialog: () => ({ open: (...args) => calls.push(args), close: () => { closes++; } }) });
  const character = { builder: { attributes: { strength: 4 } }, gameData: {} };
  controls.setCharacter(character);
  const press = dataset => { const button = { dataset }; click({ target: { closest: () => button } }); return button; };
  return { controls, character, calls, buttons, press, closes: () => closes };
}

test("attribute and skill controls seed only the clicked value and retain their opener", () => {
  const f = fixture();
  f.controls.setReady(true);
  const attribute = f.press({ rollAttribute: "strength" });
  const skill = f.press({ rollSkill: "melee-weapons" });
  assert.deepEqual(f.calls[0], [{ ...f.character, attributeKey: "strength" }, attribute]);
  assert.deepEqual(f.calls[1], [{ ...f.character, skillKey: "melee-weapons" }, skill]);
  assert.equal(f.buttons[0].disabled, false);
});

test("quick and modifier buttons preserve the same technique/provider but send distinct intents", () => {
  const f = fixture();
  const technique = { techniqueKey: "strike", techniqueName: "Strike", rollRequired: true };
  const context = { provider: { rank: 3 }, weaponId: "weapon-one" };
  const html = f.controls.buttonFor(technique, context);
  const id = /data-sheet-roll="(\d+)"/.exec(html)[1];
  assert.ok(html.indexOf('data-roll-mode="quick"') < html.indexOf('data-roll-mode="modifiers"'));
  f.controls.setReady(true);
  f.press({ sheetRoll: id, rollMode: "quick" });
  f.press({ sheetRoll: id, rollMode: "modifiers" });
  assert.deepEqual(f.calls.map(([request]) => ({ technique: request.technique, provider: request.provider, weaponId: request.weaponId, quick: request.quick, modifiers: request.modifiers })), [
    { technique, ...context, quick: true, modifiers: false },
    { technique, ...context, quick: false, modifiers: true },
  ]);
});

test("techniques without rolls have no controls while underlying-attack techniques retain theirs", () => {
  const f = fixture();
  assert.equal(f.controls.buttonFor({ rollRequired: false }), "");
  assert.equal(f.controls.buttonFor({ expressionSyntaxVersion: 3, status: "draft", rollRequired: true }), "");
  assert.match(f.controls.buttonFor({ rollRequired: false, basicAttack: [{ type: "weapon" }] }), /Quick Roll/);
});

test("unready or replaced characters cannot open stale technique requests", () => {
  const f = fixture();
  const id = /data-sheet-roll="(\d+)"/.exec(f.controls.buttonFor({ rollRequired: true }))[1];
  f.press({ rollAttribute: "strength" });
  assert.equal(f.calls.length, 0);
  f.controls.setReady(true);
  f.controls.setCharacter({ builder: {}, gameData: {} });
  f.press({ sheetRoll: id, rollMode: "quick" });
  assert.equal(f.calls.length, 0);
  f.controls.setReady(false);
  assert.equal(f.closes(), 1);
  assert.equal(f.buttons[0].disabled, true);
});

test("skill controls use stable identity and escape display text", () => {
  const f = fixture();
  const html = f.controls.skillControl("Melee Weapons", '<Melee & Weapons>', '2 "Advanced"');
  assert.match(html, /data-roll-skill="melee-weapons"/);
  assert.match(html, /&lt;Melee &amp; Weapons&gt;/);
  assert.doesNotMatch(html, /<Melee/);
});
