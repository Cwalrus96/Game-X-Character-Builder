import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDefaultCharacter } from "../../public/js/core/character-codec.js";
import { coerceAttrKey } from "../../public/js/core/character-rules.js";
import { isGameDataRecordSelectable } from "../../public/js/core/selection-rules.js";
import { getWeaponSkillNames } from "../../public/js/core/weapon-utils.js";
import { reconcileCharacterGraph } from "../../public/js/core/graph-reconciler.js";

// Integration checks for the reviewed release, deliberately outside the unit suite.
const node = (graph, id) => graph.nodes.find(item => item.id === id);

test("published selectable classes reconcile against the production runtime artifact", async () => {
  const gameData = JSON.parse(await readFile(
    new URL("../../public/data/game-x/game-x-data.json", import.meta.url),
    "utf8",
  ));
  const selectableClasses = gameData.classes.filter((entry) => isGameDataRecordSelectable(entry));
  assert.ok(selectableClasses.length > 0);
  for (const cls of selectableClasses) {
    const character = createDefaultCharacter({ ownerUid: "user_123" });
    character.builder.classKey = cls.classKey;
    character.builder.primaryAttribute = coerceAttrKey(cls.primaryAttributes?.[0] || cls.primaryAttributeA);
    const result = reconcileCharacterGraph({
      character,
      previousCharacter: character,
      gameData,
    });
    assert.equal(result.ok, true, `${cls.classKey}: ${JSON.stringify(result.impacts)}`);
    assert.equal(result.converged, true, cls.classKey);
  }
});

test("published selectable weapon bases compile through the equipment graph", async () => {
  const gameData = JSON.parse(await readFile(
    new URL("../../public/data/game-x/game-x-data.json", import.meta.url),
    "utf8",
  ));
  const selectableWeapons = gameData.weaponBases.filter((entry) => isGameDataRecordSelectable(entry));
  assert.ok(selectableWeapons.length > 0);
  for (const weapon of selectableWeapons) {
    const character = createDefaultCharacter({ ownerUid: "user_123" });
    const rank = Number(weapon.minRank || 0);
    character.builder.weapons.push({
      id: `weapon:${weapon.weaponKey}`,
      choiceId: "",
      sourceChoiceId: "",
      generated: false,
      weaponKey: weapon.weaponKey,
      rank,
      customName: "",
      enhancements: [],
    });
    for (const skill of getWeaponSkillNames(weapon).filter((name) => ["Melee Weapons", "Ranged Weapons"].includes(name))) {
      character.builder.sheet.repeatables.combatSkillsExtra.push({ skill, rank: String(rank) });
    }
    const result = reconcileCharacterGraph({ character, previousCharacter: character, gameData });
    assert.equal(result.ok, true, `${weapon.weaponKey}: ${JSON.stringify(result.impacts)}`);
    assert(node(result.graph, `weapon:weapon:${weapon.weaponKey}`), weapon.weaponKey);
  }
});

test("published attribute allocations reconcile at every supported level", async () => {
  const gameData = JSON.parse(await readFile(
    new URL("../../public/data/game-x/game-x-data.json", import.meta.url),
    "utf8",
  ));
  const cls = gameData.classes.find((entry) => isGameDataRecordSelectable(entry));
  assert.ok(cls);
  const primary = coerceAttrKey(cls.primaryAttributes?.[0] || cls.primaryAttributeA);
  for (let level = 1; level <= 12; level += 1) {
    const character = createDefaultCharacter({ ownerUid: "user_123" });
    character.builder.classKey = cls.classKey;
    character.builder.level = level;
    character.builder.primaryAttribute = primary;
    character.builder.attributes[primary] = 1;
    let remaining = 12 + (3 * (level - 1));
    for (const key of Object.keys(character.builder.attributes)) {
      const cap = 4 + Math.floor(level / 2) - (level <= 2 && key !== primary ? 1 : 0);
      const available = cap - (key === primary ? 1 : 0);
      const assigned = Math.min(remaining, available);
      character.builder.attributes[key] += assigned;
      remaining -= assigned;
    }
    assert.equal(remaining, 0, `level ${level}`);
    const result = reconcileCharacterGraph({ character, previousCharacter: character, gameData });
    assert.equal(result.ok, true, `level ${level}: ${JSON.stringify(result.impacts)}`);
    assert.equal(result.graph.metadata.attributePointUsage, result.graph.metadata.attributePointCapacity);
    assert.equal(result.impacts.some((impact) => impact.code === "attribute-point-budget-applied"), false);
  }
});
