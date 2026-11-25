// Notifications : types connus et pastille de la cloche.
import { isKyaraRejectCode, type KyaraRejectCode } from "../kyara/codes";

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
  "SEALED_OPENED",
  "AMBASSADOR_GRANTED",
  "COINFLIP_INVITE",
  "COINFLIP_RESOLVED",
  "COINFLIP_RETURNED",
  "EXPEDITION_RETURNED",
  "BUY_ORDER_FILLED",
  "BUY_ORDER_EXPIRED",
  "BUY_ORDER_WANTED",
  "KYARA_IMPORT_DONE",
  "KYARA_IMPORT_REJECTED",
  "KYARA_IMPORT_REMINDER",
  "REFERRAL_REWARD",
  "ENNICHI_REWARD",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Texte de la pastille : rien à 0, « 9+ » au-delà de 9. */
export function formatBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** Sachets scellés (mêmes valeurs que SEALED_KINDS de lib/boosters/draw.ts). */
const SEALED_SLUGS = ["divin", "apocalypse"] as const;
type SealedSlug = (typeof SEALED_SLUGS)[number];
const isSealedSlug = (v: unknown): v is SealedSlug => SEALED_SLUGS.includes(v as SealedSlug);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40 && /^[A-Za-z0-9_-]+$/.test(v);

/** Contenu d'une notification de cadeau (ids et nombres seulement). */
export type GiftPayload = { kind: "CARD"; cardId: string } | { kind: "BOOSTER" } | { kind: "SEALED"; slug: SealedSlug; dropId: string };

export function parseGiftPayload(raw: unknown): GiftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "BOOSTER") return { kind: "BOOSTER" };
  if (r.kind === "SEALED" && isSealedSlug(r.slug) && isId(r.dropId)) return { kind: "SEALED", slug: r.slug, dropId: r.dropId };
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
export type TeamGiftPayload =
  | { kind: "CARD"; cardId: string; quantity: number }
  | { kind: "BOOSTER"; boosterTypeId: string; quantity: number }
  | { kind: "INCENSE"; quantity: number };

export function parseTeamGiftPayload(raw: unknown): TeamGiftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40 && /^[A-Za-z0-9_-]+$/.test(v);
  const quantity = Number.isSafeInteger(r.quantity) && (r.quantity as number) > 0 ? (r.quantity as number) : null;
  if (quantity === null) return null;
  if (r.kind === "CARD" && id(r.cardId)) return { kind: "CARD", cardId: r.cardId, quantity };
  if (r.kind === "BOOSTER" && id(r.boosterTypeId)) return { kind: "BOOSTER", boosterTypeId: r.boosterTypeId, quantity };
  if (r.kind === "INCENSE") return { kind: "INCENSE", quantity };
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

/** Pourquoi une carte misée au casino est revenue (le créateur qui retire sa table n'est pas notifié). */
export const COINFLIP_RETURN_REASONS = ["EXPIRED", "DECLINED", "ADMIN"] as const;
export type CoinFlipReturnReason = (typeof COINFLIP_RETURN_REASONS)[number];

/**
 * Notification de pile ou face : la table et la carte du créateur. Jamais l'issue d'un lancer : le créateur
 * la découvre en rejouant la pièce.
 */
export type CoinFlipPayload = { flipId: string; cardId: string; reason: CoinFlipReturnReason | null };

export function parseCoinFlipPayload(raw: unknown): CoinFlipPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.flipId) || !isId(r.cardId)) return null;
  const reason = COINFLIP_RETURN_REASONS.includes(r.reason as CoinFlipReturnReason) ? (r.reason as CoinFlipReturnReason) : null;
  return { flipId: r.flipId, cardId: r.cardId, reason };
}

/** Avis de recherche : l'avis, la carte cherchée et son prix. */
export type BuyOrderPayload = { orderId: string; cardId: string; amount: number };

export function parseBuyOrderPayload(raw: unknown): BuyOrderPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.orderId) || !isId(r.cardId) || !Number.isSafeInteger(r.amount) || (r.amount as number) < 0) return null;
  return { orderId: r.orderId, cardId: r.cardId, amount: r.amount as number };
}

/**
 * Import Kyara : versé (cartes et Zeni ; le détail se lit sur /compte/import-kyara) ou refusé (motif de la liste
 * fermée ; la note libre de l'équipe reste dans sa ligne KyaraImport, lue par refId).
 */
export type KyaraImportPayload = { kind: "DONE"; cards: number; zeni: number } | { kind: "REJECTED"; code: KyaraRejectCode };

export function parseKyaraImportPayload(raw: unknown): KyaraImportPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
  if (r.kind === "DONE" && count(r.cards) && count(r.zeni)) return { kind: "DONE", cards: r.cards, zeni: r.zeni };
  if (r.kind === "REJECTED" && isKyaraRejectCode(r.code)) return { kind: "REJECTED", code: r.code };
  return null;
}

/**
 * Parrainage v2 : ce qui vient d'être versé (le détail se lit sur /parrainage). `step` pour une étape ou la part
 * « confiance » (1 à 4), `milestone` pour un palier (amis installés) ; l'autre joueur est l'acteur de la notification.
 */
export type ReferralRewardPayload = {
  kind: "STEP" | "TRUST_BONUS" | "MILESTONE" | "GRAND";
  side: "REFEREE" | "REFERRER" | null;
  step: number | null;
  milestone: number | null;
  /** ×2 de l'Ennichi sur les étapes 1 et 2 */
  multiplier: number;
};

const REFERRAL_REWARD_KINDS = new Set(["STEP", "TRUST_BONUS", "MILESTONE", "GRAND"]);

export function parseReferralRewardPayload(raw: unknown): ReferralRewardPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !REFERRAL_REWARD_KINDS.has(r.kind)) return null;
  const side = r.side === "REFEREE" || r.side === "REFERRER" ? r.side : null;
  const int = (v: unknown, min: number, max: number) => (Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);
  const step = int(r.step, 1, 4);
  const milestone = int(r.milestone, 1, 1_000_000);
  if ((r.kind === "STEP" || r.kind === "TRUST_BONUS") && (step === null || side === null)) return null;
  if (r.kind === "MILESTONE" && milestone === null) return null;
  return { kind: r.kind as ReferralRewardPayload["kind"], side, step, milestone, multiplier: int(r.multiplier, 1, 10) ?? 1 };
}

/** Lot de l'Ennichi versé : palier de lanternes (0 à 3), rang du banzuke ou n° du tirage de l'omikuji. */
export type EnnichiRewardPayload = { kind: "TIER" | "BANZUKE" | "OMIKUJI"; edition: number; tier: number | null; rank: number | null; draw: number | null };

export function parseEnnichiRewardPayload(raw: unknown): EnnichiRewardPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number) => (Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);
  const edition = int(r.edition, 1, 1_000);
  if (edition === null || (r.kind !== "TIER" && r.kind !== "BANZUKE" && r.kind !== "OMIKUJI")) return null;
  const tier = int(r.tier, 0, 3);
  const rank = int(r.rank, 1, 100_000);
  const draw = int(r.draw, 1, 100_000);
  if ((r.kind === "TIER" && tier === null) || (r.kind === "BANZUKE" && rank === null) || (r.kind === "OMIKUJI" && draw === null)) return null;
  return { kind: r.kind, edition, tier, rank, draw };
}

/** Expédition rentrée : son issue (le détail se lit sur /expedition). */
export type ExpeditionPayload = { outcome: "FAILURE" | "SUCCESS" | "TRIUMPH" };

export function parseExpeditionPayload(raw: unknown): ExpeditionPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const outcome = (raw as Record<string, unknown>).outcome;
  return outcome === "FAILURE" || outcome === "SUCCESS" || outcome === "TRIUMPH" ? { outcome } : null;
}
