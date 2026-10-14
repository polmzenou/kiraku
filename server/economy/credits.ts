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

/** Boosters à ouvrir d'un type. */
export async function creditCount(tx: Tx, userId: string, boosterTypeId: string): Promise<number> {
  const row = await tx.boosterCredit.findUnique({
    where: { userId_boosterTypeId: { userId, boosterTypeId } },
    select: { count: true },
  });
  return row?.count ?? 0;
}
