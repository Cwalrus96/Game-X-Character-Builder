import { escapeHtml } from "../../core/data-sanitization.js";
import { renderTechniqueProfileHtml } from "../../core/technique-utils.js";
import { renderTraitCardHtml } from "../../core/trait-display.js";
import { renderEnhancementDetailHtml, summarizeWeaponProfilesHtml } from "../../core/weapon-utils.js";

// Reference browsing is presentation only: never infer acquisition or execute grants.
const list = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const expansionByPage = new WeakMap();
const boundDetails = new WeakSet();
const domains = {
  technique: { collection: "techniques", key: "techniqueKey", label: "Technique" },
  trait: { collection: "traits", key: "traitKey", label: "Trait" },
  feat: { collection: "feats", key: "featKey", label: "Feat" },
  feature: { key: "featureKey", label: "Feature" },
  weapon: { collection: "weaponBases", key: "weaponKey", label: "Weapon" },
  "weapon-enhancement": { collection: "weaponEnhancements", key: "enhancementKey", label: "Enhancement" },
};

function expansionFor(page) {
  if (!page) return new Set();
  if (!expansionByPage.has(page)) expansionByPage.set(page, new Set());
  return expansionByPage.get(page);
}

function flatten(entries) {
  return list(entries).flatMap((entry) => [entry, ...flatten(entry?.options || [])]);
}

function recordsFor(type, gameData, owner) {
  if (type !== "feature") return flatten(gameData[domains[type].collection] || []);
  // Feature keys are scoped to their Class, Origin or Feat owner.
  if (owner.classKey) return flatten(gameData.classFeatures?.[owner.classKey] || []);
  if (owner.originKey) return flatten((gameData.origins || []).find((entry) => entry.originKey === owner.originKey)?.features || []);
  if (owner.featKey) return flatten((gameData.feats || []).filter((entry) => entry.featKey === owner.featKey));
  return [];
}

function references(entry) {
  const refs = [];
  const add = (type, keys, names = []) => {
    if (!domains[type]) return;
    for (const key of list(keys)) refs.push({ type, key });
    // Older data may identify grants by name; ambiguous names stay unresolved.
    if (!list(keys).length) for (const name of list(names)) refs.push({ type, name });
  };
  for (const grant of list(entry?.grants)) {
    add(grant.type, grant.type === "weapon-enhancement" ? grant.enhancement : grant.key, grant.name);
    if (grant.type === "weapon") add("weapon-enhancement", grant.enhancement);
  }
  add("technique", entry?.techniqueKeys);
  add("trait", entry?.traitKeys);
  const basicAttack = (clauses) => list(clauses).forEach((clause) => {
    if (clause.type === "any") basicAttack(clause.alternatives);
    else if (clause.type === "technique") add("technique", clause.key);
  });
  basicAttack(entry?.basicAttack);
  return refs;
}

const paragraph = (value) => value ? `<div class="optionDesc">${escapeHtml(value)}</div>` : "";
function rankMap(label, values) {
  const rows = Object.entries(values || {});
  return rows.length ? `<div class="optionDesc"><strong>${label} by rank:</strong>${rows.map(([rank, value]) => `<div>Rank ${escapeHtml(rank)}: ${escapeHtml(value)}</div>`).join("")}</div>` : "";
}

function renderRecord(type, record, gameData) {
  if (type === "technique") return renderTechniqueProfileHtml(record, {
    gameData, rankValue: record.rank, showRank: true,
  }) + rankMap("Damage", record.damageByRank)
    + rankMap("Pumping", record.expressionSyntaxVersion === 3 ? record.pumpingByRank : record.pumpDamageByRank);
  if (type === "trait") return renderTraitCardHtml(record, { gameData, reference: true });
  if (type === "weapon-enhancement") return renderEnhancementDetailHtml(record);
  if (type === "weapon") return paragraph(record.description)
    + (record.profiles?.length ? summarizeWeaponProfilesHtml(record, record.minRank) : "") + paragraph(record.notes);
  return paragraph(record.description) + paragraph(record.rankNotes) + paragraph(record.notes);
}

/** Shared full-text references for any choice card, selected or still being compared. */
export function renderRuleDetailsHtml(entry, { gameData = {}, page = null, identity = "rules", ancestors = new Set() } = {}) {
  const expanded = expansionFor(page);
  const seen = new Set();
  return references(entry).map((ref) => {
    const domain = domains[ref.type];
    const matches = recordsFor(ref.type, gameData, entry).filter((record) => ref.key
      ? record[domain.key] === ref.key
      : (record.techniqueName || record.name) === ref.name);
    const record = matches.length === 1 ? matches[0] : null;
    const key = record?.[domain.key] || ref.key || ref.name;
    const referenceId = JSON.stringify([ref.type, entry.classKey || entry.originKey || "", key]);
    if (seen.has(referenceId)) return "";
    seen.add(referenceId);
    const detailId = `${identity}/${referenceId}`;
    const name = record?.techniqueName || record?.name || key;
    let content;
    if (!record) content = paragraph(matches.length > 1 ? "This rules reference is ambiguous." : "Full rules are unavailable for this reference.");
    else if (ancestors.has(referenceId)) content = paragraph("This reference is already shown above.");
    else {
      const nextAncestors = new Set(ancestors).add(referenceId);
      const notice = record.runtimeSupport?.status === "deferred" ? "Builder support is unavailable for this entry."
        : ["draft", "incomplete"].includes(record.status) ? "This entry has incomplete rules." : "";
      content = paragraph(notice) + renderRecord(ref.type, record, gameData)
        + renderRuleDetailsHtml(record, { gameData, page, identity: detailId, ancestors: nextAncestors });
    }
    return `<details class="ruleDetails" data-rule-detail="${escapeHtml(detailId)}"${expanded.has(detailId) ? " open" : ""}>
      <summary>${escapeHtml(domain.label)}: ${escapeHtml(name)} <span class="muted">— rules</span></summary>
      <div class="ruleDetailsBody">${content}</div></details>`;
  }).join("");
}

/** Bind after rendering; native details supplies keyboard behavior and expanded state. */
export function bindRuleDetails(container, page) {
  const expanded = expansionFor(page);
  for (const detail of container?.querySelectorAll?.("details[data-rule-detail]") || []) {
    if (boundDetails.has(detail)) continue;
    boundDetails.add(detail);
    detail.addEventListener("toggle", (event) => {
      if (event.target !== detail || detail.isConnected === false) return;
      if (detail.open) expanded.add(detail.dataset.ruleDetail);
      else expanded.delete(detail.dataset.ruleDetail);
    });
  }
}

export function appendRuleDetails(container, entry, options = {}) {
  const html = renderRuleDetailsHtml(entry, { gameData: options.page?.gameData || {}, ...options });
  if (!html) return;
  const region = document.createElement("div");
  region.className = "ruleReferences";
  region.innerHTML = html;
  container.append(region);
  bindRuleDetails(region, options.page);
}
