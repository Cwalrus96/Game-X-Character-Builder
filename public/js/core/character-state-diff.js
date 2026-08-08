import { assertCanonicalCharacter } from "./character-codec.js";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const output = {};
    for (const [key, child] of Object.entries(value)) output[key] = cloneValue(child);
    return output;
  }
  return value;
}

function freezeValue(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeValue);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach(freezeValue);
    return Object.freeze(value);
  }
  return value;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => (
        key === rightKeys[index] && valuesEqual(left[key], right[key])
      ));
  }
  return false;
}

function makeChange(type, path, before, after) {
  return freezeValue({
    type,
    path,
    before: cloneValue(before),
    after: cloneValue(after),
  });
}

function visitDiff(before, after, path, output) {
  if (valuesEqual(before, after)) return;

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const childPath = path ? `${path}.${key}` : key;
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (!hasBefore) output.push(makeChange("add", childPath, undefined, after[key]));
      else if (!hasAfter) output.push(makeChange("remove", childPath, before[key], undefined));
      else visitDiff(before[key], after[key], childPath, output);
    }
    return;
  }

  output.push(makeChange("replace", path, before, after));
}

export function diffCanonicalCharacterStates(before, after) {
  const left = assertCanonicalCharacter(before);
  const right = assertCanonicalCharacter(after);
  const changes = [];
  visitDiff(left, right, "", changes);
  return Object.freeze(changes);
}

export function canonicalCharacterStatesEqual(left, right) {
  return diffCanonicalCharacterStates(left, right).length === 0;
}

export const CharacterStateDiff = Object.freeze({
  diff: diffCanonicalCharacterStates,
  equal: canonicalCharacterStatesEqual,
});
