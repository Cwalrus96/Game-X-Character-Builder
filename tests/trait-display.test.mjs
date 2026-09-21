import assert from "node:assert/strict";
import test from "node:test";
import { renderTraitCardHtml, renderTraitProjectionHtml } from "../public/js/core/trait-display.js";

test("referenced Traits preserve provider conditions without claiming ownership or activation", () => {
  const html = renderTraitCardHtml({
    traitKey: "spirit-sight", name: "Spirit Sight", rank: 1, referenceOnly: true,
    sourceLabel: "Eyes of Legend", sourceDescription: "Spend 1 Energy; lasts until the end of your turn. Range: 12 squares.",
    description: "See invisible creatures.", classificationTags: ["Senses", "Sight"],
  });
  assert.match(html, /Rank 1 · Reference · Eyes of Legend/);
  assert.match(html, /Spend 1 Energy; lasts until the end of your turn\./);
  assert.match(html, /Range: 12 squares/);
  assert.match(html, /Trait categories: Senses, Sight/);
  assert.doesNotMatch(html, /· Active|Active granted tags/);
});

test("Trait cards use stable Technique links and retain incomplete readiness", () => {
  const html = renderTraitCardHtml({
    traitKey: "beam-blaster", name: "Beam Blaster", rank: null, active: false,
    techniqueKeys: ["beam-one", "beam-two", "missing"],
  }, { gameData: { techniques: [
    { techniqueKey: "beam-one", techniqueName: "Beam", status: "draft" },
    { techniqueKey: "beam-two", techniqueName: "Beam", status: "incomplete" },
  ] } });
  assert.match(html, /Rank unknown · Acquired/);
  assert.match(html, /Beam — Draft, Beam — Incomplete, missing — unavailable reference/);
});

test("Trait HTML escapes authored and projected text and separates acquired tags from classification", () => {
  const html = renderTraitProjectionHtml({
    traits: [{ traitKey: 'bad"key', name: "<img src=x>", rank: 1, active: true, description: "<script>bad()</script>", classificationTags: ["Body"], tags: ["Liquid"] }],
    tags: ["Liquid", "<iframe>"],
    issues: [{ message: "<error>" }], deferred: [{ message: "<error>" }],
  });
  assert.doesNotMatch(html, /<img|<script|<iframe|<error>/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /Trait categories: Body/);
  assert.match(html, /Granted tags: Liquid/);
  assert.match(html, /Granted tags: Liquid, &lt;iframe&gt;/);
  assert.equal(html.split("&lt;error&gt;").length - 1, 1);
});
