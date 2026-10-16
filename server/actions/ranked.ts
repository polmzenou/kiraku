"use server";

import { refresh } from "next/cache";
import { z } from "@/lib/zod";
import { isFrozen } from "@/lib/account/deletion";
import { LotError } from "../economy/lots";
import { lotDeps } from "../economy/deps";
import { prisma } from "../db";
import { claimSeasonRewardWith, RankedError, type RankedErrorCode } from "../ranked/ranked-core";
import { rateLimit } from "../ratelimit";
import { getCurrentUser } from "../user";

// Classé : réclamer la récompense de fin de saison. Session → Zod → rate limit, puis la réclamation
// conditionnelle (claimedAt) garantit un seul lot par saison et par joueur.

export type RankedActionError = Exclude<RankedErrorCode, "NO_USER"> | "NO_SESSION" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "GUEST";

const claimSchema = z.object({ seasonId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }).strict();

export async function claimSeasonRewardAction(input: unknown): Promise<{ ok: true; zeni: number; boosters: number; cards: number } | { ok: false; error: RankedActionError }> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "NO_SESSION" };
  if (user.bannedAt || isFrozen(user)) return { ok: false, error: "UNAVAILABLE" };
  if (user.isGuest) return { ok: false, error: "GUEST" };
  if (!(await rateLimit(`ranked-claim:${user.id}`, { limit: 6, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  try {
    const grant = await claimSeasonRewardWith(prisma, { userId: user.id, seasonId: parsed.data.seasonId, now: new Date() }, lotDeps());
    refresh();
    return { ok: true, zeni: grant.zeni, boosters: grant.boosters.reduce((n, b) => n + b.count, 0), cards: grant.cards.length };
  } catch (e) {
    if (e instanceof RankedError) return { ok: false, error: e.code === "NO_USER" ? "UNAVAILABLE" : e.code };
    if (e instanceof LotError) return { ok: false, error: "NO_REWARD" };
    console.error("[classé] récompense", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}
