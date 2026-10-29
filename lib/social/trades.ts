// Règles des échanges entre joueurs, sans base : le serveur les applique sous verrou (server/social/trade-core.ts).
// « Je veux ta carte X, contre l'une de celles-ci » : l'autre joueur choisit une des cartes offertes en acceptant.
// Entre amis c'est toujours possible ; avec un non-ami, seulement si le réglage l'ouvre et que sa collection
// est visible par le proposant (on ne sonde pas une collection cachée).
import type { Rarity } from "../catalog/rarity";

export type TradeRules = {
  expiryHours: number;
  maxOffered: number;
  maxPendingSent: number;
  perDay: number;
  allowedRarities: readonly Rarity[];
  /** Échanges ouverts aux joueurs qui ne sont pas amis. */
  nonFriends: boolean;
};

export type TradeRefusal =
  | "NOT_FRIENDS"
  | "PRIVATE"
  | "BLOCKED"
  | "NO_OFFER"
  | "TOO_MANY_OFFERED"
  | "SAME_CARD"
  | "RARITY"
  | "PENDING_LIMIT"
  | "DAILY_LIMIT"
  | "DUPLICATE";

export type ProposalCheck = {
  wanted: { cardId: string; rarity: Rarity };
  offered: readonly { cardId: string; rarity: Rarity }[];
  friends: boolean;
  blocked: boolean;
  /** La collection du destinataire est visible par le proposant (réglages de confidentialité). */
  collectionVisible: boolean;
  /** Propositions en attente déjà envoyées par le proposant. */
  pendingSent: number;
  /** Propositions envoyées sur les dernières 24 h. */
  sentLastDay: number;
  /** Une proposition en attente vise déjà cette carte chez ce joueur. */
  duplicate: boolean;
  rules: TradeRules;
};

/** Première raison de refuser une proposition, ou null si elle peut partir. */
export function checkProposal(p: ProposalCheck): TradeRefusal | null {
  if (p.blocked) return "BLOCKED";
  if (!p.friends && !p.rules.nonFriends) return "NOT_FRIENDS";
  if (!p.friends && !p.collectionVisible) return "PRIVATE";
  if (p.offered.length === 0) return "NO_OFFER";
  if (p.offered.length > p.rules.maxOffered) return "TOO_MANY_OFFERED";
  if (p.offered.some((c) => c.cardId === p.wanted.cardId)) return "SAME_CARD";
  const allowed = new Set(p.rules.allowedRarities);
  if (!allowed.has(p.wanted.rarity) || p.offered.some((c) => !allowed.has(c.rarity))) return "RARITY";
  if (p.duplicate) return "DUPLICATE";
  if (p.pendingSent >= p.rules.maxPendingSent) return "PENDING_LIMIT";
  if (p.sentLastDay >= p.rules.perDay) return "DAILY_LIMIT";
  return null;
}

/** Ids de cartes offertes, sans doublon, dans l'ordre donné. */
export function uniqueOffered(cardIds: readonly string[]): string[] {
  return [...new Set(cardIds)];
}

export function tradeExpiresAt(now: Date, expiryHours: number): Date {
  return new Date(now.getTime() + expiryHours * 3_600_000);
}

/** Une proposition en attente dont l'échéance est passée ne peut plus être acceptée. */
export function isTradeOpen(trade: { status: string; expiresAt: Date }, now: Date): boolean {
  return trade.status === "PENDING" && trade.expiresAt > now;
}
