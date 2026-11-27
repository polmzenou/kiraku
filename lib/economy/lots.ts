import { rarityKeySchema } from "@/lib/catalog/definitions";
import { z } from "@/lib/zod";
import { localizedSchema } from "@/lib/boosters/types";

// Lots : récompense réutilisable (missions, parrainage, boutique). Zeni, boosters d'un type,
// cartes précises ou cartes tirées dans une rareté. Saisis dans /admin/lots.

export const MAX_LOT_ITEMS = 10;
export const MAX_LOT_QUANTITY = 50;
/**
 * Boosters d'une ligne : un seul crédit (ou une ligne par sachet scellé), d'où un plafond plus haut que pour les cartes.
 * Les paliers de lanternes de l'Ennichi versent jusqu'à 250 boosters d'un coup (choisis le 2026-11-23).
 */
export const MAX_LOT_BOOSTERS = 500;
export const MAX_LOT_ZENI = 1_000_000;

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const quantity = z.number().int().min(1).max(MAX_LOT_QUANTITY);
const boosterQuantity = z.number().int().min(1).max(MAX_LOT_BOOSTERS);

export const lotItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("BOOSTER"), boosterTypeId: id, quantity: boosterQuantity }).strict(),
  z.object({ kind: z.literal("CARD"), cardId: id, quantity }).strict(),
  z.object({ kind: z.literal("RARITY_CARD"), rarity: rarityKeySchema, quantity }).strict(),
]);
export type LotItemInput = z.infer<typeof lotItemSchema>;

export const lotInputSchema = z
  .object({
    id: id.optional(),
    name: localizedSchema,
    zeni: z.number().int().min(0).max(MAX_LOT_ZENI),
    items: z.array(lotItemSchema).max(MAX_LOT_ITEMS),
    active: z.boolean(),
  })
  .strict()
  .refine((lot) => lot.zeni > 0 || lot.items.length > 0, { message: "Un lot vide ne récompense rien" });
export type LotInput = z.infer<typeof lotInputSchema>;

/** Ligne de base → élément valide, ou null si la ligne est incohérente (ignorée au versement). */
export function parseLotItemRow(row: {
  kind: string;
  boosterTypeId: string | null;
  cardId: string | null;
  rarity: string | null;
  quantity: number;
}): LotItemInput | null {
  const parsed = lotItemSchema.safeParse(
    row.kind === "BOOSTER"
      ? { kind: "BOOSTER", boosterTypeId: row.boosterTypeId, quantity: row.quantity }
      : row.kind === "CARD"
        ? { kind: "CARD", cardId: row.cardId, quantity: row.quantity }
        : { kind: "RARITY_CARD", rarity: row.rarity, quantity: row.quantity },
  );
  return parsed.success ? parsed.data : null;
}
