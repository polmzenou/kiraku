import { z } from "@/lib/zod";
import type { Rarity } from "@/lib/catalog/rarity";

// Filtre d'un type de booster sur le catalogue (section « Types de boosters » du plan).
// Évalué après chaque import ou modification admin, jamais au tirage : le pool est gardé en cache.

const label = z.string().trim().min(1).max(60);

export const poolFilterSchema = z
  .object({
    /** Tags de l'œuvre principale (rang ≥ catalog.minTagRank), au moins un. */
    tags: z.array(label).min(1).max(10).optional(),
    /** Genres AniList de l'œuvre principale, au moins un. */
    genres: z.array(label).min(1).max(10).optional(),
    /** Genre du personnage ; ceux sans genre renseigné sont exclus. */
    gender: z.enum(["Female", "Male"]).optional(),
    role: z.enum(["MAIN", "SUPPORTING"]).optional(),
    yearMin: z.number().int().min(1900).max(2100).optional(),
    yearMax: z.number().int().min(1900).max(2100).optional(),
    /** Œuvres de la saison AniList en cours (calculée chaque jour). */
    currentSeason: z.boolean().optional(),
    /** Personnages nés aujourd'hui (calculé chaque jour). */
    birthdayToday: z.boolean().optional(),
    /** Studio principal de l'œuvre. */
    studio: z.string().trim().min(1).max(100).optional(),
    mediaType: z.enum(["ANIME", "MANGA"]).optional(),
    /** Œuvres précises (ids de média AniList). */
    seriesIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
    /** Cartes précises (ids Card). */
    cardIds: z.array(z.string().min(1).max(40)).min(1).max(1000).optional(),
    /** Sélection éditoriale de personnages, stable entre imports et environnements. */
    anilistIds: z.array(z.number().int().positive()).min(1).max(1000).optional(),
  })
  .strict()
  .refine((f) => f.yearMin === undefined || f.yearMax === undefined || f.yearMin <= f.yearMax, {
    message: "yearMin doit être inférieur ou égal à yearMax",
  });

export type PoolFilter = z.infer<typeof poolFilterSchema>;

/** Filtre stocké en base : validé, ou null s'il est invalide (le type ne doit alors rien proposer). */
export function parsePoolFilter(raw: unknown): PoolFilter | null {
  const parsed = poolFilterSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : null;
}

/** Ce qu'il faut savoir d'une carte pour l'évaluer (carte + œuvre principale). */
export type PoolCandidate = {
  origin?: string;
  boosterIds?: string[];
  /** Carte de base d'une variante (AR, Gold) : la variante la suit dans les boosters. */
  variantOfId?: string | null;
  /** Variante réservée aux boosters cochés (`boosterIds`). */
  boosterExclusive?: boolean;
  id: string;
  anilistId: number | null;
  rarity: Rarity;
  gender: string | null;
  role: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  seriesAnilistId: number | null;
  mediaType: string;
  genres: readonly string[];
  tags: readonly string[];
  year: number | null;
  season: string | null;
  seasonYear: number | null;
  studio: string | null;
};

export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

/** Date du jour dans le fuseau du jeu, et saison AniList en cours. */
export type FilterContext = { year: number; month: number; day: number; season: Season; seasonYear: number };

/**
 * Saison AniList d'un mois : hiver = décembre à février (décembre compte pour l'année suivante),
 * printemps = mars à mai, été = juin à août, automne = septembre à novembre.
 */
export function seasonOf(year: number, month: number): { season: Season; seasonYear: number } {
  if (month === 12) return { season: "WINTER", seasonYear: year + 1 };
  if (month <= 2) return { season: "WINTER", seasonYear: year };
  if (month <= 5) return { season: "SPRING", seasonYear: year };
  if (month <= 8) return { season: "SUMMER", seasonYear: year };
  return { season: "FALL", seasonYear: year };
}

/** Contexte d'évaluation à l'instant `now`, dans le fuseau `timeZone` (ex. Europe/Paris). */
export function filterContext(now: Date, timeZone: string): FilterContext {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const { year, month, day } = parts;
  return { year, month, day, ...seasonOf(year, month) };
}

/** Clé du jour (« 2026-10-14 ») : sert de clé de cache aux pools qui changent chaque jour. */
export function dayKey(ctx: Pick<FilterContext, "year" | "month" | "day">): string {
  return `${ctx.year}-${String(ctx.month).padStart(2, "0")}-${String(ctx.day).padStart(2, "0")}`;
}

/** Le pool dépend-il du jour ? (anniversaires, saison en cours) */
export function isDynamicFilter(filter: PoolFilter): boolean {
  return Boolean(filter.birthdayToday || filter.currentSeason);
}

const someOf = (wanted: readonly string[] | undefined, have: readonly string[]) =>
  !wanted || wanted.some((w) => have.includes(w));

/** La carte entre-t-elle dans le pool ? Toutes les conditions présentes doivent être vraies. */
export function matchesFilter(card: PoolCandidate, filter: PoolFilter, ctx: FilterContext): boolean {
  if (filter.cardIds && !filter.cardIds.includes(card.id)) return false;
  if (filter.anilistIds && (card.anilistId === null || !filter.anilistIds.includes(card.anilistId))) return false;
  if (filter.seriesIds && (card.seriesAnilistId === null || !filter.seriesIds.includes(card.seriesAnilistId))) return false;
  if (!someOf(filter.tags, card.tags)) return false;
  if (!someOf(filter.genres, card.genres)) return false;
  if (filter.gender && card.gender !== filter.gender) return false;
  if (filter.role && card.role !== filter.role) return false;
  if (filter.mediaType && card.mediaType !== filter.mediaType) return false;
  if (filter.studio && card.studio !== filter.studio) return false;
  if (filter.yearMin !== undefined && (card.year === null || card.year < filter.yearMin)) return false;
  if (filter.yearMax !== undefined && (card.year === null || card.year > filter.yearMax)) return false;
  if (filter.currentSeason && (card.season !== ctx.season || card.seasonYear !== ctx.seasonYear)) return false;
  if (filter.birthdayToday && (card.birthMonth !== ctx.month || card.birthDay !== ctx.day)) return false;
  return true;
}

/** Ids des cartes retenues, dans l'ordre des candidats (rang croissant). */
export function filterPool(cards: readonly PoolCandidate[], filter: PoolFilter, ctx: FilterContext): PoolCandidate[] {
  return cards.filter((c) => matchesFilter(c, filter, ctx));
}
