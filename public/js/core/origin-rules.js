import { sanitizeText } from "./data-sanitization.js";
import { isGameDataRecordSelectable } from "./selection-rules.js";

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return value && typeof value === "object" ? Object.freeze(value) : value;
}

export function getOriginSelectionState(gameData, builder) {
  const originKey = sanitizeText(builder?.originKey, { maxLen: 64, collapse: true });
  const options = (Array.isArray(gameData?.origins) ? gameData.origins : []).map((origin) => ({
    key: sanitizeText(origin?.originKey, { maxLen: 64, collapse: true }),
    name: sanitizeText(origin?.name, { maxLen: 160, collapse: true }) || "Origin",
    status: sanitizeText(origin?.status, { maxLen: 32, collapse: true }),
    selectable: isGameDataRecordSelectable(origin),
    summary: sanitizeText(origin?.summary, { maxLen: 4000, collapse: true }),
    description: sanitizeText(origin?.description, { maxLen: 4000, collapse: true }),
    examples: Array.isArray(origin?.examples) ? origin.examples.map(String) : [],
    questions: Array.isArray(origin?.questions) ? origin.questions.map(String) : [],
    futureUpgrades: Array.isArray(origin?.futureUpgrades) ? origin.futureUpgrades.map(String) : [],
    features: (Array.isArray(origin?.features) ? origin.features : []).map((feature) => ({
      name: sanitizeText(feature?.name, { maxLen: 160, collapse: true }) || "Feature",
      description: sanitizeText(feature?.description, { maxLen: 4000, collapse: true }),
    })),
  })).filter((origin) => origin.key);
  const selected = options.find((origin) => origin.key === originKey) || null;
  return freeze({ originKey, options, selected, valid: !originKey || Boolean(selected?.selectable) });
}
