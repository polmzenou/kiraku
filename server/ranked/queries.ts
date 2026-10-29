import "server-only";
import { unstable_cache } from "next/cache";
import type { BoardTier } from "@/lib/battle/tiers";
import { decorFromColumns, type PlayerDecor } from "@/lib/profile/decor";
import { rankedRulesFrom, rankOf, RANKED_SETTING_KEYS, type RankedRules } from "@/lib/ranked/rules";
import type { SettingValue } from "@/lib/settings/defaults";
import { prisma } from "../db";
import { decorColumns, type DecorColumns } from "../profile/decor";
import { getSetting } from "../settings";
import { currentSeasonWith, rollSeasonWith, type SeasonRow } from "./ranked-core";

// Lectures du classé. La saison se clôt paresseusement (affichage de /combat, entrée en file
// classée) et par le cron quotidien ; le classement public est recalculé au plus toutes les minutes.

export const RANKED_TAG = "ranked-leaderboard";

export async function getRankedRules(): Promise<RankedRules> {
  const values = await Promise.all(RANKED_SETTING_KEYS.map((k) => getSetting(k)));
  const byKey = new Map<string, unknown>(RANKED_SETTING_KEYS.map((k, i) => [k, values[i]]));
  return rankedRulesFrom((key) => byKey.get(key) as SettingValue<typeof key>);
}

/** Saison ouverte, après avoir clos celle qui serait terminée. Ne fait jamais échouer l'affichage. */
export async function ensureSeason(r: RankedRules, now = new Date()): Promise<SeasonRow | null> {
  try {
    const timeZone = await getSetting("game.timeZone");
    await rollSeasonWith(prisma, now, r, timeZone);
    return await currentSeasonWith(prisma, now, r, timeZone);
  } catch (e) {
    console.error("[classé] saison", e);
    return null;
  }
}

export type RankView = {
  pc: number;
  tier: BoardTier;
  division: 1 | 2 | 3 | null;
  floor: number;
  next: number | null;
  progress: number;
  /** Palier suivant (nom affiché : « 10 PC avant Or III »). */
  nextRank: { tier: BoardTier; division: 1 | 2 | 3 | null } | null;
  protection: number;
  seasonGames: number;
  season: { number: number; endsAt: string } | null;
  /** Récompense de fin de saison à réclamer. */
  reward: { seasonId: string; seasonNumber: number; peakTier: BoardTier } | null;
  /** Grand Champion : sa place dans le top (« 12 sur 100 »), d'après les points de classement. */
  grand: { position: number; top: number } | null;
};

/** Joueurs inscrits non bannis qui ont strictement plus de PC ; null sous le seuil du Grand Champion. */
async function playersAhead(pc: number, r: RankedRules): Promise<number | null> {
  if (pc < r.grandChampion.min) return null;
  return prisma.user.count({ where: { rankPoints: { gt: pc }, bannedAt: null, isGuest: false } });
}

export async function getRankView(userId: string, r: RankedRules): Promise<RankView> {
  const [user, season, reward] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rankPoints: true, rankProtection: true, seasonGames: true } }),
    ensureSeason(r),
    prisma.seasonResult.findFirst({
      where: { userId, claimedAt: null, lotId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { seasonId: true, peakTier: true, season: { select: { number: true } } },
    }),
  ]);
  const ahead = await playersAhead(user.rankPoints, r);
  // Top du Grand Champion : place partagée à égalité de PC (même règle que le passage au rang)
  const top = ahead !== null && ahead < r.grandChampion.top;
  const rank = rankOf(user.rankPoints, top, r);
  const next = rank.next === null ? null : rank.next >= r.grandChampion.min ? rankOf(rank.next, true, r) : rankOf(rank.next, false, r);
  return {
    pc: user.rankPoints,
    ...rank,
    nextRank: next ? { tier: next.tier, division: next.division } : null,
    protection: user.rankProtection,
    seasonGames: user.seasonGames,
    season: season ? { number: season.number, endsAt: season.endsAt.toISOString() } : null,
    reward: reward ? { seasonId: reward.seasonId, seasonNumber: reward.season.number, peakTier: reward.peakTier as BoardTier } : null,
    grand: rank.tier === "GRAND_CHAMPION" && ahead !== null ? { position: ahead + 1, top: r.grandChampion.top } : null,
  };
}

export type RankedEntry = {
  position: number;
  username: string;
  image: string | null;
  pc: number;
  tier: BoardTier;
  division: 1 | 2 | 3 | null;
  decor: PlayerDecor;
};

type Row = { position: number; username: string; image: string | null; pc: number; public: boolean } & DecorColumns;

/**
 * Top du classé : la position compte tous les joueurs inscrits non bannis (c'est elle qui fait les
 * Grands Champions), mais seuls les profils publics sont affichés. En cache 60 s.
 */
const loadRankedTop = unstable_cache(
  async (size: number) =>
    prisma.$queryRaw<Row[]>`
      SELECT * FROM (
        SELECT (ROW_NUMBER() OVER (ORDER BY u."rankPoints" DESC, u."createdAt" ASC))::int AS position,
               u.username, u.image, u."rankPoints" AS pc, (u."profileVisibility" = 'PUBLIC') AS public, ${decorColumns}
        FROM "User" u
        WHERE u."bannedAt" IS NULL AND u."isGuest" = false AND u."rankPoints" > 0
      ) ranked
      WHERE position <= ${size}
      ORDER BY position`,
  ["ranked-top-v2"],
  { tags: [RANKED_TAG], revalidate: 60 },
);

export async function getRankedLeaderboard(r: RankedRules): Promise<RankedEntry[]> {
  const rows = await loadRankedTop(Math.max(100, r.grandChampion.top));
  return rows
    .filter((row) => row.public)
    .map((row) => {
      const rank = rankOf(row.pc, row.position <= r.grandChampion.top, r);
      return {
        position: row.position,
        username: row.username,
        image: row.image,
        pc: row.pc,
        tier: rank.tier,
        division: rank.division,
        decor: decorFromColumns(row.frameStyle, row.nameColor),
      };
    });
}

/** Santé du classé pour /admin/classe. */
export async function rankedTotals(now: Date) {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [players, games, grand] = await Promise.all([
    prisma.user.count({ where: { seasonGames: { gt: 0 } } }),
    prisma.battle.count({ where: { mode: "RANKED", status: "FINISHED", endedAt: { gte: since } } }),
    prisma.user.count({ where: { seasonPeakGrand: true } }),
  ]);
  return { players, games, grand };
}
