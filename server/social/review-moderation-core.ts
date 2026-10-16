// Modération des avis, atomique : masquer, épingler, répondre. Le client Prisma est injecté
// (serveur ou test sur base réelle). Chaque écriture verrouille la ligne de l'avis
// (SELECT … FOR UPDATE), relit l'état, puis écrit en SQL brut : `updatedAt` reste la date de
// l'avis du joueur (Prisma le changerait). Un double clic n'écrit qu'une ligne AdminLog.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "./lock";
import { writeAdminLog } from "../admin/log";

export type ReviewModerationCode = "NOT_FOUND" | "HIDDEN" | "PIN_LIMIT";

export class ReviewModerationError extends Error {
  constructor(readonly code: ReviewModerationCode) {
    super(code);
  }
}

type Row = { hidden: boolean; pinned: boolean; reply: string | null };

async function lockReview(tx: Tx, reviewId: string): Promise<Row> {
  const [row] = await tx.$queryRaw<Row[]>`
    SELECT "hidden", "pinned", "reply" FROM "Review" WHERE "id" = ${reviewId} FOR UPDATE`;
  if (!row) throw new ReviewModerationError("NOT_FOUND");
  return row;
}

async function log(tx: Tx, adminId: string, action: string, reviewId: string, before: object, after: object) {
  await writeAdminLog(tx, { adminId, action, targetType: "Review", targetId: reviewId, before, after });
}

/** Masque (et désépingle) ou réaffiche. true si l'état a changé, false s'il était déjà celui demandé. */
export async function setReviewHiddenWith(
  db: PrismaClient,
  { adminId, reviewId, hidden }: { adminId: string; reviewId: string; hidden: boolean },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const row = await lockReview(tx, reviewId);
    if (row.hidden === hidden) return false;
    if (hidden) {
      await tx.$executeRaw`
        UPDATE "Review" SET "hidden" = true, "pinned" = false, "pinnedAt" = NULL WHERE "id" = ${reviewId}`;
    } else {
      await tx.$executeRaw`UPDATE "Review" SET "hidden" = false WHERE "id" = ${reviewId}`;
    }
    await log(tx, adminId, hidden ? "REVIEW_HIDE" : "REVIEW_SHOW", reviewId, { hidden: row.hidden, pinned: row.pinned }, {
      hidden,
      pinned: hidden ? false : row.pinned,
    });
    return true;
  });
}

/**
 * Épingle en tête du carrousel (avis visible seulement, `maxPinned` au plus) ou désépingle.
 * Un verrou consultatif sérialise les épinglages : deux admins ne dépassent pas la limite à deux.
 */
export async function setReviewPinnedWith(
  db: PrismaClient,
  { adminId, reviewId, pinned, maxPinned, now }: { adminId: string; reviewId: string; pinned: boolean; maxPinned: number; now: Date },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    if (pinned) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kiraku:review-pins'))`;
    const row = await lockReview(tx, reviewId);
    if (row.pinned === pinned) return false;
    if (pinned) {
      if (row.hidden) throw new ReviewModerationError("HIDDEN");
      const [{ count }] = await tx.$queryRaw<[{ count: number }]>`
        SELECT COUNT(*)::int AS "count" FROM "Review" WHERE "pinned" = true`;
      if (count >= maxPinned) throw new ReviewModerationError("PIN_LIMIT");
      await tx.$executeRaw`UPDATE "Review" SET "pinned" = true, "pinnedAt" = ${now} WHERE "id" = ${reviewId}`;
    } else {
      await tx.$executeRaw`UPDATE "Review" SET "pinned" = false, "pinnedAt" = NULL WHERE "id" = ${reviewId}`;
    }
    await log(tx, adminId, pinned ? "REVIEW_PIN" : "REVIEW_UNPIN", reviewId, { pinned: row.pinned }, { pinned });
    return true;
  });
}

/** Réponse de l'équipe sous l'avis (texte déjà normalisé), ou null pour la retirer. */
export async function setReviewReplyWith(
  db: PrismaClient,
  { adminId, reviewId, reply, now }: { adminId: string; reviewId: string; reply: string | null; now: Date },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const row = await lockReview(tx, reviewId);
    if (row.reply === reply) return false;
    if (reply === null) {
      await tx.$executeRaw`UPDATE "Review" SET "reply" = NULL, "repliedAt" = NULL WHERE "id" = ${reviewId}`;
    } else {
      await tx.$executeRaw`UPDATE "Review" SET "reply" = ${reply}, "repliedAt" = ${now} WHERE "id" = ${reviewId}`;
    }
    await log(tx, adminId, reply === null ? "REVIEW_REPLY_DELETE" : "REVIEW_REPLY", reviewId, { reply: row.reply }, { reply });
    return true;
  });
}
