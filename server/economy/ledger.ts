// Service unique des mouvements de Zeni. Toute écriture sur User.coins passe par ici, toujours
// dans la transaction de l'opération qui la cause, avec sa ligne CoinTransaction. Le client
// transactionnel est injecté (serveur ou test de concurrence) : pas de server/db.ts ici.
//
// Un mouvement = un seul ordre SQL conditionnel :
//   UPDATE "User" SET coins = coins + δ WHERE id = … AND coins + δ >= 0 RETURNING coins
// Deux débits simultanés ne peuvent donc jamais passer le solde sous zéro, verrou ou pas (la base
// porte en plus une contrainte CHECK coins >= 0).
import type { CoinReason, Prisma } from "@/generated/prisma/client";
import { balancesAfter, isValidAmount, isValidSignedAmount } from "@/lib/economy/amount";

type Tx = Prisma.TransactionClient;

export type LedgerErrorCode = "NOT_ENOUGH_ZENI" | "NO_USER" | "INVALID_AMOUNT";

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode) {
    super(code);
  }
}

/** Une ligne du journal : montant signé (+ crédit, − débit). */
export type LedgerEntry = { amount: number; reason: CoinReason; refId?: string | null };

export type Movement = { userId: string; amount: number; reason: CoinReason; refId?: string | null; now?: Date };

/**
 * Applique plusieurs lignes au solde d'un joueur en un seul UPDATE (ex. dix boosters achetés d'un
 * coup : dix lignes, un débit). Renvoie le nouveau solde.
 */
export async function applyEntries(
  tx: Tx,
  userId: string,
  entries: readonly LedgerEntry[],
  now: Date = new Date(),
): Promise<number> {
  if (entries.length === 0) throw new LedgerError("INVALID_AMOUNT");
  if (!entries.every((e) => isValidSignedAmount(e.amount))) throw new LedgerError("INVALID_AMOUNT");
  const delta = entries.reduce((s, e) => s + e.amount, 0);

  const rows = await tx.$queryRaw<{ coins: number }[]>`
    UPDATE "User" SET coins = coins + ${delta}::int
    WHERE id = ${userId} AND coins + ${delta}::int >= 0
    RETURNING coins`;
  if (rows.length === 0) {
    const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    throw new LedgerError(exists ? "NOT_ENOUGH_ZENI" : "NO_USER");
  }
  const balance = Number(rows[0].coins);

  const after = balancesAfter(
    balance,
    entries.map((e) => e.amount),
  );
  await tx.coinTransaction.createMany({
    data: entries.map((e, i) => ({
      userId,
      amount: e.amount,
      reason: e.reason,
      refId: e.refId ?? null,
      balanceAfter: after[i],
      createdAt: now,
    })),
  });
  return balance;
}

/** Crédite `amount` Zeni (> 0). Renvoie le nouveau solde. */
export async function credit(tx: Tx, m: Movement): Promise<number> {
  if (!isValidAmount(m.amount)) throw new LedgerError("INVALID_AMOUNT");
  return applyEntries(tx, m.userId, [{ amount: m.amount, reason: m.reason, refId: m.refId }], m.now);
}

/** Débite `amount` Zeni (> 0) ; LedgerError NOT_ENOUGH_ZENI si le solde ne suffit pas. */
export async function debit(tx: Tx, m: Movement): Promise<number> {
  if (!isValidAmount(m.amount)) throw new LedgerError("INVALID_AMOUNT");
  return applyEntries(tx, m.userId, [{ amount: -m.amount, reason: m.reason, refId: m.refId }], m.now);
}
