// Vue publique de l'Ennichi (server/ennichi/queries.ts) gardée en mémoire du processus pour la minute en cours, une
// entrée par langue. Le cache de Next, à clé par minute, gardait une entrée et un fichier (.next/cache/fetch-cache) par
// minute et par langue, soit 2 880 par jour, jamais relus ni purgés : le défaut que le fil des gros tirages a déjà
// perdu (server/home/pulls.ts). Ici, la minute suivante remplace l'entrée de la précédente.

/**
 * `load(key, minuteStartMs)` calcule la vue d'une clé pour la minute donnée (injecté, testable). Deux rendus de la même
 * minute partagent le même calcul ; un échec n'est pas gardé. `version` : une autre valeur fait relire la vue (réglages
 * enregistrés, tirage fait), sans attendre la minute suivante.
 */
export function minuteMemo<T>(load: (key: string, minuteStartMs: number) => Promise<T>) {
  const entries = new Map<string, { minute: number; version: number; value: Promise<T> }>();
  return (key: string, nowMs: number, version = 0): Promise<T> => {
    const minute = Math.floor(nowMs / 60_000);
    const hit = entries.get(key);
    if (hit && hit.minute === minute && hit.version === version) return hit.value;
    const entry = { minute, version, value: load(key, minute * 60_000) };
    entries.set(key, entry);
    entry.value.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return entry.value;
  };
}
