"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "@/lib/zod";
import { PULL_FEED_BLOCK_DURATIONS, pullFeedBlockUntil } from "@/lib/home/pull-feed-block";
import { USERNAME_REGEX } from "@/lib/username";
import { getAdmin } from "../admin";
import { writeAdminLog } from "../admin/log";
import { prisma } from "../db";
import { PULL_FEED_TAG } from "../home/pulls";
import { rateLimit } from "../ratelimit";

// Blacklist du carrousel des gros tirages (/admin/gros-tirages). Ordre : rôle admin → Zod → rate limit ;
// chaque retrait ou retour écrit User.pullFeedHiddenUntil et une ligne AdminLog dans la même transaction.

export type PullFeedBlockResult = { ok: true } | { ok: false; error: "FORBIDDEN" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" };

const blockSchema = z.object({
  username: z.string().trim().regex(USERNAME_REGEX),
  duration: z.enum(PULL_FEED_BLOCK_DURATIONS),
}).strict();

const unblockSchema = z.object({ userId: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }).strict();

/** Retire un joueur du carrousel (par pseudo) pour une durée, ou définitivement. */
export async function blockPullFeedAction(input: unknown): Promise<PullFeedBlockResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-pull-feed:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  const now = new Date();
  const until = pullFeedBlockUntil(parsed.data.duration, now);
  const done = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { username: { equals: parsed.data.username, mode: "insensitive" } },
      select: { id: true, pullFeedHiddenUntil: true },
    });
    if (!user) return false;
    await tx.user.update({ where: { id: user.id }, data: { pullFeedHiddenUntil: until }, select: { id: true } });
    await writeAdminLog(tx, {
      adminId: admin.id,
      action: "PULL_FEED_BLOCK",
      targetType: "User",
      targetId: user.id,
      before: { until: user.pullFeedHiddenUntil?.toISOString() ?? null },
      after: { until: until.toISOString(), duration: parsed.data.duration },
    });
    return true;
  });
  if (!done) return { ok: false, error: "NOT_FOUND" };
  updateTag(PULL_FEED_TAG);
  refresh();
  return { ok: true };
}

/** Rend un joueur au carrousel. */
export async function unblockPullFeedAction(input: unknown): Promise<PullFeedBlockResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "FORBIDDEN" };
  const parsed = unblockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`admin-pull-feed:${admin.id}`, { limit: 30, windowSeconds: 60 })).success) return { ok: false, error: "RATE_LIMITED" };

  const done = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, pullFeedHiddenUntil: true } });
    if (!user) return false;
    await tx.user.update({ where: { id: user.id }, data: { pullFeedHiddenUntil: null }, select: { id: true } });
    await writeAdminLog(tx, {
      adminId: admin.id,
      action: "PULL_FEED_UNBLOCK",
      targetType: "User",
      targetId: user.id,
      before: { until: user.pullFeedHiddenUntil?.toISOString() ?? null },
      after: { until: null },
    });
    return true;
  });
  if (!done) return { ok: false, error: "NOT_FOUND" };
  updateTag(PULL_FEED_TAG);
  refresh();
  return { ok: true };
}
