import { getStandardSkillRankCap, clampLevel } from "./character-rules.js?v=wpe5";
import { sanitizeText, toInt } from "./data-sanitization.js";

export const SOURCE_BOND_ID_PREFIX = "grant-bond:";
export const BACKGROUND_KEYSTONE_CAPACITY = 2;

export function isSourceOwnedBondId(value) {
  return typeof value === "string" && value.startsWith(SOURCE_BOND_ID_PREFIX);
}

export function getBondRulesState({ level, heart } = {}) {
  const normalizedLevel = clampLevel(level ?? 1);
  const normalizedHeart = toInt(heart ?? 0, { min: 0, max: 99 });
  return Object.freeze({
    level: normalizedLevel,
    heart: normalizedHeart,
    rankCap: Math.max(1, getStandardSkillRankCap(normalizedLevel)),
    userBondCapacity: normalizedHeart,
    backgroundKeystoneCapacity: BACKGROUND_KEYSTONE_CAPACITY,
  });
}

function grantMinimumByBondId(sourceBondSpecs = []) {
  return new Map((Array.isArray(sourceBondSpecs) ? sourceBondSpecs : []).map((spec) => [
    spec.bondId,
    toInt(spec.rank ?? 1, { min: 1, max: 6 }),
  ]));
}

export function getBondAllocationState(builder = {}, { sourceBondSpecs = [] } = {}) {
  const rules = getBondRulesState({
    level: builder.level,
    heart: builder.attributes?.heart,
  });
  const grantMinimums = grantMinimumByBondId(sourceBondSpecs);
  let userIndex = 0;
  const bonds = (Array.isArray(builder.bonds) ? builder.bonds : []).map((bond, index) => {
    const sourceOwned = isSourceOwnedBondId(bond?.bondId);
    const grantedMinimum = grantMinimums.get(bond?.bondId) || (sourceOwned ? 1 : 0);
    const rank = toInt(bond?.rank || 1, { min: 1, max: 6 });
    const withinCapacity = sourceOwned || userIndex < rules.userBondCapacity;
    if (!sourceOwned) userIndex += 1;
    const maximumRank = sourceOwned ? grantedMinimum : rules.rankCap;
    return Object.freeze({
      ...bond,
      index,
      sourceOwned,
      grantedMinimum,
      rank,
      maximumRank,
      withinCapacity,
      rankValid: sourceOwned ? rank === grantedMinimum : rank >= 1 && rank <= maximumRank,
      complete: !!sanitizeText(bond?.name, { maxLen: 96, collapse: true })
        && !!sanitizeText(bond?.keystone, { maxLen: 400, collapse: true }),
    });
  });
  const userBondCount = bonds.filter((bond) => !bond.sourceOwned).length;
  return Object.freeze({
    ...rules,
    bonds: Object.freeze(bonds),
    userBondCount,
    sourceBondCount: bonds.length - userBondCount,
    userBondRemaining: rules.userBondCapacity - userBondCount,
  });
}

export function fitBondsToRules(builder = {}, { sourceBondSpecs = [] } = {}) {
  const allocation = getBondAllocationState(builder, { sourceBondSpecs });
  const bonds = [];
  const changes = [];
  for (const record of allocation.bonds) {
    if (!record.withinCapacity) {
      changes.push(Object.freeze({
        code: "bond-capacity-applied",
        bondId: record.bondId,
        name: record.name,
        before: record,
        after: undefined,
      }));
      continue;
    }
    const fittedRank = record.sourceOwned
      ? record.grantedMinimum
      : Math.max(1, Math.min(record.rank, record.maximumRank));
    const next = {
      bondId: record.bondId,
      name: record.name,
      rank: String(fittedRank),
      keystone: record.keystone,
    };
    if (String(record.rank) !== next.rank) {
      changes.push(Object.freeze({
        code: record.sourceOwned ? "source-bond-rank-applied" : "bond-rank-cap-applied",
        bondId: record.bondId,
        name: record.name,
        before: record.rank,
        after: fittedRank,
      }));
    }
    bonds.push(Object.freeze(next));
  }
  return Object.freeze({
    bonds: Object.freeze(bonds),
    allocation,
    changes: Object.freeze(changes),
  });
}

export function makeSourceBondId(sourceOwnerId, choiceId, index = 0) {
  const segment = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "source";
  return `${SOURCE_BOND_ID_PREFIX}${segment(sourceOwnerId)}:${segment(choiceId)}:${index}`;
}

export function sourceBondTargetName(choiceId) {
  return sanitizeText(String(choiceId || "Bond").replace(/[-_]+/g, " "), { maxLen: 96, collapse: true })
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
