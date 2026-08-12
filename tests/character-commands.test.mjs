import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import {
  CharacterCommandError,
  AddWeapon,
  AddWeaponEnhancement,
  RemoveWeapon,
  RemoveWeaponEnhancement,
  SetClass,
  SetClassFeatureOptions,
  SetFeatOptions,
  SetFeatSelection,
  SetGrantChoices,
  SetLevel,
  SetPrimaryAttribute,
  SetAttributeValue,
  SetOrigin,
  SetOriginKeystone,
  SetClassUtilitySkills,
  SetSkillRank,
  SetCombatSkills,
  SetSettingSkills,
  SetTechniqueSelection,
  UpdateWeapon,
  UpdateWeaponEnhancement,
  VisitBuilderStep,
  applyCharacterCommand,
  decodeCharacterCommand,
} from "../public/js/core/character-commands.js";

function manualWeapon() {
  return {
    id: "weapon:test",
    choiceId: "",
    sourceChoiceId: "",
    generated: false,
    weaponKey: "longsword",
    rank: 1,
    customName: "",
    enhancements: [],
  };
}

function manualEnhancement() {
  return {
    id: "enhancement:test",
    enhancementKey: "keen",
    rank: 1,
    selections: {},
    granted: false,
  };
}

test("SetClass expresses only direct class intent", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.primaryAttribute = "agility";
  character.builder.attributes.agility = 1;
  const original = structuredClone(character);

  const command = SetClass("ninja");
  const result = applyCharacterCommand(character, command);
  assert.deepEqual(command, { type: "SetClass", classKey: "ninja" });
  assert.equal(result.builder.classKey, "ninja");
  assert.equal(result.builder.primaryAttribute, "agility");
  assert.deepEqual(character, original);
  assert.equal(SetClass("").classKey, "");
});

test("SetTechniqueSelection preserves order and replaces only the selection", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.classKey = "ninja";
  const result = applyCharacterCommand(
    character,
    SetTechniqueSelection(["shadow-step", "stalk-prey"]),
  );
  assert.deepEqual(result.builder.selectedTechniques, ["shadow-step", "stalk-prey"]);
  assert.equal(result.builder.classKey, "ninja");
});

test("class slice commands replace only their exact stable-key field", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  character.builder.attributes.agility = 1;
  const leveled = applyCharacterCommand(character, SetLevel(4));
  const primary = applyCharacterCommand(leveled, SetPrimaryAttribute("agility"));
  const classOptions = applyCharacterCommand(primary, SetClassFeatureOptions(["moon-path"]));
  const feats = applyCharacterCommand(classOptions, SetFeatSelection(["shadow-adept"]));
  const featOptions = applyCharacterCommand(feats, SetFeatOptions(["moon-initiate-shroud"]));

  assert.equal(featOptions.builder.level, 4);
  assert.equal(featOptions.builder.primaryAttribute, "agility");
  assert.deepEqual(featOptions.builder.selectedClassFeatureOptions, ["moon-path"]);
  assert.deepEqual(featOptions.builder.selectedFeats, ["shadow-adept"]);
  assert.deepEqual(featOptions.builder.selectedFeatOptions, ["moon-initiate-shroud"]);
  assert.equal(character.builder.level, 1);
  assert.equal(character.builder.primaryAttribute, "");
  assert.deepEqual(character.builder.selectedFeats, []);
});

test("SetAttributeValue changes one exact attribute without mutating its input", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const original = structuredClone(character);
  const command = SetAttributeValue("heart", 3);
  const result = applyCharacterCommand(character, command);
  assert.deepEqual(command, { type: "SetAttributeValue", attributeKey: "heart", value: 3 });
  assert.equal(result.builder.attributes.heart, 3);
  assert.equal(result.builder.attributes.strength, 0);
  assert.deepEqual(character, original);
});

test("Origin and Skills commands replace only their exact domain fields", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const origin = applyCharacterCommand(character, SetOrigin("artifact"));
  const keystone = applyCharacterCommand(origin, SetOriginKeystone("I remember the old world."));
  const utility = applyCharacterCommand(keystone, SetClassUtilitySkills(["athletics", "nature"]));
  const fixed = applyCharacterCommand(utility, SetSkillRank("rank_society", "2"));
  const combat = applyCharacterCommand(fixed, SetCombatSkills([{ skill: "Swordplay", rank: "1" }]));
  const setting = applyCharacterCommand(combat, SetSettingSkills([{ skill: "Cosmology", rank: "0" }]));
  assert.equal(setting.builder.originKey, "artifact");
  assert.equal(setting.builder.originKeystone, "I remember the old world.");
  assert.deepEqual(setting.builder.selectedClassUtilitySkills, ["athletics", "nature"]);
  assert.equal(setting.builder.sheet.fields.rank_society, "2");
  assert.deepEqual(setting.builder.sheet.repeatables.combatSkillsExtra, [{ skill: "Swordplay", rank: "1" }]);
  assert.deepEqual(setting.builder.sheet.repeatables.settingSkills, [{ skill: "Cosmology", rank: "0" }]);
  assert.equal(character.builder.originKey, "");
});

test("commands reject malformed keys, duplicates, unknown fields, and unknown types", () => {
  assert.throws(() => SetClass("Ninja Class"), CharacterCommandError);
  assert.throws(() => SetLevel(13), CharacterCommandError);
  assert.throws(() => SetPrimaryAttribute("luck"), CharacterCommandError);
  assert.throws(() => SetAttributeValue("luck", 1), CharacterCommandError);
  assert.throws(() => SetAttributeValue("heart", 1.5), CharacterCommandError);
  assert.throws(() => SetAttributeValue("heart", 11), CharacterCommandError);
  assert.throws(() => SetOrigin("Artifact Origin"), CharacterCommandError);
  assert.throws(() => SetOriginKeystone("  not canonical  "), CharacterCommandError);
  assert.throws(() => SetClassUtilitySkills(["nature", "nature"]), CharacterCommandError);
  assert.throws(() => SetSkillRank("rank_physdef", "1"), CharacterCommandError);
  assert.throws(() => SetSkillRank("rank_nature", 1), CharacterCommandError);
  assert.throws(() => applyCharacterCommand(createDefaultCharacter({ ownerUid: "user_123" }), SetCombatSkills([{ skill: "", rank: "1" }])), (error) => error?.name === "CharacterCodecError");
  assert.throws(() => SetFeatSelection(["shadow-adept", "shadow-adept"]), CharacterCommandError);
  assert.throws(
    () => SetTechniqueSelection(["shadow-step", "shadow-step"]),
    (error) => error.diagnostics.some((item) => item.code === "duplicate-identity"),
  );
  assert.throws(
    () => SetTechniqueSelection(["Shadow Step"]),
    (error) => error.diagnostics.some((item) => item.code === "invalid-stable-key"),
  );
  assert.throws(
    () => decodeCharacterCommand({ type: "SetClass", classKey: "ninja", surprise: true }),
    (error) => error.diagnostics.some((item) => item.path === "command.surprise"),
  );
  assert.throws(
    () => decodeCharacterCommand({ type: "SetAttributeValue", attributeKey: "heart", value: 1, extra: true }),
    (error) => error.diagnostics.some((item) => item.path === "command.extra"),
  );
  assert.throws(
    () => decodeCharacterCommand({ type: "DeleteCharacter" }),
    (error) => error.code === "unknown-character-command",
  );
});

test("grant-choice command delegates whole-record validation to the canonical codec", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const choices = {
    "choice:technique": {
      choiceId: "choice:technique",
      type: "technique",
      sourceId: "feat-selection:shadow-adept",
      sourceLabel: "Shadow Adept",
      value: "",
      techniqueKey: "shadow-step",
      skillKey: "",
      weaponKey: "",
      rank: 0,
      customName: "",
      enhancements: [],
      tags: [],
    },
  };
  const command = SetGrantChoices(choices);
  choices["choice:technique"].techniqueKey = "mutated-outside";
  const result = applyCharacterCommand(character, command);
  assert.equal(result.builder.grantChoices["choice:technique"].techniqueKey, "shadow-step");
  assert.throws(
    () => applyCharacterCommand(character, SetGrantChoices({ bad: { type: "technique" } })),
    (error) => error?.name === "CharacterCodecError" && Array.isArray(error?.diagnostics),
  );
});

test("VisitBuilderStep records canonical navigation state without duplicates", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const first = applyCharacterCommand(character, VisitBuilderStep("class"));
  const second = applyCharacterCommand(first, VisitBuilderStep("class"));
  assert.deepEqual(second.builder.visitedSteps, ["class"]);
  assert.throws(() => VisitBuilderStep("unknown-step"), CharacterCommandError);
});

test("equipment commands target stable identities and change only editable fields", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  const added = applyCharacterCommand(character, AddWeapon(manualWeapon()));
  const renamed = applyCharacterCommand(added, UpdateWeapon("weapon:test", { customName: "Oathblade", rank: 2 }));
  const enhanced = applyCharacterCommand(renamed, AddWeaponEnhancement("weapon:test", manualEnhancement()));
  const configured = applyCharacterCommand(enhanced, UpdateWeaponEnhancement(
    "weapon:test",
    "enhancement:test",
    { selections: { element: "Fire" } },
  ));

  assert.equal(configured.builder.weapons[0].customName, "Oathblade");
  assert.equal(configured.builder.weapons[0].rank, 2);
  assert.deepEqual(configured.builder.weapons[0].enhancements[0].selections, { element: "Fire" });
  assert.deepEqual(character.builder.weapons, []);

  const withoutEnhancement = applyCharacterCommand(
    configured,
    RemoveWeaponEnhancement("weapon:test", "enhancement:test"),
  );
  const removed = applyCharacterCommand(withoutEnhancement, RemoveWeapon("weapon:test"));
  assert.deepEqual(removed.builder.weapons, []);
});

test("equipment commands reject broad patches, stale identities, and malformed records", () => {
  const character = createDefaultCharacter({ ownerUid: "user_123" });
  assert.throws(() => UpdateWeapon("weapon:test", { generated: true }), CharacterCommandError);
  assert.throws(() => UpdateWeaponEnhancement("weapon:test", "enhancement:test", {}), CharacterCommandError);
  assert.throws(
    () => applyCharacterCommand(character, RemoveWeapon("weapon:missing")),
    (error) => error.code === "stale-character-command",
  );
  assert.throws(
    () => applyCharacterCommand(character, AddWeapon({ id: "weapon:bad" })),
    (error) => error?.name === "CharacterCodecError",
  );
});
