import test from "node:test";
import assert from "node:assert/strict";
import { buildDicePool, resolveDicePool, resolveRollOutcome, buildDamageBands } from "../public/js/core/roll-rules.js";
import { randomDieFace } from "../public/js/core/dice-random.js";
import { parseDamageFormula, calculateAttackDamage, getDamagePumping } from "../public/js/core/damage-rules.js";

test("each d6 face contributes the correct Hits", () => {
  let face = 0;
  const result = resolveDicePool(buildDicePool({ attribute: 3, skillRank: 3 }), () => ++face);
  assert.deepEqual(result.dice.map(die => die.hits), [0, 0, 1, 1, 2, 2]);
  assert.equal(result.hits, 6);
  assert.ok(Object.isFrozen(result.dice));
});

test("zero attribute and nonpositive pools never consume randomness", () => {
  for (const input of [{ attribute: 0, skillRank: 6, modifiers: [12] }, { attribute: 2, skillRank: 1, modifiers: [-3] }, { attribute: 1, skillRank: 0, modifiers: [-3] }]) {
    const result = resolveDicePool(buildDicePool(input), () => assert.fail("must not roll"));
    assert.equal(result.hits, 0);
    assert.equal(result.coin, null);
    assert.deepEqual(result.dice, []);
  }
});

test("half dice are fair coins separate from the ten-die cap and excess Hits", () => {
  for (const [total, dice, automaticHits] of [[0.5, 0, 0], [10.5, 10, 0], [11.5, 10, 1], [14, 10, 4]]) {
    const pool = buildDicePool({ attribute: 1, skillRank: 0, modifiers: [total - 1] });
    assert.equal(pool.dice, dice);
    assert.equal(pool.automaticHits, automaticHits);
    assert.equal(pool.coin, total % 1 === 0.5);
    for (const coinFace of [1, 2]) {
      const calls = [];
      const result = resolveDicePool(pool, sides => { calls.push(sides); return sides === 6 ? 1 : coinFace; });
      assert.equal(result.hits, automaticHits + (pool.coin ? coinFace - 1 : 0));
      assert.deepEqual(calls, [...Array(dice).fill(6), ...(pool.coin ? [2] : [])]);
    }
  }
});

test("malformed dice inputs fail without silently coercing state", () => {
  for (const value of [NaN, Infinity, -1, "3", 0.5]) assert.throws(() => buildDicePool({ attribute: value, skillRank: 0 }));
  for (const value of [NaN, Infinity, "2", 0.1, 100]) assert.throws(() => buildDicePool({ attribute: 2, skillRank: 0, modifiers: [value] }));
  assert.throws(() => resolveDicePool(buildDicePool({ attribute: 1, skillRank: 0 }), () => 7));
});

test("random faces reject biased tail bytes and support coin endpoints", () => {
  const bytes = [255, 252, 251, 0, 255];
  const rng = { getRandomValues(out) { out[0] = bytes.shift(); } };
  assert.equal(randomDieFace(6, rng), 6);
  assert.equal(randomDieFace(2, rng), 1);
  assert.equal(randomDieFace(2, rng), 2);
  assert.throws(() => randomDieFace(20, rng));
});

test("TN is optional and a late TN interprets the unchanged result", () => {
  const roll = resolveDicePool(buildDicePool({ attribute: 3, skillRank: 3 }), () => 6);
  const snapshot = JSON.stringify(roll);
  assert.equal(resolveRollOutcome(roll.hits, null), null);
  for (const [tn, key, multiplier] of [[16, "criticalFailure", 0], [15, "failure", .5], [13, "failure", .5], [12, "success", 1], [10, "success", 1], [9, "criticalSuccess", 2], [6, "criticalSuccess", 3], [0, "criticalSuccess", 5]]) {
    const outcome = resolveRollOutcome(roll.hits, tn);
    assert.equal(outcome.key, key);
    assert.equal(outcome.multiplier, multiplier);
    assert.equal(JSON.stringify(roll), snapshot);
  }
  for (const tn of [-1, 2.5, Infinity, "abc"]) assert.throws(() => resolveRollOutcome(12, tn));
});

test("damage bands round down half damage and include every attainable critical tier", () => {
  const bands = buildDamageBands(13, 15);
  assert.deepEqual(bands.map(row => row.damage), [0, 6, 13, 26, 39, 52, 65, 78]);
  assert.equal(buildDamageBands(13, 5, { normalCritical: true }).at(-1).damage, 13);
});

test("compact damage formulas parse rank growth, weapon growth, area and Energy X", () => {
  for (const text of ["3 + Hits; +3 damage per rank above 0.", "3 + Hits, +3 damage per rank above 0", "3 + Hits; +3 damage per rank above 0, to each creature in the area."]) {
    const parsed = parseDamageFormula(text);
    assert.equal(parsed.ok, true, text);
    assert.equal(parsed.growth, 3);
    assert.equal(parsed.usesHits, true);
  }
  assert.equal(parseDamageFormula("5 + Hits; +3 damage per weapon rank above 1.").rankBasis, "weapon");
  assert.equal(parseDamageFormula("5 + Hits + X (X is Energy spent)").energyVariable, true);
  assert.equal(parseDamageFormula("5; +2 damage per rank above 1.").usesHits, false);
  assert.equal(parseDamageFormula("").missing, true);
  assert.equal(parseDamageFormula("special arbitrary damage").ok, false);
  assert.equal(parseDamageFormula("5 + Hits; unknown rider").ok, false);
});

test("weapon damage/pumping use weapon rank while dice can use a different skill rank", () => {
  const profile = { damage: "5 + Hits; +3 damage per weapon rank above 1.", pumpingByRank: { 2: "+2 damage per Energy", 4: "+4 damage per Energy" } };
  const damage = calculateAttackDamage({ profile, skillRank: 4, weaponRank: 2, hits: 5, pumpingEnergy: 2 });
  assert.equal(damage.total, 17); // 5 + 3 + 5 + (2 * 2)
  assert.equal(calculateAttackDamage({ profile, skillRank: 4, hits: 5 }).ok, false);
  assert.equal(calculateAttackDamage({ profile, skillRank: 4, weaponRank: 0, hits: 5 }).ok, false);
});

test("damage includes actual Hits, skill growth, X, pumping and explicit adjustments once", () => {
  const result = calculateAttackDamage({ profile: { damage: "3 + Hits; +3 damage per rank above 0.", pumpingByRank: { 2: "+1 damage per Energy" } }, skillRank: 2, hits: 4, hitsMultiplier: 2, pumpingEnergy: 2, extraDamage: -1 });
  assert.equal(result.total, 18);
  assert.equal(calculateAttackDamage({ profile: { damage: "5 + Hits + X (X is Energy spent)" }, skillRank: 1, hits: 3, energy: 4 }).total, 12);
  assert.equal(calculateAttackDamage({ profile: { damage: "5; +2 damage per rank above 1." }, skillRank: 3, hits: 20 }).total, 9);
  assert.equal(calculateAttackDamage({ profile: { damage: "5" }, skillRank: 0, hits: 0, extraDamage: -9 }).total, 0);
});

test("unknown damage and non-damage pumping remain explicit instead of becoming zero", () => {
  assert.equal(getDamagePumping({ pumpingByRank: { 1: "+2 wards per Energy" } }, 1).supported, false);
  const base = { profile: { damage: "3 + Hits", pumpingByRank: { 0: "+0 damage per Energy", 1: "+2 wards per Energy" } }, skillRank: 0, hits: 2 };
  assert.equal(calculateAttackDamage({ ...base, pumpingEnergy: 1 }).ok, false);
  assert.equal(calculateAttackDamage({ ...base, skillRank: 1, pumpingEnergy: 1 }).ok, false);
  assert.equal(calculateAttackDamage({ ...base, profile: { damage: "manual effect" } }).ok, false);
  assert.throws(() => calculateAttackDamage({ ...base, energy: -1 }));
  assert.throws(() => calculateAttackDamage({ ...base, extraDamage: 1.5 }));
});
