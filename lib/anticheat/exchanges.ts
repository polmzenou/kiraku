// Détail des transferts entre deux comptes (page /admin/multi-comptes/echanges) : les mêmes que ceux que
// compte la détection (server/anticheat/queries.ts) — cadeaux, ventes conclues, pile ou face lancés, échanges
// acceptés —, un par ligne. Fonctions pures : le serveur lit les lignes (server/anticheat/exchanges.ts).

export const EXCHANGE_KINDS = ["gift", "auction", "buyOrder", "flip", "trade", "listing"] as const;
export type ExchangeKind = (typeof EXCHANGE_KINDS)[number];

/** Carte du catalogue ; null si elle n'existe plus ou n'est pas connue (cadeau de booster). */
export type ExchangeCard = { id: string; name: string; rarity: string; publicId: number } | null;

type Base = { id: string; at: Date; fromId: string; toId: string };

/**
 * `fromId` → `toId` : le sens du transfert tel que la détection le compte (donneur → receveur, vendeur → acheteur,
 * perdant → gagnant, auteur de la proposition ou de l'annonce → l'autre).
 */
export type Exchange =
  | (Base & { kind: "gift"; giftKind: "CARD" | "BOOSTER" | "SEALED" | "INCENSE"; card: ExchangeCard; zeni: number })
  | (Base & { kind: "auction" | "buyOrder"; card: ExchangeCard; zeni: number })
  // Le perdant cède `card` ; `kept` est la carte que le gagnant avait misée
  | (Base & { kind: "flip"; card: ExchangeCard; kept: ExchangeCard })
  // `fromId` donne `given` et reçoit `received`
  | (Base & { kind: "trade" | "listing"; given: ExchangeCard; received: ExchangeCard });

/** Les plus récents d'abord ; à date égale, ordre stable par id. */
export function sortExchanges<T extends { at: Date; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((x, y) => y.at.getTime() - x.at.getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

type ExchangeTotals = {
  total: number;
  byKind: Record<ExchangeKind, number>;
  /** Transferts orientés (cadeaux, ventes, pile ou face) de a vers b et de b vers a ; les échanges n'ont pas de sens */
  ab: number;
  ba: number;
  swaps: number;
  /** Zeni versés par les ventes, dans chaque sens (vendeur → acheteur : l'acheteur paie) */
  zeniAb: number;
  zeniBa: number;
};

/** Totaux de la paire (a, b), comptés comme la détection : leur somme est le chiffre de la puce. */
export function exchangeTotals(rows: readonly Exchange[], a: string, b: string): ExchangeTotals {
  const totals: ExchangeTotals = {
    total: 0,
    byKind: { gift: 0, auction: 0, buyOrder: 0, flip: 0, trade: 0, listing: 0 },
    ab: 0,
    ba: 0,
    swaps: 0,
    zeniAb: 0,
    zeniBa: 0,
  };
  for (const r of rows) {
    const forward = r.fromId === a && r.toId === b;
    if (!forward && !(r.fromId === b && r.toId === a)) continue;
    totals.total += 1;
    totals.byKind[r.kind] += 1;
    if (r.kind === "trade" || r.kind === "listing") totals.swaps += 1;
    else if (forward) totals.ab += 1;
    else totals.ba += 1;
    if (r.kind === "auction" || r.kind === "buyOrder") {
      if (forward) totals.zeniAb += r.zeni;
      else totals.zeniBa += r.zeni;
    }
  }
  return totals;
}
