import { createDefaultCharacter } from "../../public/js/core/character-codec.js";

export function contentMigrationGameData() {
  return {
    schemaVersion: 3,
    classes: [{ classKey: "magical-guardian", name: "Magical Guardian" }, { classKey: "metamorph", name: "Metamorph" }],
    feats: [{
      type: "feature", featKey: "celestial-knight-path-initiate", name: "Celestial Knight Path Initiate",
      grants: [
        { type: "skill", name: "Melee Weapons", rank: 1, progression: "slow" },
        { type: "skill", name: "Ranged Weapons", rank: 1, progression: "slow" },
      ],
      prerequisites: [{ type: "class", key: "magical-guardian", level: 2 }],
    }],
    classFeatures: { metamorph: [{
      type: "feature", featureKey: "metamorphic-transformations",
      grants: [{ type: "trait", tag: "Body", skill: "Metamorphosis", count: 1 }],
    }] },
  };
}

export function historicalCelestialKnight(version = 4, choice = "Melee Weapons") {
  const character = createDefaultCharacter({ ownerUid: "migration-review-user" });
  character.schemaVersion = version;
  character.builder.classKey = "magical-guardian";
  character.builder.level = 5;
  character.builder.selectedFeats = ["celestial-knight-path-initiate"];
  character.builder.selectedFeatOptions = [version < 5
    ? `magical-guardian|L2|Celestial Knight Path Initiate::${choice}`
    : choice === "Melee Weapons" ? "celestial-knight-melee-weapons" : "celestial-knight-targeting"];
  character.builder.sheet.fields.notes = "Player notes survive.";
  if (version < 6) {
    delete character.builder.traitChoices;
    delete character.builder.traitActivations;
  }
  return character;
}
