import { escapeHtml } from "./data-sanitization.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function paragraph(value, className = "optionDesc") {
  return value ? `<div class="${className}" style="white-space:pre-wrap;">${escapeHtml(value)}</div>` : "";
}

function techniqueLabel(key, gameData) {
  const technique = (gameData?.techniques || []).find((record) => record.techniqueKey === key);
  if (!technique) return `${key} — unavailable reference`;
  const name = technique.techniqueName || technique.name || key;
  if (technique.status === "draft") return `${name} — Draft`;
  if (technique.status === "incomplete") return `${name} — Incomplete`;
  if (technique.runtimeSupport?.status === "deferred") return `${name} — Unavailable`;
  return name;
}

/** Render static acquisition; gameplay timing remains in the authored prose. */
export function renderTraitCardHtml(trait, { gameData = {}, reference = trait.referenceOnly === true } = {}) {
  const definition = (gameData.traits || []).find((record) => record.traitKey === trait.traitKey) || {};
  const rank = trait.rank;
  const rankLabel = Number.isInteger(rank) && rank >= 0 ? `Rank ${rank}` : "Rank unknown";
  const status = reference ? "Reference" : "Acquired";
  const name = text(trait.name) || text(definition.name) || text(trait.traitKey) || "Unknown Trait";
  const description = text(trait.description) || text(definition.description);
  const notes = text(trait.rankNotes) || text(definition.rankNotes);
  const categories = Array.isArray(trait.classificationTags) ? trait.classificationTags : definition.tags || [];
  const tags = trait.active && !reference && Array.isArray(trait.tags) ? trait.tags : [];
  const techniques = Array.isArray(trait.techniqueKeys) ? trait.techniqueKeys : definition.techniqueKeys || [];
  const source = text(trait.sourceLabel);
  return `<article class="builderItem ability-card traitCard" data-trait-key="${escapeHtml(trait.traitKey || "")}">
    <h3 class="optionTitle ability-name">${escapeHtml(name)}</h3>
    <div class="help">${escapeHtml(rankLabel)} · ${status}${source ? ` · ${escapeHtml(source)}` : ""}</div>
    ${paragraph(description)}
    ${trait.sourceDescription ? paragraph(trait.sourceDescription, "help") : ""}
    ${notes ? `<div class="help" style="white-space:pre-wrap;">${escapeHtml(notes)}</div>` : ""}
    ${categories.length ? `<div class="help">Trait categories: ${categories.map((tag) => escapeHtml(String(tag))).join(", ")}</div>` : ""}
    ${tags.length ? `<div class="help">Granted tags: ${tags.map((tag) => escapeHtml(String(tag))).join(", ")}</div>` : ""}
    ${techniques.length ? `<div class="help">Associated techniques: ${techniques.map((key) => escapeHtml(techniqueLabel(key, gameData))).join(", ")}</div>` : ""}
  </article>`;
}

export function renderTraitCardsHtml(traits, options = {}) {
  return (Array.isArray(traits) ? traits : []).map((trait) => renderTraitCardHtml(trait, options)).join("");
}

/** Shared read-only summary for the builder and character sheet. */
export function renderTraitProjectionHtml(projection = {}, { gameData = {} } = {}) {
  const cards = renderTraitCardsHtml(projection.traits, { gameData });
  const tags = (projection.tags || []).filter((tag) => typeof tag === "string");
  const messages = [...(projection.issues || []), ...(projection.deferred || [])]
    .map((issue) => typeof issue === "string" ? issue : issue?.message || issue?.reason || "")
    .filter((message, index, values) => message && values.indexOf(message) === index);
  return `${cards || '<p class="help">No Traits are supplied by your current features.</p>'}
    ${tags.length ? `<p class="help">Granted tags: ${tags.map(escapeHtml).join(", ")}</p>` : ""}
    ${messages.length ? `<ul class="help">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>` : ""}`;
}
