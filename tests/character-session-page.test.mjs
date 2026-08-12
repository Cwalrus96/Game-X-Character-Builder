import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CharacterSessionPage } from "../public/js/builder/character-session-page.js";
import { getOptionStorageKey } from "../public/js/builder/widgets/option-group-widget.js";
import {
  buildTechniqueChoicePatch,
  getTechniqueChoiceSelectionKey,
} from "../public/js/builder/widgets/technique-choice-widget.js";
import { SetAttributeValue, SetClass, SetTechniqueSelection } from "../public/js/core/character-commands.js";
import { GRAPH_GAME_DATA, makeGraphCharacter } from "./fixtures/graph-core.mjs";

test("portable option groups bind published stable keys while retaining a legacy fallback", () => {
  const group = { classKey: "magical-guardian", level: 1, name: "Guardian Accessory" };
  assert.equal(getOptionStorageKey(group, { featureKey: "dazzling-wand", name: "Dazzling Wand" }), "dazzling-wand");
  assert.equal(getOptionStorageKey(group, { featKey: "keen-sight", name: "Keen Sight" }), "keen-sight");
  assert.equal(
    getOptionStorageKey(group, { name: "Historical Option" }),
    "magical-guardian|L1|Guardian Accessory::Historical Option",
  );
});

test("portable technique grant choices restore and emit canonical stable-key answers", () => {
  const choice = {
    choiceId: "dazzling-wand:technique-choice:spellcasting:0",
    type: "technique",
    sourceId: "class-option:magical-guardian:dazzling-wand",
    sourceLabel: "Dazzling Wand",
    value: "",
    techniqueKey: "prismatic-burst",
    skillKey: "spellcasting",
    weaponKey: "",
    rank: 0,
    customName: "",
    enhancements: [],
    tags: [],
  };
  assert.equal(getTechniqueChoiceSelectionKey(choice), "prismatic-burst");
  assert.deepEqual(buildTechniqueChoicePatch({
    techniqueKey: "prismatic-burst",
    techniqueName: "Prismatic Burst",
    skillKeys: ["spellcasting"],
  }, {
    sourceId: choice.sourceId,
    sourceLabel: choice.sourceLabel,
  }), {
    type: "technique",
    sourceId: choice.sourceId,
    sourceLabel: choice.sourceLabel,
    value: "",
    techniqueKey: "prismatic-burst",
    skillKey: "spellcasting",
    weaponKey: "",
    rank: 0,
    customName: "",
    enhancements: [],
    tags: [],
  });
});

test("session page presents destructive graph impacts and cancellation changes no state", async () => {
  const character = makeGraphCharacter({
    selectedTechniques: ["shadow-step"],
    selectedClassFeatureOptions: ["moon-path"],
  });
  const before = JSON.stringify(character);
  let presented = [];
  const page = new CharacterSessionPage({
    character,
    gameData: GRAPH_GAME_DATA,
    confirmImpacts: async ({ messages }) => {
      presented = messages;
      return false;
    },
  });

  const result = await page.requestCharacterCommand(null, SetClass("guardian"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cancelled");
  assert(presented.length > 0);
  assert.equal(JSON.stringify(page.getCharacter()), before);
});

test("session page saves the exact accepted snapshot and preserves conflicts for retry", async () => {
  const page = new CharacterSessionPage({
    character: makeGraphCharacter({ agility: 2 }),
    revision: 4,
    gameData: GRAPH_GAME_DATA,
    confirmImpacts: async () => true,
  });
  const changed = await page.requestCharacterCommand(
    null,
    SetTechniqueSelection(["shadow-step"]),
  );
  assert.equal(changed.ok, true);

  let received = null;
  const saved = await page.save(async (snapshot) => {
    received = snapshot;
    return { revision: 5 };
  });
  assert.equal(saved.ok, true);
  assert.equal(received.expectedRevision, 4);
  assert.deepEqual(received.character, changed.proposal.reconciled);
  assert.equal(page.getState().revision, 5);
  assert.equal(page.getState().dirty, false);

  await page.requestCharacterCommand(null, SetTechniqueSelection([]));
  const conflict = await page.save(async () => {
    const error = new Error("stale");
    error.code = "character-revision-conflict";
    throw error;
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "character-revision-conflict");
  assert.equal(page.getState().dirty, true);
  assert.equal(page.getState().saveInFlight, null);
});

test("session page reports a concurrent save without replacing the active snapshot", async () => {
  const page = new CharacterSessionPage({
    character: makeGraphCharacter(),
    revision: 2,
    gameData: GRAPH_GAME_DATA,
  });
  let finishFirst;
  const first = page.save(() => new Promise((resolve) => { finishFirst = resolve; }));
  const second = await page.save(async () => ({ revision: 99 }));
  assert.equal(second.ok, false);
  assert.equal(second.error.code, "save-already-active");
  assert.equal(page.getState().saveInFlight.expectedRevision, 2);
  finishFirst({ revision: 3 });
  assert.equal((await first).ok, true);
});

test("attribute page commands save the exact accepted state and retain conflicts for retry", async () => {
  const character = makeGraphCharacter({ level: 2, agility: 2 });
  const page = new CharacterSessionPage({
    character,
    revision: 7,
    gameData: GRAPH_GAME_DATA,
    confirmImpacts: async () => true,
  });
  const changed = await page.requestCharacterCommand(null, SetAttributeValue("heart", 2));
  assert.equal(changed.ok, true);
  let snapshot;
  const saved = await page.save(async (value) => {
    snapshot = value;
    return { revision: 8 };
  });
  assert.equal(saved.ok, true);
  assert.equal(snapshot.expectedRevision, 7);
  assert.deepEqual(snapshot.character, changed.proposal.reconciled);

  await page.requestCharacterCommand(null, SetAttributeValue("heart", 1));
  const conflict = await page.save(async () => {
    const error = new Error("stale");
    error.code = "character-revision-conflict";
    throw error;
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "character-revision-conflict");
  assert.equal(page.getState().dirty, true);
});

test("session page and migrated widgets keep persistence and page modules outside portable UI", async () => {
  const pageSource = await readFile(new URL("../public/js/builder/character-session-page.js", import.meta.url), "utf8");
  assert.doesNotMatch(pageSource, /firebase|database-reader|database-writer|document\.|window\./i);

  for (const relativePath of [
    "../public/js/builder/widgets/class-choice-widget.js",
    "../public/js/builder/widgets/level-choice-widget.js",
    "../public/js/builder/widgets/primary-attribute-widget.js",
    "../public/js/builder/widgets/feat-widget.js",
    "../public/js/builder/widgets/option-group-widget.js",
    "../public/js/builder/widgets/techniques-widget.js",
    "../public/js/builder/widgets/equipment-widget.js",
    "../public/js/builder/widgets/attributes-widget.js",
    "../public/js/builder/widgets/origin-widget.js",
    "../public/js/builder/widgets/skills-widget.js",
    "../public/js/builder/widgets/bonds-keystones-widget.js",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /firebase|database-reader|database-writer|builder-class|builder-techniques|builder-equipment|builder-attributes|builder-origin|builder-skills/i);
    assert.match(source, /requestCharacterCommand/);
  }


  for (const relativePath of [
    "../public/js/builder/builder-class.js",
    "../public/js/builder/builder-techniques.js",
    "../public/js/builder/builder-equipment.js",
    "../public/js/builder/builder-attributes.js",
    "../public/js/builder/builder-origin.js",
    "../public/js/builder/builder-skills.js",
    "../public/js/builder/builder-bonds-keystones.js",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /character-session-page\.js/);
    assert.match(source, /readCharacter/);
    assert.match(source, /replaceCharacter/);
    assert.doesNotMatch(source, /builder-page\.js|builder-dependencies\.js|loadCharacterDoc|saveCharacterPatch|markStepVisited/);
  }

  const attributesPage = await readFile(
    new URL("../public/js/builder/builder-attributes.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(attributesPage, /buildAttributesUpdatePatch|pruneAttributesToFit|getAttributeEffectiveCap/);

  for (const relativePath of [
    "../public/js/builder/widgets/skills-widget.js",
    "../public/js/builder/widgets/bonds-keystones-widget.js",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /elements\.root\.querySelectorAll/, `${relativePath} must not disable page-owned Save controls`);
    assert.doesNotMatch(source, /saveBtn|saveAndOpenBtn/, `${relativePath} must not own page Save controls`);
  }

  const skillsWidget = await readFile(new URL("../public/js/builder/widgets/skills-widget.js", import.meta.url), "utf8");
  assert.match(skillsWidget, /data-granted-floor/);
  assert.match(skillsWidget, /storedRank\s*=\s*grantedFloor[^;]+\?\s*""\s*:/);
});

test("Origin and Skills graph/widget consumers share Rules projections without page-owned mechanics", async () => {
  const [compiler, skillWidget, originWidget, skillPage, originPage, gameData] = await Promise.all([
    readFile(new URL("../public/js/core/graph-compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/widgets/skills-widget.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/widgets/origin-widget.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/builder-skills.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/builder-origin.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/core/game-data.js", import.meta.url), "utf8"),
  ]);
  assert.match(compiler, /getSkillAllocationState/);
  assert.match(compiler, /getOriginSelectionState/);
  assert.match(skillWidget, /getSkillAllocationState/);
  assert.match(originWidget, /getOriginSelectionState/);
  assert.doesNotMatch(skillPage, /getSpendableSkillPoints|getStandardSkillRankCap|getSkillPointCostForRank|computeGrantedSkillsState|buildDependencyRefreshPatch/);
  assert.doesNotMatch(originPage, /isSelectable|buildOriginUpdatePatch|buildDependencyRefreshPatch/);
  assert.doesNotMatch(gameData, /computeProgressionRankAtLevel|computeGrantedSkillsState|computeKnownCombatSkillsAndGrants/);
  assert.doesNotMatch(gameData, /function isGameDataRecordSelectable/);
  assert.match(compiler, /selection-rules\.js/);
});

test("attribute graph facts and widget limits consume one centralized Rules projection", async () => {
  const [compiler, widget] = await Promise.all([
    readFile(new URL("../public/js/core/graph-compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/builder/widgets/attributes-widget.js", import.meta.url), "utf8"),
  ]);
  assert.match(compiler, /getAttributeAllocationState/);
  assert.match(widget, /getAttributeAllocationState/);
  assert.doesNotMatch(compiler, /primaryAttribute\s*===\s*attributeKey\s*\?\s*1\s*:\s*0/);
  assert.doesNotMatch(widget, /currentBase|budgetMaximum|getAttributeEffectiveCap|getAttributePointsToSpend/);
});
