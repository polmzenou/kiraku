// Renaissance (prestige, étape 16), atomique. Le client Prisma est injecté (serveur ou test de concurrence) :
// pas de server/db.ts ici. Le serveur décide de tout : exemplaires qui partent, héritières, Zeni versés.
//
// Une seule transaction sous le verrou du joueur (SELECT … FOR UPDATE sur sa ligne User). Toute carte qui arrive
// chez lui prend un verrou de clé étrangère sur cette ligne, incompatible avec FOR UPDATE : rien n'entre pendant la
// renaissance, même par un chemin qui ne verrouille pas le joueur lui-même (clôture d'une enchère côté acheteur).
// Les retours en collection (fin de vente, table échue, fin de combat) sont couverts par les blocages et par le
// contrôle final : s'il reste au joueur autre chose que ses héritières, tout est annulé.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isFrozen } from "@/lib/account/deletion";
import type { RecycleValues } from "@/lib/collection/recycle";
import { eligibilityOf, type Eligibility } from "@/lib/prestige/eligibility";
import { heritageCap } from "@/lib/prestige/heritage";
import type { PeakStats } from "@/lib/prestige/peak";
import { nextRebirthAt, type PrestigeRules } from "@/lib/prestige/rules";
import { rebirthRawValue, rebirthZeni } from "@/lib/prestige/zeni";
import { credit } from "../economy/ledger";

type Tx = Prisma.TransactionClient;

export type RebirthErrorCode =
  | "NO_USER"
  | "GUEST"
  | "BANNED"
  | "FROZEN"
  | "STALE"
  | "TOO_SOON"
  | "BUSY"
  | "TOO_MANY"
  | "NOT_ELIGIBLE"
  | "KEEP_INVALID";

export class RebirthError extends Error {
  constructor(readonly code: RebirthErrorCode) {
    super(code);
  }
}

export type RebirthCtx = {
  now: Date;
  rules: PrestigeRules;
  /** collection.recycleValues : valeur de recyclage par rareté. */
  values: RecycleValues;
  /** Ordre du registre des raretés (affichage des seuils). */
  rarityOrder: readonly string[];
};

/** Héritières demandées : des exemplaires désignés (pièces spéciales), et des cartes dont on garde le plus ancien ordinaire. */
export type KeepRequest = { copyIds: readonly string[]; cardIds: readonly string[] };

export type Departed = { rarity: string; engraved: boolean; count: number };
export type LeavingEngraved = { id: string; cardId: string; printing: number; serial: number };

const TX = { maxWait: 10_000, timeout: 30_000 };
/** Verrou consultatif du rang global : deux renaissances simultanées ne prennent jamais le même. */
const RANK_LOCK = 740_216_001;

type LockedPlayer = {
  prestige: number;
  prestigedAt: Date | null;
  isGuest: boolean;
  bannedAt: Date | null;
  deletionRequestedAt: Date | null;
  anonymizedAt: Date | null;
};

export async function lockPlayer(tx: Tx, userId: string): Promise<LockedPlayer | null> {
  const [row] = await tx.$queryRaw<LockedPlayer[]>`
    SELECT prestige, "prestigedAt", "isGuest", "bannedAt", "deletionRequestedAt", "anonymizedAt"
    FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return row ?? null;
}

/** Compte qui ne peut ni renaître ni consacrer : invité, banni, gelé ou anonymisé. */
export function accountRefusal(player: Pick<LockedPlayer, "isGuest" | "bannedAt" | "deletionRequestedAt" | "anonymizedAt">): "GUEST" | "BANNED" | "FROZEN" | null {
  if (player.isGuest) return "GUEST";
  if (player.bannedAt) return "BANNED";
  if (isFrozen(player)) return "FROZEN";
  return null;
}

/** Ce qui interdit de renaître à ce joueur maintenant (hors blocages et seuils). */
export function playerRefusal(player: Omit<LockedPlayer, "prestige">, rules: Pick<PrestigeRules, "minDaysBetween">, now: Date): RebirthErrorCode | null {
  return accountRefusal(player) ?? (nextRebirthAt(player.prestigedAt, rules.minDaysBetween, now) ? "TOO_SOON" : null);
}

export type Busy = {
  /** Exemplaires hors de la collection, par statut (vente, combat, expédition, casino). */
  copies: { status: string; count: number }[];
  /** Annonces, offres et propositions d'échange que le joueur a lui-même ouvertes. */
  listings: number;
  offers: number;
  trades: number;
};

export const isBusy = (b: Busy) => b.copies.length > 0 || b.listings > 0 || b.offers > 0 || b.trades > 0;

/**
 * Ce qui empêche de renaître. Les propositions reçues ne bloquent pas : elles échouent d'elles-mêmes à
 * l'acceptation, comme aujourd'hui (et personne ne peut ainsi bloquer la renaissance d'un autre).
 */
export async function busyWith(db: Pick<Tx, "userCard" | "tradeListing" | "listingOffer" | "trade">, userId: string, now: Date): Promise<Busy> {
  const [copies, listings, offers, trades] = await Promise.all([
    db.userCard.groupBy({ by: ["status"], where: { ownerId: userId, status: { not: "COLLECTION" } }, _count: { _all: true } }),
    db.tradeListing.count({ where: { ownerId: userId, status: "OPEN", expiresAt: { gt: now } } }),
    db.listingOffer.count({ where: { bidderId: userId, status: "PENDING", listing: { status: "OPEN", expiresAt: { gt: now } } } }),
    db.trade.count({ where: { proposerId: userId, status: "PENDING", expiresAt: { gt: now } } }),
  ]);
  return { copies: copies.map((c) => ({ status: c.status, count: c._count._all })), listings, offers, trades };
}

/** Cartes distinctes publiées possédées, par rareté, contre les seuils réglés. */
export async function eligibilityWith(db: Pick<Tx, "$queryRaw">, userId: string, ctx: Pick<RebirthCtx, "rules" | "rarityOrder">): Promise<Eligibility> {
  const [published, owned] = await Promise.all([
    db.$queryRaw<{ rarity: string; n: number }[]>`
      SELECT "rarityKey" AS rarity, count(*)::int AS n FROM "Card" WHERE status = 'PUBLISHED' GROUP BY 1`,
    db.$queryRaw<{ rarity: string; n: number }[]>`
      SELECT c."rarityKey" AS rarity, COUNT(DISTINCT uc."cardId")::int AS n
      FROM "UserCard" uc JOIN "Card" c ON c.id = uc."cardId"
      WHERE uc."ownerId" = ${userId} AND c.status = 'PUBLISHED'
      GROUP BY 1`,
  ]);
  return eligibilityOf({
    order: ctx.rarityOrder,
    published: Object.fromEntries(published.map((r) => [r.rarity, r.n])),
    owned: Object.fromEntries(owned.map((r) => [r.rarity, r.n])),
    percent: ctx.rules.requiredPercent,
  });
}

/** Héritières désignées : les exemplaires choisis, et pour chaque carte cochée son plus ancien exemplaire ordinaire. */
async function resolveKeep(tx: Tx, userId: string, keep: KeepRequest, slots: number): Promise<string[]> {
  const copyIds = [...new Set(keep.copyIds)];
  const cardIds = [...new Set(keep.cardIds)];
  if (copyIds.length !== keep.copyIds.length || cardIds.length !== keep.cardIds.length) throw new RebirthError("KEEP_INVALID");
  if (copyIds.length + cardIds.length > slots) throw new RebirthError("KEEP_INVALID");
  const designated = copyIds.length
    ? await tx.userCard.count({ where: { id: { in: copyIds }, ownerId: userId, status: "COLLECTION" } })
    : 0;
  if (designated !== copyIds.length) throw new RebirthError("KEEP_INVALID");
  const picked = cardIds.length
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT ON ("cardId") id FROM "UserCard"
        WHERE "ownerId" = ${userId} AND status = 'COLLECTION' AND heritage = 0 AND printing IS NULL
          AND "cardId" = ANY(${cardIds}::text[]) AND id <> ALL(${copyIds}::text[])
        ORDER BY "cardId", "obtainedAt", id`
    : [];
  if (picked.length !== cardIds.length) throw new RebirthError("KEEP_INVALID");
  return [...copyIds, ...picked.map((p) => p.id)];
}

/** Gravées qui partiraient avec le reste (elles doivent être confirmées une à une). */
async function engravedLeaving(db: Pick<Tx, "$queryRaw">, userId: string, keepIds: readonly string[]): Promise<LeavingEngraved[]> {
  return db.$queryRaw<LeavingEngraved[]>`
    SELECT id, "cardId", printing, serial FROM "UserCard"
    WHERE "ownerId" = ${userId} AND status = 'COLLECTION' AND printing IS NOT NULL AND id <> ALL(${[...keepIds]}::text[])
    ORDER BY "cardId", printing, serial`;
}

/** Meilleur score du cycle qui se termine, photographié pour les cosmétiques (lib/prestige/peak.ts). */
async function peakStatsWith(tx: Tx, userId: string): Promise<PeakStats> {
  const [byRarity, completed, engraved, consecratedEngraved] = await Promise.all([
    tx.$queryRaw<{ rarity: string; n: number }[]>`
      SELECT c."rarityKey" AS rarity, COUNT(DISTINCT uc."cardId")::int AS n
      FROM "UserCard" uc JOIN "Card" c ON c.id = uc."cardId"
      WHERE uc."ownerId" = ${userId}
      GROUP BY 1`,
    tx.$queryRaw<{ id: string }[]>`
      WITH owned AS (SELECT DISTINCT "cardId" FROM "UserCard" WHERE "ownerId" = ${userId})
      SELECT c."seriesId" AS id
      FROM "Card" c LEFT JOIN owned o ON o."cardId" = c.id
      WHERE c.status = 'PUBLISHED'
      GROUP BY c."seriesId"
      HAVING COUNT(o."cardId") = COUNT(*) AND COUNT(*) > 0`,
    // Éditions gravées, sanctuaire compris : celles recyclées par cette renaissance restent acquises
    tx.userCard.count({ where: { ownerId: userId, printing: { not: null } } }),
    tx.consecratedCard.count({ where: { userId, printing: { not: null } } }),
  ]);
  return {
    uniqueCards: byRarity.reduce((sum, r) => sum + r.n, 0),
    byRarity: Object.fromEntries(byRarity.map((r) => [r.rarity, r.n])),
    completedSeries: completed.map((c) => c.id),
    printingsOwned: engraved + consecratedEngraved,
  };
}

export type RebirthPreview = {
  /** Exemplaires gardés, une fois les cartes cochées résolues. */
  keepIds: string[];
  departed: Departed[];
  /** Exemplaires qui partent. */
  leaving: number;
  zeni: number;
  engraved: LeavingEngraved[];
};

/** Récapitulatif d'une renaissance, sans rien écrire : ce qui part, les Zeni, les gravées à confirmer. */
export async function previewRebirthWith(db: PrismaClient, userId: string, keep: KeepRequest, ctx: RebirthCtx): Promise<RebirthPreview> {
  return db.$transaction(async (tx) => {
    const keepIds = await resolveKeep(tx, userId, keep, ctx.rules.keepSlots);
    const [departed, engraved] = await Promise.all([
      tx.$queryRaw<Departed[]>`
        SELECT c."rarityKey" AS rarity, (uc.printing IS NOT NULL) AS engraved, count(*)::int AS count
        FROM "UserCard" uc JOIN "Card" c ON c.id = uc."cardId"
        WHERE uc."ownerId" = ${userId} AND uc.status = 'COLLECTION' AND uc.id <> ALL(${keepIds}::text[])
        GROUP BY 1, 2`,
      engravedLeaving(tx, userId, keepIds),
    ]);
    const zeni = rebirthZeni(rebirthRawValue(departed, ctx.values, ctx.rules.recycleMultiplier), ctx.rules.zeniTiers, ctx.rules.zeniCap);
    return { keepIds, departed, leaving: departed.reduce((sum, d) => sum + d.count, 0), zeni, engraved };
  }, TX);
}

export type RebirthInput = {
  userId: string;
  /** Prestige que voit le joueur : un deuxième envoi trouve un autre nombre et échoue (STALE). */
  expectedPrestige: number;
  keep: KeepRequest;
  /** Zeni annoncés dans le récapitulatif. */
  expectedZeni: number;
  /** Gravées sacrifiées, confirmées une à une : le serveur compare à la sienne. */
  sacrificedEngraved: readonly string[];
};

export type RebirthHeir = { userCardId: string; cardId: string; before: number; after: number; printing: number | null; serial: number | null };

export type RebirthOutcome = {
  cycleId: string;
  prestige: number;
  globalRank: number;
  zeni: number;
  coins: number;
  departed: Departed[];
  heirs: RebirthHeir[];
};

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set(b).size === b.length && a.every((x) => b.includes(x));

/** La renaissance : une transaction, idempotente par `expectedPrestige`. */
export async function rebirthWith(db: PrismaClient, input: RebirthInput, ctx: RebirthCtx): Promise<RebirthOutcome> {
  const { userId } = input;
  const now = ctx.now;
  return db.$transaction(async (tx) => {
    const player = await lockPlayer(tx, userId);
    if (!player) throw new RebirthError("NO_USER");
    if (player.prestige !== input.expectedPrestige) throw new RebirthError("STALE");
    const refusal = playerRefusal(player, ctx.rules, now);
    if (refusal) throw new RebirthError(refusal);
    if (isBusy(await busyWith(tx, userId, now))) throw new RebirthError("BUSY");
    if ((await tx.userCard.count({ where: { ownerId: userId } })) > ctx.rules.maxCopies) throw new RebirthError("TOO_MANY");
    if (!(await eligibilityWith(tx, userId, ctx)).eligible) throw new RebirthError("NOT_ELIGIBLE");

    const keepIds = await resolveKeep(tx, userId, input.keep, ctx.rules.keepSlots);
    // Les gravées qui partent sont celles que le joueur a confirmées, ni plus ni moins
    const engraved = await engravedLeaving(tx, userId, keepIds);
    if (!sameSet(engraved.map((e) => e.id), input.sacrificedEngraved)) throw new RebirthError("STALE");
    const peak = await peakStatsWith(tx, userId);

    // Suppression et décompte en une seule requête : les Zeni correspondent exactement aux exemplaires partis
    const departed = await tx.$queryRaw<Departed[]>`
      WITH gone AS (
        DELETE FROM "UserCard" uc
        WHERE uc."ownerId" = ${userId} AND uc.status = 'COLLECTION' AND uc.id <> ALL(${keepIds}::text[])
        RETURNING uc."cardId", uc.printing
      )
      SELECT c."rarityKey" AS rarity, (g.printing IS NOT NULL) AS engraved, count(*)::int AS count
      FROM gone g JOIN "Card" c ON c.id = g."cardId"
      GROUP BY 1, 2`;
    const zeni = rebirthZeni(rebirthRawValue(departed, ctx.values, ctx.rules.recycleMultiplier), ctx.rules.zeniTiers, ctx.rules.zeniCap);
    // Le récapitulatif n'est plus à jour : tout est annulé, le joueur doit revoir ce qu'il confirme
    if (zeni !== input.expectedZeni) throw new RebirthError("STALE");

    // Héritières : un niveau de plus (plafonné), un prestige de plus traversé chez leur propriétaire
    const heirs = keepIds.length
      ? await tx.$queryRaw<RebirthHeir[]>`
          WITH old AS (
            SELECT id, heritage FROM "UserCard"
            WHERE id = ANY(${keepIds}::text[]) AND "ownerId" = ${userId} AND status = 'COLLECTION'
          )
          UPDATE "UserCard" uc
          SET heritage = LEAST(uc.heritage + 1, ${heritageCap(ctx.rules)}::int), "keptByOwner" = uc."keptByOwner" + 1
          FROM old WHERE uc.id = old.id
          RETURNING uc.id AS "userCardId", uc."cardId", old.heritage AS before, uc.heritage AS after, uc.printing, uc.serial`
      : [];
    if (heirs.length !== keepIds.length) throw new RebirthError("STALE");
    // Provenance : un exemplaire devenu spécial ici ouvre son histoire (les gravées ont la leur depuis leur tirage)
    const fresh = heirs.filter((h) => h.before === 0 && h.printing === null);
    if (fresh.length > 0) {
      await tx.userCardOwner.createMany({ data: fresh.map((h) => ({ userCardId: h.userCardId, ownerId: userId, via: "REBIRTH" as const, at: now })) });
    }

    // Retrouvailles : le nouveau cycle repart de zéro, les cartes des héritières y sont déjà
    await tx.discovery.updateMany({ where: { userId, regainedAt: { not: null } }, data: { regainedAt: null } });
    if (heirs.length > 0) {
      await tx.discovery.updateMany({ where: { userId, cardId: { in: [...new Set(heirs.map((h) => h.cardId))] } }, data: { regainedAt: now } });
    }

    // Rang global : n-ième renaissance de Kiraku, sous verrou consultatif (index unique en filet)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RANK_LOCK}::bigint)`;
    const [{ rank }] = await tx.$queryRaw<{ rank: number }[]>`SELECT (COALESCE(MAX("globalRank"), 0) + 1)::int AS rank FROM "PrestigeCycle"`;
    const cycleId = randomUUID();
    await tx.prestigeCycle.create({
      data: {
        id: cycleId,
        userId,
        number: player.prestige + 1,
        globalRank: rank,
        uniqueCards: peak.uniqueCards,
        zeni,
        heirs: heirs.map((h) => ({ userCardId: h.userCardId, cardId: h.cardId, heritage: h.after, printing: h.printing, serial: h.serial })),
        stats: peak,
        createdAt: now,
      },
    });
    const coins =
      zeni > 0
        ? await credit(tx, { userId, amount: zeni, reason: "REBIRTH", refId: cycleId, now })
        : (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } })).coins;
    const bumped = await tx.user.updateMany({ where: { id: userId, prestige: player.prestige }, data: { prestige: { increment: 1 }, prestigedAt: now } });
    if (bumped.count !== 1) throw new RebirthError("STALE");

    // Contrôle final : il ne reste au joueur que ses héritières
    if ((await tx.userCard.count({ where: { ownerId: userId } })) !== keepIds.length) throw new RebirthError("STALE");
    return { cycleId, prestige: player.prestige + 1, globalRank: rank, zeni, coins, departed, heirs };
  }, TX);
}
