// Cadence des sondages du navigateur (cloche, chat, combat, enchères, fil des tirages). Logique pure :
// le hook usePoll l'applique. Aucun sondage onglet caché ou joueur inactif ; sans nouveauté, le délai
// double jusqu'à `backoffMax` fois le délai de base ; avec le temps réel, seul le délai de secours compte.

export type PollContext = {
  /** Délai de base sans temps réel (s). */
  baseSeconds: number;
  /** Délai de secours quand le temps réel est connecté (s) ; absent = pas de temps réel pour ce sondage. */
  realtimeSeconds?: number;
  realtimeConnected: boolean;
  hidden: boolean;
  idle: boolean;
  /** Sondages consécutifs sans changement. */
  unchanged: number;
  /** Multiple maximal du délai de base (1 = pas de ralentissement). */
  backoffMax: number;
};

/** Délai avant le prochain sondage en millisecondes, ou null s'il faut attendre le retour du joueur. */
export function nextPollDelay(c: PollContext): number | null {
  if (c.hidden || c.idle) return null;
  const base = c.realtimeConnected && c.realtimeSeconds !== undefined ? c.realtimeSeconds : c.baseSeconds;
  const factor = Math.min(Math.max(1, Math.floor(c.backoffMax)), 2 ** Math.max(0, Math.floor(c.unchanged)));
  return Math.max(1, base) * factor * 1000;
}

/** Le joueur est-il inactif : aucun geste depuis `idleSeconds` ? */
export function isIdle(lastInputAt: number, now: number, idleSeconds: number): boolean {
  return now - lastInputAt >= idleSeconds * 1000;
}

/**
 * Au retour (onglet de nouveau visible ou premier geste après inactivité), faut-il sonder tout de suite ?
 * Oui si le dernier sondage date d'au moins le délai de base : sinon on reprend le rythme normal.
 */
export function pollOnResume(lastPollAt: number, now: number, baseSeconds: number): boolean {
  return now - lastPollAt >= baseSeconds * 1000;
}
