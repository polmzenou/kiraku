// Texte et lien d'une notification, sans dépendance au rendu : la page /notifications, les toasts
// (côté client) et le Web Push (côté serveur, dans la langue du joueur) partagent ce code.
import { guestCode } from "../username";
import type { AuctionPayload, GiftPayload, NotificationType } from "./notifications";

export type DescribableNotification = {
  type: NotificationType;
  actor: { username: string; isGuest: boolean } | null;
  gift: GiftPayload | null;
  /** Vente concernée (notifications de l'hôtel des ventes). */
  auction?: AuctionPayload | null;
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
  }
}
