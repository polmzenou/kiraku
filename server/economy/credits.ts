// Crédits de boosters par type (cadeaux d'amis, boutique, missions, parrainage). Le client
// transactionnel est injecté. Ajout et retrait sont atomiques sans verrou : un INSERT … ON CONFLICT
// pour ajouter, un UPDATE conditionnel pour retirer (la base porte aussi CHECK count >= 0).
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const MAX_CREDIT_GRANT = 1_000;

export class CreditError extends Error {
  constructor(readonly code: "NO_CREDIT" | "INVALID") {
    super(code);
  }
}

/** Ajoute `count` boosters du type à ouvrir. */
export async function grantBoosters(tx: Tx, userId: string, boosterTypeId: string, count: number): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CREDIT_GRANT) throw new CreditError("INVALID");
  await tx.$executeRaw`
    INSERT INTO "BoosterCredit" ("userId", "boosterTypeId", "count", "updatedAt")
    VALUES (${userId}, ${boosterTypeId}, ${count}::int, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "boosterTypeId")
    DO UPDATE SET "count" = "BoosterCredit"."count" + EXCLUDED."count", "updatedAt" = CURRENT_TIMESTAMP`;
}

/** Retire `count` boosters du type ; CreditError NO_CREDIT s'il n'y en a pas assez. Renvoie le reste. */
export async function consumeBoosters(tx: Tx, userId: string, boosterTypeId: string, count: number): Promise<number> {
  if (!Number.isInteger(count) || count < 1) throw new CreditError("INVALID");
  const rows = await tx.$queryRaw<{ count: number }[]>`
    UPDATE "BoosterCredit" SET "count" = "count" - ${count}::int, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId} AND "boosterTypeId" = ${boosterTypeId} AND "count" >= ${count}::int
    RETURNING "count"`;
  if (rows.length === 0) throw new CreditError("NO_CREDIT");
  return Number(rows[0].count);
}

/**
 * Retire au plus `max` boosters du type, sans jamais descendre sous zéro (reprise d'un parrainage : on reprend ce qui
 * reste). Renvoie le nombre retiré. Le joueur doit être verrouillé par l'appelant.
 */
export async function consumeBoostersUpTo(tx: Tx, userId: string, boosterTypeId: string, max: number): Promise<number> {
  if (!Number.isInteger(max) || max < 1) return 0;
  const rows = await tx.$queryRaw<{ taken: number }[]>`
    WITH before AS (
      SELECT "count" FROM "BoosterCredit" WHERE "userId" = ${userId} AND "boosterTypeId" = ${boosterTypeId} FOR UPDATE
    )
    UPDATE "BoosterCredit" c SET "count" = c."count" - LEAST(before."count", ${max}::int), "updatedAt" = CURRENT_TIMESTAMP
    FROM before
    WHERE c."userId" = ${userId} AND c."boosterTypeId" = ${boosterTypeId} AND before."count" > 0
    RETURNING LEAST(before."count", ${max}::int) AS taken`;
  return rows.length === 0 ? 0 : Number(rows[0].taken);
}
