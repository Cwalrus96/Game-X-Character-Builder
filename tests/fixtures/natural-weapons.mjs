import { traitData, traitCharacter } from "./traits.mjs";

export function naturalFixture() {
  const data = traitData(), character = traitCharacter({ traitKey: "limbs" });
  const ready = { expressionSyntaxVersion: 3, status: "playable", runtimeSupport: { status: "supported", reasons: [] } };
  character.builder.level = 4;
  const feature = data.origins[0].features[0];
  feature.grants = [
    { type: "trait", tag: "Body", choiceId: "body", skill: "Metamorphosis" },
    { type: "skill", name: "Metamorphosis", rank: 2 },
    { type: "technique", access: ["Melee Weapons", "Ranged Weapons"], weaponTag: "Natural" },
    { type: "skill-substitution", fromSkill: ["Melee Weapons", "Ranged Weapons"], toSkill: "Metamorphosis", weaponTag: "Natural" },
    { type: "skill-substitution", fromSkill: "Martial Arts", toSkill: "Metamorphosis" },
  ];
  const technique = (key, rank, skill, prerequisites = []) => ({ ...ready, techniqueKey: key, techniqueName: key, rank,
    skill, selectionRoutes: [{ type: "skill", name: skill }], prerequisites });
  data.techniques = [
    technique("heavy", 1, "Melee Weapons", [{ type: "weapon", tag: "Heavy" }]),
    technique("sharp", 1, "Melee Weapons", [{ type: "weapon", tag: "Sharp" }]),
    technique("dual", 1, "Melee Weapons", [{ type: "weapon-set", count: 2, tag: "Melee" }]),
    technique("high", 3, "Melee Weapons", [{ type: "weapon", tag: "Heavy" }]),
    technique("basic", 0, "Martial Arts"), technique("martial", 1, "Martial Arts"),
    { ...technique("web-area", 1, ""), selectionRoutes: [{ type: "weaponTag", name: "Web" }] },
    { ...technique("crush", 1, ""), selectionRoutes: [{ type: "granted" }] },
    { ...technique("shoot", 1, ""), selectionRoutes: [{ type: "granted" }] },
  ];
  data.weaponBases = [
    { ...ready, weaponKey: "limbs", name: "Crushing Limbs", minRank: 1, tags: ["Natural", "Melee", "Blunt", "Heavy"], techniqueKeys: ["crush"] },
    { ...ready, weaponKey: "webs", name: "Web Shooters", minRank: 1, tags: ["Natural", "Ranged 6", "Web"], techniqueKeys: ["shoot"] },
    { ...ready, weaponKey: "blade", name: "Blade", minRank: 1, tags: ["Sharp", "Melee"], techniqueSkills: ["Melee Weapons"], techniqueKeys: [] },
  ];
  data.traits = [
    { ...ready, traitKey: "limbs", name: "Limbs", description: "Two limbs.", rank: 1, tags: ["Body"], grants: [{ type: "weapon", key: "limbs", count: 2 }], techniqueKeys: [] },
    { ...ready, traitKey: "webs", name: "Webs", description: "Web weapon.", rank: 1, tags: ["Body"], grants: [{ type: "weapon", key: "webs" }], techniqueKeys: [] },
  ];
  const input = { gameData: data, builder: character.builder };
  const get = key => data.techniques.find(row => row.techniqueKey === key);
  return { data, character, input, get, feature };
}
