import { getActiveCharacterGrantSources, getSourceFeatSlots } from "./grant-source-rules.js";
import { createPrerequisiteContext, checkPrerequisites } from "./prerequisites.js";
import { isGameDataRecordSelectable } from "./selection-rules.js";
import { allocateFeatsToExplicitSlots, featMatchesExplicitSlot } from "./feat-allocation-rules.js";
export { createFeatGrantSlots, getFeatRequiredLevel, featMatchesExplicitSlot, allocateFeatsToExplicitSlots } from "./feat-allocation-rules.js";

const text = value => typeof value === "string" ? value.trim() : "";
const entryIdentity = (entry, index) => text(entry?.featureKey || entry?.featKey || entry?.originKey || entry?.key) || `entry-${index}`;

export function getExplicitFeatSlots(gameData, builder = {}) {
  return Object.freeze(getSourceFeatSlots(getActiveCharacterGrantSources(gameData, builder,
    createPrerequisiteContext({ gameData, builder }))));
}

export function getFeatSelectionState(gameData, builder = {}, { slots = null } = {}) {
  const explicitSlots = Array.isArray(slots) ? slots : getExplicitFeatSlots(gameData, builder);
  const feats = Array.isArray(gameData?.feats) ? gameData.feats : [];
  const selectedFeatKeys = Array.isArray(builder?.selectedFeats) ? builder.selectedFeats : [];
  const allocation = allocateFeatsToExplicitSlots({ slots: explicitSlots, feats, selectedFeatKeys });
  const selectedSet = new Set(selectedFeatKeys);
  const availableFeats = feats.filter((feat) => {
    const featKey = text(feat?.featKey);
    if (!featKey) return false;
    if (feat.expressionSyntaxVersion === 3 && !isGameDataRecordSelectable(feat)) return false;
    if (selectedSet.has(featKey)) return true;
    if (!isGameDataRecordSelectable(feat)) return false;
    if (!explicitSlots.some((slot) => featMatchesExplicitSlot(feat, slot))) return false;
    const candidate = allocateFeatsToExplicitSlots({
      slots: explicitSlots,
      feats,
      selectedFeatKeys: [...selectedFeatKeys, featKey],
    });
    return candidate.unmatchedFeatKeys.length === 0;
  });

  return Object.freeze({ ...allocation, availableFeats: Object.freeze(availableFeats) });
}

/** Source-scoped controls use the same allocation and filters as the graph. */
export function getFeatGrantChoices(gameData, builder = {}, { entry, grantIndex = 0 } = {}) {
  const state = getFeatSelectionState(gameData, builder);
  const feats = Array.isArray(gameData?.feats) ? gameData.feats : [];
  const selected = Array.isArray(builder.selectedFeats) ? builder.selectedFeats : [];
  return Object.freeze(state.slots
    .filter((slot) => slot.sourceKey === entryIdentity(entry, 0) && slot.grantIndex === grantIndex)
    .map((slot) => {
      const featKey = state.assignments.find((assignment) => assignment.slotId === slot.slotId)?.featKey || "";
      const remainingKeys = selected.filter((key) => key !== featKey);
      const options = feats.filter((feat) => featMatchesExplicitSlot(feat, slot)).map((feat) => {
        const key = text(feat.featKey);
        const alreadySelected = remainingKeys.includes(key);
        const prerequisites = checkPrerequisites(feat.prerequisites, {
          gameData, builder: key === featKey ? builder : { ...builder, selectedFeats: remainingKeys },
        });
        const selectable = key === featKey || isGameDataRecordSelectable(feat);
        const nextFeatKeys = selected.includes(featKey)
          ? selected.map((current) => current === featKey ? key : current)
          : [...selected, key];
        return Object.freeze({
          feat, featKey: key,
          eligible: selectable && !alreadySelected && prerequisites.ok,
          reason: !selectable ? "This feat is incomplete or unavailable."
            : alreadySelected ? "Chosen by another feature."
              : prerequisites.failureReasons?.join(" ") || "",
          nextFeatKeys: Object.freeze(nextFeatKeys),
        });
      });
      return Object.freeze({
        ...slot, featKey, options: Object.freeze(options),
        clearedFeatKeys: Object.freeze(remainingKeys),
      });
    }));
}
