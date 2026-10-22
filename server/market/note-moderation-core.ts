// Effacement d'un commentaire public (annonce d'échange ou vente) par la modération. Rôle revérifié
// dans la transaction, texte effacé gardé dans l'AdminLog. Client injecté : pas de server/db.ts ici.
import type { PrismaClient } from "@/generated/prisma/client";
import { writeAdminLog } from "../admin/log";

export const NOTE_KINDS = ["LISTING", "AUCTION"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export class NoteModerationError extends Error {
  constructor(readonly code: "FORBIDDEN" | "NOT_FOUND") {
    super(code);
  }
}

/** Efface la note ; renvoie false si elle l'était déjà. */
export async function clearNoteWith(db: PrismaClient, input: { adminId: string; kind: NoteKind; id: string }): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({ where: { id: input.adminId }, select: { role: true, bannedAt: true } });
    if (!admin || admin.role !== "ADMIN" || admin.bannedAt) throw new NoteModerationError("FORBIDDEN");
    const row =
      input.kind === "LISTING"
        ? await tx.tradeListing.findUnique({ where: { id: input.id }, select: { note: true, ownerId: true } }).then((l) => l && { note: l.note, authorId: l.ownerId })
        : await tx.auction.findUnique({ where: { id: input.id }, select: { note: true, sellerId: true } }).then((a) => a && { note: a.note, authorId: a.sellerId });
    if (!row) throw new NoteModerationError("NOT_FOUND");
    if (row.note === null) return false;
    // Conditionnel : deux admins qui effacent en même temps n'écrivent qu'une ligne de journal
    const cleared =
      input.kind === "LISTING"
        ? await tx.tradeListing.updateMany({ where: { id: input.id, note: { not: null } }, data: { note: null } })
        : await tx.auction.updateMany({ where: { id: input.id, note: { not: null } }, data: { note: null } });
    if (cleared.count === 0) return false;
    await writeAdminLog(tx, {
      adminId: input.adminId,
      action: "MARKET_NOTE_CLEAR",
      targetType: input.kind === "LISTING" ? "TradeListing" : "Auction",
      targetId: input.id,
      before: { note: row.note, authorId: row.authorId },
      after: { note: null },
    });
    return true;
  });
}
