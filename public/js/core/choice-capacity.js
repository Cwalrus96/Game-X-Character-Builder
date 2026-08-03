function toCount(value) {
  const n = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function pluralize(noun, count) {
  return `${noun}${count === 1 ? "" : "s"}`;
}

export function getChoiceCountState({
  selectedCount = 0,
  expectedCount = 0,
  maxCount = expectedCount,
  noun = "choice",
} = {}) {
  const selected = toCount(selectedCount);
  const expected = toCount(expectedCount);
  const max = toCount(maxCount);
  return {
    selectedCount: selected,
    expectedCount: expected,
    maxCount: max,
    noun,
    isComplete: expected <= 0 || selected === expected,
    isUnderExpected: expected > 0 && selected < expected,
    isOverExpected: expected > 0 && selected > expected,
    isAtCapacity: max > 0 && selected >= max,
    hasCapacity: max <= 0 || selected < max,
  };
}

export function formatExpectedSelectionMessage(options = {}) {
  const state = getChoiceCountState(options);
  return `Expected ${state.expectedCount} ${pluralize(state.noun, state.expectedCount)}, but ${state.selectedCount} selected.`;
}

export function getExpectedSelectionIssue(options = {}) {
  const state = getChoiceCountState(options);
  if (state.isComplete) return null;
  return {
    reason: formatExpectedSelectionMessage(state),
    previousValue: state.selectedCount,
    nextValue: state.expectedCount,
  };
}
