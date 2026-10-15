"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAdmin } from "../admin";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { rollSeasonWith } from "../ranked/ranked-core";
import { getRankedRules, RANKED_TAG } from "../ranked/queries";
import { getSetting } from "../settings";

// Clôture anticipée de la saison depuis /admin/classe. Rôle admin revérifié, numéro de saison
// confirmé (on ne clôt jamais une autre saison que celle affichée), trace dans AdminLog.

const schema = z.object({ number: z.number().int().min(1).max(100_000) }).strict();

export async function closeSeasonAction(
  input: unknown,
): Promise<{ ok: true; number: number; results: number } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "STALE" | "UNAVAILABLE" }> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin:${admin.id}`, { limit: 20, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };
  const open = await prisma.season.findFirst({ where: { closedAt: null }, orderBy: { number: "desc" }, select: { number: true } });
  if (open?.number !== parsed.data.number) return { ok: false, error: "STALE" };
  try {
    const [rules, timeZone] = await Promise.all([getRankedRules(), getSetting("game.timeZone")]);
    const res = await rollSeasonWith(prisma, new Date(), rules, timeZone, { force: true });
    if (!res.closed) return { ok: false, error: "STALE" };
    await prisma.adminLog.create({
      data: {
        adminId: admin.id,
        action: "SEASON_CLOSE",
        targetType: "Season",
        targetId: res.closed.id,
        after: { number: res.closed.number, results: res.results } as Prisma.InputJsonValue,
      },
    });
    updateTag(RANKED_TAG);
    return { ok: true, number: res.closed.number, results: res.results };
  } catch (e) {
    console.error("[classé] clôture admin", e);
    return { ok: false, error: "UNAVAILABLE" };
  }
}
