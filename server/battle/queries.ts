import "server-only";
import { cache } from "react";
import { randomInt } from "node:crypto";
import { battleRulesFrom, BATTLE_SETTING_KEYS, type BattleRules } from "@/lib/battle/config";
import { replay } from "@/lib/battle/engine";
import { isKeyword, isTechnique, type AbilityKind, type Kit } from "@/lib/battle/loadout";
import { combatStats, keywordsFor, techniqueFor, ultimateFor } from "@/lib/battle/stats";
import { universeOf } from "@/lib/battle/synergy";
import { KEYWORDS, TEAM_SIZE, TECHNIQUES, type Action, type BattleSetup, type BattleState, type Keyword, type Side, type Technique } from "@/lib/battle/types";
import type { Activity, BattleUpdateView, BattleView, CandidateCard, DeckView, HistoryItem, PlayerView, WorkshopCard } from "@/lib/battle/view";
import { parseBoardTier, type BoardTier } from "@/lib/battle/tiers";
import type { Rarity } from "@/lib/catalog/rarity";
import { periodWindow } from "@/lib/economy/period";
import type { SettingValue } from "@/lib/settings/defaults";
import { Prisma } from "@/generated/prisma/client";
import { decorFromRelations } from "@/lib/profile/decor";
import { prisma } from "../db";
import { decorSelect } from "../profile/decor";
import { ablyEnabled } from "../env";
import { getRankedRules } from "../ranked/queries";
import { getSetting } from "../settings";
import { getRelation } from "../social/queries";
import { sweepStaleWith, type Ctx } from "./battle-core";
import { loadKitDetails, loadKits } from "./kits";
import { publishBattle } from "./realtime";

// Lectures du combat. Les parties dont le tour a expiré sont réglées au passage (paresseux), comme
// les ventes du marché ; le cron quotidien balaie le reste.

export const getBattleRules = cache(async (): Promise<BattleRules> => {
  const values = await Promise.all(BATTLE_SETTING_KEYS.map((k) => getSetting(k)));
  const byKey = new Map<string, unknown>(BATTLE_SETTING_KEYS.map((k, i) => [k, values[i]]));
  return battleRulesFrom((key) => byKey.get(key) as SettingValue<typeof key>);
});

/** Contexte du cœur : réglages, horloge, hasard cryptographique et début du jour de jeu. */
export async function battleCtx(now = new Date()): Promise<Ctx> {
  const [rules, timeZone, ranked] = await Promise.all([getBattleRules(), getSetting("game.timeZone"), getRankedRules()]);
  return { now, rules, random: (max) => randomInt(0, max), dayStart: periodWindow("DAILY", now, timeZone).start, ranked, timeZone };
}

/** Règle les tours expirés, salles périmées et places de file d'un joueur. Ne fait jamais échouer l'affichage. */
export async function sweepBattlesFor(userId: string) {
  try {
    const res = await sweepStaleWith(prisma, await battleCtx(), { userId, limit: 10 });
    await Promise.all(res.expired.map(publishBattle));
  } catch (e) {
    console.error("[combat] balayage", e);
  }
}

const playerSelect = { username: true, image: true, isGuest: true, ...decorSelect } as const;

function playerView(p: Prisma.UserGetPayload<{ select: typeof playerSelect }> | null, botName: string | null): PlayerView | null {
  if (p) return { username: p.username, image: p.image, isGuest: p.isGuest, decor: decorFromRelations(p) };
  return botName ? { bot: botName } : null;
}

/** Une partie vue par un de ses joueurs (ou par l'invité d'une salle réservée) ; null sinon. */
export async function getBattleView(
  battleId: string,
  viewerId: string,
  timing: { pollSeconds: number; safetyPollSeconds: number; lobbyPollSeconds: number; turnSeconds: number },
  /** Aperçu d'un rang sur le plateau (admins seulement). */
  previewTier: BoardTier | null = null,
  ladder: BattleView["ladder"] = null,
): Promise<BattleView | null> {
  const b = await prisma.battle.findUnique({
    where: { id: battleId },
    select: {
      id: true,
      mode: true,
      status: true,
      code: true,
      codeExpiresAt: true,
      seed: true,
      p1Id: true,
      p2Id: true,
      botName: true,
      setup: true,
      state: true,
      version: true,
      turnEndsAt: true,
      winnerSide: true,
      endReason: true,
      rewardZeni: true,
      p1Tier: true,
      p2Tier: true,
      pcBeforeP1: true,
      pcBeforeP2: true,
      pcDeltaP1: true,
      pcDeltaP2: true,
      crushing: true,
      p1: { select: playerSelect },
      p2: { select: playerSelect },
    },
  });
  if (!b) return null;
  const mySide: Side | null = b.p1Id === viewerId ? 0 : b.p2Id === viewerId ? 1 : null;
  if (mySide === null) return null;
  const finished = b.status === "FINISHED";
  const actions = finished
    ? (await prisma.battleAction.findMany({ where: { battleId }, orderBy: { seq: "asc" }, select: { payload: true } })).map((a) => a.payload)
    : null;
  const waitingForMe = b.status === "WAITING" && mySide === 1;
  return {
    id: b.id,
    mode: b.mode,
    status: b.status,
    mySide,
    players: [playerView(b.p1, null)!, waitingForMe ? null : playerView(b.p2, b.botName)],
    code: b.status === "WAITING" && mySide === 0 ? b.code : null,
    codeExpiresAt: b.status === "WAITING" ? (b.codeExpiresAt?.toISOString() ?? null) : null,
    canJoin: waitingForMe,
    // La graine ne sert qu'au replay : elle reste secrète tant que la partie se joue
    seed: finished ? b.seed : 0,
    setup: b.setup as BattleView["setup"],
    state: b.state as BattleView["state"],
    version: b.version,
    turnEndsAt: b.turnEndsAt?.toISOString() ?? null,
    winnerSide: b.winnerSide === 0 || b.winnerSide === 1 ? b.winnerSide : null,
    endReason: b.endReason,
    rewardZeni: b.rewardZeni,
    actions,
    realtime: ablyEnabled,
    pollSeconds: timing.pollSeconds,
    safetyPollSeconds: timing.safetyPollSeconds,
    lobbyPollSeconds: timing.lobbyPollSeconds,
    turnSeconds: timing.turnSeconds,
    // Le rang d'une partie classée sera figé au lancement (étape 9b)
    tier: previewTier ?? parseBoardTier(mySide === 0 ? b.p1Tier : b.p2Tier),
    ranked:
      b.mode === "RANKED" && finished
        ? { crushing: b.crushing, before: [b.pcBeforeP1, b.pcBeforeP2], delta: [b.pcDeltaP1, b.pcDeltaP2] }
        : null,
    ladder: b.mode === "RANKED" && ladder ? { tiers: ladder.tiers, grandChampion: ladder.grandChampion } : null,
  };
}

/**
 * Événements depuis la version `from` (message temps réel manqué, ou sondage sans Ably) : la partie est
 * rejouée depuis son journal, la graine ne quitte pas le serveur. null si le joueur est déjà à jour.
 */
export async function getUpdateSince(battleId: string, viewerId: string, from: number): Promise<BattleUpdateView | null> {
  const b = await prisma.battle.findUnique({
    where: { id: battleId },
    select: { p1Id: true, p2Id: true, setup: true, seed: true, version: true, state: true, status: true, turnEndsAt: true, rewardZeni: true },
  });
  if (!b || (b.p1Id !== viewerId && b.p2Id !== viewerId) || !b.setup || !b.state) return null;
  if (from >= b.version) return null;
  const actions = await prisma.battleAction.findMany({ where: { battleId }, orderBy: { seq: "asc" }, select: { payload: true } });
  const { steps } = replay(b.setup as unknown as BattleSetup, b.seed, actions.map((a) => a.payload as unknown as Action));
  return {
    battleId,
    from,
    version: b.version,
    // steps[0] : ouverture de la partie ; steps[i + 1] : action n° i
    events: steps.slice(from + 1).flatMap((s) => s.events),
    state: b.state as unknown as BattleState,
    turnEndsAt: b.turnEndsAt?.toISOString() ?? null,
    finished: b.status === "FINISHED",
    rewardZeni: b.rewardZeni,
    // Le détail classé arrive avec la mise à jour en direct ; un rattrapage relit la page
    ranked: null,
  };
}

/** File, salle ouverte ou partie en cours du joueur. */
export async function getActivity(userId: string, queueSeconds: number): Promise<Activity> {
  const [queue, battle] = await Promise.all([
    prisma.battleQueue.findUnique({ where: { userId }, select: { mode: true, joinedAt: true } }),
    prisma.battle.findFirst({
      where: {
        OR: [
          { p1Id: userId, status: { in: ["WAITING", "ACTIVE"] } },
          { p2Id: userId, status: "ACTIVE" },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    }),
  ]);
  if (queue) {
    return {
      kind: "QUEUE",
      mode: queue.mode,
      joinedAt: queue.joinedAt.toISOString(),
      botAt: new Date(queue.joinedAt.getTime() + queueSeconds * 1_000).toISOString(),
    };
  }
  if (battle) return { kind: battle.status === "WAITING" ? "ROOM" : "BATTLE", battleId: battle.id };
  return { kind: "NONE" };
}

type CandidateRow = {
  cardId: string;
  anilistId: number;
  name: string;
  nameNative: string | null;
  imageUrl: string;
  rank: number | null;
  rarity: Rarity;
  power: number;
  ki: number;
  appearance: unknown;
  spoiler: boolean;
  universe: CandidateCard["universe"];
};

const MAX_CANDIDATES = 500;

/**
 * Une carte telle qu'elle combattra : le kit choisi à l'atelier, ou le tirage de la carte. `anilistId` est
 * l'alias de `publicId` : passifs, technique et ulti en dépendent (l'ulti, jamais du kit).
 */
function candidateFrom(row: CandidateRow, rules: BattleRules, kit?: Kit): CandidateCard {
  return {
    ...row,
    hp: combatStats(row.power, row.ki, rules.stats).hp,
    keywords: kit ? [...kit.keywords] : keywordsFor(row.anilistId, row.rarity, rules.keywordsByRarity, rules.newAbilityPct),
    technique: kit ? kit.technique : techniqueFor(row.anilistId, rules.newAbilityPct),
    ultimate: ultimateFor(row.anilistId, row.rarity, rules),
  };
}

type CandidateSqlRow = Omit<CandidateRow, "universe"> & { universeKey: string; universeName: string };

const candidateRow = ({ universeKey, universeName, ...r }: CandidateSqlRow): CandidateRow => ({ ...r, universe: { key: universeKey, name: universeName } });

/** Cartes du joueur disponibles pour combattre (au moins un exemplaire en collection), les plus fortes d'abord. */
export async function getCandidates(userId: string, rules: BattleRules): Promise<CandidateCard[]> {
  const rows = (
    await prisma.$queryRaw<CandidateSqlRow[]>`
    SELECT c.id AS "cardId", c."publicId" AS "anilistId", c.appearance, c.name, c."nameNative", c."imageUrl", c.rank, c."rarityKey" AS rarity, c.power, c.ki, c.spoiler,
      COALESCE(s."universeId", s.id) AS "universeKey", COALESCE(u.name, s."titleRomaji") AS "universeName"
    FROM "Card" c
    JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
    JOIN "Series" s ON s.id = c."seriesId"
    LEFT JOIN "Universe" u ON u.id = s."universeId"
    WHERE EXISTS (SELECT 1 FROM "UserCard" uc WHERE uc."cardId" = c.id AND uc."ownerId" = ${userId} AND uc.status = 'COLLECTION')
    ORDER BY rd."sortOrder" DESC, (c.power + c.ki) DESC, c.id ASC
    LIMIT ${MAX_CANDIDATES}`
  ).map(candidateRow);
  const kits = await loadKits(prisma, userId, rows, rules);
  return rows.map((r) => candidateFrom(r, rules, kits.get(r.cardId)));
}

/**
 * Cartes de l'atelier : tous les personnages dont le joueur possède au moins un exemplaire, quel que soit
 * son état (en vente ou engagé en combat, il reste à lui), les plus forts d'abord. `focus` (lien
 * « Modifier » de la collection) est ajouté s'il dépasse la limite.
 */
export async function getWorkshopCards(userId: string, rules: BattleRules, focus: string | null = null): Promise<WorkshopCard[]> {
  const select = Prisma.sql`
    SELECT c.id AS "cardId", c."publicId" AS "anilistId", c.appearance, c.name, c."nameNative", c."imageUrl", c.rank, c."rarityKey" AS rarity, c.power, c.ki, c.spoiler,
      COALESCE(s."universeId", s.id) AS "universeKey", COALESCE(u.name, s."titleRomaji") AS "universeName"
    FROM "Card" c
    JOIN "RarityDefinition" rd ON rd.key = c."rarityKey"
    JOIN "Series" s ON s.id = c."seriesId"
    LEFT JOIN "Universe" u ON u.id = s."universeId"
    WHERE EXISTS (SELECT 1 FROM "UserCard" uc WHERE uc."cardId" = c.id AND uc."ownerId" = ${userId})`;
  const [top, extra] = await Promise.all([
    prisma.$queryRaw<CandidateSqlRow[]>`${select} ORDER BY rd."sortOrder" DESC, (c.power + c.ki) DESC, c.id ASC LIMIT ${MAX_CANDIDATES}`,
    focus ? prisma.$queryRaw<CandidateSqlRow[]>`${select} AND c.id = ${focus}` : [],
  ]);
  const rows = [...top, ...extra.filter((e) => !top.some((t) => t.cardId === e.cardId))].map(candidateRow);
  const details = await loadKitDetails(prisma, userId, rows, rules);
  return rows.flatMap((r) => {
    const d = details.get(r.cardId);
    if (!d) return [];
    return [
      {
        ...candidateFrom(r, rules, d.kit),
        slots: d.slots,
        base: { keywords: [...d.base.keywords], technique: d.base.technique },
        owned: { keywords: KEYWORDS.filter((k) => d.owned.keywords.has(k)), techniques: TECHNIQUES.filter((t) => d.owned.techniques.has(t)) },
      },
    ];
  });
}

/** Kit d'une carte pour la fiche de collection ; null si le joueur n'en possède aucun exemplaire. */
export async function getCardKit(userId: string, cardId: string, rules: BattleRules) {
  const card = await prisma.card.findFirst({
    where: { id: cardId, copies: { some: { ownerId: userId } } },
    select: { id: true, publicId: true, rarity: true },
  });
  if (!card) return null;
  const details = await loadKitDetails(prisma, userId, [{ cardId: card.id, anilistId: card.publicId, rarity: card.rarity as Rarity }], rules);
  const detail = details.get(card.id);
  // L'ulti ne s'achète pas : il suit le personnage et sa rareté, affiché à côté du kit
  return detail ? { ...detail, ultimate: ultimateFor(card.publicId, card.rarity as Rarity, rules) } : null;
}

/**
 * Decks du joueur, les plus anciens d'abord. Lecture directe plutôt que par getCandidates, plafonné à
 * MAX_CANDIDATES : un deck hors de ce top ne doit pas paraître indisponible.
 */
export async function getDecks(userId: string, rules: BattleRules): Promise<DeckView[]> {
  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, cardIds: true },
  });
  if (decks.length === 0) return [];
  const ids = [...new Set(decks.flatMap((d) => d.cardIds))];
  const [cards, copies] = await Promise.all([
    prisma.card.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        publicId: true,
        appearance: true,
        name: true,
        nameNative: true,
        imageUrl: true,
        rank: true,
        rarity: true,
        power: true,
        ki: true,
        spoiler: true,
        series: { select: { id: true, titleRomaji: true, universeId: true, universe: { select: { name: true } } } },
      },
    }),
    prisma.userCard.findMany({ where: { ownerId: userId, status: "COLLECTION", cardId: { in: ids } }, distinct: ["cardId"], select: { cardId: true } }),
  ]);
  const byId = new Map(
    cards.map(({ id, publicId, rarity, series, ...card }) => [
      id,
      candidateFrom({ ...card, cardId: id, anilistId: publicId, rarity: rarity as Rarity, universe: universeOf(series) }, rules),
    ]),
  );
  // Kits de l'atelier : un deck affiche les capacités avec lesquelles ses cartes combattront
  const kits = await loadKits(prisma, userId, cards.map((c) => ({ cardId: c.id, anilistId: c.publicId, rarity: c.rarity as Rarity })), rules);
  for (const [id, card] of byId) {
    const kit = kits.get(id);
    if (kit) byId.set(id, { ...card, keywords: [...kit.keywords], technique: kit.technique });
  }
  const inCollection = new Set(copies.map((c) => c.cardId));
  return decks.map((d) => {
    const unavailable = d.cardIds.filter((id) => !inCollection.has(id));
    return {
      id: d.id,
      name: d.name,
      cards: d.cardIds.flatMap((id) => byId.get(id) ?? []),
      unavailable,
      playable: d.cardIds.length === TEAM_SIZE && unavailable.length === 0,
    };
  });
}

/** Dernière équipe du joueur, si ses cartes sont toujours disponibles. */
export async function getLastTeam(userId: string, candidates: readonly CandidateCard[]): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { battleTeam: true } });
  const available = new Set(candidates.map((c) => c.cardId));
  return (user?.battleTeam ?? []).filter((id) => available.has(id));
}

/**
 * « Relancer » en fin de partie : même mode de file et mêmes cartes que cette partie (ids de Card,
 * revérifiés à l'engagement). null si la partie n'est pas une partie de file terminée de ce joueur.
 */
export async function requeueTeamOf(
  battleId: string,
  userId: string,
): Promise<{ mode: "EXHIBITION" | "RANKED"; cardIds: string[] } | null> {
  const b = await prisma.battle.findUnique({
    where: { id: battleId },
    select: { mode: true, status: true, p1Id: true, p2Id: true, p1Team: true, p2Team: true },
  });
  if (!b || b.status !== "FINISHED" || b.mode === "FRIEND") return null;
  const team = b.p1Id === userId ? b.p1Team : b.p2Id === userId ? b.p2Team : null;
  if (!team) return null;
  const copies = await prisma.userCard.findMany({ where: { id: { in: team } }, select: { id: true, cardId: true } });
  const byId = new Map(copies.map((c) => [c.id, c.cardId]));
  // Un exemplaire disparu depuis (vendu, échangé) : l'équipe revient incomplète
  return { mode: b.mode, cardIds: team.flatMap((id) => byId.get(id) ?? []) };
}

export async function getHistory(userId: string, take = 20): Promise<HistoryItem[]> {
  const rows = await prisma.battle.findMany({
    where: { status: "FINISHED", OR: [{ p1Id: userId }, { p2Id: userId }] },
    orderBy: { endedAt: "desc" },
    take,
    select: {
      id: true,
      mode: true,
      p1Id: true,
      botName: true,
      winnerSide: true,
      endReason: true,
      rewardZeni: true,
      pcDeltaP1: true,
      pcDeltaP2: true,
      endedAt: true,
      p1: { select: playerSelect },
      p2: { select: playerSelect },
    },
  });
  return rows.map((b) => {
    const mySide: Side = b.p1Id === userId ? 0 : 1;
    const opponent = mySide === 0 ? playerView(b.p2, b.botName) : playerView(b.p1, null);
    return {
      id: b.id,
      mode: b.mode,
      opponent,
      result: b.winnerSide === null ? "DRAW" : b.winnerSide === mySide ? "WIN" : "LOSS",
      endReason: b.endReason,
      rewardZeni: b.winnerSide === mySide ? b.rewardZeni : 0,
      pcDelta: mySide === 0 ? b.pcDeltaP1 : b.pcDeltaP2,
      endedAt: (b.endedAt ?? new Date()).toISOString(),
    };
  });
}

/** Santé du combat pour /admin/combat. */
export async function combatTotals(now: Date) {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [active, waiting, queued, finished24h, bots24h, rewards] = await Promise.all([
    prisma.battle.count({ where: { status: "ACTIVE" } }),
    prisma.battle.count({ where: { status: "WAITING" } }),
    prisma.battleQueue.count(),
    prisma.battle.count({ where: { status: "FINISHED", endedAt: { gte: since } } }),
    prisma.battle.count({ where: { status: "FINISHED", endedAt: { gte: since }, p2Id: null } }),
    prisma.coinTransaction.aggregate({ where: { reason: "BATTLE_WIN", createdAt: { gte: since } }, _sum: { amount: true } }),
  ]);
  return { active, waiting, queued, finished24h, bots24h, rewards24h: rewards._sum.amount ?? 0 };
}

export type AbilitySales = { kind: AbilityKind; ability: Keyword | Technique; count: number; zeni: number }[];

/** Achats de l'atelier par capacité sur 7 jours, les plus achetées d'abord (/admin/combat, surveillance de Rafale). */
export async function abilitySales(now: Date): Promise<AbilitySales> {
  const since = new Date(now.getTime() - 7 * 24 * 3_600_000);
  const rows = await prisma.abilityPurchase.groupBy({
    by: ["kind", "ability"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { price: true },
  });
  return rows
    .flatMap((r) =>
      (r.kind === "KEYWORD" && isKeyword(r.ability)) || (r.kind === "TECHNIQUE" && isTechnique(r.ability))
        ? [{ kind: r.kind as AbilityKind, ability: r.ability as Keyword | Technique, count: r._count._all, zeni: r._sum.price ?? 0 }]
        : [],
    )
    .sort((a, b) => b.count - a.count || b.zeni - a.zeni);
}

/** Ami à défier depuis son profil : null si le pseudo n'est pas un ami accepté. */
export async function challengeTarget(viewerId: string, username: string): Promise<{ id: string; name: string } | null> {
  if (!/^[\w.-]{1,40}$/.test(username)) return null;
  const other = await prisma.user.findUnique({ where: { username }, select: { id: true, username: true } });
  if (!other || other.id === viewerId) return null;
  const { relation } = await getRelation(viewerId, other.id);
  return relation === "FRIENDS" ? { id: other.id, name: other.username } : null;
}
