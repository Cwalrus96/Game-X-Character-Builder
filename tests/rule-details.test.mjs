import assert from "node:assert/strict";
import test from "node:test";
import { renderRuleDetailsHtml, bindRuleDetails } from "../public/js/builder/widgets/rule-details.js";
import { OptionGroupWidget } from "../public/js/builder/widgets/option-group-widget.js";
import { FeatChoiceWidget } from "../public/js/builder/widgets/feat-choice-widget.js";
import { TraitWidget } from "../public/js/builder/widgets/trait-widget.js";
import { OriginWidget } from "../public/js/builder/widgets/origin-widget.js";
import { traitData, traitCharacter } from "./fixtures/traits.mjs";
import { makeFeatChoicesFixture } from "./fixtures/feat-choices.mjs";

const ready = { expressionSyntaxVersion: 3, runtimeSupport: { status: "supported", reasons: [] } };
function fixture() {
  const gameData = traitData();
  gameData.techniques[0] = { ...gameData.techniques[0], description: "Move <safely>\nThen land.", trigger: "An ally falls.",
    actions: 1, actionType: "Reaction", energyCostKind: "fixed", energyCost: 2,
    onSuccess: "Catch the ally.", onFailure: "Slow their fall.", rankNotes: "Rank 3: fly farther.",
    pumpingByRank: { 1: "+1 ward per Energy", 3: "+2 ward per Energy" } };
  return gameData;
}

function element(tagName = "div") {
  return { tagName, children: [], style: {}, dataset: {}, events: new Map(), textContent: "", attributes: {}, classList: { add() {} },
    set innerHTML(html) { this.children = [{ outerHTML: html }]; },
    get innerHTML() { return this.children.map((child) => child.outerHTML).join(""); },
    get outerHTML() { return `<${tagName}>${this.textContent}${this.innerHTML}</${tagName}>`; },
    append(...children) { this.children.push(...children); }, appendChild(child) { this.append(child); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, handler) { this.events.set(type, handler); }, removeEventListener(type) { this.events.delete(type); },
    setAttribute(key, value) { this.attributes[key] = value; }, querySelector() { return null; },
  };
}
function documentFor(t) {
  const previous = globalThis.document;
  globalThis.document = { createElement: element, createDocumentFragment: () => element("fragment") };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
}

test("unselected granted Technique references expose complete escaped mechanics and every authored rank", () => {
  const gameData = fixture();
  const entry = { grants: [{ type: "technique", key: "flight" }], techniqueKeys: ["flight"] };
  const before = structuredClone(gameData);
  const html = renderRuleDetailsHtml(entry, { gameData });
  assert.equal((html.match(/<details/g) || []).length, 1, "duplicate reference metadata does not duplicate the disclosure");
  assert.match(html, /<summary>Technique: Flight/);
  for (const text of ["Move &lt;safely&gt;\nThen land.", "An ally falls.", "Catch the ally.", "Slow their fall.", "Rank 3: fly farther.", "Rank 1: +1 ward per Energy", "Rank 3: +2 ward per Energy", "1 Reaction + 2 Energy"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, / open>|<input|<select|<safely>/);
  assert.deepEqual(gameData, before);
  gameData.techniques[0].description = "Full text. ".repeat(500) + "Technique final paragraph.";
  assert.match(renderRuleDetailsHtml(entry, { gameData }), /Technique final paragraph\./);
});

test("the same reference component handles Traits, Feats, Weapons, Enhancements and nested Technique rules", () => {
  const gameData = fixture();
  gameData.feats = [{ featKey: "gift", name: "Gift", description: "Gift rules.", grants: [{ type: "trait", key: "wings" }] }];
  gameData.weaponBases = [{ weaponKey: "staff", name: "Staff", description: "Staff rules.", techniqueKeys: ["flight"] }];
  gameData.weaponEnhancements = [{ enhancementKey: "bright", name: "Bright", description: "Bright rules. ".repeat(500) + "Enhancement final paragraph.", notes: "Extra effect." }];
  const entry = { grants: [{ type: "feat", key: "gift" }, { type: "weapon", key: "staff", enhancement: "bright" }] };
  const html = renderRuleDetailsHtml(entry, { gameData });
  for (const text of ["Feat: Gift", "Gift rules.", "Trait: wings", "wings benefit", "Technique: Flight", "Move &lt;safely&gt;", "Weapon: Staff", "Staff rules.", "Enhancement: Bright", "Extra effect."]) assert.ok(html.includes(text), text);
  assert.match(html, /incomplete rules/, "unfinished references remain inspectable and explicitly incomplete");
  assert.doesNotMatch(html, /Acquired/, "previewing a grant never claims acquisition");
  assert.match(html, /Enhancement final paragraph\./);
});

test("references resolve exact identities, preserve missing/ambiguous notices, and bound scoped feature cycles", () => {
  const gameData = fixture();
  gameData.techniques.push({ techniqueKey: "other-flight", techniqueName: "Flight", description: "Other rules." });
  const exact = renderRuleDetailsHtml({ grants: [{ type: "technique", key: "other-flight" }] }, { gameData });
  assert.match(exact, /Other rules/);
  assert.doesNotMatch(exact, /Catch the ally/);
  assert.match(renderRuleDetailsHtml({ grants: [{ type: "technique", name: "Flight" }] }, { gameData }), /reference is ambiguous/);
  assert.match(renderRuleDetailsHtml({ traitKeys: ["missing"] }, { gameData }), /unavailable for this reference/);
  gameData.classFeatures = {
    one: [{ classKey: "one", featureKey: "loop", name: "Loop", description: "Correct owner.", grants: [{ type: "feature", key: "loop" }] }],
    two: [{ classKey: "two", featureKey: "loop", name: "Loop", description: "Wrong owner." }],
  };
  const html = renderRuleDetailsHtml({ classKey: "one", grants: [{ type: "feature", key: "loop" }] }, { gameData });
  assert.match(html, /Correct owner/);
  assert.match(html, /already shown above/);
  assert.doesNotMatch(html, /Wrong owner/);
  assert.equal((html.match(/<details/g) || []).length, 2);
});

test("native disclosure expansion survives recreation, is owner-local, and issues no character command", () => {
  const gameData = fixture(), entry = { techniqueKeys: ["flight"] };
  const page = { requestCharacterCommand() { assert.fail("browsing must not submit commands"); } };
  const options = { gameData, page, identity: "one" };
  const html = renderRuleDetailsHtml(entry, options);
  const id = html.match(/data-rule-detail="([^"]+)"/)[1].replaceAll("&quot;", '"');
  const detail = { ...element("details"), dataset: { ruleDetail: id }, isConnected: true, open: true };
  const container = { querySelectorAll: () => [detail] };
  bindRuleDetails(container, page);
  detail.events.get("toggle")({ target: detail });
  assert.match(renderRuleDetailsHtml(entry, options), / open>/);
  assert.doesNotMatch(renderRuleDetailsHtml(entry, { ...options, identity: "two" }), / open>/);
  assert.doesNotMatch(renderRuleDetailsHtml(entry, { ...options, page: {} }), / open>/);
  detail.open = false;
  detail.events.get("toggle")({ target: detail });
  assert.doesNotMatch(renderRuleDetailsHtml(entry, options), / open>/);
  detail.open = true;
  detail.isConnected = false;
  detail.events.get("toggle")({ target: detail });
  assert.doesNotMatch(renderRuleDetailsHtml(entry, options), / open>/, "detached cards cannot overwrite current browsing state");
});

test("Class and Feat option cards show grant rules before selection, outside the selection label", (t) => {
  documentFor(t);
  const gameData = fixture(), selectedKeys = new Set();
  const group = { ...ready, type: "optionGroup", featureKey: "instinct", name: "Instinct", chooseCount: 1, options: [
    { ...ready, type: "option", featureKey: "first", name: "First", grants: [{ type: "technique", key: "flight" }] },
    { ...ready, type: "option", featureKey: "second", name: "Second", grants: [{ type: "trait", key: "wings" }] },
  ] };
  for (const context of ["feature", "feat"]) {
    const widget = new OptionGroupWidget({ gameData, registerWidget() {}, requestCharacterCommand() { assert.fail("render must not select"); } }, { group, context, selectedKeys });
    const html = widget.element.innerHTML;
    assert.match(html, /Technique: Flight/);
    assert.match(html, /Trait: wings/);
    assert.match(html, /<\/label><div><details/);
    assert.equal(selectedKeys.size, 0);
  }
});

test("expanded Feat candidates expose shared nested rules once without a selected-result duplicate", (t) => {
  documentFor(t);
  const { gameData, character, classFeature } = makeFeatChoicesFixture();
  gameData.techniques = fixture().techniques;
  gameData.feats[0].grants = [{ type: "technique", key: "flight" }];
  character.builder.selectedFeats = ["class-a"];
  const page = { getCharacter: () => character, registerWidget() {} };
  const expandedChoices = new Set();
  const widget = new FeatChoiceWidget(page, { entry: classFeature, sourceId: "class-feature:ninja:class-feat-2", gameData, expandedChoices });
  assert.doesNotMatch(widget.element.innerHTML, /Technique: Flight/);
  expandedChoices.add(`${widget.id}:0`);
  widget.render();
  assert.equal((widget.element.innerHTML.match(/<summary>Technique: Flight/g) || []).length, 1);
  assert.match(widget.element.innerHTML, /<\/label>\s*<details/);
});

test("Trait candidates and Origin features use the same rules details without changing their answers", (t) => {
  documentFor(t);
  const gameData = fixture(), character = traitCharacter(), before = structuredClone(character);
  const page = { gameData, getCharacter: () => character, registerWidget() {} };
  const mount = element();
  const trait = new TraitWidget(page, { mount, gameData });
  assert.doesNotMatch(mount.innerHTML, /Technique: Flight/);
  trait.expandedChoices.add(trait.projection.choices[0].choiceId);
  trait.render();
  assert.match(mount.innerHTML, /<\/label><details/);
  gameData.origins[0].features[0].grants.push({ type: "technique", key: "flight" });
  const elements = Object.fromEntries(["originSelect", "originKeystone", "originSummary", "originDetails", "originStatusHint"].map((key) => [key, element()]));
  const featureMount = element();
  elements.originDetails.querySelector = () => featureMount;
  new OriginWidget(page, { gameData, elements });
  assert.match(featureMount.innerHTML, /Technique: Flight/);
  assert.deepEqual(character, before);
});
