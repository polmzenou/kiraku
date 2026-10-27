import "server-only";
import { effectiveSlotFloors } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { parseLotItemRow, type LotItemInput } from "@/lib/economy/lots";
import { shopContentIssue, type ShopContentIssue, type ShopContentLine } from "@/lib/economy/shop";
import { lotSaleIssue, type ShopBoosterType, type ShopLot } from "@/lib/economy/shop-view";
import { getBoosterOffers } from "../boosters/pools";
import { getRarityDefinitions } from "../catalog/rarities";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Règle de vente de la boutique côté serveur : la page masque ce qui ne se vend plus, l'achat le
// refuse et l'admin ne peut pas mettre en vente un sachet scellé ni du Mythique.

/** Types de booster par slug, tels que la boutique les juge : offre du moment et planchers effectifs. */
export async function loadShopTypes(): Promise<Map<string, ShopBoosterType>> {
  const [offers, globalFloors] = await Promise.all([getBoosterOffers(), getSetting("booster.slotFloors")]);
  return new Map(
    offers.map((o) => [
      o.type.slug,
      {
        id: o.type.id,
        kind: o.type.kind,
        family: o.type.family,
        floors: effectiveSlotFloors(o.type.slotFloors, globalFloors),
        poolSize: o.size,
        availability: o.availability,
        rotation: o.rotation,
        usesFreeStock: o.type.usesFreeStock,
        priceZeni: o.type.priceZeni,
      },
    ]),
  );
}

const ITEM_SELECT = {
  kind: true,
  boosterTypeId: true,
  cardId: true,
  rarity: true,
  quantity: true,
  boosterType: { select: { slug: true } },
  card: { select: { rarity: true } },
} as const;

type ItemRow = {
  kind: string;
  boosterTypeId: string | null;
  cardId: string | null;
  rarity: string | null;
  quantity: number;
  boosterType: { slug: string } | null;
  card: { rarity: string } | null;
};

/** Contenu d'un lot pour la décision de vente ; les lignes invalides sont ignorées, comme au versement. */
export function lotSaleContent(rows: readonly ItemRow[]): Pick<ShopLot<unknown>, "boosters" | "cards"> {
  const boosters: { slug: string; quantity: number }[] = [];
  const cards: { kind: "CARD" | "RARITY_CARD"; rarity: Rarity }[] = [];
  for (const row of rows) {
    const item = parseLotItemRow(row);
    if (!item) continue;
    if (item.kind === "BOOSTER") {
      if (row.boosterType) boosters.push({ slug: row.boosterType.slug, quantity: item.quantity });
    } else if (item.kind === "CARD") {
      if (row.card) cards.push({ kind: "CARD", rarity: row.card.rarity });
    } else {
      cards.push({ kind: "RARITY_CARD", rarity: item.rarity });
    }
  }
  return { boosters, cards };
}

/**
 * Raison de refuser la vente d'un article à cet instant, ou null. L'achat la vérifie avant la
 * transaction (shop-core recompte le reste sous verrou) : un article masqué par la page ne s'achète pas.
 */
export async function loadShopItemIssue(shopItemId: string): Promise<ShopContentIssue | "UNSELLABLE" | null> {
  const item = await prisma.shopItem.findUnique({
    where: { id: shopItemId },
    select: { lot: { select: { items: { select: ITEM_SELECT } } } },
  });
  // Article introuvable : shop-core répond NOT_FOR_SALE dans sa transaction
  if (!item) return null;
  const [types, definitions] = await Promise.all([loadShopTypes(), getRarityDefinitions()]);
  return lotSaleIssue(lotSaleContent(item.lot.items), types, definitions);
}

/**
 * Admin : contenu (enregistré ou saisi) qu'un article de la boutique ne peut pas vendre. Seul le contenu
 * compte ici, pas la disponibilité : on peut préparer le pack d'un type inactif.
 */
export async function itemsContentIssue(items: readonly LotItemInput[]): Promise<ShopContentIssue | null> {
  const typeIds = items.flatMap((i) => (i.kind === "BOOSTER" ? [i.boosterTypeId] : []));
  const cardIds = items.flatMap((i) => (i.kind === "CARD" ? [i.cardId] : []));
  const [types, cards, globalFloors, definitions] = await Promise.all([
    typeIds.length ? prisma.boosterType.findMany({ where: { id: { in: typeIds } }, select: { id: true, kind: true, slotFloors: true } }) : [],
    cardIds.length ? prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true, rarity: true } }) : [],
    getSetting("booster.slotFloors"),
    getRarityDefinitions(),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const rarityById = new Map(cards.map((c) => [c.id, c.rarity]));
  const lines: ShopContentLine[] = items.flatMap((i): ShopContentLine[] => {
    if (i.kind === "BOOSTER") {
      const type = typeById.get(i.boosterTypeId);
      return type ? [{ kind: "BOOSTER", boosterKind: type.kind, floors: effectiveSlotFloors(type.slotFloors, globalFloors) }] : [];
    }
    if (i.kind === "CARD") {
      const rarity = rarityById.get(i.cardId);
      return rarity ? [{ kind: "CARD", rarity }] : [];
    }
    return [{ kind: "RARITY_CARD", rarity: i.rarity }];
  });
  return shopContentIssue(lines, definitions);
}

/** Admin : même contrôle sur le contenu enregistré d'un lot. */
export async function lotContentIssue(lotId: string): Promise<ShopContentIssue | null> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { items: { select: ITEM_SELECT } } });
  if (!lot) return null;
  return itemsContentIssue(lot.items.flatMap((row) => parseLotItemRow(row) ?? []));
}
