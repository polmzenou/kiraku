// Écritures de l'admin sur les fresques. Le client Prisma est injecté (serveur ou test) ; chaque écriture
// laisse sa ligne AdminLog dans la même transaction. Une fresque publiée ne change plus d'image : ses
// détenteurs garderaient des fragments d'une autre image.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { canMoveTo, type FrescoInput, type FrescoStatus } from "@/lib/fresco/admin";
import { cellCount, DEFAULT_GRID } from "@/lib/fresco/grid";
import { writeAdminLog } from "../admin/log";

type Db = PrismaClient | Prisma.TransactionClient;

export type FrescoAdminErrorCode = "NOT_FOUND" | "NOT_DRAFT" | "INCOMPLETE" | "BAD_REF" | "BAD_STATUS" | "HAS_OWNERS";

export class FrescoAdminError extends Error {
  constructor(readonly code: FrescoAdminErrorCode) {
    super(code);
  }
}

/** Images découpées d'une fresque : l'image entière, l'aperçu flou et un fragment par position. */
export type FrescoImages = { imageUrl: string; teaserUrl: string; width: number; height: number; pieces: { position: number; imageUrl: string }[] };

/** Nouvelle fresque en brouillon, invisible des joueurs. */
export async function createFrescoWith(db: PrismaClient, adminId: string, name: string): Promise<string> {
  return db.$transaction(async (tx) => {
    const created = await tx.fresco.create({
      // Forme de localizedSchema (lib/boosters/types.ts) : l'anglais vide se replie sur le français
      data: { name: { fr: name, en: "" }, cols: DEFAULT_GRID.cols, rows: DEFAULT_GRID.rows },
      select: { id: true },
    });
    await writeAdminLog(tx, { adminId, action: "FRESCO_CREATE", targetType: "Fresco", targetId: created.id, after: { name } });
    return created.id;
  });
}

/** Univers, types de booster et lots cités : ils doivent exister. */
async function refsExist(db: Db, input: FrescoInput): Promise<boolean> {
  const lots = [...new Set(Object.values(input.lots).filter((v): v is string => v !== null))];
  const [universe, boosters, lotCount] = await Promise.all([
    input.universeId ? db.universe.count({ where: { id: input.universeId } }) : 1,
    input.boosterTypeIds.length ? db.boosterType.count({ where: { id: { in: input.boosterTypeIds } } }) : 0,
    lots.length ? db.lot.count({ where: { id: { in: lots } } }) : 0,
  ]);
  return universe === 1 && boosters === new Set(input.boosterTypeIds).size && lotCount === lots.length;
}

/** Réglages d'une fresque (nom, spoiler, chute, lots), à tout moment : ils ne touchent pas à ses images. */
export async function saveFrescoWith(db: PrismaClient, adminId: string, id: string, input: FrescoInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.fresco.findUnique({
      where: { id },
      select: { name: true, universeId: true, spoiler: true, boosterTypeIds: true, dropWeight: true, pieceLotId: true, rowLotId: true, columnLotId: true, completeLotId: true },
    });
    if (!before) throw new FrescoAdminError("NOT_FOUND");
    if (!(await refsExist(tx, input))) throw new FrescoAdminError("BAD_REF");
    const data = {
      name: { fr: input.name.fr, en: input.name.en ?? "" },
      universeId: input.universeId,
      spoiler: input.spoiler,
      boosterTypeIds: [...new Set(input.boosterTypeIds)],
      dropWeight: input.dropWeight,
      pieceLotId: input.lots.piece,
      rowLotId: input.lots.row,
      columnLotId: input.lots.column,
      completeLotId: input.lots.complete,
    };
    await tx.fresco.update({ where: { id }, data, select: { id: true } });
    await writeAdminLog(tx, { adminId, action: "FRESCO_UPDATE", targetType: "Fresco", targetId: id, before: before as Prisma.InputJsonValue, after: data as Prisma.InputJsonValue });
  });
}

/**
 * Remplace les images d'un brouillon (découpe faite par la route d'envoi). Renvoie les URL remplacées, à
 * supprimer du stockage une fois la transaction validée.
 */
export async function replaceFrescoImagesWith(db: PrismaClient, adminId: string, id: string, images: FrescoImages): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: FrescoStatus; cols: number; rows: number; imageUrl: string | null; teaserUrl: string | null }[]>`
      SELECT "status", "cols", "rows", "imageUrl", "teaserUrl" FROM "Fresco" WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new FrescoAdminError("NOT_FOUND");
    if (row.status !== "DRAFT") throw new FrescoAdminError("NOT_DRAFT");
    if (images.pieces.length !== cellCount(row) || images.pieces.some((p) => p.position < 0 || p.position >= cellCount(row))) {
      throw new FrescoAdminError("INCOMPLETE");
    }
    const old = await tx.frescoPiece.findMany({ where: { frescoId: id }, select: { imageUrl: true } });
    for (const piece of images.pieces) {
      await tx.frescoPiece.upsert({
        where: { frescoId_position: { frescoId: id, position: piece.position } },
        create: { frescoId: id, position: piece.position, imageUrl: piece.imageUrl },
        update: { imageUrl: piece.imageUrl },
        select: { id: true },
      });
    }
    await tx.fresco.update({
      where: { id },
      data: { imageUrl: images.imageUrl, teaserUrl: images.teaserUrl, width: images.width, height: images.height },
      select: { id: true },
    });
    await writeAdminLog(tx, {
      adminId,
      action: "FRESCO_IMAGE_UPLOAD",
      targetType: "Fresco",
      targetId: id,
      before: { imageUrl: row.imageUrl },
      after: { imageUrl: images.imageUrl, width: images.width, height: images.height },
    });
    return [row.imageUrl, row.teaserUrl, ...old.map((p) => p.imageUrl)].filter((u): u is string => u !== null);
  });
}

/**
 * Publier (il faut un nom et tous les fragments) ou archiver. La première publication date la fresque
 * (onglet « Nouvelles fresques ») ; une archive republiée garde sa date.
 */
export async function setFrescoStatusWith(db: PrismaClient, adminId: string, id: string, to: FrescoStatus, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const fresco = await tx.fresco.findUnique({
      where: { id },
      select: { status: true, name: true, cols: true, rows: true, imageUrl: true, publishedAt: true, _count: { select: { pieces: true } } },
    });
    if (!fresco) throw new FrescoAdminError("NOT_FOUND");
    if (!canMoveTo(fresco.status, to)) throw new FrescoAdminError("BAD_STATUS");
    const name = fresco.name as { fr?: unknown };
    if (to === "PUBLISHED" && (!fresco.imageUrl || fresco._count.pieces !== cellCount(fresco) || typeof name.fr !== "string" || !name.fr.trim())) {
      throw new FrescoAdminError("INCOMPLETE");
    }
    await tx.fresco.update({
      where: { id },
      data: { status: to, ...(to === "PUBLISHED" && !fresco.publishedAt ? { publishedAt: now } : {}) },
      select: { id: true },
    });
    await writeAdminLog(tx, { adminId, action: to === "PUBLISHED" ? "FRESCO_PUBLISH" : "FRESCO_ARCHIVE", targetType: "Fresco", targetId: id, before: { status: fresco.status }, after: { status: to } });
  });
}

/** Supprime un brouillon jamais distribué. Renvoie ses images, à retirer du stockage. */
export async function deleteFrescoWith(db: PrismaClient, adminId: string, id: string): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const fresco = await tx.fresco.findUnique({
      where: { id },
      select: { status: true, name: true, imageUrl: true, teaserUrl: true, pieces: { select: { imageUrl: true } }, _count: { select: { owners: true, rewards: true } } },
    });
    if (!fresco) throw new FrescoAdminError("NOT_FOUND");
    if (fresco.status !== "DRAFT") throw new FrescoAdminError("NOT_DRAFT");
    if (fresco._count.owners > 0 || fresco._count.rewards > 0) throw new FrescoAdminError("HAS_OWNERS");
    await tx.fresco.delete({ where: { id }, select: { id: true } });
    await writeAdminLog(tx, { adminId, action: "FRESCO_DELETE", targetType: "Fresco", targetId: id, before: { name: fresco.name as Prisma.InputJsonValue } });
    return [fresco.imageUrl, fresco.teaserUrl, ...fresco.pieces.map((p) => p.imageUrl)].filter((u): u is string => u !== null);
  });
}
