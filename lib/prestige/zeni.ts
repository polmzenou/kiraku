import { engravedFactor, recycleValue } from "../collection/recycle";

// Zeni d'une renaissance : valeur de recyclage des exemplaires partis (une gravée vaut un multiple de sa rareté),
// puis barème dégressif par tranches (prestige.zeniTiers : au-delà de la dernière tranche, rien) et plafond.

export type ZeniTier = { upTo: number; pct: number };

/** Montant versé pour une valeur brute : chaque tranche paie sa part à son pourcentage, arrondi à l'inférieur. */
export function rebirthZeni(raw: number, tiers: readonly ZeniTier[], cap: number): number {
  let paid = 0;
  let floor = 0;
  for (const tier of tiers) {
    if (raw <= floor) break;
    const slice = Math.min(raw, tier.upTo) - floor;
    paid += (slice * tier.pct) / 100;
    floor = tier.upTo;
  }
  return Math.max(0, Math.min(cap, Math.floor(paid)));
}

/** Valeur brute des exemplaires partis, par rareté : `ordinary` et `engraved` en nombre d'exemplaires. */
export function rebirthRawValue(
  departed: readonly { rarity: string; engraved: boolean; count: number }[],
  values: Readonly<Record<string, number>>,
  engravedMultiplier: number,
): number {
  return departed.reduce((sum, d) => sum + recycleValue(d.rarity, d.count, values) * engravedFactor(d.engraved, engravedMultiplier), 0);
}
