import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { decorFromColumns, type PlayerDecor } from "@/lib/profile/decor";
import { prisma } from "../db";
import { decorColumns, type DecorColumns } from "../profile/decor";

// Classement des collectionneurs : prestige (renaissances), puis cartes uniques possédées (exemplaires en vente
// compris), puis Mythiques uniques. Seuls les profils publics de joueurs non bannis et non retirés par l'admin y figurent,
// moins les malus posés par l'admin (`leaderboardMalus` en cartes uniques, `leaderboardMythicMalus` en
// Mythiques). Le rôle DEV voit les totaux bruts, sans malus. Le calcul lit les exemplaires de chaque joueur
// classable : on le garde en cache quelques minutes (une entrée par vue).
//
// Cartes distinctes comptées joueur par joueur (sous-requête LATERAL sur l'index ownerId, cardId, déjà trié par
// carte) : plus de COUNT(DISTINCT) groupé par joueur sur toute la table, qui triait chaque fois tous les
// exemplaires avec les colonnes du joueur (des dizaines de Mo, au-delà de work_mem) ; en production, la source la
// plus probable des 10 008 fichiers temporaires (129 Go) relevés du 28/10 au 26/11, et une part des parcours
// complets de UserCard.

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
  async (raw: boolean): Promise<Collector[]> => {
    const malus = raw ? Prisma.sql`0` : Prisma.sql`u."leaderboardMalus"`;
    const mythicMalus = raw ? Prisma.sql`0` : Prisma.sql`u."leaderboardMythicMalus"`;
    const rows = await prisma.$queryRaw<(Omit<Collector, "rank" | "decor"> & DecorColumns)[]>`
      SELECT u."username", u."image", u."isGuest", ${decorColumns},
        GREATEST(t.cards - ${malus}, 0)::int AS "uniqueCards",
        GREATEST(t.mythics - ${mythicMalus}, 0)::int AS "mythics"
      FROM "User" u
      CROSS JOIN LATERAL (
        -- Mythiques : liste du catalogue lue une fois pour toute la requête (sous-requête sans corrélation)
        SELECT COUNT(*) AS cards,
          COUNT(*) FILTER (WHERE o."cardId" IN (SELECT m.id FROM "Card" m WHERE m."rarityKey" = 'MYTHIC')) AS mythics
        FROM (SELECT DISTINCT uc."cardId" FROM "UserCard" uc WHERE uc."ownerId" = u."id") o
      ) t
      WHERE u."bannedAt" IS NULL AND u."leaderboardHiddenAt" IS NULL AND u."profileVisibility" = 'PUBLIC'
        -- Prestige d'abord : un joueur reparti de zéro garde sa place devant ceux qui n'ont jamais renaît
        AND (t.cards > 0 OR u."prestige" > 0)
      ORDER BY u."prestige" DESC, "uniqueCards" DESC, "mythics" DESC, u."createdAt" ASC
      LIMIT ${LEADERBOARD_SIZE}`;
    return rows.map(({ frameStyle, nameColor, prestige, ...r }, i) => ({ ...r, rank: i + 1, decor: decorFromColumns({ frameStyle, nameColor, prestige }) }));
  },
  ["top-collectors-v5"],
  { tags: [LEADERBOARD_TAG], revalidate: 300 },
);

/** Les `limit` premiers collectionneurs (50 au plus) ; `raw` : sans les malus de l'admin (rôle DEV). */
export async function getTopCollectors(limit = LEADERBOARD_SIZE, { raw = false }: { raw?: boolean } = {}): Promise<Collector[]> {
  return (await loadTopCollectors(raw)).slice(0, limit);
}
