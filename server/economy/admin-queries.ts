import "server-only";
import { localize, parseLocalized } from "@/lib/boosters/types";
import { prisma } from "../db";

// Lectures de /admin pour l'économie : toujours en base, jamais en cache.

/** Zeni en circulation (somme des soldes) et somme du journal : les deux doivent être égales. */
export async function economyTotals() {
  const [coins, ledger, players] = await Promise.all([
    prisma.user.aggregate({ _sum: { coins: true } }),
    prisma.coinTransaction.aggregate({ _sum: { amount: true } }),
    prisma.user.count(),
  ]);
  return { circulating: coins._sum.coins ?? 0, ledger: ledger._sum.amount ?? 0, players };
}

/**
 * Joueurs dont le solde ne correspond pas à la somme de leur journal : une pièce apparue (ou
 * disparue) hors du service des Zeni. Doit toujours être vide.
 */
export async function ledgerMismatches(take = 20) {
  return prisma.$queryRaw<{ id: string; username: string; coins: number; ledger: number }[]>`
    SELECT u.id, u.username, u.coins, COALESCE(l.total, 0)::int AS ledger
    FROM "User" u
    LEFT JOIN (SELECT "userId", SUM(amount) AS total FROM "CoinTransaction" GROUP BY "userId") l ON l."userId" = u.id
    WHERE u.coins <> COALESCE(l.total, 0)
    ORDER BY u."createdAt" DESC
    LIMIT ${take}`;
}

/** Mouvements des dernières 24 h par raison (entrées et sorties de Zeni dans le jeu). */
export async function flowsLastDay() {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await prisma.coinTransaction.groupBy({
    by: ["reason"],
    where: { createdAt: { gte: since } },
    _sum: { amount: true },
    _count: true,
  });
  return rows
    .map((r) => ({ reason: r.reason, amount: r._sum.amount ?? 0, count: r._count }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** Lots pour les listes de choix, nom dans la langue de l'admin. */
export async function lotOptions(locale: string) {
  const lots = await prisma.lot.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, active: true } });
  return lots.map((l) => ({ id: l.id, name: localize(parseLocalized(l.name), locale), active: l.active }));
}

/** Parrains qui ont rattaché le plus de filleuls sur 30 jours (repérer les grappes de multicomptes). */
export async function topReferrers(take = 10) {
  const rows = await prisma.referral.groupBy({
    by: ["referrerId"],
    where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    _count: true,
    orderBy: { _count: { referrerId: "desc" } },
    take,
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.referrerId) } }, select: { id: true, username: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.username]));
  return rows.map((r) => ({ referrerId: r.referrerId, username: nameOf.get(r.referrerId) ?? "?", count: r._count }));
}
