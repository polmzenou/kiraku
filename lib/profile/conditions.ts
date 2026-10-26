// Conditions de déblocage des titres, cadres et couleurs de pseudo (catalogue Cosmetic géré dans l'admin).
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
  "CATALOG_DISCOVERED_PERCENT",
  "RARITIES_DISCOVERED",
  "AMBASSADOR",
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
  z.object({ type: z.literal("CATALOG_DISCOVERED_PERCENT"), n: z.number().int().min(1).max(100) }).strict(),
  z.object({ type: z.literal("RARITIES_DISCOVERED"), rarities: z.array(rarityKeySchema).min(1).max(8), n: count }).strict(),
  // Rôle donné par l'admin : le cosmétique est réservé aux ambassadeurs
  z.object({ type: z.literal("AMBASSADOR") }).strict(),
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
  /** Part du catalogue publié déjà découverte, en % entier arrondi à l'inférieur. */
  discoveredPercent: number;
  /** Cartes publiées découvertes par clé de rareté. */
  discoveredByRarity: Record<string, number>;
  /** Rôle Ambassadeur donné par l'admin. */
  ambassador: boolean;
};

/** % découvert arrondi à l'inférieur : 99,9 % ne vaut pas 100 %, seul le catalogue entier y mène. */
export function discoveredPercent(discovered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.floor((discovered / total) * 100));
}

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
    case "CATALOG_DISCOVERED_PERCENT":
      return capped(stats.discoveredPercent, condition.n);
    case "RARITIES_DISCOVERED": {
      const found = [...new Set(condition.rarities)].reduce((sum, r) => sum + (stats.discoveredByRarity[r] ?? 0), 0);
      return capped(found, condition.n);
    }
    case "AMBASSADOR":
      return capped(stats.ambassador ? 1 : 0, 1);
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

// AMBASSADOR vient du rôle donné par l'admin ; SPONSOR (Parrain) des filleuls qualifiés
export const BADGES = ["PIONEER", "AMBASSADOR", "SPONSOR", "VERIFIED"] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_KANJI: Record<Badge, string> = { PIONEER: "先", AMBASSADOR: "使", SPONSOR: "縁", VERIFIED: "認" };

/** Pastille du badge : l'or par défaut, le vert hisui pour le rôle Ambassadeur. */
export const BADGE_CLASS: Record<Badge, { pill: string; kanji: string }> = {
  PIONEER: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  AMBASSADOR: { pill: "border-hisui/60 text-hisui", kanji: "text-hisui" },
  SPONSOR: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
  VERIFIED: { pill: "border-kin/50 text-kin", kanji: "text-kin" },
};

export function earnedBadges(input: {
  createdAt: Date;
  pioneerUntil: Date | null;
  ambassador: boolean;
  qualifiedReferrals: number;
  sponsorReferrals: number;
  discordLinked: boolean;
}): Badge[] {
  const out: Badge[] = [];
  if (input.pioneerUntil && input.createdAt <= input.pioneerUntil) out.push("PIONEER");
  if (input.ambassador) out.push("AMBASSADOR");
  if (input.sponsorReferrals > 0 && input.qualifiedReferrals >= input.sponsorReferrals) out.push("SPONSOR");
  if (input.discordLinked) out.push("VERIFIED");
  return out;
}

/** Badges affichés, dans l'ordre choisi par le joueur ; aucun choix = tous, dans l'ordre par défaut. */
export function orderedBadges(earned: readonly Badge[], order: readonly string[]): Badge[] {
  const chosen = order.filter((b): b is Badge => (earned as readonly string[]).includes(b));
  return chosen.length > 0 ? [...new Set(chosen)] : [...earned];
}
