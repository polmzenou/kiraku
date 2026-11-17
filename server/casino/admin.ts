import "server-only";
import { periodWindow } from "@/lib/economy/period";
import { prisma } from "../db";
import { getSetting } from "../settings";

// Lectures de /admin/casino : santé du séquestre, statistiques et tables ouvertes.

export type EscrowHealth = {
  /** Tables OPEN (échues comprises tant que le balayage n'est pas passé). */
  openTables: number;
  /** Exemplaires au statut CASINO. */
  stakedCards: number;
  /** Tables ouvertes dont l'échéance est passée : le prochain balayage rend leur carte. */
  expiredOpen: number;
  /** Une table ouverte = une carte en jeu, ni plus ni moins. */
  healthy: boolean;
};

export async function escrowHealth(now = new Date()): Promise<EscrowHealth> {
  const [openTables, stakedCards, expiredOpen] = await Promise.all([
    prisma.coinFlip.count({ where: { status: "OPEN" } }),
    prisma.userCard.count({ where: { status: "CASINO" } }),
    prisma.coinFlip.count({ where: { status: "OPEN", expiresAt: { lte: now } } }),
  ]);
  return { openTables, stakedCards, expiredOpen, healthy: openTables === stakedCards };
}

export type CasinoStats = {
  /** Lancers joués par jour de jeu, du plus ancien au plus récent (14 jours). */
  perDay: { day: string; flips: number }[];
  /** Sur 30 jours. */
  omote: number;
  ura: number;
  creatorWins: number;
  played: number;
  /** Lancers joués par rareté du pot (30 jours), deux cartes changent de main à chaque fois. */
  byRarity: { rarity: string; flips: number }[];
  cancelled: number;
  expired: number;
};

const DAYS = 14;
const WINDOW_DAYS = 30;

export async function casinoStats(now = new Date()): Promise<CasinoStats> {
  const timeZone = await getSetting("game.timeZone");
  const today = periodWindow("DAILY", now, timeZone);
  const since = new Date(today.start.getTime() - (DAYS - 1) * 86_400_000);
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const [perDay, sides, byRarity, closed] = await Promise.all([
    prisma.$queryRaw<{ day: string; flips: number }[]>`
      SELECT to_char(("resolvedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day, count(*)::int AS flips
      FROM "CoinFlip" WHERE status = 'DONE' AND "resolvedAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ omote: number; ura: number; creator_wins: number; played: number }[]>`
      SELECT count(*) FILTER (WHERE result = 'OMOTE')::int AS omote,
             count(*) FILTER (WHERE result = 'URA')::int AS ura,
             count(*) FILTER (WHERE "winnerId" = "creatorId")::int AS creator_wins,
             count(*)::int AS played
      FROM "CoinFlip" WHERE status = 'DONE' AND "resolvedAt" >= ${windowStart}`,
    prisma.coinFlip.groupBy({
      by: ["creatorRarity"],
      where: { status: "DONE", resolvedAt: { gte: windowStart } },
      _count: { _all: true },
    }),
    prisma.coinFlip.groupBy({
      by: ["status"],
      where: { status: { in: ["CANCELLED", "EXPIRED"] }, resolvedAt: { gte: windowStart } },
      _count: { _all: true },
    }),
  ]);
  const s = sides[0] ?? { omote: 0, ura: 0, creator_wins: 0, played: 0 };
  return {
    perDay,
    omote: s.omote,
    ura: s.ura,
    creatorWins: s.creator_wins,
    played: s.played,
    byRarity: byRarity.map((r) => ({ rarity: r.creatorRarity, flips: r._count._all })).sort((a, b) => b.flips - a.flips),
    cancelled: closed.find((c) => c.status === "CANCELLED")?._count._all ?? 0,
    expired: closed.find((c) => c.status === "EXPIRED")?._count._all ?? 0,
  };
}

export type AdminTableRow = {
  id: string;
  cardName: string;
  rarity: string;
  creatorName: string;
  reservedForName: string | null;
  createdAt: Date;
  expiresAt: Date;
};

/** Tables ouvertes, les plus anciennes d'abord (les plus près d'expirer). */
export async function adminOpenTables(take = 100): Promise<AdminTableRow[]> {
  const rows = await prisma.coinFlip.findMany({
    where: { status: "OPEN" },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      creatorRarity: true,
      createdAt: true,
      expiresAt: true,
      creator: { select: { username: true } },
      reservedFor: { select: { username: true } },
      creatorCard: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    cardName: r.creatorCard.name,
    rarity: r.creatorRarity,
    creatorName: r.creator.username,
    reservedForName: r.reservedFor?.username ?? null,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}
