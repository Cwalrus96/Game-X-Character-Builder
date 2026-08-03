export const SUPPORTED_GRANT_TYPES = Object.freeze([
  "skill",
  "technique",
  "technique-choice",
  "feat",
  "weapon",
  "weapon-enhancement",
  "equipment",
  "specialization",
]);

export const OBSERVED_UNSUPPORTED_GRANT_TYPES = Object.freeze([
  "familiar",
  "resource",
]);

export const SUPPORTED_GRANT_FIELDS = Object.freeze([
  "name",
  "key",
  "skill",
  "progression",
  "rank",
  "count",
  "note",
  "enhancement",
  "choiceId",
  "choiceRef",
]);

export const OBSERVED_UNSUPPORTED_GRANT_FIELDS = Object.freeze([
  "classKey",
  "level",
  "tag",
  "type",
]);

export const SUPPORTED_STRUCTURED_PREREQUISITE_TYPES = Object.freeze([
  "class",
  "feat",
  "origin",
  "attribute",
  "skill",
  "tag",
  "choice",
]);

export const RUNTIME_PREREQUISITE_TYPES = Object.freeze([
  ...SUPPORTED_STRUCTURED_PREREQUISITE_TYPES,
  "text",
]);

export const OBSERVED_UNSUPPORTED_PREREQUISITE_TYPES = Object.freeze([
  "familiar",
]);

export const SUPPORTED_PREREQUISITE_FIELDS = Object.freeze([
  "name",
  "key",
  "level",
  "rank",
  "minRank",
  "value",
  "minValue",
  "choiceRef",
  "tag",
  "enhancement",
]);

export const OBSERVED_UNSUPPORTED_PREREQUISITE_FIELDS = Object.freeze([
  "classKey",
  "featKey",
  "minCount",
]);
