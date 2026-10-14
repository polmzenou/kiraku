import { z } from "zod";
import { localizedSchema } from "@/lib/boosters/types";
import { periodWindow } from "./period";

// Boutique : disponibilité d'un article et limites d'achat par joueur. Pur : shop-core.ts relit et
// recompte tout sous verrou, la page s'en sert pour l'affichage.

export const SHOP_LIMIT_PERIODS = ["ONCE", "DAILY", "WEEKLY"] as const;
export type ShopLimitPeriod = (typeof SHOP_LIMIT_PERIODS)[number];

export type ShopItemRules = {
  active: boolean;
  priceZeni: number | null;
  perUserLimit: number | null;
  limitPeriod: ShopLimitPeriod | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

/** En vente en Zeni à l'instant `now` (actif, dans ses dates, avec un prix en Zeni). */
export function onSaleForZeni(item: ShopItemRules, now: Date): boolean {
  if (!item.active || item.priceZeni === null) return false;
  if (item.startsAt && item.startsAt > now) return false;
  if (item.endsAt && item.endsAt <= now) return false;
  return true;
}

/**
 * Fenêtre comptée par la limite d'achat : « all » pour une limite à vie (ou sans limite), sinon
 * le jour ou la semaine du jeu.
 */
export function limitPeriodKey(limitPeriod: ShopLimitPeriod | null, now: Date, timeZone: string): string {
  if (limitPeriod === "DAILY") return periodWindow("DAILY", now, timeZone).key;
  if (limitPeriod === "WEEKLY") return periodWindow("WEEKLY", now, timeZone).key;
  return "all";
}

/** Achats encore permis dans la fenêtre ; null = sans limite. */
export function remainingPurchases(perUserLimit: number | null, bought: number): number | null {
  if (perUserLimit === null) return null;
  return Math.max(0, perUserLimit - bought);
}

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const longLocalized = z.object({ fr: z.string().trim().max(240), en: z.string().trim().max(240) }).strict();

export const shopItemInputSchema = z
  .object({
    id: id.optional(),
    slug: z.string().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: localizedSchema,
    description: longLocalized,
    lotId: id,
    priceZeni: z.number().int().min(1).max(10_000_000).nullable(),
    // Paiement par carte : enregistré mais inerte tant qu'aucun fournisseur n'est branché
    priceCents: z.number().int().min(50).max(100_000).nullable(),
    stripePriceId: z.string().regex(/^price_[A-Za-z0-9]{1,60}$/).nullable(),
    perUserLimit: z.number().int().min(1).max(1_000).nullable(),
    limitPeriod: z.enum(SHOP_LIMIT_PERIODS).nullable(),
    startsAt: z.coerce.date().nullable(),
    endsAt: z.coerce.date().nullable(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict()
  .refine((i) => (i.perUserLimit === null) === (i.limitPeriod === null), {
    message: "Une limite d'achat va avec sa période",
    path: ["limitPeriod"],
  })
  .refine((i) => !i.startsAt || !i.endsAt || i.startsAt < i.endsAt, { message: "Dates inversées", path: ["endsAt"] })
  .refine((i) => i.priceZeni !== null || i.priceCents !== null, { message: "Un article a au moins un prix", path: ["priceZeni"] });
export type ShopItemInput = z.infer<typeof shopItemInputSchema>;
