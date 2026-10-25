import { dayKey, filterContext } from "./pool-filter";

// Un pool enregistré ne se recalcule que s'il est périmé : au déploiement, recalculer les 35 types
// relisait tout le catalogue, réécrivait ~5 Mo de tableaux d'ids et vidait les caches de pools.

export type StoredPool = {
  /** Fin du dernier recalcul du pool, ou null s'il n'a jamais été calculé. */
  poolComputedAt: Date | null;
  /** Dernière modification du type (réglages de l'admin, seed). */
  updatedAt: Date;
  /** Pool qui dépend du jour (anniversaires, saison en cours). */
  dynamic: boolean;
};

/**
 * Le pool est à refaire s'il n'a jamais été calculé, s'il date d'avant la version du catalogue
 * ou la dernière modification du type, ou, pour un pool du jour, s'il a été calculé un autre jour
 * (dans le fuseau du jeu).
 */
export function isPoolStale(pool: StoredPool, catalogVersion: number, now: Date, timeZone: string): boolean {
  if (!pool.poolComputedAt) return true;
  const computed = pool.poolComputedAt.getTime();
  if (computed < catalogVersion || computed < pool.updatedAt.getTime()) return true;
  return pool.dynamic && dayKey(filterContext(pool.poolComputedAt, timeZone)) !== dayKey(filterContext(now, timeZone));
}
