/** Catalogue-generated aliases are exact old-ID + owner -> new-ID bindings.
 * Runs on CharacterMigrations' private clone; never writes or chooses new answers.
 */
export function migrateSourceChoiceBindings(character, aliases, { report, diagnostics }) {
  if (!Array.isArray(aliases) || !aliases.length) return;
  const builder = character?.builder;
  const answers = builder?.grantChoices;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return;
  const fail = (key, message) => diagnostics.push(Object.freeze({
    code: "ambiguous-choice-owner", path: `character.builder.grantChoices.${key}`, message,
  }));
  const renamed = new Map();
  for (const [key, answer] of Object.entries(answers)) {
    const candidates = aliases.filter(alias => alias.from === key);
    if (!candidates.length) continue;
    const owned = candidates.filter(alias => alias.sourceId === answer?.sourceId);
    if (owned.length !== 1 || answer.choiceId !== key) {
      fail(key, "The saved choice must match exactly one catalogue binding and its recorded source. No answer was guessed.");
      continue;
    }
    const target = owned[0].to;
    if (Object.hasOwn(answers, target)) {
      fail(key, "Both the old and source-qualified choice are saved. Resolve the conflict before saving; neither answer was overwritten.");
      continue;
    }
    answers[target] = { ...answer, choiceId: target };
    delete answers[key];
    renamed.set(key, target);
    report.push(Object.freeze({ kind: "content-migrated", migrationId: "source-owned-choice-id",
      path: `character.builder.grantChoices.${key}`, from: key, to: target, sourceId: answer.sourceId,
      message: "Preserved the existing choice under its source-qualified identity." }));
  }
  // Earlier shape migrations may already have renamed an answer through the same
  // alias table. Prove its owner before rebinding a materialized weapon reference.
  for (const alias of aliases) {
    if (answers[alias.to]?.sourceId !== alias.sourceId) continue;
    const matches = aliases.filter(item => item.from === alias.from && answers[item.to]?.sourceId === item.sourceId);
    if (matches.length === 1) renamed.set(alias.from, alias.to);
  }
  for (const weapon of Array.isArray(builder.weapons) ? builder.weapons : []) {
    if (!weapon.generated && !weapon.sourceChoiceId) continue;
    for (const field of ["choiceId", "sourceChoiceId"]) {
      const old = weapon[field];
      if (renamed.has(old)) {
        weapon[field] = renamed.get(old);
        report.push(Object.freeze({ kind: "content-migrated", migrationId: "source-owned-choice-id",
          path: `character.builder.weapons.${weapon.id}.${field}`, from: old, to: weapon[field],
          message: "Retained the generated weapon and rebound its choice owner." }));
      } else if (aliases.some(alias => alias.from === old)) {
        fail(old, "A generated weapon's old choice reference has no unambiguous saved owner.");
      }
    }
  }
}
