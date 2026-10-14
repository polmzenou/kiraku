import "server-only";
import { cache } from "react";
import { LEDGER_PAGE, ledgerWhere, type CoinReason, type LedgerFilter } from "@/lib/economy/ledger-view";
import { prisma } from "../db";

// Lectures de l'économie pour les pages (hors transaction).

/** Boosters crédités du joueur, par type (seulement ceux qui en ont encore). Lu une fois par requête. */
export const getBoosterCredits = cache(async (userId: string): Promise<Map<string, number>> => {
  const rows = await prisma.boosterCredit.findMany({
    where: { userId, count: { gt: 0 } },
    select: { boosterTypeId: true, count: true },
  });
  return new Map(rows.map((r) => [r.boosterTypeId, r.count]));
});

export type LedgerRow = {
  id: string;
  amount: number;
  reason: CoinReason;
  refId: string | null;
  balanceAfter: number | null;
  createdAt: Date;
};

/** Historique des Zeni, du plus récent au plus ancien, par curseur (id de la dernière ligne lue). */
export async function listLedger(userId: string, filter: LedgerFilter, cursor: string | null) {
  // Le curseur doit être une ligne du joueur : sinon on repart du début
  const validCursor = cursor
    ? await prisma.coinTransaction.findFirst({ where: { id: cursor, userId }, select: { id: true } })
    : null;
  const rows = await prisma.coinTransaction.findMany({
    where: { userId, ...ledgerWhere(filter) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LEDGER_PAGE + 1,
    ...(validCursor ? { cursor: { id: validCursor.id }, skip: 1 } : {}),
    select: { id: true, amount: true, reason: true, refId: true, balanceAfter: true, createdAt: true },
  });
  const items: LedgerRow[] = rows.slice(0, LEDGER_PAGE);
  return { items, nextCursor: rows.length > LEDGER_PAGE ? items[items.length - 1].id : null };
}

/** Totaux du joueur sur 30 jours : gagnés et dépensés. */
export async function ledgerTotals(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [earned, spent] = await Promise.all([
    prisma.coinTransaction.aggregate({ where: { userId, amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.coinTransaction.aggregate({ where: { userId, amount: { lt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
  ]);
  return { earned: earned._sum.amount ?? 0, spent: Math.abs(spent._sum.amount ?? 0) };
}
