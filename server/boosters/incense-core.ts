// Activation d'un Encens. Le client Prisma est injecté (serveur ou test de concurrence) : pas de
// server/db.ts ici. Les Encens disponibles sont recalculés sous le verrou du joueur.
import type { PrismaClient } from "@/generated/prisma/client";
import { extendIncense, incenseAvailable, type IncenseSettings } from "@/lib/boosters/incense";
import type { Tx } from "../social/lock";

export type IncenseErrorCode = "NO_USER" | "BANNED" | "NO_INCENSE";

export class IncenseError extends Error {
  constructor(readonly code: IncenseErrorCode) {
    super(code);
  }
}

/** Cartes tirées en boosters depuis le début, doublons compris (ne baisse ni à la vente ni au recyclage). */
export async function cardsPulled(db: PrismaClient | Tx, userId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT COALESCE(SUM(cardinality("catalogCardIds")), 0)::int AS n
    FROM "BoosterOpening" WHERE "userId" = ${userId}`;
  return row?.n ?? 0;
}

export type IncenseActivation = { until: Date; available: number };

/** Consomme un Encens et lance (ou prolonge) le boost ; deux clics simultanés n'en consomment pas deux. */
export async function activateIncenseWith(
  db: PrismaClient,
  userId: string,
  settings: Pick<IncenseSettings, "cardStep" | "durationHours">,
  now = new Date(),
): Promise<IncenseActivation> {
  return db.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<{ incenseUsed: number; incenseUntil: Date | null; bannedAt: Date | null }[]>`
      SELECT "incenseUsed", "incenseUntil", "bannedAt" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new IncenseError("NO_USER");
    if (user.bannedAt) throw new IncenseError("BANNED");

    const available = incenseAvailable(await cardsPulled(tx, userId), settings.cardStep, user.incenseUsed);
    if (available < 1) throw new IncenseError("NO_INCENSE");

    const until = extendIncense(user.incenseUntil, now, settings.durationHours);
    await tx.user.update({
      where: { id: userId },
      data: { incenseUsed: user.incenseUsed + 1, incenseUntil: until },
      select: { id: true },
    });
    return { until, available: available - 1 };
  });
}
