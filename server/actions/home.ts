"use server";

import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "../user";
import { clientIp, rateLimit } from "../ratelimit";
import { getRecentPulls, purgeOldPulls, type RecentPull } from "../home/pulls";
import { ownedCardIds } from "../collection/owned";

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
  const pulls = await getRecentPulls(await getLocale());
  if (!pulls) return { ok: false, error: "DISABLED" };
  // Une fois par heure au plus et par instance, quel que soit le visiteur (compteur en mémoire)
  if ((await rateLimit("pull-feed:purge", { limit: 1, windowSeconds: 3600 }, { store: "memory" })).success) after(() => purgeOldPulls());
  return { ok: true, pulls, owned: await ownedCardIds(user?.id, pulls.map((p) => p.card.cardId)) };
}
