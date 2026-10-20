// Règles des échanges ouverts du Marché, sans base : le serveur les applique sous verrou
// (server/market/listing-core.ts). « Je donne celle-ci contre l'une de celles-là » : n'importe quel
// joueur propose une de ses cartes, l'auteur de l'annonce accepte ou refuse.
import type { Rarity } from "../catalog/rarity";

export type ListingRules = {
  expiryHours: number;
  maxWants: number;
  maxActive: number;
  perDay: number;
  maxPendingOffers: number;
  /** Offrir une carte hors de la liste demandée. */
  allowOther: boolean;
  allowedRarities: readonly Rarity[];
  /** Anti-multicomptes, partagé avec l'hôtel des ventes (market.minAccountAgeHours). */
  minAccountAgeHours: number;
};

export type ExchangerRefusal = "GUEST" | "BANNED" | "TOO_NEW";

/** Un joueur peut-il publier ou faire une offre ? Invités en consultation seule, comptes récents exclus. */
export function checkExchanger(player: { isGuest: boolean; bannedAt: Date | null; createdAt: Date }, now: Date, rules: Pick<ListingRules, "minAccountAgeHours">): ExchangerRefusal | null {
  if (player.isGuest) return "GUEST";
  if (player.bannedAt) return "BANNED";
  if (now.getTime() - player.createdAt.getTime() < rules.minAccountAgeHours * 3_600_000) return "TOO_NEW";
  return null;
}

export const LISTING_FILTERS = ["all", "missing", "canAccept", "mine"] as const;
export type ListingFilter = (typeof LISTING_FILTERS)[number];

export type TradeListingRefusal =
  | "NO_WANT"
  | "TOO_MANY_WANTS"
  | "SAME_CARD"
  | "ALREADY_OWNED"
  | "RARITY"
  | "DUPLICATE"
  | "ACTIVE_LIMIT"
  | "DAILY_LIMIT";

export type TradeListingCheck = {
  offered: { cardId: string; rarity: Rarity };
  wants: readonly { cardId: string; rarity: Rarity }[];
  /** Cartes demandées dont l'auteur possède déjà un exemplaire. */
  ownedWants: number;
  /** L'auteur a déjà une annonce ouverte pour cette carte. */
  duplicate: boolean;
  /** Annonces ouvertes de l'auteur. */
  active: number;
  /** Annonces créées sur les dernières 24 h. */
  createdLastDay: number;
  rules: ListingRules;
};

/** Première raison de refuser une annonce, ou null si elle peut paraître. */
export function checkTradeListing(p: TradeListingCheck): TradeListingRefusal | null {
  if (p.wants.length === 0) return "NO_WANT";
  if (p.wants.length > p.rules.maxWants) return "TOO_MANY_WANTS";
  if (p.wants.some((w) => w.cardId === p.offered.cardId)) return "SAME_CARD";
  if (p.ownedWants > 0) return "ALREADY_OWNED";
  const allowed = new Set(p.rules.allowedRarities);
  if (!allowed.has(p.offered.rarity) || p.wants.some((w) => !allowed.has(w.rarity))) return "RARITY";
  if (p.duplicate) return "DUPLICATE";
  if (p.active >= p.rules.maxActive) return "ACTIVE_LIMIT";
  if (p.createdLastDay >= p.rules.perDay) return "DAILY_LIMIT";
  return null;
}

export type ListingOfferRefusal = "OWN_LISTING" | "CLOSED" | "BLOCKED" | "SAME_CARD" | "NOT_WANTED" | "RARITY" | "ALREADY_OFFERED" | "OFFER_LIMIT";

export type ListingOfferCheck = {
  listing: { ownerId: string; cardId: string; status: string; expiresAt: Date };
  bidderId: string;
  offered: { cardId: string; rarity: Rarity };
  /** La carte offerte fait partie des cartes demandées. */
  fromWants: boolean;
  blocked: boolean;
  /** Le joueur a déjà une offre en attente sur cette annonce. */
  alreadyOffered: boolean;
  /** Offres en attente du joueur, toutes annonces confondues. */
  pendingOffers: number;
  rules: ListingRules;
  now: Date;
};

/** Première raison de refuser une offre, ou null si elle peut partir. */
export function checkListingOffer(p: ListingOfferCheck): ListingOfferRefusal | null {
  if (p.listing.ownerId === p.bidderId) return "OWN_LISTING";
  if (!isListingOpen(p.listing, p.now)) return "CLOSED";
  if (p.blocked) return "BLOCKED";
  if (p.offered.cardId === p.listing.cardId) return "SAME_CARD";
  if (!p.fromWants && !p.rules.allowOther) return "NOT_WANTED";
  if (!new Set(p.rules.allowedRarities).has(p.offered.rarity)) return "RARITY";
  if (p.alreadyOffered) return "ALREADY_OFFERED";
  if (p.pendingOffers >= p.rules.maxPendingOffers) return "OFFER_LIMIT";
  return null;
}

/** Ids de cartes demandées, sans doublon, dans l'ordre donné. */
export function uniqueWants(cardIds: readonly string[]): string[] {
  return [...new Set(cardIds)];
}

export function listingExpiresAt(now: Date, expiryHours: number): Date {
  return new Date(now.getTime() + expiryHours * 3_600_000);
}

/** Une annonce ouverte dont l'échéance est passée ne reçoit plus d'offre et ne peut plus conclure. */
export function isListingOpen(listing: { status: string; expiresAt: Date }, now: Date): boolean {
  return listing.status === "OPEN" && listing.expiresAt > now;
}

/** Filtre de la liste, porté par l'URL (`filtre`) ; toute valeur inconnue retombe sur « all ». */
export function parseListingFilter(value: string | string[] | undefined): ListingFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v && (LISTING_FILTERS as readonly string[]).includes(v) ? (v as ListingFilter) : "all";
}
