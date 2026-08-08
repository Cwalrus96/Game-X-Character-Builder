import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import {
  CharacterCommandError,
  SetClass,
  SetTechniqueSelection,
  applyCharacterCommand,
  decodeCharacterCommand,
} from "../public/js/core/character-commands.js";

test("SetClass expresses only direct class intent", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.agility = 1;
  const original = structuredClone(character);

  const command = SetClass("ninja");
  const result = applyCharacterCommand(character, command);
  assert.deepEqual(command, { type: "SetClass", classKey: "ninja" });
  assert.equal(result.builder.classKey, "ninja");
  assert.equal(result.builder.primaryAttribute, "agility");
  assert.deepEqual(character, original);
  assert.equal(SetClass("").classKey, "");
});

test("SetTechniqueSelection preserves order and replaces only the selection", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.classKey = "ninja";
  const result = applyCharacterCommand(
    character,
    SetTechniqueSelection(["shadow-step", "stalk-prey"]),
  );
  assert.deepEqual(result.builder.selectedTechniques, ["shadow-step", "stalk-prey"]);
  assert.equal(result.builder.classKey, "ninja");
});

test("commands reject malformed keys, duplicates, unknown fields, and unknown types", () => {
  assert.throws(() => SetClass("Ninja Class"), CharacterCommandError);
  assert.throws(
    () => SetTechniqueSelection(["shadow-step", "shadow-step"]),
    (error) => error.diagnostics.some((item) => item.code === "duplicate-identity"),
  );
  assert.throws(
    () => SetTechniqueSelection(["Shadow Step"]),
    (error) => error.diagnostics.some((item) => item.code === "invalid-stable-key"),
  );
  assert.throws(
    () => decodeCharacterCommand({ type: "SetClass", classKey: "ninja", surprise: true }),
    (error) => error.diagnostics.some((item) => item.path === "command.surprise"),
  );
  assert.throws(
    () => decodeCharacterCommand({ type: "DeleteCharacter" }),
    (error) => error.code === "unknown-character-command",
  );
});
