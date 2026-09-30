import test from "node:test";
import assert from "node:assert/strict";
import { renderFightingStyleConditions, renderFightingStyleNotes } from "../public/js/builder/widgets/components/roll-style-display.js";

test("style conditions preserve explicit transient selections with escaped accessible labels", () => {
  const projection = { conditionChoices: [
    { key: "targetBleeding", label: "Target is bleeding" },
    { key: 'test"<', label: '<script> & "rule"' },
  ] };
  const html = renderFightingStyleConditions(projection, { targetBleeding: true });
  assert.match(html, /data-roll-style-condition="targetBleeding" checked/);
  assert.match(html, /&lt;script&gt; &amp; &quot;rule&quot;/);
  assert.match(html, /data-roll-style-condition="test&quot;&lt;"/);
  assert.doesNotMatch(html, /<script>|\bname=/);
  assert.doesNotMatch(renderFightingStyleConditions(projection), / checked/);
});

test("applied defense and damage benefits explain their scope without changing a target number", () => {
  const html = renderFightingStyleNotes({ effectiveRange: "Ranged 40", rollEffects: {
    damageBonus: 6, damageBonusOnHit: true, defenseDiceBonus: 1, targetDefenseDicePenalty: 1,
    rangeMultiplier: 2, ignoreAdjacentRangedPenalty: true,
  } });
  assert.match(html, /\+6 damage on a hit included in successful damage outcomes/);
  assert.match(html, /\+1D included in this defense roll/);
  assert.match(html, /defender apply this before entering its result as TN/);
  assert.match(html, /Range ×2: Ranged 40/);
  assert.match(html, /Do not enter that penalty in modifiers/);
  assert.doesNotMatch(html, /TN −1|TN -1/);
});

test("history notes retain confirmed conditions and only show critical effects for critical outcomes", () => {
  const projection = {
    conditionChoices: [{ key: "targetNotAdjacent", label: "Target is not adjacent" }, { key: "aimed", label: "Used Aim" }],
    conditions: { targetNotAdjacent: true, aimed: false },
    reminders: [{ text: "Heavy melee critical hits lower Physical Defense." }],
    triggeredEffects: [{ defense: "Physical", dicePenalty: 1, duration: "Until the end of the target’s next turn" }],
  };
  const ordinary = renderFightingStyleNotes(projection, { includeConditions: true });
  assert.match(ordinary, /Confirmed conditions.*Target is not adjacent/);
  assert.doesNotMatch(ordinary, /Used Aim|Critical effect/);
  const critical = renderFightingStyleNotes(projection, { criticalSuccess: true, includeConditions: true });
  assert.match(critical, /Critical effect:.*Physical Defense −1D/);
  assert.match(critical, /end of the target/);
  assert.deepEqual(projection.conditions, { targetNotAdjacent: true, aimed: false });
});

test("uncalculated aimed range retains the whole authored expression with an explicit multiplier", () => {
  const html = renderFightingStyleNotes({ rangeSource: "Range 20 + 5 per rank <special>", rangeCalculated: false,
    effectiveRange: "", rollEffects: { rangeMultiplier: 2 } });
  assert.match(html, /Range ×2\. Apply the multiplier to the full authored range: Range 20 \+ 5 per rank &lt;special&gt;/);
  assert.doesNotMatch(html, /Range 40|Range ×2: Range 20|<special>/);
});

test("styles without applied effects preserve readable source reminders without blank effect notices", () => {
  const html = renderFightingStyleNotes({ rollEffects: { rangeMultiplier: 1, damageBonus: 0 }, reminders: [{ text: 'Returning <weapon> & "rule"' }] });
  assert.match(html, /Returning &lt;weapon&gt; &amp; &quot;rule&quot;/);
  assert.doesNotMatch(html, /Applied:|Critical effect:|Confirmed conditions:/);
  assert.equal(renderFightingStyleNotes({}), "");
});
