// Version du catalogue : fin du dernier import finalisé, ou dernière modification faite dans l'admin.
// Volontairement sans "server-only" ni server/db.ts : le client Prisma est injecté (serveur, scripts).
import type { PrismaClient } from "@/generated/prisma/client";

export async function readCatalogVersion(db: Pick<PrismaClient, "catalogImport" | "gameSetting">): Promise<number> {
  const last = await db.catalogImport.findFirst({
    where: { status: "FINALIZED" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  const revision = await db.gameSetting.findUnique({ where: { key: "catalog.revision" }, select: { value: true } });
  return Math.max(last?.finishedAt?.getTime() ?? 0, Number(revision?.value) || 0);
}
