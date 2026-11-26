import { noteSchema } from "@/lib/text/note-schema";
import { USERNAME_REGEX } from "@/lib/username";
import { z } from "@/lib/zod";
import type { Rarity } from "@/lib/catalog/rarity";
import { slugSchema } from "./types";

// Boosters garantis (kind GUARANTEED) : un par rareté de variante, jamais proposés ni vendus. L'admin
// les donne depuis /admin/boosters/garantis ; le joueur les ouvre depuis ses boosters crédités.

/** Boosters garantis donnés d'un coup au plus. */
export const GUARANTEE_GRANT_MAX = 50;

/** Don d'un booster garanti : type, pseudo du joueur, quantité, raison (journal) et mot au joueur. */
export const guaranteeGrantSchema = z
  .object({
    slug: slugSchema,
    username: z.string().trim().regex(USERNAME_REGEX),
    quantity: z.number().int().min(1).max(GUARANTEE_GRANT_MAX),
    reason: z.string().trim().min(1).max(300),
    message: noteSchema,
  })
  .strict();

/** Cartes de la rareté garantie dans le pool du type (poolCounts en base, { COMMON: n, … }). */
export function guaranteedPoolCount(poolCounts: unknown, rarity: Rarity): number {
  if (!poolCounts || typeof poolCounts !== "object") return 0;
  const n = (poolCounts as Record<string, unknown>)[rarity];
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0;
}
