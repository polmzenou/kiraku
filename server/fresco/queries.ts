import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { localize, parseLocalized, type Localized } from "@/lib/boosters/types";
import { cellCount } from "@/lib/fresco/grid";
import type { FrescoView } from "@/lib/fresco/view";
import { prisma } from "../db";
import type { FrescoSource } from "./award-core";

// Lectures côté joueur. Rien d'une fresque en brouillon ne sort d'ici : les fresques publiées (ou archivées,
// pour celles qu'on possède déjà) seulement, les URL des fragments possédés seulement, et l'image entière
// seulement quand la fresque est complète. Les écritures de l'admin appellent updateTag(FRESCO_TAG).

export const FRESCO_TAG = "frescoes";

/** Fresque publiée, telle que la gardent le cache, les chutes et l'onglet Nouveautés (sans aucune image). */
export type LiveFresco = {
  id: string;
  name: Localized;
  cols: number;
  rows: number;
  publishedAt: string;
  teaserUrl: string | null;
  boosterTypeIds: string[];
  dropWeight: number;
  universeId: string | null;
  spoiler: boolean;
  lots: { piece: string | null; row: string | null; column: string | null; complete: string | null };
};

const loadLiveFrescoes = unstable_cache(
  async (): Promise<LiveFresco[]> => {
    const rows = await prisma.fresco.findMany({
      where: { status: "PUBLISHED", publishedAt: { not: null } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        cols: true,
        rows: true,
        publishedAt: true,
        teaserUrl: true,
        boosterTypeIds: true,
        dropWeight: true,
        universeId: true,
        spoiler: true,
        pieceLotId: true,
        rowLotId: true,
        columnLotId: true,
        completeLotId: true,
        _count: { select: { pieces: true } },
      },
    });
    // Une fresque publiée sans tous ses fragments ne peut pas tomber : la publication l'exige, on le revérifie
    return rows
      .filter((r) => r._count.pieces === cellCount(r))
      .map((r) => ({
        id: r.id,
        name: parseLocalized(r.name),
        cols: r.cols,
        rows: r.rows,
        publishedAt: r.publishedAt!.toISOString(),
        teaserUrl: r.teaserUrl,
        boosterTypeIds: r.boosterTypeIds,
        dropWeight: r.dropWeight,
        universeId: r.universeId,
        spoiler: r.spoiler,
        lots: { piece: r.pieceLotId, row: r.rowLotId, column: r.columnLotId, complete: r.completeLotId },
      }));
  },
  ["frescoes-live"],
  { tags: [FRESCO_TAG], revalidate: 3_600 },
);

/** Fresques publiées, de la plus récente à la plus ancienne. Lu une fois par requête. */
export const getLiveFrescoes = cache(() => loadLiveFrescoes());

/** Au moins une fresque publiée : sinon rien des fresques ne s'affiche nulle part (onglets, boutons, chutes). */
export const hasPublishedFresco = cache(async () => (await getLiveFrescoes()).length > 0);

/** Fresque publiée → source de chute (poids, boosters, lots de chaque récompense). */
export function toFrescoSource(f: LiveFresco): FrescoSource {
  return {
    id: f.id,
    grid: { cols: f.cols, rows: f.rows },
    weight: f.dropWeight,
    boosterTypeIds: f.boosterTypeIds,
    lots: { PIECE: f.lots.piece, ROW: f.lots.row, COLUMN: f.lots.column, COMPLETE: f.lots.complete },
  };
}

const viewSelect = {
  id: true,
  name: true,
  cols: true,
  rows: true,
  imageUrl: true,
  spoiler: true,
  universeId: true,
} as const;

type ViewRow = { id: string; name: unknown; cols: number; rows: number; imageUrl: string | null; spoiler: boolean; universeId: string | null };

/** Fresque vue par un joueur qui en possède `pieces` : l'image entière seulement si elle est complète. */
export function toFrescoView(row: ViewRow, pieces: { position: number; imageUrl: string }[], locale: string): FrescoView {
  const sorted = [...pieces].sort((a, b) => a.position - b.position);
  const complete = sorted.length >= cellCount(row) && row.imageUrl !== null;
  return {
    id: row.id,
    name: localize(parseLocalized(row.name), locale),
    cols: row.cols,
    rows: row.rows,
    pieces: sorted,
    fullImageUrl: complete ? row.imageUrl : null,
    spoiler: row.spoiler,
    spoilerKey: row.spoiler ? row.universeId : null,
  };
}

/**
 * Fresques d'un joueur (au moins un fragment), publiées ou archivées, les plus récentes d'abord. `ids` limite
 * la lecture à certaines fresques (vitrine, onglet Nouveautés).
 */
export async function playerFrescoes(userId: string, locale: string, ids?: readonly string[]): Promise<FrescoView[]> {
  if (ids && ids.length === 0) return [];
  const owned = await prisma.userFrescoPiece.findMany({
    where: { userId, ...(ids && { frescoId: { in: [...ids] } }), fresco: { status: { in: ["PUBLISHED", "ARCHIVED"] } } },
    select: { frescoId: true, piece: { select: { position: true, imageUrl: true } } },
  });
  if (owned.length === 0) return [];
  const byFresco = new Map<string, { position: number; imageUrl: string }[]>();
  for (const o of owned) byFresco.set(o.frescoId, [...(byFresco.get(o.frescoId) ?? []), o.piece]);
  const rows = await prisma.fresco.findMany({
    where: { id: { in: [...byFresco.keys()] } },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    select: viewSelect,
  });
  return rows.map((r) => toFrescoView(r, byFresco.get(r.id) ?? [], locale));
}

/** La fresque `frescoId` telle que `userId` la possède, ou null s'il n'en a aucun fragment. */
export async function playerFresco(userId: string, frescoId: string, locale: string): Promise<FrescoView | null> {
  const [view] = await playerFrescoes(userId, locale, [frescoId]);
  return view ?? null;
}

/** Fresque d'une vitrine, telle que son propriétaire la possède ; null sans fresque choisie ou sans fragment. */
export async function showcaseFresco(
  ownerId: string,
  showcase: { frescoId: string | null; frescoFirst: boolean } | undefined,
  locale: string,
): Promise<{ view: FrescoView; first: boolean } | null> {
  if (!showcase?.frescoId) return null;
  const view = await playerFresco(ownerId, showcase.frescoId, locale);
  return view ? { view, first: showcase.frescoFirst } : null;
}
