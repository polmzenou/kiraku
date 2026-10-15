// Classé (étape 9b), atomique. Le client Prisma est injecté (serveur ou test) : pas de server/db.ts ici.
//
// Les PC ne bougent qu'ici, dans la transaction qui termine la partie (battle-core.ts › persist) :
// les deux joueurs sont verrouillés (lockPlayers, triés par id), le top 100 est relu en base sous ce
// verrou, et la version de la partie garantit une seule application. La fin de saison verrouille la
// saison ouverte et pose closedAt une seule fois ; la récompense se réclame une seule fois.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { outcome } from "@/lib/battle/engine";
import type { BattleSetup, BattleState, Side } from "@/lib/battle/types";
import type { BoardTier } from "@/lib/battle/tiers";
import { applyResult, botDelta, isCrushing, LADDER, pcDelta, rankOf, rowOf, type RankedRules } from "@/lib/ranked/rules";
import { nextSeasonBoundary } from "@/lib/ranked/season";
import { grantLot, type LotDeps, type LotGrant } from "../economy/lots";
import { lockPlayers, type Tx } from "../social/lock";

type Db = PrismaClient | Tx;

export type RankedErrorCode = "NOT_FOUND" | "NO_REWARD" | "ALREADY_CLAIMED" | "NO_USER";

export class RankedError extends Error {
  constructor(readonly code: RankedErrorCode) {
    super(code);
  }
}

/** Résultat classé d'un camp, diffusé avec la fin de partie (rien de secret). */
export type RankedSide = {
  before: number;
  after: number;
  delta: number;
  promoted: boolean;
  demoted: boolean;
  /** La protection a retenu une chute sous le plancher du rang. */
  saved: boolean;
  protection: number;
  grandBefore: boolean;
  grandAfter: boolean;
};

export type RankedOutcome = { crushing: boolean; sides: [RankedSide | null, RankedSide | null] };

/** Dans le top `top` des joueurs (bannis et invités exclus) avec au moins `min` PC ? */
async function inTop(db: Db, pc: number, r: RankedRules, exceptId?: string): Promise<boolean> {
  if (pc < r.grandChampion.min) return false;
  const above = await db.user.count({
    where: { rankPoints: { gt: pc }, bannedAt: null, isGuest: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  return above < r.grandChampion.top;
}

/** Rang de chaque camp au lancement (couleur du plateau). Le bot prend le rang du joueur. */
export async function startTiers(db: Db, p1Id: string, p2Id: string | null, r: RankedRules): Promise<[BoardTier, BoardTier]> {
  const ids = [p1Id, p2Id].filter((x): x is string => x !== null);
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, rankPoints: true } });
  const tierOf = async (id: string) => {
    const pc = users.find((u) => u.id === id)?.rankPoints ?? 0;
    return rankOf(pc, await inTop(db, pc, r), r).tier;
  };
  const t1 = await tierOf(p1Id);
  return [t1, p2Id ? await tierOf(p2Id) : t1];
}

/**
 * Applique les PC d'une partie classée terminée. Match nul : 0. Contre un bot : botPcPct %.
 * Anti-boost : un abandon ou un minuteur avant le 3e tour coûte au partant, mais ne rapporte rien.
 */
export async function applyRankedWith(
  tx: Tx,
  b: { id: string; p1Id: string; p2Id: string | null },
  setup: BattleSetup,
  state: BattleState,
  r: RankedRules,
): Promise<{ outcome: RankedOutcome; data: Prisma.BattleUncheckedUpdateManyInput }> {
  const ids = [b.p1Id, b.p2Id].filter((x): x is string => x !== null);
  await lockPlayers(tx, ids);
  const users = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, rankPoints: true, rankProtection: true, seasonPeakPc: true, seasonPeakGrand: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const players: [typeof users[number] | undefined, typeof users[number] | undefined] = [byId.get(b.p1Id), b.p2Id ? byId.get(b.p2Id) : undefined];
  const bot = b.p2Id === null;
  const o = outcome(setup, state);
  const crushing = state.winner !== null && isCrushing(o[state.winner], r.crushHpPct);
  const early = state.turn < 3 && (state.endReason === "FORFEIT" || state.endReason === "TIMEOUT");

  // Variations calculées sur les PC d'avant, pour les deux camps
  const plans: ({ id: string; before: number; protection: number; delta: number; grandBefore: boolean; peak: number; peakGrand: boolean } | null)[] = [];
  for (const side of [0, 1] as Side[]) {
    const me = players[side];
    if (!me) {
      plans.push(null);
      continue;
    }
    const opp = players[side === 0 ? 1 : 0];
    const oppPc = bot ? me.rankPoints : (opp?.rankPoints ?? me.rankPoints);
    const grandBefore = await inTop(tx, me.rankPoints, r);
    let delta = 0;
    if (state.winner !== null) {
      const won = state.winner === side;
      delta = pcDelta({ pc: me.rankPoints, oppPc, won, crushing, row: rowOf(rankOf(me.rankPoints, grandBefore, r), r) }, r);
      if (bot) delta = botDelta(delta, r);
      if (won && early) delta = 0;
    }
    plans.push({ id: me.id, before: me.rankPoints, protection: me.rankProtection, delta, grandBefore, peak: me.seasonPeakPc, peakGrand: me.seasonPeakGrand });
  }

  const sides: [RankedSide | null, RankedSide | null] = [null, null];
  for (const side of [0, 1] as Side[]) {
    const plan = plans[side];
    if (!plan) continue;
    const applied = applyResult({ pc: plan.before, delta: plan.delta, protection: plan.protection }, r);
    await tx.user.update({
      where: { id: plan.id },
      data: {
        rankPoints: applied.pc,
        rankProtection: applied.protection,
        seasonPeakPc: Math.max(plan.peak, applied.pc),
        seasonGames: { increment: 1 },
      },
    });
    sides[side] = { before: plan.before, after: applied.pc, delta: applied.delta, promoted: applied.promoted, demoted: applied.demoted, saved: applied.saved, protection: applied.protection, grandBefore: plan.grandBefore, grandAfter: false };
  }
  // Top 100 relu après les deux écritures : un joueur qui y entre devient Grand Champion de la saison
  for (const side of [0, 1] as Side[]) {
    const s = sides[side];
    const plan = plans[side];
    if (!s || !plan) continue;
    s.grandAfter = await inTop(tx, s.after, r, plan.id);
    if (s.grandAfter && !plan.peakGrand) await tx.user.update({ where: { id: plan.id }, data: { seasonPeakGrand: true } });
  }

  const season = await tx.season.findFirst({ where: { closedAt: null }, orderBy: { number: "desc" }, select: { id: true } });
  return {
    outcome: { crushing, sides },
    data: {
      crushing,
      seasonId: season?.id ?? null,
      pcBeforeP1: sides[0]?.before ?? null,
      pcDeltaP1: sides[0]?.delta ?? null,
      pcBeforeP2: sides[1]?.before ?? null,
      pcDeltaP2: sides[1]?.delta ?? null,
    },
  };
}

// --- Saisons ---

export type SeasonRow = { id: string; number: number; startsAt: Date; endsAt: Date };

/** Saison ouverte ; la première est créée à la volée (de maintenant au prochain changement). */
export async function currentSeasonWith(db: PrismaClient, now: Date, r: RankedRules, timeZone: string): Promise<SeasonRow> {
  const open = await db.season.findFirst({ where: { closedAt: null }, orderBy: { number: "desc" }, select: { id: true, number: true, startsAt: true, endsAt: true } });
  if (open) return open;
  const last = await db.season.findFirst({ orderBy: { number: "desc" }, select: { number: true, endsAt: true } });
  const startsAt = last?.endsAt ?? now;
  try {
    return await db.season.create({
      data: { number: (last?.number ?? 0) + 1, startsAt, endsAt: nextSeasonBoundary(startsAt > now ? startsAt : now, r.seasonMonths, timeZone) },
      select: { id: true, number: true, startsAt: true, endsAt: true },
    });
  } catch (e) {
    // Deux créations simultanées : l'autre a gagné, on la relit
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.season.findFirstOrThrow({ where: { closedAt: null }, orderBy: { number: "desc" }, select: { id: true, number: true, startsAt: true, endsAt: true } });
    }
    throw e;
  }
}

/** Rang atteint selon les PC, en SQL (même logique que ladderTier) ; Grand Champion si atteint. */
function peakTierSql(r: RankedRules): Prisma.Sql {
  const cases = [...LADDER].reverse().map((t) => Prisma.sql`WHEN u."seasonPeakPc" >= ${r.tiers[t].min} THEN ${t}`);
  return Prisma.sql`CASE WHEN u."seasonPeakGrand" THEN 'GRAND_CHAMPION' ${Prisma.join(cases, " ")} ELSE 'BRONZE' END`;
}

function lotSql(r: RankedRules): Prisma.Sql {
  const tiers = [...LADDER, "GRAND_CHAMPION"] as const;
  const cases = tiers.map((t) => Prisma.sql`WHEN ${t} THEN ${r.rewardLots[t]}::text`);
  return Prisma.sql`CASE ${peakTierSql(r)} ${Prisma.join(cases, " ")} ELSE NULL END`;
}

/**
 * Clôt la saison ouverte si elle est terminée (idempotent) : bilans et lots selon le meilleur rang
 * atteint, remise à zéro des PC au-dessus du pivot, puis ouverture de la saison suivante.
 * `force` : clôture anticipée depuis l'admin.
 */
export async function rollSeasonWith(
  db: PrismaClient,
  now: Date,
  r: RankedRules,
  timeZone: string,
  opts: { force?: boolean } = {},
): Promise<{ closed: SeasonRow | null; results: number }> {
  await currentSeasonWith(db, now, r, timeZone);
  return db.$transaction(
    async (tx) => {
      const [s] = await tx.$queryRaw<SeasonRow[]>`
        SELECT id, number, "startsAt", "endsAt" FROM "Season" WHERE "closedAt" IS NULL ORDER BY number DESC LIMIT 1 FOR UPDATE`;
      if (!s || (!opts.force && s.endsAt > now)) return { closed: null, results: 0 };
      const results = await tx.$executeRaw`
        INSERT INTO "SeasonResult" ("seasonId", "userId", "finalPc", "peakPc", "peakTier", "games", "lotId", "createdAt")
        SELECT ${s.id}, u.id, u."rankPoints", u."seasonPeakPc", ${peakTierSql(r)}, u."seasonGames", ${lotSql(r)}, ${now}
        FROM "User" u WHERE u."seasonGames" > 0
        ON CONFLICT DO NOTHING`;
      const { pivot, keepPct } = r.reset;
      const reset = Prisma.sql`CASE WHEN "rankPoints" > ${pivot} THEN ${pivot} + FLOOR(("rankPoints" - ${pivot}) * ${keepPct} / 100.0)::int ELSE "rankPoints" END`;
      await tx.$executeRaw`
        UPDATE "User" SET "rankPoints" = ${reset}, "seasonPeakPc" = ${reset}, "seasonPeakGrand" = false, "seasonGames" = 0, "rankProtection" = 0
        WHERE "rankPoints" > 0 OR "seasonGames" > 0 OR "seasonPeakPc" > 0 OR "rankProtection" > 0`;
      const end = opts.force ? now : s.endsAt;
      await tx.season.update({ where: { id: s.id }, data: { closedAt: now, endsAt: end } });
      await tx.season.create({
        data: { number: s.number + 1, startsAt: end, endsAt: nextSeasonBoundary(end > now ? end : now, r.seasonMonths, timeZone) },
      });
      return { closed: { ...s, endsAt: end }, results };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

/** Réclame le lot de fin de saison (une seule fois). */
export async function claimSeasonRewardWith(
  db: PrismaClient,
  input: { userId: string; seasonId: string; now: Date },
  deps: LotDeps,
): Promise<LotGrant> {
  return db.$transaction(
    async (tx) => {
      if (!(await lockPlayers(tx, [input.userId])).get(input.userId)) throw new RankedError("NO_USER");
      const row = await tx.seasonResult.findUnique({
        where: { seasonId_userId: { seasonId: input.seasonId, userId: input.userId } },
        select: { lotId: true, claimedAt: true },
      });
      if (!row) throw new RankedError("NOT_FOUND");
      if (!row.lotId) throw new RankedError("NO_REWARD");
      const claimed = await tx.seasonResult.updateMany({
        where: { seasonId: input.seasonId, userId: input.userId, claimedAt: null },
        data: { claimedAt: input.now },
      });
      if (claimed.count !== 1) throw new RankedError("ALREADY_CLAIMED");
      return grantLot(tx, input.userId, row.lotId, { reason: "SEASON", refId: input.seasonId }, deps, input.now);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
