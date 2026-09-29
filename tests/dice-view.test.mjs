import test from "node:test";
import assert from "node:assert/strict";
import { D6_FACES, getDieLanding, renderDiceResults } from "../public/js/builder/widgets/components/dice-view.js";
import { buildDicePool, resolveDicePool, resolveRollOutcome } from "../public/js/core/roll-rules.js";

// Verify the selected surface normal actually points toward the viewer after
// the CSS transform (rightmost rotation applies first).
function rotate([x, y, z], pose) {
  const rx = pose.x * Math.PI / 180, ry = pose.y * Math.PI / 180;
  const nx = x * Math.cos(ry) + z * Math.sin(ry), nz = -x * Math.sin(ry) + z * Math.cos(ry);
  return [nx, y * Math.cos(rx) - nz * Math.sin(rx), y * Math.sin(rx) + nz * Math.cos(rx)];
}

test("each of the six landed d6 surfaces shows the authoritative face, with correct pips", () => {
  for (const side of D6_FACES) {
    assert.equal(side.pips.length, side.face);
    assert.equal(new Set(side.pips).size, side.face);
    const normal = rotate(rotate([0, 0, 1], side), getDieLanding(side.face));
    assert(normal.every((value, index) => Math.abs(value - [0, 0, 1][index]) < 1e-10));
  }
  for (const invalid of [0, 7, 1.5, NaN, "3"]) assert.throws(() => getDieLanding(invalid), RangeError);
});

test("3D results retain the exact faces and Hits without extra randomness or mutation", () => {
  let draws = 0;
  const roll = resolveDicePool(buildDicePool({ attribute: 3, skillRank: 3 }), () => ++draws);
  const before = structuredClone(roll);
  const html = renderDiceResults(roll, { animate: true });
  for (const die of roll.dice) assert(html.includes(`aria-label="Die ${die.face}: ${die.hits} ${die.hits === 1 ? "Hit" : "Hits"}"`));
  assert.equal((html.match(/class="dice-face"/g) || []).length, 36);
  assert.match(html, /dice-animate/);
  assert.deepEqual(roll, before);
  resolveRollOutcome(roll.hits, 3);
  assert.doesNotMatch(renderDiceResults(roll), /dice-animate/);
  assert.equal(draws, 6, "history and a later TN must consume no additional draws");
});

test("the independent coin animates its actual side outside the ten-die cap", () => {
  for (const coin of [0, 1]) {
    let draws = 0;
    const roll = resolveDicePool(buildDicePool({ attribute: 6, skillRank: 5, modifiers: [.5] }), sides => { draws++; return sides === 2 ? coin + 1 : 6; });
    const html = renderDiceResults(roll, { animate: true });
    assert.equal(draws, 11);
    assert.equal((html.match(/class="dice-face"/g) || []).length, 60);
    assert.match(html, new RegExp(`aria-label="Half-die coin: ${coin} Hit`));
    assert.match(html, new RegExp(`--land-x:0deg;--land-y:${coin ? 0 : 180}deg`));
    assert.match(html, /\+1 automatic Hits/);
  }
});

test("zero dice and no-roll effects create no decorative dice or fake random draws", () => {
  const roll = resolveDicePool(buildDicePool({ attribute: 1, skillRank: 0, modifiers: [-1] }), () => assert.fail("Zero dice"));
  const html = renderDiceResults(roll, { animate: true });
  assert.doesNotMatch(html, /dice-tray|dice-animate|dice-token/);
  assert.match(html, /0 Hits without rolling/);
  assert.equal(renderDiceResults(roll, { noRoll: true }), "");
});

test("a half-only roll renders a single coin and respects the motion toggle", () => {
  const roll = resolveDicePool(buildDicePool({ attribute: 1, skillRank: 0, modifiers: [-.5] }), () => 2);
  const html = renderDiceResults(roll, { animate: false });
  assert.doesNotMatch(html, /dice-cube|dice-animate/);
  assert.match(html, /Half-die coin: 1 Hit/);
  assert.match(html, /--dice-columns:1/);
});
