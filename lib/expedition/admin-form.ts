import { z } from "@/lib/zod";
import { rarityKeySchema } from "@/lib/catalog/definitions";
import { localizedSchema, slugSchema } from "@/lib/boosters/types";
import { EXPEDITION_RISKS } from "./types";

// Formulaire d'un modèle d'expédition (/admin/expeditions) : partagé par le client et l'action serveur.

export const MAX_EXPEDITION_MINUTES = 72 * 60;
export const MAX_EXPEDITION_ZENI = 1_000_000;
/** Triomphe à 500 % compris, sous le plafond de grantBoosters (1 000, server/economy/credits.ts). */
export const MAX_EXPEDITION_BOOSTERS = 200;

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const pct = z.number().int().min(0).max(100);

export const loreSchema = z.object({ fr: z.string().trim().max(200), en: z.string().trim().max(200) }).strict();

export const expeditionTypeInputSchema = z
  .object({
    id: id.optional(),
    slug: slugSchema,
    name: localizedSchema,
    lore: loreSchema,
    minRarity: rarityKeySchema,
    risk: z.enum(EXPEDITION_RISKS),
    durationMinutes: z.number().int().min(1).max(MAX_EXPEDITION_MINUTES),
    baseSuccessPct: pct,
    maxSuccessPct: pct,
    maxTriumphPct: pct,
    minDiscoveryPct: pct,
    zeni: z.number().int().min(0).max(MAX_EXPEDITION_ZENI),
    boosterTypeId: id,
    boosters: z.number().int().min(0).max(MAX_EXPEDITION_BOOSTERS),
    extraLotId: id.nullable(),
    weight: z.number().int().min(0).max(1_000),
    active: z.boolean(),
    sortOrder: z.number().int().min(-10_000).max(10_000),
  })
  .strict()
  .refine((t) => t.baseSuccessPct <= t.maxSuccessPct, { message: "La base dépasse le plafond", path: ["baseSuccessPct"] })
  .refine((t) => t.risk !== "SAFE" || (t.baseSuccessPct === 100 && t.maxSuccessPct === 100), {
    message: "Une expédition sûre réussit toujours : base et plafond à 100 %",
    path: ["risk"],
  })
  .refine((t) => t.zeni > 0 || t.boosters > 0 || t.extraLotId !== null, { message: "Une expédition sans gain", path: ["zeni"] });

export type ExpeditionTypeInput = z.infer<typeof expeditionTypeInputSchema>;
