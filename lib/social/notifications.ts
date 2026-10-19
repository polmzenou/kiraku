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
