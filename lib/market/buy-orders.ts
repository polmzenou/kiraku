import { priceCap, sellerNet, type MarketRules } from "./rules";

// Avis de recherche (ordres d'achat) : règles pures, en entiers. server/market/buy-order-core.ts les
// applique sous verrou ; l'interface s'en sert pour l'affichage (montant bloqué, net du vendeur).

const DAY = 86_400_000;

/** Ce que les avis ajoutent aux règles du marché (GameSetting market.orders*). */
export type BuyOrderRules = {
  enabled: boolean;
  durationDays: number;
  maxOpen: number;
};

export type OrderRefusal = "INVALID_PRICE" | "CAP_REACHED";

/**
 * Prix proposé pour une carte de rareté `rarity` : entier, au moins le prix de départ minimal du marché
 * et au plus son plafond (global et de la rareté), comme une mise en vente.
 */
export function checkOrder(price: number, rules: Pick<MarketRules, "minStartPrice" | "maxPrice" | "maxPriceByRarity">, rarity: string | null): OrderRefusal | null {
  if (!Number.isSafeInteger(price) || price < rules.minStartPrice) return "INVALID_PRICE";
  if (price > priceCap(rules, rarity)) return "CAP_REACHED";
  return null;
}

/** Fin de validité d'un avis publié à `now`. */
export function orderExpiresAt(now: Date, durationDays: number): Date {
  return new Date(now.getTime() + durationDays * DAY);
}

/** Avis encore vendable à `now` (ouvert et pas expiré, même si le cron n'est pas encore passé). */
export function orderOpen(order: { status: string; expiresAt: Date }, now: Date): boolean {
  return order.status === "OPEN" && order.expiresAt > now;
}

type Ranked = { price: number; createdAt: Date; id: string };

/** Priorité prix puis ancienneté : l'offre la plus haute d'abord, à prix égal la plus ancienne. */
export function compareOrders(a: Ranked, b: Ranked): number {
  return b.price - a.price || a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Prévient-on les détenteurs ? Si l'offre dépasse la cote de la carte. Sans cote : toujours, sauf si `rarity` est
 * donné (réglage market.orderAlertRarityRef) : il faut alors dépasser la référence de la rareté, et sans référence
 * personne n'est prévenu (un avis à 1 Zeni sur une carte jamais vendue n'alerte plus 200 joueurs).
 */
export function shouldAlert(price: number, quote: number | null, rarity?: { reference: number | null }): boolean {
  if (quote !== null) return price > quote;
  if (!rarity) return true;
  return rarity.reference !== null && price > rarity.reference;
}

/**
 * Combien de détenteurs un acheteur peut-il encore prévenir, sachant qu'il en a déjà prévenu `sent` sur 24 h ?
 * `perDay` à 0 : sans plafond (réglage market.orderAlertsPerDay).
 */
export function alertsLeft(perDay: number, sent: number): number {
  return perDay <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, perDay - sent);
}

/** Ce que reçoit le vendeur qui remplit un avis à `price` (taxe figée à la création de l'avis). */
export function orderNet(price: number, feeBp: number): number {
  return sellerNet(price, feeBp);
}
