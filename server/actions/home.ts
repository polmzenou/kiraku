"use server";

import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { isFrozen } from "@/lib/account/deletion";
import { getCurrentUser, requireActiveUser } from "../user";
import { clientIp, rateLimit } from "../ratelimit";
import { getRecentPulls, purgeOldPulls, type RecentPull } from "../home/pulls";
import { ownedCardIds } from "../collection/owned";
import { pullLikes } from "../home/pull-likes";

const pullsInput = z.object({}).strict();

/**
 * Rafraîchissement du carrousel « Gros tirages » (lecture publique). La session est lue pour
 * limiter par joueur quand il y en a un, sinon par IP.
 */
export async function recentPullsAction(input: unknown): Promise<{ ok: true; pulls: RecentPull[]; owned: string[] } | { ok: false; error: "INVALID" | "RATE_LIMITED" | "DISABLED" }> {
  const user = await getCurrentUser();
  if (!pullsInput.safeParse(input).success) return { ok: false, error: "INVALID" };
  const who = user?.id ?? (await clientIp());
  if (!(await rateLimit(`pull-feed:${who}`, { limit: 12, windowSeconds: 60 }, { store: "memory" })).success) return { ok: false, error: "RATE_LIMITED" };
  const viewerId = user && !user.bannedAt && !isFrozen(user) ? user.id : null;
  const pulls = await getRecentPulls(await getLocale(), viewerId);
  if (!pulls) return { ok: false, error: "DISABLED" };
  // Une fois par heure au plus et par instance, quel que soit le visiteur (compteur en mémoire)
  if ((await rateLimit("pull-feed:purge", { limit: 1, windowSeconds: 3600 }, { store: "memory" })).success) after(() => purgeOldPulls());
  return { ok: true, pulls, owned: await ownedCardIds(user?.id, pulls.map((p) => p.card.cardId)) };
}

const likeInput = z.object({ pullId: z.string().min(1).max(128), liked: z.boolean() }).strict();

export async function setRecentPullLikeAction(input: unknown): Promise<
  | { ok: true; likes: RecentPull["likes"] }
  | { ok: false; error: "UNAUTHENTICATED" | "INVALID" | "RATE_LIMITED" | "NOT_FOUND" | "OWN_PULL" }
> {
  const user = await requireActiveUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };
  const parsed = likeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID" };
  if (!(await rateLimit(`pull-like:${user.id}`, { limit: 60, windowSeconds: 60 }, { store: "memory" })).success) {
    return { ok: false, error: "RATE_LIMITED" };
  }
  // Vérifie le fil autorisé et l'auteur côté serveur, même pour les profils masqués.
  const pulls = await getRecentPulls(await getLocale(), user.id);
  const pull = pulls?.find((p) => p.id === parsed.data.pullId);
  if (!pull) return { ok: false, error: "NOT_FOUND" };
  if (!pull.likes.canLike) return { ok: false, error: "OWN_PULL" };
  return { ok: true, likes: { ...pullLikes.set(pull, user.id, parsed.data.liked), canLike: true } };
}
