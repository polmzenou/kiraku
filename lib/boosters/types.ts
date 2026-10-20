import { rarityKeySchema } from "@/lib/catalog/definitions";
import { z } from "@/lib/zod";
import { type Rarity } from "@/lib/catalog/rarity";
import type { PoolFilter } from "./pool-filter";

// Types de boosters (modèle BoosterType) : familles, thème du sachet, prix et disponibilité.
// Fonctions pures partagées par la page (affichage du coût) et le serveur (qui recalcule tout).

export const BOOSTER_FAMILIES = [
  "standard",
  "formats",
  "rarete",
  "demographie",
  "genre",
  "personnage",
  "epoque",
  "special",
] as const;
export type BoosterFamily = (typeof BOOSTER_FAMILIES)[number];

/** Kanji vertical du titre de chaque famille (縦書き). */
export const FAMILY_KANJI: Record<BoosterFamily, string> = {
  standard: "定番",
  formats: "形",
  rarete: "稀少",
  demographie: "読者",
  genre: "類",
  personnage: "人物",
  epoque: "時代",
  special: "特別",
};

export const BOOSTER_KINDS = ["STANDARD", "RARITY", "FILTERED", "BANNER", "FORMAT"] as const;
export type BoosterKind = (typeof BOOSTER_KINDS)[number];

export const BOOSTER_SHAPES = ["SACHET", "POCHIBUKURO", "JUBAKO"] as const;
export type BoosterShape = (typeof BOOSTER_SHAPES)[number];

/** Motifs traditionnels (wagara) dessinés en CSS (classes .wagara-*), plus or, nacre et uni. */
export const WAGARA = [
  "asanoha",
  "seigaiha",
  "ichimatsu",
  "shippo",
  "uroko",
  "yagasuri",
  "kumo",
  "sakura",
  "kin",
  "raden",
  "none",
] as const;
export type Wagara = (typeof WAGARA)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Thème d'un sachet : liste fermée, jamais de CSS libre venant de l'admin. */
export const boosterThemeSchema = z
  .object({
    /** Teinte métallisée et son ombre (dégradé du sachet). */
    base: hex,
    dark: hex,
    pattern: z.enum(WAGARA),
    /** Encre du texte sur le sachet : claire sur fond sombre, sombre sur fond clair (Shōjo, Mythique…). */
    ink: z.enum(["light", "dark"]),
  })
  .strict();
export type BoosterTheme = z.infer<typeof boosterThemeSchema>;

export const FALLBACK_THEME: BoosterTheme = { base: "#C8372D", dark: "#5E1712", pattern: "asanoha", ink: "light" };

export function parseTheme(raw: unknown): BoosterTheme {
  const parsed = boosterThemeSchema.safeParse(raw);
  return parsed.success ? parsed.data : FALLBACK_THEME;
}

/** Texte saisi dans l'admin en français et en anglais (repli sur le français). */
export const localizedSchema = z.object({ fr: z.string().trim().min(1).max(80), en: z.string().trim().max(80) }).strict();
export type Localized = z.infer<typeof localizedSchema>;

export function parseLocalized(raw: unknown, fallback = ""): Localized {
  const parsed = localizedSchema.safeParse(raw);
  return parsed.success ? parsed.data : { fr: fallback, en: "" };
}

export function localize(value: Localized, locale: string): string {
  return (locale === "en" && value.en) || value.fr;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z.string().min(2).max(40).regex(SLUG_PATTERN);

/** Un type de booster tel que l'utilisent la page, le tirage et l'admin (données validées). */
export type BoosterTypeView = {
  id: string;
  slug: string;
  kind: BoosterKind;
  family: BoosterFamily;
  sortOrder: number;
  name: Localized;
  tagline: Localized;
  emblem: string;
  shape: BoosterShape;
  theme: BoosterTheme;
  /** null : filtre invalide en base, le type ne propose rien. */
  filter: PoolFilter | null;
  /** Planchers propres au type ; vide = réglage global booster.slotFloors. */
  slotFloors: Rarity[];
  usesFreeStock: boolean;
  priceZeni: number | null;
  countsForPity: boolean;
  bonusEligible: boolean;
  featuredCardIds: string[];
  featuredRate: number;
  featuredPity: number;
  minPoolSize: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

export function isRarity(value: string): value is Rarity {
  return rarityKeySchema.safeParse(value).success;
}

/** Planchers effectifs : ceux du type, sinon le réglage global. */
export function effectiveSlotFloors(own: readonly Rarity[], global: readonly Rarity[]): Rarity[] {
  return own.length > 0 ? [...own] : [...global];
}

export type Price = { kind: "free" } | { kind: "zeni"; amount: number } | { kind: "unavailable" };

/**
 * Coût d'une ouverture de `count` boosters : gratuit tant que le stock couvre toute l'ouverture
 * (types gratuits), sinon le prix en Zeni s'il existe. Le serveur recalcule ce coût sous verrou.
 */
export function priceFor(
  type: Pick<BoosterTypeView, "usesFreeStock" | "priceZeni">,
  stock: number,
  count: number,
): Price {
  if (type.usesFreeStock && stock >= count) return { kind: "free" };
  if (type.priceZeni !== null && type.priceZeni >= 0) return { kind: "zeni", amount: type.priceZeni * count };
  return { kind: "unavailable" };
}

/** open : ouvrable · locked : visible mais réservé aux événements · hidden : absent de la page. */
export type Availability = "open" | "locked" | "hidden";

export function availability(
  type: Pick<BoosterTypeView, "active" | "startsAt" | "endsAt" | "usesFreeStock" | "priceZeni" | "filter">,
  now: Date,
  poolSize: number,
  minPool: number,
): Availability {
  if (!type.active || type.filter === null) return "hidden";
  if (type.startsAt && type.startsAt > now) return "hidden";
  if (type.endsAt && type.endsAt <= now) return "hidden";
  if (poolSize < minPool) return "hidden";
  if (!type.usesFreeStock && type.priceZeni === null) return "locked";
  return "open";
}

/** Bonus applicables à un type : doré et divin pour les sachets gratuits, pitié selon le type. */
export function bonusesFor(type: Pick<BoosterTypeView, "bonusEligible" | "countsForPity">) {
  return { golden: type.bonusEligible, divine: type.bonusEligible, pity: type.countsForPity };
}
