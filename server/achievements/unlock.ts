// Déblocage direct d'un succès, au moment où l'événement arrive (succès « event » sans historique à relire) :
// liste de souhaits exaucée, Mythique recyclée. Idempotent ; peut tourner dans la transaction de l'appelant.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const EVENT_ACHIEVEMENTS = { wishGranted: "wish-granted", mythicRecycled: "sacrilege" } as const;

export async function unlockAchievementWith(db: Db, userId: string, key: string): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "UserAchievement" ("userId", "key") VALUES (${userId}, ${key})
    ON CONFLICT ("userId", "key") DO NOTHING`;
}
