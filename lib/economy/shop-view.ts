import { OPEN_COUNTS } from "@/lib/boosters/catalog";
import { BOOSTER_FAMILIES, type BoosterFamily, type BoosterKind } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { periodWindow } from "./period";
import {
  featuredPick,
  limitPeriodKey,
  packPricing,
  packSellable,
  remainingPurchases,
  SHOP_ENDS_SOON_MS,
  shopContentIssue,
  type PackOffer,
  type ShopContentIssue,
  type ShopLimitPeriod,
} from "./shop";

// Vue de la boutique : articles en vente regroupés par famille de booster, vedette de la sélection,
// remises, achats restants et crédits déjà possédés. Pur : la page charge les données, l'achat
// (shop-guard) reprend la même décision de vente.

/** Type de booster tel que la boutique le lit : offre du moment et planchers effectifs. */
export type ShopBoosterType = PackOffer & {
  id: string;
  kind: BoosterKind;
  family: BoosterFamily;
  /** Planchers effectifs : ceux du type, sinon le réglage global booster.slotFloors. */
  floors: readonly Rarity[];
  poolSize: number;
};

/** Contenu d'un lot pour la décision de vente ; `lot` (LotView) est seulement transmis à l'affichage. */
export type ShopLot<L> = {
  lot: L;
  zeni: number;
  boosters: readonly { slug: string; quantity: number }[];
  cards: readonly { kind: "CARD" | "RARITY_CARD"; rarity: Rarity }[];
};

export type ShopItemRow = {
  id: string;
  /** Nom et description déjà traduits. */
  name: string;
  description: string;
  lotId: string;
  priceZeni: number;
  perUserLimit: number | null;
  limitPeriod: ShopLimitPeriod | null;
  endsAt: Date | null;
};

export type ShopCard<L> = {
  id: string;
  name: string;
  description: string;
  lot: L;
  price: number;
  /** Pack d'un seul type : prix barré (quantité × prix unitaire) et remise en fraction. */
  reference: number | null;
  discount: number | null;
  /** Limite d'achat et fin de sa fenêtre (null pour une limite à vie). */
  limit: { perUser: number; period: ShopLimitPeriod; resetsAt: Date | null } | null;
  /** Achats encore permis ; null = sans limite. */
  remaining: number | null;
  endsAt: Date | null;
  endsSoon: boolean;
  /** Premier booster du lot : section, pool et crédits déjà possédés de ce type. */
  booster: { slug: string; quantity: number; family: ShopSectionKey; kind: BoosterKind; poolSize: number; owned: number } | null;
  /** Ouverture des boosters achetés (crédits), quantité présélectionnée quand le sélecteur la propose. */
  openHref: string | null;
  featured: boolean;
};

export type ShopSectionKey = BoosterFamily | "other";

export type ShopView<L> = {
  featured: ShopCard<L> | null;
  sections: { key: ShopSectionKey; cards: ShopCard<L>[] }[];
};

/** Lot affiché (LotView, ou un lot factice de l'aperçu) → contenu pour la décision de vente. */
export function shopLotFrom<
  L extends {
    zeni: number;
    lines: readonly (
      | { kind: "BOOSTER"; quantity: number; look: { slug: string } }
      | { kind: "CARD" | "RARITY_CARD"; quantity: number; rarity: Rarity }
    )[];
  },
>(lot: L): ShopLot<L> {
  return {
    lot,
    zeni: lot.zeni,
    boosters: lot.lines.flatMap((l) => (l.kind === "BOOSTER" ? [{ slug: l.look.slug, quantity: l.quantity }] : [])),
    cards: lot.lines.flatMap((l) => (l.kind === "BOOSTER" ? [] : [{ kind: l.kind, rarity: l.rarity }])),
  };
}

/** Clé des achats comptés d'un joueur : article et fenêtre de sa limite. */
export function purchaseKey(shopItemId: string, periodKey: string): string {
  return `${shopItemId}:${periodKey}`;
}

/**
 * Décision de vente d'un lot, partagée par la page et l'achat : ses boosters doivent s'ouvrir en ce
 * moment (sélection du moment pour les familles tournantes) et son contenu respecter la règle de la boutique.
 */
export function lotSaleIssue(
  lot: Pick<ShopLot<unknown>, "boosters" | "cards">,
  types: ReadonlyMap<string, ShopBoosterType>,
  definitions: readonly { key: string; sortOrder: number }[],
): ShopContentIssue | "UNSELLABLE" | null {
  const resolved: ShopBoosterType[] = [];
  for (const line of lot.boosters) {
    const type = types.get(line.slug);
    if (!type || !packSellable(type)) return "UNSELLABLE";
    resolved.push(type);
  }
  return shopContentIssue(
    [...resolved.map((t) => ({ kind: "BOOSTER" as const, boosterKind: t.kind, floors: t.floors })), ...lot.cards],
    definitions,
  );
}

export function buildShopView<L>(input: {
  /** Articles en vente (onSaleForZeni), dans l'ordre d'affichage. */
  items: readonly ShopItemRow[];
  lots: ReadonlyMap<string, ShopLot<L>>;
  /** Par slug. */
  types: ReadonlyMap<string, ShopBoosterType>;
  /** purchaseKey(article, fenêtre) → achats du joueur. */
  bought: ReadonlyMap<string, number>;
  /** Crédits du joueur par id de type. */
  credits: ReadonlyMap<string, number>;
  definitions: readonly { key: string; sortOrder: number }[];
  now: Date;
  timeZone: string;
  /** Fenêtre de rotation en cours (rotationWindow().index) : la vedette change avec la sélection. */
  turn: number;
}): ShopView<L> {
  const { now, timeZone } = input;
  const cards: ShopCard<L>[] = [];
  const candidates: string[] = [];

  for (const item of input.items) {
    const content = input.lots.get(item.lotId);
    if (!content || lotSaleIssue(content, input.types, input.definitions)) continue;

    const first = content.boosters[0];
    const type = first ? input.types.get(first.slug)! : null;
    const single = content.boosters.length === 1 && content.cards.length === 0 && content.zeni === 0;
    const pricing = single && type ? packPricing({ price: item.priceZeni, quantity: first.quantity, unitPrice: type.priceZeni }) : null;

    const limit =
      item.perUserLimit !== null && item.limitPeriod !== null
        ? {
            perUser: item.perUserLimit,
            period: item.limitPeriod,
            resetsAt: item.limitPeriod === "ONCE" ? null : periodWindow(item.limitPeriod, now, timeZone).end,
          }
        : null;
    const bought = limit ? (input.bought.get(purchaseKey(item.id, limitPeriodKey(limit.period, now, timeZone))) ?? 0) : 0;

    // Vedette : un pack d'un seul type thématique ou format, jamais selon l'état du joueur
    if (single && type && type.kind !== "STANDARD") candidates.push(item.id);

    cards.push({
      id: item.id,
      name: item.name,
      description: item.description,
      lot: content.lot,
      price: item.priceZeni,
      reference: pricing?.reference ?? null,
      discount: pricing?.discount ?? null,
      limit,
      remaining: remainingPurchases(limit?.perUser ?? null, bought),
      endsAt: item.endsAt,
      endsSoon: item.endsAt !== null && item.endsAt.getTime() - now.getTime() < SHOP_ENDS_SOON_MS,
      booster:
        first && type
          ? {
              slug: first.slug,
              quantity: first.quantity,
              // Impérial (Prestige) : rangé dans « Fuda et extras », pas dans sa famille de boosters
              family: type.kind === "PRESTIGE" ? "other" : type.family,
              kind: type.kind,
              poolSize: type.poolSize,
              owned: input.credits.get(type.id) ?? 0,
            }
          : null,
      openHref: first
        ? `/ouvrir/${first.slug}?credit=1${(OPEN_COUNTS as readonly number[]).includes(first.quantity) ? `&n=${first.quantity}` : ""}`
        : null,
      featured: false,
    });
  }

  const featuredId = featuredPick(candidates, input.turn);
  const featured = cards.find((c) => c.id === featuredId) ?? null;
  if (featured) featured.featured = true;

  const order: ShopSectionKey[] = [...BOOSTER_FAMILIES, "other"];
  const sections = order
    .map((key) => ({ key, cards: cards.filter((c) => (c.booster?.family ?? "other") === key) }))
    .filter((s) => s.cards.length > 0);
  return { featured, sections };
}
