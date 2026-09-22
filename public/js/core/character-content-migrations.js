import { canonicalSkillKey } from "./skill-identity.js";

// Reviewed identities from the frozen schema-2 release. These are historical
// aliases, never replacements inferred from similar current display names.
const CELESTIAL_KNIGHT = "celestial-knight-path-initiate";
const CELESTIAL_OPTIONS = Object.freeze([
  Object.freeze({ key: "celestial-knight-melee-weapons", aliases: Object.freeze([
    "celestial-knight-melee-weapons",
    "magical-guardian|L2|Celestial Knight Path Initiate::Melee Weapons",
  ]) }),
  Object.freeze({ key: "celestial-knight-targeting", aliases: Object.freeze([
    "celestial-knight-targeting",
    "magical-guardian|L2|Celestial Knight Path Initiate::Targeting",
    "magical-guardian|L2|Celestial Knight Path Initiate::Ranged Weapons",
  ]) }),
]);
const OLD_METAMORPH_FORMS = ["beast-form", "material-form", "elemental-form", "monstrous-mimicry"];
const OLD_METAMORPH_TECHNIQUES = [
  "swiss-army-hands", "rubber-punch", "bestial-claw-slash", "absorb-elements",
  "savage-bite", "elemental-chaos-strike", "titan-form",
];
const alias = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
const rows = (value) => Array.isArray(value) ? value : [];
const flatten = (entries) => rows(entries).flatMap((entry) => [entry, ...flatten(entry.options)]);

/** Catalog evidence for the two explicitly reviewed September 22 dispositions. */
export function createContentMigrationPolicy(gameData) {
  if (gameData.schemaVersion !== 3) return Object.freeze({});
  const feats = flatten(gameData.feats);
  const parents = feats.filter((feat) => feat.featKey === CELESTIAL_KNIGHT);
  const parent = parents.length === 1 ? parents[0] : null;
  const givesSkill = (skill) => rows(parent?.grants).some((grant) => grant.type === "skill"
    && !grant.recipientRef && canonicalSkillKey(grant.name) === skill
    && grant.rank >= 1 && grant.progression === "slow");
  const celestialKnight = parent?.type === "feature" && parent.runtimeSupport?.status !== "deferred"
    && givesSkill("melee-weapons") && givesSkill("ranged-weapons")
    && !CELESTIAL_OPTIONS.some((option) => feats.some((feat) => feat.featKey === option.key));
  const metamorph = rows(gameData.classFeatures?.metamorph);
  const metamorphRebuild = metamorph.some((feature) => feature.featureKey === "metamorphic-transformations"
    && rows(feature.grants).some((grant) => grant.type === "trait"))
    && !flatten(metamorph).some((feature) => OLD_METAMORPH_FORMS.includes(feature.featureKey));
  return Object.freeze({ celestialKnight, metamorphRebuild });
}

function resolvesTo(references, kind, value, key) {
  const matches = references?.[kind]?.[alias(value)];
  return Array.isArray(matches) && matches.length === 1 && matches[0] === key;
}

/** Content changes run inside CharacterMigrations, before v4 reference resolution.
 * The caller owns the cloned input; nothing is persisted by this operation.
 */
export function migrateReviewedCharacterContent(character, references, { report, diagnostics }) {
  const policy = references?.contentMigrations;
  const builder = character?.builder;
  if (!policy || !builder || typeof builder !== "object") return;

  if (policy.metamorphRebuild && resolvesTo(references, "classes", builder.classKey, "metamorph")) {
    const oldSelections = [
      ...rows(builder.selectedClassFeatureOptions).filter((key) => OLD_METAMORPH_FORMS.includes(key)),
      ...rows(builder.selectedTechniques).filter((key) => OLD_METAMORPH_TECHNIQUES.includes(key)),
    ];
    if (character.schemaVersion < 6 || oldSelections.length) {
      diagnostics.push(Object.freeze({
        code: "character-rebuild-required", path: "character.builder.classKey",
        message: "This character uses the retired Metamorph rules and must be rebuilt as a new character. The saved original has not been changed; no replacement Traits were selected automatically.",
        classKey: "metamorph", fromVersion: character.schemaVersion, toVersion: 6,
        retiredSelections: Object.freeze(oldSelections),
      }));
      return;
    }
  }

  if (!policy.celestialKnight || !Array.isArray(builder.selectedFeatOptions)) return;
  const matches = builder.selectedFeatOptions.flatMap((value, index) => {
    const option = CELESTIAL_OPTIONS.find((entry) => entry.aliases.some((name) => alias(name) === alias(value)));
    return option ? [{ option, value, index }] : [];
  });
  if (!matches.length) return;
  const parentSelected = rows(builder.selectedFeats).some((value) => resolvesTo(references, "feats", value, CELESTIAL_KNIGHT));
  if (!parentSelected || matches.length !== 1) {
    diagnostics.push(Object.freeze({
      code: "unresolved-retired-choice", path: "character.builder.selectedFeatOptions",
      message: "The retired Celestial Knight answer requires exactly one historical choice and its selected parent feat before it can be absorbed safely.",
      fromVersion: character.schemaVersion, toVersion: 6,
    }));
    return;
  }
  const { option, value, index } = matches[0];
  builder.selectedFeatOptions = builder.selectedFeatOptions.filter((_, i) => i !== index);
  report.push(Object.freeze({
    kind: "content-migrated", migrationId: "celestial-knight-both-skills",
    path: `character.builder.selectedFeatOptions[${index}]`,
    message: "The selected Celestial Knight feat now grants both Melee Weapons and Ranged Weapons; its former either/or answer is absorbed by that same feat.",
    from: value, retiredKey: option.key, sourceFeatKey: CELESTIAL_KNIGHT,
  }));
}
