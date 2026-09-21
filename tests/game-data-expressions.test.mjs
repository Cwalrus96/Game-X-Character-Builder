import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  GRANT_EXPRESSION_REGISTRY,
  PREREQUISITE_EXPRESSION_REGISTRY,
  SCHEMA_V4_GRANT_TYPES,
  SCHEMA_V4_PREREQUISITE_TYPES,
} from "../public/js/core/game-data-contract.js";
import {
  formatExpressionDiagnostic,
  parseExpressionLine,
  parseGrantExpression,
  parseGrantExpressions,
  parsePrerequisiteExpression,
  resolveCapacityExpression,
  serializeExpression,
} from "../public/js/core/game-data-expressions.js";
import { getGrantRuntimeStatus, initializeGrantedResource, normalizeResourceCurrent, sanitizeGrant } from "../public/js/core/grants.js";
import { checkPrerequisites, normalizePrerequisite } from "../public/js/core/prerequisites.js";

const fixtures = JSON.parse(fs.readFileSync(new URL("fixtures/game-data-expressions.json", import.meta.url), "utf8"));

test("schema-v4 grant and prerequisite enum fixtures cover the typed registries", () => {
  assert.deepEqual(fixtures.validGrants.map((fixture) => fixture.type), SCHEMA_V4_GRANT_TYPES);
  assert.deepEqual(fixtures.validPrerequisites.map((fixture) => fixture.type), SCHEMA_V4_PREREQUISITE_TYPES);
  for (const type of SCHEMA_V4_GRANT_TYPES) assert(GRANT_EXPRESSION_REGISTRY[type]);
  for (const type of SCHEMA_V4_PREREQUISITE_TYPES) assert(PREREQUISITE_EXPRESSION_REGISTRY[type]);
});

test("every schema-v4 expression fixture parses and round trips deterministically", () => {
  for (const fixture of fixtures.validGrants) {
    const first = parseGrantExpression(fixture.expression);
    assert.equal(first.ok, true, fixture.expression);
    const serialized = serializeExpression("grant", first.value);
    assert.equal(serialized.ok, true, fixture.expression);
    assert.deepEqual(parseGrantExpression(serialized.value).value, first.value);
  }
  for (const fixture of fixtures.validPrerequisites) {
    const first = parsePrerequisiteExpression(fixture.expression);
    assert.equal(first.ok, true, fixture.expression);
    const serialized = serializeExpression("prerequisite", first.value);
    assert.equal(serialized.ok, true, fixture.expression);
    assert.deepEqual(parsePrerequisiteExpression(serialized.value).value, first.value);
  }
});

test("separate lines preserve AND order and supported fields preserve OR values", () => {
  const result = parseGrantExpressions([
    "technique | skillKeys=spellcasting OR elementalism | choiceId=spell-pick",
    "weapon | tagKeys=melee OR ranged | choiceId=weapon-pick",
  ].join("\n"));
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, [
    { type: "technique-choice", skill: ["spellcasting", "elementalism"], choiceId: "spell-pick", count: 1 },
    { type: "weapon", tag: ["melee", "ranged"], choiceId: "weapon-pick" },
  ]);
});

test("source-owned filtered grants and source-relative upgrades preserve their typed meaning", () => {
  for (const expression of [
    "skill | choiceId=trained-skill | minRank=1 | count=1",
    "gadget | choiceId=flexible-gadgets | count=intellect",
    "specialization | choiceRef=soulbound-weapon",
    "vehicle | rank=1 | count=1",
  ]) {
    const result = parseGrantExpression(expression);
    assert.equal(result.ok, true, `${expression}: ${result.diagnostics.map((item) => item.message).join("; ")}`);
  }
});

test("generic rank and choice rebind grants preserve reversible source-relative operations", () => {
  const rank = parseGrantExpression("rank | choiceRef=monster-evolution-companion | operation=increase | value=1");
  assert.equal(rank.ok, true);
  assert.deepEqual(rank.value, {
    type: "rank", choiceRef: "monster-evolution-companion", operation: "increase", value: 1,
  });

  const rebind = parseGrantExpression("choice-rebind | choiceRef=soulbound-weapon | answerType=weapon-enhancement | maxRank=2");
  assert.equal(rebind.ok, true);
  assert.deepEqual(rebind.value, {
    type: "choice-rebind", choiceRef: "soulbound-weapon", answerType: "weapon-enhancement", maxRank: 2, count: 1,
  });
  assert.equal(getGrantRuntimeStatus(rank.value), "stubbed");
  assert.equal(getGrantRuntimeStatus(rebind.value), "stubbed");
});

test("malformed expression classes return contextual diagnostics without dropping partial meaning", () => {
  const context = { sheet: "ClassFeatures", row: 14, column: "G", cell: "G14" };
  for (const fixture of fixtures.invalid) {
    const result = parseExpressionLine(fixture.kind, fixture.expression, { context });
    assert.equal(result.ok, false, fixture.expression);
    assert(result.diagnostics.some((item) => item.code === fixture.code), fixture.expression);
    assert(result.diagnostics.every((item) => item.context === context), fixture.expression);
    assert.match(formatExpressionDiagnostic(result.diagnostics[0]), /ClassFeatures G14/);
  }

  const legacy = parsePrerequisiteExpression("GM approval based on the story", { context });
  assert.equal(legacy.ok, true);
  assert.deepEqual(legacy.value, { type: "text", text: "GM approval based on the story" });
  assert.equal(legacy.diagnostics[0].code, "legacy-text");
});

test("resource counts are typed capacity expressions and initialize current amount to capacity", () => {
  const constant = parseGrantExpression("resource | resourceKey=charms | count=3").value;
  const symbolic = parseGrantExpression("resource | resourceKey=charms | name=Charms | count=primary attribute").value;
  assert.deepEqual(constant.count, { kind: "constant", value: 3 });
  assert.deepEqual(symbolic.count, { kind: "symbol", symbol: "primary-attribute" });
  assert.equal(resolveCapacityExpression(symbolic.count, { primaryAttribute: 4 }), 4);
  assert.equal(resolveCapacityExpression(parseGrantExpression("resource | resourceKey=commands | count=heart").value.count, { heart: 3 }), 3);
  assert.deepEqual(initializeGrantedResource(symbolic, { primaryAttribute: 4 }), {
    resourceKey: "charms", name: "Charms", capacity: 4, current: 4,
  });
  assert.equal(normalizeResourceCurrent(9, 4), 4);
  assert.equal(normalizeResourceCurrent(-2, 4), 0);
  assert.equal(checkPrerequisites([{ type: "resource", resourceKey: "charms", minCount: 3 }], {
    resources: { charms: { capacity: 4 } },
  }).ok, true);

  const weaponContext = {
    builder: {
      weapons: [
        { weaponKey: "blade", rank: 2, effectiveTags: ["melee", "one-handed", "sharp"], reach: 2 },
        { weaponKey: "knife", rank: 1, effectiveTags: ["melee", "one-handed"], reach: 1 },
      ],
    },
  };
  assert.equal(checkPrerequisites([{ type: "weapon", tagAll: ["melee", "sharp"], tagNot: ["defensive"], minReach: 2 }], weaponContext).ok, true);
  assert.equal(checkPrerequisites([{ type: "weapon-set", tag: "one-handed", count: 2, wielded: true }], weaponContext).ok, true);
});

test("runtime normalization uses the registry and stubbed constructs remain explicit", () => {
  const normalized = sanitizeGrant({ type: "technique", techniqueKey: "mark-prey" }, { name: "Fixture" });
  assert.equal(normalized.key, "mark-prey");
  assert.equal(getGrantRuntimeStatus({ type: "familiar" }), "stubbed");
  assert.equal(getGrantRuntimeStatus({ type: "vehicle" }), "stubbed");
  assert.equal(getGrantRuntimeStatus({ type: "gadget" }), "stubbed");
  assert.throws(() => sanitizeGrant({ type: "weapon", mystery: "not-allowed" }, { name: "Fixture" }), /not allowed/);
  assert.throws(() => normalizePrerequisite({ type: "class", featKey: "wrong-field" }), /not allowed/);
});

test("shared expression parsing stays pure and exporter/runtime import it", () => {
  const expressions = fs.readFileSync(new URL("../public/js/core/game-data-expressions.js", import.meta.url), "utf8");
  const exporter = fs.readFileSync(new URL("../scripts/export-game-data.mjs", import.meta.url), "utf8");
  const grants = fs.readFileSync(new URL("../public/js/core/grants.js", import.meta.url), "utf8");
  const prerequisites = fs.readFileSync(new URL("../public/js/core/prerequisites.js", import.meta.url), "utf8");
  const prerequisiteRules = fs.readFileSync(new URL("../public/js/core/prerequisite-rules.js", import.meta.url), "utf8");
  assert.doesNotMatch(expressions, /process\.exit/);
  assert.match(exporter, /game-data-expressions\.js/);
  assert.match(grants, /game-data-expressions\.js/);
  assert.match(prerequisites, /prerequisite-rules\.js/);
  assert.match(prerequisiteRules, /game-data-expressions\.js/);
  assert.doesNotMatch(exporter, /function parseGrantLine|function parsePrerequisiteLine/);
});
