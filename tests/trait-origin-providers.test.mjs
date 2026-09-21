import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import { parseGrantExpressions } from "../public/js/core/game-data-expressions.js";
import { compileCharacterGraph } from "../public/js/core/graph-compiler.js";
import { projectCharacterTraits } from "../public/js/core/trait-rules.js";

// Proposal fixtures, not a copy of or assertion about the current canonical Sheet.
// These literal grants match the eight Origin cells proposed in
// docs/trait-source-proposals-2026-09-21.md. Minimal runtime containers deliberately
// omit unrelated Origin mechanics and need no fetched/ignored source files.
const PROPOSED_ORIGIN_GRANTS = [
  ["spiritual-bloodline", "eyes-of-legend", "Eyes of Legend", "trait | traitKey=spirit-sight"],
  ["mutation", "amphibious-form", "Amphibious Form", "trait | traitKey=amphibious"],
  ["mutation", "wall-crawler", "Wall Crawler", "trait | traitKey=climber | rank=2"],
  ["mutation", "camouflage", "Camouflage", "trait | traitKey=natural-camouflage"],
  ["getaba", "keen-senses", "Keen Senses", "trait | traitKey=keen-smell"],
  ["slimefolk", "slime-physiology", "Slime Physiology", "trait | traitKey=inorganic-nature"],
  ["slimefolk", "slippery-ooze", "Slippery Ooze", "trait | traitKey=liquid-form\ntrait | traitKey=slippery"],
  ["slimefolk", "slimy-storage", "Slimy Storage", "trait | traitKey=dissolved-storage"],
];

function proposalFixture(originKey) {
  const ready = { expressionSyntaxVersion: 3, runtimeSupport: { status: "supported", reasons: [] } };
  const features = PROPOSED_ORIGIN_GRANTS.filter(([owner]) => owner === originKey).map(([, featureKey, name, raw]) => {
    const parsed = parseGrantExpressions(raw, { syntaxVersion: 3 });
    assert.equal(parsed.ok, true, `${featureKey}: ${JSON.stringify(parsed.diagnostics)}`);
    return { ...ready, type: "feature", originKey, featureKey, name, level: 1, description: `Proposal fixture for ${name}.`,
      grants: parsed.values, traitKeys: parsed.values.map((grant) => grant.key), prerequisites: [] };
  });
  const names = {
    "spirit-sight": "Spirit Sight", amphibious: "Amphibious", climber: "Climber", "natural-camouflage": "Natural Camouflage",
    "keen-smell": "Keen Smell", "inorganic-nature": "Inorganic Nature", "liquid-form": "Liquid Form", slippery: "Slippery", "dissolved-storage": "Dissolved Storage",
  };
  const traits = Object.entries(names).map(([traitKey, name]) => ({ ...ready, traitKey, name, rank: 1,
    description: `Trait fixture for ${name}.`, tags: ["Fixture classification"], techniqueKeys: [],
    grants: traitKey === "liquid-form" ? [{ type: "tag", tag: "Liquid", minRank: 1 }] : [],
    prerequisites: traitKey === "dissolved-storage" ? [{ type: "trait", key: "liquid-form" }] : [],
  }));
  const gameData = {
    schemaVersion: 3, sourceSchemaVersion: 5, expressionSyntaxVersion: 3,
    classes: [], classFeatures: {}, classSkills: [], feats: [], techniques: [], weaponBases: [], weaponEnhancements: [], traits,
    origins: [{ ...ready, originKey, name: originKey, description: "Origin proposal fixture", status: "playable", selectable: true, features }],
  };
  const character = createDefaultCharacter({ ownerUid: "origin_trait_proposal_test" });
  character.builder.originKey = originKey;
  return { character, gameData, project: () => projectCharacterTraits(character, gameData) };
}

test("fixed Origin grants default to Rank 1 without authored recipient or gameplay state", () => {
  const fixture = proposalFixture("getaba"), result = fixture.project();
  assert.equal(result.providers[0].skill, "");
  assert.deepEqual(result.traits.map(({ traitKey, rank, sourceId }) => ({ traitKey, rank, sourceId })), [
    { traitKey: "keen-smell", rank: 1, sourceId: "origin-feature:getaba:keen-senses" },
  ]);
  assert.deepEqual(result.choices, []);
  assert.deepEqual(result.tags, [], "classification does not become an acquired tag");
  assert.deepEqual(fixture.character.builder.traitChoices, {});
  assert.deepEqual(fixture.character.builder.traitActivations, {});
});

test("Mutation grants retain fixed ranks without enforcing moment-to-moment form selection", () => {
  const fixture = proposalFixture("mutation"), result = fixture.project();
  assert.deepEqual(result.traits.map(({ traitKey, rank }) => ({ traitKey, rank })).sort((a,b) => a.traitKey.localeCompare(b.traitKey)), [
    { traitKey: "amphibious", rank: 1 }, { traitKey: "climber", rank: 2 }, { traitKey: "natural-camouflage", rank: 1 },
  ]);
  assert.equal(result.activations, undefined);
  assert.deepEqual(result.issues, []);
});

test("Slimefolk retains four Traits across three owners and checks static prerequisites", () => {
  const fixture = proposalFixture("slimefolk"), result = fixture.project();
  assert.equal(result.traits.length, 4);
  assert(result.traits.every(item => item.rank === 1));
  assert.equal(new Set(result.traits.map(item => item.sourceId)).size, 3);
  assert.deepEqual(result.tags, ["Liquid"]);
  const ooze = fixture.gameData.origins[0].features.find(item => item.featureKey === "slippery-ooze");
  ooze.grants = ooze.grants.filter(grant => grant.key !== "liquid-form");
  ooze.traitKeys = ["slippery"];
  const missing = fixture.project();
  assert.equal(missing.traits.some(item => item.traitKey === "dissolved-storage"), false);
  assert(missing.issues.some(item => item.message.includes("prerequisites")));
});

test("Eyes of Legend keeps gameplay conditions in its description without requiring a toggle", () => {
  const fixture = proposalFixture("spiritual-bloodline");
  fixture.gameData.origins[0].features[0].description = "Spend 1 Energy; range 12 squares; until the end of the current turn.";
  const result = fixture.project();
  assert.equal(result.traits[0].traitKey, "spirit-sight");
  assert.equal(result.traits[0].rank, 1);
  assert.equal(result.traits[0].sourceDescription, fixture.gameData.origins[0].features[0].description);
  assert.equal(result.activations, undefined);
});

test("all eight proposed Origin providers keep graph ownership stable when labels change and features reorder", () => {
  for (const originKey of ["getaba", "mutation", "slimefolk", "spiritual-bloodline"]) {
    const fixture = proposalFixture(originKey);
    const identity = (graph) => {
      const nodes = graph.nodes.filter((item) => ["origin-feature", "trait"].includes(item.type));
      const ids = new Set(nodes.map((item) => item.id));
      return {
        nodes: nodes.map(({ id, key, sourceOwnerId }) => ({ id, key, sourceOwnerId })).sort((a, b) => a.id.localeCompare(b.id)),
        edges: graph.edges.filter((edge) => ids.has(edge.to)).map(({ kind, from, to }) => `${kind}|${from}|${to}`).sort(),
      };
    };
    const initial = compileCharacterGraph({ character: fixture.character, gameData: fixture.gameData });
    assert.equal(initial.nodes.filter((node) => node.type === "trait").length, { getaba: 1, mutation: 3, slimefolk: 4, "spiritual-bloodline": 1 }[originKey]);
    for (const feature of fixture.gameData.origins[0].features) {
      assert(initial.nodes.some((node) => node.id === `origin-feature:${originKey}:${feature.featureKey}`), feature.featureKey);
    }
    for (const trait of initial.nodes.filter((node) => node.type === "trait")) {
      assert(initial.edges.some((edge) => edge.kind === "materializes" && edge.from === trait.sourceOwnerId && edge.to === trait.id), trait.id);
    }
    fixture.gameData.origins[0].features.reverse().forEach((feature) => { feature.name += " renamed"; });
    const changed = compileCharacterGraph({ character: fixture.character, gameData: fixture.gameData });
    assert.deepEqual(identity(changed), identity(initial), originKey);
  }
});
