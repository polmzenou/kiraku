// Texte et lien d'une notification, sans dépendance au rendu : la page /notifications, les toasts
// (côté client) et le Web Push (côté serveur, dans la langue du joueur) partagent ce code.
import { guestCode } from "../username";
import type {
  AuctionPayload,
  BattlePayload,
  BuyOrderPayload,
  CoinFlipPayload,
  ExpeditionPayload,
  GiftPayload,
  NotificationType,
  SealedPayload,
  TeamGiftPayload,
  TradePayload,
} from "./notifications";

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
  /** Carte proposée par l'offrant (échanges ouverts du Marché ; la carte de l'annonce est dans `card`). */
  offeredCard?: { name: string } | null;
  /** Cadeau de l'équipe depuis la fiche du joueur (la carte est dans `card`). */
  team?: (TeamGiftPayload & { boosterSlug: string | null }) | null;
  /** Sachet scellé offert puis ouvert par l'ami (la meilleure carte est dans `card`). */
  sealed?: SealedPayload | null;
  /** Table de pile ou face (la carte du créateur est dans `card`). */
  coinFlip?: CoinFlipPayload | null;
  /** Expédition rentrée : son issue. */
  expedition?: ExpeditionPayload | null;
  /** Avis de recherche (la carte cherchée est dans `card`). */
  buyOrder?: BuyOrderPayload | null;
  card: { anilistId: number; name: string; rarity: string } | null;
};

/** Sachets scellés : ils s'ouvrent depuis l'accueil, pas depuis la vitrine. */
const SEALED_SLUGS = new Set(["divin", "apocalypse"]);

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
      | "giftSealedDivin"
      | "giftSealedApocalypse"
      | "sealedDivin"
      | "sealedSpared"
      | "sealedRuined"
      | "referralQualified"
      | "outbid"
      | "auctionWon"
      | "auctionSold"
      | "auctionExpired"
      | "auctionCancelled"
      | "battleInvite"
      | "teamGift"
      | "teamGiftCards"
      | "teamGiftBoosters"
      | "teamGiftIncense"
      | "tradeProposed"
      | "tradeAccepted"
      | "tradeDeclined"
      | "listingOffer"
      | "listingAccepted"
      | "listingDeclined"
      | "ambassadorGranted"
      | "coinFlipInvite"
      | "coinFlipResolved"
      | "coinFlipExpired"
      | "coinFlipDeclined"
      | "coinFlipAdmin"
      | "expeditionTriumph"
      | "expeditionSuccess"
      | "expeditionFailure"
      | "expeditionReturned"
      | "buyOrderFilled"
      | "buyOrderExpired"
      | "buyOrderWanted"
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
      if (n.gift?.kind === "SEALED") {
        return {
          text: t(n.gift.slug === "divin" ? "giftSealedDivin" : "giftSealedApocalypse", { name }),
          href: `/ouvrir/${n.gift.slug}?sachet=${n.gift.dropId}`,
        };
      }
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
    case "AMBASSADOR_GRANTED":
      // Rôle donné par l'équipe : l'accueil montre le pack hebdomadaire
      return { text: t("ambassadorGranted"), href: "/" };
    case "LOT_GRANTED":
      // Cadeau de l'équipe : l'admin qui l'envoie n'est jamais nommé
      return { text: t("teamGift"), href: "/compte/historique" };
    case "TEAM_GIFT":
      if (n.team?.kind === "BOOSTER") {
        const slug = n.team.boosterSlug;
        return { text: t("teamGiftBoosters", { count: n.team.quantity }), href: slug && !SEALED_SLUGS.has(slug) ? `/ouvrir/${slug}?credit=1` : "/" };
      }
      // Le panneau de l'Encens est sur l'accueil
      if (n.team?.kind === "INCENSE") return { text: t("teamGiftIncense", { count: n.team.quantity }), href: "/" };
      return {
        text: t("teamGiftCards", { count: n.team?.quantity ?? 1, card: n.card?.name ?? t("aCard") }),
        href: n.card ? `/collection/${n.card.anilistId}` : "/collection",
      };
    case "TRADE_PROPOSED":
    case "TRADE_ACCEPTED":
    case "TRADE_DECLINED": {
      const key = n.type === "TRADE_PROPOSED" ? "tradeProposed" : n.type === "TRADE_ACCEPTED" ? "tradeAccepted" : "tradeDeclined";
      return { text: t(key, { name, card: n.card?.name ?? t("aCard") }), href: "/amis?onglet=echanges" };
    }
    case "LISTING_OFFER":
    case "LISTING_ACCEPTED":
    case "LISTING_DECLINED": {
      const key = n.type === "LISTING_OFFER" ? "listingOffer" : n.type === "LISTING_ACCEPTED" ? "listingAccepted" : "listingDeclined";
      const values = { name, card: n.card?.name ?? t("aCard"), offered: n.offeredCard?.name ?? t("aCard") };
      return { text: t(key, values), href: "/marche?onglet=mes-echanges" };
    }
    case "COINFLIP_INVITE":
    case "COINFLIP_RESOLVED":
    case "COINFLIP_RETURNED": {
      const card = n.card?.name ?? t("aCard");
      const table = n.coinFlip ? `/casino/pile-ou-face/${n.coinFlip.flipId}` : "/casino/pile-ou-face";
      if (n.type === "COINFLIP_INVITE") return { text: t("coinFlipInvite", { name, card }), href: table };
      // L'issue n'est jamais dans le texte : la pièce se rejoue sur la page de la table
      if (n.type === "COINFLIP_RESOLVED") return { text: t("coinFlipResolved", { name, card }), href: table };
      const reason = n.coinFlip?.reason;
      const key = reason === "DECLINED" ? "coinFlipDeclined" : reason === "ADMIN" ? "coinFlipAdmin" : "coinFlipExpired";
      return { text: t(key, { name, card }), href: n.card ? `/collection/${n.card.anilistId}` : "/collection" };
    }
    case "EXPEDITION_RETURNED": {
      // Le résultat se révèle sur la page : la notification ne le dévoile qu'à moitié
      const outcome = n.expedition?.outcome;
      const key = outcome === "TRIUMPH" ? "expeditionTriumph" : outcome === "SUCCESS" ? "expeditionSuccess" : outcome === "FAILURE" ? "expeditionFailure" : "expeditionReturned";
      return { text: t(key), href: "/expedition" };
    }
    case "BUY_ORDER_FILLED":
    case "BUY_ORDER_EXPIRED":
    case "BUY_ORDER_WANTED": {
      const values = { name, card: n.card?.name ?? t("aCard"), amount: n.buyOrder?.amount ?? 0 };
      if (n.type === "BUY_ORDER_EXPIRED") return { text: t("buyOrderExpired", values), href: "/marche?onglet=avis" };
      // La carte arrive dans la collection de l'acheteur ; le détenteur la vend depuis sa fiche de collection
      return {
        text: t(n.type === "BUY_ORDER_FILLED" ? "buyOrderFilled" : "buyOrderWanted", values),
        href: n.card ? `/collection/${n.card.anilistId}` : "/marche?onglet=avis",
      };
    }
    case "SEALED_OPENED": {
      // Cadeau empoisonné : celui qui a offert le sachet apprend ce qu'il a donné
      const key = n.sealed?.outcome === "RUINED" ? "sealedRuined" : n.sealed?.outcome === "SPARED" ? "sealedSpared" : "sealedDivin";
      const values = { name, card: n.card?.name ?? t("aCard"), rarity: n.card ? tr.rarity(n.card.rarity) : "" };
      return { text: t(key, values), href: n.actor ? `/u/${n.actor.username}` : "/amis" };
    }
  }
}
