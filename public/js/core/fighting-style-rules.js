import { getActiveCharacterGrantSources } from "./grant-source-rules.js";
import { getCombatSkillRanks } from "./skill-rules.js";
import { getWeaponAttackKind } from "./weapon-attack-rules.js";

// These stable identities implement the reviewed ClassFeatures rules. A style's
// recommended Technique is advice, never another acquisition route.
const STYLE_KEYS = new Set([
  "sentinel-style", "paired-weapons-style", "barrage-style", "marksman-style",
  "skirmisher-style", "titan-style", "guardian-style", "smasher-style", "blademaster-style",
]);
const normalizedTag = value => String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
const hasTag = (tags, expected) => tags.some(tag => new RegExp(`^${expected}(?:-?\\+?\\d+)?$`).test(normalizedTag(tag)));

export function getActiveFightingStyles(gameData, builder, prerequisiteContext = {}) {
  // Static source eligibility must be resolved before applying its own effects.
  // The guard is propagated by prerequisite contexts, preventing recursive reads.
  return getActiveCharacterGrantSources(gameData, builder, { ...prerequisiteContext, gameData, builder, skipFightingStyleTags: true })
    .filter(source => source.entry.classKey === "weapon-master" && STYLE_KEYS.has(source.entry.featureKey))
    .map(source => ({ key: source.entry.featureKey, name: source.sourceLabel,
      sourceId: source.sourceId, description: source.entry.description || "" }));
}

export function applyFightingStyleWeaponTags(tags, activeStyles) {
  const projected = [...tags];
  if (activeStyles.some(style => style.key === "barrage-style") && hasTag(projected, "thrown") && !hasTag(projected, "returning")) projected.push("Returning");
  return projected;
}

/** Dependency evidence for style-supplied static weapon facts. Gameplay
 * conditions remain outside eligibility and never become stored weapon tags.
 */
export function getFightingStylePrerequisiteEvidence(prerequisite, gameData, builder) {
  const needsReturning = rule => rule?.type === "any" ? (rule.alternatives || []).some(needsReturning)
    : ["weapon", "weapon-set", "choice"].includes(rule?.type) && [rule.tag, rule.tagAll, rule.tagAny].flat()
      .some(tag => normalizedTag(tag) === "returning");
  if (!needsReturning(prerequisite)) return [];
  return getActiveFightingStyles(gameData, builder).filter(style => style.key === "barrage-style").map(style => style.sourceId);
}

/** Project static weapon benefits and sheet play effects. Conditions are
 * explicit player input and never change learned choices or stored weapons.
 * Supply the weapon's effective tags when enhancements alter its base tags.
 */
export function getFightingStyleProjection(gameData = {}, builder = {}, {
  weapon = null, conditions = {}, rollKind = "attack", attackKind = null, profile = null,
} = {}) {
  const activeStyles = getActiveFightingStyles(gameData, builder);
  const base = (gameData.weaponBases || []).find(row => row.weaponKey === weapon?.weaponKey);
  const effectiveWeaponTags = applyFightingStyleWeaponTags(weapon?.effectiveTags || weapon?.tags || base?.tags || [], activeStyles);
  attackKind ??= getWeaponAttackKind([profile]);
  const tagged = key => hasTag(effectiveWeaponTags, key);
  const melee = attackKind ? attackKind === "melee"
    : tagged("melee") && (!(tagged("ranged") || tagged("thrown")) || conditions.attackIsMelee === true);
  const ranged = attackKind ? ["ranged", "thrown"].includes(attackKind)
    : (tagged("ranged") || tagged("thrown")) && !melee;
  const isAttack = rollKind === "attack";
  const conditionChoices = [], reminders = [], grantedActions = [], triggeredEffects = [];
  const rollEffects = { damageBonus: 0, damageBonusOnHit: true, targetDefenseDicePenalty: 0,
    ignoreAdjacentRangedPenalty: false, rangeMultiplier: 1, defenseDiceBonus: 0 };
  const ask = (key, label, style) => {
    if (!conditionChoices.some(choice => choice.key === key)) conditionChoices.push({ key, label, styleKey: style.key, sourceId: style.sourceId });
  };
  const remind = (style, text) => reminders.push({ styleKey: style.key, sourceId: style.sourceId, text });
  const meleeChoice = style => {
    if (!attackKind && tagged("melee") && (tagged("ranged") || tagged("thrown"))) {
      ask("attackIsMelee", "This is a melee attack", style);
    }
  };
  for (const style of activeStyles) {
    switch (style.key) {
      case "sentinel-style": {
        if (!weapon || !tagged("reach")) break;
        remind(style, "Sweet-spot: a melee hit against a nonadjacent creature deals extra damage equal to twice your Melee Weapons rank.");
        if (!isAttack) break;
        meleeChoice(style);
        if (!melee) break;
        ask("targetNotAdjacent", "Target is not adjacent", style);
        if (conditions.targetNotAdjacent === true) rollEffects.damageBonus += 2 * (getCombatSkillRanks(gameData, builder).get("melee weapons") || 0);
        break;
      }
      case "paired-weapons-style":
        if (!weapon || tagged("one-handed")) remind(style, "While wielding a one-handed weapon in each hand, count one fewer adjacent enemy for flanking. The extra Rank 1 weapon is chosen in the builder.");
        break;
      case "barrage-style":
        if (weapon && tagged("thrown")) {
          remind(style, "Thrown weapons gain Returning while you wield them.");
        }
        break;
      case "marksman-style":
        if (!weapon || !tagged("ranged")) break;
        remind(style, "When you Aim, double the range of your ranged weapon attacks.");
        if (isAttack && ranged) {
          ask("aimed", "I used Aim for this ranged attack", style);
          if (conditions.aimed === true) rollEffects.rangeMultiplier = 2;
        }
        break;
      case "skirmisher-style":
        if (!weapon || !(tagged("ranged") || tagged("thrown"))) break;
        remind(style, "Ranged or thrown attacks provoke no reactions from adjacent creatures and take no adjacency penalty.");
        if (isAttack && ranged) {
          ask("targetAdjacent", "A hostile creature is adjacent", style);
          if (conditions.targetAdjacent === true) rollEffects.ignoreAdjacentRangedPenalty = true;
        }
        break;
      case "titan-style":
        if (!weapon || !tagged("heavy")) break;
        remind(style, "A critical success with a Heavy melee attack gives the target −1D Physical Defense until the end of its next turn.");
        if (!isAttack) break;
        meleeChoice(style);
        if (melee && conditions.criticalSuccess === true) triggeredEffects.push({ type: "target-defense-penalty", styleKey: style.key,
          sourceId: style.sourceId, defense: "Physical", dicePenalty: 1, duration: "Until the end of the target’s next turn" });
        break;
      case "guardian-style":
        remind(style, "After using Parry, gain +1D to all other defense rolls until the end of your next turn.");
        if (rollKind === "defense") {
          ask("afterParry", "Another defense roll after Parry, before the end of my next turn", style);
          if (conditions.afterParry === true) rollEffects.defenseDiceBonus = 1;
        }
        break;
      case "smasher-style":
        if (weapon && tagged("blunt")) grantedActions.push({ key: "smasher-style-bash", name: "Bash", styleKey: style.key, sourceId: style.sourceId,
          description: "Alternative Use — Bash: swing your weapon to knock enemies away. On a failure, push the target 1 square. On a success, push it 1 additional square for every hit exceeding its Defense.",
          outcome: { failurePush: 1, successPushBase: 1, additionalPushPerExcessHit: 1 } });
        break;
      case "blademaster-style":
        remind(style, "Bleeding enemies take −1D to defenses against your attacks.");
        if (isAttack) {
          ask("targetBleeding", "Target is bleeding", style);
          if (conditions.targetBleeding === true) rollEffects.targetDefenseDicePenalty = 1;
        }
        break;
    }
  }
  const rangeSource = String(profile?.range || "");
  // Calculate the complete supported expression. Partially replacing one number
  // inside a formula or area description would misrepresent the remaining rule.
  const simpleRange = /^(Range(?:d)?)\s+(\d+)(\s*(?:squares?)?)\.?$/i.exec(rangeSource.trim());
  const rangeCalculated = Boolean(simpleRange);
  const effectiveRange = simpleRange ? `${simpleRange[1]} ${Number(simpleRange[2]) * rollEffects.rangeMultiplier}${simpleRange[3]}`
    : rollEffects.rangeMultiplier === 1 ? rangeSource : "";
  return { activeStyles, effectiveWeaponTags, effectiveRange, rangeSource, rangeCalculated,
    conditionChoices, reminders, grantedActions, triggeredEffects, rollEffects };
}
