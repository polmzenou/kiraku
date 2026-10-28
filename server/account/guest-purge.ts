import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { guestCutoff, sessionActiveSince } from "@/lib/account/guest-retention";
import { SESSION_MAX_AGE } from "../session";

// Purge quotidienne des comptes invités abandonnés (cron des comptes) : créés il y a plus de
// guest.retentionDays jours et sans activité depuis (ni session prolongée, ni tirage, ni mouvement
// de Zeni). Un invité ne peut rien partager (marché, échanges, cadeaux, combats refusés) : la cascade
// du schéma emporte ses cartes, tirages et journal sans toucher aucun autre joueur.

type Db = Pick<PrismaClient, "$queryRaw">;

/** Supprime un lot d'invités inactifs ; les conditions sont revérifiées au moment de la suppression. */
async function deleteBatch(db: Db, cutoff: Date, sessionCutoff: Date, limit: number, onlyId?: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    DELETE FROM "User" WHERE id IN (
      SELECT u.id FROM "User" u
      WHERE u."isGuest" AND u.role = 'USER' AND u."createdAt" < ${cutoff}
        AND (${onlyId ?? null}::text IS NULL OR u.id = ${onlyId ?? null}::text)
        AND NOT EXISTS (SELECT 1 FROM "Session" s WHERE s."userId" = u.id AND s.expires > ${sessionCutoff})
        AND NOT EXISTS (SELECT 1 FROM "BoosterOpening" b WHERE b."userId" = u.id AND b."createdAt" >= ${cutoff})
        AND NOT EXISTS (SELECT 1 FROM "CoinTransaction" c WHERE c."userId" = u.id AND c."createdAt" >= ${cutoff})
      ORDER BY u."createdAt"
      LIMIT ${limit}
    ) AND "isGuest"
    RETURNING id`;
  return rows.length;
}

/** Invités candidats d'un lot (pour la reprise ligne par ligne après l'échec d'un lot). */
async function candidates(db: Db, cutoff: Date, sessionCutoff: Date, limit: number) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u
    WHERE u."isGuest" AND u.role = 'USER' AND u."createdAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "Session" s WHERE s."userId" = u.id AND s.expires > ${sessionCutoff})
      AND NOT EXISTS (SELECT 1 FROM "BoosterOpening" b WHERE b."userId" = u.id AND b."createdAt" >= ${cutoff})
      AND NOT EXISTS (SELECT 1 FROM "CoinTransaction" c WHERE c."userId" = u.id AND c."createdAt" >= ${cutoff})
    ORDER BY u."createdAt"
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export async function purgeInactiveGuestsWith(
  db: Db,
  now: Date,
  opts: { days: number; budgetMs?: number; batch?: number },
): Promise<{ deleted: number; failed: number }> {
  const result = { deleted: 0, failed: 0 };
  const cutoff = guestCutoff(now, opts.days);
  if (!cutoff) return result;
  const sessionCutoff = sessionActiveSince(cutoff, SESSION_MAX_AGE);
  const batch = opts.batch ?? 200;
  const started = Date.now();
  const skipped = new Set<string>();

  while (Date.now() - started < (opts.budgetMs ?? 10_000)) {
    let n: number;
    try {
      n = await deleteBatch(db, cutoff, sessionCutoff, batch);
    } catch (e) {
      // Un compte bloque le lot (contrainte inattendue) : un par un, en sautant ceux qui échouent
      console.error("[invités] lot en échec, reprise ligne par ligne", e instanceof Error ? e.message : e);
      n = 0;
      for (const id of await candidates(db, cutoff, sessionCutoff, batch + skipped.size)) {
        if (skipped.has(id)) continue;
        try {
          n += await deleteBatch(db, cutoff, sessionCutoff, 1, id);
        } catch (err) {
          skipped.add(id);
          result.failed += 1;
          console.error(`[invités] suppression de ${id} impossible`, err instanceof Error ? err.message : err);
        }
      }
      result.deleted += n;
      // Plus rien de supprimable hors comptes bloquants : on s'arrête pour aujourd'hui
      if (n === 0) break;
      continue;
    }
    result.deleted += n;
    if (n < batch) break;
  }
  return result;
}
