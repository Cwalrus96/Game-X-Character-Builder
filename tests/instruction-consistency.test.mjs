import test from "node:test";
import assert from "node:assert/strict";
import { checkPrerequisites, formatPrerequisite } from "../public/js/core/prerequisite-rules.js";
import { renderTechniqueProfileHtml } from "../public/js/core/technique-utils.js";
import { getSelectableWeaponBases, renderEnhancementDetailHtml } from "../public/js/core/weapon-utils.js";

test("syntax 3 entity keys cannot be supplied by display names or normalized aliases", () => {
  const gameData = { expressionSyntaxVersion: 3,
    feats: [{ featKey: "unselected", name: "selected" }, { featKey: "selected", name: "Chosen Feat" }],
    classes: [{ classKey: "real-class", name: "other-class" }],
    origins: [{ originKey: "real-origin", name: "other-origin" }],
  };
  const context = { gameData, builder: { classKey: "real-class", originKey: "real-origin", selectedFeats: ["selected"], weapons: [{ id: "w", weaponKey: "other-blade", customName: "required-blade", rank: 1 }] } };
  for (const [type, key] of [["feat", "unselected"], ["class", "other-class"], ["origin", "other-origin"], ["weapon", "required-blade"], ["weapon", "other_blade"]]) {
    assert.equal(checkPrerequisites([{ type, key }], context).ok, false, `${type}: ${key}`);
  }
  for (const [type, key] of [["feat", "selected"], ["class", "real-class"], ["origin", "real-origin"], ["weapon", "other-blade"]]) {
    assert.equal(checkPrerequisites([{ type, key }], context).ok, true, `${type}: ${key}`);
  }
  assert.match(checkPrerequisites([{ type: "feat", key: "selected" }], { ...context, builder: {} }).failureReasons[0], /Chosen Feat/);
});

test("legacy named prerequisites retain compatibility without ambiguous first-name lookup", () => {
  const context = { gameData: { feats: [{ featKey: "wrong", name: "selected" }, { featKey: "selected", name: "Chosen" }] }, builder: { selectedFeats: ["selected"] } };
  assert.equal(checkPrerequisites([{ type: "feat", key: "wrong" }], context).ok, false);
  assert.equal(checkPrerequisites([{ type: "feat", name: "Chosen" }], context).ok, true);
});

test("prerequisite labels resolve catalogue identities, retain static constraints and omit hand conditions", () => {
  const data = { traits: [{ traitKey: "wing-key", name: "Wings" }], techniques: [{ techniqueKey: "blast-key", techniqueName: "Wing Blast" }],
    classFeatures: { sample: [{ featureKey: "group-key", name: "Instincts" }] }, weaponBases: [{ weaponKey: "blade-key", name: "Blade" }] };
  assert.equal(formatPrerequisite({ type: "trait", key: "wing-key", minRank: 2 }, data), "Trait: Wings rank 2+");
  assert.equal(formatPrerequisite({ type: "technique", key: "blast-key" }, data), "Technique: Wing Blast");
  assert.equal(formatPrerequisite({ type: "option", groupKey: "group-key", count: 2 }, data), "Know 2 options from Instincts");
  const label = formatPrerequisite({ type: "weapon-set", count: 2, tagAll: ["Sharp", "Light"], minRank: 2, separateHands: true, wielded: true }, data);
  assert.match(label, /2\+.*Sharp and Light.*rank 2\+/);
  assert.doesNotMatch(label, /hand|wield/);
  assert.equal(formatPrerequisite({ type: "trait", key: "unknown-key" }, data), "Trait: unknown-key");
});

test("generic pumping preserves unfamiliar and multiple effects independently of damage", () => {
  const html = renderTechniqueProfileHtml({ expressionSyntaxVersion: 3, damage: "4 damage", pumpingByRank: { 1: "+1 accuracy and +2 ward per Energy" } }, { rankValue: 1 });
  assert.match(html, /<strong>Damage:<\/strong> 4 damage<\/div>/);
  assert.match(html, /<strong>Pumping:<\/strong> \+1 accuracy and \+2 ward per Energy/);
  assert.doesNotMatch(html, /accuracy Damage|ward Damage/);
  const unfamiliar = renderTechniqueProfileHtml({ expressionSyntaxVersion: 3, pumpingByRank: { 1: "+1 accuracy per Energy" } }, { rankValue: 1 });
  assert.match(unfamiliar, /\+1 accuracy per Energy/);
  assert.doesNotMatch(unfamiliar, /Damage/);
});

test("expanded technique and sheet profiles retain complete escaped mechanical prose", () => {
  const text = "Long mechanics. ".repeat(100) + "<final effect>";
  const html = renderTechniqueProfileHtml({ description: text, onSuccess: text, pumpingByRank: { 1: text }, expressionSyntaxVersion: 3 }, { rankValue: 1 });
  assert.equal(html.split("&lt;final effect&gt;").length - 1, 3);
  assert.doesNotMatch(html, /<final effect>/);
  assert.match(renderEnhancementDetailHtml({ name: "Long enhancement", description: text }, { rank: 1 }), /&lt;final effect&gt;/);
});

test("equipment and granted weapons share readiness and rank filtering with explicit acquisition mode", () => {
  const records = [
    { weaponKey: "ready", status: "playable", minRank: 1 },
    { weaponKey: "draft", status: "draft", minRank: 1 },
    { weaponKey: "high", status: "playable", minRank: 3 },
    { weaponKey: "gift", status: "playable", selectionMode: "granted-only", minRank: 1 },
  ].map((record) => ({ ...record, expressionSyntaxVersion: 3 }));
  assert.deepEqual(getSelectableWeaponBases(records, { maxRank: 1 }).map((row) => row.weaponKey), ["ready"]);
  assert.deepEqual(getSelectableWeaponBases(records, { maxRank: 1, allowGrantedOnly: true }).map((row) => row.weaponKey), ["ready", "gift"]);
});
