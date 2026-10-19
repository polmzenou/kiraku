// Texte et lien d'une notification, sans dépendance au rendu : la page /notifications, les toasts
// (côté client) et le Web Push (côté serveur, dans la langue du joueur) partagent ce code.
import { guestCode } from "../username";
import type { AuctionPayload, BattlePayload, GiftPayload, NotificationType, TradePayload } from "./notifications";

export type DescribableNotification = {
  type: NotificationType;
  actor: { username: string; isGuest: boolean } | null;
  gift: GiftPayload | null;
  /** Vente concernée (notifications de l'hôtel des ventes). */
  auction?: AuctionPayload | null;
  /** Salle de combat (invitation). */
  battle?: BattlePayload | null;
  /** Proposition d'échange (la carte demandée est dans `card`). */
  trade?: TradePayload | null;
  card: { anilistId: number; name: string; rarity: string } | null;
};

type Values = Record<string, string | number>;

/** Traductions nécessaires, déjà liées à la langue du lecteur. */
export type DescribeTranslators = {
  notifications: (
    key:
      | "someone"
      | "friendRequest"
      | "friendAccepted"
      | "giftCard"
      | "giftCardGone"
      | "giftBooster"
      | "referralQualified"
      | "outbid"
      | "auctionWon"
      | "auctionSold"
      | "auctionExpired"
      | "auctionCancelled"
      | "battleInvite"
      | "teamGift"
      | "tradeProposed"
      | "tradeAccepted"
      | "tradeDeclined"
      | "aCard",
    values?: Values,
  ) => string;
  guestName: (code: string) => string;
  rarity: (rarity: string) => string;
};

const AUCTION_KEYS = {
  OUTBID: "outbid",
  AUCTION_WON: "auctionWon",
  AUCTION_SOLD: "auctionSold",
  AUCTION_EXPIRED: "auctionExpired",
  AUCTION_CANCELLED: "auctionCancelled",
} as const;

/** Lien (sans préfixe de langue) et texte d'une notification. */
export function describeNotification(n: DescribableNotification, tr: DescribeTranslators): { text: string; href: string } {
  const t = tr.notifications;
  const code = n.actor ? guestCode(n.actor.username) : null;
  const name = n.actor ? (n.actor.isGuest && code ? tr.guestName(code) : n.actor.username) : t("someone");
  switch (n.type) {
    case "FRIEND_REQUEST":
      return { text: t("friendRequest", { name }), href: "/amis?onglet=demandes" };
    case "FRIEND_ACCEPTED":
      return { text: t("friendAccepted", { name }), href: n.actor ? `/u/${n.actor.username}` : "/amis" };
    case "REFERRAL_QUALIFIED":
      return { text: t("referralQualified", { name }), href: "/parrainage" };
    case "GIFT_RECEIVED":
      if (n.gift?.kind === "BOOSTER") return { text: t("giftBooster", { name }), href: "/ouvrir/standard?credit=1" };
      return n.card
        ? {
            text: t("giftCard", { name, card: n.card.name, rarity: tr.rarity(n.card.rarity) }),
            href: `/collection/${n.card.anilistId}`,
          }
        : { text: t("giftCardGone", { name }), href: "/collection" };
    case "OUTBID":
    case "AUCTION_WON":
    case "AUCTION_SOLD":
    case "AUCTION_EXPIRED":
    case "AUCTION_CANCELLED": {
      const key = AUCTION_KEYS[n.type];
      const card = n.card?.name ?? t("aCard");
      return { text: t(key, { name, card, amount: n.auction?.amount ?? 0 }), href: n.auction ? `/marche/${n.auction.auctionId}` : "/marche" };
    }
    case "BATTLE_INVITE":
      return { text: t("battleInvite", { name }), href: n.battle ? `/combat/${n.battle.battleId}` : "/combat" };
    case "LOT_GRANTED":
      // Cadeau de l'équipe : l'admin qui l'envoie n'est jamais nommé
      return { text: t("teamGift"), href: "/compte/historique" };
    case "TRADE_PROPOSED":
    case "TRADE_ACCEPTED":
    case "TRADE_DECLINED": {
      const key = n.type === "TRADE_PROPOSED" ? "tradeProposed" : n.type === "TRADE_ACCEPTED" ? "tradeAccepted" : "tradeDeclined";
      return { text: t(key, { name, card: n.card?.name ?? t("aCard") }), href: "/amis?onglet=echanges" };
    }
  }
}
