import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { shownNameFor, type NamedPlayer, type ShownName } from "@/lib/collection/display-name";
import { prisma } from "../db";
import { decorSelect } from "../profile/decor";
import { getCurrentUser } from "../user";

/** Champs à sélectionner sur un User pour décider de l'affichage de son pseudo. */
export const namedPlayerSelect = { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true, ...decorSelect } as const;

/**
 * Le lecteur est-il un admin (rôle ADMIN, non banni) ? Il lit alors les pseudos cachés aux joueurs, avec un
 * cadenas. Vérifié sur la session de la requête : `viewerId` seul ne suffit jamais. Mémoïsé dans ce rendu.
 */
export const revealsHiddenNames = cache(async (viewerId: string | null): Promise<boolean> => {
  if (!viewerId) return false;
  const viewer = await getCurrentUser();
  return viewer?.id === viewerId && viewer.role === "ADMIN" && !viewer.bannedAt;
});

/**
 * Prépare l'affichage des pseudos de plusieurs joueurs pour un visiteur : une requête pour les
 * blocages, une pour les amitiés, puis une fonction pure par joueur. Un admin lit aussi les pseudos
 * cachés, marqués `revealed`.
 */
export async function publicNamesFor(viewerId: string | null, players: readonly NamedPlayer[]): Promise<(player: NamedPlayer) => ShownName> {
  const t = await getTranslations("playerName");
  const ids = [...new Set(players.map((p) => p.id))].filter((id) => id !== viewerId);
  const [blocks, friendships, reveal] =
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
          revealsHiddenNames(viewerId),
        ])
      : [[], [], false];
  const blockedBy = new Set(blocks.map((b) => b.blockerId));
  const friends = new Set(friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));
  const labels = { hidden: t("hidden"), deleted: t("deleted") };
  return (player: NamedPlayer) => shownNameFor(player, viewerId, { friends: friends.has(player.id), blocked: blockedBy.has(player.id) }, labels, reveal);
}
