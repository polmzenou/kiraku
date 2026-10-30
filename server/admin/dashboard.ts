import "server-only";
import { combatTotals } from "../battle/queries";
import { prisma } from "../db";
import { economyTotals, ledgerMismatches } from "../economy/admin-queries";
import { marketTotals } from "../market/queries";

const DAY_MS = 86_400_000;

/** Joueurs actifs, nouveaux comptes et boosters ouverts sur les dernières 24 h. */
async function playerTotals(now: Date) {
  const since = new Date(now.getTime() - DAY_MS);
  // Actif = au moins un tirage, un mouvement de Zeni ou un combat dans la fenêtre
  const [[active], signups, guests, boosters] = await Promise.all([
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT "userId" AS id FROM "BoosterOpening" WHERE "createdAt" >= ${since}
        UNION SELECT "userId" FROM "CoinTransaction" WHERE "createdAt" >= ${since}
        UNION SELECT "p1Id" FROM "Battle" WHERE "createdAt" >= ${since}
        UNION SELECT "p2Id" FROM "Battle" WHERE "createdAt" >= ${since} AND "p2Id" IS NOT NULL
      ) AS a`,
    prisma.user.count({ where: { createdAt: { gte: since }, isGuest: false } }),
    prisma.user.count({ where: { createdAt: { gte: since }, isGuest: true } }),
    prisma.boosterOpening.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { active24h: active?.count ?? 0, signups24h: signups, guests24h: guests, boosters24h: boosters };
}

/** Tableau de bord de /admin, lu en base. */
async function readDashboard(now: Date) {
  const [players, economy, mismatches, market, combat, pendingDeletions, banned] = await Promise.all([
    playerTotals(now),
    economyTotals(),
    ledgerMismatches(1),
    marketTotals(now),
    combatTotals(now),
    prisma.dataRequest.count({ where: { kind: "DELETION", status: "PENDING" } }),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
  ]);
  return { players, economy, ledgerOk: mismatches.length === 0, market, combat, pendingDeletions, banned };
}

// Gardé 60 s en mémoire du processus : une vingtaine de requêtes, dont le contrôle complet du journal
// des Zeni, partaient à chaque ouverture de /admin et prenaient le pool pendant que les joueurs
// attendaient. Le contrôle détaillé reste en direct sur /admin/economie.
const DASHBOARD_MS = 60_000;
let memo: { at: number; data: ReturnType<typeof readDashboard> } | null = null;

export function adminDashboard(now = new Date()): ReturnType<typeof readDashboard> {
  if (memo && now.getTime() - memo.at < DASHBOARD_MS) return memo.data;
  const entry = { at: now.getTime(), data: readDashboard(now) };
  memo = entry;
  entry.data.catch(() => {
    if (memo === entry) memo = null;
  });
  return entry.data;
}
