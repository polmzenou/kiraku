import "server-only";
import { getTranslations } from "next-intl/server";
import { displayNameFor, type NamedPlayer } from "@/lib/collection/display-name";
import { decorFromRelations } from "@/lib/profile/decor";
import type { NameColorStyle } from "@/lib/profile/name-colors";
import { prisma } from "../db";
import { decorSelect } from "../profile/decor";

/** Champs à sélectionner sur un User pour décider de l'affichage de son pseudo. */
export const namedPlayerSelect = { id: true, username: true, profileVisibility: true, bannedAt: true, anonymizedAt: true, ...decorSelect } as const;

/** Couleur du pseudo, seulement quand le pseudo lui-même est affiché (pas « Un joueur »). */
export function shownNameColor(name: string | null, player: { username: string } & Parameters<typeof decorFromRelations>[0]): NameColorStyle | null {
  return name === player.username ? decorFromRelations(player).nameColor : null;
}

/**
 * Prépare l'affichage des pseudos de plusieurs joueurs pour un visiteur : une requête pour les
 * blocages, une pour les amitiés, puis une fonction pure par joueur.
 */
export async function publicNamesFor(viewerId: string | null, players: readonly NamedPlayer[]) {
  const t = await getTranslations("playerName");
  const ids = [...new Set(players.map((p) => p.id))].filter((id) => id !== viewerId);
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
  const blockedBy = new Set(blocks.map((b) => b.blockerId));
  const friends = new Set(friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));
  return (player: NamedPlayer) =>
    displayNameFor(player, viewerId, { friends: friends.has(player.id), blocked: blockedBy.has(player.id) }, { hidden: t("hidden"), deleted: t("deleted") });
}
