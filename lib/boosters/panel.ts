import { type Rarity } from "@/lib/catalog/rarity";
import { boostersUntilGolden, boostersUntilPity, rarityIndex, type CardPool, type DrawRules, type DuplicateGuard } from "./draw";
import { atLeastOdds, featuredBoosterChance, type PoolCounts, type RarityOdds } from "./odds";
import { priceFor, typeDrawRules, type Availability, type BoosterTypeView, type Price } from "./types";

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
  /** Le type fait avancer la pitié sans que ses Mythiques la remettent à zéro (Impérial). */
  pityKept: boolean;
  /** Prochain doré dans N boosters, null si le type n'y a pas droit. */
  goldenIn: number | null;
  /**
   * Bannière ou Focus série : chance d'une vedette par booster et pitié vedette du joueur. `focus` :
   * les vedettes sont les cartes des séries mises en avant (libellé « Série à l'honneur »).
   */
  featured: { chance: number; left: number; count: number; focus: boolean } | null;
  /** Doublons des grandes raretés, expliqués dans la fiche des taux (null : règle coupée). */
  duplicateGuard: DuplicateGuard | null;
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
  const { type, counts, user } = input;
  // Planchers et taux du type (boostés pour un Impérial) : les chances affichées sont celles du tirage
  const rules = typeDrawRules(type, input.rules);
  const RARITIES = Object.keys(rules.rates);
  const slotFloors = [...rules.slotFloors];
  const best = slotFloors.reduce((a, b) => (rarityIndex(b, RARITIES) > rarityIndex(a, RARITIES) ? b : a), slotFloors[0] ?? "COMMON");
  const featuredTotal = input.featuredCounts ? RARITIES.reduce((s, r) => s + input.featuredCounts![r], 0) : 0;
  return {
    slotFloors,
    best,
    odds: atLeastOdds(rules.rates, slotFloors, counts),
    poolSize: RARITIES.reduce((s, r) => s + counts[r], 0),
    pityLeft: type.countsForPity ? boostersUntilPity(user.pityCount, rules.pityThreshold) : null,
    pityKept: type.countsForPity && !type.resetsPity,
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
            focus: type.kind === "FOCUS",
          }
        : null,
    duplicateGuard: rules.duplicateGuard ?? null,
    price: priceFor(type, user.stock, 1),
    availability: input.availability,
  };
}

/** Souhaits du joueur : combien peuvent sortir de ce booster, sur combien au total. */
export type WishlistInPool = { inPool: number; total: number };

export function wishlistInPool(pool: CardPool, wished: readonly string[]): WishlistInPool {
  const wanted = new Set(wished);
  let inPool = 0;
  for (const ids of Object.values(pool)) for (const id of ids) if (wanted.has(id)) inPool++;
  return { inPool, total: wanted.size };
}
