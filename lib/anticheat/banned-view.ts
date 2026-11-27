import type { SuspectCluster } from "./score";

// Vue /admin/multi-comptes : par défaut, les comptes bannis n'apparaissent plus (ils sont réglés) ; le filtre
// « Comptes bannis » les montre pour les revoir (lever un ban, vérifier un groupe). La détection, elle, garde tous
// les comptes : un nouveau compte relié à un banni reste un indice, signalé par un simple rappel.

export type ClusterView = SuspectCluster & {
  /** Comptes bannis du groupe, retirés de la vue par défaut (rappel « relié à N comptes bannis »). */
  bannedIds: string[];
};

/**
 * Groupes à montrer :
 * - `active` (vue par défaut) : groupes qui ont au moins un compte non banni, réduits à ces comptes et aux paires
 *   entre eux ; les bannis retirés restent comptés dans `bannedIds`.
 * - `banned` (filtre « Comptes bannis ») : groupes qui ont au moins un compte banni, en entier.
 */
export function clustersFor(clusters: readonly SuspectCluster[], isBanned: (id: string) => boolean, mode: "active" | "banned"): ClusterView[] {
  return clusters.flatMap((c) => {
    const bannedIds = c.userIds.filter(isBanned);
    if (mode === "banned") return bannedIds.length > 0 ? [{ ...c, bannedIds }] : [];
    const active = c.userIds.filter((id) => !isBanned(id));
    if (active.length === 0) return [];
    if (bannedIds.length === 0) return [{ ...c, bannedIds }];
    const pairs = c.pairs.filter((p) => !isBanned(p.a) && !isBanned(p.b));
    // Score recalculé sur les paires qui restent ; un compte seul face à des bannis garde le score du groupe
    const score = pairs.length > 0 ? pairs.reduce((max, p) => Math.max(max, p.score), 0) : c.score;
    return [{ score, userIds: active, pairs, bannedIds }];
  });
}
