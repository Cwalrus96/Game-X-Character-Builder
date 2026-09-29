import { PRIMAL_ELEMENTS } from "./element-rules.js";
import { canonicalSkillKey } from "./skill-identity.js";
import { isGameDataRecordSelectable } from "./selection-rules.js";
import { evaluatePrerequisite } from "./prerequisite-rules.js";

const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const key = value => String(value || "").toLowerCase();
const disciplines = ["Martial Arts", "Melee Weapons", "Ranged Weapons"];

export function isTraitWeaponChoice(grant) {
  return grant.type === "weapon" && Boolean(grant.choiceId)
    && Object.keys(grant).every(field => ["type", "key", "tag", "choiceId", "count"].includes(field));
}

/** Definition identity plus acquisition instance: replacing a Trait cannot reuse its answers. */
export function traitOptionIdentity(trait, localId, slot = 1) {
  const raw = `${trait.id}/${trait.traitKey}/${localId}/${slot}`;
  if (raw.length <= 260) return raw;
  // Bounded deterministic identity for unusually long authored keys. Owner and
  // definition are still independently checked; graph duplicate checks remain.
  const hash = [2166136261, 2246822519, 3266489917, 668265263].map(seed => {
    let value = seed;
    for (const ch of raw) value = Math.imul(value ^ ch.charCodeAt(0), 16777619) >>> 0;
    return value.toString(16).padStart(8, "0");
  }).join("");
  return `trait-option:${hash}`;
}

export function traitOptionSpecs(trait, gameData) {
  return (trait.grants || []).flatMap(grant => {
    let kind, label, options;
    if (grant.type === "choice" && grant.filterType === "element" && grant.choiceId) {
      kind = "element"; label = "Element";
      options = PRIMAL_ELEMENTS.map(name => ({ key: key(name), name }));
    } else if (grant.type === "choice" && grant.filterType === "skill" && grant.choiceId) {
      // Combat Training's named disciplines are a game rule, not skill training.
      const names = list(grant.name || grant.key || (trait.traitKey === "combat-training" ? disciplines : []));
      if (!names.length) return [];
      kind = "discipline"; label = "Discipline";
      options = names.map(name => ({ key: canonicalSkillKey(name), name }));
    } else if (isTraitWeaponChoice(grant)) {
      kind = "weapon"; label = "Weapon base";
      options = (gameData.weaponBases || []).filter(base => isGameDataRecordSelectable(base, { allowGrantedOnly: true })
        && Number.isInteger(base.minRank) && base.minRank <= trait.rank
        && (!grant.key || list(grant.key).includes(base.weaponKey))
        && (!grant.tag || list(grant.tag).some(tag => (base.tags || []).some(value => key(value) === key(tag)))))
        .map(base => ({ key: base.weaponKey, name: base.name }));
    } else return [];
    return Array.from({ length: grant.count || 1 }, (_, index) => ({
      choiceId: traitOptionIdentity(trait, grant.choiceId, index + 1), localId: grant.choiceId,
      traitId: trait.id, traitKey: trait.traitKey, sourceId: trait.id, parentSourceId: trait.sourceId,
      kind, label, slot: index + 1, options, grant,
    }));
  });
}

/** Pure child-choice policy, shared by UI, graph and all derived benefits. */
export function projectTraitOptions(trait, builder, gameData, peers = [], context = null) {
  const specs = traitOptionSpecs(trait, gameData);
  const discipline = specs.find(spec => spec.kind === "discipline");
  const chosenDiscipline = discipline && builder.grantChoices?.[discipline.choiceId];
  if (trait.traitKey === "combat-training" && chosenDiscipline?.sourceId === trait.id
    && chosenDiscipline.type === "trait-option" && discipline.options.some(option => option.key === chosenDiscipline.value)) {
    const skill = chosenDiscipline.value;
    specs.push({ choiceId: traitOptionIdentity(trait, `training-technique:${skill}`), localId: "training-technique",
      traitId: trait.id, traitKey: trait.traitKey, sourceId: trait.id, parentSourceId: trait.sourceId,
      kind: "technique", label: "Granted Technique", slot: 1,
      options: (gameData.techniques || []).filter(technique => isGameDataRecordSelectable(technique, { allowGrantedOnly: true })
        && Number.isInteger(technique.rank) && technique.rank <= trait.rank
        && technique.selectionRoutes?.some(route => route.type === "skill" && canonicalSkillKey(route.name) === skill)
        && (!context || (technique.prerequisites || []).every(rule => evaluatePrerequisite(rule, context).ok)))
        .map(technique => ({ key: technique.techniqueKey, name: technique.techniqueName || technique.name })),
    });
  }
  return specs.map(spec => {
    const answer = builder.grantChoices?.[spec.choiceId];
    const ownerValid = !answer || answer.sourceId === trait.id;
    const validValue = answer?.type === "trait-option" && spec.options.some(option => option.key === answer.value);
    const used = new Set();
    if (trait.repeatable && spec.kind !== "technique") for (const peer of peers) {
      if (peer.id === trait.id || peer.traitKey !== trait.traitKey || peer.recipientId !== trait.recipientId) continue;
      for (const other of traitOptionSpecs(peer, gameData).filter(other => other.kind === spec.kind && other.slot === spec.slot)) {
        const saved = builder.grantChoices?.[other.choiceId];
        if (saved?.sourceId === peer.id && saved.type === "trait-option" && other.options.some(option => option.key === saved.value)) used.add(saved.value);
      }
    }
    const duplicate = validValue && used.has(answer.value);
    const reason = !ownerValid ? "This option belongs to a different Trait instance."
      : duplicate ? `${trait.name} must choose a different ${spec.label.toLowerCase()} each time.`
        : answer && !validValue ? `The selected ${spec.label.toLowerCase()} is no longer available.` : "";
    return { ...spec, value: answer?.value || "", selectedName: spec.options.find(option => option.key === answer?.value)?.name || "",
      answered: Boolean(answer), valid: Boolean(answer && ownerValid && validValue && !duplicate),
      ownerValid, duplicate, reason,
      options: spec.options.map(option => ({ ...option, eligible: !used.has(option.key), reason: used.has(option.key) ? "Already chosen for this Trait." : "" })) };
  });
}

export function createTraitOptionAnswer(choice, value) {
  return { choiceId: choice.choiceId, type: "trait-option", sourceId: choice.traitId,
    sourceLabel: choice.label, value, techniqueKey: "", skillKey: "", weaponKey: "",
    rank: 0, customName: "", enhancements: [], tags: [] };
}

export function traitOptionLabel(trait) {
  const names = (trait.optionChoices || []).filter(choice => choice.valid && choice.kind !== "technique").map(choice => choice.selectedName);
  return names.length ? `${trait.name} (${names.join(", ")})` : trait.name;
}

/** Explicit provider-context benefit; unrelated associated links remain paid routes. */
export function traitGrantsTechnique(trait, technique) {
  return (technique?.selectionRoutes || []).some(route => route.type === "granted")
    || (!technique?.selectionRoutes?.length && technique?.selectionMode === "granted-only")
    || (trait.traitKey === "mech-elemental-blaster" && technique?.techniqueKey === "elemental-blast");
}

/** Trait access supplies a rank/skill context, never extra skill training. */
export function traitTechniqueContexts(technique, { selectedTraits = [], weapons = [], gameData = {} } = {}) {
  const routes = (technique.selectionRoutes || []).filter(route => route.type === "skill");
  const results = [];
  for (const trait of selectedTraits.filter(trait => trait.active && trait.optionsComplete !== false)) {
    const options = (trait.optionChoices || []).filter(choice => choice.valid);
    for (const route of routes) {
      const discipline = options.find(choice => choice.kind === "discipline" && choice.value === canonicalSkillKey(route.name));
      const element = options.find(choice => choice.kind === "element");
      const elementalTags = (technique.tags || []).filter(tag => PRIMAL_ELEMENTS.some(name => key(name) === key(tag)));
      const elementalAccess = trait.traitKey === "mech-elemental-blaster" && trait.rank >= 2 && element
        && canonicalSkillKey(route.name) === "elementalism" && (!elementalTags.length || elementalTags.some(tag => key(tag) === element.value));
      const traitWeapons = trait.traitKey === "integrated-weapon" ? weapons.filter(weapon => weapon.traitId === trait.id
        && (gameData.weaponBases || []).find(base => base.weaponKey === weapon.weaponKey)?.techniqueSkills?.some(name => canonicalSkillKey(name) === canonicalSkillKey(route.name))) : [];
      if (!discipline && !elementalAccess && !traitWeapons.length) continue;
      results.push({ skillName: trait.associatedSkill || route.name, rank: trait.rank, sourceLabel: traitOptionLabel(trait),
        weapons: traitWeapons.length ? traitWeapons : weapons, weaponIds: traitWeapons.map(weapon => weapon.id),
        evidence: [trait.id, ...options.map(choice => `grant-answer:${choice.choiceId}`), ...traitWeapons.map(weapon => weapon.id)] });
    }
  }
  return results;
}
