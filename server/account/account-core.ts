// Droits RGPD du joueur (étape 10) : demande de suppression, annulation, anonymisation.
// Le client Prisma est injecté (serveur, cron ou test sur base réelle) : pas de server/db.ts ici.
//
// L'anonymisation efface ce qui désigne une personne (pseudo, e-mail, avatar, id Discord, sessions,
// liens sociaux, avis) mais garde le journal des Zeni, les cartes, les tirages, les combats et les
// ventes : l'économie reste juste et la somme des soldes ne bouge pas.
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { anonymizedUsername, deletionDueAt } from "@/lib/account/deletion";
import { leaveQueueWith } from "../battle/battle-core";
import { AuctionError, cancelAuctionWith } from "../market/auction-core";
import type { Tx } from "../social/lock";
import { writeAdminLog } from "../admin/log";

export type AccountErrorCode = "NO_USER" | "ALREADY_REQUESTED" | "NOT_REQUESTED" | "ANONYMIZED";

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
  }
}

const TX = { maxWait: 10_000, timeout: 20_000 };

type LockedAccount = { id: string; deletionRequestedAt: Date | null; anonymizedAt: Date | null };

async function lockAccount(tx: Tx, userId: string): Promise<LockedAccount | null> {
  const [row] = await tx.$queryRaw<LockedAccount[]>`
    SELECT id, "deletionRequestedAt", "anonymizedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return row ?? null;
}

/**
 * Demande de suppression : le compte est gelé (plus aucune écriture de jeu) jusqu'à l'anonymisation,
 * à `now + graceDays`. Les ventes sans mise sont retirées, la file de combat quittée, et les autres
 * appareils déconnectés (la session `keepSessionToken` reste, pour pouvoir annuler).
 */
export async function requestDeletionWith(
  db: PrismaClient,
  input: { userId: string; now: Date; graceDays: number; keepSessionToken?: string | null },
): Promise<{ dueAt: Date }> {
  const dueAt = deletionDueAt(input.now, input.graceDays);
  await db.$transaction(async (tx) => {
    const user = await lockAccount(tx, input.userId);
    if (!user) throw new AccountError("NO_USER");
    if (user.anonymizedAt) throw new AccountError("ANONYMIZED");
    if (user.deletionRequestedAt) throw new AccountError("ALREADY_REQUESTED");
    await tx.user.update({ where: { id: input.userId }, data: { deletionRequestedAt: input.now } });
    await tx.dataRequest.create({
      data: { userId: input.userId, kind: "DELETION", status: "PENDING", requestedAt: input.now, dueAt },
    });
    await tx.session.deleteMany({
      where: { userId: input.userId, ...(input.keepSessionToken ? { NOT: { sessionToken: input.keepSessionToken } } : {}) },
    });
  }, TX);

  await withdrawFromGame(db, input.userId, input.now);
  return { dueAt };
}

/** Ventes sans mise retirées (celles avec une mise vont à leur terme), file de combat quittée. */
async function withdrawFromGame(db: PrismaClient, userId: string, now: Date) {
  const open = await db.auction.findMany({
    where: { sellerId: userId, status: "ACTIVE", currentBidderId: null, endsAt: { gt: now } },
    select: { id: true },
  });
  for (const a of open) {
    try {
      await cancelAuctionWith(db, { sellerId: userId, auctionId: a.id, now });
    } catch (e) {
      // Une mise arrivée entre-temps : la vente suit son cours normal
      if (!(e instanceof AuctionError)) throw e;
    }
  }
  await leaveQueueWith(db, { userId });
}

/** Annule une demande en attente (par le joueur, ou par un admin : `adminId`). */
export async function cancelDeletionWith(
  db: PrismaClient,
  input: { userId: string; now: Date; adminId?: string | null },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await lockAccount(tx, input.userId);
    if (!user) throw new AccountError("NO_USER");
    if (user.anonymizedAt) throw new AccountError("ANONYMIZED");
    if (!user.deletionRequestedAt) throw new AccountError("NOT_REQUESTED");
    await tx.user.update({ where: { id: input.userId }, data: { deletionRequestedAt: null } });
    await tx.dataRequest.updateMany({
      where: { userId: input.userId, kind: "DELETION", status: "PENDING" },
      data: { status: "CANCELLED", processedAt: input.now, processedById: input.adminId ?? null },
    });
    if (input.adminId) {
      await writeAdminLog(tx, {
        adminId: input.adminId,
        action: "USER_DELETION_CANCEL",
        targetType: "User",
        targetId: input.userId,
        before: { deletionRequestedAt: user.deletionRequestedAt.toISOString() },
        after: { deletionRequestedAt: null },
      });
    }
  }, TX);
}

/**
 * Anonymise le compte, une seule fois (idempotent : false s'il l'était déjà). Appelé par le cron à
 * l'échéance, ou par un admin (`adminId`) avant l'échéance ou sans demande du joueur.
 */
export async function anonymizeUserWith(
  db: PrismaClient,
  input: { userId: string; now: Date; adminId?: string | null },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const user = await lockAccount(tx, input.userId);
    if (!user) throw new AccountError("NO_USER");
    if (user.anonymizedAt) return false;
    const before = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { username: true, role: true },
    });

    // Pseudo tiré au hasard ; une collision (improbable) en retire un autre
    let username = anonymizedUsername(randomBytes(8));
    while (await tx.user.findUnique({ where: { username }, select: { id: true } })) {
      username = anonymizedUsername(randomBytes(8));
    }

    await tx.user.update({
      where: { id: input.userId },
      data: {
        username,
        email: null,
        emailVerified: null,
        passwordHash: null,
        image: null,
        birthDate: null,
        role: "USER",
        profileVisibility: "PRIVATE",
        showCollection: false,
        battleTeam: [],
        anonymizedAt: input.now,
        deletionRequestedAt: user.deletionRequestedAt ?? input.now,
      },
    });
    const userId = input.userId;
    // Identité et accès
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.authToken.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    // Liens sociaux et contenus personnels
    await tx.notification.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } });
    await tx.friendship.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
    await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    await tx.wishlistEntry.deleteMany({ where: { userId } });
    await tx.showcaseSlot.deleteMany({ where: { userId } });
    await tx.review.deleteMany({ where: { userId } });
    await tx.tradeListing.updateMany({ where: { ownerId: userId, note: { not: null } }, data: { note: null } });
    await tx.auction.updateMany({ where: { sellerId: userId, note: { not: null } }, data: { note: null } });
    await tx.trade.updateMany({ where: { proposerId: userId, note: { not: null } }, data: { note: null } });
    await tx.trade.updateMany({ where: { recipientId: userId, declineNote: { not: null } }, data: { declineNote: null } });
    await tx.listingOffer.updateMany({ where: { listing: { ownerId: userId }, declineNote: { not: null } }, data: { declineNote: null } });
    await tx.battleQueue.deleteMany({ where: { userId } });

    await tx.dataRequest.updateMany({
      where: { userId, kind: "DELETION", status: "PENDING" },
      data: { status: "DONE", processedAt: input.now, processedById: input.adminId ?? null },
    });
    if (input.adminId) {
      await writeAdminLog(tx, {
        adminId: input.adminId,
        action: "USER_ANONYMIZE",
        targetType: "User",
        targetId: userId,
        // Pas d'e-mail ni d'id Discord dans le journal : il garderait ce qu'on vient d'effacer
        before: { role: before.role, hadPendingRequest: user.deletionRequestedAt !== null },
        after: { username },
      });
    }
    return true;
  }, TX);
}

/** Anonymise les demandes arrivées à échéance (cron quotidien), par lots, dans le budget de temps. */
export async function processDueDeletionsWith(
  db: PrismaClient,
  now: Date,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<{ anonymized: number; failed: number }> {
  const started = Date.now();
  const due = await db.dataRequest.findMany({
    where: { kind: "DELETION", status: "PENDING", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: opts.limit ?? 200,
    select: { userId: true },
  });
  const result = { anonymized: 0, failed: 0 };
  for (const { userId } of due) {
    if (Date.now() - started > (opts.budgetMs ?? 45_000)) break;
    try {
      if (await anonymizeUserWith(db, { userId, now })) result.anonymized++;
    } catch (e) {
      result.failed++;
      console.error("[account] anonymisation échouée", userId, e);
    }
  }
  return result;
}
