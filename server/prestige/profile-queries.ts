import "server-only";
import { getTranslations } from "next-intl/server";
import type { CardView } from "@/lib/boosters/view";
import { profileUsername } from "@/lib/collection/display-name";
import { fudaCopyOf } from "@/lib/prestige/printing";
import { readHeirs, readJourney, type OwnershipViaKey } from "@/lib/prestige/journey";
import { cardViews } from "../boosters/display";
import { namedPlayerSelect, publicNamesFor } from "../collection/public-names";
import { prisma } from "../db";
import { getPrintingSeals } from "./rules";

// Prestige sur le profil : rouleaux des cycles (emakis) et sanctuaire des cartes consacrées. Le profil n'appelle
// ces lectures que si le lecteur a le droit de le voir ; les pseudos du parcours suivent leur propre visibilité.

export type EmakiView = {
  number: number;
  globalRank: number;
  zeni: number;
  uniqueCards: number;
  createdAt: Date;
  /** Les héritières de ce cycle, dans l'état où elles ont été gardées. */
  heirs: CardView[];
};

/** Un rouleau par cycle, du premier au dernier. */
export async function getEmakis(userId: string, locale: string): Promise<EmakiView[]> {
  const cycles = await prisma.prestigeCycle.findMany({
    where: { userId },
    orderBy: { number: "asc" },
    select: { number: true, globalRank: true, zeni: true, uniqueCards: true, createdAt: true, heirs: true },
  });
  if (cycles.length === 0) return [];
  const heirsOf = cycles.map((c) => readHeirs(c.heirs));
  const all = heirsOf.flat();
  // Taille des tirages des gravées, relue au compteur (jamais supprimé tant que la carte existe) : la photo ne la
  // garde pas, et le numéro se lit toujours avec son sceau et sa taille
  const printed = all.flatMap((h) => (h.printing !== null ? [{ cardId: h.cardId, printing: h.printing }] : []));
  const [views, seals, printings] = await Promise.all([
    cardViews(all.map((h) => h.cardId), locale),
    getPrintingSeals(),
    printed.length > 0 ? prisma.cardPrinting.findMany({ where: { OR: printed }, select: { cardId: true, printing: true, size: true } }) : [],
  ]);
  const sizeOf = new Map(printings.map((p) => [`${p.cardId}:${p.printing}`, p.size]));
  return cycles.map((c, i) => ({
    number: c.number,
    globalRank: c.globalRank,
    zeni: c.zeni,
    uniqueCards: c.uniqueCards,
    createdAt: c.createdAt,
    heirs: heirsOf[i].flatMap((h) => {
      const view = views.get(h.cardId);
      const size = h.printing !== null ? (sizeOf.get(`${h.cardId}:${h.printing}`) ?? null) : null;
      return view ? [{ ...view, copy: fudaCopyOf({ heritage: h.heritage, printing: h.printing, serial: h.serial, size }, seals) }] : [];
    }),
  }));
}

export type SanctuaryOwner = { name: string; username: string | null; via: OwnershipViaKey };

export type SanctuaryEntry = {
  id: string;
  card: CardView;
  consecratedAt: Date;
  /** Prestiges du joueur qui ont gardé l'exemplaire (« du cycle 1 au cycle 5 »). */
  cycles: number[];
  owners: SanctuaryOwner[];
};

/** Cartes consacrées du joueur, avec leur parcours figé à la consécration. */
export async function getSanctuary(viewerId: string | null, userId: string, locale: string): Promise<SanctuaryEntry[]> {
  const rows = await prisma.consecratedCard.findMany({
    where: { userId },
    orderBy: [{ consecratedAt: "asc" }, { id: "asc" }],
    select: { id: true, cardId: true, heritage: true, printing: true, serial: true, size: true, journey: true, consecratedAt: true },
  });
  if (rows.length === 0) return [];
  const journeys = rows.map((r) => readJourney(r.journey));
  const ownerIds = [...new Set(journeys.flatMap((j) => j.owners.flatMap((o) => (o.ownerId ? [o.ownerId] : []))))];
  const [views, seals, players, t] = await Promise.all([
    cardViews(rows.map((r) => r.cardId), locale),
    getPrintingSeals(),
    ownerIds.length > 0 ? prisma.user.findMany({ where: { id: { in: ownerIds } }, select: namedPlayerSelect }) : [],
    getTranslations("playerName"),
  ]);
  const nameOf = await publicNamesFor(viewerId, players);
  const byId = new Map(players.map((p) => [p.id, p]));
  return rows.flatMap((r, i) => {
    const view = views.get(r.cardId);
    if (!view) return [];
    const owners = journeys[i].owners.map((o): SanctuaryOwner => {
      const player = o.ownerId ? byId.get(o.ownerId) : undefined;
      if (!player) return { name: t("deleted"), username: null, via: o.via };
      const shown = nameOf(player);
      return { name: shown.name, username: profileUsername(shown, player.username), via: o.via };
    });
    return [
      {
        id: r.id,
        card: { ...view, copy: fudaCopyOf({ heritage: r.heritage, printing: r.printing, serial: r.serial, size: r.size }, seals) },
        consecratedAt: r.consecratedAt,
        cycles: journeys[i].cycles,
        owners,
      },
    ];
  });
}
