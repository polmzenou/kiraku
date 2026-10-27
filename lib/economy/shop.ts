import { z } from "@/lib/zod";
import { hashSeed } from "@/lib/boosters/rotation";
import { localizedSchema, type Availability, type BoosterKind } from "@/lib/boosters/types";
import type { Rarity } from "@/lib/catalog/rarity";
import { isTopTier } from "@/lib/catalog/tiers";
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

/** « Bientôt fini » : l'article quitte la boutique dans moins de 3 jours. */
export const SHOP_ENDS_SOON_MS = 3 * 86_400_000;

/** Ce que livre un lot, vu par la règle de la boutique (planchers effectifs du booster, rareté d'une carte). */
export type ShopContentLine =
  | { kind: "BOOSTER"; boosterKind: BoosterKind; floors: readonly Rarity[] }
  | { kind: "CARD" | "RARITY_CARD"; rarity: Rarity };

export type ShopContentIssue = "SEALED" | "MYTHIC";

/**
 * Règle propre à la boutique : jamais de sachet scellé (Divin, Apocalyptique), ni de Mythique ou au-dessus,
 * qu'il soit garanti par un booster (plancher) ou donné en carte. Les lots des missions, du classé et du
 * parrainage peuvent en contenir : la règle ne vaut que pour ce qui se vend.
 */
export function shopContentIssue(
  lines: readonly ShopContentLine[],
  definitions: readonly { key: string; sortOrder: number }[],
): ShopContentIssue | null {
  if (lines.some((l) => l.kind === "BOOSTER" && l.boosterKind === "DROP")) return "SEALED";
  const rarities = lines.flatMap((l) => (l.kind === "BOOSTER" ? l.floors : [l.rarity]));
  return rarities.some((r) => isTopTier(r, definitions)) ? "MYTHIC" : null;
}

/** Offre d'un type de booster telle que la boutique la lit (getBoosterOffers). */
export type PackOffer = {
  availability: Availability;
  rotation: "featured" | "resting" | null;
  usesFreeStock: boolean;
  priceZeni: number | null;
};

/**
 * Un pack se vend tant que son booster s'ouvre, ou s'il est seulement au repos dans la rotation : la
 * boutique donne accès aux boosters hors sélection. Inactif, hors dates, pool trop petit ou réservé
 * aux événements : plus en vente.
 */
export function packSellable(offer: PackOffer | null | undefined): boolean {
  if (!offer) return false;
  if (offer.availability === "open") return true;
  return offer.rotation === "resting" && (offer.usesFreeStock || offer.priceZeni !== null);
}

/**
 * Prix barré d'un pack (quantité × prix unitaire du type) et remise en fraction (0,1 = 10 %), déduits des
 * prix en base : rien n'est écrit en dur. Pas d'économie, ou moins de 1 % : ni prix barré ni remise.
 */
export function packPricing(input: { price: number; quantity: number; unitPrice: number | null }): {
  reference: number | null;
  discount: number | null;
} {
  const { price, quantity, unitPrice } = input;
  if (unitPrice === null || unitPrice <= 0 || quantity <= 0) return { reference: null, discount: null };
  const reference = unitPrice * quantity;
  const discount = Math.round((1 - price / reference) * 100) / 100;
  return discount < 0.01 ? { reference: null, discount: null } : { reference, discount };
}

/** Veille d'un jour du jeu (« 2026-10-27 » → « 2026-10-26 »), sans fuseau : simple arithmétique de calendrier. */
export function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

function rendezvous(ids: readonly string[], dayKey: string): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const id of ids) {
    const score = hashSeed(`shop-featured:${dayKey}:${id}`);
    if (score > bestScore || (score === bestScore && best !== null && id < best)) [best, bestScore] = [id, score];
  }
  return best;
}

/** Jours remontés pour retrouver la vedette de la veille (31 × n hachages : rien à l'échelle d'une page). */
const FEATURED_MEMORY = 30;

/** Numéro du jour (« 2026-10-27 ») depuis l'époque Unix, sans fuseau. */
function dayNumber(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function pickOn(ids: readonly string[], dayKey: string, depth: number): string | null {
  if (ids.length < 2) return ids[0] ?? null;
  const yesterday = depth > 0 ? pickOn(ids, previousDayKey(dayKey), depth - 1) : null;
  return rendezvous(
    ids.filter((id) => id !== yesterday),
    dayKey,
  );
}

/**
 * Vedette du jour, la même pour tous : l'article au plus grand hash du jour (hachage de rendez-vous),
 * sans reprendre celle de la veille. Retirer un article qui n'a pas été en vedette ces derniers jours
 * ne la change pas.
 */
export function featuredPick(ids: readonly string[], dayKey: string): string | null {
  const unique = [...new Set(ids)].sort();
  // Deux candidats : la chaîne des veilles se contredirait un jour sur deux, une simple alternance suffit
  if (unique.length === 2) return unique[dayNumber(dayKey) % 2];
  return pickOn(unique, dayKey, FEATURED_MEMORY);
}

const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const longLocalized = z.object({ fr: z.string().trim().max(240), en: z.string().trim().max(240) }).strict();

/** Description d'un article : 240 caractères par langue, français vide permis (comme le formulaire admin). */
export function parseShopText(raw: unknown): { fr: string; en: string } {
  const parsed = longLocalized.safeParse(raw);
  return parsed.success ? parsed.data : { fr: "", en: "" };
}

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
