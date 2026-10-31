import "server-only";
import { profileAccess, type ProfileVisibility } from "@/lib/collection/visibility";
import { decorFromColumns, NO_DECOR, type PlayerDecor } from "@/lib/profile/decor";
import { relationBetween, type Relation } from "@/lib/social/relation";
import { containsPattern, prefixPattern } from "@/lib/social/search";
import { prisma } from "../db";
import { decorColumns, type DecorColumns } from "../profile/decor";

// Recherche de joueurs de la page Social (règles dans lib/social/search.ts). Jamais d'invité, de banni
// ni de compte gelé. Partielle : profils visibles par le lecteur seulement ; exacte (casse ignorée) :
// aussi les profils cachés, montrés avec le pseudo seul. Un joueur qui a bloqué le lecteur répond
// comme un profil privé : rien ne trahit le blocage.

export type PlayerHit = {
  username: string;
  /** Avatar et décor : seulement si le profil est visible par le lecteur. */
  image: string | null;
  decor: PlayerDecor;
  profile: boolean;
  /** Collection visible : condition d'un échange hors amis. */
  collection: boolean;
  relation: Relation;
};

type Row = DecorColumns & {
  id: string;
  username: string;
  image: string | null;
  profileVisibility: ProfileVisibility;
  showCollection: boolean;
  requesterId: string | null;
  addresseeId: string | null;
  status: "PENDING" | "ACCEPTED" | null;
  declinedAt: Date | null;
  blockedByMe: boolean;
  blockedByThem: boolean;
};

export async function searchPlayers(viewerId: string, q: string, limit: number): Promise<PlayerHit[]> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u.id, u.username, u.image, u."profileVisibility", u."showCollection", ${decorColumns},
           f."requesterId", f."addresseeId", f.status, f."declinedAt",
           EXISTS (SELECT 1 FROM "UserBlock" b WHERE b."blockerId" = ${viewerId} AND b."blockedId" = u.id) AS "blockedByMe",
           EXISTS (SELECT 1 FROM "UserBlock" b WHERE b."blockerId" = u.id AND b."blockedId" = ${viewerId}) AS "blockedByThem"
    FROM "User" u
    LEFT JOIN "Friendship" f
      ON (f."requesterId" = ${viewerId} AND f."addresseeId" = u.id) OR (f."requesterId" = u.id AND f."addresseeId" = ${viewerId})
    WHERE u."isGuest" = false AND u."bannedAt" IS NULL AND u."deletionRequestedAt" IS NULL AND u."anonymizedAt" IS NULL
      AND u.id <> ${viewerId}
      AND u.username ILIKE ${containsPattern(q)}
      AND (
        LOWER(u.username) = LOWER(${q})
        OR (
          NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE b."blockerId" = u.id AND b."blockedId" = ${viewerId})
          AND (u."profileVisibility" = 'PUBLIC' OR (u."profileVisibility" = 'FRIENDS' AND f.status = 'ACCEPTED'))
        )
      )
    ORDER BY LOWER(u.username) = LOWER(${q}) DESC, u.username ILIKE ${prefixPattern(q)} DESC,
             LENGTH(u.username), LOWER(u.username)
    LIMIT ${limit}`;

  return rows.map((r) => {
    const friendship = r.status && r.requesterId && r.addresseeId
      ? { requesterId: r.requesterId, addresseeId: r.addresseeId, status: r.status, declinedAt: r.declinedAt }
      : null;
    const relation = relationBetween(viewerId, friendship, { byMe: r.blockedByMe, byThem: r.blockedByThem });
    const access = profileAccess(
      viewerId,
      { id: r.id, profileVisibility: r.profileVisibility, showCollection: r.showCollection, bannedAt: null },
      { friends: relation === "FRIENDS", blocked: r.blockedByThem },
    );
    return {
      username: r.username,
      image: access.profile ? r.image : null,
      decor: access.profile ? decorFromColumns(r.frameStyle, r.nameColor) : NO_DECOR,
      profile: access.profile,
      collection: access.collection,
      relation,
    };
  });
}
