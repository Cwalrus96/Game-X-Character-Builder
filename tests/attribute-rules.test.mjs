import assert from "node:assert/strict";
import test from "node:test";

import {
  fitAttributesToPointBudget,
  getAttributeAllocationState,
  getAttributePointUsage,
} from "../public/js/core/character-rules.js";

test("attribute point usage excludes the primary attribute bonus", () => {
  const attributes = {
    strength: 2,
    agility: 4,
    intellect: 1,
    willpower: 0,
    attunement: 0,
    heart: 3,
  };
  assert.equal(getAttributePointUsage(attributes, "agility"), 9);
  assert.equal(getAttributePointUsage(attributes, ""), 10);
});

test("attribute allocation state centralizes every graph and widget limit", () => {
  const allocation = getAttributeAllocationState({
    level: 2,
    primaryAttribute: "agility",
    attributes: {
      strength: 2,
      agility: 4,
      intellect: 1,
      willpower: 0,
      attunement: 0,
      heart: 3,
    },
  });
  assert.deepEqual({
    capacity: allocation.capacity,
    usage: allocation.usage,
    remaining: allocation.remaining,
    finalCap: allocation.finalCap,
  }, { capacity: 15, usage: 9, remaining: 6, finalCap: 5 });
  assert.deepEqual(allocation.limits.agility, { minimum: 1, cap: 5, maximumAssignable: 5 });
  assert.deepEqual(allocation.limits.strength, { minimum: 0, cap: 4, maximumAssignable: 4 });
  assert.equal(Object.isFrozen(allocation.limits), true);
  assert.equal(Object.isFrozen(allocation.limits.agility), true);
});

test("attribute point fitting reduces non-primary high values in stable key order", () => {
  const result = fitAttributesToPointBudget({
    level: 1,
    primaryAttribute: "agility",
    attributes: {
      strength: 3,
      agility: 4,
      intellect: 3,
      willpower: 3,
      attunement: 3,
      heart: 3,
    },
  });
  assert.equal(result.beforeUsage, 18);
  assert.equal(result.usage, 12);
  assert.deepEqual(result.attributes, {
    strength: 0,
    agility: 4,
    intellect: 0,
    willpower: 3,
    attunement: 3,
    heart: 3,
  });
  assert.deepEqual(result.reductions.map(({ key, before, after }) => ({ key, before, after })), [
    { key: "strength", before: 3, after: 0 },
    { key: "intellect", before: 3, after: 0 },
  ]);
});

test("attribute point fitting is non-mutating and idempotent", () => {
  const attributes = {
    strength: 3,
    agility: 4,
    intellect: 3,
    willpower: 3,
    attunement: 3,
    heart: 3,
  };
  const original = structuredClone(attributes);
  const first = fitAttributesToPointBudget({ level: 1, primaryAttribute: "agility", attributes });
  const second = fitAttributesToPointBudget({
    level: 1,
    primaryAttribute: "agility",
    attributes: first.attributes,
  });
  assert.deepEqual(attributes, original);
  assert.deepEqual(second.attributes, first.attributes);
  assert.deepEqual(second.reductions, []);
});
