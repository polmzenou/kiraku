// Règles de l'hôtel des ventes. Pur et en entiers (points de base, jamais de flottants) :
// server/market/auction-core.ts les applique sous verrou, l'interface s'en sert pour l'affichage.

export type MarketRules = {
  enabled: boolean;
  feeBp: number;
  minIncrementBp: number;
  antiSnipeSeconds: number;
  extendSeconds: number;
  durationsHours: readonly number[];
  maxActivePerSeller: number;
  minAccountAgeHours: number;
  minStartPrice: number;
  maxPrice: number;
  /** Plafond par rareté (clé de rareté → Zeni) ; une rareté absente n'a que le plafond global. */
  maxPriceByRarity: Readonly<Record<string, number>>;
};

const BP = 10_000;
const HOUR = 3_600_000;

/** Part `bp` (points de base) de `amount`, arrondie au-dessus. */
function bpCeil(amount: number, bp: number): number {
  return Math.ceil((amount * bp) / BP);
}

/**
 * Plus petite mise acceptée : le prix de départ tant que personne n'a misé, sinon l'enchère
 * actuelle plus `incrementBp` (au moins 1 Zeni).
 */
export function minNextBid(currentBid: number | null, startPrice: number, incrementBp: number): number {
  if (currentBid === null) return startPrice;
  return currentBid + Math.max(1, bpCeil(currentBid, incrementBp));
}

/** Prix maximal d'une carte de cette rareté : le plus bas du plafond global et de celui de la rareté. */
export function priceCap(rules: Pick<MarketRules, "maxPrice" | "maxPriceByRarity">, rarity: string | null): number {
  const own = rarity === null ? undefined : rules.maxPriceByRarity[rarity];
  return own === undefined ? rules.maxPrice : Math.min(rules.maxPrice, own);
}

/**
 * Mises acceptées sur une vente plafonnée à `cap`, ou null si le plafond est atteint (plus aucune
 * surenchère possible). Sous le plafond, la mise minimale y est ramenée. Une vente ouverte avant une
 * baisse du plafond garde son prix de départ comme plafond.
 */
export function bidBounds(
  currentBid: number | null,
  startPrice: number,
  incrementBp: number,
  cap: number,
): { min: number; max: number } | null {
  const max = Math.max(cap, startPrice);
  if (currentBid !== null && currentBid >= max) return null;
  return { min: Math.min(minNextBid(currentBid, startPrice, incrementBp), max), max };
}

/** Taxe prélevée sur une vente : elle sort les Zeni du jeu. */
export function saleFee(price: number, feeBp: number): number {
  return Math.min(price, bpCeil(price, feeBp));
}

/** Ce que reçoit le vendeur pour une vente à `price`. */
export function sellerNet(price: number, feeBp: number): number {
  return price - saleFee(price, feeBp);
}

/**
 * Anti-sniping : une mise reçue moins de `windowSeconds` avant la fin repousse la fin à
 * `now + extendSeconds` (jamais plus tôt que la fin prévue).
 */
export function extendedEndsAt(endsAt: Date, now: Date, windowSeconds: number, extendSeconds: number): Date {
  if (endsAt.getTime() - now.getTime() >= windowSeconds * 1000) return endsAt;
  return new Date(Math.max(endsAt.getTime(), now.getTime() + extendSeconds * 1000));
}

export type ListingInput = { startPrice: number; buyoutPrice: number | null; durationHours: number };

export type ListingRefusal = "INVALID_PRICE" | "INVALID_BUYOUT" | "INVALID_DURATION";

/** Première règle enfreinte par la mise en vente d'une carte de rareté `rarity`, ou null. */
export function checkListing(input: ListingInput, rules: MarketRules, rarity: string | null = null): ListingRefusal | null {
  const cap = priceCap(rules, rarity);
  const price = (n: number) => Number.isSafeInteger(n) && n >= rules.minStartPrice && n <= cap;
  if (!price(input.startPrice)) return "INVALID_PRICE";
  if (input.buyoutPrice !== null && (!price(input.buyoutPrice) || input.buyoutPrice <= input.startPrice)) {
    return "INVALID_BUYOUT";
  }
  if (!rules.durationsHours.includes(input.durationHours)) return "INVALID_DURATION";
  return null;
}

/** Fin d'une vente qui commence à `now`. */
export function listingEndsAt(now: Date, durationHours: number): Date {
  return new Date(now.getTime() + durationHours * HOUR);
}

export type Trader = { isGuest: boolean; bannedAt: Date | null; createdAt: Date };

export type TraderRefusal = "DISABLED" | "GUEST" | "BANNED" | "TOO_NEW";

/** Un joueur peut-il vendre ou miser ? Invités en consultation seule, comptes récents exclus. */
export function checkTrader(player: Trader, now: Date, rules: MarketRules): TraderRefusal | null {
  if (!rules.enabled) return "DISABLED";
  if (player.isGuest) return "GUEST";
  if (player.bannedAt) return "BANNED";
  if (now.getTime() - player.createdAt.getTime() < rules.minAccountAgeHours * HOUR) return "TOO_NEW";
  return null;
}

/** L'achat immédiat est-il encore proposé ? Il disparaît dès qu'une mise l'atteint. */
export function buyoutAvailable(buyoutPrice: number | null, currentBid: number | null): buyoutPrice is number {
  return buyoutPrice !== null && (currentBid === null || currentBid < buyoutPrice);
}
