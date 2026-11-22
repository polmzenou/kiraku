// Import Kyara (étape 17) : cœurs serveur, client Prisma injecté (serveur, tests en base). Notre serveur n'appelle
// jamais Kyara : la collection arrive par le favori de l'équipe (lib/kyara/payload.ts) et tout est revérifié ici.
// Ordre des verrous partout : le joueur (lockPlayers), puis la demande (FOR UPDATE) — comme l'anonymisation.
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { isFrozen } from "@/lib/account/deletion";
import { discordIdFromAvatarUrl } from "@/lib/discord/avatar";
import type { KyaraRejectCode } from "@/lib/kyara/codes";
import { parseSnapshot, snapshotOf, type KyaraPayload } from "@/lib/kyara/payload";
import { planKyaraImport, type KyaraEntry, type KyaraPlan, type KyaraPlanInput } from "@/lib/kyara/plan";
import { kyaraProfileUrl } from "@/lib/kyara/profile-url";
import type { KyaraRules } from "@/lib/kyara/rules";
import { importSummary } from "@/lib/kyara/summary";
import { kyaraEligibility, type KyaraIneligibility } from "@/lib/kyara/window";
import { parseSetting } from "@/lib/settings/defaults";
import { writeAdminLog } from "../admin/log";
import { recordDiscoveries } from "../collection/discovery";
import { consumeWishlist } from "../collection/wishlist-core";
import { credit } from "../economy/ledger";
import { lockPlayers, type Tx } from "../social/lock";
import { notify, notifyingTransaction, type OnNotified } from "../social/notify";
import { hashNonce, newNonce } from "./nonce";

export type KyaraErrorCode =
  | KyaraIneligibility
  | "OWN_STAFF_PROFILE"
  | "ALREADY_REQUESTED"
  | "ALREADY_DONE"
  | "DISCORD_ALREADY_USED"
  | "KYARA_ALREADY_IMPORTED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "NOT_READY"
  | "SELF"
  | "NONCE_INVALID"
  | "NONCE_EXPIRED"
  | "NONCE_OTHER_STAFF"
  | "UUID_MISMATCH"
  | "DISCORD_MISMATCH"
  | "DISCORD_UNVERIFIED"
  | "KYARA_TAKEN"
  | "PLAYER_UNAVAILABLE"
  | "SNAPSHOT_INVALID"
  | "STALE"
  | "NOT_REJECTABLE"
  | "NOT_REOPENABLE";

export class KyaraImportError extends Error {
  constructor(readonly code: KyaraErrorCode) {
    super(code);
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

const TX = { maxWait: 10_000, timeout: 20_000 };
// Jusqu'à quelques milliers de cartes en une fois
const APPLY_TX = { maxWait: 10_000, timeout: 60_000 };
const ACTIVE = ["PENDING", "READY", "DONE"] as const;
const NO_NONCE = { nonceHash: null, nonceById: null, nonceExpiresAt: null };
/** Ce que la purge efface d'un import versé : la photo et ce qui vient de Kyara ; restent les ids et les totaux. */
const PURGED = { snapshot: Prisma.DbNull, kyaraUsername: null, kyaraAvatarUrl: null, kyaraDiscordId: null };
const CREATE_BATCH = 1_000;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

type LockedImport = {
  id: string;
  userId: string | null;
  status: string;
  discordId: string;
  kyaraUserId: string;
  nonceHash: string | null;
  nonceById: string | null;
  nonceExpiresAt: Date | null;
  snapshot: unknown;
};

/** Verrouille le joueur de la demande, puis la demande, et la relit après les deux verrous. */
async function lockRequest(tx: Tx, importId: string): Promise<LockedImport> {
  const peek = await tx.kyaraImport.findUnique({ where: { id: importId }, select: { userId: true } });
  if (!peek) throw new KyaraImportError("NOT_FOUND");
  if (peek.userId) await lockPlayers(tx, [peek.userId]);
  const [row] = await tx.$queryRaw<LockedImport[]>`
    SELECT id, "userId", status::text AS status, "discordId", "kyaraUserId", "nonceHash", "nonceById", "nonceExpiresAt", snapshot
    FROM "KyaraImport" WHERE id = ${importId} FOR UPDATE`;
  if (!row) throw new KyaraImportError("NOT_FOUND");
  return row;
}

/** Ce que le plan doit savoir, lu sans cache (valeurs exactes dans une transaction). */
export async function loadPlanInput(db: Db, userId: string, entries: readonly KyaraEntry[]): Promise<KyaraPlanInput> {
  const ids = entries.map((e) => e.anilistId);
  const [cards, definitions, settings] = await Promise.all([
    // Cartes de base seulement : une variante n'a pas d'anilistId
    db.card.findMany({ where: { anilistId: { in: ids } }, select: { id: true, anilistId: true, rarity: true, status: true } }),
    db.rarityDefinition.findMany({ select: { key: true, sortOrder: true } }),
    db.gameSetting.findMany({
      where: { key: { in: ["kyaraImport.zeniByRarity", "kyaraImport.zeniCap", "collection.recycleValues"] } },
      select: { key: true, value: true },
    }),
  ]);
  const owned = await db.userCard.findMany({
    where: { ownerId: userId, cardId: { in: cards.map((c) => c.id) } },
    distinct: ["cardId"],
    select: { cardId: true },
  });
  const raw = new Map(settings.map((s) => [s.key, s.value]));
  return {
    entries,
    catalog: new Map(cards.flatMap((c) => (c.anilistId === null ? [] : [[c.anilistId, { cardId: c.id, rarity: c.rarity, published: c.status === "PUBLISHED" }] as const]))),
    owned: new Set(owned.map((o) => o.cardId)),
    sortOrder: new Map(definitions.map((d) => [d.key, d.sortOrder])),
    zeniByCode: parseSetting("kyaraImport.zeniByRarity", raw.get("kyaraImport.zeniByRarity")),
    zeniCap: parseSetting("kyaraImport.zeniCap", raw.get("kyaraImport.zeniCap")),
    recycleValues: parseSetting("collection.recycleValues", raw.get("collection.recycleValues")),
  };
}

// --- Joueur ---------------------------------------------------------------------------------------------------

export async function requestImportWith(
  db: PrismaClient,
  input: { userId: string; kyaraUserId: string; rules: KyaraRules; staff: boolean; now: Date },
): Promise<{ id: string }> {
  try {
    return await db.$transaction(async (tx) => {
      await lockPlayers(tx, [input.userId]);
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { isGuest: true, registeredAt: true, createdAt: true, bannedAt: true, deletionRequestedAt: true, anonymizedAt: true },
      });
      if (!user) throw new KyaraImportError("UNAVAILABLE");
      const discord = await tx.account.findFirst({ where: { userId: input.userId, provider: "discord" }, select: { providerAccountId: true } });
      const e = kyaraEligibility(
        {
          isGuest: user.isGuest,
          registeredAt: user.registeredAt,
          createdAt: user.createdAt,
          discordLinked: discord !== null,
          unavailable: user.bannedAt !== null || isFrozen(user),
          staff: input.staff,
        },
        input.rules,
        input.now.getTime(),
      );
      if (!e.ok) throw new KyaraImportError(e.reason);
      if (!discord) throw new KyaraImportError("NO_DISCORD");
      if (input.kyaraUserId === input.rules.staffKyaraUserId) throw new KyaraImportError("OWN_STAFF_PROFILE");

      const mine = await tx.kyaraImport.findFirst({ where: { userId: input.userId, status: { in: [...ACTIVE] } }, select: { status: true } });
      if (mine) throw new KyaraImportError(mine.status === "DONE" ? "ALREADY_DONE" : "ALREADY_REQUESTED");
      const discordId = discord.providerAccountId;
      if ((await tx.kyaraImport.count({ where: { discordId, status: { in: [...ACTIVE] } } })) > 0) throw new KyaraImportError("DISCORD_ALREADY_USED");
      if ((await tx.kyaraImport.count({ where: { kyaraUserId: input.kyaraUserId, status: { in: ["READY", "DONE"] } } })) > 0) {
        throw new KyaraImportError("KYARA_ALREADY_IMPORTED");
      }
      return tx.kyaraImport.create({
        data: {
          userId: input.userId,
          discordId,
          kyaraUserId: input.kyaraUserId,
          requestedAt: input.now,
          deadlineAt: e.deadline === null ? null : new Date(e.deadline),
        },
        select: { id: true },
      });
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e)) throw new KyaraImportError("CONFLICT");
    throw e;
  }
}

export async function cancelImportWith(db: PrismaClient, input: { userId: string; importId: string; now: Date }): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockPlayers(tx, [input.userId]);
    const { count } = await tx.kyaraImport.updateMany({
      where: { id: input.importId, userId: input.userId, status: "PENDING" },
      data: { status: "CANCELLED", closedAt: input.now, ...NO_NONCE },
    });
    if (count === 1) return;
    const row = await tx.kyaraImport.findFirst({ where: { id: input.importId, userId: input.userId }, select: { status: true } });
    throw new KyaraImportError(row ? "NOT_PENDING" : "NOT_FOUND");
  }, TX);
}

// --- Équipe -----------------------------------------------------------------------------------------------------

/** Lien de traitement : le profil Kyara du joueur avec un code à usage unique, lié à ce membre de l'équipe. */
export async function prepareProcessingWith(
  db: PrismaClient,
  input: { staffId: string; importId: string; nonceMinutes: number; now: Date },
): Promise<{ url: string; expiresAt: Date }> {
  return db.$transaction(async (tx) => {
    const row = await lockRequest(tx, input.importId);
    if (row.status !== "PENDING") throw new KyaraImportError("NOT_PENDING");
    if (row.userId === input.staffId) throw new KyaraImportError("SELF");
    const { nonce, hash } = newNonce();
    const expiresAt = new Date(input.now.getTime() + input.nonceMinutes * 60_000);
    // Un seul lien actif par demande : « Traiter » de nouveau remplace le précédent
    await tx.kyaraImport.update({ where: { id: row.id }, data: { nonceHash: hash, nonceById: input.staffId, nonceExpiresAt: expiresAt } });
    await writeAdminLog(tx, {
      adminId: input.staffId,
      action: "KYARA_IMPORT_PREPARE",
      targetType: "KyaraImport",
      targetId: row.id,
      after: { expiresAt: expiresAt.toISOString() },
    });
    return { url: `${kyaraProfileUrl(row.kyaraUserId)}#kiraku=${nonce}`, expiresAt };
  }, TX);
}

/**
 * Collection lue sur Kyara par l'équipe : le code doit être celui de la demande, préparé par ce membre et encore
 * valable ; le profil, celui de la demande ; l'ID Discord de l'avatar, celui du joueur (sans ID dans l'avatar :
 * confirmation explicite de l'équipe). Un refus ne consomme pas le code ; une réussite le consomme.
 */
export async function receivePayloadWith(
  db: PrismaClient,
  input: { staffId: string; payload: KyaraPayload; confirmWithoutDiscord: boolean; now: Date },
): Promise<{ importId: string; discordVerified: boolean }> {
  const hash = hashNonce(input.payload.nonce);
  try {
    return await db.$transaction(async (tx) => {
      const peek = await tx.kyaraImport.findUnique({ where: { nonceHash: hash }, select: { id: true } });
      if (!peek) throw new KyaraImportError("NONCE_INVALID");
      const row = await lockRequest(tx, peek.id);
      if (row.nonceHash !== hash) throw new KyaraImportError("NONCE_INVALID");
      if (row.nonceById !== input.staffId) throw new KyaraImportError("NONCE_OTHER_STAFF");
      if (!row.nonceExpiresAt || row.nonceExpiresAt.getTime() <= input.now.getTime()) throw new KyaraImportError("NONCE_EXPIRED");
      if (row.status !== "PENDING") throw new KyaraImportError("NOT_PENDING");
      if (row.userId === input.staffId) throw new KyaraImportError("SELF");
      const p = input.payload;
      if (p.kyaraUserId !== row.kyaraUserId) throw new KyaraImportError("UUID_MISMATCH");
      const kyaraDiscordId = discordIdFromAvatarUrl(p.avatarUrl);
      if (kyaraDiscordId !== null && kyaraDiscordId !== row.discordId) throw new KyaraImportError("DISCORD_MISMATCH");
      if (kyaraDiscordId === null && !input.confirmWithoutDiscord) throw new KyaraImportError("DISCORD_UNVERIFIED");

      await tx.kyaraImport.update({
        where: { id: row.id },
        data: {
          status: "READY",
          snapshot: snapshotOf(p.entries),
          snapshotCards: p.entries.length,
          snapshotCopies: p.copies,
          snapshotTotal: p.total,
          bookmarkletBuild: p.build,
          kyaraUsername: p.pseudo,
          kyaraAvatarUrl: p.avatarUrl,
          kyaraDiscordId,
          discordVerified: kyaraDiscordId !== null,
          // Heure du navigateur de l'équipe : jamais dans le futur
          readAt: p.readAt.getTime() > input.now.getTime() ? input.now : p.readAt,
          receivedAt: input.now,
          receivedById: input.staffId,
          ...NO_NONCE,
        },
      });
      await writeAdminLog(tx, {
        adminId: input.staffId,
        action: "KYARA_IMPORT_RECEIVE",
        targetType: "KyaraImport",
        targetId: row.id,
        after: { cards: p.entries.length, copies: p.copies, total: p.total, build: p.build, discordVerified: kyaraDiscordId !== null },
      });
      return { importId: row.id, discordVerified: kyaraDiscordId !== null };
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e)) throw new KyaraImportError("KYARA_TAKEN");
    throw e;
  }
}

/** Aperçu d'une demande lue (READY), recalculé à chaque affichage ; null si elle n'est pas (ou plus) lisible. */
export async function previewImportWith(db: PrismaClient, importId: string): Promise<{ userId: string; plan: KyaraPlan } | null> {
  const row = await db.kyaraImport.findUnique({ where: { id: importId }, select: { userId: true, status: true, snapshot: true } });
  if (!row || row.status !== "READY" || !row.userId) return null;
  const entries = parseSnapshot(row.snapshot);
  if (!entries) return null;
  return { userId: row.userId, plan: planKyaraImport(await loadPlanInput(db, row.userId, entries)) };
}

/**
 * Versement, exactement une fois : recalculé sous verrou, refusé (STALE) s'il diffère de l'aperçu validé par
 * l'équipe. Cartes de base en collection, découvertes marquées importées, liste de souhaits servie, Zeni des
 * cartes converties, notification au joueur.
 */
export async function applyImportWith(
  db: PrismaClient,
  input: { staffId: string; importId: string; expectedCards: number; expectedZeni: number; now: Date },
  onNotified?: OnNotified,
): Promise<{ cards: number; zeni: number }> {
  return notifyingTransaction(
    db,
    async (tx) => {
      const row = await lockRequest(tx, input.importId);
      if (row.status === "DONE") throw new KyaraImportError("ALREADY_DONE");
      if (row.status !== "READY") throw new KyaraImportError("NOT_READY");
      if (!row.userId) throw new KyaraImportError("PLAYER_UNAVAILABLE");
      if (row.userId === input.staffId) throw new KyaraImportError("SELF");
      const userId = row.userId;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { bannedAt: true, deletionRequestedAt: true, anonymizedAt: true } });
      if (!user || user.bannedAt !== null || isFrozen(user)) throw new KyaraImportError("PLAYER_UNAVAILABLE");
      const entries = parseSnapshot(row.snapshot);
      if (!entries) throw new KyaraImportError("SNAPSHOT_INVALID");

      const planInput = await loadPlanInput(tx, userId, entries);
      const plan = planKyaraImport(planInput);
      if (plan.grant.length !== input.expectedCards || plan.zeni !== input.expectedZeni) throw new KyaraImportError("STALE");

      const done = await tx.kyaraImport.updateMany({
        where: { id: row.id, status: "READY" },
        data: {
          status: "DONE",
          grantedCards: plan.grant.length,
          grantedZeni: plan.zeni,
          zeniRaw: plan.zeniRaw,
          summary: importSummary(plan, planInput.sortOrder),
          appliedAt: input.now,
          appliedById: input.staffId,
          closedAt: input.now,
        },
      });
      if (done.count !== 1) throw new KyaraImportError("ALREADY_DONE");

      const cardIds = plan.grant.map((g) => g.cardId);
      if (cardIds.length > 0) {
        await consumeWishlist(tx, userId, cardIds);
        for (let i = 0; i < cardIds.length; i += CREATE_BATCH) {
          await tx.userCard.createMany({
            data: cardIds.slice(i, i + CREATE_BATCH).map((cardId) => ({ id: randomUUID(), ownerId: userId, cardId, obtainedAt: input.now })),
          });
        }
        await recordDiscoveries(
          tx,
          cardIds.map((cardId) => ({ userId, cardId })),
          input.now,
          { imported: true },
        );
      }
      if (plan.zeni > 0) await credit(tx, { userId, amount: plan.zeni, reason: "KYARA_IMPORT", refId: row.id, now: input.now });
      await notify(tx, {
        userId,
        type: "KYARA_IMPORT_DONE",
        actorId: userId,
        refId: row.id,
        payload: { kind: "DONE", cards: cardIds.length, zeni: plan.zeni },
        now: input.now,
      });
      await writeAdminLog(tx, {
        adminId: input.staffId,
        action: "KYARA_IMPORT_APPLY",
        targetType: "KyaraImport",
        targetId: row.id,
        after: { userId, cards: cardIds.length, zeni: plan.zeni, zeniRaw: plan.zeniRaw },
      });
      return { cards: cardIds.length, zeni: plan.zeni };
    },
    APPLY_TX,
    onNotified,
  );
}

export async function rejectImportWith(
  db: PrismaClient,
  input: { staffId: string; importId: string; code: KyaraRejectCode; note: string | null; now: Date },
  onNotified?: OnNotified,
): Promise<void> {
  await notifyingTransaction(
    db,
    async (tx) => {
      const row = await lockRequest(tx, input.importId);
      if (row.status !== "PENDING" && row.status !== "READY") throw new KyaraImportError("NOT_REJECTABLE");
      if (row.userId === input.staffId) throw new KyaraImportError("SELF");
      await tx.kyaraImport.update({
        where: { id: row.id },
        data: {
          status: "REJECTED",
          rejectCode: input.code,
          rejectNote: input.note,
          rejectedAt: input.now,
          rejectedById: input.staffId,
          closedAt: input.now,
          snapshot: Prisma.DbNull,
          ...NO_NONCE,
        },
      });
      if (row.userId) {
        await notify(tx, {
          userId: row.userId,
          type: "KYARA_IMPORT_REJECTED",
          actorId: row.userId,
          refId: row.id,
          payload: { kind: "REJECTED", code: input.code },
          now: input.now,
        });
      }
      await writeAdminLog(tx, {
        adminId: input.staffId,
        action: "KYARA_IMPORT_REJECT",
        targetType: "KyaraImport",
        targetId: row.id,
        after: { code: input.code, note: input.note },
      });
    },
    TX,
    onNotified,
  );
}

/** Refus annulé (erreur de l'équipe, ami ajouté entre-temps) : la demande repart en attente. */
export async function reopenImportWith(db: PrismaClient, input: { staffId: string; importId: string; now: Date }): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const row = await lockRequest(tx, input.importId);
      if (row.status !== "REJECTED") throw new KyaraImportError("NOT_REOPENABLE");
      if (!row.userId) throw new KyaraImportError("PLAYER_UNAVAILABLE");
      if (row.userId === input.staffId) throw new KyaraImportError("SELF");
      await tx.kyaraImport.update({
        where: { id: row.id },
        data: { status: "PENDING", rejectCode: null, rejectNote: null, rejectedAt: null, rejectedById: null, closedAt: null, reopenCount: { increment: 1 } },
      });
      await writeAdminLog(tx, { adminId: input.staffId, action: "KYARA_IMPORT_REOPEN", targetType: "KyaraImport", targetId: row.id });
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e)) throw new KyaraImportError("CONFLICT");
    throw e;
  }
}

/** Lecture à refaire (collection incomplète, mauvais compte lu) : la demande lue repart en attente, photo effacée. */
export async function rereadImportWith(db: PrismaClient, input: { staffId: string; importId: string; now: Date }): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await lockRequest(tx, input.importId);
    if (row.status !== "READY") throw new KyaraImportError("NOT_READY");
    if (row.userId === input.staffId) throw new KyaraImportError("SELF");
    await tx.kyaraImport.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        snapshot: Prisma.DbNull,
        snapshotCards: null,
        snapshotCopies: null,
        snapshotTotal: null,
        bookmarkletBuild: null,
        kyaraUsername: null,
        kyaraAvatarUrl: null,
        kyaraDiscordId: null,
        discordVerified: null,
        readAt: null,
        receivedAt: null,
        receivedById: null,
      },
    });
    await writeAdminLog(tx, { adminId: input.staffId, action: "KYARA_IMPORT_REREAD", targetType: "KyaraImport", targetId: row.id });
  }, TX);
}

// --- Entretien et RGPD ------------------------------------------------------------------------------------------

/**
 * Cron quotidien : refus et annulations oubliés après retentionDays jours, imports versés purgés (photo, pseudo et
 * avatar Kyara ; restent les ids et les totaux, qui verrouillent), liens expirés vidés, demandes d'un compte
 * supprimé annulées.
 */
export async function purgeKyaraImportsWith(db: PrismaClient, input: { now: Date; retentionDays: number }) {
  const before = new Date(input.now.getTime() - input.retentionDays * 86_400_000);
  const [deleted, purged, nonces, orphans] = await db.$transaction([
    db.kyaraImport.deleteMany({ where: { status: { in: ["REJECTED", "CANCELLED"] }, closedAt: { lt: before } } }),
    db.kyaraImport.updateMany({ where: { status: "DONE", closedAt: { lt: before }, purgedAt: null }, data: { ...PURGED, purgedAt: input.now } }),
    db.kyaraImport.updateMany({ where: { nonceExpiresAt: { lt: input.now } }, data: NO_NONCE }),
    db.kyaraImport.updateMany({
      where: { userId: null, status: { in: ["PENDING", "READY"] } },
      data: { status: "CANCELLED", closedAt: input.now, snapshot: Prisma.DbNull, ...NO_NONCE },
    }),
  ]);
  return { deleted: deleted.count, purged: purged.count, nonces: nonces.count, orphans: orphans.count };
}

/**
 * Anonymisation ou suppression du compte (le joueur est déjà verrouillé) : les demandes non versées disparaissent,
 * un import versé est purgé mais garde ses ids, pour que ce compte Kyara et ce Discord ne servent plus jamais.
 */
export async function forgetKyaraImportsFor(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx.kyaraImport.deleteMany({ where: { userId, status: { not: "DONE" } } });
  await tx.kyaraImport.updateMany({ where: { userId, status: "DONE", purgedAt: null }, data: { ...PURGED, purgedAt: now } });
}
