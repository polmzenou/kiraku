import "server-only";
import { mergeLots } from "@/lib/economy/lot-merge";
import { awardState, type AwardState } from "@/lib/ennichi/awards";
import { foldPool, type UnfoldedPrize } from "@/lib/ennichi/omikuji";
import { lastPaidRank, nextTierIndex, rankRecruiters, tierKanji, type EnnichiPhase, type EnnichiRank, type EnnichiTitle } from "@/lib/ennichi/rules";
import { minuteMemo } from "@/lib/ennichi/view-memo";
import { SETTING_SCHEMAS } from "@/lib/settings/defaults";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { lotViews, type LotLine, type LotView } from "../economy/lot-view";
import { recruitersWith, ticketCountWith } from "./close-core";
import { ennichiState } from "./deps";
import { lanternCountsWith } from "./lanterns-core";
import { ennichiViewVersion } from "./tag";

// Lectures des écrans de l'Ennichi (étape 18d). La vue publique (rue, paliers, rangs, cagnotte) est la même pour tous :
// gardée une minute en mémoire du processus (relue après un réglage ou le tirage) ; la part du joueur est lue à chaque
// fois. La graine du tirage n'est lue qu'après le tirage (vérification) : avant, seule son empreinte sort d'ici. Après le tirage, rangs et cagnotte sont
// ceux figés par le tirage (EnnichiDraw.ranks et prizes), pas les réglages du moment.

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
  /** Réglage ennichi.excludeStaff : comptes de l'équipe écartés du banzuke et de l'omikuji. */
  excludeStaff: boolean;
};

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const lineKey = (l: LotLine) => (l.kind === "BOOSTER" ? `B:${l.look.slug}` : l.kind === "CARD" ? `C:${l.card?.cardId ?? l.name}` : `R:${l.rarity}`);
export const mergeLotViews = (lots: readonly (LotView | null)[]) => mergeLots<LotLine, LotView>(lots, lineKey);

/** Cagnotte figée au tirage (EnnichiDraw.prizes), relue prudemment : une entrée mal formée est ignorée. */
function frozenPrizes(raw: Prisma.JsonValue | null | undefined): UnfoldedPrize[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return [];
    const { lotId, oneOfOne, line } = p as Record<string, unknown>;
    if (!Number.isSafeInteger(line)) return [];
    return [{ lotId: typeof lotId === "string" ? lotId : null, oneOfOne: oneOfOne === true, line: line as number }];
  });
}

/** Rangs figés au tirage (EnnichiDraw.ranks) ; null pour un tirage d'avant (les réglages font alors foi). */
function frozenRanks(raw: Prisma.JsonValue | null | undefined): readonly EnnichiRank[] | null {
  const parsed = SETTING_SCHEMAS["ennichi.ranks"].safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function buildView(locale: string, nowMs: number): Promise<EnnichiView> {
  const now = new Date(nowMs);
  const state = await ennichiState(now);
  const { rules, schedule, phase, draw } = state;
  const [reached, frozen] = await Promise.all([
    phase === "off" ? [] : prisma.ennichiTierReached.findMany({ where: { edition: rules.edition }, orderBy: { tier: "asc" } }),
    draw?.drawnAt ? prisma.ennichiDraw.findUnique({ where: { edition: rules.edition }, select: { prizes: true, ranks: true } }) : null,
  ]);
  const reachedBy = new Map(reached.map((r) => [r.tier, r]));
  // Palier atteint : son lot figé ; sinon le lot réglé
  const tierLot = (i: number) => (reachedBy.has(i) ? reachedBy.get(i)!.lotId : rules.tiers[i]?.lotId) ?? null;
  // Après le tirage : les rangs et la cagnotte tels que tirés et versés
  const ranks = (frozen && frozenRanks(frozen.ranks)) ?? rules.ranks;
  const poolLines = frozen ? foldPool(frozenPrizes(frozen.prizes)) : rules.omikuji.flatMap((p, line) => (p.oneOfOne || p.lotId ? [{ line, lotId: p.lotId, oneOfOne: p.oneOfOne, count: p.count }] : []));
  // Fête coupée : rien n'est affiché, les lots ne sont pas relus
  const ids =
    phase === "off"
      ? []
      : [...rules.tiers.map((_, i) => tierLot(i)), ...ranks.map((r) => r.lotId), ...poolLines.map((p) => p.lotId)].filter((id): id is string => id !== null);
  const [lots, counts] = await Promise.all([
    ids.length ? lotViews(ids, locale) : new Map<string, LotView>(),
    phase === "off" || !schedule ? { placed: 0, lit: 0 } : lanternCountsWith(prisma, rules.edition, now < schedule.closesAt ? now : schedule.closesAt),
  ]);
  const lot = (id: string | null) => (id ? (lots.get(id) ?? null) : null);
  const tiers: TierView[] = rules.tiers.map((t, i) => {
    const r = reachedBy.get(i);
    return {
      index: i,
      kanji: tierKanji(i),
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
    ranks: ranks.map((r) => ({ from: r.from, to: r.to, title: r.title, lot: lot(r.lotId), choiceVouchers: r.choiceVouchers, oneOfOne: r.oneOfOne })),
    lastPaidRank: lastPaidRank(ranks),
    pool: poolLines.map((p) => ({ line: p.line, oneOfOne: p.oneOfOne, lot: lot(p.lotId), count: p.count })),
    seedHash: draw?.seedHash ?? null,
    checkedAt: iso(draw?.checkedAt),
    drawnAt: iso(draw?.drawnAt),
    excludeStaff: rules.excludeStaff,
  };
}

// En mémoire du processus, une entrée par langue (fr, en) remplacée à chaque minute, plutôt que dans le cache de Next :
// une clé par minute y laissait 2 880 entrées et fichiers par jour (lib/ennichi/view-memo.ts)
const memoView = minuteMemo(buildView);

/** Vue publique de la fête, la même pour tous (relue au plus une fois par minute, et après un réglage ou le tirage). */
export function ennichiView(locale: string, now = new Date()): Promise<EnnichiView> {
  return memoView(locale, now.getTime(), ennichiViewVersion());
}

/** La même vue relue à l'instant, sans cache : suivi de l'équipe dans l'admin. */
export function freshEnnichiView(locale: string, now = new Date()): Promise<EnnichiView> {
  return buildView(locale, now.getTime());
}

/* ---------------- Ta fête ---------------- */

export type MyFete = {
  /** Amis arrivés pendant la fête (lanternes posées), hors parrainages révoqués et filleuls bannis. */
  arrived: number;
  /** Installés (lanternes allumées), hors parrainages bloqués sans décision et filleuls bannis. */
  installed: number;
  /** Tickets de l'omikuji (et place au banzuke) : les installés, comptés comme au tirage (même prédicat). */
  tickets: number;
  /** Éligible aux lots des lanternes : inscrit, vérifié, un booster ouvert pendant la fête. */
  eligible: boolean;
  /** Ce que les lanternes lui ont déjà versé, et ses bons. */
  received: LotView | null;
  receivedVouchers: number;
};

export async function myFete(userId: string, view: EnnichiView): Promise<MyFete> {
  if (view.phase === "off" || !view.startsAt || !view.endsAt || !view.closesAt) return { arrived: 0, installed: 0, tickets: 0, eligible: false, received: null, receivedVouchers: 0 };
  const until = new Date(Math.min(Date.now(), new Date(view.closesAt).getTime()));
  // Comme les lanternes, le banzuke et les tickets : un filleul banni ne compte pas
  const counted = { referrerId: userId, ennichiEdition: view.edition, revokedAt: null, status: { not: "REVOKED" as const }, referee: { bannedAt: null } };
  const [user, arrived, installed, tickets, opened, grants] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, bannedAt: true, emailVerified: true, discordLinkedAt: true } }),
    prisma.referral.count({ where: counted }),
    prisma.referral.count({ where: { ...counted, step2At: { not: null, lte: until }, OR: [{ heldAt: null }, { reviewDecision: "VALIDATED" }] } }),
    // Tickets : le prédicat du tirage (parrain banni, gelé ou de l'équipe écartée compris)
    ticketCountWith(prisma, view.edition, until, { excludeStaff: view.excludeStaff }, userId),
    prisma.boosterOpening.findFirst({ where: { userId, createdAt: { gte: new Date(view.startsAt), lt: new Date(view.endsAt) } }, select: { id: true } }),
    prisma.ennichiTierGrant.findMany({ where: { userId, edition: view.edition }, select: { tier: true, granted: true } }),
  ]);
  const paid = grants.filter((g) => !(g.granted && typeof g.granted === "object" && !Array.isArray(g.granted) && "skipped" in g.granted));
  const received = mergeLotViews(paid.map((g) => view.tiers[g.tier]?.lot ?? null));
  const receivedVouchers = paid.reduce((s, g) => s + (view.tiers[g.tier]?.choiceVouchers ?? 0), 0);
  const eligible = !!user && !user.isGuest && !user.bannedAt && (user.emailVerified !== null || user.discordLinkedAt !== null) && opened !== null;
  return { arrived, installed, tickets, eligible, received, receivedVouchers };
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
  const ranked = rankRecruiters(await recruitersWith(prisma, view.edition, until, { excludeStaff: view.excludeStaff }));
  const list = ranked.map((r) => ({ rank: r.rank, userId: r.userId, name: r.name, count: r.count, me: userId !== null && r.userId === userId }));
  return { final: false, rows: list, me: list.find((r) => r.me) ?? null };
}

/* ---------------- Prix du tirage ---------------- */

/** Prix d'un joueur inscrits au tirage (banzuke et omikuji), avec leur état (versé, à verser, écarté). */
export async function myAwards(edition: number, userId: string): Promise<{ kind: "BANZUKE" | "OMIKUJI"; ref: number; state: AwardState }[]> {
  const rows = await prisma.ennichiAward.findMany({ where: { edition, userId }, orderBy: [{ kind: "asc" }, { ref: "asc" }], select: { kind: true, ref: true, granted: true } });
  return rows.map((r) => ({ kind: r.kind, ref: r.ref, state: awardState(r.granted) }));
}

/* ---------------- Omikuji ---------------- */

export type OmikujiDrawView = { n: number; line: number; name: string; me: boolean; /** Versé, à verser ou écarté. */ state: AwardState };
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
  // Avant le tirage, la cagnotte réglée ; après, celle figée par le tirage (la vue la relit de EnnichiDraw.prizes)
  const lots = view.pool.reduce((s, p) => s + p.count, 0);
  if (!view.drawnAt) {
    if (view.phase === "off" || !view.closesAt) return { myTickets: 0, tickets: 0, lots, draws: null, proof: null };
    const until = new Date(Math.min(Date.now(), new Date(view.closesAt).getTime()));
    const tickets = await ticketCountWith(prisma, view.edition, until, { excludeStaff: view.excludeStaff });
    return { myTickets: mine?.tickets ?? 0, tickets, lots, draws: null, proof: null };
  }
  const [draw, awards] = await Promise.all([
    prisma.ennichiDraw.findUnique({ where: { edition: view.edition }, select: { seed: true, seedHash: true, tickets: true, ticketsHash: true, prizes: true, drawnAt: true } }),
    prisma.ennichiAward.findMany({ where: { edition: view.edition, kind: "OMIKUJI" }, orderBy: { ref: "asc" }, select: { ref: true, userId: true, name: true, prize: true, granted: true } }),
  ]);
  if (!draw?.drawnAt || !draw.seed) return { myTickets: 0, tickets: 0, lots, draws: null, proof: null };
  const labels = Array.isArray(draw.tickets) ? draw.tickets.filter((t): t is string => typeof t === "string") : [];
  // La preuve garde le nombre exact de lots figés (relu dans la ligne du tirage, pas dans la vue en cache)
  const prizeCount = Array.isArray(draw.prizes) ? draw.prizes.length : 0;
  const read = (p: unknown) => (p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {});
  const draws = awards.map((a) => ({ n: a.ref, line: Number(read(a.prize).line ?? 0), name: a.name, me: userId !== null && a.userId === userId, state: awardState(a.granted) }));
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
