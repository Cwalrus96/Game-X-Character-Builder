import test from "node:test";
import assert from "node:assert/strict";
import { APPEARANCE_DEFAULTS, DICE_THEMES, normalizeAppearance, isAppearanceValue, appearanceVariables, appearanceContrastWarning, buildAppearancePatch, createAppearanceEditor } from "../public/js/core/sheet-appearance.js";
import { createDefaultCharacter, encodeCharacter } from "../public/js/core/character-codec.js";
import { createCharacterMigrationReferences } from "../public/js/core/character-migrations.js";
import { applyCharacterPatch, decodeStoredCharacter, planCharacterReplacement, isAllowedCharacterPatchPath } from "../public/js/core/character-persistence.js";
import { sanitizeUpdatePatch, saveCharacterPatch } from "../public/js/core/database-writer.js";
import { renderDiceResults } from "../public/js/builder/widgets/components/dice-view.js";
import { DICE_STYLE_SAMPLE } from "../public/js/builder/widgets/sheet-settings.js";
import { buildDicePool, resolveDicePool } from "../public/js/core/roll-rules.js";
import { MIGRATION_GAME_DATA, makeV4Character, makeV5Character } from "./fixtures/character-schemas.mjs";
const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);

test("heading background is separate from card and control surfaces", () => {
  const before = appearanceVariables({ panelColor: "#fffaf0" });
  const after = appearanceVariables({ panelColor: "#fffaf0", headingColor: "#dd99bb" });
  assert.deepEqual(Object.keys(after).filter(key => after[key] !== before[key]), ["--header-bg-color", "--table-header-bg-color"]);
  assert.equal(after["--chip-bg-color"], "#fffaf0");
});

test("the actual settings preview uses roll rules: a 5 and 6 are each two Hits", () => {
  assert.deepEqual(DICE_STYLE_SAMPLE.dice, [{ face: 5, hits: 2 }, { face: 6, hits: 2 }, { face: 2, hits: 0 }]);
  assert.equal(DICE_STYLE_SAMPLE.coin, 1);
  assert.equal(DICE_STYLE_SAMPLE.hits, 5);
  assert.ok(Object.isFrozen(DICE_STYLE_SAMPLE));
  for (const theme of Object.keys(DICE_THEMES)) {
    const html = renderDiceResults(DICE_STYLE_SAMPLE, { theme, animate: true });
    assert.match(html, /aria-label="Die 5: 2 Hits"/);
    assert.match(html, /aria-label="Die 6: 2 Hits"/);
    assert.match(html, /aria-label="Die 2: 0 Hits"/);
    assert.match(html, /aria-label="Half-die coin: 1 Hit"/);
  }
});

test("appearance defaults are neutral, class-independent, and never change the supplied state", () => {
  for (const source of [undefined, null, {}, { classKey: "magical-guardian" }, { classKey: "ninja" }]) {
    assert.deepEqual(normalizeAppearance(source), APPEARANCE_DEFAULTS);
  }
  const source = { textColor: "#AAbB00", headingFont: "book" }, before = structuredClone(source);
  assert.equal(normalizeAppearance(source).textColor, "#aabb00");
  assert.deepEqual(source, before);
  assert.equal(appearanceVariables()["--secondary-color"], "#ffffff");
});

test("malformed colors, CSS, unknown fonts, and prototype keys cannot reach sheet styles", () => {
  for (const [key, value] of [["textColor", "red"], ["textColor", "#fff"], ["textColor", "url(evil)"], ["headingFont", "url(evil)"], ["diceTheme", '<img src=x>'], ["diceEffects", "true"], ["dyslexiaFriendly", "false"], ["dyslexiaFriendly", 1], ["corners", 0], ["__proto__", {}]]) {
    assert.equal(isAppearanceValue(key, value), false);
    assert.deepEqual(normalizeAppearance({ [key]: value }), APPEARANCE_DEFAULTS);
    assert.throws(() => buildAppearancePatch({ [key]: value }), TypeError);
  }
  assert.equal(appearanceContrastWarning(), "");
  assert.match(appearanceContrastWarning({ textColor: "#ffffff" }), /difficult to read/);
});

test("whole-sheet readability is reversible, preserves decorative headings, and resets for other characters", () => {
  const editor = createAppearanceEditor();
  editor.load({ headingFont: "script" });
  const originalStyles = appearanceVariables(editor.get());
  assert.match(originalStyles["--title-font"], /Pacifico/);
  editor.change("dyslexiaFriendly", true);
  assert.deepEqual(editor.patch(), buildAppearancePatch({ dyslexiaFriendly: true }));
  const readable = appearanceVariables(editor.get());
  assert.match(readable["--title-font"], /OpenDyslexic/);
  assert.equal(readable["--body-font"], readable["--title-font"]);
  assert.equal(editor.get().headingFont, "script");
  editor.change("dyslexiaFriendly", false);
  assert.deepEqual(appearanceVariables(editor.get()), originalStyles);
  editor.change("dyslexiaFriendly", true);
  editor.reset();
  assert.equal(editor.get().dyslexiaFriendly, false);
  assert.equal(editor.patch()["builder.sheet.appearance.dyslexiaFriendly"], false);
  editor.load({ headingFont: "book" });
  assert.equal(editor.get().dyslexiaFriendly, false);
  assert.doesNotMatch(appearanceVariables(editor.get())["--body-font"], /OpenDyslexic/);
  assert.deepEqual(editor.patch(), {});
});

test("new fonts and readability preference round-trip through the existing codec and builder save", () => {
  for (const headingFont of ["nunito", "handwritten", "script"]) {
    const character = createDefaultCharacter({ ownerUid: "user_123" });
    const appearance = { headingFont, dyslexiaFriendly: true };
    const patched = applyCharacterPatch(character, buildAppearancePatch(appearance), { scope: "sheet" });
    assert.equal(patched.ok, true, JSON.stringify(patched.diagnostics));
    const raw = { ...patched.value, revision: 1 };
    const read = decodeStoredCharacter(raw, { references, expectedOwnerUid: "user_123" });
    assert.equal(read.ok, true, JSON.stringify(read.diagnostics));
    read.character.builder.name = "Font preferences stay with the character";
    const saved = planCharacterReplacement(raw, read.character, { expectedRevision: 1 });
    assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics));
    assert.deepEqual(saved.value.builder.sheet.appearance, appearance);
    assert.equal(saved.value.schemaVersion, 6);
  }
  const invalid = createDefaultCharacter({ ownerUid: "user_123" });
  invalid.builder.sheet.appearance = { dyslexiaFriendly: "true" };
  assert.equal(encodeCharacter(invalid).ok, false);
});

test("appearance patches own exact leaves only, excluding character mechanics and whole maps", () => {
  for (const [key, value] of Object.entries(APPEARANCE_DEFAULTS)) {
    const patch = buildAppearancePatch({ [key]: value });
    assert.deepEqual(sanitizeUpdatePatch(patch), patch);
    assert.equal(isAllowedCharacterPatchPath(Object.keys(patch)[0], { scope: "sheet" }), true);
  }
  for (const path of ["builder.sheet.appearance", "builder.sheet.appearance.evil", "builder.sheet.appearance.textColor.url", "builder.sheet.appearance.__proto__", "builder.classKey"]) {
    assert.equal(isAllowedCharacterPatchPath(path, { scope: "sheet" }), false);
  }
  assert.throws(() => sanitizeUpdatePatch({ "builder.sheet.appearance": {} }));
  assert.throws(() => sanitizeUpdatePatch({ "builder.sheet.appearance.diceEffects": "false" }));
});

test("editor saves changed leaves and a late save acknowledgement cannot discard a newer edit", () => {
  let notifications = 0;
  const editor = createAppearanceEditor(() => notifications++);
  editor.load({ diceTheme: "ninja" });
  assert.deepEqual(editor.patch(), {});
  assert.equal(editor.change("textColor", "invalid"), false);
  assert.equal(notifications, 0);
  editor.change("textColor", "#334455"); const oldPatch = editor.patch();
  editor.change("textColor", "#556677"); editor.change("headingFont", "book");
  editor.acknowledge(oldPatch);
  assert.deepEqual(editor.patch(), buildAppearancePatch({ textColor: "#556677", headingFont: "book" }));
  editor.acknowledge(editor.patch()); assert.deepEqual(editor.patch(), {});
  editor.reset(); assert.deepEqual(editor.get(), APPEARANCE_DEFAULTS);
  assert.deepEqual(editor.patch(), buildAppearancePatch({ textColor: "#111111", headingFont: "clean", diceTheme: "classic" }));
  editor.load(); assert.deepEqual(editor.patch(), {});
});

test("optional appearance survives current codec, sheet patch and whole-builder saves without a schema bump", () => {
  const original = createDefaultCharacter({ ownerUid: "user_123" });
  assert.equal(Object.hasOwn(original.builder.sheet, "appearance"), false);
  const patched = applyCharacterPatch(original, buildAppearancePatch({ headingFont: "book", diceTheme: "magical-girl" }), { scope: "sheet" });
  assert.equal(patched.ok, true, JSON.stringify(patched.diagnostics));
  assert.equal(patched.value.schemaVersion, 6);
  const raw = { ...patched.value, revision: 2 };
  const read = decodeStoredCharacter(raw, { references, expectedOwnerUid: "user_123" });
  assert.equal(read.ok, true, JSON.stringify(read.diagnostics));
  read.character.builder.name = "Changed name";
  const saved = planCharacterReplacement(raw, read.character, { expectedRevision: 2 });
  assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics));
  assert.deepEqual(saved.value.builder.sheet.appearance, { headingFont: "book", diceTheme: "magical-girl" });
  assert.equal(Object.hasOwn(original.builder.sheet, "appearance"), false);
});

test("historical shape migrations preserve optional appearance and reject invalid stored settings", () => {
  for (const make of [makeV4Character, makeV5Character]) {
    const raw = make(); raw.builder.sheet.appearance = { diceTheme: "elementalist", animateDice: false };
    const decoded = decodeStoredCharacter(raw, { references });
    assert.equal(decoded.ok, true, JSON.stringify(decoded.diagnostics));
    assert.deepEqual(decoded.character.builder.sheet.appearance, raw.builder.sheet.appearance);
  }
  for (const appearance of [{ textColor: "invalid" }, { diceEffects: 1 }, { unsupported: true }, [], null]) {
    const character = createDefaultCharacter({ ownerUid: "user_123" });
    character.builder.sheet.appearance = appearance;
    assert.equal(encodeCharacter(character).ok, false);
  }
});

test("every dice theme preserves authoritative faces, coin, Hits and RNG count", () => {
  let draws = 0;
  const roll = resolveDicePool(buildDicePool({ attribute: 5, skillRank: 6, modifiers: [.5] }), sides => { draws++; return sides === 2 ? 2 : 6; });
  const before = structuredClone(roll);
  for (const theme of Object.keys(DICE_THEMES)) {
    const html = renderDiceResults(roll, { theme, animate: true, effects: true });
    assert.match(html, new RegExp(`data-dice-theme="${theme}"`));
    assert.equal((html.match(/aria-label="Die 6: 2 Hits"/g) || []).length, 10);
    assert.match(html, /Half-die coin: 1 Hit/); assert.match(html, /\+1 automatic Hits/);
    assert.equal(/dice-particles/.test(html), theme === "magical-girl");
    assert.deepEqual(roll, before);
  }
  assert.equal(draws, 11);
});

test("sparkles are decorative, finite, opt-out, and absent for history, zero dice and no-roll effects", () => {
  const roll = resolveDicePool(buildDicePool({ attribute: 1, skillRank: 0 }), () => 6);
  const opts = { theme: "magical-girl", animate: true, effects: true };
  assert.match(renderDiceResults(roll, opts), /class="dice-particles" aria-hidden="true"/);
  for (const change of [{ animate: false }, { effects: false }, { noRoll: true }]) assert.doesNotMatch(renderDiceResults(roll, { ...opts, ...change }), /dice-particles/);
  const zero = resolveDicePool(buildDicePool({ attribute: 0, skillRank: 0 }), () => assert.fail("No draw"));
  assert.doesNotMatch(renderDiceResults(zero, opts), /dice-particles|dice-tray/);
  assert.match(renderDiceResults(roll, { theme: '<script>' }), /data-dice-theme="classic"/);
});

test("appearance compatibility saves advance revision atomically without stamping a new schema", async () => {
  let write;
  const ref = { firestore: {} };
  const firestoreApi = { serverTimestamp: () => "time", runTransaction: async (_, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ schemaVersion: 4, revision: 8 }) }),
    update: (actualRef, patch) => { assert.equal(actualRef, ref); write = patch; },
  }) };
  const patch = buildAppearancePatch({ diceTheme: "ninja" });
  await saveCharacterPatch(ref, patch, { firestoreApi });
  assert.deepEqual(write, { ...patch, revision: 9, updatedAt: "time" });
});
