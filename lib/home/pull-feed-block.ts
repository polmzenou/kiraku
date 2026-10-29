// Blacklist du carrousel des gros tirages : un joueur en est retiré jusqu'à `User.pullFeedHiddenUntil`.
// « Définitif » se note par une date sentinelle très lointaine, pour garder un seul champ et une seule requête.

export const PULL_FEED_BLOCK_DURATIONS = ["1d", "7d", "30d", "permanent"] as const;
export type PullFeedBlockDuration = (typeof PULL_FEED_BLOCK_DURATIONS)[number];

const DAY = 86_400_000;
const DAYS: Record<Exclude<PullFeedBlockDuration, "permanent">, number> = { "1d": 1, "7d": 7, "30d": 30 };

/** Date sentinelle d'un retrait définitif. */
export const PERMANENT_BLOCK = new Date("9999-12-31T00:00:00.000Z");

/** Fin du retrait posé maintenant pour cette durée. */
export function pullFeedBlockUntil(duration: PullFeedBlockDuration, now: Date): Date {
  return duration === "permanent" ? PERMANENT_BLOCK : new Date(now.getTime() + DAYS[duration] * DAY);
}

/** Retrait définitif (date sentinelle ou au-delà). */
export function isPermanentBlock(until: Date): boolean {
  return until.getTime() >= PERMANENT_BLOCK.getTime();
}

/** Joueur retiré du carrousel à cet instant. */
export function isPullFeedBlocked(until: Date | null, now: Date): boolean {
  return until !== null && until > now;
}
