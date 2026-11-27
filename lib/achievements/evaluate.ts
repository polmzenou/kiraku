// Évaluation des succès : fonctions pures, testables sans base. Les statistiques sont rassemblées par
// server/achievements/stats-core.ts ; les déblocages sont enregistrés par server/achievements/sync.ts.
import { ACHIEVEMENTS, metricKind, isAdjustable, statKey, type AchievementDef, type MetricKind } from "./catalog";

/** Valeurs lues dans l'historique du joueur, par clé de statistique (statKey), et seuils fournis par les données. */
export type AchievementStats = {
  values: ReadonlyMap<string, number>;
  /** Seuil imposé par les données (ex. nombre de raretés de variante du registre), prioritaire sur le catalogue. */
  goals: ReadonlyMap<string, number>;
};

export const EMPTY_STATS: AchievementStats = { values: new Map(), goals: new Map() };

/** Réglages de l'admin (GameSetting achievements.*). */
export type AchievementSettings = {
  enabled: boolean;
  goals: Readonly<Record<string, number>>;
  disabled: readonly string[];
};

export type AchievementProgress = {
  key: string;
  kind: MetricKind;
  unlocked: boolean;
  /** Date du déblocage enregistré ; null tant qu'il n'est pas enregistré (ou verrouillé). */
  unlockedAt: Date | null;
  /** Seuil en vigueur (réglé dans l'admin ou celui du catalogue), cité dans la description. */
  target: number;
  /** Avancée affichée : compteur plafonné au seuil, ou 0 / 1 pour un flag, un palier ou un event. */
  current: number;
  goal: number;
  /** Remplissage de la barre, de 0 à 1. */
  ratio: number;
  /** Meilleure place atteinte (métrique de position) ; 0 = jamais classé. */
  best?: number;
};

/** Succès actifs (non désactivés dans l'admin), dans l'ordre du catalogue. */
export function activeAchievements(disabled: readonly string[]): AchievementDef[] {
  const off = new Set(disabled);
  return ACHIEVEMENTS.filter((a) => !off.has(a.key));
}

/** Seuils à enregistrer : seulement ceux des succès réglables, et différents du catalogue. */
export function normalizeGoals(goals: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    ACHIEVEMENTS.flatMap((a) => {
      const set = goals[a.key];
      return isAdjustable(a) && Number.isInteger(set) && set >= 1 && set !== a.goal ? [[a.key, set]] : [];
    }),
  );
}

/** Seuil en vigueur : imposé par les données, sinon réglé dans l'admin (seuil réglable seulement), sinon celui du catalogue. */
export function effectiveGoal(a: AchievementDef, goals: Readonly<Record<string, number>>, stats: AchievementStats = EMPTY_STATS): number {
  const fromData = stats.goals.get(statKey(a));
  if (fromData !== undefined && fromData >= 1) return fromData;
  const set = goals[a.key];
  if (isAdjustable(a) && Number.isInteger(set) && set >= 1) return set;
  return a.goal;
}

/** La valeur atteint-elle le seuil ? Une place se gagne en étant au plus le seuil (1re place ≤ Top 10). */
export function isReached(kind: MetricKind, value: number, goal: number): boolean {
  switch (kind) {
    case "position":
      return value > 0 && value <= goal;
    case "flag":
      return value >= 1;
    case "count":
    case "level":
    case "event":
      return value >= goal;
  }
}

/** Avancée d'un succès. Un déblocage enregistré reste acquis, même repassé sous le seuil (vente, seuil relevé…). */
export function evaluateAchievement(a: AchievementDef, goal: number, value: number, unlockedAt: Date | null): AchievementProgress {
  const kind = metricKind(a);
  const unlocked = unlockedAt !== null || isReached(kind, value, goal);
  if (kind === "count") {
    const current = unlocked ? goal : Math.max(0, Math.min(value, goal));
    return { key: a.key, kind, target: goal, unlocked, unlockedAt, current, goal, ratio: goal > 0 ? current / goal : 0 };
  }
  if (kind === "position") {
    // Barre : seuil / meilleure place (143e pour un Top 100 : 70 %)
    const ratio = unlocked ? 1 : value > 0 ? Math.min(1, goal / value) : 0;
    return { key: a.key, kind, target: goal, unlocked, unlockedAt, current: unlocked ? 1 : 0, goal: 1, ratio, best: value };
  }
  return { key: a.key, kind, target: goal, unlocked, unlockedAt, current: unlocked ? 1 : 0, goal: 1, ratio: unlocked ? 1 : 0 };
}

/** Avancée de chaque succès actif, à partir des statistiques et des déblocages déjà enregistrés. */
export function evaluateAll(
  defs: readonly AchievementDef[],
  stats: AchievementStats,
  stored: ReadonlyMap<string, Date>,
  goals: Readonly<Record<string, number>>,
): AchievementProgress[] {
  return defs.map((a) => evaluateAchievement(a, effectiveGoal(a, goals, stats), stats.values.get(statKey(a)) ?? 0, stored.get(a.key) ?? null));
}

/** Statistiques à calculer : celles des succès encore verrouillés, hors events (débloqués par un crochet). */
export function neededStats(defs: readonly AchievementDef[], stored: ReadonlyMap<string, Date> | ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const a of defs) {
    if (stored.has(a.key) || metricKind(a) === "event") continue;
    out.add(statKey(a));
  }
  return out;
}

/** Succès débloqués par cette évaluation et pas encore enregistrés. */
export function freshUnlocks(progress: readonly AchievementProgress[]): string[] {
  return progress.filter((p) => p.unlocked && p.unlockedAt === null).map((p) => p.key);
}

/** Métrique demandée par l'ensemble des statistiques à calculer (« RARITY:XR » → « RARITY »). */
export function metricOf(stat: string): string {
  const i = stat.indexOf(":");
  return i < 0 ? stat : stat.slice(0, i);
}
