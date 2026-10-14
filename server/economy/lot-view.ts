import "server-only";
import { contentsLabel } from "@/lib/boosters/catalog";
import { localize, parseLocalized, parseTheme, type BoosterShape, type BoosterTheme } from "@/lib/boosters/types";
import type { CardView } from "@/lib/boosters/view";
import type { Rarity } from "@/lib/catalog/rarity";
import { parseLotItemRow } from "@/lib/economy/lots";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Contenu des lots pour l'affichage (missions, boutique, parrainage, admin), dans la langue du lecteur.

/** De quoi dessiner le sachet d'un booster (BoosterArt). */
export type BoosterLook = { slug: string; shape: BoosterShape; theme: BoosterTheme; emblem: string; contents: string };

export type LotLine =
  | { kind: "BOOSTER"; quantity: number; name: string; look: BoosterLook }
  | { kind: "CARD"; quantity: number; name: string; rarity: Rarity; card: CardView | null }
  | { kind: "RARITY_CARD"; quantity: number; rarity: Rarity };

export type LotView = { id: string; name: string; zeni: number; lines: LotLine[] };

export async function lotViews(lotIds: readonly string[], locale: string): Promise<Map<string, LotView>> {
  const ids = [...new Set(lotIds)];
  if (ids.length === 0) return new Map();
  const [lots, globalFloors] = await Promise.all([
    prisma.lot.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        zeni: true,
        items: {
          orderBy: { id: "asc" },
          select: {
            kind: true,
            boosterTypeId: true,
            cardId: true,
            rarity: true,
            quantity: true,
            boosterType: { select: { slug: true, name: true, shape: true, theme: true, emblem: true, slotFloors: true } },
            card: { select: { name: true, rarity: true } },
          },
        },
      },
    }),
    getSetting("booster.slotFloors"),
  ]);
  const cards = await cardViews(
    lots.flatMap((l) => l.items.flatMap((i) => (i.kind === "CARD" && i.cardId ? [i.cardId] : []))),
    locale,
  );

  return new Map(
    lots.map((lot) => [
      lot.id,
      {
        id: lot.id,
        name: localize(parseLocalized(lot.name), locale),
        zeni: lot.zeni,
        lines: lot.items.flatMap((row): LotLine[] => {
          const item = parseLotItemRow(row);
          if (!item) return [];
          if (item.kind === "BOOSTER") {
            const type = row.boosterType;
            if (!type) return [];
            const look: BoosterLook = {
              slug: type.slug,
              shape: type.shape,
              theme: parseTheme(type.theme),
              emblem: type.emblem,
              contents: contentsLabel(type.slotFloors.length > 0 ? type.slotFloors.length : globalFloors.length),
            };
            return [{ kind: "BOOSTER", quantity: item.quantity, name: localize(parseLocalized(type.name), locale), look }];
          }
          if (item.kind === "CARD") {
            return row.card
              ? [{ kind: "CARD", quantity: item.quantity, name: row.card.name, rarity: row.card.rarity as Rarity, card: cards.get(item.cardId) ?? null }]
              : [];
          }
          return [{ kind: "RARITY_CARD", quantity: item.quantity, rarity: item.rarity }];
        }),
      },
    ]),
  );
}
