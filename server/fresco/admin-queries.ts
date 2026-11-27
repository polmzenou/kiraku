import "server-only";
import { localize, parseLocalized } from "@/lib/boosters/types";
import type { OpeningTestFresco } from "@/lib/admin/opening-test";
import type { FrescoInput, FrescoStatus } from "@/lib/fresco/admin";
import { cellCount } from "@/lib/fresco/grid";
import { prisma } from "../db";

// Lectures de /admin/fresques : tout, brouillons et images comprises (l'admin seul y accède).

export type FrescoAdminRow = {
  id: string;
  name: string;
  status: FrescoStatus;
  publishedAt: Date | null;
  imageUrl: string | null;
  pieces: number;
  cells: number;
  owners: number;
  completions: number;
};

export async function listFrescoesAdmin(locale: string): Promise<FrescoAdminRow[]> {
  const [rows, owners, completions] = await Promise.all([
    prisma.fresco.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, name: true, status: true, publishedAt: true, imageUrl: true, cols: true, rows: true, _count: { select: { pieces: true } } },
    }),
    prisma.$queryRaw<{ frescoId: string; owners: bigint }[]>`
      SELECT "frescoId", COUNT(DISTINCT "userId") AS owners FROM "UserFrescoPiece" GROUP BY "frescoId"`,
    prisma.frescoReward.groupBy({ by: ["frescoId"], where: { kind: "COMPLETE" }, _count: { _all: true } }),
  ]);
  const ownersOf = new Map(owners.map((o) => [o.frescoId, Number(o.owners)]));
  const completionsOf = new Map(completions.map((c) => [c.frescoId, c._count._all]));
  return rows.map((r) => ({
    id: r.id,
    name: localize(parseLocalized(r.name), locale) || "—",
    status: r.status,
    publishedAt: r.publishedAt,
    imageUrl: r.imageUrl,
    pieces: r._count.pieces,
    cells: cellCount(r),
    owners: ownersOf.get(r.id) ?? 0,
    completions: completionsOf.get(r.id) ?? 0,
  }));
}

export type FrescoAdminDetail = {
  id: string;
  status: FrescoStatus;
  publishedAt: Date | null;
  cols: number;
  rows: number;
  imageUrl: string | null;
  teaserUrl: string | null;
  width: number | null;
  height: number | null;
  pieces: { position: number; imageUrl: string }[];
  input: FrescoInput;
  owners: number;
};

export async function getFrescoAdmin(id: string): Promise<FrescoAdminDetail | null> {
  const row = await prisma.fresco.findUnique({
    where: { id },
    include: { pieces: { orderBy: { position: "asc" }, select: { position: true, imageUrl: true } } },
  });
  if (!row) return null;
  const owners = await prisma.userFrescoPiece.findMany({ where: { frescoId: id }, distinct: ["userId"], select: { userId: true } });
  const name = parseLocalized(row.name);
  return {
    id: row.id,
    status: row.status,
    publishedAt: row.publishedAt,
    cols: row.cols,
    rows: row.rows,
    imageUrl: row.imageUrl,
    teaserUrl: row.teaserUrl,
    width: row.width,
    height: row.height,
    pieces: row.pieces,
    owners: owners.length,
    input: {
      name: { fr: name.fr, en: name.en },
      universeId: row.universeId,
      spoiler: row.spoiler,
      boosterTypeIds: row.boosterTypeIds,
      dropWeight: row.dropWeight,
      lots: { piece: row.pieceLotId, row: row.rowLotId, column: row.columnLotId, complete: row.completeLotId },
    },
  };
}

/** Choix de l'éditeur : univers, types de booster (hors sachets scellés et garantis), lots. */
export async function frescoEditorOptions(locale: string) {
  const [universes, boosters, lots] = await Promise.all([
    prisma.universe.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.boosterType.findMany({
      where: { kind: { notIn: ["DROP", "GUARANTEED"] } },
      orderBy: [{ family: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, slug: true, active: true },
    }),
    prisma.lot.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, active: true } }),
  ]);
  return {
    universes,
    boosters: boosters.map((b) => ({ id: b.id, name: localize(parseLocalized(b.name, b.slug), locale), active: b.active })),
    lots: lots.map((l) => ({ id: l.id, name: localize(parseLocalized(l.name), locale), active: l.active })),
  };
}
export type FrescoEditorOptions = Awaited<ReturnType<typeof frescoEditorOptions>>;

/** Fresques découpées (brouillons compris) pour le banc de test de l'ouverture : admin seulement. */
export async function testBenchFrescoes(locale: string): Promise<OpeningTestFresco[]> {
  const rows = await prisma.fresco.findMany({
    where: { imageUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, cols: true, rows: true, imageUrl: true, pieces: { orderBy: { position: "asc" }, select: { position: true, imageUrl: true } } },
  });
  return rows
    .filter((r) => r.pieces.length === cellCount(r))
    .map((r) => ({ id: r.id, name: localize(parseLocalized(r.name), locale) || "—", cols: r.cols, rows: r.rows, imageUrl: r.imageUrl!, pieces: r.pieces }));
}
