import "server-only";
import { packStatus, type PackStatus } from "@/lib/ambassador/pack";
import { localize } from "@/lib/boosters/types";
import { periodWindow } from "@/lib/economy/period";
import { getBoosterTypeEntry } from "../boosters/pools";
import { prisma } from "../db";
import { getSetting } from "../settings";

export type AmbassadorPack = { status: Exclude<PackStatus, "none">; count: number; boosterName: string; nextAt: Date };

/** Pack hebdomadaire d'un ambassadeur pour la semaine en cours ; null s'il n'y en a pas pour lui. */
export async function getAmbassadorPack(user: { id: string; ambassadorSince: Date | null }, locale: string, now = new Date()): Promise<AmbassadorPack | null> {
  if (!user.ambassadorSince) return null;
  const [weeklyBoosters, slug, timeZone] = await Promise.all([
    getSetting("ambassador.weeklyBoosters"),
    getSetting("ambassador.weeklyBoosterSlug"),
    getSetting("game.timeZone"),
  ]);
  const week = periodWindow("WEEKLY", now, timeZone);
  const [claim, entry] = await Promise.all([
    prisma.ambassadorPackClaim.findUnique({ where: { userId_periodKey: { userId: user.id, periodKey: week.key } }, select: { periodKey: true } }),
    getBoosterTypeEntry(slug),
  ]);
  const status = packStatus({ ambassador: true, weeklyBoosters, claimedKey: claim?.periodKey ?? null }, week.key);
  if (status === "none" || !entry) return null;
  return { status, count: weeklyBoosters, boosterName: localize(entry.type.name, locale), nextAt: week.end };
}
