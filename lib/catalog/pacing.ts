// Cadence des appels à AniList : rester sous la limite et attendre ce qu'elle demande.
// https://docs.anilist.co/guide/rate-limiting

export const MAX_ATTEMPTS = 6;
const RATE_LIMIT_FALLBACK_MS = 60_000;
const BACKOFF_CAP_MS = 60_000;

export type PacingInput = {
  /** Statut HTTP, ou null pour une erreur réseau. */
  status: number | null;
  /** En-tête Retry-After (secondes). */
  retryAfter?: string | null;
  /** En-tête X-RateLimit-Remaining. */
  remaining?: string | null;
  /** Numéro de l'essai qui vient d'échouer (1 = premier). */
  attempt: number;
  /** Pause normale entre deux pages. */
  baseDelayMs: number;
};

export type PacingDecision =
  | { action: "continue"; delayMs: number } // réponse valide : page suivante après delayMs
  | { action: "retry"; delayMs: number } // même page après delayMs
  | { action: "fail" }; // abandon : l'import reste reprenable

function seconds(value: string | null | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Que faire après une réponse d'AniList. */
export function nextDelay({ status, retryAfter, remaining, attempt, baseDelayMs }: PacingInput): PacingDecision {
  if (status !== null && status >= 200 && status < 300) {
    // Presque à court de requêtes : on laisse la fenêtre glisser un peu
    const left = seconds(remaining);
    return { action: "continue", delayMs: left !== null && left < 3 ? baseDelayMs * 4 : baseDelayMs };
  }

  const retryable = status === null || status === 429 || status >= 500;
  if (!retryable || attempt >= MAX_ATTEMPTS) return { action: "fail" };

  if (status === 429) {
    const wait = seconds(retryAfter);
    return { action: "retry", delayMs: (wait !== null ? wait * 1000 : RATE_LIMIT_FALLBACK_MS) + 1000 };
  }

  // Erreur réseau ou 5xx : backoff exponentiel plafonné
  return { action: "retry", delayMs: Math.min(BACKOFF_CAP_MS, baseDelayMs * 2 ** attempt) };
}
