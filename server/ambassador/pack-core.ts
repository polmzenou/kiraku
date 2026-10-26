// Réclamation du pack hebdomadaire des ambassadeurs. Une transaction : verrou du joueur, rôle et semaine
// revérifiés, ligne AmbassadorPackClaim (sa clé interdit un second pack la même semaine), puis crédit
// des boosters à ouvrir. Client et réglages injectés pour vérifier ces opérations sans la production.
import type { PrismaClient } from "@/generated/prisma/client";
import { periodWindow } from "@/lib/economy/period";
import { grantBoosters } from "../economy/credits";
import { lockPlayers } from "../social/lock";

export type AmbassadorPackErrorCode = "NO_USER" | "BANNED" | "NOT_AMBASSADOR" | "ALREADY_CLAIMED" | "UNAVAILABLE";

export class AmbassadorPackError extends Error {
  constructor(readonly code: AmbassadorPackErrorCode) {
    super(code);
  }
}

export type AmbassadorPackSettings = { weeklyBoosters: number; boosterSlug: string; timeZone: string };

export async function claimAmbassadorPackWith(
  db: PrismaClient,
  input: { userId: string; now: Date },
  settings: AmbassadorPackSettings,
): Promise<{ periodKey: string; boosterSlug: string; count: number }> {
  return db.$transaction(
    async (tx) => {
      // Verrou du joueur : deux clics simultanés passent l'un après l'autre
      const player = (await lockPlayers(tx, [input.userId])).get(input.userId);
      if (!player) throw new AmbassadorPackError("NO_USER");
      if (player.bannedAt) throw new AmbassadorPackError("BANNED");
      // Rôle relu sous le verrou : un retrait de l'admin juste avant le clic l'emporte
      const user = await tx.user.findUnique({ where: { id: input.userId }, select: { ambassadorSince: true } });
      if (!user?.ambassadorSince) throw new AmbassadorPackError("NOT_AMBASSADOR");

      const week = periodWindow("WEEKLY", input.now, settings.timeZone);
      const already = await tx.ambassadorPackClaim.findUnique({
        where: { userId_periodKey: { userId: input.userId, periodKey: week.key } },
        select: { userId: true },
      });
      if (already) throw new AmbassadorPackError("ALREADY_CLAIMED");

      // Des boosters à ouvrir, jamais un sachet scellé ; un pack coupé (0) ne se réclame pas
      const type = await tx.boosterType.findUnique({ where: { slug: settings.boosterSlug }, select: { id: true, kind: true } });
      if (!type || type.kind === "DROP" || settings.weeklyBoosters < 1) throw new AmbassadorPackError("UNAVAILABLE");

      await tx.ambassadorPackClaim.create({
        data: { userId: input.userId, periodKey: week.key, boosterTypeId: type.id, count: settings.weeklyBoosters, createdAt: input.now },
      });
      await grantBoosters(tx, input.userId, type.id, settings.weeklyBoosters);
      return { periodKey: week.key, boosterSlug: settings.boosterSlug, count: settings.weeklyBoosters };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
