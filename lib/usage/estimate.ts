import { z } from "@/lib/zod";

// Estimation de la consommation Vercel par joueur actif, à partir des réglages de sondage en cours.
// Sert à anticiper un dépassement du budget mensuel depuis /admin : ce n'est pas une mesure, juste un
// ordre de grandeur (joueur présent, onglet visible, sans ralentissement « rien de neuf »).

/** Budget mensuel (30 jours) que l'on s'autorise sur chaque ressource Vercel, réglable dans /admin. */
export const vercelBudgetSchema = z.object({
  invocations: z.number().int().min(1).max(10_000_000_000),
  cpuHours: z.number().min(0.1).max(100_000),
  transferGb: z.number().min(0.1).max(1_000_000),
});
export type VercelBudget = z.infer<typeof vercelBudgetSchema>;

/**
 * Plan Pro (docs Vercel, 28/10/2026) : plus de quota fixe, 20 $ de crédit par mois puis paiement à
 * l'usage. Budget par défaut tenu dans ce crédit aux tarifs de dub1 : 6 M d'invocations (0,60 $/M,
 * 3,60 $), 40 h de CPU actif (0,168 $/h, 6,72 $), 80 Go de Fast Origin Transfer (0,06 $/Go, 4,80 $),
 * soit 15,12 $ ; le reste couvre la mémoire provisionnée, non estimée ici.
 */
export const DEFAULT_VERCEL_BUDGET: VercelBudget = { invocations: 6_000_000, cpuHours: 40, transferGb: 80 };

// Moyennes observées en octobre 2026 (12 h de CPU et 12,3 Go pour 1,9 M d'invocations)
export const OBSERVED_CPU_MS = 23;
export const OBSERVED_TRANSFER_KB = 6.5;

export type PollSettings = {
  ablyEnabled: boolean;
  notificationsPollSeconds: number;
  realtimeSafetySeconds: number;
  chatPollSeconds: number;
  pullFeedRefreshSeconds: number;
  battlePollSeconds: number;
  battleSafetySeconds: number;
  queuePollSeconds: number;
  lobbyPollSeconds: number;
  marketPollSeconds: number;
};

export type Screen = "home" | "browse" | "chat" | "battle" | "queue" | "lobby" | "auction";
export const SCREENS: readonly Screen[] = ["home", "browse", "chat", "battle", "queue", "lobby", "auction"];

export type Assumptions = {
  /** Pages ouvertes par heure de jeu (chaque page = un rendu serveur). */
  pageViewsPerHour: number;
  /** Coups joués par heure de combat (une action serveur chacun). */
  battleActionsPerHour: number;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = { pageViewsPerHour: 30, battleActionsPerHour: 120 };

/** Hypothèses de projection par défaut (formulaire de /admin/general et bandeau d'alerte). */
export const DEFAULT_HOURS_PER_PLAYER = 1;
/** Trafic qui ne dépend pas des joueurs (robots, moniteurs), en invocations par jour. */
export const DEFAULT_OTHER_PER_DAY = 3_000;

/** Part du temps de jeu passée sur chaque écran (somme 1). */
export const DEFAULT_MIX: Record<Screen, number> = {
  home: 0.35,
  browse: 0.3,
  chat: 0.05,
  battle: 0.15,
  queue: 0.02,
  lobby: 0.03,
  auction: 0.1,
};

const perHour = (seconds: number) => 3600 / Math.max(1, seconds);

/** Invocations de fonctions par heure pour un joueur actif sur un écran. */
export function invocationsPerHour(screen: Screen, s: PollSettings, a: Assumptions = DEFAULT_ASSUMPTIONS): number {
  // Sur toutes les pages : le sondage unique de l'en-tête (cloche et pastille du chat) et les pages vues
  const pulse = perHour(s.ablyEnabled ? s.realtimeSafetySeconds : s.notificationsPollSeconds);
  const base = pulse + a.pageViewsPerHour;
  switch (screen) {
    case "home":
      return base + perHour(s.pullFeedRefreshSeconds);
    case "browse":
      return base;
    case "chat":
      // Conversation ouverte : sondage de secours avec le temps réel, sondage normal sans
      return base + perHour(s.ablyEnabled ? s.realtimeSafetySeconds : s.chatPollSeconds);
    case "battle":
      return base + a.battleActionsPerHour + perHour(s.ablyEnabled ? s.battleSafetySeconds : s.battlePollSeconds);
    case "queue":
      return base + perHour(s.queuePollSeconds);
    case "lobby":
      return base + perHour(s.lobbyPollSeconds);
    case "auction":
      return base + perHour(s.marketPollSeconds);
  }
}

/** Moyenne pondérée par la part de temps passée sur chaque écran. */
export function blendedPerHour(s: PollSettings, mix: Record<Screen, number> = DEFAULT_MIX, a: Assumptions = DEFAULT_ASSUMPTIONS): number {
  const total = SCREENS.reduce((sum, k) => sum + Math.max(0, mix[k]), 0) || 1;
  return SCREENS.reduce((sum, k) => sum + (Math.max(0, mix[k]) / total) * invocationsPerHour(k, s, a), 0);
}

export type MonthlyProjection = {
  invocations: number;
  cpuHours: number;
  transferGb: number;
  /** Part de chaque ligne du budget consommée (1 = budget atteint). */
  share: { invocations: number; cpuHours: number; transferGb: number };
};

/**
 * Projection sur 30 jours : joueurs actifs par jour × heures de jeu par joueur, plus le trafic qui ne
 * dépend pas des joueurs (robots, moniteurs) en invocations par jour.
 */
export function monthlyProjection(input: {
  settings: PollSettings;
  dailyPlayers: number;
  hoursPerPlayer: number;
  otherPerDay?: number;
  mix?: Record<Screen, number>;
  assumptions?: Assumptions;
  cpuMs?: number;
  transferKb?: number;
  budget?: VercelBudget;
}): MonthlyProjection {
  const hourly = blendedPerHour(input.settings, input.mix, input.assumptions);
  const daily = Math.max(0, input.dailyPlayers) * Math.max(0, input.hoursPerPlayer) * hourly + Math.max(0, input.otherPerDay ?? 0);
  const invocations = Math.round(daily * 30);
  const cpuHours = (invocations * (input.cpuMs ?? OBSERVED_CPU_MS)) / 3_600_000;
  const transferGb = (invocations * (input.transferKb ?? OBSERVED_TRANSFER_KB)) / 1_000_000;
  const budget = input.budget ?? DEFAULT_VERCEL_BUDGET;
  return {
    invocations,
    cpuHours,
    transferGb,
    share: {
      invocations: invocations / budget.invocations,
      cpuHours: cpuHours / budget.cpuHours,
      transferGb: transferGb / budget.transferGb,
    },
  };
}

/** Joueurs actifs par jour tenables dans tout le budget, à durée de jeu égale. */
export function maxDailyPlayers(settings: PollSettings, hoursPerPlayer: number, otherPerDay = 0, budget: VercelBudget = DEFAULT_VERCEL_BUDGET): number {
  const one = monthlyProjection({ settings, dailyPlayers: 1, hoursPerPlayer, otherPerDay: 0, budget });
  const fixed = monthlyProjection({ settings, dailyPlayers: 0, hoursPerPlayer, otherPerDay, budget });
  const room = (k: keyof MonthlyProjection["share"]) => (one.share[k] > 0 ? (1 - fixed.share[k]) / one.share[k] : Infinity);
  return Math.max(0, Math.floor(Math.min(room("invocations"), room("cpuHours"), room("transferGb"))));
}
