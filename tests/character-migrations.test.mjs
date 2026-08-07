import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateCharacter } from "../public/js/core/character-codec.js";
import {
  CHARACTER_MIGRATION_STEPS,
  CharacterMigrations,
  createCharacterMigrationReferences,
  migrateCharacterDocument,
} from "../public/js/core/character-migrations.js";
import {
  MIGRATION_GAME_DATA,
  makeUnversionedCharacter,
  makeV1Character,
  makeV3Character,
  makeV4Character,
  makeV5Character,
} from "./fixtures/character-schemas.mjs";

const references = createCharacterMigrationReferences(MIGRATION_GAME_DATA);

function hasDiagnostic(result, code, path) {
  return result.diagnostics.some((item) => item.code === code && (!path || item.path === path));
}

test("registry records only evidence-backed historical migration edges", () => {
  assert.deepEqual(
    CHARACTER_MIGRATION_STEPS.map(({ fromVersion, toVersion }) => `${fromVersion}->${toVersion}`),
    ["0->1", "1->3", "3->4", "4->5"],
  );
  assert.deepEqual(CharacterMigrations.supportedVersions, [0, 1, 3, 4, 5]);
  assert.equal(Object.isFrozen(CHARACTER_MIGRATION_STEPS), true);
});

test("every observed historical fixture reaches the exact v5 codec", () => {
  const cases = [
    [makeUnversionedCharacter(), 0, ["0->1", "1->3", "3->4", "4->5"]],
    [makeV1Character(), 1, ["1->3", "3->4", "4->5"]],
    [makeV3Character(), 3, ["3->4", "4->5"]],
    [makeV4Character(), 4, ["4->5"]],
  ];

  for (const [fixture, expectedVersion, expectedEdges] of cases) {
    const original = structuredClone(fixture);
    const result = migrateCharacterDocument(fixture, { references });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
    assert.equal(result.fromVersion, expectedVersion);
    assert.deepEqual(
      result.appliedVersions.map(({ fromVersion, toVersion }) => `${fromVersion}->${toVersion}`),
      expectedEdges,
    );
    assert.equal(result.value.schemaVersion, 5);
    assert.equal(validateCharacter(result.value).ok, true);
    assert.deepEqual(fixture, original, "migration must not mutate input");
  }
});

test("v1 base attributes restore the primary bonus and legacy selections become stable keys", () => {
  const result = migrateCharacterDocument(makeV1Character(), { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.equal(result.value.builder.attributes.agility, 2);
  assert.deepEqual(result.value.builder.selectedClassFeatureOptions, ["shadow-step"]);
  assert.deepEqual(result.value.builder.selectedFeats, ["trained-senses"]);
  assert.equal(result.value.builder.bonds[0].bondId.startsWith("legacy-bond:"), true);
  assert.equal(result.value.builder.sheet.repeatables.abilities[0].abilityId.startsWith("legacy-ability:"), true);
});

test("metadata is preserved outside canonical state", () => {
  const result = migrateCharacterDocument(makeV3Character(), { references });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(result.metadata, {
    createdAt: "created-at",
    updatedAt: "updated-at",
    lastVisitedAt: "visited-at",
  });
  assert.equal("createdAt" in result.value, false);
  assert.equal("updatedAt" in result.value, false);
  assert.equal("lastVisitedAt" in result.value.builder, false);
});

test("current v5 values remain equivalent and repeated registry migration is idempotent", () => {
  const current = makeV5Character();
  const currentWithMetadata = {
    ...structuredClone(current),
    createdAt: "created-at",
    updatedAt: "updated-at",
  };
  const first = migrateCharacterDocument(currentWithMetadata, { references });
  assert.equal(first.ok, true, JSON.stringify(first.diagnostics, null, 2));
  assert.deepEqual(first.value, current);
  assert.deepEqual(first.appliedVersions, []);

  const historical = migrateCharacterDocument(makeV4Character(), { references });
  const repeated = migrateCharacterDocument(historical.value, { references });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.value, historical.value);
  assert.deepEqual(repeated.appliedVersions, []);
});

test("schema v2, unknown unversioned envelopes, and future versions fail explicitly", () => {
  const reserved = migrateCharacterDocument({ ...makeV1Character(), schemaVersion: 2 }, { references });
  assert.equal(reserved.ok, false);
  assert.equal(hasDiagnostic(reserved, "reserved-schema-version", "character.schemaVersion"), true);

  const unknown = migrateCharacterDocument({ ownerUid: "user_123", builder: {}, sheet: {} }, { references });
  assert.equal(unknown.ok, false);
  assert.equal(hasDiagnostic(unknown, "missing-schema-version", "character.schemaVersion"), true);

  const future = migrateCharacterDocument({ ...makeV5Character(), schemaVersion: 99 }, { references });
  assert.equal(future.ok, false);
  assert.equal(hasDiagnostic(future, "unsupported-schema-version", "character.schemaVersion"), true);

  const malformedIntegerFixture = makeV4Character();
  malformedIntegerFixture.builder.level = "2oops";
  const malformedInteger = migrateCharacterDocument(malformedIntegerFixture, { references });
  assert.equal(malformedInteger.ok, false);
  assert.equal(hasDiagnostic(malformedInteger, "invalid-legacy-type", "character.builder.level"), true);
});

test("unresolved, ambiguous, and unavailable reference mappings are never guessed", () => {
  const noIndex = migrateCharacterDocument(makeV4Character());
  assert.equal(noIndex.ok, false);
  assert.equal(hasDiagnostic(noIndex, "missing-reference-index"), true);

  const missingFixture = makeV4Character();
  missingFixture.builder.selectedFeats = ["A Feat That Never Existed"];
  const missing = migrateCharacterDocument(missingFixture, { references });
  assert.equal(missing.ok, false);
  assert.equal(hasDiagnostic(missing, "unresolved-reference", "character.builder.selectedFeats[0]"), true);
  assert.equal(missing.summary.unresolved > 0, true);

  const ambiguousData = structuredClone(MIGRATION_GAME_DATA);
  ambiguousData.feats.push({ featKey: "other-senses", name: "Trained Senses", options: [], grants: [] });
  const ambiguous = migrateCharacterDocument(makeV4Character(), {
    references: createCharacterMigrationReferences(ambiguousData),
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(hasDiagnostic(ambiguous, "ambiguous-reference", "character.builder.selectedFeats[0]"), true);
});

test("stable generated identities are reproducible and collisions are rejected", () => {
  const first = migrateCharacterDocument(makeV3Character(), { references });
  const second = migrateCharacterDocument(makeV3Character(), { references });
  assert.equal(first.ok, true, JSON.stringify(first.diagnostics, null, 2));
  assert.equal(second.ok, true, JSON.stringify(second.diagnostics, null, 2));
  assert.deepEqual(first.value.builder.bonds, second.value.builder.bonds);
  assert.deepEqual(first.value.builder.sheet.repeatables.abilities, second.value.builder.sheet.repeatables.abilities);
  assert.deepEqual(first.report, second.report);

  const collisionFixture = makeV4Character();
  collisionFixture.builder.bonds = [
    { bondId: "bond:same", name: "One", rank: "1", keystone: "" },
    { bondId: "bond:same", name: "Two", rank: "2", keystone: "" },
  ];
  const collision = migrateCharacterDocument(collisionFixture, { references });
  assert.equal(collision.ok, false);
  assert.equal(hasDiagnostic(collision, "stable-id-collision", "character.builder.bonds[1].bondId"), true);
});

test("unknown nested fields and lossy legacy fields produce path-specific diagnostics", () => {
  const unknownFixture = makeV4Character();
  unknownFixture.builder.weapons[0].secretBonus = 4;
  const unknown = migrateCharacterDocument(unknownFixture, { references });
  assert.equal(unknown.ok, false);
  assert.equal(hasDiagnostic(unknown, "unknown-legacy-field", "character.builder.weapons[0].secretBonus"), true);

  const customTechniqueFixture = makeV1Character();
  customTechniqueFixture.sheet.repeatables.techniques = [{ name: "Homebrew Ambush" }];
  const customTechnique = migrateCharacterDocument(customTechniqueFixture, { references });
  assert.equal(customTechnique.ok, false);
  assert.equal(
    hasDiagnostic(customTechnique, "unresolved-legacy-field", "character.builder.sheet.repeatables.techniques"),
    true,
  );

  const portraitFixture = makeV1Character();
  portraitFixture.portraitUrl = "data:image/png;base64,AAAA";
  const portrait = migrateCharacterDocument(portraitFixture, { references });
  assert.equal(portrait.ok, false);
  assert.equal(hasDiagnostic(portrait, "unresolved-legacy-field", "character.portraitUrl"), true);
});

test("migration module is pure and imports no Firebase, DOM, file, or network dependency", async () => {
  const source = await readFile(new URL("../public/js/core/character-migrations.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /firebase|document\.|window\.|localStorage|sessionStorage|fetch\(|node:fs|node:http|node:https/i);
});
