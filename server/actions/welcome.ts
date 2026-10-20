"use server";

import { needsReleaseWelcome, RELEASE_ANNOUNCED_AT } from "@/lib/welcome/release";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { requireActiveUser } from "../user";

const userIdSchema = z.string().min(1).max(128);

/** Réserve l'affichage avant ouverture : un seul onglet/appareil peut l'obtenir, une fois par version présentée. */
export async function claimV1WelcomeAction(displayedUserId: unknown): Promise<boolean> {
  const user = await requireActiveUser();
  if (!user) return false;
  const parsed = userIdSchema.safeParse(displayedUserId);
  if (!parsed.success || user.id !== parsed.data || !needsReleaseWelcome(user.v1WelcomeSeenAt)) return false;
  if (!(await rateLimit(`v1-welcome:${user.id}`, { limit: 5, windowSeconds: 3600 })).success) return false;

  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ v1WelcomeSeenAt: null }, { v1WelcomeSeenAt: { lt: RELEASE_ANNOUNCED_AT } }],
      bannedAt: null,
      deletionRequestedAt: null,
      anonymizedAt: null,
    },
    data: { v1WelcomeSeenAt: new Date() },
  });
  return claimed.count === 1;
}
