import {
  assertCanonicalCharacter,
  isCanonicalStableKey,
} from "./character-codec.js";

export const CHARACTER_COMMAND_TYPES = Object.freeze({
  SET_CLASS: "SetClass",
  SET_TECHNIQUE_SELECTION: "SetTechniqueSelection",
});

function diagnostic(code, path, message) {
  return Object.freeze({ code, path, message });
}

export class CharacterCommandError extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.name = "CharacterCommandError";
    this.code = code;
    this.diagnostics = Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })));
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(command, expectedKeys) {
  if (!isPlainObject(command)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "Character command must be a plain object.",
      [diagnostic("invalid-type", "command", "Expected a plain object.")],
    );
  }
  const expected = new Set(expectedKeys);
  const diagnostics = [];
  for (const key of Object.keys(command).sort()) {
    if (!expected.has(key)) {
      diagnostics.push(diagnostic("unknown-field", `command.${key}`, "Field is not part of this command."));
    }
  }
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(command, key)) {
      diagnostics.push(diagnostic("missing-field", `command.${key}`, "Required command field is missing."));
    }
  }
  if (diagnostics.length) {
    throw new CharacterCommandError("invalid-character-command", "Character command shape is invalid.", diagnostics);
  }
}

function validateSetClass(command) {
  requireExactKeys(command, ["type", "classKey"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_CLASS) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetClass command type is invalid.",
      [diagnostic("invalid-value", "command.type", "Expected SetClass.")],
    );
  }
  if (!isCanonicalStableKey(command.classKey)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetClass requires a canonical stable class key or an empty value.",
      [diagnostic("invalid-stable-key", "command.classKey", "Class key is not canonical.")],
    );
  }
  return Object.freeze({ type: command.type, classKey: command.classKey });
}

function validateTechniqueKeys(value) {
  if (!Array.isArray(value)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetTechniqueSelection requires an array of stable technique keys.",
      [diagnostic("invalid-type", "command.techniqueKeys", "Expected an array.")],
    );
  }
  const diagnostics = [];
  const seen = new Set();
  value.forEach((key, index) => {
    if (!isCanonicalStableKey(key, { allowEmpty: false })) {
      diagnostics.push(diagnostic(
        "invalid-stable-key",
        `command.techniqueKeys[${index}]`,
        "Technique selection entries must be non-empty canonical stable keys.",
      ));
      return;
    }
    if (seen.has(key)) {
      diagnostics.push(diagnostic(
        "duplicate-identity",
        `command.techniqueKeys[${index}]`,
        `Technique key "${key}" is selected more than once.`,
      ));
    }
    seen.add(key);
  });
  if (diagnostics.length) {
    throw new CharacterCommandError("invalid-character-command", "Technique selection command is invalid.", diagnostics);
  }
  return Object.freeze([...value]);
}

function validateSetTechniqueSelection(command) {
  requireExactKeys(command, ["type", "techniqueKeys"]);
  if (command.type !== CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "SetTechniqueSelection command type is invalid.",
      [diagnostic("invalid-value", "command.type", "Expected SetTechniqueSelection.")],
    );
  }
  return Object.freeze({
    type: command.type,
    techniqueKeys: validateTechniqueKeys(command.techniqueKeys),
  });
}

export function SetClass(classKey) {
  return validateSetClass({ type: CHARACTER_COMMAND_TYPES.SET_CLASS, classKey });
}

export function SetTechniqueSelection(techniqueKeys) {
  return validateSetTechniqueSelection({
    type: CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION,
    techniqueKeys,
  });
}

export function decodeCharacterCommand(command) {
  if (!isPlainObject(command)) {
    throw new CharacterCommandError(
      "invalid-character-command",
      "Character command must be a plain object.",
      [diagnostic("invalid-type", "command", "Expected a plain object.")],
    );
  }
  if (command.type === CHARACTER_COMMAND_TYPES.SET_CLASS) return validateSetClass(command);
  if (command.type === CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION) {
    return validateSetTechniqueSelection(command);
  }
  throw new CharacterCommandError(
    "unknown-character-command",
    `Unknown character command type "${String(command.type || "")}".`,
    [diagnostic("unknown-command", "command.type", "Command type is not registered.")],
  );
}

export function applyCharacterCommand(character, command) {
  const current = assertCanonicalCharacter(character);
  const decoded = decodeCharacterCommand(command);
  if (decoded.type === CHARACTER_COMMAND_TYPES.SET_CLASS) {
    current.builder.classKey = decoded.classKey;
  } else if (decoded.type === CHARACTER_COMMAND_TYPES.SET_TECHNIQUE_SELECTION) {
    current.builder.selectedTechniques = [...decoded.techniqueKeys];
  }
  return assertCanonicalCharacter(current);
}

export const CharacterCommands = Object.freeze({
  types: CHARACTER_COMMAND_TYPES,
  setClass: SetClass,
  setTechniqueSelection: SetTechniqueSelection,
  decode: decodeCharacterCommand,
  apply: applyCharacterCommand,
});
