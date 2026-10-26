import "server-only";
import { unstable_cache } from "next/cache";
import { decorFromColumns, type PlayerDecor } from "@/lib/profile/decor";
import { averageRating } from "@/lib/social/reviews";
import { prisma } from "../db";
import { decorColumns, type DecorColumns } from "../profile/decor";

// Avis des joueurs pour l'accueil. La page est dynamique (nonce CSP) : on met en cache un
// échantillon tiré au hasard (avis épinglés toujours inclus, en tête), que le carrousel remélange
// côté client à chaque visite. Toute
// écriture d'avis appelle updateTag(REVIEWS_TAG). Seuls des champs publics sortent d'ici.

export const REVIEWS_TAG = "reviews";
const SAMPLE_SIZE = 60;

export type PublicReview = {
  id: string;
  rating: number;
  body: string;
  /** ISO : unstable_cache sérialise en JSON. */
  updatedAt: string;
  username: string;
  image: string | null;
  isGuest: boolean;
  /** Épinglé par la modération : toujours en tête du carrousel. */
  pinned: boolean;
  /** Réponse de l'équipe, texte brut. */
  reply: string | null;
  decor: PlayerDecor;
};

export type ReviewSummary = { average: number | null; count: number };

// Avis visibles d'auteurs non bannis : épinglés d'abord (date d'épinglage), puis au hasard
const loadSample = unstable_cache(
  async (): Promise<PublicReview[]> => {
    const rows = await prisma.$queryRaw<(Omit<PublicReview, "updatedAt" | "decor"> & DecorColumns & { updatedAt: Date })[]>`
      SELECT r."id", r."rating", r."body", r."updatedAt", r."pinned", r."reply", u."username", u."image", u."isGuest", ${decorColumns}
      FROM "Review" r
      JOIN "User" u ON u."id" = r."userId"
      WHERE r."hidden" = false AND u."bannedAt" IS NULL
      ORDER BY r."pinned" DESC, r."pinnedAt" ASC, random()
      LIMIT ${SAMPLE_SIZE}`;
    return rows.map(({ frameStyle, nameColor, ...r }) => ({ ...r, updatedAt: r.updatedAt.toISOString(), decor: decorFromColumns(frameStyle, nameColor) }));
  },
  ["reviews-sample-v3"],
  { tags: [REVIEWS_TAG], revalidate: 300 },
);

const loadSummary = unstable_cache(
  async (): Promise<ReviewSummary> => {
    const [row] = await prisma.$queryRaw<{ count: number; sum: number }[]>`
      SELECT COUNT(*)::int AS "count", COALESCE(SUM(r."rating"), 0)::int AS "sum"
      FROM "Review" r
      JOIN "User" u ON u."id" = r."userId"
      WHERE r."hidden" = false AND u."bannedAt" IS NULL`;
    const count = row?.count ?? 0;
    return { average: averageRating(row?.sum ?? 0, count), count };
  },
  ["reviews-summary"],
  { tags: [REVIEWS_TAG], revalidate: 300 },
);

export const getReviewSample = () => loadSample();
export const getReviewSummary = () => loadSummary();

/** L'avis du joueur, pour pré-remplir le formulaire (même s'il a été masqué). */
export async function getOwnReview(userId: string) {
  return prisma.review.findUnique({ where: { userId }, select: { rating: true, body: true } });
}
