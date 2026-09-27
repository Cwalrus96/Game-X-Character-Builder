import { SetGrantChoices } from "../../core/character-commands.js";
import { buildKeystoneAnswer, getKeystoneChoices } from "../../core/keystone-rules.js";
import { isGameDataGrantExecutable } from "../../core/selection-rules.js";
import { KeystoneWidget } from "./text-choice-widget.js";

export class KeystoneChoiceWidget extends KeystoneWidget {
  constructor(page, { choice, scope = "dynamic", onAccepted, documentRef = globalThis.document } = {}) {
    super(page, { id: `keystone-choice:${choice.choiceId}`, label: choice.label, scope, onAccepted, documentRef,
      getValue: () => page.getCharacter().builder.grantChoices[choice.choiceId]?.value || "",
      onChange: value => {
        const choices = { ...page.getCharacter().builder.grantChoices };
        if (value) choices[choice.choiceId] = buildKeystoneAnswer(choice, value);
        else delete choices[choice.choiceId];
        return page.requestCharacterCommand(this, SetGrantChoices(choices));
      },
    });
    this.choice = choice;
  }
}

export function createKeystoneGrantWidgets(page, { entry, sourceId, scope, onAccepted, documentRef } = {}) {
  return (entry?.grants || []).flatMap((grant, index) => {
    if (!isGameDataGrantExecutable(grant, { source: entry })) return [];
    return getKeystoneChoices(grant, { sourceId, index, sourceLabel: entry.name || "Keystone" })
      .map((choice) => new KeystoneChoiceWidget(page, { choice, scope, onAccepted, documentRef }));
  });
}

export function registerKeystoneWidgetExtension(registry, { documentRef = globalThis.document } = {}) {
  const previous = registry.get("choice");
  registry.remove("choice");
  registry.register("choice", (context) => {
    const { page, grant, entry, sourceId, index, scope, onChange } = context;
    const choices = getKeystoneChoices(grant, { sourceId, index, sourceLabel: entry.name || "Keystone" });
    if (!choices.length) return previous?.(context) || null;
    if (!isGameDataGrantExecutable(grant, { source: entry })) return [];
    return choices.map((choice) => new KeystoneChoiceWidget(page, { choice, scope, onAccepted: onChange, documentRef }));
  });
  return registry;
}
