import { type Rarity } from "@/lib/catalog/rarity";
import { boostersUntilGolden, boostersUntilPity, rarityIndex, type DrawRules } from "./draw";
import { atLeastOdds, featuredBoosterChance, type PoolCounts, type RarityOdds } from "./odds";
import { effectiveSlotFloors, priceFor, type Availability, type BoosterTypeView, type Price } from "./types";

// Ce que la page affiche pour un booster : composition, chances calculées sur son vrai pool,
// compteurs et coût de la prochaine ouverture. Tout est calculé côté serveur.

export type BoosterPanelData = {
  slotFloors: Rarity[];
  /** Meilleur plancher garanti. */
  best: Rarity;
  /** P(au moins une ≥ R), paliers vides du pool repliés comme au tirage. */
  odds: RarityOdds;
  poolSize: number;
  /** Mythique garantie dans N boosters, null si le type ne compte pas pour la pitié. */
  pityLeft: number | null;
  /** Prochain doré dans N boosters, null si le type n'y a pas droit. */
  goldenIn: number | null;
  /** Bannière : chance d'une vedette par booster et pitié vedette du joueur. */
  featured: { chance: number; left: number; count: number } | null;
  price: Price;
  availability: Availability;
};

export function boosterPanelData(input: {
  type: BoosterTypeView;
  counts: PoolCounts;
  rules: DrawRules;
  availability: Availability;
  user: { stock: number; pityCount: number; standardCount: number; bannerPity: number };
  /** Vedettes du pool, par rareté. */
  featuredCounts?: PoolCounts;
}): BoosterPanelData {
  const { type, counts, rules, user } = input;
  const RARITIES = Object.keys(rules.rates);
  const slotFloors = effectiveSlotFloors(type.slotFloors, rules.slotFloors);
  const best = slotFloors.reduce((a, b) => (rarityIndex(b, RARITIES) > rarityIndex(a, RARITIES) ? b : a), slotFloors[0] ?? "COMMON");
  const featuredTotal = input.featuredCounts ? RARITIES.reduce((s, r) => s + input.featuredCounts![r], 0) : 0;
  return {
    slotFloors,
    best,
    odds: atLeastOdds(rules.rates, slotFloors, counts),
    poolSize: RARITIES.reduce((s, r) => s + counts[r], 0),
    pityLeft: type.countsForPity ? boostersUntilPity(user.pityCount, rules.pityThreshold) : null,
    goldenIn: type.bonusEligible ? boostersUntilGolden(user.standardCount, rules.goldenEvery) : null,
    featured:
      featuredTotal > 0 && input.featuredCounts
        ? {
            chance: featuredBoosterChance(rules.rates, slotFloors, {
              rate: type.featuredRate,
              featured: input.featuredCounts,
              counts,
            }),
            left: type.featuredPity > 0 ? Math.max(1, type.featuredPity - user.bannerPity) : 0,
            count: featuredTotal,
          }
        : null,
    price: priceFor(type, user.stock, 1),
    availability: input.availability,
  };
}

