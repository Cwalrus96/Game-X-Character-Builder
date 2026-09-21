import { createCharacterGrantCollection } from "./game-data.js?v=wpe1";
import { checkPrerequisites } from "./prerequisites.js";
import { isGameDataRecordSelectable } from "./selection-rules.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function grantCount(grant) {
  if (grant?.count && typeof grant.count === "object") {
    return positiveInteger(grant.count.value, 1);
  }
  return positiveInteger(grant?.count, 1);
}

function entryIdentity(entry, index) {
  const key = text(entry?.featureKey || entry?.featKey || entry?.originKey || entry?.key);
  return key || `entry-${index}`;
}

function normalizedType(value) {
  return text(value).toLowerCase();
}

function filterValues(value) {
  return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
}

function normalizeFilter(value, normalize = text) {
  return Array.isArray(value) ? Object.freeze(value.map(normalize).filter(Boolean)) : normalize(value);
}

function matchesFilter(value, filter) {
  const alternatives = filterValues(filter);
  return alternatives.length === 0 || alternatives.includes(value);
}

function directFeatKeys(grant) {
  const source = Array.isArray(grant?.key) ? grant.key : [grant?.key];
  return source.map(text).filter(Boolean);
}

function classPrerequisiteLevel(feat, classKey = "") {
  const classKeys = filterValues(classKey);
  const levels = (Array.isArray(feat?.prerequisites) ? feat.prerequisites : [])
    .filter((item) => normalizedType(item?.type) === "class")
    .filter((item) => !classKeys.length || filterValues(item?.key).some((key) => classKeys.includes(key)))
    .map((item) => positiveInteger(item?.level, 0))
    .filter((level) => level > 0);
  return levels.length ? Math.max(...levels) : 0;
}

export function createFeatGrantSlots(grant, {
  sourceId = "",
  sourceLabel = "",
  grantId = "",
  grantIndex = 0,
} = {}) {
  if (normalizedType(grant?.type) !== "feat") return [];
  const ownerId = text(sourceId) || "unknown-source";
  const resolvedGrantId = text(grantId) || `${ownerId}:grant-${grantIndex}`;
  const slotCount = grantCount(grant);
  const slots = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    slots.push(Object.freeze({
      slotId: `feat-slot:${resolvedGrantId}:${slotIndex}`,
      sourceId: ownerId,
      sourceLabel: text(sourceLabel) || ownerId,
      grantId: resolvedGrantId,
      grantIndex,
      slotIndex,
      filterType: normalizeFilter(grant?.filterType, normalizedType),
      category: normalizeFilter(grant?.category),
      classKey: normalizeFilter(grant?.classKey),
      maxLevel: positiveInteger(grant?.level, 0),
      featKeys: Object.freeze(directFeatKeys(grant)),
      featName: text(grant?.name),
    }));
  }
  return slots;
}

export function getExplicitFeatSlots(gameData, builder = {}) {
  const collection = createCharacterGrantCollection(gameData, builder);
  const slots = [];
  collection.entries.forEach((entry, entryIndex) => {
    const prerequisiteState = checkPrerequisites(entry?.prerequisites, {
      gameData,
      builder,
      deferUnresolvedChoices: true,
    });
    if (!prerequisiteState.ok) return;
    const sourceId = `active-entry:${entryIdentity(entry, entryIndex)}:${entryIndex}`;
    const sourceLabel = text(entry?.name) || entryIdentity(entry, entryIndex);
    const grants = Array.isArray(entry?.grants) ? entry.grants : [];
    grants.forEach((grant, grantIndex) => {
      slots.push(...createFeatGrantSlots(grant, {
        sourceId,
        sourceLabel,
        grantId: `${sourceId}:${grantIndex}`,
        grantIndex,
      }));
    });
  });
  return Object.freeze(slots);
}

export function getFeatRequiredLevel(feat, { classKey = "" } = {}) {
  return classPrerequisiteLevel(feat, classKey) || classPrerequisiteLevel(feat);
}

export function featMatchesExplicitSlot(feat, slot) {
  const featKey = text(feat?.featKey);
  if (!featKey || !slot) return false;
  if (feat.expressionSyntaxVersion === 3 && !isGameDataRecordSelectable(feat)) return false;
  if (slot.featKeys?.length && !slot.featKeys.includes(featKey)) return false;
  if (slot.featName && text(feat?.name) !== slot.featName) return false;

  const featType = normalizedType(feat?.featType || feat?.type);
  if (!matchesFilter(featType, slot.filterType)) return false;
  if (!matchesFilter(text(feat?.category), slot.category)) return false;

  const requiredClassKey = slot.classKey || slot.category;
  if (filterValues(slot.classKey).length) {
    const classKeys = (Array.isArray(feat?.prerequisites) ? feat.prerequisites : [])
      .filter((item) => normalizedType(item?.type) === "class")
      .flatMap((item) => filterValues(item?.key));
    if (!filterValues(slot.classKey).some((key) => text(feat?.category) === key || classKeys.includes(key))) return false;
  }
  if (slot.maxLevel > 0 && getFeatRequiredLevel(feat, { classKey: requiredClassKey }) > slot.maxLevel) {
    return false;
  }
  return true;
}

export function allocateFeatsToExplicitSlots({
  slots = [],
  feats = [],
  selectedFeatKeys = [],
} = {}) {
  const orderedSlots = Array.from(slots);
  const featsByKey = new Map(
    Array.from(feats)
      .map((feat) => [text(feat?.featKey), feat])
      .filter(([key]) => Boolean(key)),
  );
  const selectedKeys = Array.from(selectedFeatKeys).map(text).filter(Boolean);
  const slotAssignments = new Map();
  const selectionAssignments = new Map();

  const assign = (featKey, visitedSlotIds) => {
    const feat = featsByKey.get(featKey);
    if (!feat) return false;
    for (const slot of orderedSlots) {
      if (visitedSlotIds.has(slot.slotId) || !featMatchesExplicitSlot(feat, slot)) continue;
      visitedSlotIds.add(slot.slotId);
      const previousFeatKey = slotAssignments.get(slot.slotId);
      if (!previousFeatKey || assign(previousFeatKey, visitedSlotIds)) {
        slotAssignments.set(slot.slotId, featKey);
        selectionAssignments.set(featKey, slot.slotId);
        return true;
      }
    }
    return false;
  };

  for (const featKey of selectedKeys) assign(featKey, new Set());

  const unmatchedFeatKeys = selectedKeys.filter((featKey) => !selectionAssignments.has(featKey));
  const unfilledSlots = orderedSlots.filter((slot) => !slotAssignments.has(slot.slotId));
  return Object.freeze({
    capacity: orderedSlots.length,
    slots: Object.freeze(orderedSlots),
    assignments: Object.freeze(selectedKeys
      .filter((featKey) => selectionAssignments.has(featKey))
      .map((featKey) => Object.freeze({
        featKey,
        slotId: selectionAssignments.get(featKey),
        slot: orderedSlots.find((item) => item.slotId === selectionAssignments.get(featKey)),
      }))),
    unmatchedFeatKeys: Object.freeze(unmatchedFeatKeys),
    unfilledSlots: Object.freeze(unfilledSlots),
  });
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
