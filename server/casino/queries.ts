import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import type { CardView } from "@/lib/boosters/view";
import { RARITY_SEAL } from "@/lib/catalog/rarity";
import type { CoinSide } from "@/lib/casino/fairness";
import { isStaff } from "@/lib/admin/roles";
import { casinoAccess, casinoBadge, inLaunchWindow, type CasinoAccess, type CasinoBadge } from "@/lib/casino/phase";
import { CASINO_SETTING_KEYS, casinoRulesFrom, type CasinoRules } from "@/lib/casino/rules";
import { isBigFlip, raritiesForTier } from "@/lib/casino/tiers";
import { coreView, flipStats, outcomeFor, sideOf, type CoinFlipCoreView, type CoinFlipRow, type FlipStats, type MineState } from "@/lib/casino/view";
import { periodWindow } from "@/lib/economy/period";
import type { SettingValue } from "@/lib/settings/defaults";
import { cardViews } from "../boosters/display";
import { copyMarksOf, withCopy } from "../prestige/copy-marks";
import { getRarityDefinitions } from "../catalog/rarities";
import { prisma } from "../db";
import { maskablePlayerSelect, maskedPlayerRefs } from "../collection/public-names";
import { toPlayerRef, type PlayerRef } from "../profile/decor";
import { getSetting } from "../settings";
import type { CoinFlipContext } from "./coinflip-core";

// Lectures du casino. La graine d'une table ne sort d'ici qu'une fois la table jouée (coreView), et seuls
// des champs publics des joueurs (pseudo, avatar, décor) accompagnent une table.

/** Réglages du casino (lus une fois par requête). */
export const getCasinoRules = cache(async (): Promise<CasinoRules> => {
  const values = await Promise.all(CASINO_SETTING_KEYS.map((key) => getSetting(key)));
  const byKey = new Map<string, unknown>(CASINO_SETTING_KEYS.map((key, i) => [key, values[i]]));
  return casinoRulesFrom((key) => byKey.get(key) as SettingValue<typeof key>);
});

/** Casino visible et pastille du menu et de la tuile du Compte (« Bientôt » au teaser, « Nouveau » après l'ouverture). */
export const getCasinoNav = cache(async (): Promise<{ visible: boolean; badge: CasinoBadge }> => {
  const rules = await getCasinoRules();
  return { visible: rules.visible, badge: casinoBadge(rules, Date.now()) };
});

export type CasinoView = {
  rules: CasinoRules;
  access: CasinoAccess;
  /** Heure du serveur pour les comptes à rebours et les « il y a ». */
  serverNow: number;
  /** Fenêtre de lancement (badge, cérémonie, étiquette « Nouveau »). */
  launching: boolean;
};

/** Ce qu'une page du casino doit savoir de l'ouverture, pour le joueur connecté (l'équipe voit un aperçu). */
export async function casinoView(role: string | null | undefined): Promise<CasinoView> {
  const rules = await getCasinoRules();
  const serverNow = Date.now();
  return { rules, access: casinoAccess(rules, serverNow, isStaff(role)), serverNow, launching: inLaunchWindow(rules, serverNow) };
}

/** Contexte des opérations sur les tables : heure, réglages, jour de jeu, registre, hasard du serveur. */
export async function coinFlipContext(now = new Date()): Promise<CoinFlipContext> {
  const [rules, timeZone, definitions] = await Promise.all([getCasinoRules(), getSetting("game.timeZone"), getRarityDefinitions()]);
  return {
    now,
    rules,
    dayStart: periodWindow("DAILY", now, timeZone).start,
    definitions: definitions.map((d) => ({ key: d.key, sortOrder: d.sortOrder })),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
  };
}

const flipSelect = {
  id: true,
  status: true,
  creatorId: true,
  creatorCardId: true,
  creatorUserCardId: true,
  creatorRarity: true,
  creatorSide: true,
  tierOrder: true,
  reservedForId: true,
  opponentId: true,
  opponentCardId: true,
  opponentUserCardId: true,
  opponentRarity: true,
  seed: true,
  seedHash: true,
  result: true,
  winnerId: true,
  winnerNew: true,
  createdAt: true,
  expiresAt: true,
  resolvedAt: true,
  creatorSeenAt: true,
} as const satisfies Prisma.CoinFlipSelect;

type FlipRecord = Prisma.CoinFlipGetPayload<{ select: typeof flipSelect }>;

export type CoinFlipTableView = CoinFlipCoreView & {
  creator: PlayerRef;
  reservedFor: PlayerRef | null;
  opponent: PlayerRef | null;
  creatorCard: CardView;
  opponentCard: CardView | null;
  /** Rareté du pot (celle de la carte du créateur). */
  rarity: string;
  /** Table du lecteur. */
  mine: boolean;
  /** Réservée au lecteur. */
  forMe: boolean;
  /** Face du lecteur s'il est assis à la table. */
  viewerSide: CoinSide | null;
  outcome: "won" | "lost" | null;
  /** La carte gagnée était nouvelle pour le gagnant. */
  winnerNew: boolean;
  /** Le créateur n'a pas encore vu le lancer : la pièce se rejoue pour lui. */
  replayPending: boolean;
};

function toRow(r: FlipRecord): CoinFlipRow {
  return { ...r, status: r.status, creatorSide: r.creatorSide, result: r.result };
}

/** Lignes → vues : joueurs et cartes résolus en deux requêtes. Une table dont la carte a disparu du catalogue est omise. */
async function toViews(rows: readonly FlipRecord[], viewerId: string | null, locale: string): Promise<CoinFlipTableView[]> {
  if (rows.length === 0) return [];
  const playerIds = [...new Set(rows.flatMap((r) => [r.creatorId, r.reservedForId, r.opponentId].filter((x): x is string => x !== null)))];
  const cardIds = rows.flatMap((r) => [r.creatorCardId, ...(r.opponentCardId ? [r.opponentCardId] : [])]);
  const [players, cards, marks] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: playerIds } }, select: maskablePlayerSelect }),
    cardViews(cardIds, locale),
    // Une héritière ou une gravée misée : la table, le salon et le résultat montrent l'exemplaire
    copyMarksOf(rows.flatMap((r) => [r.creatorUserCardId, r.opponentUserCardId])),
  ]);
  // Mêmes règles que le reste du site : un profil privé, réservé aux amis, banni ou supprimé reste « Joueur », sans
  // avatar ni décor, sauf pour les joueurs de sa propre table (ils jouent l'un contre l'autre, la réservation se fait au pseudo)
  const real = new Map(players.map((p) => [p.id, toPlayerRef(p)]));
  const masked = await maskedPlayerRefs(viewerId, players);
  return rows.flatMap((r) => {
    const seated = viewerId !== null && [r.creatorId, r.opponentId, r.reservedForId].includes(viewerId);
    const byId = seated ? real : masked;
    const creator = byId.get(r.creatorId);
    const creatorCard = cards.get(r.creatorCardId);
    if (!creator || !creatorCard) return [];
    const row = toRow(r);
    return [
      {
        ...coreView(row),
        creator,
        reservedFor: r.reservedForId ? (byId.get(r.reservedForId) ?? null) : null,
        opponent: r.opponentId ? (byId.get(r.opponentId) ?? null) : null,
        creatorCard: withCopy(creatorCard, r.creatorUserCardId, marks),
        opponentCard: r.opponentCardId && cards.get(r.opponentCardId) ? withCopy(cards.get(r.opponentCardId)!, r.opponentUserCardId, marks) : null,
        rarity: r.creatorRarity,
        mine: viewerId === r.creatorId,
        forMe: viewerId !== null && viewerId === r.reservedForId,
        viewerSide: viewerId ? sideOf(row, viewerId) : null,
        outcome: viewerId ? outcomeFor(row, viewerId) : null,
        winnerNew: r.status === "DONE" && r.winnerNew,
        replayPending: r.status === "DONE" && viewerId === r.creatorId && r.creatorSeenAt === null,
      },
    ];
  });
}

/** Joueurs bloqués par le lecteur ou qui l'ont bloqué : leurs tables n'apparaissent pas au salon. */
async function blockedIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)))];
}

export const LOBBY_PAGE = 30;

export type LobbyPage = { items: CoinFlipTableView[]; nextCursor: string | null };

/**
 * Salon : tables ouvertes des autres joueurs, les plus récentes d'abord, publiques ou réservées au lecteur.
 * `tier` filtre par palier (sortOrder). Les tables échues n'y figurent plus, même avant le balayage.
 */
export async function listLobby(input: { viewerId: string; tier: number | null; cursor: string | null; locale: string; now?: Date }): Promise<LobbyPage> {
  const now = input.now ?? new Date();
  const blocked = await blockedIds(input.viewerId);
  const rows = await prisma.coinFlip.findMany({
    where: {
      status: "OPEN",
      expiresAt: { gt: now },
      creatorId: { notIn: [input.viewerId, ...blocked] },
      OR: [{ reservedForId: null }, { reservedForId: input.viewerId }],
      ...(input.tier !== null ? { tierOrder: input.tier } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LOBBY_PAGE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: flipSelect,
  });
  const page = rows.slice(0, LOBBY_PAGE);
  return { items: await toViews(page, input.viewerId, input.locale), nextCursor: rows.length > LOBBY_PAGE ? page[page.length - 1].id : null };
}

/** Tables ouvertes et pas encore échues : les miennes et celles qui me sont réservées. */
const myOpenWhere = (viewerId: string, now: Date) =>
  ({ status: "OPEN", expiresAt: { gt: now }, OR: [{ creatorId: viewerId }, { reservedForId: viewerId }] }) as const satisfies Prisma.CoinFlipWhereInput;

/** Lancers joués en l'absence du créateur, pas encore rejoués pour lui. */
const replayWhere = (viewerId: string) => ({ creatorId: viewerId, status: "DONE", creatorSeenAt: null }) as const satisfies Prisma.CoinFlipWhereInput;

/**
 * « Mes tables » : mes tables ouvertes et celles qui me sont réservées. Une table échue pas encore balayée
 * n'y figure plus (la page balaie avant de lire).
 */
export async function listMyTables(viewerId: string, locale: string, now = new Date()) {
  const rows = await prisma.coinFlip.findMany({
    where: myOpenWhere(viewerId, now),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: flipSelect,
  });
  const views = await toViews(rows, viewerId, locale);
  return { mine: views.filter((v) => v.mine), invitations: views.filter((v) => v.forMe) };
}

const HISTORY_PAGE = 30;
const STATS_WINDOW = 500;

/** Historique des lancers joués du lecteur, et ses statistiques sur les plus récents. */
export async function listHistory(viewerId: string, locale: string): Promise<{ items: CoinFlipTableView[]; stats: FlipStats }> {
  const where = { status: "DONE" as const, OR: [{ creatorId: viewerId }, { opponentId: viewerId }] };
  const [rows, recent] = await Promise.all([
    prisma.coinFlip.findMany({ where, orderBy: [{ resolvedAt: "desc" }, { id: "desc" }], take: HISTORY_PAGE, select: flipSelect }),
    prisma.coinFlip.findMany({
      where,
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: STATS_WINDOW,
      select: { status: true, creatorId: true, opponentId: true, winnerId: true, result: true },
    }),
  ]);
  return { items: await toViews(rows, viewerId, locale), stats: flipStats(recent, viewerId) };
}

/** Une table, telle que sa page la montre (partageable : un spectateur voit l'issue d'une table jouée). */
export async function getTable(flipId: string, viewerId: string | null, locale: string): Promise<CoinFlipTableView | null> {
  const row = await prisma.coinFlip.findUnique({ where: { id: flipId }, select: flipSelect });
  if (!row) return null;
  return (await toViews([row], viewerId, locale))[0] ?? null;
}

/** Lancers joués en l'absence du créateur, pas encore rejoués pour lui (les plus anciens d'abord). */
export async function pendingReplays(viewerId: string, locale: string): Promise<CoinFlipTableView[]> {
  const rows = await prisma.coinFlip.findMany({
    where: replayWhere(viewerId),
    orderBy: [{ resolvedAt: "asc" }, { id: "asc" }],
    take: 10,
    select: flipSelect,
  });
  return toViews(rows, viewerId, locale);
}

/**
 * État léger des tables du joueur (ids seulement) : compteurs des onglets et empreinte que le salon compare
 * à chaque sondage pour savoir s'il doit se recharger.
 */
export async function myTablesState(viewerId: string, now = new Date()): Promise<MineState> {
  const [open, replays] = await Promise.all([
    prisma.coinFlip.findMany({ where: myOpenWhere(viewerId, now), select: { id: true, status: true, creatorId: true }, take: 100 }),
    prisma.coinFlip.findMany({ where: replayWhere(viewerId), select: { id: true }, take: 10 }),
  ]);
  return {
    mine: open.filter((r) => r.creatorId === viewerId).map((r) => ({ id: r.id, status: r.status })),
    invitations: open.filter((r) => r.creatorId !== viewerId).map((r) => ({ id: r.id })),
    replays,
  };
}

export type FeedEntry = {
  id: string;
  resolvedAt: string;
  rarity: string;
  seal: string;
  result: CoinSide;
  winner: PlayerRef;
  loser: PlayerRef;
  /** Carte remportée par le gagnant (celle du perdant). */
  prize: CardView;
  big: boolean;
};

/** Fil « Derniers lancers » du hall : les plus récents dans la fenêtre réglée. */
export async function recentFlips(input: { locale: string; size: number; maxAgeHours: number; bigFrom: string; now?: Date }): Promise<FeedEntry[]> {
  const now = input.now ?? new Date();
  const rows = await prisma.coinFlip.findMany({
    where: { status: "DONE", resolvedAt: { gte: new Date(now.getTime() - input.maxAgeHours * 3_600_000) } },
    orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
    take: input.size,
    select: flipSelect,
  });
  const [views, definitions] = await Promise.all([toViews(rows, null, input.locale), getRarityDefinitions()]);
  return views.flatMap((v) => {
    if (!v.result || !v.winnerId || !v.opponent || !v.opponentCard || !v.resolvedAt) return [];
    const creatorWon = v.winnerId === v.creatorId;
    return [
      {
        id: v.id,
        resolvedAt: v.resolvedAt,
        rarity: v.rarity,
        seal: RARITY_SEAL[v.rarity] ?? definitions.find((d) => d.key === v.rarity)?.seal ?? "",
        result: v.result,
        winner: creatorWon ? v.creator : v.opponent,
        loser: creatorWon ? v.opponent : v.creator,
        prize: creatorWon ? v.opponentCard : v.creatorCard,
        big: isBigFlip(v.rarity, input.bigFrom, definitions),
      },
    ];
  });
}

/** Chiffres du héros du hall : tables ouvertes et lancers joués depuis le début du jour de jeu. */
export async function casinoPulse(now = new Date()): Promise<{ openTables: number; flipsToday: number }> {
  const timeZone = await getSetting("game.timeZone");
  const dayStart = periodWindow("DAILY", now, timeZone).start;
  const [openTables, flipsToday] = await Promise.all([
    prisma.coinFlip.count({ where: { status: "OPEN", expiresAt: { gt: now } } }),
    prisma.coinFlip.count({ where: { status: "DONE", resolvedAt: { gte: dayStart } } }),
  ]);
  return { openTables, flipsToday };
}

/** Raretés misables pour relever une table de ce palier. */
export async function joinableRarities(tierOrder: number): Promise<string[]> {
  const [rules, definitions] = await Promise.all([getCasinoRules(), getRarityDefinitions()]);
  return raritiesForTier(tierOrder, definitions, rules.coinflip.allowedRarities);
}
