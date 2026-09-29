import { normalizeEnumToken, sanitizeText } from "../../core/data-sanitization.js";
import { resolveGrantChoiceIds } from "../../core/choice-identity.js";
import { isTechniqueChoiceGrant } from "../../core/technique-grant-rules.js";
import { getEffectiveTags } from "../../core/weapon-utils.js";
import { TechniqueChoiceWidget } from "./technique-choice-widget.js?v=choices5";
import { WeaponChoiceWidget } from "./weapon-choice-widget.js?v=choices5";
import { WeaponEnhancementChoiceWidget } from "./weapon-enhancement-choice-widget.js?v=choices5";
import { createDefaultGrantWidgetRegistry } from "./grant-widget-extensions.js?v=choices5";

const DEFAULT_GRANT_WIDGET_REGISTRY = createDefaultGrantWidgetRegistry();

function getForcedEnhancementsForChoice(choiceId, entries, getSelectedEntries) {
  const id = sanitizeText(choiceId, { maxLen: 96, collapse: true });
  if (!id) return [];

  const out = [];
  const addFromEntry = (entry) => {
    for (const grant of Array.isArray(entry?.grants) ? entry.grants : []) {
      if (grant?.type !== "weapon" || grant?.choiceId !== id || !grant?.enhancement) continue;
      out.push({
        id: `${id}-${grant.enhancement}`,
        enhancementKey: grant.enhancement,
        rank: Number.parseInt(String(grant.rank ?? 1), 10) || 1,
        selections: {},
        granted: true,
      });
    }
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    addFromEntry(entry);
    for (const option of getSelectedEntries?.(entry) || []) addFromEntry(option);
  }
  return out;
}

export function buildWeaponChoicePatch({
  choice, patch = {}, forcedEnhancements = [], weaponBases = [], sourceId = "", sourceLabel = "",
} = {}) {
  const next = {
    type: "weapon",
    sourceId: sanitizeText(choice?.sourceId || sourceId, { maxLen: 260, collapse: true }),
    sourceLabel: sanitizeText(choice?.sourceLabel || sourceLabel, { maxLen: 200, collapse: true }),
    value: "", techniqueKey: "", skillKey: "", weaponKey: "", rank: 1,
    customName: "", enhancements: [], tags: [],
    ...(choice || {}), ...patch,
  };
  if (!next.weaponKey) return { type: "weapon", weaponKey: "" };
  const optionalEnhancements = Array.isArray(next.enhancements)
    ? next.enhancements.filter((enhancement) => !enhancement?.granted && enhancement?.enhancementKey)
    : [];
  next.enhancements = forcedEnhancements.concat(optionalEnhancements);
  const weapon = { weaponKey: next.weaponKey, rank: next.rank, enhancements: next.enhancements };
  // The saved compatibility cache uses the same token format as migrations;
  // Rules derive readable and valued tags from the referenced weapon definition.
  next.tags = [...new Set(getEffectiveTags(weapon, weaponBases)
    .map((tag) => normalizeEnumToken(tag, { maxLen: 128 })).filter(Boolean))];
  return next;
}

export function buildWeaponEnhancementChoicePatch({ choice, grant, enhancementKey, forcedEnhancements = [], selections = {} } = {}) {
  const key = sanitizeText(enhancementKey, { maxLen: 96, collapse: true });
  const otherEnhancements = (choice?.enhancements || []).filter(entry => !entry.granted).slice(1);
  const optional = key
    ? [{
        id: `${choice?.choiceId || grant?.choiceRef}-${key}`,
        enhancementKey: key,
        rank: Number.parseInt(String(grant?.rank ?? 1), 10) || 1,
        selections: { ...selections },
        granted: false,
      }]
    : [];
  return {
    ...(choice || {}),
    type: "weapon",
    enhancements: forcedEnhancements.concat(optional, otherEnhancements),
  };
}

export function createGrantWidgets({
  page,
  entry,
  grantChoiceState,
  weaponBases = [],
  weaponEnhancements = [],
  grantContextEntries = [],
  getSelectedEntries = null,
  prerequisiteContext = {},
  gameData = null,
  getBuilder = null,
  getGrantChoices = null,
  getExistingWeapons = null,
  onChange = null,
  showUnavailable = undefined,
  expandedChoices = undefined,
  renderFeatOptions = null,
  renderFeatGrants = null,
  sourceId = "",
  scope = "dynamic",
  registry = DEFAULT_GRANT_WIDGET_REGISTRY,
} = {}) {
  const grants = Array.isArray(entry?.grants) ? entry.grants : [];
  const widgets = [];

  for (const [index, grant] of grants.entries()) {
    if (isTechniqueChoiceGrant(grant)) {
      for (const [choiceIndex, choiceId] of resolveGrantChoiceIds({ ...grant, type: "technique-choice" }, { sourceId, index }).entries()) {
        widgets.push(new TechniqueChoiceWidget(page, {
          grant: { ...grant, count: 1, choiceNumber: choiceIndex + 1 },
          choice: grantChoiceState?.getChoice(choiceId),
          choiceId,
          gameData,
          getBuilder,
          getGrantChoices,
          sourceId,
          sourceLabel: entry?.name || entry?.featureName || entry?.featKey || "",
          scope,
          onChange: async (patch) => {
            const result = await grantChoiceState?.updateChoice(choiceId, patch);
            onChange?.();
            return result;
          },
        }));
      }
      continue;
    }

    if (grant?.type === "weapon") {
      for (const choiceId of resolveGrantChoiceIds(grant, { sourceId, index })) {
        const forcedEnhancements = getForcedEnhancementsForChoice(choiceId, grantContextEntries, getSelectedEntries);
        if (grant.enhancement && !forcedEnhancements.some(item => item.enhancementKey === grant.enhancement)) {
          forcedEnhancements.push({ id: `${choiceId}-${grant.enhancement}`, enhancementKey: grant.enhancement,
            rank: Number(grant.rank || 1), selections: {}, granted: true });
        }
        widgets.push(new WeaponChoiceWidget(page, {
          grant: { ...grant, choiceId },
          choice: grantChoiceState?.getChoice(choiceId),
          weaponBases,
          weaponEnhancements,
          forcedEnhancements,
          getGrantChoices,
          getExistingWeapons,
          scope,
          onChange: async (patch) => {
            const result = await (!patch.weaponKey ? grantChoiceState?.removeChoice(choiceId)
            : grantChoiceState?.updateChoice(choiceId, buildWeaponChoicePatch({
              choice: grantChoiceState?.getChoice(choiceId), patch, forcedEnhancements, weaponBases,
              sourceId, sourceLabel: entry?.name || entry?.featureName || "",
            })));
            onChange?.();
            return result;
          },
        }));
      }
      continue;
    }

    if (grant?.type === "weapon-enhancement" && grant.choiceRef) {
      const choiceId = sanitizeText(grant.choiceRef, { maxLen: 96, collapse: true });
      const forcedEnhancements = getForcedEnhancementsForChoice(choiceId, grantContextEntries, getSelectedEntries);
      widgets.push(new WeaponEnhancementChoiceWidget(page, {
        grant,
        choice: grantChoiceState?.getChoice(choiceId),
        forcedEnhancements,
        weaponBases,
        weaponEnhancements,
        prerequisiteContext,
        getGrantChoices,
        getExistingWeapons,
        scope,
        onChange: async (enhancementKey, selections = {}) => {
          const choice = grantChoiceState?.getChoice(choiceId);
          if (!choice?.weaponKey) return;
          const patch = buildWeaponEnhancementChoicePatch({ choice, grant, enhancementKey, forcedEnhancements, selections });
          const result = await grantChoiceState?.updateChoice(choiceId, buildWeaponChoicePatch({
            choice,
            patch,
            forcedEnhancements,
            weaponBases,
          }));
          onChange?.();
          return result;
        },
      }));
      continue;
    }

    const handler = registry?.get?.(grant?.type);
    if (!handler) continue;
    const created = handler({
      page, entry, grant, index, grantChoiceState, weaponBases, weaponEnhancements,
      grantContextEntries, getSelectedEntries, prerequisiteContext, gameData,
      getBuilder, getGrantChoices, getExistingWeapons, onChange, sourceId, scope,
      showUnavailable, expandedChoices, renderFeatOptions, renderFeatGrants,
    });
    if (Array.isArray(created)) widgets.push(...created.filter(Boolean));
    else if (created) widgets.push(created);
  }

  return widgets;
}
