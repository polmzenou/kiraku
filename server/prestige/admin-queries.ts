import "server-only";
import { unstable_cache } from "next/cache";
import type { CardView } from "@/lib/boosters/view";
import { SPECIAL_COPY } from "@/lib/collection/copies";
import type { RebirthBoosterView } from "@/lib/prestige/cinematic";
import { eligibilityOf, requiredCount } from "@/lib/prestige/eligibility";
import { cardViews } from "../boosters/display";
import { prisma } from "../db";
import { getSetting } from "../settings";
import { rebirthBoosterView } from "./queries";

/**
 * Banc des rites (/admin/prestige) : de vraies cartes pour les héritières factices, et le booster du réglage (montré
 * même si le réglage n'en offre aucun : `boosters` dit combien la vraie renaissance en crédite).
 */
export async function ritePreviewSample(locale: string): Promise<{ cards: CardView[]; booster: RebirthBoosterView | null; boosters: number }> {
  const [rows, slug, count] = await Promise.all([
    prisma.card.findMany({ where: { status: "PUBLISHED" }, select: { id: true }, orderBy: [{ favorites: "desc" }, { id: "asc" }], take: 20 }),
    getSetting("prestige.rebirthBoosterSlug"),
    getSetting("prestige.rebirthBoosters"),
  ]);
  const [views, booster] = await Promise.all([cardViews(rows.map((r) => r.id), locale), rebirthBoosterView({ slug, count: Math.max(count, 1) }, locale)]);
  return { cards: rows.flatMap((r) => views.get(r.id) ?? []), booster, boosters: count };
}

// Admin du prestige : aperçu d'équilibrage (cartes exigées par rareté, joueurs éligibles et presque éligibles) et
// dernières renaissances. L'aperçu parcourt toute la table UserCard : il est mis en cache quelques minutes.

/** Cartes distinctes publiées possédées, par joueur inscrit actif et par rareté. */
const loadOwnership = unstable_cache(
  async (): Promise<{ userId: string; rarity: string; n: number }[]> =>
    prisma.$queryRaw<{ userId: string; rarity: string; n: number }[]>`
      SELECT uc."ownerId" AS "userId", c."rarityKey" AS rarity, COUNT(DISTINCT uc."cardId")::int AS n
      FROM "UserCard" uc
      JOIN "Card" c ON c.id = uc."cardId"
      JOIN "User" u ON u.id = uc."ownerId"
      WHERE c.status = 'PUBLISHED' AND u."isGuest" = false AND u."bannedAt" IS NULL AND u."anonymizedAt" IS NULL
      GROUP BY 1, 2`,
  ["prestige-ownership-v1"],
  { revalidate: 600 },
);

export type PrestigeBalance = {
  rows: { rarity: string; published: number; pct: number; required: number; players: number }[];
  /** Raretés publiées absentes du réglage : elles ne comptent pas. */
  unset: string[];
  eligible: number;
  /** Joueurs à 90 % au moins de chaque seuil, sans les avoir tous. */
  near: number;
  /** Les plus proches, du plus avancé au moins avancé (part du seuil le plus loin). */
  closest: { username: string; progress: number }[];
};

export async function prestigeBalance(input: { order: readonly string[]; published: Record<string, number>; percent: Record<string, number> }): Promise<PrestigeBalance> {
  const rows = await loadOwnership();
  const byUser = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const owned = byUser.get(r.userId) ?? {};
    owned[r.rarity] = r.n;
    byUser.set(r.userId, owned);
  }
  const base = eligibilityOf({ ...input, owned: {} });
  const players = new Map(base.rows.map((r) => [r.rarity, 0]));
  let eligible = 0;
  let near = 0;
  const progress: { userId: string; progress: number }[] = [];
  for (const [userId, owned] of byUser) {
    const e = eligibilityOf({ ...input, owned });
    for (const row of e.rows) if (row.met) players.set(row.rarity, (players.get(row.rarity) ?? 0) + 1);
    const worst = e.rows.length > 0 ? Math.min(...e.rows.map((row) => row.owned / row.required)) : 0;
    if (e.eligible) eligible++;
    else if (worst >= 0.9) near++;
    progress.push({ userId, progress: worst });
  }
  progress.sort((a, b) => b.progress - a.progress);
  const top = progress.slice(0, 10);
  const names = await prisma.user.findMany({ where: { id: { in: top.map((p) => p.userId) } }, select: { id: true, username: true } });
  const nameOf = new Map(names.map((n) => [n.id, n.username]));
  return {
    rows: base.rows.map((r) => ({ rarity: r.rarity, published: r.published, pct: r.pct, required: requiredCount(r.published, r.pct), players: players.get(r.rarity) ?? 0 })),
    unset: base.unset,
    eligible,
    near,
    closest: top.flatMap((p) => (nameOf.has(p.userId) ? [{ username: nameOf.get(p.userId)!, progress: p.progress }] : [])),
  };
}

/** Dernières renaissances, tous joueurs confondus. */
export async function recentRebirths(take = 30) {
  return prisma.prestigeCycle.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, number: true, globalRank: true, uniqueCards: true, zeni: true, createdAt: true, user: { select: { username: true } } },
  });
}

export type PrintingOverview = { printing: number; cards: number; issued: number; capacity: number; alive: number };

/** Tirages gravés : cartes déjà gravées, numéros sortis sur la capacité ouverte, exemplaires encore en jeu. */
export async function printingOverview(): Promise<PrintingOverview[]> {
  const [counters, alive] = await Promise.all([
    prisma.$queryRaw<Omit<PrintingOverview, "alive">[]>`
      SELECT "printing", COUNT(*)::int AS cards, COALESCE(SUM("issued"), 0)::int AS issued, COALESCE(SUM("size"), 0)::int AS capacity
      FROM "CardPrinting" GROUP BY 1 ORDER BY 1`,
    prisma.userCard.groupBy({ by: ["printing"], where: { printing: { not: null } }, _count: { _all: true } }),
  ]);
  const aliveOf = new Map(alive.map((a) => [a.printing, a._count._all]));
  return counters.map((c) => ({ ...c, alive: aliveOf.get(c.printing) ?? 0 }));
}

/** Fiche joueur de l'admin : prestige, cycles, exemplaires spéciaux (héritières et gravées), sanctuaire. */
export async function adminUserPrestige(userId: string) {
  const [user, cycles, special, consecrated] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { prestige: true, prestigedAt: true } }),
    prisma.prestigeCycle.findMany({ where: { userId }, orderBy: { number: "desc" }, select: { number: true, globalRank: true, zeni: true, uniqueCards: true, createdAt: true } }),
    prisma.userCard.findMany({
      where: { ownerId: userId, ...SPECIAL_COPY },
      orderBy: [{ heritage: "desc" }, { obtainedAt: "asc" }],
      take: 200,
      select: { id: true, status: true, heritage: true, keptByOwner: true, printing: true, serial: true, edition: { select: { size: true } }, card: { select: { name: true, rarity: true } } },
    }),
    prisma.consecratedCard.findMany({ where: { userId }, orderBy: { consecratedAt: "asc" }, select: { id: true, heritage: true, printing: true, serial: true, consecratedAt: true, card: { select: { name: true } } } }),
  ]);
  return user ? { ...user, cycles, special, consecrated } : null;
}
