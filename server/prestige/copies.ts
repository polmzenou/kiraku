import "server-only";
import { getTranslations } from "next-intl/server";
import type { OwnershipVia } from "@/generated/prisma/client";
import { profileUsername } from "@/lib/collection/display-name";
import { isFrozen } from "@/lib/account/deletion";
import { profileAccess } from "@/lib/collection/visibility";
import { sealOf } from "@/lib/prestige/printing";
import { prisma } from "../db";
import { namedPlayerSelect, publicNamesFor } from "../collection/public-names";
import { playerRefSelect, toPlayerRef, type PlayerRef } from "../profile/decor";
import { getPrintingSeals } from "./rules";

// Lectures des exemplaires spéciaux (prestige) : provenance d'un exemplaire, gravées en circulation, registre des
// gravées d'une carte pour le wiki. Les pseudos suivent la visibilité des profils, comme partout.

/** Un propriétaire de l'exemplaire, dans l'ordre. `username` : lien vers le profil, seulement s'il est visible. */
export type JourneyStep = { name: string; username: string | null; locked: boolean; via: OwnershipVia; at: Date };

/** Provenance de chaque exemplaire demandé (UserCardOwner, du premier au dernier propriétaire). */
export async function copyJourneys(viewerId: string | null, userCardIds: readonly string[]): Promise<Map<string, JourneyStep[]>> {
  const out = new Map<string, JourneyStep[]>();
  if (userCardIds.length === 0) return out;
  const rows = await prisma.userCardOwner.findMany({
    where: { userCardId: { in: [...userCardIds] } },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    select: { userCardId: true, via: true, at: true, owner: { select: namedPlayerSelect } },
  });
  const [nameOf, t] = await Promise.all([publicNamesFor(viewerId, rows.flatMap((r) => (r.owner ? [r.owner] : []))), getTranslations("playerName")]);
  for (const r of rows) {
    const owner = r.owner;
    const shown = owner ? nameOf(owner) : null;
    const step: JourneyStep = { name: shown?.name ?? t("deleted"), username: owner && shown ? profileUsername(shown, owner.username) : null, locked: shown?.revealed ?? false, via: r.via, at: r.at };
    out.set(r.userCardId, [...(out.get(r.userCardId) ?? []), step]);
  }
  return out;
}

export type PrintingStats = {
  printing: number;
  seal: string | null;
  size: number;
  issued: number;
  /** Numéros déjà sortis (dans l'ordre de sortie) : ceux qui ne sont plus en jeu ont été recyclés. */
  taken: number[];
  alive: number;
};

/** Tirages gravés d'une carte : taille, numéros sortis, exemplaires encore en jeu (les autres ont été recyclés). */
export async function printingStats(cardId: string): Promise<PrintingStats[]> {
  const printings = await prisma.cardPrinting.findMany({ where: { cardId }, orderBy: { printing: "asc" }, select: { printing: true, size: true, issued: true, taken: true } });
  // Carte jamais gravée (presque toutes, sur le wiki) : rien d'autre à lire
  if (printings.length === 0) return [];
  const [alive, seals] = await Promise.all([
    prisma.userCard.groupBy({ by: ["printing"], where: { cardId, printing: { not: null } }, _count: { _all: true } }),
    getPrintingSeals(),
  ]);
  const aliveOf = new Map(alive.map((a) => [a.printing, a._count._all]));
  return printings.map((p) => ({ ...p, seal: sealOf(p.printing, seals), alive: aliveOf.get(p.printing) ?? 0 }));
}

export type RegistryEntry = {
  printing: number;
  serial: number;
  /** En jeu chez un joueur, chez le lecteur lui-même, ou consacrée au sanctuaire d'un joueur. */
  state: "alive" | "mine" | "shrine";
  /** Détenteur (ou joueur qui l'a consacrée), si sa collection est visible par le lecteur ; sinon « Un joueur ». */
  holder: PlayerRef | null;
};

export type EngravedRegistry = { stats: PrintingStats[]; entries: RegistryEntry[] };

const holderSelect = { ...playerRefSelect, profileVisibility: true, showCollection: true, bannedAt: true, deletionRequestedAt: true, anonymizedAt: true } as const;

/**
 * Registre des gravées d'une carte (fiche wiki) : chaque numéro encore en jeu et son détenteur, et ceux consacrés au
 * sanctuaire d'un joueur. Même règle que la liste des possesseurs : un joueur n'est nommé que si sa collection est
 * visible par le lecteur (profil public, ou ami pour un profil réservé aux amis), jamais un invité, un banni, un
 * compte gelé ou anonymisé, ni un blocage.
 */
export async function getEngravedRegistry(viewerId: string | null, cardId: string): Promise<EngravedRegistry> {
  const stats = await printingStats(cardId);
  if (stats.length === 0) return { stats, entries: [] };
  const [alive, consecrated] = await Promise.all([
    prisma.userCard.findMany({
      where: { cardId, printing: { not: null } },
      select: { printing: true, serial: true, owner: { select: holderSelect } },
    }),
    prisma.consecratedCard.findMany({
      where: { cardId, printing: { not: null } },
      select: { printing: true, serial: true, user: { select: holderSelect } },
    }),
  ]);
  const copies = [
    ...alive.map((c) => ({ printing: c.printing!, serial: c.serial!, owner: c.owner, shrine: false })),
    ...consecrated.map((c) => ({ printing: c.printing!, serial: c.serial!, owner: c.user, shrine: true })),
  ].sort((a, b) => a.printing - b.printing || a.serial - b.serial);
  const ownerIds = [...new Set(copies.map((c) => c.owner.id))].filter((id) => id !== viewerId);
  const [blocks, friendships] =
    viewerId && ownerIds.length > 0
      ? await Promise.all([
          prisma.userBlock.findMany({
            where: { OR: [{ blockerId: { in: ownerIds }, blockedId: viewerId }, { blockerId: viewerId, blockedId: { in: ownerIds } }] },
            select: { blockerId: true, blockedId: true },
          }),
          prisma.friendship.findMany({
            where: { status: "ACCEPTED", OR: [{ requesterId: viewerId, addresseeId: { in: ownerIds } }, { addresseeId: viewerId, requesterId: { in: ownerIds } }] },
            select: { requesterId: true, addresseeId: true },
          }),
        ])
      : [[], []];
  const blocked = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
  const friends = new Set(friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));
  const entries = copies.map((c): RegistryEntry => {
    const o = c.owner;
    const hidden = o.isGuest || isFrozen(o) || blocked.has(o.id);
    const access = profileAccess(viewerId, o, { friends: friends.has(o.id), blocked: blocked.has(o.id) });
    // Seuls les champs d'un PlayerRef partent vers la page (pas la visibilité ni les dates du compte)
    const ref = { id: o.id, username: o.username, image: o.image, isGuest: o.isGuest, frame: o.frame, nameColor: o.nameColor, prestige: o.prestige };
    return {
      printing: c.printing,
      serial: c.serial,
      state: c.shrine ? "shrine" : o.id === viewerId ? "mine" : "alive",
      holder: !hidden && access.collection ? toPlayerRef(ref) : null,
    };
  });
  return { stats, entries };
}
