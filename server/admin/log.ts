// Journal des actions admin (AdminLog) : qui, quoi, sur quoi, avant, après. Toute écriture faite
// depuis /admin passe par ici, dans la même transaction que l'action. Pas de server/db.ts : le
// client (transaction, serveur ou test) est injecté.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type AdminLogEntry = {
  adminId: string;
  /** Verbe en majuscules : SETTING_UPDATE, USER_BAN, LEGAL_PUBLISH… */
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

export async function writeAdminLog(db: Prisma.TransactionClient | PrismaClient, entry: AdminLogEntry) {
  await db.adminLog.create({
    data: {
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      before: entry.before,
      after: entry.after,
    },
  });
}
