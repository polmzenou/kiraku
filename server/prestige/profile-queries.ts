import "server-only";
import { getTranslations } from "next-intl/server";
import type { CardView } from "@/lib/boosters/view";
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
  const [views, seals] = await Promise.all([cardViews(all.map((h) => h.cardId), locale), all.some((h) => h.printing !== null) ? getPrintingSeals() : {}]);
  return cycles.map((c, i) => ({
    number: c.number,
    globalRank: c.globalRank,
    zeni: c.zeni,
    uniqueCards: c.uniqueCards,
    createdAt: c.createdAt,
    heirs: heirsOf[i].flatMap((h) => {
      const view = views.get(h.cardId);
      return view ? [{ ...view, copy: fudaCopyOf({ heritage: h.heritage, printing: h.printing, serial: h.serial }, seals) }] : [];
    }),
  }));
}

export type SanctuaryOwner = { name: string; username: string | null; via: OwnershipViaKey; at: Date };

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
    rows.some((r) => r.printing !== null) ? getPrintingSeals() : {},
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
      if (!player) return { name: t("deleted"), username: null, via: o.via, at: o.at };
      const shown = nameOf(player);
      return { name: shown.name, username: !shown.revealed && shown.name === player.username ? player.username : null, via: o.via, at: o.at };
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
