// Pastille « mission à réclamer » de la navigation, gardée en mémoire du processus quelques secondes par joueur.
// L'en-tête est rendu à chaque chargement complet et à chaque rafraîchissement après une action (ouverture de
// booster, recyclage…) : sans cache, chaque rendu relisait les missions, les raretés, les réclamations et une
// mesure par mission (ouvertures, découvertes, Zeni, cadeaux, amitiés, cartes tirées), une dizaine de requêtes.
// La page des missions et la réclamation relisent toujours tout ; une réclamation efface l'entrée du joueur.

export type MissionDotOptions = {
  /** Durée de vie d'une entrée : une mission tout juste terminée allume la pastille au plus tard après ce délai. */
  ttlMs: number;
  /** Joueurs gardés en mémoire ; le plus ancien part d'abord. */
  maxEntries: number;
};

export const MISSION_DOT_DEFAULTS: MissionDotOptions = { ttlMs: 30_000, maxEntries: 10_000 };

/** `load` calcule la pastille d'un joueur (injecté, testable) ; deux rendus simultanés partagent le même calcul. */
export function missionDotCache(load: (userId: string) => Promise<boolean>, opts: MissionDotOptions = MISSION_DOT_DEFAULTS) {
  const entries = new Map<string, { at: number; value: Promise<boolean> }>();
  return {
    get(userId: string, now: number = Date.now()): Promise<boolean> {
      const hit = entries.get(userId);
      if (hit && now - hit.at < opts.ttlMs) return hit.value;
      const value = load(userId);
      entries.delete(userId);
      entries.set(userId, { at: now, value });
      // Un échec n'est pas gardé : le rendu suivant recalcule
      value.catch(() => {
        if (entries.get(userId)?.value === value) entries.delete(userId);
      });
      // Une Map garde l'ordre d'insertion : la première clé est la plus ancienne
      if (entries.size > opts.maxEntries) entries.delete(entries.keys().next().value as string);
      return value;
    },
    /** Après une réclamation : la pastille suivante est recalculée. */
    forget(userId: string): void {
      entries.delete(userId);
    },
  };
}
