"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { isFrozen } from "@/lib/account/deletion";
import { AmbassadorPackError, claimAmbassadorPackWith } from "../ambassador/pack-core";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { getSetting } from "../settings";
import { getCurrentUser } from "../user";

// Pack hebdomadaire des ambassadeurs. Ordre : session → Zod (aucune donnée attendue) → joueur actif →
// rate limit ; rôle, semaine, nombre et type de boosters sont décidés et revérifiés sous verrou.

export type AmbassadorPackResult =
  | { ok: true; count: number; boosterSlug: string }
  | { ok: false; error: "NO_SESSION" | "INVALID" | "UNAVAILABLE" | "RATE_LIMITED" | "NOT_AMBASSADOR" | "ALREADY_CLAIMED" };

const claimSchema = z.object({}).strict();

export async function claimAmbassadorPackAction(input: unknown = {}): Promise<AmbassadorPackResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (!claimSchema.safeParse(input).success) return { ok: false, error: "INVALID" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  if (!(await rateLimit(`ambassador-pack:${user.id}`, { limit: 10, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const [weeklyBoosters, boosterSlug, timeZone] = await Promise.all([
      getSetting("ambassador.weeklyBoosters"),
      getSetting("ambassador.weeklyBoosterSlug"),
      getSetting("game.timeZone"),
    ]);
    // Propriété : le pack est toujours celui du joueur de la session
    const claimed = await claimAmbassadorPackWith(prisma, { userId: user.id, now: new Date() }, { weeklyBoosters, boosterSlug, timeZone });
    refresh();
    return { ok: true, count: claimed.count, boosterSlug: claimed.boosterSlug };
  } catch (e) {
    if (e instanceof AmbassadorPackError) {
      if (e.code === "NOT_AMBASSADOR" || e.code === "ALREADY_CLAIMED") return { ok: false, error: e.code };
      return { ok: false, error: "UNAVAILABLE" };
    }
    console.error("[ambassadeur] pack impossible", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}
