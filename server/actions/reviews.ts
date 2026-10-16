"use server";

import { updateTag } from "next/cache";
import { isFrozen } from "@/lib/account/deletion";
import { canReview, reviewInputSchema } from "@/lib/social/reviews";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { REVIEWS_TAG } from "../social/reviews";
import { getCurrentUser } from "../user";

// Avis des joueurs. Ordre des contrôles : session → Zod → compte autorisé → rate limit. Un avis
// par joueur : le serveur choisit la ligne à écrire (celle du joueur connecté), le client n'envoie
// que la note et le texte.

export type ReviewActionError = "NO_SESSION" | "INVALID" | "FORBIDDEN" | "RATE_LIMITED" | "UNAVAILABLE";

export type SubmitReviewResult = { ok: true; rating: number; body: string } | { ok: false; error: ReviewActionError };

export async function submitReview(input: unknown): Promise<SubmitReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };

  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };

  // Invités et bannis exclus (anti-spam : il faut un compte lié)
  if (!canReview(user) || isFrozen(user)) return { ok: false, error: "FORBIDDEN" };

  if (!(await rateLimit(`review:${user.id}`, { limit: 5, windowSeconds: 600 })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const { rating, body } = parsed.data;
  try {
    // Champs choisis un par un ; `hidden` n'est jamais touché ici (la modération garde la main)
    await prisma.review.upsert({
      where: { userId: user.id },
      create: { userId: user.id, rating, body },
      update: { rating, body },
    });
  } catch (e) {
    console.error("[avis] submitReview", e);
    return { ok: false, error: "UNAVAILABLE" };
  }

  updateTag(REVIEWS_TAG);
  return { ok: true, rating, body };
}
