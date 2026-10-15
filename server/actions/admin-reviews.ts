"use server";

import { refresh, updateTag } from "next/cache";
import type { z } from "zod";
import { REVIEW_MAX_PINNED, replyReviewSchema, setReviewHiddenSchema, setReviewPinnedSchema } from "@/lib/admin/reviews";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import {
  ReviewModerationError,
  setReviewHiddenWith,
  setReviewPinnedWith,
  setReviewReplyWith,
} from "../social/review-moderation-core";
import { REVIEWS_TAG } from "../social/reviews";

// Modération des avis depuis /admin/avis. Ordre : rôle admin → Zod → rate limit → transaction
// avec une ligne AdminLog (server/social/review-moderation-core.ts). Le client n'envoie que l'id
// de l'avis et l'état voulu (ou le texte de la réponse).

export type AdminReviewError = "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "HIDDEN" | "PIN_LIMIT" | "UNAVAILABLE";

export type AdminReviewResult = { ok: true } | { ok: false; error: AdminReviewError };

/**
 * Contrôles communs puis écriture : session admin → Zod → rate limit → transaction. Le carrousel
 * et la moyenne de l'accueil (en cache) sont invalidés si l'écriture a changé quelque chose.
 */
async function moderate<T>(
  input: unknown,
  schema: z.ZodType<T>,
  label: string,
  write: (adminId: string, data: T) => Promise<boolean>,
): Promise<AdminReviewResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  try {
    if (await write(admin.id, parsed.data)) updateTag(REVIEWS_TAG);
  } catch (e) {
    if (e instanceof ReviewModerationError) return { ok: false, error: e.code };
    console.error(`[admin avis] ${label}`, e);
    return { ok: false, error: "UNAVAILABLE" };
  }
  refresh();
  return { ok: true };
}

/** Masque un avis (il quitte le carrousel et la moyenne, et perd son épingle) ou le réaffiche. */
export async function setReviewHiddenAction(input: unknown): Promise<AdminReviewResult> {
  return moderate(input, setReviewHiddenSchema, "setReviewHidden", (adminId, { reviewId, hidden }) =>
    setReviewHiddenWith(prisma, { adminId, reviewId, hidden }),
  );
}

/** Épingle un avis visible en tête du carrousel de l'accueil, ou le désépingle. */
export async function setReviewPinnedAction(input: unknown): Promise<AdminReviewResult> {
  return moderate(input, setReviewPinnedSchema, "setReviewPinned", (adminId, { reviewId, pinned }) =>
    setReviewPinnedWith(prisma, { adminId, reviewId, pinned, maxPinned: REVIEW_MAX_PINNED, now: new Date() }),
  );
}

/** Réponse de l'équipe affichée sous l'avis ; un texte vide la retire. */
export async function replyToReviewAction(input: unknown): Promise<AdminReviewResult> {
  return moderate(input, replyReviewSchema, "replyToReview", (adminId, { reviewId, reply }) =>
    setReviewReplyWith(prisma, { adminId, reviewId, reply, now: new Date() }),
  );
}
