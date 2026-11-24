import "server-only";
import { unstable_cache } from "next/cache";
import { mergeLots } from "@/lib/economy/lot-merge";
import { lastPaidRank, nextTierIndex, rankBand, rankRecruiters, type EnnichiPhase, type EnnichiTitle } from "@/lib/ennichi/rules";
import { prisma } from "../db";
import { lotViews, type LotLine, type LotView } from "../economy/lot-view";
import { recruitersWith, ticketsWith } from "./close-core";
import { ennichiState } from "./deps";
import { lanternCountsWith } from "./lanterns-core";

// Lectures des écrans de l'Ennichi (étape 18d). La vue publique (rue, paliers, rangs, cagnotte) est la même pour tous :
// en cache une minute (tag ENNICHI_TAG) ; la part du joueur est lue à chaque fois. La graine du tirage n'est lue
// qu'après le tirage (vérification) : avant, seule son empreinte sort d'ici.

export const ENNICHI_TAG = "ennichi";
const TIER_KANJI = ["一", "二", "三", "四"] as const;

export type TierView = { index: number; kanji: string; lanterns: number; lot: LotView | null; choiceVouchers: number; reachedAt: string | null; served: number };
export type RankView = { from: number; to: number; title: EnnichiTitle | null; lot: LotView | null; choiceVouchers: number; oneOfOne: boolean };
export type PoolLineView = { line: number; oneOfOne: boolean; lot: LotView | null; count: number };
export type EnnichiView = {
  phase: EnnichiPhase;
  edition: number;
  year: number;
  multiplier: number;
  days: number;
  closingDays: number;
  startsAt: string | null;
  endsAt: string | null;
  closesAt: string | null;
  /** Jour de la fête (1 à days) pendant la fête. */
  dayIndex: number | null;
  lit: number;
  placed: number;
  tiers: TierView[];
  nextTier: number | null;
  ranks: RankView[];
  lastPaidRank: number;
  pool: PoolLineView[];
  seedHash: string | null;
  checkedAt: string | null;
  drawnAt: string | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const lineKey = (l: LotLine) => (l.kind === "BOOSTER" ? `B:${l.look.slug}` : l.kind === "CARD" ? `C:${l.card?.cardId ?? l.name}` : `R:${l.rarity}`);
export const mergeLotViews = (lots: readonly (LotView | null)[]) => mergeLots<LotLine, LotView>(lots, lineKey);

async function buildView(locale: string, nowMs: number): Promise<EnnichiView> {
  const now = new Date(nowMs);
  const state = await ennichiState(now);
  const { rules, schedule, phase, draw } = state;
  const reached = phase === "off" ? [] : await prisma.ennichiTierReached.findMany({ where: { edition: rules.edition }, orderBy: { tier: "asc" } });
  const reachedBy = new Map(reached.map((r) => [r.tier, r]));
  // Palier atteint : son lot figé ; sinon le lot réglé
  const tierLot = (i: number) => (reachedBy.has(i) ? reachedBy.get(i)!.lotId : rules.tiers[i]?.lotId) ?? null;
  const ids = [
    ...rules.tiers.map((_, i) => tierLot(i)),
    ...rules.ranks.map((r) => r.lotId),
    ...rules.omikuji.map((p) => p.lotId),
  ].filter((id): id is string => id !== null);
  const [lots, counts] = await Promise.all([
    lotViews(ids, locale),
    phase === "off" || !schedule ? { placed: 0, lit: 0 } : lanternCountsWith(prisma, rules.edition, now < schedule.closesAt ? now : schedule.closesAt),
  ]);
  const lot = (id: string | null) => (id ? (lots.get(id) ?? null) : null);
  const tiers: TierView[] = rules.tiers.map((t, i) => {
    const r = reachedBy.get(i);
    return {
      index: i,
      kanji: TIER_KANJI[i] ?? String(i + 1),
      lanterns: r?.lanterns ?? t.lanterns,
      lot: lot(tierLot(i)),
      choiceVouchers: r?.choiceVouchers ?? t.choiceVouchers,
      reachedAt: iso(r?.reachedAt),
      served: r?.served ?? 0,
    };
  });
  const startsAt = schedule?.startsAt ?? rules.startsAt;
  return {
    phase,
    edition: rules.edition,
    year: (startsAt ?? now).getUTCFullYear(),
    multiplier: rules.stepMultiplier,
    days: rules.days,
    closingDays: rules.closingDays,
    startsAt: iso(schedule?.startsAt),
    endsAt: iso(schedule?.endsAt),
    closesAt: iso(schedule?.closesAt),
    dayIndex: phase === "live" && schedule ? Math.min(rules.days, Math.floor((now.getTime() - schedule.startsAt.getTime()) / 86_400_000) + 1) : null,
    lit: counts.lit,
    placed: counts.placed,
    tiers,
    nextTier: nextTierIndex(counts.lit, tiers.map((t) => ({ lanterns: t.lanterns })), tiers.map((t) => t.reachedAt !== null)),
    ranks: rules.ranks.map((r) => ({ from: r.from, to: r.to, title: r.title, lot: lot(r.lotId), choiceVouchers: r.choiceVouchers, oneOfOne: r.oneOfOne })),
    lastPaidRank: lastPaidRank(rules.ranks),
    pool: rules.omikuji.flatMap((p, line) => (p.oneOfOne || p.lotId ? [{ line, oneOfOne: p.oneOfOne, lot: lot(p.lotId), count: p.count }] : [])),
    seedHash: draw?.seedHash ?? null,
    checkedAt: iso(draw?.checkedAt),
    drawnAt: iso(draw?.drawnAt),
  };
}

const cachedView = unstable_cache((locale: string, minute: number) => buildView(locale, minute * 60_000), ["ennichi-view"], { tags: [ENNICHI_TAG], revalidate: 60 });

/** Vue publique de la fête, la même pour tous (relue au plus une fois par minute). */
export function ennichiView(locale: string, now = new Date()): Promise<EnnichiView> {
  return cachedView(locale, Math.floor(now.getTime() / 60_000));
}

/* ---------------- Ta fête ---------------- */

export type MyFete = {
  /** Amis arrivés pendant la fête (lanternes posées), hors parrainages révoqués. */
  arrived: number;
  /** Installés (lanternes allumées), qui comptent au banzuke et donnent un ticket. */
  installed: number;
  /** Éligible aux lots des lanternes : inscrit, vérifié, un booster ouvert pendant la fête. */
  eligible: boolean;
  /** Ce que les lanternes lui ont déjà versé, et ses bons. */
  received: LotView | null;
  receivedVouchers: number;
};

export async function myFete(userId: string, view: EnnichiView): Promise<MyFete> {
  if (view.phase === "off" || !view.startsAt || !view.endsAt || !view.closesAt) return { arrived: 0, installed: 0, eligible: false, received: null, receivedVouchers: 0 };
  const until = new Date(Math.min(Date.now(), new Date(view.closesAt).getTime()));
  const [user, arrived, installed, opened, grants] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, bannedAt: true, emailVerified: true, discordLinkedAt: true } }),
    prisma.referral.count({ where: { referrerId: userId, ennichiEdition: view.edition, revokedAt: null, status: { not: "REVOKED" } } }),
    prisma.referral.count({
      where: {
        referrerId: userId,
        ennichiEdition: view.edition,
        revokedAt: null,
        status: { not: "REVOKED" },
        step2At: { not: null, lte: until },
        OR: [{ heldAt: null }, { reviewDecision: "VALIDATED" }],
      },
    }),
    prisma.boosterOpening.findFirst({ where: { userId, createdAt: { gte: new Date(view.startsAt), lt: new Date(view.endsAt) } }, select: { id: true } }),
    prisma.ennichiTierGrant.findMany({ where: { userId, edition: view.edition }, select: { tier: true, granted: true } }),
  ]);
  const paid = grants.filter((g) => !(g.granted && typeof g.granted === "object" && !Array.isArray(g.granted) && "skipped" in g.granted));
  const received = mergeLotViews(paid.map((g) => view.tiers[g.tier]?.lot ?? null));
  const receivedVouchers = paid.reduce((s, g) => s + (view.tiers[g.tier]?.choiceVouchers ?? 0), 0);
  const eligible = !!user && !user.isGuest && !user.bannedAt && (user.emailVerified !== null || user.discordLinkedAt !== null) && opened !== null;
  return { arrived, installed, eligible, received, receivedVouchers };
}

/* ---------------- Banzuke ---------------- */

export type BanzukeRow = { rank: number; userId: string | null; name: string; count: number; me: boolean };
export type BanzukeView = { final: boolean; rows: BanzukeRow[]; me: BanzukeRow | null };

export async function banzukeView(view: EnnichiView, userId: string | null): Promise<BanzukeView> {
  if (view.drawnAt) {
    const rows = await prisma.ennichiResult.findMany({ where: { edition: view.edition }, orderBy: { rank: "asc" }, select: { rank: true, userId: true, name: true, count: true } });
    const list = rows.map((r) => ({ ...r, me: userId !== null && r.userId === userId }));
    return { final: true, rows: list, me: list.find((r) => r.me) ?? null };
  }
  if (view.phase === "off" || !view.closesAt) return { final: false, rows: [], me: null };
  const until = new Date(Math.min(Date.now(), new Date(view.closesAt).getTime()));
  const ranked = rankRecruiters(await recruitersWith(prisma, view.edition, until));
  const list = ranked.map((r) => ({ rank: r.rank, userId: r.userId, name: r.name, count: r.count, me: userId !== null && r.userId === userId }));
  return { final: false, rows: list, me: list.find((r) => r.me) ?? null };
}

/** Ce que la place d'un rang rapporte (titre, lot, bons, carte 1/1), d'après les rangs réglés. */
export const prizeOfRank = (view: EnnichiView, rank: number) => rankBand(rank, view.ranks);

/* ---------------- Omikuji ---------------- */

export type OmikujiDrawView = { n: number; line: number; name: string; me: boolean };
export type OmikujiView = {
  /** Tickets du joueur (amis installés), et de tout le serveur. */
  myTickets: number;
  tickets: number;
  lots: number;
  /** Après le tirage : chaque lot tiré, et de quoi tout vérifier. */
  draws: OmikujiDrawView[] | null;
  proof: { seed: string; seedHash: string; tickets: string[]; ticketsHash: string; prizeCount: number; draws: { n: number; prize: number; ticket: number }[] } | null;
};

export async function omikujiView(view: EnnichiView, userId: string | null, mine: MyFete | null): Promise<OmikujiView> {
  const lots = view.pool.reduce((s, p) => s + p.count, 0);
  if (!view.drawnAt) {
    if (view.phase === "off" || !view.closesAt) return { myTickets: 0, tickets: 0, lots, draws: null, proof: null };
    const until = new Date(Math.min(Date.now(), new Date(view.closesAt).getTime()));
    const tickets = (await ticketsWith(prisma, view.edition, until)).length;
    return { myTickets: mine?.installed ?? 0, tickets, lots, draws: null, proof: null };
  }
  const [draw, awards] = await Promise.all([
    prisma.ennichiDraw.findUnique({ where: { edition: view.edition }, select: { seed: true, seedHash: true, tickets: true, ticketsHash: true, prizes: true, drawnAt: true } }),
    prisma.ennichiAward.findMany({ where: { edition: view.edition, kind: "OMIKUJI" }, orderBy: { ref: "asc" }, select: { ref: true, userId: true, name: true, prize: true } }),
  ]);
  if (!draw?.drawnAt) return { myTickets: 0, tickets: 0, lots, draws: null, proof: null };
  const labels = Array.isArray(draw.tickets) ? draw.tickets.filter((t): t is string => typeof t === "string") : [];
  const prizeCount = Array.isArray(draw.prizes) ? draw.prizes.length : 0;
  const read = (p: unknown) => (p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {});
  const draws = awards.map((a) => ({ n: a.ref, line: Number(read(a.prize).line ?? 0), name: a.name, me: userId !== null && a.userId === userId }));
  const myTickets = userId ? (await prisma.ennichiResult.findFirst({ where: { edition: view.edition, userId }, select: { count: true } }))?.count ?? 0 : 0;
  return {
    myTickets,
    tickets: labels.length,
    lots,
    draws,
    proof: {
      seed: draw.seed,
      seedHash: draw.seedHash,
      tickets: labels,
      ticketsHash: draw.ticketsHash ?? "",
      prizeCount,
      // Le tirage n° n porte le n-ième lot de la cagnotte dépliée ; le ticket gagnant est inscrit avec le prix
      draws: awards.map((a) => ({ n: a.ref, prize: a.ref - 1, ticket: Number(read(a.prize).ticket ?? 0) - 1 })),
    },
  };
}

/* ---------------- Titres sur le profil ---------------- */

export async function ennichiTitlesOf(userId: string): Promise<{ edition: number; title: EnnichiTitle; rank: number }[]> {
  const rows = await prisma.ennichiResult.findMany({ where: { userId, title: { not: null } }, orderBy: [{ edition: "desc" }, { rank: "asc" }], select: { edition: true, title: true, rank: true } });
  return rows.flatMap((r) => (r.title === "yokozuna" || r.title === "ozeki" || r.title === "sekiwake" ? [{ edition: r.edition, title: r.title, rank: r.rank }] : []));
}
