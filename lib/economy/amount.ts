// Montants de Zeni : entiers stricts, bornés. Toute écriture passe par server/economy/ledger.ts,
// qui refuse un montant hors de ces règles avant même de toucher la base.

/** Plafond d'un mouvement : bien au-dessus de tout prix du jeu, bien en dessous d'un int4. */
export const MAX_MOVEMENT = 100_000_000;

/** Montant d'un crédit ou d'un débit (toujours positif ; le sens vient de l'opération). */
export function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_MOVEMENT;
}

/** Ligne de journal signée (+ crédit, − débit), jamais nulle. */
export function isValidSignedAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount !== 0 && Math.abs(amount) <= MAX_MOVEMENT;
}

/**
 * Soldes juste après chaque ligne, dans l'ordre, à partir du solde final : le journal écrit en un
 * seul UPDATE (plusieurs boosters achetés d'un coup) garde un solde exact par ligne.
 */
export function balancesAfter(finalBalance: number, amounts: readonly number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  let running = finalBalance - total;
  return amounts.map((a) => (running += a));
}
