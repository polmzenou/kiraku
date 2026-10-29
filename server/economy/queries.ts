import "server-only";
import { cache } from "react";
import { SEALED_KINDS } from "@/lib/boosters/draw";
import type { SealedDropView } from "@/lib/boosters/view";
import { LEDGER_PAGE, ledgerWhere, type CoinReason, type LedgerFilter } from "@/lib/economy/ledger-view";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { playerMissionsWith } from "./missions-core";

// Lectures de l'économie pour les pages (hors transaction).

/** Boosters crédités du joueur, par type (seulement ceux qui en ont encore). Lu une fois par requête. */
export const getBoosterCredits = cache(async (userId: string): Promise<Map<string, number>> => {
  const rows = await prisma.boosterCredit.findMany({
    where: { userId, count: { gt: 0 } },
    select: { boosterTypeId: true, count: true },
  });
  return new Map(rows.map((r) => [r.boosterTypeId, r.count]));
});

/** Le joueur a déjà eu des boosters crédités de ce type : tout ouvert, sa ligne reste à 0. */
export async function hadBoosterCredit(userId: string, boosterTypeId: string): Promise<boolean> {
  const row = await prisma.boosterCredit.findUnique({
    where: { userId_boosterTypeId: { userId, boosterTypeId } },
    select: { count: true },
  });
  return row !== null;
}

/** Sachets scellés à ouvrir du joueur, du plus ancien au plus récent. Lu une fois par requête. */
export const getSealedDrops = cache(async (userId: string): Promise<SealedDropView[]> => {
  const rows = await prisma.sealedDrop.findMany({
    where: { ownerId: userId, openedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
    select: { id: true, giftable: true, boosterType: { select: { slug: true } }, giver: { select: { username: true } } },
  });
  return rows.flatMap((r) => {
    const kind = SEALED_KINDS.find((k) => k === r.boosterType.slug);
    return kind ? [{ id: r.id, kind, giftable: r.giftable, giver: r.giver?.username ?? null }] : [];
  });
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

/**
 * Au moins une mission terminée mais pas encore réclamée (pastille de la navigation). Missions coupées,
 * joueur banni ou erreur de calcul : pas de pastille, la navigation ne doit jamais casser pour ça.
 */
export const hasClaimableMission = cache(async (userId: string): Promise<boolean> => {
  try {
    const [enabled, timeZone] = await Promise.all([getSetting("missions.enabled"), getSetting("game.timeZone")]);
    if (!enabled) return false;
    return (await playerMissionsWith(prisma, userId, new Date(), timeZone)).some((m) => m.state === "CLAIMABLE");
  } catch (e) {
    console.error("[missions] pastille impossible", e);
    return false;
  }
});
