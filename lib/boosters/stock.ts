// Stock de boosters gratuits, recalculé à la demande (section « Système de boosters » du plan) :
// aucun cron, seulement boosterStock et boosterAnchor sur User.

export type StockRules = { max: number; intervalMs: number };

/** Réglages du stock : le max commun et celui des ambassadeurs (rôle donné par l'admin). */
export type StockSettings = StockRules & { ambassadorMax: number };

/** Règles du stock d'un joueur : seul le max dépend de son rôle. */
export function stockRulesFor(settings: StockSettings, ambassador: boolean): StockRules {
  return { max: ambassador ? settings.ambassadorMax : settings.max, intervalMs: settings.intervalMs };
}

export type StockState = {
  stock: number;
  /** Début du cycle en cours (les minutes déjà entamées sont conservées). */
  anchor: Date;
  /** Arrivée du prochain booster, null quand le stock est plein. */
  nextAt: Date | null;
};

/**
 * Stock à l'instant `now`. Un stock au-dessus du max (don de l'admin, max abaissé) est gardé :
 * la recharge s'arrête simplement tant qu'il n'est pas repassé sous le max.
 */
export function computeStock(stock: number, anchor: Date, now: Date, rules: StockRules): StockState {
  if (stock >= rules.max) return { stock, anchor: now, nextAt: null };
  const elapsed = now.getTime() - anchor.getTime();
  // Ancre dans le futur (horloge décalée) : aucun booster gagné, le cycle repart de maintenant
  if (elapsed < 0) return { stock, anchor: now, nextAt: new Date(now.getTime() + rules.intervalMs) };
  const gained = Math.floor(elapsed / rules.intervalMs);
  if (stock + gained >= rules.max) return { stock: rules.max, anchor: now, nextAt: null };
  const next = new Date(anchor.getTime() + gained * rules.intervalMs);
  return { stock: stock + gained, anchor: next, nextAt: new Date(next.getTime() + rules.intervalMs) };
}

/**
 * Retire `count` boosters d'un état calculé par computeStock au même instant.
 * Ouvrir depuis un stock plein fait démarrer le chrono maintenant (computeStock y a déjà posé l'ancre).
 */
export function consumeStock(state: StockState, count: number, rules: StockRules): StockState {
  if (!Number.isInteger(count) || count < 1 || count > state.stock) throw new Error("NO_BOOSTER");
  const stock = state.stock - count;
  return {
    stock,
    anchor: state.anchor,
    nextAt: stock >= rules.max ? null : new Date(state.anchor.getTime() + rules.intervalMs),
  };
}
