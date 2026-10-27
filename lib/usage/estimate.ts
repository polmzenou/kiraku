// Estimation de la consommation Vercel par joueur actif, à partir des réglages de sondage en cours.
// Sert à anticiper un dépassement du plan Hobby depuis /admin : ce n'est pas une mesure, juste un
// ordre de grandeur (joueur présent, onglet visible, sans ralentissement « rien de neuf »).

/** Limites du plan Hobby de Vercel sur 30 jours. */
export const HOBBY_LIMITS = {
  invocations: 1_000_000,
  cpuHours: 4,
  transferGb: 10,
} as const;

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
      return base + (s.ablyEnabled ? 0 : perHour(s.chatPollSeconds));
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
  /** Part de chaque limite Hobby consommée (1 = limite atteinte). */
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
}): MonthlyProjection {
  const hourly = blendedPerHour(input.settings, input.mix, input.assumptions);
  const daily = Math.max(0, input.dailyPlayers) * Math.max(0, input.hoursPerPlayer) * hourly + Math.max(0, input.otherPerDay ?? 0);
  const invocations = Math.round(daily * 30);
  const cpuHours = (invocations * (input.cpuMs ?? OBSERVED_CPU_MS)) / 3_600_000;
  const transferGb = (invocations * (input.transferKb ?? OBSERVED_TRANSFER_KB)) / 1_000_000;
  return {
    invocations,
    cpuHours,
    transferGb,
    share: {
      invocations: invocations / HOBBY_LIMITS.invocations,
      cpuHours: cpuHours / HOBBY_LIMITS.cpuHours,
      transferGb: transferGb / HOBBY_LIMITS.transferGb,
    },
  };
}

/** Joueurs actifs par jour tenables sous toutes les limites Hobby, à durée de jeu égale. */
export function maxDailyPlayers(settings: PollSettings, hoursPerPlayer: number, otherPerDay = 0): number {
  const one = monthlyProjection({ settings, dailyPlayers: 1, hoursPerPlayer, otherPerDay: 0 });
  const fixed = monthlyProjection({ settings, dailyPlayers: 0, hoursPerPlayer, otherPerDay });
  const room = (k: keyof MonthlyProjection["share"]) => (one.share[k] > 0 ? (1 - fixed.share[k]) / one.share[k] : Infinity);
  return Math.max(0, Math.floor(Math.min(room("invocations"), room("cpuHours"), room("transferGb"))));
}
