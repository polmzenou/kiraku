"use server";

import { DISCORD_POLL, pollAnswerSchema, type PollResult } from "@/lib/welcome/poll";
import { ANNOUNCEMENTS, pendingAnnouncement } from "@/lib/welcome/release";
import { z } from "@/lib/zod";
import { prisma } from "../db";
import { rateLimit } from "../ratelimit";
import { requireActiveUser } from "../user";

const userIdSchema = z.string().min(1).max(128);
const keySchema = z.enum(ANNOUNCEMENTS.map((announcement) => announcement.key));

/**
 * Réserve l'affichage d'une annonce avant ouverture : un seul onglet/appareil peut l'obtenir, une fois
 * par annonce, et seulement celle qui est en attente (les suivantes passent aux prochaines visites).
 */
export async function claimAnnouncementAction(displayedUserId: unknown, key: unknown): Promise<boolean> {
  const user = await requireActiveUser();
  if (!user) return false;
  const parsedUser = userIdSchema.safeParse(displayedUserId);
  const parsedKey = keySchema.safeParse(key);
  if (!parsedUser.success || !parsedKey.success || user.id !== parsedUser.data) return false;
  const pending = pendingAnnouncement(user.v1WelcomeSeenAt);
  if (pending?.key !== parsedKey.data) return false;
  if (!(await rateLimit(`v1-welcome:${user.id}`, { limit: 5, windowSeconds: 3600 })).success) return false;

  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ v1WelcomeSeenAt: null }, { v1WelcomeSeenAt: { lt: pending.at } }],
      bannedAt: null,
      deletionRequestedAt: null,
      anonymizedAt: null,
    },
    // La date de l'annonce, pas l'heure d'affichage : une annonce plus récente reste à présenter.
    data: { v1WelcomeSeenAt: pending.at },
  });
  return claimed.count === 1;
}

/**
 * Réponse au sondage Discord (annonce v2.5 et carrousel Nouveautés, invités compris). Une seule par
 * joueur et définitive : un second vote ne change rien et renvoie la réponse déjà donnée. null = refusé.
 */
export async function voteDiscordPollAction(answer: unknown): Promise<PollResult | null> {
  const user = await requireActiveUser();
  if (!user) return null;
  const parsed = pollAnswerSchema.safeParse(answer);
  if (!parsed.success) return null;
  if (!(await rateLimit(`poll:${user.id}`, { limit: 10, windowSeconds: 3600 })).success) return null;

  // ON CONFLICT DO NOTHING : deux onglets qui votent en même temps n'enregistrent que la première réponse
  const { count } = await prisma.pollVote.createMany({
    data: [{ userId: user.id, poll: DISCORD_POLL, answer: parsed.data }],
    skipDuplicates: true,
  });
  if (count === 1) return { vote: parsed.data, already: false };
  const previous = await prisma.pollVote.findUnique({
    where: { userId_poll: { userId: user.id, poll: DISCORD_POLL } },
    select: { answer: true },
  });
  return previous ? { vote: previous.answer, already: true } : null;
}
