import "server-only";
import { unstable_cache } from "next/cache";
import { decorFromColumns, type PlayerDecor } from "@/lib/profile/decor";
import { prisma } from "../db";
import { decorColumns, type DecorColumns } from "../profile/decor";

// Classement des collectionneurs : cartes uniques possédées (exemplaires en vente compris), puis
// Mythiques uniques. Seuls les profils publics de joueurs non bannis y figurent. Le calcul
// parcourt toute la table UserCard : on le garde en cache quelques minutes.

export const LEADERBOARD_TAG = "leaderboard";
export const LEADERBOARD_SIZE = 50;

export type Collector = {
  rank: number;
  username: string;
  image: string | null;
  isGuest: boolean;
  uniqueCards: number;
  mythics: number;
  decor: PlayerDecor;
};

const loadTopCollectors = unstable_cache(
  async (): Promise<Collector[]> => {
    const rows = await prisma.$queryRaw<(Omit<Collector, "rank" | "decor"> & DecorColumns)[]>`
      SELECT u."username", u."image", u."isGuest", ${decorColumns},
        COUNT(DISTINCT uc."cardId")::int AS "uniqueCards",
        (COUNT(DISTINCT uc."cardId") FILTER (WHERE c."rarityKey" = 'MYTHIC'))::int AS "mythics"
      FROM "UserCard" uc
      JOIN "User" u ON u."id" = uc."ownerId"
      JOIN "Card" c ON c."id" = uc."cardId"
      WHERE u."bannedAt" IS NULL AND u."profileVisibility" = 'PUBLIC'
      GROUP BY u."id"
      ORDER BY "uniqueCards" DESC, "mythics" DESC, u."createdAt" ASC
      LIMIT ${LEADERBOARD_SIZE}`;
    return rows.map(({ frameStyle, nameColor, ...r }, i) => ({ ...r, rank: i + 1, decor: decorFromColumns(frameStyle, nameColor) }));
  },
  ["top-collectors-v2"],
  { tags: [LEADERBOARD_TAG], revalidate: 300 },
);

/** Les `limit` premiers collectionneurs (50 au plus). */
export async function getTopCollectors(limit = LEADERBOARD_SIZE): Promise<Collector[]> {
  return (await loadTopCollectors()).slice(0, limit);
}
