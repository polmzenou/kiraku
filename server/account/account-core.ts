// Droits RGPD du joueur (étape 10) : demande de suppression, annulation, anonymisation.
// Le client Prisma est injecté (serveur, cron ou test sur base réelle) : pas de server/db.ts ici.
//
// L'anonymisation efface ce qui désigne une personne (pseudo, e-mail, avatar, id Discord, sessions,
// liens sociaux, avis, bio, messages privés, et leurs copies dans le journal de l'équipe et les bilans de
// saison) mais garde le journal des Zeni, les cartes, les tirages, les combats et les ventes : l'économie
// reste juste et la somme des soldes ne bouge pas.
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { anonymizedUsername, deletionDueAt } from "@/lib/account/deletion";
import { dropQueueSeatInTx, leaveQueueWith } from "../battle/battle-core";
import { withdrawCasinoFor } from "../casino/coinflip-core";
import { forgetKyaraImportsFor } from "../kyara/import-core";
import { keepRefereeFingerprints } from "../referral/fingerprint";
import { AuctionError, cancelAuctionWith } from "../market/auction-core";
import type { Tx } from "../social/lock";
import { writeAdminLog } from "../admin/log";
import { requeueLinkedDiscordRoleWith } from "../discord/linked-role-queue";

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
    // Compte gelé : le rôle Discord « vérifié » est retiré dans la minute
    await requeueLinkedDiscordRoleWith(tx, input.userId, input.now);
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

/**
 * Ventes sans mise retirées (celles avec une mise vont à leur terme), file de combat quittée, tables de
 * pile ou face fermées (cartes rendues).
 */
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
  await withdrawCasinoFor(db, userId, now);
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
    await requeueLinkedDiscordRoleWith(tx, input.userId, input.now); // rôle Discord « vérifié » rendu
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
 * l'échéance, ou par un admin (`adminId`) avant l'échéance ou sans demande du joueur. `fingerprintKey` : clé des
 * empreintes du parrainage v2, gardées avant d'effacer l'e-mail et le Discord (null : rien n'est gardé, tests).
 */
export async function anonymizeUserWith(
  db: PrismaClient,
  input: { userId: string; now: Date; adminId?: string | null; fingerprintKey: Buffer | null },
): Promise<boolean> {
  // Tables du casino fermées avant de verrouiller le compte (ordre des verrous d'une relève : la table, puis le joueur)
  await withdrawCasinoFor(db, input.userId, input.now);
  // File de combat quittée de même (cartes engagées rendues) : un appariement en cours attend le joueur, pas l'inverse
  await leaveQueueWith(db, { userId: input.userId });
  return db.$transaction(async (tx) => {
    const user = await lockAccount(tx, input.userId);
    if (!user) throw new AccountError("NO_USER");
    if (user.anonymizedAt) return false;
    const before = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { username: true, role: true },
    });

    // Filleul : e-mail et Discord du moment gardés en empreintes avant d'être effacés
    if (input.fingerprintKey) await keepRefereeFingerprints(tx, input.userId, input.fingerprintKey);

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
        // Texte saisi par le joueur, code perso de parrainage (souvent son nom : /i/CODE menait encore au compte),
        // accord des titres (dit le genre choisi)
        bio: null,
        vanityCode: null,
        titleAgreement: "MASC",
        battleTeam: [],
        // Hors du classé : plus de place dans les positions, le top du Grand Champion, les divisions ni le bilan de saison
        rankPoints: 0,
        seasonPeakPc: 0,
        seasonPeakGrand: false,
        seasonGames: 0,
        rankProtection: 0,
        lastSeenAt: null,
        appearOffline: false,
        anonymizedAt: input.now,
        deletionRequestedAt: user.deletionRequestedAt ?? input.now,
      },
    });
    const userId = input.userId;
    // Rôle Discord « vérifié » retiré dans la minute : la file est relancée tant que le lien Discord est encore lisible
    await requeueLinkedDiscordRoleWith(tx, userId, input.now);
    // Identité et accès
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.authToken.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.userSignal.deleteMany({ where: { userId } }); // IP et appareils (multi-comptes)
    // Empreinte d'IP des paliers de lanternes de l'Ennichi (SHA-256 sans secret d'une IPv4 : réversible) ; le palier reste
    await tx.ennichiTierGrant.updateMany({ where: { userId, ipHash: { not: null } }, data: { ipHash: null } });
    await forgetKyaraImportsFor(tx, userId, input.now); // import Kyara : le verrou d'un import versé reste
    // Liens sociaux et contenus personnels
    await tx.notification.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } });
    await tx.friendship.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
    await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    await tx.wishlistEntry.deleteMany({ where: { userId } });
    await tx.deck.deleteMany({ where: { userId } }); // noms saisis par le joueur
    await tx.showcaseSlot.deleteMany({ where: { userId } }); // ancienne vitrine unique
    await tx.showcase.deleteMany({ where: { userId } }); // noms saisis par le joueur, cartes en cascade
    await tx.showcaseEventEntry.deleteMany({ where: { userId } }); // vitrine engagée à l'event vitrines, ses votes en cascade
    await tx.showcaseEventVote.deleteMany({ where: { voterId: userId } });
    await tx.review.deleteMany({ where: { userId } });
    // Messages privés (purgés après chat.retentionHours) : ceux qu'il a écrits comme ceux qu'il a reçus
    await tx.chatMessage.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } });
    await tx.tradeListing.updateMany({ where: { ownerId: userId, note: { not: null } }, data: { note: null } });
    await tx.auction.updateMany({ where: { sellerId: userId, note: { not: null } }, data: { note: null } });
    await tx.trade.updateMany({ where: { proposerId: userId, note: { not: null } }, data: { note: null } });
    await tx.trade.updateMany({ where: { recipientId: userId, declineNote: { not: null } }, data: { declineNote: null } });
    await tx.listingOffer.updateMany({ where: { listing: { ownerId: userId }, declineNote: { not: null } }, data: { declineNote: null } });
    // Place reprise depuis la sortie de file ci-dessus : supprimée, et ses trois cartes engagées reviennent en collection
    await dropQueueSeatInTx(tx, userId);
    // Provenance des exemplaires spéciaux : le joueur y devient « compte supprimé », chez lui comme chez les autres
    await tx.userCardOwner.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
    // Copies hors de sa ligne : journal de l'équipe et bilans de saison figés
    await scrubAdminLogs(tx, userId);
    await scrubSeasonSnapshots(tx, before.username);

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

// Clés du journal de l'équipe qui recopient ce qui désigne le joueur : pseudo (renommage), e-mail, code perso de
// parrainage. L'action, sa date, ses chiffres et le motif de l'équipe restent.
const ADMIN_LOG_IDENTITY_KEYS = ["username", "email", "code"];

/**
 * Journal de l'équipe (AdminLog) : retire de `before` et `after` (et de `after.values`, forme de la fiche joueur) les
 * copies de son identité dans les lignes qui le visent, et les textes qu'il avait saisis (note du Marché, nom d'une
 * vitrine de l'event) dans les lignes de modération qui le citent comme auteur.
 */
async function scrubAdminLogs(tx: Tx, userId: string) {
  await tx.$executeRaw`
    UPDATE "AdminLog" SET
      "before" = CASE WHEN jsonb_typeof("before") = 'object' THEN "before" - ${ADMIN_LOG_IDENTITY_KEYS}::text[] ELSE "before" END,
      "after" = CASE
        WHEN "after" IS NULL OR jsonb_typeof("after") <> 'object' THEN "after"
        WHEN jsonb_typeof("after" -> 'values') = 'object'
          THEN jsonb_set("after" - ${ADMIN_LOG_IDENTITY_KEYS}::text[], '{values}', ("after" -> 'values') - ${ADMIN_LOG_IDENTITY_KEYS}::text[])
        ELSE "after" - ${ADMIN_LOG_IDENTITY_KEYS}::text[]
      END
    WHERE "targetType" = 'User' AND "targetId" = ${userId}`;
  await tx.$executeRaw`
    UPDATE "AdminLog" SET "before" = "before" - 'note'
    WHERE "targetType" IN ('Auction', 'TradeListing') AND jsonb_typeof("before") = 'object' AND "before" ->> 'authorId' = ${userId}`;
  await tx.$executeRaw`
    UPDATE "AdminLog" SET "before" = "before" - 'name'
    WHERE "targetType" = 'ShowcaseEventEntry' AND jsonb_typeof("before") = 'object' AND "before" ->> 'userId' = ${userId}`;
}

/**
 * Bilans de saison figés à la clôture (top 10 des profils publics, posté sur Discord) : sa ligne en sort, avec son
 * pseudo et son avatar Discord (qui porte l'id de son compte). Repéré par le pseudo du moment, faute d'id dans la photo.
 */
async function scrubSeasonSnapshots(tx: Tx, username: string) {
  const seasons = await tx.season.findMany({
    where: { leaderboardSnapshot: { not: Prisma.DbNull } },
    select: { id: true, leaderboardSnapshot: true },
  });
  for (const season of seasons) {
    const snapshot = season.leaderboardSnapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Array.isArray(snapshot.entries)) continue;
    const entries = snapshot.entries.filter(
      (e) => !(e && typeof e === "object" && !Array.isArray(e) && e.username === username),
    );
    if (entries.length === snapshot.entries.length) continue;
    await tx.season.update({ where: { id: season.id }, data: { leaderboardSnapshot: { ...snapshot, entries } } });
  }
}

/** Anonymise les demandes arrivées à échéance (cron quotidien), par lots, dans le budget de temps. */
export async function processDueDeletionsWith(
  db: PrismaClient,
  now: Date,
  opts: { limit?: number; budgetMs?: number; fingerprintKey: Buffer | null },
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
      if (await anonymizeUserWith(db, { userId, now, fingerprintKey: opts.fingerprintKey })) result.anonymized++;
    } catch (e) {
      result.failed++;
      console.error("[account] anonymisation échouée", userId, e);
    }
  }
  return result;
}
