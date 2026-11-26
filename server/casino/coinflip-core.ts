// Tables de pile ou face, atomiques. Le client Prisma est injecté (serveur ou test de concurrence), comme
// server/social/trade-core.ts.
//
// Poser une table met l'exemplaire en séquestre (CardStatus CASINO) : tous les autres transferts filtrent
// COLLECTION, la carte ne peut donc plus être vendue, échangée, offerte, recyclée ni engagée en combat.
// Relever verrouille la table puis les deux joueurs (ordre des verrous partout : la ligne CoinFlip, puis les
// joueurs triés par id), lance la pièce avec la graine tirée à la pose, et donne les deux cartes au gagnant
// par des updateMany conditionnels. Retirer, décliner ou laisser expirer rend la carte à son créateur.
import type { PrismaClient } from "@/generated/prisma/client";
import { isStaff } from "@/lib/admin/roles";
import {
  canCancel,
  canDecline,
  checkCreate,
  checkJoin,
  checkPlayer,
  coinFlipExpiresAt,
  flipWinner,
  isTableExpired,
  type CoinFlipRefusal,
  type CoinFlipStatus,
} from "@/lib/casino/coinflip";
import { commitOf, flipOutcome, seedHex, SEED_BYTES, type CoinSide } from "@/lib/casino/fairness";
import type { CasinoRules } from "@/lib/casino/rules";
import { tierOf } from "@/lib/casino/tiers";
import type { CoinFlipReturnReason } from "@/lib/social/notifications";
import { pairKey } from "@/lib/social/relation";
import type { LockRefusal } from "@/lib/referral/locks";
import { consumeWishlist } from "../collection/wishlist-core";
import { checkReferralLocks } from "../referral/locks";
import { sealedSeed, tableSeed } from "./seed";
import { chooseCopy, moveCopy } from "../collection/transfer";
import { recordDiscoveries } from "../collection/discovery";
import { blocksBetween, lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";

export type CoinFlipErrorCode = CoinFlipRefusal | LockRefusal | "NOT_FOUND" | "NO_USER" | "CARD_GONE" | "CHOOSE_COPY";

export class CoinFlipError extends Error {
  constructor(readonly code: CoinFlipErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 15_000 };

export type CoinFlipContext = {
  now: Date;
  rules: CasinoRules;
  /** Début du jour de jeu (fuseau game.timeZone) : borne du quota de lancers. */
  dayStart: Date;
  /** Registre des raretés (palier = sortOrder). */
  definitions: readonly { key: string; sortOrder: number }[];
  /** Octets aléatoires du serveur (crypto.randomBytes) ; les tests en injectent de fixes. */
  randomBytes: (n: number) => Uint8Array;
  /** Clé des graines scellées, dérivée d'AUTH_SECRET (server/casino/seed.ts) ; jamais en base. */
  seedKey: Uint8Array;
};

type LockedFlip = {
  id: string;
  status: CoinFlipStatus;
  creatorId: string;
  creatorUserCardId: string;
  creatorCardId: string;
  creatorSide: CoinSide;
  tierOrder: number;
  reservedForId: string | null;
  /** En clair : table jouée, ou posée avant le scellement des graines. */
  seed: string | null;
  /** Table scellée : la graine se retrouve avec la clé du serveur. */
  seedNonce: string | null;
  seedHash: string;
  expiresAt: Date;
};

async function lockFlip(tx: Tx, flipId: string): Promise<LockedFlip | null> {
  const [row] = await tx.$queryRaw<LockedFlip[]>`
    SELECT id, status::text AS status, "creatorId", "creatorUserCardId", "creatorCardId", "creatorSide"::text AS "creatorSide",
           "tierOrder", "reservedForId", seed, "seedNonce", "seedHash", "expiresAt"
    FROM "CoinFlip" WHERE id = ${flipId} FOR UPDATE`;
  return row ?? null;
}

async function staffRole(tx: Tx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  return isStaff(user?.role);
}

/**
 * Lancers du jour : tables posées (même retirées ensuite) et tables relevées. Lu sous le verrou du joueur, et sans
 * verrou par l'interface pour griser d'avance ce qui sera refusé (deps.ts).
 */
export async function flipsToday(tx: Tx, userId: string, dayStart: Date): Promise<number> {
  const [created, joined] = await Promise.all([
    tx.coinFlip.count({ where: { creatorId: userId, createdAt: { gte: dayStart } } }),
    tx.coinFlip.count({ where: { opponentId: userId, resolvedAt: { gte: dayStart } } }),
  ]);
  return created + joined;
}

/**
 * Exemplaires de la carte encore à l'abri : tous ceux du joueur sauf ceux déjà misés au casino. Le dernier
 * exemplaire (1) déclenche l'avertissement, même si d'autres sont déjà en jeu sur d'autres tables.
 */
function copiesOutsideCasino(tx: Tx, userId: string, cardId: string): Promise<number> {
  return tx.userCard.count({ where: { ownerId: userId, cardId, status: { not: "CASINO" } } });
}

/** Rend la carte misée à son créateur et ferme la table (statut final donné). */
async function returnStake(tx: Tx, flip: LockedFlip, status: "CANCELLED" | "EXPIRED", now: Date) {
  // La carte peut avoir disparu (compte supprimé entre-temps) : la table se ferme quand même
  await tx.userCard.updateMany({
    where: { id: flip.creatorUserCardId, ownerId: flip.creatorId, status: "CASINO" },
    data: { status: "COLLECTION" },
  });
  const closed = await tx.coinFlip.updateMany({ where: { id: flip.id, status: "OPEN" }, data: { status, resolvedAt: now } });
  if (closed.count !== 1) throw new CoinFlipError("NOT_OPEN");
  // L'invitation d'une table réservée n'a plus d'objet
  await tx.notification.deleteMany({ where: { type: "COINFLIP_INVITE", refId: flip.id } });
}

async function notifyReturned(tx: Tx, flip: LockedFlip, reason: CoinFlipReturnReason, actorId: string, now: Date) {
  await notify(tx, {
    userId: flip.creatorId,
    type: "COINFLIP_RETURNED",
    actorId,
    refId: flip.id,
    payload: { flipId: flip.id, cardId: flip.creatorCardId, reason },
    now,
  });
}

// --- Poser une table ---

export type CreateInput = {
  userId: string;
  cardId: string;
  /** Exemplaire désigné par le joueur : obligatoire pour miser une pièce spéciale (héritière ou gravée). */
  userCardId?: string | null;
  side: CoinSide;
  /** Table réservée à un ami ou à un ancien adversaire (revanche). */
  reservedForId?: string | null;
  /** Le joueur a confirmé l'avertissement du dernier exemplaire. */
  confirmLastCopy?: boolean;
};

export async function createTableWith(db: PrismaClient, input: CreateInput, ctx: CoinFlipContext, onNotified?: OnNotified): Promise<{ flipId: string }> {
  const { now, rules } = ctx;
  const reservedForId = input.reservedForId ?? null;
  return notifyingTransaction(
    db,
    async (tx) => {
      const players = await lockPlayers(tx, reservedForId ? [input.userId, reservedForId] : [input.userId]);
      const player = players.get(input.userId);
      if (!player) throw new CoinFlipError("NO_USER");
      const refusal = checkPlayer({ ...player, isAdmin: await staffRole(tx, input.userId) }, now, rules);
      if (refusal) throw new CoinFlipError(refusal);
      const locked = await checkReferralLocks(tx, { actorId: input.userId, counterpartyId: reservedForId, ownItems: true, mutual: true, now });
      if (locked) throw new CoinFlipError(locked);

      let reserve = null;
      if (reservedForId) {
        const target = players.get(reservedForId);
        if (!target || target.isGuest || target.bannedAt) throw new CoinFlipError("RESERVE_TARGET");
        const [friendship, blocks, pastFlips] = await Promise.all([
          tx.friendship.findUnique({ where: { pairKey: pairKey(input.userId, reservedForId) }, select: { status: true } }),
          blocksBetween(tx, input.userId, reservedForId),
          tx.coinFlip.count({
            where: {
              status: "DONE",
              OR: [
                { creatorId: input.userId, opponentId: reservedForId },
                { creatorId: reservedForId, opponentId: input.userId },
              ],
            },
          }),
        ]);
        reserve = {
          self: reservedForId === input.userId,
          eligible: friendship?.status === "ACCEPTED" || pastFlips > 0,
          blocked: blocks.byMe || blocks.byThem,
        };
      }

      const card = await tx.card.findUnique({ where: { id: input.cardId }, select: { rarity: true } });
      if (!card) throw new CoinFlipError("CARD_GONE");
      const tier = tierOf(card.rarity, ctx.definitions);
      if (tier === null) throw new CoinFlipError("RARITY");
      const [copies, openTables, today] = await Promise.all([
        copiesOutsideCasino(tx, input.userId, input.cardId),
        // Une table échue mais pas encore balayée ne compte plus (« Mes tables » ne l'affiche pas non plus)
        tx.coinFlip.count({ where: { creatorId: input.userId, status: "OPEN", expiresAt: { gt: now } } }),
        flipsToday(tx, input.userId, ctx.dayStart),
      ]);
      const blocked = checkCreate(
        { stake: { rarity: card.rarity, copies, confirmLastCopy: input.confirmLastCopy === true }, openTables, flipsToday: today, reserve },
        rules.coinflip,
      );
      if (blocked) throw new CoinFlipError(blocked);

      // Sans désignation, un exemplaire ordinaire : une pièce spéciale ne se mise jamais par défaut
      const choice = await chooseCopy(tx, input.userId, input.cardId, input.userCardId);
      if (!choice.ok) throw new CoinFlipError(choice.reason === "CHOOSE_COPY" ? "CHOOSE_COPY" : "CARD_GONE");
      const escrow = await tx.userCard.updateMany({
        where: { id: choice.id, ownerId: input.userId, status: "COLLECTION" },
        data: { status: "CASINO" },
      });
      if (escrow.count !== 1) throw new CoinFlipError("CARD_GONE");

      // Graine scellée : seuls le nonce et l'engagement vont en base, la graine n'y sera écrite qu'au lancer
      const seedNonce = seedHex(ctx.randomBytes(SEED_BYTES));
      const flip = await tx.coinFlip.create({
        data: {
          creatorId: input.userId,
          creatorUserCardId: choice.id,
          creatorCardId: input.cardId,
          creatorRarity: card.rarity,
          creatorSide: input.side,
          tierOrder: tier,
          reservedForId,
          seedNonce,
          seedHash: await commitOf(sealedSeed(ctx.seedKey, seedNonce)),
          expiresAt: coinFlipExpiresAt(now, rules.coinflip.expiryHours),
          createdAt: now,
        },
        select: { id: true },
      });
      if (reservedForId) {
        await notify(tx, {
          userId: reservedForId,
          type: "COINFLIP_INVITE",
          actorId: input.userId,
          refId: flip.id,
          payload: { flipId: flip.id, cardId: input.cardId, reason: null },
          now,
        });
      }
      return { flipId: flip.id };
    },
    TX,
    onNotified,
  );
}

// --- Relever une table ---

export type JoinInput = {
  userId: string;
  flipId: string;
  cardId: string;
  /** Exemplaire désigné par le joueur : obligatoire pour miser une pièce spéciale. */
  userCardId?: string | null;
  confirmLastCopy?: boolean;
};

export type JoinOutcome =
  | {
      ok: true;
      flipId: string;
      /** Créateur de la table : sa page d'attente est prévenue en temps réel, avant toute relecture. */
      creatorId: string;
      result: CoinSide;
      won: boolean;
      /** Carte remportée par le gagnant (celle du perdant) : badge « Nouveau », pastille de souhait. */
      prize: { cardId: string; userCardId: string; isNew: boolean; wished: boolean };
    }
  | { ok: false; code: "NOT_OPEN" };

/**
 * Relève une table avec une fuda du même palier : la pièce est lancée aussitôt. Une table expirée trouvée
 * ici est fermée (carte rendue, créateur prévenu) : ce changement est validé et la relève échoue (ok: false).
 */
export async function joinTableWith(db: PrismaClient, input: JoinInput, ctx: CoinFlipContext, onNotified?: OnNotified): Promise<JoinOutcome> {
  const { now, rules } = ctx;
  return notifyingTransaction(
    db,
    async (tx): Promise<JoinOutcome> => {
      const flip = await lockFlip(tx, input.flipId);
      if (!flip) throw new CoinFlipError("NOT_FOUND");
      if (flip.status !== "OPEN") throw new CoinFlipError("NOT_OPEN");
      if (isTableExpired(flip, now)) {
        await returnStake(tx, flip, "EXPIRED", now);
        await notifyReturned(tx, flip, "EXPIRED", flip.creatorId, now);
        return { ok: false, code: "NOT_OPEN" };
      }

      const players = await lockPlayers(tx, [flip.creatorId, input.userId]);
      const creator = players.get(flip.creatorId);
      const joiner = players.get(input.userId);
      if (!joiner) throw new CoinFlipError("NO_USER");
      const refusal = checkPlayer({ ...joiner, isAdmin: await staffRole(tx, input.userId) }, now, rules);
      if (refusal) throw new CoinFlipError(refusal);
      // Créateur banni ou supprimé entre-temps : ses tables sont retirées par withdrawCasinoWith
      if (!creator || creator.bannedAt) throw new CoinFlipError("NOT_OPEN");
      const locked = await checkReferralLocks(tx, { actorId: input.userId, counterpartyId: flip.creatorId, ownItems: true, mutual: true, now });
      if (locked) throw new CoinFlipError(locked);

      const [blocks, card, copies, today] = await Promise.all([
        blocksBetween(tx, input.userId, flip.creatorId),
        tx.card.findUnique({ where: { id: input.cardId }, select: { rarity: true } }),
        copiesOutsideCasino(tx, input.userId, input.cardId),
        flipsToday(tx, input.userId, ctx.dayStart),
      ]);
      if (!card) throw new CoinFlipError("CARD_GONE");
      const blocked = checkJoin(
        {
          table: flip,
          joinerId: input.userId,
          stakeTier: tierOf(card.rarity, ctx.definitions),
          stake: { rarity: card.rarity, copies, confirmLastCopy: input.confirmLastCopy === true },
          blocked: blocks.byMe || blocks.byThem,
          flipsToday: today,
          now,
        },
        rules.coinflip,
      );
      if (blocked) throw new CoinFlipError(blocked);

      const joinerChoice = await chooseCopy(tx, input.userId, input.cardId, input.userCardId);
      if (!joinerChoice.ok) throw new CoinFlipError(joinerChoice.reason === "CHOOSE_COPY" ? "CHOOSE_COPY" : "CARD_GONE");

      // La pièce : issue fixée par la graine tirée à la pose et l'id de la table. Une graine qui ne redonne pas
      // l'engagement (clé du serveur changée, copie de la base avec un autre AUTH_SECRET) ne se joue jamais :
      // le joueur ne pourrait pas vérifier le lancer.
      const seed = tableSeed(flip, ctx.seedKey);
      if (!seed || (await commitOf(seed)) !== flip.seedHash) throw new Error(`Graine de la table ${flip.id} illisible avec la clé du serveur`);
      const result = await flipOutcome(seed, flip.id);
      const winnerId = flipWinner(flip, input.userId, result);
      const creatorWins = winnerId === flip.creatorId;
      const prize = creatorWins
        ? { cardId: input.cardId, userCardId: joinerChoice.id }
        : { cardId: flip.creatorCardId, userCardId: flip.creatorUserCardId };
      const winnerKnew = await tx.discovery.findUnique({ where: { userId_cardId: { userId: winnerId, cardId: prize.cardId } }, select: { userId: true } });

      // Transferts conditionnels : la mise du créateur sort du séquestre, celle de l'adversaire de sa collection.
      // Chacune reste ou passe chez le gagnant ; un écart de compte annule tout. La mise perdue change de
      // main par moveCopy : héritage et numéro la suivent, « gardée par son propriétaire » repart de zéro.
      const stays = (id: string, ownerId: string, status: "CASINO" | "COLLECTION") =>
        tx.userCard.updateMany({ where: { id, ownerId, status }, data: { status: "COLLECTION" } }).then((r) => r.count === 1);
      const [fromEscrow, fromJoiner] = await Promise.all([
        creatorWins
          ? stays(flip.creatorUserCardId, flip.creatorId, "CASINO")
          : moveCopy(tx, { userCardId: flip.creatorUserCardId, fromId: flip.creatorId, fromStatus: "CASINO", toId: input.userId, via: "CASINO", now }),
        creatorWins
          ? moveCopy(tx, { userCardId: joinerChoice.id, fromId: input.userId, fromStatus: "COLLECTION", toId: flip.creatorId, via: "CASINO", now })
          : stays(joinerChoice.id, input.userId, "COLLECTION"),
      ]);
      if (!fromEscrow || !fromJoiner) throw new CoinFlipError("CARD_GONE");
      // La carte perdue quitte les vitrines de son ancien propriétaire
      await tx.showcaseItem.deleteMany({ where: { userCardId: prize.userCardId } });
      await recordDiscoveries(tx, [{ userId: winnerId, cardId: prize.cardId }], now);
      const wished = await consumeWishlist(tx, winnerId, [prize.cardId]);

      const done = await tx.coinFlip.updateMany({
        where: { id: flip.id, status: "OPEN" },
        data: {
          status: "DONE",
          opponentId: input.userId,
          opponentUserCardId: joinerChoice.id,
          opponentCardId: input.cardId,
          opponentRarity: card.rarity,
          result,
          // Révélée : chacun peut maintenant vérifier le lancer
          seed,
          winnerId,
          winnerNew: !winnerKnew,
          resolvedAt: now,
        },
      });
      if (done.count !== 1) throw new CoinFlipError("NOT_OPEN");
      await tx.notification.deleteMany({ where: { type: "COINFLIP_INVITE", refId: flip.id } });
      // Le créateur apprend que sa table est relevée, pas l'issue : il la découvre en rejouant la pièce
      await notify(tx, {
        userId: flip.creatorId,
        type: "COINFLIP_RESOLVED",
        actorId: input.userId,
        refId: flip.id,
        payload: { flipId: flip.id, cardId: flip.creatorCardId, reason: null },
        now,
      });
      return {
        ok: true,
        flipId: flip.id,
        creatorId: flip.creatorId,
        result,
        won: winnerId === input.userId,
        prize: { ...prize, isNew: !winnerKnew, wished: wished.size > 0 },
      };
    },
    TX,
    onNotified,
  );
}

// --- Retirer, décliner, retrait par l'admin ---

/** Le créateur retire sa table ouverte : la carte revient, sans notification. */
export async function cancelTableWith(db: PrismaClient, input: { userId: string; flipId: string }, ctx: Pick<CoinFlipContext, "now">) {
  await db.$transaction(async (tx) => {
    const flip = await lockFlip(tx, input.flipId);
    if (!flip || flip.creatorId !== input.userId) throw new CoinFlipError("NOT_FOUND");
    if (!canCancel(flip, input.userId)) throw new CoinFlipError("NOT_OPEN");
    await lockPlayers(tx, [flip.creatorId]);
    await returnStake(tx, flip, "CANCELLED", ctx.now);
  }, TX);
}

/**
 * Le joueur invité décline une table qui lui est réservée : le créateur récupère sa carte et en est prévenu.
 * Renvoie le créateur (sa page d'attente est prévenue en temps réel).
 */
export async function declineTableWith(
  db: PrismaClient,
  input: { userId: string; flipId: string },
  ctx: Pick<CoinFlipContext, "now">,
  onNotified?: OnNotified,
): Promise<{ creatorId: string }> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const flip = await lockFlip(tx, input.flipId);
      if (!flip || flip.reservedForId !== input.userId) throw new CoinFlipError("NOT_FOUND");
      if (!canDecline(flip, input.userId, ctx.now)) throw new CoinFlipError("NOT_OPEN");
      await lockPlayers(tx, [flip.creatorId, input.userId]);
      await returnStake(tx, flip, "CANCELLED", ctx.now);
      await notifyReturned(tx, flip, "DECLINED", input.userId, ctx.now);
      return { creatorId: flip.creatorId };
    },
    TX,
    onNotified,
  );
}

/** L'admin retire une table ouverte (motif au journal) : la carte revient, le créateur est prévenu. Renvoie le créateur. */
export async function adminCancelTableWith(
  db: PrismaClient,
  input: { adminId: string; flipId: string; reason: string },
  ctx: Pick<CoinFlipContext, "now">,
  onNotified?: OnNotified,
): Promise<{ creatorId: string }> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const flip = await lockFlip(tx, input.flipId);
      if (!flip) throw new CoinFlipError("NOT_FOUND");
      if (flip.status !== "OPEN") throw new CoinFlipError("NOT_OPEN");
      await lockPlayers(tx, [flip.creatorId]);
      await returnStake(tx, flip, "CANCELLED", ctx.now);
      await notifyReturned(tx, flip, "ADMIN", input.adminId, ctx.now);
      await tx.adminLog.create({
        data: {
          adminId: input.adminId,
          action: "COINFLIP_CANCEL",
          targetType: "CoinFlip",
          targetId: flip.id,
          before: { status: "OPEN", creatorId: flip.creatorId, cardId: flip.creatorCardId },
          after: { status: "CANCELLED", reason: input.reason },
          createdAt: ctx.now,
        },
      });
      return { creatorId: flip.creatorId };
    },
    TX,
    onNotified,
  );
}

// --- Balayages ---

/**
 * Ferme les tables ouvertes arrivées à échéance (cron, et paresseusement à la lecture) : carte rendue,
 * créateur prévenu. Idempotent ; deux balayages simultanés ne se gênent pas (SKIP LOCKED). `creatorId`
 * limite le balayage aux tables d'un joueur.
 */
export async function sweepCasinoWith(
  db: PrismaClient,
  ctx: Pick<CoinFlipContext, "now">,
  opts: { batch?: number; creatorId?: string } = {},
  onNotified?: OnNotified,
): Promise<number> {
  const batch = Math.max(1, Math.min(opts.batch ?? 100, 500));
  return notifyingTransaction(
    db,
    async (tx) => {
      const rows = opts.creatorId
        ? await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "CoinFlip"
            WHERE status = 'OPEN' AND "expiresAt" <= ${ctx.now} AND "creatorId" = ${opts.creatorId}
            ORDER BY "expiresAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED`
        : await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "CoinFlip"
            WHERE status = 'OPEN' AND "expiresAt" <= ${ctx.now}
            ORDER BY "expiresAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED`;
      let expired = 0;
      for (const { id } of rows) {
        const flip = await lockFlip(tx, id);
        if (!flip || !isTableExpired(flip, ctx.now)) continue;
        await returnStake(tx, flip, "EXPIRED", ctx.now);
        await notifyReturned(tx, flip, "EXPIRED", flip.creatorId, ctx.now);
        expired += 1;
      }
      return expired;
    },
    TX,
    onNotified,
  );
}

/**
 * Retire du casino un joueur banni, retiré du jeu ou anonymisé, dans la transaction appelante : ses tables
 * ouvertes sont fermées (carte rendue), sans notification (il n'y a plus personne à qui répondre). Celles qui lui
 * étaient réservées aussi : leur créateur récupère sa carte et en est prévenu (« WITHDRAWN »). Les tables sont
 * verrouillées ici : appeler avant de verrouiller des joueurs (même ordre qu'une relève : la table, puis les joueurs).
 */
export async function withdrawCasinoWith(tx: Tx, userId: string, now: Date): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CoinFlip"
    WHERE status = 'OPEN' AND ("creatorId" = ${userId} OR "reservedForId" = ${userId})
    ORDER BY id FOR UPDATE`;
  for (const { id } of rows) {
    const flip = await lockFlip(tx, id);
    if (flip?.status !== "OPEN") continue;
    await returnStake(tx, flip, "CANCELLED", now);
    if (flip.creatorId !== userId) await notifyReturned(tx, flip, "WITHDRAWN", flip.creatorId, now);
  }
  return rows.length;
}

/**
 * withdrawCasinoWith dans sa propre transaction (bannissement, demande de suppression, anonymisation). Le Web Push
 * des créateurs prévenus part après validation (`onNotified`) ; il signale aussi leur page de table en temps réel.
 */
export async function withdrawCasinoFor(db: PrismaClient, userId: string, now: Date, onNotified?: OnNotified): Promise<number> {
  return notifyingTransaction(db, (tx) => withdrawCasinoWith(tx, userId, now), TX, onNotified);
}

/**
 * Le créateur a vu ses lancers rejoués : ils ne repartent plus à son retour, et « X a relevé ta table » passe
 * en lu (la cloche ne garde pas une pastille pour un lancer déjà regardé).
 */
export async function markSeenWith(db: PrismaClient, input: { userId: string; flipIds: readonly string[]; now: Date }) {
  if (input.flipIds.length === 0) return 0;
  const ids = [...input.flipIds];
  const [{ count }] = await db.$transaction([
    db.coinFlip.updateMany({
      where: { id: { in: ids }, creatorId: input.userId, status: "DONE", creatorSeenAt: null },
      data: { creatorSeenAt: input.now },
    }),
    db.notification.updateMany({
      where: { userId: input.userId, type: "COINFLIP_RESOLVED", refId: { in: ids }, readAt: null },
      data: { readAt: input.now },
    }),
  ]);
  return count;
}
