// Conditions de déblocage des titres et cadres de profil (catalogue Cosmetic géré dans l'admin).
// Fonctions pures : les statistiques du joueur sont rassemblées par server/profile/progress.ts.
import { z } from "@/lib/zod";
import { rarityKeySchema } from "../catalog/definitions";
import { LADDER, type LadderTier } from "../ranked/rules";

const count = z.number().int().min(1).max(1_000_000);
const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const CONDITION_TYPES = [
  "ALWAYS",
  "UNIQUE_CARDS",
  "RARITY_OWNED",
  "SERIES_COMPLETE",
  "SERIES_COMPLETED_COUNT",
  "BOOSTERS_OPENED",
  "TRADES_DONE",
  "RANK_TIER",
  "APOCALYPSE_RUINED",
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ALWAYS") }).strict(),
  z.object({ type: z.literal("UNIQUE_CARDS"), n: count }).strict(),
  z.object({ type: z.literal("RARITY_OWNED"), rarity: rarityKeySchema, n: count }).strict(),
  z.object({ type: z.literal("SERIES_COMPLETE"), seriesId: id }).strict(),
  z.object({ type: z.literal("SERIES_COMPLETED_COUNT"), n: count }).strict(),
  z.object({ type: z.literal("BOOSTERS_OPENED"), n: count }).strict(),
  z.object({ type: z.literal("TRADES_DONE"), n: count }).strict(),
  z.object({ type: z.literal("RANK_TIER"), tier: z.enum(LADDER) }).strict(),
  z.object({ type: z.literal("APOCALYPSE_RUINED"), n: count }).strict(),
]);
export type ProfileCondition = z.infer<typeof conditionSchema>;

/** Condition stockée (JSON) validée ; une condition illisible ne débloque rien. */
export function parseCondition(raw: unknown): ProfileCondition | null {
  const parsed = conditionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type ProfileStats = {
  uniqueCards: number;
  /** Cartes distinctes possédées par clé de rareté. */
  byRarity: Record<string, number>;
  /** Séries complétées (ids). */
  completedSeries: ReadonlySet<string>;
  /** Avancée des séries citées par une condition : possédées / total. */
  seriesProgress: Record<string, { owned: number; total: number }>;
  boostersOpened: number;
  tradesDone: number;
  /** Sachets Apocalyptiques ouverts et ruinés. */
  apocalypseRuined: number;
  /** Meilleur rang atteint (cette saison ou actuel). */
  tier: LadderTier;
};

export type ConditionProgress = { unlocked: boolean; current: number; goal: number };

const capped = (current: number, goal: number): ConditionProgress => ({ unlocked: current >= goal, current: Math.min(current, goal), goal });

/** Débloqué ou non, et où en est le joueur (« 12/30 »). */
export function evaluateCondition(condition: ProfileCondition | null, stats: ProfileStats): ConditionProgress {
  if (!condition) return { unlocked: false, current: 0, goal: 1 };
  switch (condition.type) {
    case "ALWAYS":
      return { unlocked: true, current: 1, goal: 1 };
    case "UNIQUE_CARDS":
      return capped(stats.uniqueCards, condition.n);
    case "RARITY_OWNED":
      return capped(stats.byRarity[condition.rarity] ?? 0, condition.n);
    case "SERIES_COMPLETE": {
      const p = stats.seriesProgress[condition.seriesId];
      if (!p || p.total === 0) return { unlocked: false, current: 0, goal: 1 };
      return { unlocked: stats.completedSeries.has(condition.seriesId) || p.owned >= p.total, current: Math.min(p.owned, p.total), goal: p.total };
    }
    case "SERIES_COMPLETED_COUNT":
      return capped(stats.completedSeries.size, condition.n);
    case "BOOSTERS_OPENED":
      return capped(stats.boostersOpened, condition.n);
    case "TRADES_DONE":
      return capped(stats.tradesDone, condition.n);
    case "APOCALYPSE_RUINED":
      return capped(stats.apocalypseRuined, condition.n);
    case "RANK_TIER": {
      const goal = LADDER.indexOf(condition.tier) + 1;
      return capped(LADDER.indexOf(stats.tier) + 1, goal);
    }
  }
}

/** Séries citées par des conditions SERIES_COMPLETE (à charger pour la progression). */
export function referencedSeries(conditions: readonly (ProfileCondition | null)[]): string[] {
  return [...new Set(conditions.flatMap((c) => (c?.type === "SERIES_COMPLETE" ? [c.seriesId] : [])))];
}

// --- Libellés (accord masculin / féminin) ---

export type CosmeticLabel = { fr: string; frFem?: string; en?: string };

const labelSchema = z.object({ fr: z.string().trim().min(1).max(60), frFem: z.string().trim().max(60).optional(), en: z.string().trim().max(60).optional() });

export function parseLabel(raw: unknown): CosmeticLabel {
  const parsed = labelSchema.safeParse(raw);
  return parsed.success ? parsed.data : { fr: "?" };
}

/** Libellé dans la langue du lecteur, accordé au genre choisi par le joueur (français seulement). */
export function labelFor(label: CosmeticLabel, locale: string, agreement: "MASC" | "FEM"): string {
  if (locale === "en" && label.en) return label.en;
  return agreement === "FEM" && label.frFem ? label.frFem : label.fr;
}

/** Longueur maximale de la bio (colonne User.bio). */
export const BIO_MAX = 160;

// --- Badges (dérivés, sans table) ---

export const BADGES = ["PIONEER", "AMBASSADOR", "VERIFIED"] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_KANJI: Record<Badge, string> = { PIONEER: "先", AMBASSADOR: "使", VERIFIED: "認" };

export function earnedBadges(input: {
  createdAt: Date;
  pioneerUntil: Date | null;
  qualifiedReferrals: number;
  ambassadorReferrals: number;
  discordLinked: boolean;
}): Badge[] {
  const out: Badge[] = [];
  if (input.pioneerUntil && input.createdAt <= input.pioneerUntil) out.push("PIONEER");
  if (input.ambassadorReferrals > 0 && input.qualifiedReferrals >= input.ambassadorReferrals) out.push("AMBASSADOR");
  if (input.discordLinked) out.push("VERIFIED");
  return out;
}

/** Badges affichés, dans l'ordre choisi par le joueur ; aucun choix = tous, dans l'ordre par défaut. */
export function orderedBadges(earned: readonly Badge[], order: readonly string[]): Badge[] {
  const chosen = order.filter((b): b is Badge => (earned as readonly string[]).includes(b));
  return chosen.length > 0 ? [...new Set(chosen)] : [...earned];
}
