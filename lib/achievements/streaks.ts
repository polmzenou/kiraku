// Séries des succès (victoires d'affilée, jours de suite…) : fonctions pures, testables sans base.

/** Plus longue suite de `true` consécutifs, dans l'ordre donné. */
export function longestRun(flags: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

const DAY_MS = 86_400_000;

/** Plus longue suite de jours calendaires consécutifs (« AAAA-MM-JJ », doublons et désordre tolérés). */
export function longestDayRun(days: readonly string[]): number {
  const sorted = [...new Set(days)].map((d) => Date.parse(`${d}T00:00:00Z`)).filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    run = prev !== null && day - prev === DAY_MS ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}
