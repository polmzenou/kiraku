// Cartes tirées par joueur (Encens), gardées en mémoire du processus pour l'affichage. Additionner tout
// l'historique des ouvertures à chaque vue de l'accueil coûtait de plus en plus cher ; ici, la somme
// d'avant une date de coupure n'est relue qu'une fois par jour et par joueur, et chaque vue ne relit
// que les ouvertures depuis cette coupure (index userId, createdAt). Le compte reste exact, sans
// invalidation : la coupure est posée une heure avant le calcul, et une ouverture (datée au début de sa
// transaction, qui dure quelques secondes au plus) ne peut donc pas apparaître avant elle après coup.
// Les ouvertures ne sont jamais effacées, sauf avec le compte.

export type PulledLoaders = {
  /** Sommes avant `cutoff` (exclu) et depuis `cutoff`, en une requête. */
  split: (userId: string, cutoff: Date) => Promise<{ before: number; since: number }>;
  /** Somme depuis `cutoff`. */
  since: (userId: string, cutoff: Date) => Promise<number>;
};

export type PulledTallyOptions = {
  /** Écart entre le calcul et la coupure : bien plus long qu'une transaction d'ouverture. */
  marginMs: number;
  /** Âge de la coupure au-delà duquel la somme d'avant est recalculée (la fin relue grossit). */
  refreshMs: number;
  /** Joueurs gardés en mémoire ; le plus ancien part d'abord. */
  maxEntries: number;
};

export const PULLED_TALLY_DEFAULTS: PulledTallyOptions = { marginMs: 3_600_000, refreshMs: 86_400_000, maxEntries: 10_000 };

/** Compteur de cartes tirées, mis en cache par joueur ; `loaders` lit la base (injecté, testable). */
export function pulledTally(loaders: PulledLoaders, opts: PulledTallyOptions = PULLED_TALLY_DEFAULTS) {
  const entries = new Map<string, { cutoff: Date; before: number }>();
  return async (userId: string, now: Date = new Date()): Promise<number> => {
    const hit = entries.get(userId);
    if (hit && now.getTime() - hit.cutoff.getTime() < opts.refreshMs) return hit.before + (await loaders.since(userId, hit.cutoff));
    const cutoff = new Date(now.getTime() - opts.marginMs);
    const { before, since } = await loaders.split(userId, cutoff);
    entries.delete(userId);
    entries.set(userId, { cutoff, before });
    // Une Map garde l'ordre d'insertion : la première clé est la plus ancienne
    if (entries.size > opts.maxEntries) entries.delete(entries.keys().next().value as string);
    return before + since;
  };
}
