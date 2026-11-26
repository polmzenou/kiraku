import "server-only";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@/generated/prisma/client";
import { displayNameFor } from "@/lib/collection/display-name";
import { NO_DECOR } from "@/lib/profile/decor";
import { prisma } from "../db";
import { playerRefSelect, toPlayerRef, type PlayerRef } from "../profile/decor";

// Masquage des joueurs affichés avec avatar et décor (casino, annonces d'échange). Sans dépendance à la session :
// importé par des modules de lecture partagés (Marché, social, combat), il ne doit pas entraîner Auth.js avec lui.

/** Relations du lecteur avec ces joueurs : qui l'a bloqué, qui est son ami. Deux requêtes, aucune sans lecteur. */
export async function viewerRelations(viewerId: string | null, playerIds: readonly string[]) {
  const ids = [...new Set(playerIds)].filter((id) => id !== viewerId);
  const [blocks, friendships] =
    viewerId && ids.length > 0
      ? await Promise.all([
          prisma.userBlock.findMany({ where: { blockerId: { in: ids }, blockedId: viewerId }, select: { blockerId: true } }),
          prisma.friendship.findMany({
            where: {
              status: "ACCEPTED",
              OR: [
                { requesterId: viewerId, addresseeId: { in: ids } },
                { addresseeId: viewerId, requesterId: { in: ids } },
              ],
            },
            select: { requesterId: true, addresseeId: true },
          }),
        ])
      : [[], []];
  return {
    blockedBy: new Set(blocks.map((b) => b.blockerId)),
    friends: new Set(friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId))),
  };
}

/** Champs d'un joueur affiché avec son avatar et son décor, plus ce qu'il faut pour décider s'il est masqué. */
export const maskablePlayerSelect = { ...playerRefSelect, profileVisibility: true, bannedAt: true, anonymizedAt: true } as const;

/**
 * Mêmes règles que le profil public : un profil privé, réservé aux amis (hors amis), banni, supprimé ou qui a bloqué
 * le lecteur devient « Joueur » (ou « Compte supprimé »), sans avatar ni décor, marqué `masked` (ni lien de profil).
 * Rend une Map id → PlayerRef.
 */
export async function maskedPlayerRefs(
  viewerId: string | null,
  players: readonly Prisma.UserGetPayload<{ select: typeof maskablePlayerSelect }>[],
): Promise<Map<string, PlayerRef>> {
  const [t, rel] = await Promise.all([getTranslations("playerName"), viewerRelations(viewerId, players.map((p) => p.id))]);
  const labels = { hidden: t("hidden"), deleted: t("deleted") };
  return new Map(
    players.map((p) => {
      const ref = toPlayerRef(p);
      const name = displayNameFor(p, viewerId, { friends: rel.friends.has(p.id), blocked: rel.blockedBy.has(p.id) }, labels);
      return [p.id, name === p.username ? ref : { ...ref, username: name, image: null, decor: NO_DECOR, masked: true as const }];
    }),
  );
}
