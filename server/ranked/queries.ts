import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { BoardTier } from "@/lib/battle/tiers";
import { decorFromColumns, type PlayerDecor } from "@/lib/profile/decor";
import { divisionRange, ladderRanges, rankedRulesFrom, rankOf, RANKED_SETTING_KEYS, type RankedRules, type TierRanges } from "@/lib/ranked/rules";
import { rewardTier } from "@/lib/ranked/season";
import type { SettingValue } from "@/lib/settings/defaults";
import { prisma } from "../db";
import { lotViews, type LotView } from "../economy/lot-view";
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
  /**
   * Lot de fin de saison si elle se terminait maintenant : celui du meilleur rang atteint (même règle
   * que la clôture). `played` : sans partie classée cette saison, rien n'est versé. Null sans lot réglé.
   */
  seasonReward: { tier: BoardTier; lot: LotView; played: boolean } | null;
  /** Paliers de PC de chaque rang et division (fenêtre « i » à côté de l'emblème). */
  ladder: LadderInfo;
};

export type LadderInfo = { tiers: TierRanges[]; grand: { min: number; top: number } };

export function ladderInfo(r: RankedRules): LadderInfo {
  return { tiers: ladderRanges(r), grand: { min: r.grandChampion.min, top: r.grandChampion.top } };
}

/** Joueurs inscrits non bannis qui ont strictement plus de PC ; null sous le seuil du Grand Champion. */
async function playersAhead(pc: number, r: RankedRules): Promise<number | null> {
  if (pc < r.grandChampion.min) return null;
  return prisma.user.count({ where: { rankPoints: { gt: pc }, bannedAt: null, isGuest: false } });
}

export async function getRankView(userId: string, r: RankedRules, locale: string): Promise<RankView> {
  const [user, season, reward] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rankPoints: true, rankProtection: true, seasonGames: true, seasonPeakPc: true, seasonPeakGrand: true },
    }),
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
  // Meilleur rang de la saison : le rang actuel s'il est plus haut (PC à jour avant le prochain pic)
  const peak = rewardTier(Math.max(user.seasonPeakPc, user.rankPoints), user.seasonPeakGrand || rank.tier === "GRAND_CHAMPION", r);
  const lotId = r.rewardLots[peak];
  const lot = lotId ? (await lotViews([lotId], locale)).get(lotId) : undefined;
  return {
    pc: user.rankPoints,
    ...rank,
    nextRank: next ? { tier: next.tier, division: next.division } : null,
    protection: user.rankProtection,
    seasonGames: user.seasonGames,
    season: season ? { number: season.number, endsAt: season.endsAt.toISOString() } : null,
    reward: reward ? { seasonId: reward.seasonId, seasonNumber: reward.season.number, peakTier: reward.peakTier as BoardTier } : null,
    grand: rank.tier === "GRAND_CHAMPION" && ahead !== null ? { position: ahead + 1, top: r.grandChampion.top } : null,
    seasonReward: lot ? { tier: peak, lot, played: user.seasonGames > 0 } : null,
    ladder: ladderInfo(r),
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

export type DivisionEntry = RankedEntry & { self: boolean };

export type DivisionBoard = {
  tier: BoardTier;
  division: 1 | 2 | 3 | null;
  /** Joueurs de la division, profils privés compris (seuls les publics et le joueur sont listés). */
  total: number;
  entries: DivisionEntry[];
};

type DivisionRow = Row & { id: string; total: number };

const DIVISION_SIZE = 50;

/**
 * Joueurs d'une même division : PC dans ses paliers, joueurs du classé seulement (PC ou partie cette
 * saison). Grand Champion à part : le rang se décide au top (`ahead` = joueurs strictement devant,
 * même règle que getRankView), d'où `grand` = true pour n'en garder que les Grands Champions, false
 * pour les exclure de Champion I. Position = celle du classement général. En cache 60 s par division.
 */
function divisionQuery(min: number, max: number | null, grand: boolean, gc: { min: number; top: number }) {
  return Prisma.sql`
    SELECT * FROM (
      SELECT ranked.*, (COUNT(*) OVER ())::int AS total FROM (
        SELECT (ROW_NUMBER() OVER (ORDER BY u."rankPoints" DESC, u."createdAt" ASC))::int AS position,
               (RANK() OVER (ORDER BY u."rankPoints" DESC))::int - 1 AS ahead,
               u.id, u.username, u.image, u."rankPoints" AS pc, u."seasonGames" AS games,
               (u."profileVisibility" = 'PUBLIC') AS public, ${decorColumns}
        FROM "User" u
        WHERE u."bannedAt" IS NULL AND u."isGuest" = false
      ) ranked
      WHERE ranked.pc >= ${min} AND (${max}::int IS NULL OR ranked.pc <= ${max}::int)
        AND (ranked.pc > 0 OR ranked.games > 0)
        AND ((ranked.pc >= ${gc.min} AND ranked.ahead < ${gc.top}) = ${grand})
    ) division`;
}

const loadDivision = unstable_cache(
  async (min: number, max: number | null, grand: boolean, gcMin: number, gcTop: number) =>
    prisma.$queryRaw<DivisionRow[]>`${divisionQuery(min, max, grand, { min: gcMin, top: gcTop })} WHERE division.public ORDER BY position LIMIT ${DIVISION_SIZE}`,
  ["ranked-division-v1"],
  { tags: [RANKED_TAG], revalidate: 60 },
);

export async function getDivisionBoard(userId: string, rank: Pick<RankView, "tier" | "division">, r: RankedRules): Promise<DivisionBoard> {
  const grand = rank.tier === "GRAND_CHAMPION";
  const { min, max } = divisionRange(rank, r);
  const [rows, [self]] = await Promise.all([
    loadDivision(min, max, grand, r.grandChampion.min, r.grandChampion.top),
    // Le joueur toujours listé, même privé ou hors des premiers (lecture non mise en cache)
    prisma.$queryRaw<DivisionRow[]>`${divisionQuery(min, max, grand, r.grandChampion)} WHERE division.id = ${userId}`,
  ]);
  const all = self && !rows.some((row) => row.id === userId) ? [...rows, self] : rows;
  const toEntry = (row: DivisionRow): DivisionEntry => {
    const at = rankOf(row.pc, grand, r);
    return {
      position: row.position,
      username: row.username,
      image: row.image,
      pc: row.pc,
      tier: at.tier,
      division: at.division,
      decor: decorFromColumns(row.frameStyle, row.nameColor),
      self: row.id === userId,
    };
  };
  return { tier: rank.tier, division: rank.division, total: self?.total ?? rows[0]?.total ?? 0, entries: all.map(toEntry) };
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
