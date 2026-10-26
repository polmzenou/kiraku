// Combat 1v1 en direct, atomique. Le client Prisma est injecté (serveur ou test de concurrence) : pas
// de server/db.ts ici. Le client n'envoie que des ids de Card, un code, l'id d'une partie, la version
// qu'il a vue et une intention (attaquer telle carte avec telle autre) : tout est revérifié ici par le
// moteur pur (lib/battle/engine.ts), sous le verrou de la partie.
//
// Ordre des verrous, partout : le joueur (lockPlayers), puis la partie ou la ligne de file. Une partie
// en cours se verrouille seule (FOR UPDATE) : deux actions sur la même version, une seule passe.
// Les cartes engagées passent en BATTLE par updateMany conditionnel et reviennent en COLLECTION à la
// fin, quelle qu'elle soit (K.O., abandon, minuteur, salle expirée, file quittée).
import { Prisma, type BattleMode, type PrismaClient } from "@/generated/prisma/client";
import { BOT_NAMES, botAction, botRarities } from "@/lib/battle/bot";
import { engineRules, type BattleRules } from "@/lib/battle/config";
import { applyAction, createState } from "@/lib/battle/engine";
import { buildSetup, fighterFrom, type FighterCard } from "@/lib/battle/stats";
import {
  IllegalAction,
  TEAM_SIZE,
  type Action,
  type BattleEvent,
  type BattleSetup,
  type BattleState,
  type FighterSetup,
  type Side,
} from "@/lib/battle/types";
import { type Rarity } from "@/lib/catalog/rarity";
import { mixSeed, seededRng, type Rng } from "@/lib/rng";
import { pickGiftCopy } from "@/lib/social/gifts";
import { pairKey } from "@/lib/social/relation";
import type { RankedRules } from "@/lib/ranked/rules";
import { credit } from "../economy/ledger";
import { applyRankedWith, startTiers, type RankedOutcome } from "../ranked/ranked-core";
import { blocksBetween, lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";

export type BattleErrorCode =
  | "NO_USER"
  | "BANNED"
  | "GUEST"
  | "DISABLED"
  | "BAD_TEAM"
  | "NOT_OWNED"
  | "IN_BATTLE"
  | "IN_QUEUE"
  | "NOT_QUEUED"
  | "TOO_EARLY"
  | "NOT_FOUND"
  | "CLOSED"
  | "OWN_ROOM"
  | "RESERVED"
  | "BLOCKED"
  | "NOT_FRIENDS"
  | "NOT_PARTICIPANT"
  | "STALE"
  | "ILLEGAL"
  | "NO_BOT_CARDS";

export class BattleError extends Error {
  constructor(
    readonly code: BattleErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };
/** Sans nouvelle d'un joueur en file depuis ce délai, sa place est libérée. */
export const QUEUE_STALE_SECONDS = 15;
/** Alphabet des codes ami : sans 0/O/1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
/** Garde-fou : un tour de bot ne dépasse jamais ce nombre d'actions. */
const MAX_BOT_ACTIONS = 24;

/** Ce que reçoivent les deux joueurs après chaque changement (diffusé tel quel : rien n'est caché). */
export type BattleUpdate = {
  battleId: string;
  /** Version de départ : le client n'applique la mise à jour que s'il en est là (sinon il se resynchronise). */
  from: number;
  version: number;
  events: BattleEvent[];
  state: BattleState;
  turnEndsAt: Date | null;
  finished: boolean;
  rewardZeni: number;
  /** Partie classée terminée : PC de chaque camp. */
  ranked: RankedOutcome | null;
};

/** Contexte commun : réglages courants, horloge, hasard du serveur et début du jour de jeu (plafond des récompenses). */
export type Ctx = { now: Date; rules: BattleRules; random: Rng; dayStart: Date; ranked: RankedRules; timeZone: string };

// --- Lecture verrouillée d'une partie ---

type LockedBattle = {
  id: string;
  mode: BattleMode;
  status: "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";
  code: string | null;
  codeExpiresAt: Date | null;
  seed: number;
  p1Id: string;
  p2Id: string | null;
  botName: string | null;
  p1Team: string[];
  p2Team: string[];
  setup: Prisma.JsonValue;
  state: Prisma.JsonValue;
  version: number;
  turnEndsAt: Date | null;
};

async function lockBattle(tx: Tx, where: { id: string } | { code: string }): Promise<LockedBattle | null> {
  const rows =
    "id" in where
      ? await tx.$queryRaw<LockedBattle[]>`
          SELECT id, mode::text AS mode, status::text AS status, code, "codeExpiresAt", seed, "p1Id", "p2Id", "botName",
                 "p1Team", "p2Team", setup, state, version, "turnEndsAt"
          FROM "Battle" WHERE id = ${where.id} FOR UPDATE`
      : await tx.$queryRaw<LockedBattle[]>`
          SELECT id, mode::text AS mode, status::text AS status, code, "codeExpiresAt", seed, "p1Id", "p2Id", "botName",
                 "p1Team", "p2Team", setup, state, version, "turnEndsAt"
          FROM "Battle" WHERE code = ${where.code} FOR UPDATE`;
  return rows[0] ?? null;
}

const setupOf = (b: LockedBattle) => b.setup as unknown as BattleSetup;
const stateOf = (b: LockedBattle) => b.state as unknown as BattleState;
const sideOf = (b: Pick<LockedBattle, "p1Id" | "p2Id">, userId: string): Side | null =>
  b.p1Id === userId ? 0 : b.p2Id === userId ? 1 : null;
/** Le bot joue toujours le camp 1 (p2Id null). */
const botSide = (b: Pick<LockedBattle, "p2Id" | "botName">): Side | null => (b.p2Id === null && b.botName ? 1 : null);

// --- Joueurs et équipes ---

async function lockPlayer(tx: Tx, userId: string) {
  const me = (await lockPlayers(tx, [userId])).get(userId);
  if (!me) throw new BattleError("NO_USER");
  if (me.bannedAt) throw new BattleError("BANNED");
  if (me.isGuest) throw new BattleError("GUEST");
  return me;
}

/** Un joueur ne fait qu'une chose à la fois : une file, une salle ouverte ou une partie en cours. */
async function assertFree(tx: Tx, userId: string) {
  const queued = await tx.battleQueue.findUnique({ where: { userId }, select: { userId: true } });
  if (queued) throw new BattleError("IN_QUEUE");
  const busy = await tx.battle.findFirst({
    where: {
      OR: [
        { p1Id: userId, status: { in: ["WAITING", "ACTIVE"] } },
        { p2Id: userId, status: "ACTIVE" },
      ],
    },
    select: { id: true },
  });
  if (busy) throw new BattleError("IN_BATTLE", busy.id);
}

export function checkTeam(cardIds: readonly string[]) {
  if (cardIds.length !== TEAM_SIZE || new Set(cardIds).size !== TEAM_SIZE) throw new BattleError("BAD_TEAM");
}

/**
 * Engage un exemplaire de chacune des 3 cartes (le plus récent hors vitrine de préférence ; la vitrine
 * n'est pas touchée, le blocage n'est que temporaire). Renvoie les ids de UserCard dans l'ordre choisi.
 */
async function lockTeam(tx: Tx, userId: string, cardIds: readonly string[]): Promise<string[]> {
  checkTeam(cardIds);
  const copies = await tx.userCard.findMany({
    where: { ownerId: userId, cardId: { in: [...cardIds] }, status: "COLLECTION" },
    select: { id: true, cardId: true, obtainedAt: true },
  });
  const shown = new Set(
    (
      await tx.showcaseSlot.findMany({ where: { userId, userCardId: { in: copies.map((c) => c.id) } }, select: { userCardId: true } })
    ).map((s) => s.userCardId),
  );
  const chosen = cardIds.map((cardId) => pickGiftCopy(copies.filter((c) => c.cardId === cardId), shown)?.id ?? null);
  if (chosen.some((id) => id === null)) throw new BattleError("NOT_OWNED");
  const ids = chosen as string[];
  const reserved = await tx.userCard.updateMany({
    where: { id: { in: ids }, ownerId: userId, status: "COLLECTION" },
    data: { status: "BATTLE" },
  });
  if (reserved.count !== TEAM_SIZE) throw new BattleError("NOT_OWNED");
  await tx.user.update({ where: { id: userId }, data: { battleTeam: [...cardIds] } });
  return ids;
}

async function releaseTeam(tx: Tx, userId: string | null, userCardIds: readonly string[]) {
  if (!userId || userCardIds.length === 0) return;
  await tx.userCard.updateMany({
    where: { id: { in: [...userCardIds] }, ownerId: userId, status: "BATTLE" },
    data: { status: "COLLECTION" },
  });
}

const cardSelect = {
  id: true,
  anilistId: true, publicId: true, appearance: true,
  name: true,
  nameNative: true,
  imageUrl: true,
  rank: true,
  rarity: true,
  power: true,
  ki: true,
} as const;

async function fightersOf(tx: Tx, userCardIds: readonly string[], rules: BattleRules): Promise<FighterSetup[]> {
  const rows = await tx.userCard.findMany({ where: { id: { in: [...userCardIds] } }, select: { id: true, card: { select: cardSelect } } });
  const byId = new Map(rows.map((r) => [r.id, r.card]));
  return userCardIds.map((id) => {
    const card = byId.get(id);
    if (!card) throw new BattleError("NOT_OWNED");
    return fighterFrom({ ...card, anilistId: card.publicId } as FighterCard, rules);
  });
}

/** Une carte au hasard de chaque rareté demandée, toutes différentes. */
async function botFighters(tx: Tx, rarities: readonly Rarity[], ctx: Ctx): Promise<FighterSetup[]> {
  const RARITIES = (await tx.rarityDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }], select: { key: true } })).map((r) => r.key);
  const picked: FighterSetup[] = [];
  for (const wanted of botRarities(rarities, ctx.random, ctx.rules.botUpgradePct, RARITIES)) {
    // Rareté vide (petit catalogue) : on descend jusqu'à en trouver une
    let card: FighterCard | null = null;
    for (let i = RARITIES.indexOf(wanted); i >= 0 && !card; i--) {
      const rarity = RARITIES[i];
      const where: Prisma.CardWhereInput = { rarity, status: "PUBLISHED", id: { notIn: picked.map((f) => f.cardId) } };
      const count = await tx.card.count({ where });
      if (count === 0) continue;
      const row = await tx.card.findFirst({ where, select: cardSelect, orderBy: { id: "asc" }, skip: ctx.random(count) });
      card = row ? { ...row, anilistId: row.publicId } : null;
    }
    if (!card) throw new BattleError("NO_BOT_CARDS");
    picked.push(fighterFrom(card, ctx.rules));
  }
  return picked;
}

// --- Déroulé d'une partie ---

const json = (v: unknown) => v as Prisma.InputJsonValue;
const newSeed = (random: Rng) => random(2 ** 31);
const botRng = (seed: number, seq: number) => seededRng(mixSeed(seed ^ 0x0b07b07, seq));

type Progress = { state: BattleState; events: BattleEvent[]; actions: { seq: number; side: Side; action: Action }[] };

function apply(setup: BattleSetup, seed: number, p: Progress, action: Action) {
  const seq = p.state.seq;
  const res = applyAction(setup, seed, p.state, action);
  p.state = res.state;
  p.events.push(...res.events);
  p.actions.push({ seq, side: action.side, action });
}

/** Fait jouer le bot tant que c'est son tour. */
function runBot(setup: BattleSetup, seed: number, p: Progress, side: Side | null, mistakePct: number) {
  for (let i = 0; side !== null && !p.state.finished && p.state.active === side; i++) {
    const action = i >= MAX_BOT_ACTIONS ? { type: "END_TURN" as const, side } : botAction(setup, p.state, side, botRng(seed, p.state.seq), mistakePct);
    apply(setup, seed, p, action);
  }
}

/** Zeni du gagnant selon le mode, dans la limite des combats récompensés par jour. */
async function rewardFor(tx: Tx, b: LockedBattle, winnerId: string, state: BattleState, ctx: Ctx): Promise<number> {
  const r = ctx.rules.rewards;
  const base = botSide(b) !== null ? r.bot : b.mode === "FRIEND" ? r.friend : b.mode === "RANKED" ? r.ranked : r.exhibition;
  // Anti-farm : pas de gain pour un abandon ou un minuteur avant que chaque camp ait joué un tour
  if (base <= 0 || state.turn < 3) return 0;
  await lockPlayers(tx, [winnerId]);
  const today = await tx.coinTransaction.count({ where: { userId: winnerId, reason: "BATTLE_WIN", createdAt: { gte: ctx.dayStart } } });
  return today < r.dailyCap ? base : 0;
}

async function persist(tx: Tx, b: LockedBattle, p: Progress, ctx: Ctx, nextDeadline: (prev: BattleState) => Date | null) {
  const prev = stateOf(b);
  if (p.actions.length > 0) {
    await tx.battleAction.createMany({
      data: p.actions.map((a) => ({ battleId: b.id, seq: a.seq, side: a.side, payload: json(a.action), createdAt: ctx.now })),
    });
  }
  let rewardZeni = 0;
  let ranked: { outcome: RankedOutcome; data: Prisma.BattleUncheckedUpdateManyInput } | null = null;
  if (p.state.finished) {
    await releaseTeam(tx, b.p1Id, b.p1Team);
    await releaseTeam(tx, b.p2Id, b.p2Team);
    const winnerId = p.state.winner === 0 ? b.p1Id : p.state.winner === 1 ? b.p2Id : null;
    if (winnerId) {
      rewardZeni = await rewardFor(tx, b, winnerId, p.state, ctx);
      if (rewardZeni > 0) await credit(tx, { userId: winnerId, amount: rewardZeni, reason: "BATTLE_WIN", refId: b.id, now: ctx.now });
    }
    // Classé : PC des deux camps, dans la même transaction que la fin de partie
    if (b.mode === "RANKED") ranked = await applyRankedWith(tx, b, setupOf(b), p.state, ctx.ranked);
  }
  const turnEndsAt = p.state.finished ? null : nextDeadline(prev);
  // version = nombre d'actions appliquées : le client renvoie celle qu'il a vue
  const updated = await tx.battle.updateMany({
    where: { id: b.id, version: b.version, status: "ACTIVE" },
    data: {
      state: json(p.state),
      version: p.state.seq,
      turnEndsAt,
      ...(p.state.finished
        ? { status: "FINISHED", winnerSide: p.state.winner, endReason: p.state.endReason, endedAt: ctx.now, rewardZeni, ...ranked?.data }
        : {}),
    },
  });
  if (updated.count !== 1) throw new BattleError("STALE");
  return { turnEndsAt, rewardZeni, ranked: ranked?.outcome ?? null };
}

function update(b: LockedBattle, p: Progress, saved: { turnEndsAt: Date | null; rewardZeni: number; ranked: RankedOutcome | null }): BattleUpdate {
  return {
    battleId: b.id,
    from: b.version,
    version: p.state.seq,
    events: p.events,
    state: p.state,
    turnEndsAt: saved.turnEndsAt,
    finished: p.state.finished,
    rewardZeni: saved.rewardZeni,
    ranked: saved.ranked,
  };
}

/** Nouveau tour → nouveau minuteur ; même tour → même échéance. */
const deadlineAfter = (ctx: Ctx, p: Progress, current: Date | null) => (prev: BattleState) =>
  prev.turn !== p.state.turn || prev.active !== p.state.active || !current
    ? new Date(ctx.now.getTime() + ctx.rules.turnSeconds * 1_000)
    : current;

/**
 * Lance une partie : équipes figées dans le setup, premier tour posé.
 * Contre un bot, le joueur commence toujours : il arrive sur un plateau intact.
 * La ligne Battle existe déjà (salle d'amis) ou est créée ici (file, bot).
 */
async function start(
  tx: Tx,
  base: { id?: string; mode: BattleMode; seed: number; p1Id: string; p2Id: string | null; botName: string | null; p1Team: string[]; p2Team: string[] },
  teams: [FighterSetup[], FighterSetup[]],
  ctx: Ctx,
): Promise<BattleUpdate> {
  const bot = botSide(base);
  const human = bot === null ? undefined : bot === 0 ? 1 : 0;
  const setup = buildSetup(teams, engineRules(ctx.rules), seededRng(mixSeed(base.seed, 0x51de)), human);
  const first = createState(setup);
  const p: Progress = { state: first.state, events: first.events, actions: [] };
  const turnEndsAt = p.state.finished ? null : new Date(ctx.now.getTime() + ctx.rules.turnSeconds * 1_000);
  // Classé : rang de chaque camp figé au lancement (couleur du plateau)
  const tiers = base.mode === "RANKED" ? await startTiers(tx, base.p1Id, base.p2Id, ctx.ranked) : null;
  const data = {
    p1Tier: tiers?.[0] ?? null,
    p2Tier: tiers?.[1] ?? null,
    mode: base.mode,
    status: "ACTIVE" as const,
    code: null,
    codeExpiresAt: null,
    seed: base.seed,
    p1Id: base.p1Id,
    p2Id: base.p2Id,
    botName: base.botName,
    p1Team: base.p1Team,
    p2Team: base.p2Team,
    setup: json(setup),
    state: json(p.state),
    version: p.state.seq,
    turnEndsAt,
    startedAt: ctx.now,
  };
  const row = base.id
    ? await tx.battle.update({ where: { id: base.id }, data, select: { id: true } })
    : await tx.battle.create({ data: { ...data, createdAt: ctx.now }, select: { id: true } });
  return { battleId: row.id, from: 0, version: p.state.seq, events: p.events, state: p.state, turnEndsAt, finished: false, rewardZeni: 0, ranked: null };
}

// --- Actions en partie ---

/** Ce que le client peut demander (le camp est toujours celui du joueur de la session). */
export type ClientAction =
  | { type: "ATTACK"; actor: number; target: number }
  | { type: "TECHNIQUE"; actor: number; target?: number }
  | { type: "END_TURN" }
  | { type: "FORFEIT" };

export async function playActionWith(
  db: PrismaClient,
  input: { userId: string; battleId: string; version: number; action: ClientAction },
  ctx: Ctx,
): Promise<BattleUpdate> {
  return db.$transaction(async (tx) => {
    const b = await lockBattle(tx, { id: input.battleId });
    if (!b) throw new BattleError("NOT_FOUND");
    const side = sideOf(b, input.userId);
    if (side === null) throw new BattleError("NOT_PARTICIPANT");
    if (b.status !== "ACTIVE") throw new BattleError("CLOSED");
    if (b.version !== input.version) throw new BattleError("STALE");
    const setup = setupOf(b);
    const p: Progress = { state: stateOf(b), events: [], actions: [] };
    try {
      apply(setup, b.seed, p, { ...input.action, side } as Action);
    } catch (e) {
      if (e instanceof IllegalAction) throw new BattleError("ILLEGAL", e.code);
      throw e;
    }
    runBot(setup, b.seed, p, botSide(b), ctx.rules.botMistakePct);
    const saved = await persist(tx, b, p, ctx, deadlineAfter(ctx, p, b.turnEndsAt));
    return update(b, p, saved);
  }, TX);
}

/**
 * Tour expiré : fin de tour forcée pour le camp actif (forfait au-delà de maxMissedTurns).
 * `chain` (balayage d'une partie abandonnée) enchaîne les échéances depuis la précédente au lieu de
 * repartir de maintenant : une partie oubliée depuis des heures se termine d'un coup.
 */
async function expireInTx(tx: Tx, b: LockedBattle, ctx: Ctx, chain: boolean): Promise<BattleUpdate | null> {
  if (b.status !== "ACTIVE" || !b.turnEndsAt || b.turnEndsAt > ctx.now) return null;
  const setup = setupOf(b);
  const p: Progress = { state: stateOf(b), events: [], actions: [] };
  let deadline = b.turnEndsAt;
  const bot = botSide(b);
  do {
    apply(setup, b.seed, p, { type: "TIMEOUT", side: p.state.active });
    runBot(setup, b.seed, p, bot, ctx.rules.botMistakePct);
    deadline = new Date((chain ? deadline.getTime() : ctx.now.getTime()) + ctx.rules.turnSeconds * 1_000);
  } while (chain && !p.state.finished && deadline <= ctx.now);
  const saved = await persist(tx, b, p, ctx, () => deadline);
  return update(b, p, saved);
}

/** Un participant réclame la fin d'un tour expiré (son minuteur client est arrivé à zéro). */
export async function claimTimeoutWith(db: PrismaClient, input: { userId: string; battleId: string }, ctx: Ctx) {
  return db.$transaction(async (tx) => {
    const b = await lockBattle(tx, { id: input.battleId });
    if (!b) throw new BattleError("NOT_FOUND");
    if (sideOf(b, input.userId) === null) throw new BattleError("NOT_PARTICIPANT");
    if (b.status !== "ACTIVE") throw new BattleError("CLOSED");
    if (!b.turnEndsAt || b.turnEndsAt > ctx.now) throw new BattleError("TOO_EARLY");
    return expireInTx(tx, b, ctx, false);
  }, TX);
}

// --- File d'attente (exhibition ; le classé s'y branchera en 9b) ---

export type QueueStatus =
  | { state: "MATCHED"; battleId: string; update: BattleUpdate | null }
  | { state: "WAITING"; joinedAt: Date; botAt: Date }
  | { state: "NONE" };

type QueueRow = { userId: string; mode: BattleMode; rankPoints: number; team: string[]; joinedAt: Date };

const QUEUE_LOCK: Record<BattleMode, number> = { FRIEND: 0x6b72_0001, EXHIBITION: 0x6b72_0002, RANKED: 0x6b72_0003 };

/**
 * Un seul appariement à la fois par file (verrou consultatif de transaction). Sans lui, deux joueurs
 * qui sondent au même instant verrouillent chacun leur place et sautent celle de l'autre : ils ne se
 * trouveraient jamais. Pris après le verrou du joueur, avant toute ligne de file.
 */
async function lockQueue(tx: Tx, mode: BattleMode) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUEUE_LOCK[mode]}::bigint)`;
}

async function ownQueueRow(tx: Tx, userId: string): Promise<QueueRow | null> {
  const [row] = await tx.$queryRaw<QueueRow[]>`
    SELECT "userId", mode::text AS mode, "rankPoints", team, "joinedAt"
    FROM "BattleQueue" WHERE "userId" = ${userId} FOR UPDATE`;
  return row ?? null;
}

/** Verrou de la file du joueur (s'il y est), puis sa ligne. */
async function lockOwnQueue(tx: Tx, userId: string): Promise<QueueRow | null> {
  const peek = await tx.battleQueue.findUnique({ where: { userId }, select: { mode: true } });
  if (!peek) return null;
  await lockQueue(tx, peek.mode);
  return ownQueueRow(tx, userId);
}

/** Cherche un autre joueur présent dans la même file ; lignes déjà prises par un autre appariement sautées. */
/**
 * Classé : écart de PC accepté, qui s'élargit avec l'attente du plus patient des deux
 * (ranked.matchRange). Toujours vrai pour les autres files.
 */
function rankedRange(me: QueueRow, ctx: Ctx): Prisma.Sql {
  if (me.mode !== "RANKED") return Prisma.sql`TRUE`;
  const { base, perSecond, max } = ctx.ranked.matchRange;
  const myWait = Math.max(0, Math.floor((ctx.now.getTime() - me.joinedAt.getTime()) / 1_000));
  const theirWait = Prisma.sql`floor(extract(epoch FROM (${ctx.now}::timestamptz - q."joinedAt"::timestamptz)))::int`;
  return Prisma.sql`abs(q."rankPoints" - ${me.rankPoints}::int) <= LEAST(${max}::int, ${base}::int + ${perSecond}::int * GREATEST(${myWait}::int, ${theirWait}))`;
}

async function findOpponent(tx: Tx, me: QueueRow, ctx: Ctx): Promise<QueueRow | null> {
  const fresh = new Date(ctx.now.getTime() - QUEUE_STALE_SECONDS * 1_000);
  const rows = await tx.$queryRaw<QueueRow[]>`
    SELECT q."userId", q.mode::text AS mode, q."rankPoints", q.team, q."joinedAt"
    FROM "BattleQueue" q
    WHERE q.mode = ${me.mode}::"BattleMode" AND q."userId" <> ${me.userId} AND q."seenAt" > ${fresh}
      AND ${rankedRange(me, ctx)}
      AND NOT EXISTS (
        SELECT 1 FROM "UserBlock" b
        WHERE (b."blockerId" = ${me.userId} AND b."blockedId" = q."userId")
           OR (b."blockerId" = q."userId" AND b."blockedId" = ${me.userId})
      )
    ORDER BY q."joinedAt" ASC
    LIMIT 1
    FOR UPDATE OF q SKIP LOCKED`;
  return rows[0] ?? null;
}

async function matchInTx(tx: Tx, me: QueueRow, ctx: Ctx): Promise<BattleUpdate | null> {
  const opp = await findOpponent(tx, me, ctx);
  if (!opp) return null;
  await tx.battleQueue.deleteMany({ where: { userId: { in: [me.userId, opp.userId] } } });
  // Le plus ancien en file est p1
  const teams: [FighterSetup[], FighterSetup[]] = [await fightersOf(tx, opp.team, ctx.rules), await fightersOf(tx, me.team, ctx.rules)];
  return start(
    tx,
    { mode: me.mode, seed: newSeed(ctx.random), p1Id: opp.userId, p2Id: me.userId, botName: null, p1Team: opp.team, p2Team: me.team },
    teams,
    ctx,
  );
}

/** Partie en cours du joueur (pour le renvoyer dessus après un appariement fait par l'autre). */
async function currentBattleId(tx: Tx, userId: string): Promise<string | null> {
  const b = await tx.battle.findFirst({
    where: { status: "ACTIVE", OR: [{ p1Id: userId }, { p2Id: userId }] },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  return b?.id ?? null;
}

export async function joinQueueWith(
  db: PrismaClient,
  input: { userId: string; cardIds: string[]; mode: "EXHIBITION" | "RANKED" },
  ctx: Ctx,
): Promise<QueueStatus> {
  if (!ctx.rules.enabled) throw new BattleError("DISABLED");
  return db.$transaction(async (tx) => {
    await lockPlayer(tx, input.userId);
    await assertFree(tx, input.userId);
    const team = await lockTeam(tx, input.userId, input.cardIds);
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { rankPoints: true } });
    await lockQueue(tx, input.mode);
    const me: QueueRow = { userId: input.userId, mode: input.mode, rankPoints: user.rankPoints, team, joinedAt: ctx.now };
    await tx.battleQueue.create({ data: { ...me, seenAt: ctx.now } });
    const matched = await matchInTx(tx, me, ctx);
    if (matched) return { state: "MATCHED", battleId: matched.battleId, update: matched };
    return { state: "WAITING", joinedAt: ctx.now, botAt: new Date(ctx.now.getTime() + ctx.rules.queueSeconds * 1_000) };
  }, TX);
}

/** Sondage de la file : « je suis toujours là » + nouvel essai d'appariement. */
export async function pollQueueWith(db: PrismaClient, input: { userId: string }, ctx: Ctx): Promise<QueueStatus> {
  return db.$transaction(async (tx) => {
    const row = await lockOwnQueue(tx, input.userId);
    if (!row) {
      const battleId = await currentBattleId(tx, input.userId);
      return battleId ? { state: "MATCHED", battleId, update: null } : { state: "NONE" };
    }
    await tx.battleQueue.update({ where: { userId: input.userId }, data: { seenAt: ctx.now } });
    const matched = await matchInTx(tx, row, ctx);
    if (matched) return { state: "MATCHED", battleId: matched.battleId, update: matched };
    return { state: "WAITING", joinedAt: row.joinedAt, botAt: new Date(row.joinedAt.getTime() + ctx.rules.queueSeconds * 1_000) };
  }, TX);
}

export async function leaveQueueWith(db: PrismaClient, input: { userId: string }): Promise<QueueStatus> {
  return db.$transaction(async (tx) => {
    const row = await lockOwnQueue(tx, input.userId);
    if (!row) {
      const battleId = await currentBattleId(tx, input.userId);
      return battleId ? { state: "MATCHED", battleId, update: null } : { state: "NONE" };
    }
    await tx.battleQueue.delete({ where: { userId: input.userId } });
    await releaseTeam(tx, input.userId, row.team);
    return { state: "NONE" };
  }, TX);
}

/**
 * Personne en vue après battle.queueSeconds : un bot prend la place, avec une équipe de même rareté.
 * `skipWait` : le joueur a demandé le bot lui-même, sans attendre la fin du délai.
 */
export async function startBotBattleWith(db: PrismaClient, input: { userId: string; skipWait?: boolean }, ctx: Ctx): Promise<BattleUpdate> {
  return db.$transaction(async (tx) => {
    const row = await lockOwnQueue(tx, input.userId);
    if (!row) throw new BattleError("NOT_QUEUED");
    if (!input.skipWait && row.joinedAt.getTime() + ctx.rules.queueSeconds * 1_000 > ctx.now.getTime()) throw new BattleError("TOO_EARLY");
    // Dernière chance : un vrai joueur est peut-être arrivé entre-temps
    const matched = await matchInTx(tx, row, ctx);
    if (matched) return matched;
    await tx.battleQueue.delete({ where: { userId: input.userId } });
    const mine = await fightersOf(tx, row.team, ctx.rules);
    const bot = await botFighters(tx, mine.map((f) => f.rarity), ctx);
    return start(
      tx,
      {
        mode: row.mode,
        seed: newSeed(ctx.random),
        p1Id: input.userId,
        p2Id: null,
        botName: BOT_NAMES[ctx.random(BOT_NAMES.length)],
        p1Team: row.team,
        p2Team: [],
      },
      [mine, bot],
      ctx,
    );
  }, TX);
}

// --- Salles d'amis (code) ---

function newCode(random: Rng): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join("");
}

export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/** Ouvre une salle ; avec `inviteeId`, elle est réservée à cet ami, qui reçoit une notification. */
export async function createRoomWith(
  db: PrismaClient,
  input: { userId: string; cardIds: string[]; inviteeId: string | null },
  ctx: Ctx,
  onNotified?: OnNotified,
): Promise<{ battleId: string; code: string; expiresAt: Date }> {
  if (!ctx.rules.enabled) throw new BattleError("DISABLED");
  if (input.inviteeId === input.userId) throw new BattleError("OWN_ROOM");
  return notifyingTransaction(
    db,
    async (tx) => {
      await lockPlayer(tx, input.userId);
      await assertFree(tx, input.userId);
      if (input.inviteeId) {
        const friendship = await tx.friendship.findUnique({ where: { pairKey: pairKey(input.userId, input.inviteeId) }, select: { status: true } });
        if (friendship?.status !== "ACCEPTED") throw new BattleError("NOT_FRIENDS");
        const blocks = await blocksBetween(tx, input.userId, input.inviteeId);
        if (blocks.byMe || blocks.byThem) throw new BattleError("BLOCKED");
      }
      const team = await lockTeam(tx, input.userId, input.cardIds);
      let code = newCode(ctx.random);
      // Les codes ne sont gardés que pendant l'attente : une collision est rare, on retente
      for (let i = 0; i < 5 && (await tx.battle.findUnique({ where: { code }, select: { id: true } })); i++) code = newCode(ctx.random);
      const expiresAt = new Date(ctx.now.getTime() + ctx.rules.roomMinutes * 60_000);
      const battle = await tx.battle.create({
        data: {
          mode: "FRIEND",
          status: "WAITING",
          code,
          codeExpiresAt: expiresAt,
          seed: newSeed(ctx.random),
          p1Id: input.userId,
          p2Id: input.inviteeId,
          p1Team: team,
          createdAt: ctx.now,
        },
        select: { id: true },
      });
      if (input.inviteeId) {
        await notify(tx, { userId: input.inviteeId, type: "BATTLE_INVITE", actorId: input.userId, refId: battle.id, payload: { battleId: battle.id }, now: ctx.now });
      }
      return { battleId: battle.id, code, expiresAt };
    },
    TX,
    onNotified,
  );
}

/** Rejoint une salle par son code ou par son id (invitation) : la partie démarre aussitôt. */
export async function joinRoomWith(
  db: PrismaClient,
  input: { userId: string; cardIds: string[]; code?: string; battleId?: string },
  ctx: Ctx,
): Promise<BattleUpdate> {
  if (!ctx.rules.enabled) throw new BattleError("DISABLED");
  return db.$transaction(async (tx) => {
    await lockPlayer(tx, input.userId);
    const where = input.code ? { code: input.code } : input.battleId ? { id: input.battleId } : null;
    if (!where) throw new BattleError("NOT_FOUND");
    const b = await lockBattle(tx, where);
    if (!b || b.mode !== "FRIEND") throw new BattleError("NOT_FOUND");
    if (b.status !== "WAITING" || !b.codeExpiresAt || b.codeExpiresAt <= ctx.now) throw new BattleError("CLOSED");
    if (b.p1Id === input.userId) throw new BattleError("OWN_ROOM");
    if (b.p2Id && b.p2Id !== input.userId) throw new BattleError("RESERVED");
    const blocks = await blocksBetween(tx, input.userId, b.p1Id);
    if (blocks.byMe || blocks.byThem) throw new BattleError("BLOCKED");
    await assertFree(tx, input.userId);
    const team = await lockTeam(tx, input.userId, input.cardIds);
    const teams: [FighterSetup[], FighterSetup[]] = [await fightersOf(tx, b.p1Team, ctx.rules), await fightersOf(tx, team, ctx.rules)];
    return start(
      tx,
      { id: b.id, mode: "FRIEND", seed: b.seed, p1Id: b.p1Id, p2Id: input.userId, botName: null, p1Team: b.p1Team, p2Team: team },
      teams,
      ctx,
    );
  }, TX);
}

/** Ferme sa salle avant que quelqu'un la rejoigne : l'équipe revient en collection. */
export async function cancelRoomWith(db: PrismaClient, input: { userId: string; battleId: string }, ctx: Ctx) {
  return db.$transaction(async (tx) => {
    const b = await lockBattle(tx, { id: input.battleId });
    if (!b || b.p1Id !== input.userId) throw new BattleError("NOT_FOUND");
    if (b.status !== "WAITING") throw new BattleError("CLOSED");
    await cancelInTx(tx, b, ctx);
  }, TX);
}

async function cancelInTx(tx: Tx, b: LockedBattle, ctx: Ctx) {
  await releaseTeam(tx, b.p1Id, b.p1Team);
  await tx.battle.update({ where: { id: b.id }, data: { status: "CANCELLED", code: null, endedAt: ctx.now } });
}

// --- Balayage (cloche, page de la partie, cron quotidien) ---

export type SweepResult = { expired: BattleUpdate[]; roomsClosed: number; queueCleared: number };

/**
 * Termine les tours expirés, ferme les salles périmées et vide les places de file abandonnées.
 * `userId` limite le balayage aux affaires d'un joueur (appel paresseux) ; sans, tout y passe par lots.
 */
export async function sweepStaleWith(db: PrismaClient, ctx: Ctx, opts: { userId?: string; limit?: number } = {}): Promise<SweepResult> {
  const limit = opts.limit ?? 50;
  const mine = opts.userId ? { OR: [{ p1Id: opts.userId }, { p2Id: opts.userId }] } : {};
  const result: SweepResult = { expired: [], roomsClosed: 0, queueCleared: 0 };

  const due = await db.battle.findMany({
    where: { status: "ACTIVE", turnEndsAt: { lte: ctx.now }, ...mine },
    select: { id: true },
    orderBy: { turnEndsAt: "asc" },
    take: limit,
  });
  for (const { id } of due) {
    const u = await db.$transaction(async (tx) => {
      const b = await lockBattle(tx, { id });
      return b ? expireInTx(tx, b, ctx, true) : null;
    }, TX);
    if (u) result.expired.push(u);
  }

  const rooms = await db.battle.findMany({
    where: { status: "WAITING", codeExpiresAt: { lte: ctx.now }, ...(opts.userId ? { p1Id: opts.userId } : {}) },
    select: { id: true },
    take: limit,
  });
  for (const { id } of rooms) {
    await db.$transaction(async (tx) => {
      const b = await lockBattle(tx, { id });
      if (b?.status === "WAITING" && b.codeExpiresAt && b.codeExpiresAt <= ctx.now) {
        await cancelInTx(tx, b, ctx);
        result.roomsClosed += 1;
      }
    }, TX);
  }

  const stale = new Date(ctx.now.getTime() - 4 * QUEUE_STALE_SECONDS * 1_000);
  const gone = await db.battleQueue.findMany({
    where: { seenAt: { lte: stale }, ...(opts.userId ? { userId: opts.userId } : {}) },
    select: { userId: true },
    take: limit,
  });
  for (const { userId } of gone) {
    await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<QueueRow[]>`
        SELECT "userId", mode::text AS mode, "rankPoints", team, "joinedAt"
        FROM "BattleQueue" WHERE "userId" = ${userId} AND "seenAt" <= ${stale} FOR UPDATE SKIP LOCKED`;
      if (!row) return;
      await tx.battleQueue.delete({ where: { userId } });
      await releaseTeam(tx, userId, row.team);
      result.queueCleared += 1;
    }, TX);
  }
  return result;
}
