import { z } from "zod";
import { normalizeReviewBody, REVIEW_BODY_MAX, REVIEW_PAGE_SIZE } from "../social/reviews";

// Modération des avis (/admin/avis) : filtres, pagination et entrées des actions, sans base.

export const ADMIN_REVIEW_FILTERS = ["all", "visible", "hidden", "pinned"] as const;
export type AdminReviewFilter = (typeof ADMIN_REVIEW_FILTERS)[number];

export const ADMIN_REVIEW_PAGE_SIZE = 20;
/** Borne haute de la page demandée (au-delà, l'URL est bricolée). */
export const ADMIN_REVIEW_MAX_PAGE = 1000;

export function parseAdminReviewFilter(raw: unknown): AdminReviewFilter {
  const parsed = z.enum(ADMIN_REVIEW_FILTERS).safeParse(raw);
  return parsed.success ? parsed.data : "all";
}

/** Page 0-basée lue dans l'URL : entier borné, 0 par défaut. */
export function parseAdminReviewPage(raw: unknown): number {
  const n = typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number.parseInt(raw, 10) : 0;
  return Math.min(n, ADMIN_REVIEW_MAX_PAGE);
}

/** Condition Prisma correspondant au filtre. */
export function reviewWhere(filter: AdminReviewFilter): { hidden?: boolean; pinned?: boolean } {
  if (filter === "visible") return { hidden: false };
  if (filter === "hidden") return { hidden: true };
  if (filter === "pinned") return { pinned: true };
  return {};
}

export function pageCount(total: number, size: number = ADMIN_REVIEW_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Masquer ou réafficher un avis : l'id et l'état voulu, rien d'autre. */
export const setReviewHiddenSchema = z
  .object({
    reviewId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
    hidden: z.boolean(),
  })
  .strict();

/** Avis épinglés au plus : une page du carrousel, pour qu'ils tiennent tous sur la première. */
export const REVIEW_MAX_PINNED = REVIEW_PAGE_SIZE;

export const setReviewPinnedSchema = z
  .object({ reviewId: setReviewHiddenSchema.shape.reviewId, pinned: z.boolean() })
  .strict();

/** Réponse de l'équipe : texte brut normalisé comme un avis ; vide = retirer la réponse. */
export const replyReviewSchema = z
  .object({
    reviewId: setReviewHiddenSchema.shape.reviewId,
    reply: z
      .string()
      .max(REVIEW_BODY_MAX * 2)
      .transform(normalizeReviewBody)
      .pipe(z.string().max(REVIEW_BODY_MAX))
      .transform((v) => (v === "" ? null : v)),
  })
  .strict();
