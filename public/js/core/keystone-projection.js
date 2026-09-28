import { buildCharacterKeystoneEntries } from "./data-sanitization.js";
import { getActiveCharacterGrantSources } from "./grant-source-rules.js";
import { createPrerequisiteContext } from "./prerequisites.js";
import { getKeystoneChoices, getKeystoneAnswerState } from "./keystone-rules.js";
import { isGameDataGrantExecutable } from "./selection-rules.js";

/** One read model for every Keystone; source labels do not change its behavior. */
export function projectCharacterKeystones({ builder = {}, gameData = {} } = {}) {
  const choices = new Map();
  for (const source of getActiveCharacterGrantSources(gameData, builder, createPrerequisiteContext({ gameData, builder }))) {
    for (const [index, grant] of (source.entry.grants || []).entries()) {
      if (!isGameDataGrantExecutable(grant, { source: source.entry })) continue;
      for (const choice of getKeystoneChoices(grant, { sourceId: source.sourceId, sourceLabel: source.sourceLabel, index })) {
        if (getKeystoneAnswerState(builder.grantChoices?.[choice.choiceId], choice).valid) choices.set(choice.choiceId, choice);
      }
    }
  }
  return buildCharacterKeystoneEntries(builder)
    .filter(entry => entry.source !== "grant" || choices.has(entry.choiceId))
    .map(entry => entry.source === "grant" ? { ...entry, title: choices.get(entry.choiceId).label } : entry);
}
