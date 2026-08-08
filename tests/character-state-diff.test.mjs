import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import {
  canonicalCharacterStatesEqual,
  diffCanonicalCharacterStates,
} from "../public/js/core/character-state-diff.js";

test("canonical diff is deterministic, exact-path, and treats ordered arrays atomically", () => {
  const before = createDefaultCharacter({ ownerUid: "user_123" });
  const after = structuredClone(before);
  after.builder.classKey = "ninja";
  after.builder.selectedTechniques = ["shadow-step", "stalk-prey"];
  after.builder.resources.focus = {
    resourceKey: "focus",
    name: "Focus",
    capacity: 2,
    current: 2,
  };

  const diff = diffCanonicalCharacterStates(before, after);
  assert.deepEqual(diff.map(({ type, path }) => ({ type, path })), [
    { type: "replace", path: "builder.classKey" },
    { type: "add", path: "builder.resources.focus" },
    { type: "replace", path: "builder.selectedTechniques" },
  ]);
  assert.deepEqual(diff[2].before, []);
  assert.deepEqual(diff[2].after, ["shadow-step", "stalk-prey"]);
  assert.equal(Object.isFrozen(diff), true);
  assert.equal(Object.isFrozen(diff[1].after), true);
  assert.equal(canonicalCharacterStatesEqual(before, structuredClone(before)), true);
  assert.equal(canonicalCharacterStatesEqual(before, after), false);
});

test("canonical diff rejects malformed states rather than comparing partial objects", () => {
  const valid = createDefaultCharacter({ ownerUid: "user_123" });
  assert.throws(() => diffCanonicalCharacterStates(valid, { ...valid, surprise: true }));
});
