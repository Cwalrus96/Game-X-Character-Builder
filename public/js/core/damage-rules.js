import { requireRollNumber } from "./roll-rules.js";

// Parse only the compact mechanical forms authored in the damage field. Never
// execute text or guess that an unrecognized expression means zero damage.
export function parseDamageFormula(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, missing: true, text, error: "No direct damage formula is specified." };
  const match = /^(\d+)(\s*\+\s*Hits)?(?:\s*\+\s*X\s*\(X is Energy spent\))?(?:\s*[;,]\s*\+(\d+) damage per (weapon )?rank above (\d+))?\.?\s*(?:,?\s*to each creature in the area\.?)?$/i.exec(text);
  if (!match) return { ok: false, text, error: "This damage rule needs manual calculation." };
  return { ok: true, text, base: Number(match[1]), usesHits: Boolean(match[2]), energyVariable: /\+\s*X\s*\(/i.test(text),
    growth: Number(match[3] || 0), rankBasis: match[4] ? "weapon" : "skill", minimumRank: Number(match[5] || 0) };
}

export function getDamagePumping(profile, rank) {
  const value = (profile?.pumpingByRank || profile?.pumpDamageByRank || {})[String(rank)];
  if (!value) return { perEnergy: 0, text: "", supported: true };
  const text = typeof value === "object" ? String(value.text ?? "") : String(value);
  const match = /^\+(\d+) damage per Energy$/i.exec(text.trim());
  return { perEnergy: match ? Number(match[1]) : 0, text, supported: Boolean(match) };
}

export function calculateAttackDamage({ profile, skillRank, weaponRank = null, hits, energy = 0, pumpingEnergy = 0, extraDamage = 0, hitsMultiplier = 1 }) {
  requireRollNumber(skillRank, "Damage skill rank");
  if (weaponRank !== null) requireRollNumber(weaponRank, "Weapon rank");
  requireRollNumber(hits, "Hits", { max: 100000 });
  requireRollNumber(energy, "Energy", { max: 999 });
  requireRollNumber(pumpingEnergy, "Pumping Energy", { max: 999 });
  requireRollNumber(extraDamage, "Extra damage", { min: -999, max: 999 });
  requireRollNumber(hitsMultiplier, "Damage Hits multiplier", { min: 0, max: 10 });
  const rank = weaponRank ?? skillRank;
  const formula = parseDamageFormula(profile?.damageByRank?.[String(rank)] ?? profile?.damage);
  if (!formula.ok) return formula;
  if (formula.rankBasis === "weapon" && weaponRank === null) return { ...formula, ok: false, error: "Choose a weapon to calculate weapon-rank damage." };
  const scalingRank = formula.rankBasis === "weapon" ? weaponRank : skillRank;
  if (scalingRank < formula.minimumRank) return { ...formula, ok: false, error: "The damage rank is below this formula's starting rank." };
  const growth = formula.growth * (scalingRank - formula.minimumRank);
  const pumping = getDamagePumping(profile, rank);
  if (pumpingEnergy && (!pumping.supported || pumping.perEnergy === 0)) return { ...formula, ok: false, error: "Damage pumping is not available at this rank." };
  const parts = [
    { label: "Base", value: formula.base },
    ...(formula.growth ? [{ label: `${formula.rankBasis === "weapon" ? "Weapon" : "Skill"} rank growth`, value: growth }] : []),
    ...(formula.usesHits ? [{ label: hitsMultiplier === 1 ? "Hits" : `Hits ×${hitsMultiplier}`, value: hits * hitsMultiplier }] : []),
    ...(formula.energyVariable ? [{ label: "Energy (X)", value: energy }] : []),
    ...(pumpingEnergy ? [{ label: `Pumping (${pumpingEnergy} Energy ×${pumping.perEnergy})`, value: pumpingEnergy * pumping.perEnergy }] : []),
    ...(extraDamage ? [{ label: "Extra damage", value: extraDamage }] : []),
  ];
  const total = Math.max(0, parts.reduce((sum, part) => sum + part.value, 0));
  requireRollNumber(total, "Damage", { max: 1000000 });
  return { ok: true, formula, parts, total };
}
