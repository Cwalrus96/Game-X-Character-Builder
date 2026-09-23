import { getChoiceCountState, formatExpectedSelectionMessage } from "./choice-capacity.js";
import { isGameDataRecordExecutable } from "./selection-rules.js";

/** Shared availability for Class and Feat option cards and their save reminders. */
export function getOptionAvailability(group, option, checkPrerequisites = () => ({ ok: true })) {
  if (!isGameDataRecordExecutable(group) || !isGameDataRecordExecutable(option)) {
    const unavailable = !isGameDataRecordExecutable(group) ? group : option;
    const reasons = unavailable?.runtimeSupport?.reasons || [];
    const message = reasons.includes("draft-record-granted")
      ? "Unavailable: a granted technique is not marked playable."
      : reasons.includes("record-unready")
        ? "Unavailable: this option is missing readiness information."
        : reasons.includes("incomplete-content")
          ? "Unavailable: this option has incomplete content."
          : "Unavailable: this option needs builder support for its rules.";
    return { ok: false, failureReasons: [message] };
  }
  return checkPrerequisites(option);
}

/** Keep authored capacity intact, but only ask for choices the player can make now. */
export function getOptionGroupCompletion(group, {
  selectedKeys = new Set(), optionKey = (option) => option.featureKey || option.featKey,
  checkPrerequisites,
} = {}) {
  const options = Array.isArray(group?.options) ? group.options : [];
  const expectedCount = Math.max(1, Number.parseInt(String(group?.chooseCount ?? 1), 10) || 1);
  const selectedCount = options.filter((option) => selectedKeys.has(optionKey(option))).length;
  const availableCount = options.filter((option) => !selectedKeys.has(optionKey(option))
    && getOptionAvailability(group, option, checkPrerequisites).ok).length;
  const state = getChoiceCountState({ selectedCount, expectedCount, noun: "option" });
  const actionableCount = Math.min(Math.max(0, expectedCount - selectedCount), availableCount);
  const label = String(group?.name || "This feature").trim();
  const message = state.isOverExpected
    ? `${label}: ${formatExpectedSelectionMessage(state)}`
    : actionableCount > 0
      ? `${label}: choose ${actionableCount} more option${actionableCount === 1 ? "" : "s"} (${selectedCount}/${expectedCount} selected).`
      : "";
  return Object.freeze({ selectedCount, expectedCount, availableCount, actionableCount, message });
}
