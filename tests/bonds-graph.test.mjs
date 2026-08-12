import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultCharacter } from "../public/js/core/character-codec.js";
import {
  AddBond,
  RemoveBond,
  SetBackgroundKeystones,
  SetLevel,
  UpdateBond,
  applyCharacterCommand,
} from "../public/js/core/character-commands.js";
import { getBondAllocationState, fitBondsToRules } from "../public/js/core/bond-rules.js";
import { CharacterSession } from "../public/js/core/character-session.js";
import { GraphCompiler } from "../public/js/core/graph-compiler.js";
import { createCharacterSessionGraphReconciler, reconcileCharacterGraph } from "../public/js/core/graph-reconciler.js";

const GAME_DATA = Object.freeze({
  schemaVersion: 2,
  classes: Object.freeze([]),
  classSkills: Object.freeze([]),
  classFeatures: Object.freeze({}),
  origins: Object.freeze([{
    originKey: "artifact",
    name: "Artifact",
    status: "playable",
    selectable: true,
    grants: [],
    features: [{
      featureKey: "bonded-relic",
      name: "Bonded Relic",
      description: "The relic has a will of its own.",
      level: 1,
      prerequisites: [],
      grants: [{ type: "bond", choiceId: "artifact", rank: 2, count: 1 }],
    }],
  }]),
  feats: Object.freeze([]),
  techniques: Object.freeze([]),
  weaponBases: Object.freeze([]),
  weaponEnhancements: Object.freeze([]),
});

function character() {
  const value = createDefaultCharacter({ ownerUid: "bond_user" });
  value.builder.level = 3;
  value.builder.attributes.heart = 1;
  value.builder.originKey = "artifact";
  value.builder.originKeystone = "I carry a forgotten age.";
  return value;
}

test("Bond Rules keep source grants outside Heart capacity and fit user bonds deterministically", () => {
  const builder = character().builder;
  builder.bonds = [
    { bondId: "bond:user:one", name: "Ally", rank: "3", keystone: "We always answer the call." },
    { bondId: "bond:user:two", name: "Mentor", rank: "2", keystone: "Their lessons still guide me." },
    { bondId: "grant-bond:origin:artifact:artifact:0", name: "Artifact", rank: "2", keystone: "It demands the truth." },
  ];
  const specs = [{ bondId: "grant-bond:origin:artifact:artifact:0", rank: 2 }];
  const allocation = getBondAllocationState(builder, { sourceBondSpecs: specs });
  assert.equal(allocation.userBondCapacity, 1);
  assert.equal(allocation.sourceBondCount, 1);
  assert.equal(allocation.bonds[1].withinCapacity, false);
  const fitted = fitBondsToRules(builder, { sourceBondSpecs: specs });
  assert.deepEqual(fitted.bonds.map((bond) => bond.bondId), ["bond:user:one", "grant-bond:origin:artifact:artifact:0"]);
  assert.equal(fitted.bonds[0].rank, "2");
  assert.deepEqual(builder.bonds.map((bond) => bond.rank), ["3", "2", "2"]);
});

test("Bond commands target stable records and cannot directly remove source-owned bonds", () => {
  let value = character();
  value = applyCharacterCommand(value, AddBond({ bondId: "bond:user:ally", name: "Ally", rank: "1", keystone: "" }));
  value = applyCharacterCommand(value, UpdateBond("bond:user:ally", { keystone: "We never leave each other behind." }));
  value = applyCharacterCommand(value, SetBackgroundKeystones(["The road remembers."]));
  assert.equal(value.builder.bonds[0].keystone, "We never leave each other behind.");
  assert.deepEqual(value.builder.backgroundKeystones, ["The road remembers."]);
  value = applyCharacterCommand(value, RemoveBond("bond:user:ally"));
  assert.deepEqual(value.builder.bonds, []);
  assert.throws(() => RemoveBond("grant-bond:origin:artifact:artifact:0"), /user-owned/i);
  assert.throws(() => UpdateBond("grant-bond:origin:artifact:artifact:0", { rank: "3" }), /granting source/i);
});

test("graph materializes source-owned bonds with stable ownership and keeps them outside user capacity", () => {
  const value = character();
  value.builder.bonds = [{ bondId: "bond:user:ally", name: "Ally", rank: "1", keystone: "We stand together." }];
  const result = reconcileCharacterGraph({ character: value, previousCharacter: value, gameData: GAME_DATA });
  assert.equal(result.ok, true, JSON.stringify(result.impacts));
  assert.equal(result.character.builder.bonds.length, 2);
  const granted = result.character.builder.bonds.find((bond) => bond.bondId.startsWith("grant-bond:"));
  assert.equal(granted.name, "Artifact");
  assert.equal(granted.rank, "2");
  const graph = new GraphCompiler({ gameData: GAME_DATA }).compile(result.character);
  const node = graph.nodes.find((item) => item.id === `bond:${granted.bondId}`);
  assert.equal(node.sourceOwnerId, "origin-feature:artifact:0:bonded-relic");
  assert.equal(node.storageBinding.key, granted.bondId);
  assert.equal(graph.metadata.userBondUsage, 1);
  assert.equal(graph.metadata.sourceBondCount, 1);
  assert.ok(result.character.builder.autoAbilityNames.includes("Origin Feature - Bonded Relic"));
});

test("removing a granting source reviews the source-owned Bond and derived ability together", () => {
  const initial = reconcileCharacterGraph({ character: character(), gameData: GAME_DATA }).character;
  const changed = structuredClone(initial);
  changed.builder.originKey = "";
  const result = reconcileCharacterGraph({ character: changed, previousCharacter: initial, gameData: GAME_DATA });
  assert.equal(result.ok, true);
  assert.equal(result.character.builder.bonds.some((bond) => bond.bondId.startsWith("grant-bond:")), false);
  assert.ok(result.impacts.some((impact) => impact.code === "source-owned-bond-removed"));
  assert.ok(result.impacts.some((impact) => impact.code === "source-owned-ability-removed"));
  assert.deepEqual(reconcileCharacterGraph({ character: result.character, gameData: GAME_DATA }).character, result.character);
});

test("level-based Bond repair requires confirmation and cancellation changes nothing", () => {
  const value = character();
  value.builder.level = 5;
  value.builder.bonds = [{ bondId: "bond:user:ally", name: "Ally", rank: "3", keystone: "We stand together." }];
  const session = new CharacterSession({ character: value, reconcileCharacter: createCharacterSessionGraphReconciler({ gameData: GAME_DATA }) });
  const before = session.getState().working;
  const proposal = session.propose(SetLevel(1));
  assert.equal(proposal.requiresConfirmation, true);
  assert.ok(proposal.impacts.some((impact) => impact.code === "bond-rank-cap-applied"));
  session.cancelProposal(proposal.proposalId);
  assert.deepEqual(session.getState().working, before);
});

test("Bond graph and widget share the pure Rules projection and stay independent of persistence", async () => {
  const [compiler, widget, page] = await Promise.all([
    readFile(new URL("../public/js/core/graph-compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/widgets/bonds-keystones-widget.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/builder-bonds-keystones.js", import.meta.url), "utf8"),
  ]);
  assert.match(compiler, /getBondAllocationState/);
  assert.match(widget, /getBondAllocationState/);
  assert.doesNotMatch(widget, /firebase|database-reader|database-writer/i);
  assert.match(widget, /requestCharacterCommand/);
  assert.match(page, /character-session-page\.js/);
  assert.match(page, /readCharacter/);
  assert.match(page, /replaceCharacter/);
  assert.doesNotMatch(page, /loadCharacterDoc|saveCharacterPatch|buildBondsKeystonesUpdatePatch|getBondRulesState/);
});

test("published Artifact and Powerful Patron grants materialize their canonical Bonds", async () => {
  const published = JSON.parse(await readFile(new URL("../public/data/game-x/game-x-data.json", import.meta.url), "utf8"));
  for (const [originKey, expectedName, expectedRank] of [
    ["artifact", "Artifact", "2"],
    ["powerful-patron", "Patron", "1"],
  ]) {
    const value = createDefaultCharacter({ ownerUid: `published_${originKey.replace(/-/g, "_")}` });
    value.builder.originKey = originKey;
    const result = reconcileCharacterGraph({ character: value, gameData: published });
    assert.equal(result.ok, true, `${originKey}: ${JSON.stringify(result.impacts)}`);
    const bond = result.character.builder.bonds.find((item) => item.bondId.startsWith("grant-bond:"));
    assert.equal(bond?.name, expectedName);
    assert.equal(bond?.rank, expectedRank);
  }
});
