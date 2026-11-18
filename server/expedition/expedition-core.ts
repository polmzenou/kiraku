// Expéditions (étape 14) : lancement, abandon, clôture, rappel par l'admin, catalogue par défaut.
// Client injecté (pas de server/db.ts ici) : le serveur passe prisma, les tests leur propre client.
// Chaque chemin verrouille d'abord la ligne du joueur (lockPlayers), puis l'expédition : une clôture
// (qui écrit le solde) et un abandon simultanés s'attendent au lieu de s'interbloquer.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { COPY_MARKS } from "@/lib/collection/copies";
import { pickLoanCopy } from "@/lib/social/gifts";
import { checkTeam, teamChances, toBasisPoints } from "@/lib/expedition/chance";
import { boardSeed, generateBoard } from "@/lib/expedition/offers";
import { outcomeFor, rewardsByOutcome, type RewardBundle } from "@/lib/expedition/rewards";
import { loreOf, parseSnapshot, snapshotSchema, type ExpeditionSnapshot } from "@/lib/expedition/snapshot";
import { parseLocalized } from "@/lib/boosters/types";
import { tierOf } from "@/lib/expedition/tiers";
import { DEFAULT_EXPEDITIONS, DEFAULT_EXPEDITION_BOOSTER_SLUG } from "@/lib/expedition/catalog";
import { ROLL_SCALE, type ExpeditionOutcome, type ExpeditionRisk, type ExpeditionRules } from "@/lib/expedition/types";
import type { Rng } from "@/lib/rng";
import { writeAdminLog } from "../admin/log";
import { grantBoosters, MAX_CREDIT_GRANT } from "../economy/credits";
import { credit } from "../economy/ledger";
import { grantLot, LotError, type LotDeps } from "../economy/lots";
import { lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";

export type ExpeditionErrorCode =
  | "DISABLED"
  | "NO_USER"
  | "BANNED"
  | "TEAM"
  | "ACTIVE"
  | "COOLDOWN"
  | "STALE"
  | "DONE"
  | "UNAVAILABLE"
  | "DISCOVERY"
  | "NOT_QUALIFIED"
  | "NOT_OWNED"
  | "NOT_FOUND"
  | "NO_BOOSTER";

export class ExpeditionError extends Error {
  constructor(
    readonly code: ExpeditionErrorCode,
    /** Fin de l'attente (COOLDOWN). */
    readonly until?: Date,
  ) {
    super(code);
  }
}

type Ordered = { key: string; sortOrder: number };

export type ExpeditionCtx = {
  now: Date;
  /** Jour en cours dans le fuseau du jeu (« 2026-11-16 »). */
  dayKey: string;
  rules: ExpeditionRules;
  definitions: readonly Ordered[];
  /** Aperçu admin : lancer même quand le jeu est coupé. */
  preview: boolean;
};

export type SettleDeps = { rng: Rng; lot: LotDeps };

const TX = { maxWait: 10_000, timeout: 20_000 };

// --- Offres du jour ---

/** Meilleur palier que le joueur peut envoyer (au moins une carte libre), null s'il n'a rien. */
export async function bestFreeTier(db: PrismaClient | Tx, userId: string, definitions: readonly Ordered[]): Promise<number | null> {
  const rows = await db.$queryRaw<{ rarity: string }[]>`
    SELECT DISTINCT c."rarityKey" AS rarity
    FROM "UserCard" uc JOIN "Card" c ON c.id = uc."cardId"
    WHERE uc."ownerId" = ${userId} AND uc.status = 'COLLECTION'`;
  let best: number | null = null;
  for (const r of rows) {
    const tier = tierOf(r.rarity, definitions);
    if (tier !== null && (best === null || tier > best)) best = tier;
  }
  return best;
}

/**
 * Offres du jour du joueur : relues si déjà tirées, sinon tirées (graine joueur + jour) et figées.
 * Un catalogue vide ne fige rien : les offres apparaîtront dès que l'admin aura installé des modèles.
 */
export async function ensureBoardWith(db: PrismaClient, userId: string, ctx: Pick<ExpeditionCtx, "now" | "dayKey" | "rules" | "definitions">): Promise<string[]> {
  const where = { userId_dayKey: { userId, dayKey: ctx.dayKey } };
  const existing = await db.expeditionBoard.findUnique({ where, select: { typeIds: true } });
  if (existing) return existing.typeIds;
  const [types, staffableTier] = await Promise.all([
    db.expeditionType.findMany({ where: { active: true }, select: { id: true, risk: true, minRarity: true, durationMinutes: true, weight: true } }),
    bestFreeTier(db, userId, ctx.definitions),
  ]);
  const candidates = types.flatMap((t) => {
    const tier = tierOf(t.minRarity, ctx.definitions);
    return tier === null ? [] : [{ id: t.id, risk: t.risk as ExpeditionRisk, tier, durationMinutes: t.durationMinutes, weight: t.weight }];
  });
  const typeIds = generateBoard(candidates, boardSeed(userId, ctx.dayKey), { offersPerDay: ctx.rules.offersPerDay, staffableTier });
  if (typeIds.length === 0) return [];
  // Deux premières lectures simultanées : la seconde garde le plateau de la première
  await db.expeditionBoard.createMany({ data: [{ userId, dayKey: ctx.dayKey, typeIds, createdAt: ctx.now }], skipDuplicates: true });
  return (await db.expeditionBoard.findUnique({ where, select: { typeIds: true } }))?.typeIds ?? typeIds;
}

/** Part du catalogue publié déjà découverte, en pourcentage (0 à 100, décimales comprises). */
export async function discoveryPctWith(db: PrismaClient | Tx, userId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ found: number; total: number }[]>`
    SELECT (SELECT COUNT(*)::int FROM "Discovery" d JOIN "Card" c ON c.id = d."cardId"
            WHERE d."userId" = ${userId} AND c.status = 'PUBLISHED') AS found,
           (SELECT COUNT(*)::int FROM "Card" WHERE status = 'PUBLISHED') AS total`;
  return row && row.total > 0 ? (100 * row.found) / row.total : 0;
}

// --- Lancement ---

export type LaunchInput = { userId: string; dayKey: string; slot: number; typeId: string; cardIds: readonly string[] };

/**
 * Exemplaires libres choisis comme pour le combat (le plus récent, hors vitrine si possible ; un ordinaire
 * d'abord, une pièce spéciale seulement s'il n'y a qu'elle), passés en EXPEDITION.
 */
async function lockCopies(tx: Tx, userId: string, cardIds: readonly string[]): Promise<string[]> {
  const copies = await tx.userCard.findMany({
    where: { ownerId: userId, cardId: { in: [...cardIds] }, status: "COLLECTION" },
    select: { id: true, cardId: true, obtainedAt: true, ...COPY_MARKS },
  });
  const shown = new Set(
    (await tx.showcaseItem.findMany({ where: { userCardId: { in: copies.map((c) => c.id) } }, select: { userCardId: true } })).map(
      (s) => s.userCardId,
    ),
  );
  const chosen = cardIds.map((cardId) => pickLoanCopy(copies.filter((c) => c.cardId === cardId), shown)?.id ?? null);
  if (chosen.some((id) => id === null)) throw new ExpeditionError("NOT_OWNED");
  const ids = chosen as string[];
  const reserved = await tx.userCard.updateMany({ where: { id: { in: ids }, ownerId: userId, status: "COLLECTION" }, data: { status: "EXPEDITION" } });
  if (reserved.count !== ids.length) throw new ExpeditionError("NOT_OWNED");
  return ids;
}

/** Rend les exemplaires partis : ce qui manque (retiré entre-temps par l'admin) est signalé, sans bloquer. */
async function releaseCopies(tx: Tx, userId: string, userCardIds: readonly string[], expeditionId: string) {
  if (userCardIds.length === 0) return;
  const back = await tx.userCard.updateMany({
    where: { id: { in: [...userCardIds] }, ownerId: userId, status: "EXPEDITION" },
    data: { status: "COLLECTION" },
  });
  if (back.count !== userCardIds.length) console.warn(`[expedition] ${expeditionId} : ${back.count}/${userCardIds.length} cartes rendues`);
}

/** Attente en cours après un abandon (la plus lointaine), ou null. */
export async function cooldownUntil(db: PrismaClient | Tx, userId: string, now: Date): Promise<Date | null> {
  const row = await db.expedition.findFirst({
    where: { userId, status: "ABANDONED", cooldownUntil: { gt: now } },
    orderBy: { cooldownUntil: "desc" },
    select: { cooldownUntil: true },
  });
  return row?.cooldownUntil ?? null;
}

export async function launchWith(db: PrismaClient, input: LaunchInput, ctx: ExpeditionCtx): Promise<{ id: string; endsAt: Date }> {
  if (!ctx.rules.enabled && !ctx.preview) throw new ExpeditionError("DISABLED");
  if (checkTeam(input.cardIds)) throw new ExpeditionError("TEAM");
  if (input.dayKey !== ctx.dayKey) throw new ExpeditionError("STALE");
  const { now } = ctx;

  try {
    return await db.$transaction(async (tx) => {
      const me = (await lockPlayers(tx, [input.userId])).get(input.userId);
      if (!me) throw new ExpeditionError("NO_USER");
      if (me.bannedAt) throw new ExpeditionError("BANNED");

      if (await tx.expedition.count({ where: { userId: input.userId, status: "ACTIVE" } })) throw new ExpeditionError("ACTIVE");
      const until = await cooldownUntil(tx, input.userId, now);
      if (until) throw new ExpeditionError("COOLDOWN", until);

      const board = await tx.expeditionBoard.findUnique({
        where: { userId_dayKey: { userId: input.userId, dayKey: ctx.dayKey } },
        select: { typeIds: true },
      });
      if (!board || board.typeIds[input.slot] !== input.typeId) throw new ExpeditionError("STALE");
      const done = await tx.expedition.count({
        where: { userId: input.userId, dayKey: ctx.dayKey, slot: input.slot, status: { not: "ABANDONED" } },
      });
      if (done > 0) throw new ExpeditionError("DONE");

      const type = await tx.expeditionType.findUnique({ where: { id: input.typeId } });
      if (!type || !type.active) throw new ExpeditionError("UNAVAILABLE");
      if (type.minDiscoveryPct > 0 && (await discoveryPctWith(tx, input.userId)) < type.minDiscoveryPct) {
        throw new ExpeditionError("DISCOVERY");
      }

      const cards = await tx.card.findMany({ where: { id: { in: [...input.cardIds] } }, select: { id: true, rarity: true } });
      const rarityOf = new Map(cards.map((c) => [c.id, c.rarity]));
      if (rarityOf.size !== input.cardIds.length) throw new ExpeditionError("NOT_OWNED");
      const team = input.cardIds.map((cardId) => ({ cardId, rarity: rarityOf.get(cardId)! }));
      const chances = teamChances(team, type, ctx.rules.cardBonus, ctx.definitions);
      if (!chances.qualifies) throw new ExpeditionError("NOT_QUALIFIED");

      const userCardIds = await lockCopies(tx, input.userId, input.cardIds);
      // Validée avant écriture : une photo illisible ne verserait rien à la clôture
      const snapshot: ExpeditionSnapshot = snapshotSchema.parse({
        v: 1,
        slug: type.slug,
        name: parseLocalized(type.name, type.slug),
        lore: loreOf(type.lore),
        minRarity: type.minRarity,
        risk: type.risk as ExpeditionRisk,
        durationMinutes: type.durationMinutes,
        boosterTypeId: type.boosterTypeId,
        extraLotId: type.extraLotId,
        rewards: rewardsByOutcome(type, ctx.rules),
        bonuses: chances.breakdown.map((c) => c.bonus),
      });
      const endsAt = new Date(now.getTime() + type.durationMinutes * 60_000);
      const row = await tx.expedition.create({
        data: {
          userId: input.userId,
          typeId: type.id,
          dayKey: ctx.dayKey,
          slot: input.slot,
          userCardIds,
          cardIds: [...input.cardIds],
          startedAt: now,
          endsAt,
          successPct: toBasisPoints(chances.success),
          triumphPct: toBasisPoints(chances.triumph),
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { id: row.id, endsAt };
    }, TX);
  } catch (e) {
    // Index uniques partiels : une autre requête a gagné la course (le verrou du joueur l'empêche normalement)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ExpeditionError("ACTIVE");
    throw e;
  }
}

// --- Clôture ---

export type SettleResult = { id: string; userId: string; outcome: ExpeditionOutcome; reward: RewardBundle };

const NOTHING: RewardBundle = { zeni: 0, boosters: 0, extraLot: false };

/** Clôt l'expédition si elle est rentrée (joueur déjà verrouillé) : tirage, gains, cartes rendues, notification. */
async function settleLocked(tx: Tx, id: string, now: Date, deps: SettleDeps): Promise<SettleResult | null> {
  const exp = await tx.expedition.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, endsAt: true, successPct: true, triumphPct: true, snapshot: true, userCardIds: true },
  });
  if (!exp || exp.status !== "ACTIVE" || exp.endsAt > now) return null;
  const roll = deps.rng(ROLL_SCALE);
  const outcome = outcomeFor(roll, exp.successPct, exp.triumphPct);
  const snapshot = parseSnapshot(exp.snapshot);
  if (!snapshot) console.error(`[expedition] ${id} : photo illisible, aucun gain versé`);
  const reward = snapshot?.rewards[outcome] ?? NOTHING;

  const closed = await tx.expedition.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "COMPLETED", outcome, roll, settledAt: now },
  });
  if (closed.count !== 1) return null;

  if (reward.zeni > 0) await credit(tx, { userId: exp.userId, amount: reward.zeni, reason: "EXPEDITION", refId: id, now });
  if (reward.boosters > 0 && snapshot) {
    // Un type de booster supprimé depuis le lancement ne bloque pas la clôture
    const type = await tx.boosterType.findUnique({ where: { id: snapshot.boosterTypeId }, select: { id: true } });
    if (type) await grantBoosters(tx, exp.userId, type.id, Math.min(reward.boosters, MAX_CREDIT_GRANT));
    else console.warn(`[expedition] ${id} : type de booster ${snapshot.boosterTypeId} introuvable`);
  }
  if (reward.extraLot && snapshot?.extraLotId) {
    try {
      const granted = await grantLot(tx, exp.userId, snapshot.extraLotId, { reason: "EXPEDITION", refId: id }, deps.lot, now);
      if (granted.cards.length > 0) {
        await tx.expedition.update({ where: { id }, data: { rewardCardIds: granted.cards.map((c) => c.cardId) } });
      }
    } catch (e) {
      if (!(e instanceof LotError)) throw e;
      console.warn(`[expedition] ${id} : lot bonus ${snapshot.extraLotId} supprimé`);
    }
  }
  await releaseCopies(tx, exp.userId, exp.userCardIds, id);
  await notify(tx, { userId: exp.userId, type: "EXPEDITION_RETURNED", actorId: exp.userId, refId: id, payload: { outcome }, now });
  return { id, userId: exp.userId, outcome, reward };
}

/** Clôture idempotente d'une expédition rentrée : null si elle ne l'est pas (encore en route, déjà close). */
export async function settleExpeditionWith(
  db: PrismaClient,
  id: string,
  now: Date,
  deps: SettleDeps,
  onNotified?: OnNotified,
): Promise<SettleResult | null> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const head = await tx.expedition.findUnique({ where: { id }, select: { userId: true } });
      if (!head) return null;
      await lockPlayers(tx, [head.userId]);
      return settleLocked(tx, id, now, deps);
    },
    TX,
    onNotified,
  );
}

/** Expéditions rentrées d'un joueur (affichage de la page, sondage de la cloche). */
export async function settleDueForWith(db: PrismaClient, userId: string, now: Date, deps: SettleDeps, onNotified?: OnNotified) {
  const due = await db.expedition.findMany({ where: { userId, status: "ACTIVE", endsAt: { lte: now } }, select: { id: true } });
  const results: SettleResult[] = [];
  for (const { id } of due) {
    const r = await settleExpeditionWith(db, id, now, deps, onNotified);
    if (r) results.push(r);
  }
  return results;
}

/** Balayage de toutes les expéditions rentrées (cron), par lots : une erreur n'arrête pas les autres. */
export async function sweepDueWith(db: PrismaClient, now: Date, limit: number, deps: SettleDeps, onNotified?: OnNotified) {
  const due = await db.expedition.findMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    orderBy: { endsAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let settled = 0;
  for (const { id } of due) {
    try {
      if (await settleExpeditionWith(db, id, now, deps, onNotified)) settled++;
    } catch (e) {
      console.error(`[expedition] clôture de ${id}`, e);
    }
  }
  return { due: due.length, settled };
}

// --- Abandon, révélation, rappel ---

export type AbandonResult = { state: "ABANDONED"; cooldownUntil: Date | null } | { state: "SETTLED"; result: SettleResult };

/** Le joueur arrête son expédition : cartes rendues, aucun gain, attente avant la suivante. Rentrée entre-temps : elle est close. */
export async function abandonWith(
  db: PrismaClient,
  input: { userId: string; expeditionId: string },
  ctx: Pick<ExpeditionCtx, "now" | "rules">,
  deps: SettleDeps,
  onNotified?: OnNotified,
): Promise<AbandonResult> {
  const { now } = ctx;
  return notifyingTransaction(
    db,
    async (tx) => {
      await lockPlayers(tx, [input.userId]);
      const exp = await tx.expedition.findFirst({
        where: { id: input.expeditionId, userId: input.userId },
        select: { id: true, status: true, endsAt: true, userCardIds: true },
      });
      if (!exp || exp.status !== "ACTIVE") throw new ExpeditionError("NOT_FOUND");
      if (exp.endsAt <= now) {
        const result = await settleLocked(tx, exp.id, now, deps);
        if (!result) throw new ExpeditionError("NOT_FOUND");
        return { state: "SETTLED" as const, result };
      }
      const hours = ctx.rules.abandonCooldownHours;
      const until = hours > 0 ? new Date(now.getTime() + hours * 3_600_000) : null;
      const stopped = await tx.expedition.updateMany({
        where: { id: exp.id, status: "ACTIVE" },
        data: { status: "ABANDONED", abandonedAt: now, cooldownUntil: until },
      });
      if (stopped.count !== 1) throw new ExpeditionError("NOT_FOUND");
      await releaseCopies(tx, input.userId, exp.userCardIds, exp.id);
      return { state: "ABANDONED" as const, cooldownUntil: until };
    },
    TX,
    onNotified,
  );
}

/** Résultat vu : la révélation ne se rejoue plus. */
export async function markRevealedWith(db: PrismaClient, input: { userId: string; expeditionId: string; now: Date }) {
  const res = await db.expedition.updateMany({
    where: { id: input.expeditionId, userId: input.userId, status: "COMPLETED", revealedAt: null },
    data: { revealedAt: input.now },
  });
  return res.count === 1;
}

/** Rappel par l'admin (modération) : cartes rendues sans gain ni attente, journal admin. */
export async function recallWith(db: PrismaClient, input: { adminId: string; expeditionId: string; now: Date }) {
  return db.$transaction(async (tx) => {
    const head = await tx.expedition.findUnique({ where: { id: input.expeditionId }, select: { userId: true } });
    if (!head) throw new ExpeditionError("NOT_FOUND");
    await lockPlayers(tx, [head.userId]);
    const exp = await tx.expedition.findUnique({
      where: { id: input.expeditionId },
      select: { id: true, userId: true, status: true, typeId: true, endsAt: true, userCardIds: true },
    });
    if (!exp || exp.status !== "ACTIVE") throw new ExpeditionError("NOT_FOUND");
    await tx.expedition.update({ where: { id: exp.id }, data: { status: "ABANDONED", abandonedAt: input.now, cooldownUntil: null } });
    await releaseCopies(tx, exp.userId, exp.userCardIds, exp.id);
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "EXPEDITION_RECALL",
      targetType: "Expedition",
      targetId: exp.id,
      before: { status: "ACTIVE", userId: exp.userId, typeId: exp.typeId, endsAt: exp.endsAt.toISOString() },
      after: { status: "ABANDONED" },
    });
  }, TX);
}

// --- Catalogue par défaut ---

/** Installe les modèles par défaut absents (par slug) et leurs lots bonus ; ne touche jamais un modèle existant. */
export async function seedCatalogWith(db: PrismaClient, input: { adminId: string; now: Date }): Promise<{ created: number; skipped: number }> {
  return db.$transaction(async (tx) => {
    const booster = await tx.boosterType.findUnique({ where: { slug: DEFAULT_EXPEDITION_BOOSTER_SLUG }, select: { id: true } });
    if (!booster) throw new ExpeditionError("NO_BOOSTER");
    const [existing, rarities] = await Promise.all([
      tx.expeditionType.findMany({ select: { slug: true } }),
      tx.rarityDefinition.findMany({ select: { key: true } }),
    ]);
    const taken = new Set(existing.map((t) => t.slug));
    const known = new Set(rarities.map((r) => r.key));
    let created = 0;
    let skipped = 0;
    for (const d of DEFAULT_EXPEDITIONS) {
      if (taken.has(d.slug) || !known.has(d.minRarity)) {
        skipped++;
        continue;
      }
      let extraLotId: string | null = null;
      if (d.extra && known.has(d.extra.rarity)) {
        const lot = await tx.lot.create({
          data: { name: d.extra.name, zeni: 0, items: { create: [{ kind: "RARITY_CARD", rarity: d.extra.rarity, quantity: d.extra.quantity }] } },
          select: { id: true },
        });
        extraLotId = lot.id;
      }
      await tx.expeditionType.create({
        data: {
          slug: d.slug,
          name: d.name,
          lore: d.lore,
          minRarity: d.minRarity,
          risk: d.risk,
          durationMinutes: d.durationMinutes,
          baseSuccessPct: d.baseSuccessPct,
          maxSuccessPct: d.maxSuccessPct,
          maxTriumphPct: d.maxTriumphPct,
          minDiscoveryPct: d.minDiscoveryPct,
          zeni: d.zeni,
          boosterTypeId: booster.id,
          boosters: d.boosters,
          extraLotId,
          weight: d.weight,
          sortOrder: d.sortOrder,
          createdAt: input.now,
        },
      });
      created++;
    }
    await writeAdminLog(tx, { adminId: input.adminId, action: "EXPEDITION_SEED", targetType: "ExpeditionType", after: { created, skipped } });
    return { created, skipped };
  }, TX);
}
