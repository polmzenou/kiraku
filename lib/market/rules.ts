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

/** Première règle enfreinte par une mise en vente, ou null. */
export function checkListing(input: ListingInput, rules: MarketRules): ListingRefusal | null {
  const price = (n: number) => Number.isSafeInteger(n) && n >= rules.minStartPrice && n <= rules.maxPrice;
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
