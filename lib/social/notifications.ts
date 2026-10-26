// Notifications : types connus et pastille de la cloche.

export const NOTIFICATION_TYPES = [
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "GIFT_RECEIVED",
  "REFERRAL_QUALIFIED",
  "OUTBID",
  "AUCTION_WON",
  "AUCTION_SOLD",
  "AUCTION_EXPIRED",
  "AUCTION_CANCELLED",
  "BATTLE_INVITE",
  "LOT_GRANTED",
  "TRADE_PROPOSED",
  "TRADE_ACCEPTED",
  "TRADE_DECLINED",
  "LISTING_OFFER",
  "LISTING_ACCEPTED",
  "LISTING_DECLINED",
  "TEAM_GIFT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Texte de la pastille : rien à 0, « 9+ » au-delà de 9. */
export function formatBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** Contenu d'une notification de cadeau (ids et nombres seulement). */
export type GiftPayload = { kind: "CARD"; cardId: string } | { kind: "BOOSTER" };

export function parseGiftPayload(raw: unknown): GiftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "BOOSTER") return { kind: "BOOSTER" };
  if (r.kind === "CARD" && typeof r.cardId === "string" && r.cardId.length <= 40) return { kind: "CARD", cardId: r.cardId };
  return null;
}

/** Contenu d'une notification de l'hôtel des ventes : la vente, la carte et le montant en jeu. */
export type AuctionPayload = { auctionId: string; cardId: string; amount: number | null };

export function parseAuctionPayload(raw: unknown): AuctionPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40;
  if (!id(r.auctionId) || !id(r.cardId)) return null;
  const amount = Number.isSafeInteger(r.amount) && (r.amount as number) >= 0 ? (r.amount as number) : null;
  return { auctionId: r.auctionId, cardId: r.cardId, amount };
}

/** Contenu d'une invitation en combat : la salle réservée au joueur invité. */
export type BattlePayload = { battleId: string };

export function parseBattlePayload(raw: unknown): BattlePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const id = (raw as Record<string, unknown>).battleId;
  return typeof id === "string" && id.length > 0 && id.length <= 40 && /^[A-Za-z0-9_-]+$/.test(id) ? { battleId: id } : null;
}

/** Contenu d'une notification d'échange : la proposition et la carte demandée. */
export type TradePayload = { tradeId: string; cardId: string };

export function parseTradePayload(raw: unknown): TradePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40 && /^[A-Za-z0-9_-]+$/.test(v);
  return id(r.tradeId) && id(r.cardId) ? { tradeId: r.tradeId, cardId: r.cardId } : null;
}

/**
 * Contenu d'une notification d'échange ouvert du Marché : l'annonce, l'offre, la carte de l'annonce
 * (`cardId`) et la carte proposée par l'offrant (`offeredCardId`).
 */
export type ListingPayload = { listingId: string; offerId: string; cardId: string; offeredCardId: string };

export function parseListingPayload(raw: unknown): ListingPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40 && /^[A-Za-z0-9_-]+$/.test(v);
  return id(r.listingId) && id(r.offerId) && id(r.cardId) && id(r.offeredCardId)
    ? { listingId: r.listingId, offerId: r.offerId, cardId: r.cardId, offeredCardId: r.offeredCardId }
    : null;
}

/**
 * Contenu d'un cadeau de l'équipe ajouté depuis la fiche du joueur : la carte ou le type de booster
 * et le nombre. Le mot de l'équipe, texte libre, reste dans sa ligne TeamGift (lu par refId).
 */
export type TeamGiftPayload = { kind: "CARD"; cardId: string; quantity: number } | { kind: "BOOSTER"; boosterTypeId: string; quantity: number };

export function parseTeamGiftPayload(raw: unknown): TeamGiftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40 && /^[A-Za-z0-9_-]+$/.test(v);
  const quantity = Number.isSafeInteger(r.quantity) && (r.quantity as number) > 0 ? (r.quantity as number) : null;
  if (quantity === null) return null;
  if (r.kind === "CARD" && id(r.cardId)) return { kind: "CARD", cardId: r.cardId, quantity };
  if (r.kind === "BOOSTER" && id(r.boosterTypeId)) return { kind: "BOOSTER", boosterTypeId: r.boosterTypeId, quantity };
  return null;
}

/**
 * Sachet scellé offert puis ouvert par l'ami : le sachet, l'issue d'un Apocalyptique et la meilleure
 * carte obtenue (ids et clés seulement).
 */
export type SealedPayload = { slug: SealedSlug; outcome: "SPARED" | "RUINED" | null; cardId: string | null };

export function parseSealedPayload(raw: unknown): SealedPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isSealedSlug(r.slug)) return null;
  const outcome = r.outcome === "SPARED" || r.outcome === "RUINED" ? r.outcome : null;
  return { slug: r.slug, outcome, cardId: isId(r.cardId) ? r.cardId : null };
}
