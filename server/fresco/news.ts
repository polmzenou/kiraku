import "server-only";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { NewFresco } from "@/components/wiki/NewFrescoCard";
import { FRESCO_REWARD_KINDS } from "@/lib/fresco/progress";
import type { FrescoView } from "@/lib/fresco/view";
import { prisma } from "../db";
import { lotViews } from "../economy/lot-view";
import { getSetting } from "../settings";
import { getLiveFrescoes, playerFrescoes } from "./queries";

/**
 * Onglet « Nouvelles fresques » : les fresques publiées, de la plus récente à la plus ancienne, avec leur
 * aperçu flouté (jamais l'image), leurs boosters, leurs lots, et la progression du lecteur.
 */
export async function newFrescoes(viewerId: string | null, locale: string, now = new Date()): Promise<{ frescoes: NewFresco[]; progress: Map<string, FrescoView> }> {
  const [live, newHours] = await Promise.all([getLiveFrescoes(), getSetting("fresco.newHours")]);
  if (live.length === 0) return { frescoes: [], progress: new Map() };
  const lotIds = live.flatMap((f) => Object.values(f.lots).filter((id): id is string => id !== null));
  const boosterIds = [...new Set(live.flatMap((f) => f.boosterTypeIds))];
  const [lots, boosters, mine] = await Promise.all([
    lotViews(lotIds, locale),
    boosterIds.length ? prisma.boosterType.findMany({ where: { id: { in: boosterIds } }, select: { id: true, name: true, slug: true } }) : [],
    viewerId ? playerFrescoes(viewerId, locale, live.map((f) => f.id)) : [],
  ]);
  const boosterName = new Map(boosters.map((b) => [b.id, localize(parseLocalized(b.name, b.slug), locale)]));
  const lotKey = { PIECE: "piece", ROW: "row", COLUMN: "column", COMPLETE: "complete" } as const;
  return {
    frescoes: live.map((f) => ({
      id: f.id,
      name: localize(f.name, locale),
      publishedAt: f.publishedAt,
      teaserUrl: f.teaserUrl,
      cols: f.cols,
      rows: f.rows,
      spoiler: f.spoiler,
      spoilerKey: f.spoiler ? f.universeId : null,
      isNew: newHours > 0 && now.getTime() - Date.parse(f.publishedAt) < newHours * 3_600_000,
      boosters: f.boosterTypeIds.length === 0 ? null : f.boosterTypeIds.flatMap((id) => boosterName.get(id) ?? []),
      rewards: FRESCO_REWARD_KINDS.map((kind) => {
        const id = f.lots[lotKey[kind]];
        return { kind, lot: id ? (lots.get(id) ?? null) : null };
      }),
    })),
    progress: new Map(mine.map((v) => [v.id, v])),
  };
}
